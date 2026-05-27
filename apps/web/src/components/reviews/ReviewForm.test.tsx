/**
 * ReviewForm component tests (M6.3a).
 *
 * Why Vitest + RTL instead of Playwright for this surface:
 *   - The submit happy-path's domain logic (rating derivation, payload v2
 *     hash, sentiment fan-out) is already exhaustively covered by
 *     SubmitReviewUseCase.test.tsx in M6.1.
 *   - The only React-level wiring left to cover is "the form correctly
 *     stitches SentimentPicker + auth hook + submitReview client into
 *     the right state machine". RTL + jsdom is the right layer for that.
 *   - Playwright would force us to fake the entire Privy OAuth flow
 *     (250-line fixture, brittle to SDK upgrades). M6.3b covers the
 *     read-path with a real browser; the write-path stays here.
 *
 * Mock strategy:
 *   - `usePrivy` is mocked module-level so we control `authenticated`
 *     per test without touching production code.
 *   - `useLoginRedirect` is mocked module-level so we can assert the
 *     unauth-gate CTA invokes the `/auth` route helper (Phase 2 UI S2
 *     replaced direct `usePrivy().login()` modal calls with a full-page
 *     auth route).
 *   - `useOpenTradeAuth` is mocked module-level too — its only job is
 *     to hand back an OpenTrade JWT, which we hardcode to a fixture.
 *   - `submitReview` is mocked module-level so we observe the exact
 *     payload the form posts (covers ADR-0028 D7 "sentiment is the
 *     canonical field" wire contract) and can simulate API errors.
 *
 * NextIntl wrapping: the form pulls labels via `useTranslations`, so
 * tests render under `NextIntlClientProvider` with the real en.json
 * messages slice. Keeps assertions readable (we match on the visible
 * strings designers see), and surfaces any future i18n key drift the
 * same way the user would notice it.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import enMessages from '../../../messages/en.json';
import { ApiClientError } from '../../lib/api/client';

import { ReviewForm } from './ReviewForm';

import type * as ApiClientModule from '../../lib/api/client';

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: vi.fn(),
}));

vi.mock('../../hooks/useOpenTradeAuth', () => ({
  useOpenTradeAuth: vi.fn(),
}));

vi.mock('../../hooks/useLoginRedirect', () => ({
  useLoginRedirect: vi.fn(),
}));

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api/client');
  return {
    ...actual,
    submitReview: vi.fn(),
  };
});

const { usePrivy } = await import('@privy-io/react-auth');
const { useOpenTradeAuth } = await import('../../hooks/useOpenTradeAuth');
const { useLoginRedirect } = await import('../../hooks/useLoginRedirect');
const apiClient = await import('../../lib/api/client');
const submitReviewMock = apiClient.submitReview as unknown as Mock;
const usePrivyMock = usePrivy as unknown as Mock;
const useAuthMock = useOpenTradeAuth as unknown as Mock;
const useLoginRedirectMock = useLoginRedirect as unknown as Mock;

const BROKER = { brokerId: 'broker-uuid-1', brokerName: 'Test Securities' };

/**
 * Wraps the form in NextIntlClientProvider with the real en.json
 * `reviewForm` namespace, plus a stub for the namespaces the
 * SentimentPicker labels reference. Returns the same `screen` API as
 * `render` for ergonomic assertions.
 */
const renderForm = (locale: 'en' | 'zh-Hant' = 'en') => {
  const messages = locale === 'en' ? enMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Hong_Kong">
      <ReviewForm {...BROKER} />
    </NextIntlClientProvider>,
  );
};

const stubAuthenticated = (overrides?: { getAccessToken?: () => Promise<string | null> }): void => {
  usePrivyMock.mockReturnValue({ authenticated: true });
  useLoginRedirectMock.mockReturnValue(vi.fn());
  useAuthMock.mockReturnValue({
    getAccessToken: overrides?.getAccessToken ?? vi.fn().mockResolvedValue('opentrade-jwt'),
    isExchanging: false,
    userId: 'user-1',
  });
};

afterEach(() => {
  vi.resetAllMocks();
});

