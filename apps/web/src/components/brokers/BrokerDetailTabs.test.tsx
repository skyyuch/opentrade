/**
 * BrokerDetailTabs — bullion (HKGX) tab-variant + MembershipTab tests
 * (ADR-0045 §6, D7).
 *
 * Written against the final Google-swapped detail UI (the markup is now
 * stable per ADR-0045 D7, so component assertions are safe). The shared
 * BrokerDetailTabs varies its tab set by `broker.category`; for BULLION it
 * must render only 會籍 / 評論 / 投訴 (Membership / Reviews / Complaints) and
 * drop the SFC license-detail, related-KOL, and arbitration tabs. The
 * MembershipTab replaces the SFC-heavy LicenseTab with a compact HKGX record:
 * 行員編號, the immutable ACTIVE / SUSPENDED / REVOKED status (a trust signal,
 * never a delete, per rule 00), and a link to the public HKGX roster.
 *
 * Mock strategy:
 *   - `usePrivy` is stubbed unauthenticated so the embedded SubmitReviewCta
 *     renders its login gate instead of reaching for a Privy provider.
 *   - the auth hooks + `@/i18n/navigation` Link are stubbed so the tree
 *     mounts without the next-intl router or an OpenTrade JWT exchange.
 *   - next-intl labels come from the real en.json so assertions match the
 *     strings the bullion detail page actually ships.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../messages/en.json';

import { BrokerDetailTabs } from './BrokerDetailTabs';

import type { BrokerDetail } from '@/lib/api/client';

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: vi.fn(() => ({ authenticated: false })),
}));

vi.mock('@/hooks/useOpenTradeAuth', () => ({
  useOpenTradeAuth: vi.fn(() => ({
    getAccessToken: vi.fn().mockResolvedValue(null),
    isExchanging: false,
    userId: null,
  })),
}));

vi.mock('@/hooks/useLoginRedirect', () => ({
  useLoginRedirect: vi.fn(() => vi.fn()),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const baseBullionBroker: BrokerDetail = {
  id: 'dealer-1',
  slug: 'hkgx-009',
  category: 'BULLION',
  displayName: '恆豐金號',
  displayNameZhHans: '恒丰金号',
  legalName: 'Heng Fung Bullion Ltd.',
  ceNumber: null,
  description: 'An HKGX member bullion dealer fixture.',
  websiteUrl: null,
  logoUrl: null,
  addressEn: null,
  addressZh: null,
  sfcDetailJson: null,
  isClaimed: false,
  activeYears: null,
  reviewCount: 12,
  positiveRate: 83,
  verifiedUserCount: 0,
  verifiedComplaintCount: 0,
  ratingDistribution: [],
  sentimentAggregate: { positive: 8, neutral: 2, negative: 2 },
  licenses: [
    {
      regulator: 'HK_HKGX',
      licenseType: 'HK_HKGX_MEMBER',
      licenseNumber: '009',
      status: 'ACTIVE',
      issuedAt: '2010-01-01T00:00:00.000Z',
    },
  ],
  similarBrokers: [],
};

const suspendedBroker: BrokerDetail = {
  ...baseBullionBroker,
  id: 'dealer-2',
  slug: 'hkgx-100',
  licenses: [
    {
      regulator: 'HK_HKGX',
      licenseType: 'HK_HKGX_MEMBER',
      licenseNumber: '100',
      status: 'SUSPENDED',
      issuedAt: '2012-06-01T00:00:00.000Z',
    },
  ],
};

const renderTabs = (broker: BrokerDetail) =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Hong_Kong">
      <BrokerDetailTabs broker={broker} reviews={[]} complaints={[]} locale="en" />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BrokerDetailTabs — bullion tab set (ADR-0045 D7)', () => {
  it('renders only the Membership / Reviews / Complaints tabs', () => {
    renderTabs(baseBullionBroker);

    expect(screen.getByRole('button', { name: 'Membership' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /On-chain Reviews \(12\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Complaints/ })).toBeInTheDocument();
  });

  it('drops the SFC license, related-KOL, and arbitration tabs for bullion', () => {
    renderTabs(baseBullionBroker);

    expect(screen.queryByRole('button', { name: 'SFC Licence Data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Related KOLs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arbitration Records' })).not.toBeInTheDocument();
  });

  it('defaults to the Reviews tab (sentiment distribution + write CTA)', () => {
    renderTabs(baseBullionBroker);
    // Reviews tab is the initial active tab; its headline distribution and
    // the unauthenticated write CTA render before any tab interaction.
    expect(screen.getByText('Positive Rate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in & Review/i })).toBeInTheDocument();
  });
});

describe('MembershipTab — HKGX record (ADR-0045 D7)', () => {
  it('shows the HKGX membership record with member number and ACTIVE status', async () => {
    renderTabs(baseBullionBroker);
    await userEvent.click(screen.getByRole('button', { name: 'Membership' }));

    expect(screen.getByText('HKGX Membership Record')).toBeInTheDocument();
    expect(screen.getByText('009')).toBeInTheDocument();
    expect(screen.getByText('Active member')).toBeInTheDocument();
  });

  it('links to the public HKGX roster and carries the self-regulatory disclaimer', async () => {
    renderTabs(baseBullionBroker);
    await userEvent.click(screen.getByRole('button', { name: 'Membership' }));

    const rosterLink = screen.getByRole('link', { name: /Official HKGX member roster/ });
    expect(rosterLink).toHaveAttribute('href', 'https://hkgx.com.hk/en/member/memberlist');
    // Per rule 00 red line: every bullion surface states HKGX is a
    // self-regulatory exchange and the platform gives no investment advice.
    expect(screen.getByText('Investment risk & disclaimer')).toBeInTheDocument();
  });

  it('renders the immutable SUSPENDED status as a trust pill (never a delete)', async () => {
    renderTabs(suspendedBroker);
    await userEvent.click(screen.getByRole('button', { name: 'Membership' }));

    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});

describe('BrokerDetailTabs — bullion complaints tab', () => {
  it('switches to the complaints tab and shows the empty state', async () => {
    renderTabs(baseBullionBroker);
    await userEvent.click(screen.getByRole('button', { name: /Complaints/ }));

    expect(screen.getByText('No complaints yet')).toBeInTheDocument();
  });
});
