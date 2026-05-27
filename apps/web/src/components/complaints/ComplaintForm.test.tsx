/**
 * ComplaintForm component tests (M7.7 → S22 wizard adaptation).
 *
 * Mirrors `ReviewForm.test.tsx` in shape: Vitest + RTL with module-level
 * mocks for Privy, useOpenTradeAuth, and the three API client wrappers.
 *
 * S22 redesigned the form into a 3-step wizard:
 *   Step 1 — Guidelines (user clicks "I understand, begin filing")
 *   Step 2 — Form details (sentiment + title + body)
 *   Step 3 — Evidence upload + submit
 *
 * Tests navigate through the wizard steps as needed.
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

vi.mock('../../hooks/useLoginRedirect', () => ({
  useLoginRedirect: vi.fn(),
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

vi.mock('../../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

const { usePrivy } = await import('@privy-io/react-auth');
const { useOpenTradeAuth } = await import('../../hooks/useOpenTradeAuth');
const { useLoginRedirect } = await import('../../hooks/useLoginRedirect');
const apiClient = await import('../../lib/api/client');
const submitComplaintMock = apiClient.submitComplaint as unknown as Mock;
const fetchMyProfileMock = apiClient.fetchMyProfile as unknown as Mock;
const uploadVerifyEvidenceMock = apiClient.uploadVerifyEvidence as unknown as Mock;
const usePrivyMock = usePrivy as unknown as Mock;
const useAuthMock = useOpenTradeAuth as unknown as Mock;
const useLoginRedirectMock = useLoginRedirect as unknown as Mock;

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
  usePrivyMock.mockReturnValue({ authenticated: true });
  useLoginRedirectMock.mockReturnValue(vi.fn());
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
  usePrivyMock.mockReturnValue({ authenticated: true });
  useLoginRedirectMock.mockReturnValue(vi.fn());
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

/** Navigate from Step 1 (Guidelines) to Step 2 (Details). */
const goToStep2 = async (): Promise<void> => {
  const acceptBtn = await screen.findByText('I understand, begin filing');
  await userEvent.click(acceptBtn);
  await screen.findByText('Fill in complaint details');
};

/** Navigate from Step 2 to Step 3 (Evidence), filling in required fields first. */
const goToStep3FromStep2 = async (
  opts: { body?: string; skipBody?: boolean } = {},
): Promise<void> => {
  if (!opts.skipBody) {
    const bodyInput = screen.getByPlaceholderText(/Describe what happened/);
    await userEvent.type(bodyInput, opts.body ?? 'A long enough body for the minimum.');
  }
  const nextBtn = screen.getByText('Next: Upload evidence');
  await waitFor(() => expect(nextBtn).toBeEnabled());
  await userEvent.click(nextBtn);
  await screen.findByText('Upload attachments & evidence');
};

afterEach(() => {
  vi.resetAllMocks();
});

describe('ComplaintForm — view-mode gating', () => {
  it('renders the unauthenticated gate when Privy reports authenticated=false', async () => {
    usePrivyMock.mockReturnValue({ authenticated: false });
    useLoginRedirectMock.mockReturnValue(vi.fn());
    useAuthMock.mockReturnValue({
      getAccessToken: vi.fn(),
      isExchanging: false,
      userId: null,
    });

    renderForm();

    expect(await screen.findByText('Please log in first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByText('Fill in complaint details')).not.toBeInTheDocument();
  });

  it('invokes the /auth route helper when the unauthenticated-gate CTA is clicked', async () => {
    const goLogin = vi.fn();
    usePrivyMock.mockReturnValue({ authenticated: false });
    useLoginRedirectMock.mockReturnValue(goLogin);
    useAuthMock.mockReturnValue({
      getAccessToken: vi.fn(),
      isExchanging: false,
      userId: null,
    });
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(goLogin).toHaveBeenCalledOnce();
  });

  it('renders the SBT-required gate when the profile lacks the L2 tier', async () => {
    stubLoggedInNoSbt();
    renderForm();

    expect(await screen.findByText('L2 verified-reviewer SBT required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start verification/i })).toHaveAttribute(
      'href',
      '/verify',
    );
    expect(screen.queryByText('Fill in complaint details')).not.toBeInTheDocument();
  });

  it('renders the wizard step 1 (guidelines) once the profile resolves with sbtTier=L2', async () => {
    stubLoggedInL2();
    renderForm();

    expect(
      await screen.findByText(`File a complaint against ${BROKER.brokerName}`),
    ).toBeInTheDocument();
    expect(screen.getByText('I understand, begin filing')).toBeInTheDocument();
  });
});

describe('ComplaintForm — evidence upload validation', () => {
  it('rejects an unsupported file type without calling the API', async () => {
    stubLoggedInL2();
    renderForm();
    await goToStep2();
    await goToStep3FromStep2();

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(fileInput).not.toBeNull();

    const badFile = fakeUploadedFile('text/plain', 100, 'note.txt');
    await userEvent.upload(fileInput, badFile, { applyAccept: false });

    expect(await screen.findByText(/Unsupported file format/)).toBeInTheDocument();
    expect(uploadVerifyEvidenceMock).not.toHaveBeenCalled();
  });

  it('rejects a file larger than 10MB without calling the API', async () => {
    stubLoggedInL2();
    renderForm();
    await goToStep2();
    await goToStep3FromStep2();

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
    await goToStep2();
    await goToStep3FromStep2();

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
  it('keeps the submit button disabled until evidence is uploaded', async () => {
    stubLoggedInL2();
    uploadVerifyEvidenceMock.mockResolvedValue({ cid: EVIDENCE_CID });
    renderForm();
    await goToStep2();
    await goToStep3FromStep2();

    const submit = screen.getByRole('button', { name: 'Confirm and submit complaint' });
    expect(submit).toBeDisabled();

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
    await goToStep2();

    await userEvent.type(
      screen.getByPlaceholderText('One-line summary of the complaint'),
      '  Phantom trades  ',
    );
    await userEvent.type(
      screen.getByPlaceholderText(/Describe what happened/),
      '  Two trades on my July statement were never authorised by me.  ',
    );

    await goToStep3FromStep2({ skipBody: true });

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(fileInput, fakeUploadedFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm and submit complaint' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and submit complaint' }));

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
    await goToStep2();

    await userEvent.type(
      screen.getByPlaceholderText(/Describe what happened/),
      'Body that is just long enough.',
    );
    await goToStep3FromStep2({ skipBody: true });

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(fileInput, fakeUploadedFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm and submit complaint' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and submit complaint' }));

    await waitFor(() => expect(submitComplaintMock).toHaveBeenCalledOnce());
    const [payload] = submitComplaintMock.mock.calls[0]!;
    expect(payload).not.toHaveProperty('title');
  });

  it('renders the localised RATE_LIMIT_EXCEEDED copy when submitComplaint throws', async () => {
    stubLoggedInL2();
    uploadVerifyEvidenceMock.mockResolvedValue({ cid: EVIDENCE_CID });
    submitComplaintMock.mockRejectedValue(
      new ApiClientError(429, 'RATE_LIMIT_EXCEEDED', 'developer-only message'),
    );
    renderForm();
    await goToStep2();

    await userEvent.type(
      screen.getByPlaceholderText(/Describe what happened/),
      'A long enough body to satisfy the minimum.',
    );
    await goToStep3FromStep2({ skipBody: true });

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(fileInput, fakeUploadedFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm and submit complaint' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and submit complaint' }));

    expect(await screen.findByText(/You're going a bit too fast/)).toBeInTheDocument();
    expect(screen.queryByText('Complaint submitted')).not.toBeInTheDocument();
  });
});
