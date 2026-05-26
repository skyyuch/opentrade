/**
 * ComplaintForm component tests (M7.7).
 *
 * Mirrors `ReviewForm.test.tsx` in shape: Vitest + RTL with module-level
 * mocks for Privy, useOpenTradeAuth, and the three API client wrappers.
 * Coverage is intentionally focused on the React-level wiring the
 * ComplaintForm uniquely owns:
 *
 *   - The viewMode state machine (loading → unauthenticated /
 *     requires-sbt / ready / success).
 *   - The two-stage submit gate (evidence upload must succeed first;
 *     submit button stays disabled until upload completes + body
 *     reaches the 10-char floor + sentiment is picked).
 *   - Client-side MIME / size validation on the evidence file (before
 *     it ever hits Pinata, per ADR-0029 D3's 10MB cap).
 *   - The success / error transitions after submitComplaint resolves.
 *
 * Domain logic (IPFS payload hash, sentiment default, etc.) is covered
 * by SubmitComplaintUseCase.test.ts on the API side — this file is
 * purely the React state-machine glue.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import enMessages from '../../../messages/en.json';
import { ApiClientError } from '../../lib/api/client';

import { ComplaintForm } from './ComplaintForm';

import type * as ApiClientModule from '../../lib/api/client';

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: vi.fn(),
}));

vi.mock('../../hooks/useOpenTradeAuth', () => ({
  useOpenTradeAuth: vi.fn(),
}));

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api/client');
  return {
    ...actual,
    submitComplaint: vi.fn(),
    fetchMyProfile: vi.fn(),
    uploadVerifyEvidence: vi.fn(),
  };
});

// `next-intl/navigation` Link → render as a plain anchor for jsdom so we
// don't need to set up the App Router's routing context. Same trick the
// VerifyForm test uses (kept inline so this file is self-contained).
vi.mock('../../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

const { usePrivy } = await import('@privy-io/react-auth');
const { useOpenTradeAuth } = await import('../../hooks/useOpenTradeAuth');
const apiClient = await import('../../lib/api/client');
const submitComplaintMock = apiClient.submitComplaint as unknown as Mock;
const fetchMyProfileMock = apiClient.fetchMyProfile as unknown as Mock;
const uploadVerifyEvidenceMock = apiClient.uploadVerifyEvidence as unknown as Mock;
const usePrivyMock = usePrivy as unknown as Mock;
const useAuthMock = useOpenTradeAuth as unknown as Mock;

const BROKER = {
  brokerId: 'broker-uuid-1',
  brokerSlug: 'broker-slug-1',
  brokerName: 'Test Securities',
};

const EVIDENCE_CID = 'bafybeievidencefakecidforcomplaintformreacttesting';

const renderForm = () =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Hong_Kong">
      <ComplaintForm {...BROKER} />
    </NextIntlClientProvider>,
  );

const stubLoggedInL2 = (): void => {
  usePrivyMock.mockReturnValue({ authenticated: true, login: vi.fn() });
  useAuthMock.mockReturnValue({
    getAccessToken: vi.fn().mockResolvedValue('opentrade-jwt'),
    isExchanging: false,
    userId: 'user-1',
  });
  fetchMyProfileMock.mockResolvedValue({
    user: {
      id: 'user-1',
      displayName: 'Test User',
      email: null,
      walletAddress: null,
      walletAddressFull: null,
      preferredLocale: 'en',
      role: 'user',
      sbtTier: 'L2',
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  });
};

const stubLoggedInNoSbt = (): void => {
  usePrivyMock.mockReturnValue({ authenticated: true, login: vi.fn() });
  useAuthMock.mockReturnValue({
    getAccessToken: vi.fn().mockResolvedValue('opentrade-jwt'),
    isExchanging: false,
    userId: 'user-1',
  });
  fetchMyProfileMock.mockResolvedValue({
    user: {
      id: 'user-1',
      displayName: 'Test User',
      email: null,
      walletAddress: null,
      walletAddressFull: null,
      preferredLocale: 'en',
      role: 'user',
      sbtTier: 'NONE',
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  });
};

const fakeUploadedFile = (type = 'application/pdf', bytes = 1024, name = 'evidence.pdf'): File =>
  new File([new Uint8Array(bytes)], name, { type });

afterEach(() => {
  vi.resetAllMocks();
});

describe('ComplaintForm — view-mode gating', () => {
  it('renders the unauthenticated gate when Privy reports authenticated=false', async () => {
    usePrivyMock.mockReturnValue({ authenticated: false, login: vi.fn() });
    useAuthMock.mockReturnValue({
      getAccessToken: vi.fn(),
      isExchanging: false,
      userId: null,
    });

    renderForm();

    expect(await screen.findByText('Please log in first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByText('Write your complaint')).not.toBeInTheDocument();
  });

  it('invokes Privy login() when the unauthenticated-gate CTA is clicked', async () => {
    const login = vi.fn();
    usePrivyMock.mockReturnValue({ authenticated: false, login });
    useAuthMock.mockReturnValue({
      getAccessToken: vi.fn(),
      isExchanging: false,
      userId: null,
    });
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(login).toHaveBeenCalledOnce();
  });

  it('renders the SBT-required gate when the profile lacks the L2 tier', async () => {
    stubLoggedInNoSbt();
    renderForm();

    expect(await screen.findByText('L2 verified-reviewer SBT required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start verification/i })).toHaveAttribute(
      'href',
      '/verify',
    );
    expect(screen.queryByText('Write your complaint')).not.toBeInTheDocument();
  });

  it('renders the form heading once the profile resolves with sbtTier=L2', async () => {
    stubLoggedInL2();
    renderForm();

    expect(await screen.findByText('Write your complaint')).toBeInTheDocument();
    // Sentiment picker, body textarea, and submit button are all
    // present — the form is in its ready state.
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit complaint' })).toBeInTheDocument();
  });
});

describe('ComplaintForm — evidence upload validation', () => {
  it('rejects an unsupported file type without calling the API', async () => {
    stubLoggedInL2();
    renderForm();
    // Wait for the form to mount.
    await screen.findByText('Write your complaint');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(fileInput).not.toBeNull();

    // `applyAccept: false` bypasses jsdom's accept-attribute pre-filter
    // (the input has `accept=".pdf,.jpg,..."` so a .txt file would
    // normally be silently dropped before the change handler fires).
    // We want to exercise the component's MIME guard, not the browser's
    // accept gate.
    const badFile = fakeUploadedFile('text/plain', 100, 'note.txt');
    await userEvent.upload(fileInput, badFile, { applyAccept: false });

    expect(await screen.findByText(/Unsupported file format/)).toBeInTheDocument();
    expect(uploadVerifyEvidenceMock).not.toHaveBeenCalled();
  });

  it('rejects a file larger than 10MB without calling the API', async () => {
    stubLoggedInL2();
    renderForm();
    await screen.findByText('Write your complaint');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const bigFile = fakeUploadedFile('application/pdf', 11 * 1024 * 1024, 'evidence.pdf');
    await userEvent.upload(fileInput, bigFile);

    expect(await screen.findByText(/File too large/)).toBeInTheDocument();
    expect(uploadVerifyEvidenceMock).not.toHaveBeenCalled();
  });

  it('uploads a valid file to Pinata and transitions the drop-zone into the uploaded state', async () => {
    stubLoggedInL2();
    uploadVerifyEvidenceMock.mockResolvedValue({ cid: EVIDENCE_CID });
    renderForm();
    await screen.findByText('Write your complaint');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const goodFile = fakeUploadedFile('application/pdf', 2048, 'statement.pdf');
    await userEvent.upload(fileInput, goodFile);

    await waitFor(() => {
      expect(uploadVerifyEvidenceMock).toHaveBeenCalledWith(goodFile, {
        accessToken: 'opentrade-jwt',
      });
    });
    expect(await screen.findByText('statement.pdf')).toBeInTheDocument();
    expect(screen.getByText(/IPFS CID/i)).toBeInTheDocument();
  });
});

describe('ComplaintForm — submit gating', () => {
  it('keeps the submit button disabled until evidence is uploaded and body is long enough', async () => {
    stubLoggedInL2();
    uploadVerifyEvidenceMock.mockResolvedValue({ cid: EVIDENCE_CID });
    renderForm();
    await screen.findByText('Write your complaint');

    const submit = screen.getByRole('button', { name: 'Submit complaint' });
    expect(submit).toBeDisabled();

    // Type body first — still disabled because evidence is missing.
    const body = screen.getByPlaceholderText(/Describe what happened/);
    await userEvent.type(body, 'A long enough body for the ten-char minimum.');
    expect(submit).toBeDisabled();

    // Upload evidence — now the gate is open.
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(fileInput, fakeUploadedFile());

    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
  });
});

describe('ComplaintForm — submit lifecycle', () => {
  it('posts the trimmed payload (with optional title) to submitComplaint and renders success', async () => {
    stubLoggedInL2();
    uploadVerifyEvidenceMock.mockResolvedValue({ cid: EVIDENCE_CID });
    submitComplaintMock.mockResolvedValue({
      complaint: { id: 'cmp_test_0001', createdAt: '2026-05-26T00:00:00.000Z' },
    });
    renderForm();
    await screen.findByText('Write your complaint');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(fileInput, fakeUploadedFile());

    await userEvent.type(
      screen.getByPlaceholderText('One-line summary of the complaint'),
      '  Phantom trades  ',
    );
    await userEvent.type(
      screen.getByPlaceholderText(/Describe what happened/),
      '  Two trades on my July statement were never authorised by me.  ',
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit complaint' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit complaint' }));

    await waitFor(() => {
      expect(submitComplaintMock).toHaveBeenCalledOnce();
    });
    expect(submitComplaintMock).toHaveBeenCalledWith(
      {
        brokerId: BROKER.brokerId,
        title: 'Phantom trades',
        body: 'Two trades on my July statement were never authorised by me.',
        evidenceIpfsCid: EVIDENCE_CID,
        sentiment: 'NEGATIVE',
        sourceLocale: 'en',
      },
      { accessToken: 'opentrade-jwt' },
    );

    expect(await screen.findByText('Complaint submitted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to broker' })).toHaveAttribute(
      'href',
      `/brokers/${BROKER.brokerSlug}`,
    );
  });

  it('omits the title field when the user leaves it empty', async () => {
    stubLoggedInL2();
    uploadVerifyEvidenceMock.mockResolvedValue({ cid: EVIDENCE_CID });
    submitComplaintMock.mockResolvedValue({ complaint: { id: 'cmp_test_0002' } });
    renderForm();
    await screen.findByText('Write your complaint');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(fileInput, fakeUploadedFile());
    await userEvent.type(
      screen.getByPlaceholderText(/Describe what happened/),
      'Body that is just long enough.',
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit complaint' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit complaint' }));

    await waitFor(() => expect(submitComplaintMock).toHaveBeenCalledOnce());
    const [payload] = submitComplaintMock.mock.calls[0]!;
    expect(payload).not.toHaveProperty('title');
  });

  it('renders the localised RATE_LIMIT_EXCEEDED copy when submitComplaint throws', async () => {
    // Per `translateApiError` the server-side `message` is for logs
    // only — the UI never displays it. We assert the localised
    // `errors.code.RATE_LIMIT_EXCEEDED` copy from en.json shows up.
    stubLoggedInL2();
    uploadVerifyEvidenceMock.mockResolvedValue({ cid: EVIDENCE_CID });
    submitComplaintMock.mockRejectedValue(
      new ApiClientError(429, 'RATE_LIMIT_EXCEEDED', 'developer-only message'),
    );
    renderForm();
    await screen.findByText('Write your complaint');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(fileInput, fakeUploadedFile());
    await userEvent.type(
      screen.getByPlaceholderText(/Describe what happened/),
      'A long enough body to satisfy the minimum.',
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit complaint' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit complaint' }));

    expect(await screen.findByText(/You're going a bit too fast/)).toBeInTheDocument();
    // Stays in the form (not success) so the user can retry.
    expect(screen.queryByText('Complaint submitted')).not.toBeInTheDocument();
  });
});
