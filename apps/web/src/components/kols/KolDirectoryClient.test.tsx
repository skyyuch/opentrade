/**
 * KolDirectoryClient — KOL category filter component tests (ADR-0053 §4/§6).
 *
 * The public KOL directory filters the two orthogonal category axes
 * (`type` / `focus`) entirely client-side over the server-rendered
 * `initialKols`, plus a "未分類" (null) bucket the API cannot express as a query
 * param. These tests pin that filtering behaviour, the label chips, the
 * showing/total count swap, and the clear-filters reset — mirroring
 * BrokerDirectory.test.tsx for the bullion vertical.
 *
 * Mock strategy:
 *   - `@/i18n/navigation` Link is stubbed to a plain <a> so the cards render
 *     without standing up the next-intl router.
 *   - next-intl labels come from the real web en.json `kols` slice via
 *     NextIntlClientProvider, so assertions match the strings designers ship.
 *   - No fetch stub needed: the component is pure client-side filtering with
 *     no network calls (unlike BrokerDirectory's debounced refresh).
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import enMessages from '../../../messages/en.json';

import { KolDirectoryClient } from './KolDirectoryClient';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type Kol = Parameters<typeof KolDirectoryClient>[0]['initialKols'][number];

const baseKol: Omit<Kol, 'id' | 'slug' | 'displayName' | 'type' | 'focus'> = {
  bio: null,
  avatarUrl: null,
  status: 'APPROVED',
  socialLinks: null,
  credentials: null,
  iamSmartVerified: false,
  adminNote: null,
  createdAt: '2026-06-01T00:00:00.000Z',
};

const financialEquity: Kol = {
  ...baseKol,
  id: 'kol-fin',
  slug: 'money-talk',
  displayName: 'Money Talk',
  type: 'FINANCIAL_KOL',
  focus: 'EQUITY',
};

const indicatorCrypto: Kol = {
  ...baseKol,
  id: 'kol-vendor',
  slug: 'signal-shop',
  displayName: 'Signal Shop',
  type: 'INDICATOR_VENDOR',
  focus: 'CRYPTO',
};

const uncategorised: Kol = {
  ...baseKol,
  id: 'kol-uncat',
  slug: 'mystery-caller',
  displayName: 'Mystery Caller',
  type: null,
  focus: null,
};

const ALL_KOLS = [financialEquity, indicatorCrypto, uncategorised];

const renderDirectory = (kols: Kol[] = ALL_KOLS) =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Hong_Kong">
      <KolDirectoryClient initialKols={kols} initialTotal={kols.length} />
    </NextIntlClientProvider>,
  );

describe('KolDirectoryClient — category filter (ADR-0053 §4)', () => {
  it('renders every KOL with its category chips and the total count by default', () => {
    renderDirectory();

    expect(screen.getByText('Money Talk')).toBeInTheDocument();
    expect(screen.getByText('Signal Shop')).toBeInTheDocument();
    expect(screen.getByText('Mystery Caller')).toBeInTheDocument();

    // Chips render only for assigned dimensions (none for the uncategorised row).
    expect(screen.getAllByText('Financial KOL').some((el) => el.tagName === 'SPAN')).toBe(true);
    expect(screen.getAllByText('Equities').some((el) => el.tagName === 'SPAN')).toBe(true);

    expect(screen.getByText('3 KOL(s)')).toBeInTheDocument();
  });

  it('narrows to FINANCIAL_KOL when the type filter is selected', async () => {
    renderDirectory();

    await userEvent.click(screen.getByRole('button', { name: 'Financial KOL' }));

    expect(screen.getByText('Money Talk')).toBeInTheDocument();
    expect(screen.queryByText('Signal Shop')).not.toBeInTheDocument();
    expect(screen.queryByText('Mystery Caller')).not.toBeInTheDocument();
    // The count line swaps to the filtered "showing / total" form.
    expect(screen.getByText('Showing 1 / 3 KOLs')).toBeInTheDocument();
  });

  it('narrows to CRYPTO when the focus filter is selected', async () => {
    renderDirectory();

    await userEvent.click(screen.getByRole('button', { name: 'Crypto' }));

    expect(screen.getByText('Signal Shop')).toBeInTheDocument();
    expect(screen.queryByText('Money Talk')).not.toBeInTheDocument();
    expect(screen.queryByText('Mystery Caller')).not.toBeInTheDocument();
  });

  it('isolates the 未分類 (null) bucket when the type NONE filter is selected', async () => {
    renderDirectory();

    // "Uncategorised" labels both the type-row and focus-row NONE pills; the
    // type row renders first, so index 0 is the type-axis bucket.
    const uncategorisedButtons = screen.getAllByRole('button', { name: 'Uncategorised' });
    await userEvent.click(uncategorisedButtons[0]!);

    expect(screen.getByText('Mystery Caller')).toBeInTheDocument();
    expect(screen.queryByText('Money Talk')).not.toBeInTheDocument();
    expect(screen.queryByText('Signal Shop')).not.toBeInTheDocument();
  });

  it('shows the empty state with a clear-filters reset for a no-match combination', async () => {
    renderDirectory();

    // FINANCIAL_KOL + CRYPTO matches nobody (the financial KOL focuses equities).
    await userEvent.click(screen.getByRole('button', { name: 'Financial KOL' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crypto' }));

    expect(screen.getByText('No KOLs available yet.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    // Reset restores every row.
    expect(screen.getByText('Money Talk')).toBeInTheDocument();
    expect(screen.getByText('Signal Shop')).toBeInTheDocument();
    expect(screen.getByText('Mystery Caller')).toBeInTheDocument();
  });
});
