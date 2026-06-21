/**
 * BrokerDirectory — bullion (HKGX) variant component tests (ADR-0045 §6).
 *
 * These cover the BULLION branch of the shared directory grid, written
 * against the final Google-swapped UI (per ADR-0045 D7 + cursor rule 60: the
 * markup is now stable, so component assertions are safe). The securities
 * branch is exercised implicitly elsewhere; here we pin the bullion-specific
 * deltas the swap introduced:
 *
 *   1. The HKGX 行員 number renders as the headline trust badge
 *      (`hkgxMember` neon pill), not the SFC license-type treatment.
 *   2. The immutable SUSPENDED / REVOKED roster status renders as a factual
 *      trust pill (never a delete, per rule 00).
 *   3. The SFC license-type filter pills are suppressed for bullion (HKGX has
 *      no regulated-activity categories) — only the "Advanced filter" button
 *      remains.
 *   4. Each card links to the namespaced `/bullion-dealers/:slug` route so a
 *      hkgx-* slug never hits the securities `/brokers/` path.
 *
 * Mock strategy:
 *   - `@/i18n/navigation` Link is stubbed to a plain <a> so we can assert the
 *     resolved href without standing up the next-intl router.
 *   - `globalThis.fetch` is stubbed to echo the same fixtures back, so the
 *     debounced on-mount refresh settles to a deterministic steady state
 *     (the grid replaces its rows with the fetch result after 300ms).
 *   - next-intl labels come from the real en.json `bullionDealers` slice via
 *     NextIntlClientProvider, so assertions match the strings designers ship.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../messages/en.json';

import { BrokerDirectory } from './BrokerDirectory';

vi.mock('../../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type Dealer = Parameters<typeof BrokerDirectory>[0]['initialBrokers'][number];

const activeDealer: Dealer = {
  id: 'dealer-active',
  slug: 'hkgx-009',
  category: 'BULLION',
  displayName: '恆豐金號',
  displayNameZhHans: '恒丰金号',
  legalName: 'Heng Fung Bullion Ltd.',
  logoUrl: null,
  isClaimed: false,
  reviewCount: 12,
  positiveRate: 83,
  verifiedUserCount: 0,
  licenseTypes: [],
  licenses: [{ regulator: 'HK_HKGX', licenseNumber: '009', status: 'ACTIVE' }],
  hasDisciplinary: false,
};

const suspendedDealer: Dealer = {
  id: 'dealer-suspended',
  slug: 'hkgx-100',
  category: 'BULLION',
  displayName: '停業金商',
  displayNameZhHans: '停业金商',
  legalName: 'Suspended Bullion Co.',
  logoUrl: null,
  isClaimed: false,
  reviewCount: 0,
  positiveRate: null,
  verifiedUserCount: 0,
  licenseTypes: [],
  licenses: [{ regulator: 'HK_HKGX', licenseNumber: '100', status: 'SUSPENDED' }],
  hasDisciplinary: false,
};

const revokedDealer: Dealer = {
  id: 'dealer-revoked',
  slug: 'hkgx-200',
  category: 'BULLION',
  displayName: '除牌金商',
  displayNameZhHans: '除牌金商',
  legalName: 'Revoked Bullion Co.',
  logoUrl: null,
  isClaimed: false,
  reviewCount: 0,
  positiveRate: null,
  verifiedUserCount: 0,
  licenseTypes: [],
  licenses: [{ regulator: 'HK_HKGX', licenseNumber: '200', status: 'REVOKED' }],
  hasDisciplinary: false,
};

const renderDirectory = (locale: 'en' | 'zh-Hant', dealers: Dealer[]) =>
  render(
    <NextIntlClientProvider locale={locale} messages={enMessages} timeZone="Asia/Hong_Kong">
      <BrokerDirectory
        category="BULLION"
        namespace="bullionDealers"
        initialBrokers={dealers}
        initialCursor={null}
      />
    </NextIntlClientProvider>,
  );

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Echo whichever dealers the test mounted so the debounced on-mount refresh
  // settles to a no-op steady state instead of clearing the grid.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ brokers: lastMountedDealers, nextCursor: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
});

// Captured so the fetch stub can echo the same rows the test rendered.
let lastMountedDealers: Dealer[] = [];

const mount = (locale: 'en' | 'zh-Hant', dealers: Dealer[]) => {
  lastMountedDealers = dealers;
  return renderDirectory(locale, dealers);
};

describe('BrokerDirectory — bullion (HKGX) variant', () => {
  it('renders the HKGX member number as the headline trust badge', async () => {
    mount('en', [activeDealer]);
    expect(await screen.findByText('HKGX Member 009')).toBeInTheDocument();
    expect(screen.getByText('Heng Fung Bullion Ltd.')).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });

  it('links each card to the namespaced /bullion-dealers/:slug route', async () => {
    mount('en', [activeDealer]);
    const link = await screen.findByRole('link', { name: /Heng Fung Bullion/ });
    expect(link).toHaveAttribute('href', '/bullion-dealers/hkgx-009');
  });

  it('renders the immutable SUSPENDED roster status as a trust pill', async () => {
    mount('en', [suspendedDealer]);
    expect(await screen.findByText('Suspended')).toBeInTheDocument();
  });

  it('renders the immutable REVOKED roster status as a trust pill', async () => {
    mount('en', [revokedDealer]);
    expect(await screen.findByText('Revoked')).toBeInTheDocument();
  });

  it('suppresses the SFC license-type filter pills (HKGX has no RA categories)', async () => {
    mount('en', [activeDealer]);
    await screen.findByText('HKGX Member 009');
    // The securities grid renders six SFC filter pill buttons; the bullion
    // grid renders none, leaving only the "Advanced filter" button.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Advanced filter');
  });

  it('shows the localised dealer count and primary name per locale', async () => {
    mount('zh-Hant', [activeDealer, suspendedDealer]);
    // zh-Hant resolves the Traditional displayName as the primary line.
    expect(await screen.findByText('恆豐金號')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 dealers')).toBeInTheDocument();
  });
});