describe('ReviewForm — unauthenticated state', () => {
  it('shows the login CTA and hides the form when Privy reports unauthenticated', () => {
    usePrivyMock.mockReturnValue({ authenticated: false });
    useLoginRedirectMock.mockReturnValue(vi.fn());
    useAuthMock.mockReturnValue({
      getAccessToken: vi.fn(),
      isExchanging: false,
      userId: null,
    });
    renderForm();
    expect(screen.getByText('Please log in to write a review.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('invokes the /auth route helper when the CTA is clicked', async () => {
    const goLogin = vi.fn();
    usePrivyMock.mockReturnValue({ authenticated: false });
    useLoginRedirectMock.mockReturnValue(goLogin);
    useAuthMock.mockReturnValue({
      getAccessToken: vi.fn(),
      isExchanging: false,
      userId: null,
    });
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(goLogin).toHaveBeenCalledOnce();
  });
});

describe('ReviewForm — submit gating', () => {
  it('disables the submit button until a sentiment is picked', async () => {
    stubAuthenticated();
    renderForm();
    const submit = screen.getByRole('button', { name: 'Submit review' });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: 'Positive' }));
    expect(submit).toBeEnabled();
  });

  it('does not call submitReview when title is empty (HTML required catches it)', async () => {
    stubAuthenticated();
    renderForm();
    await userEvent.click(screen.getByRole('radio', { name: 'Positive' }));
    await userEvent.type(
      screen.getByPlaceholderText('Describe your experience in detail (at least 10 characters)'),
      'A long enough body that passes the ten-char min',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(submitReviewMock).not.toHaveBeenCalled();
  });

  it('does not call submitReview when body is shorter than 10 characters', async () => {
    stubAuthenticated();
    renderForm();
    await userEvent.click(screen.getByRole('radio', { name: 'Positive' }));
    await userEvent.type(
      screen.getByPlaceholderText('Summarise your experience in one sentence'),
      'Great broker',
    );
    await userEvent.type(
      screen.getByPlaceholderText('Describe your experience in detail (at least 10 characters)'),
      'too short',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(submitReviewMock).not.toHaveBeenCalled();
  });
});

describe('ReviewForm — happy-path submission', () => {
  it.each([
    ['Positive', 'POSITIVE'],
    ['Neutral', 'NEUTRAL'],
    ['Negative', 'NEGATIVE'],
  ] as const)(
    'posts the %s sentiment to submitReview with the trimmed payload',
    async (label, sentimentValue) => {
      stubAuthenticated();
      submitReviewMock.mockResolvedValue({ id: 'review-1', status: 'PENDING' });
      renderForm();

      await userEvent.click(screen.getByRole('radio', { name: label }));
      await userEvent.type(
        screen.getByPlaceholderText('Summarise your experience in one sentence'),
        '  Great broker  ',
      );
      await userEvent.type(
        screen.getByPlaceholderText('Describe your experience in detail (at least 10 characters)'),
        '  This is a long enough body to satisfy the ten-char minimum.  ',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));

      await waitFor(() => {
        expect(submitReviewMock).toHaveBeenCalledOnce();
      });

      expect(submitReviewMock).toHaveBeenCalledWith(
        {
          brokerId: BROKER.brokerId,
          title: 'Great broker',
          body: 'This is a long enough body to satisfy the ten-char minimum.',
          sentiment: sentimentValue,
          sourceLocale: 'en',
        },
        { accessToken: 'opentrade-jwt' },
      );
    },
  );

  it('renders the success card after a successful submit and clears the form', async () => {
    stubAuthenticated();
    submitReviewMock.mockResolvedValue({ id: 'review-1', status: 'PENDING' });
    renderForm();

    await userEvent.click(screen.getByRole('radio', { name: 'Positive' }));
    await userEvent.type(
      screen.getByPlaceholderText('Summarise your experience in one sentence'),
      'Great broker',
    );
    await userEvent.type(
      screen.getByPlaceholderText('Describe your experience in detail (at least 10 characters)'),
      'A long enough body that passes the ten-char min',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(await screen.findByText('Review submitted!')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your review is being anchored on chain. Once confirmed, it cannot be deleted or modified.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});

describe('ReviewForm — error handling', () => {
  it('renders the API error message when submitReview throws ApiClientError', async () => {
    stubAuthenticated();
    submitReviewMock.mockRejectedValue(
      new ApiClientError(429, 'RATE_LIMITED', 'Rate limited — try again in a minute'),
    );
    renderForm();

    await userEvent.click(screen.getByRole('radio', { name: 'Positive' }));
    await userEvent.type(
      screen.getByPlaceholderText('Summarise your experience in one sentence'),
      'Title',
    );
    await userEvent.type(
      screen.getByPlaceholderText('Describe your experience in detail (at least 10 characters)'),
      'A long enough body to satisfy minimum length.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(
      await screen.findByText(/Submission failed.*Rate limited — try again in a minute/),
    ).toBeInTheDocument();
  });

  it('renders a generic error message when submitReview throws a non-Api error', async () => {
    stubAuthenticated();
    submitReviewMock.mockRejectedValue(new Error('network down'));
    renderForm();

    await userEvent.click(screen.getByRole('radio', { name: 'Negative' }));
    await userEvent.type(
      screen.getByPlaceholderText('Summarise your experience in one sentence'),
      'Bad',
    );
    await userEvent.type(
      screen.getByPlaceholderText('Describe your experience in detail (at least 10 characters)'),
      'This broker lost my entire portfolio in one trade.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(
      await screen.findByText(/Submission failed.*An unexpected error occurred/),
    ).toBeInTheDocument();
  });

  it('shows the loginRequired error when getAccessToken returns null', async () => {
    stubAuthenticated({ getAccessToken: vi.fn().mockResolvedValue(null) });
    renderForm();

    await userEvent.click(screen.getByRole('radio', { name: 'Positive' }));
    await userEvent.type(
      screen.getByPlaceholderText('Summarise your experience in one sentence'),
      'Title',
    );
    await userEvent.type(
      screen.getByPlaceholderText('Describe your experience in detail (at least 10 characters)'),
      'A long enough body to satisfy minimum length.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(
      await screen.findByText(/Submission failed.*Please log in to write a review/),
    ).toBeInTheDocument();
    expect(submitReviewMock).not.toHaveBeenCalled();
  });
});
