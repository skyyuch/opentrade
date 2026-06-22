/**
 * KolsClient — console KOL category management component tests (ADR-0053 §5/§6).
 *
 * The console KOL management screen gained (per ADR-0053 §5): server-side
 * type/focus filter selects (re-querying `fetchAdminKols`), category label
 * chips on each list row, and an in-modal category editor that calls
 * `setKolCategory`. These tests pin that behaviour, mirroring
 * AdminBrokersClient.test.tsx for the broker category filter.
 *
 * Mock strategy:
 *   - `useOpenTradeAuth` hands back a synchronous token (the component bails
 *     out of every action when the token is falsy).
 *   - the api client module is stubbed so the list/detail/save calls resolve
 *     deterministically without a real API / JWT.
 *   - next-intl labels come from the real console en.json `adminKols` slice.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';

import { KolsClient } from './KolsClient';

import type { AdminKolItem } from '../../../../lib/api/client';

vi.mock('../../../../hooks/useOpenTradeAuth', () => ({
  useOpenTradeAuth: vi.fn(() => ({
    getAccessToken: vi.fn(() => 'console-jwt'),
  })),
}));

vi.mock('../../../../lib/api/client', () => ({
  fetchAdminKols: vi.fn(),
  fetchAdminKolDetail: vi.fn(),
  setKolCategory: vi.fn(),
  approveKol: vi.fn(),
  rejectKol: vi.fn(),
  suspendKol: vi.fn(),
}));

const apiClient = await import('../../../../lib/api/client');
const fetchAdminKolsMock = apiClient.fetchAdminKols as unknown as ReturnType<typeof vi.fn>;
const fetchAdminKolDetailMock = apiClient.fetchAdminKolDetail as unknown as ReturnType<
  typeof vi.fn
>;
const setKolCategoryMock = apiClient.setKolCategory as unknown as ReturnType<typeof vi.fn>;

const financialEquity: AdminKolItem = {
  id: 'kol-fin',
  slug: 'money-talk',
  displayName: 'Money Talk',
  bio: null,
  avatarUrl: null,
  status: 'APPROVED',
  type: 'FINANCIAL_KOL',
  focus: 'EQUITY',
  socialLinks: null,
  credentials: null,
  iamSmartVerified: false,
  userId: 'user-fin',
  kolSbtTokenId: null,
  adminNote: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const uncategorised: AdminKolItem = {
  id: 'kol-uncat',
  slug: 'mystery-caller',
  displayName: 'Mystery Caller',
  bio: null,
  avatarUrl: null,
  status: 'UNCLAIMED',
  type: null,
  focus: null,
  socialLinks: null,
  credentials: null,
  iamSmartVerified: false,
  userId: null,
  kolSbtTokenId: null,
  adminNote: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
};

const renderClient = () =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Hong_Kong">
      <KolsClient />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  fetchAdminKolsMock.mockResolvedValue({ kols: [financialEquity, uncategorised], total: 2 });
  fetchAdminKolDetailMock.mockResolvedValue({
    kol: uncategorised,
    signalCount: 0,
    followerCount: 0,
  });
  setKolCategoryMock.mockResolvedValue({
    kol: { ...uncategorised, type: 'FINANCIAL_KOL', focus: 'CRYPTO' },
  });
});

describe('KolsClient — category management (ADR-0053 §5)', () => {
  it('renders category chips on the rows once loaded', async () => {
    renderClient();

    expect(await screen.findByText('Money Talk')).toBeInTheDocument();
    // The categorised row shows its type + focus label chips. The same labels
    // also appear as <option> text in the filter selects, so assert on the
    // <span> chip specifically.
    expect(screen.getAllByText('Financial KOL').some((el) => el.tagName === 'SPAN')).toBe(true);
    expect(screen.getAllByText('Equity').some((el) => el.tagName === 'SPAN')).toBe(true);
  });

  it('re-queries fetchAdminKols with the type param when the filter changes', async () => {
    renderClient();
    await screen.findByText('Money Talk');

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'FINANCIAL_KOL');

    await waitFor(() =>
      expect(fetchAdminKolsMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'FINANCIAL_KOL' }),
        expect.anything(),
      ),
    );
  });

  it('saves a category assignment from the detail modal via setKolCategory', async () => {
    renderClient();
    await screen.findByText('Mystery Caller');

    // Open the detail modal for the uncategorised KOL.
    await userEvent.click(screen.getByText('Mystery Caller'));
    const dialog = await screen.findByRole('dialog');

    // The dialog holds exactly the two editor selects (type first, focus
    // second); the filter selects live outside the dialog. Assign both, save.
    const [typeSelect, focusSelect] = within(dialog).getAllByRole('combobox');
    await userEvent.selectOptions(typeSelect!, 'FINANCIAL_KOL');
    await userEvent.selectOptions(focusSelect!, 'CRYPTO');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));

    await waitFor(() =>
      expect(setKolCategoryMock).toHaveBeenCalledWith(
        'kol-uncat',
        { type: 'FINANCIAL_KOL', focus: 'CRYPTO' },
        expect.anything(),
      ),
    );
  });
});
