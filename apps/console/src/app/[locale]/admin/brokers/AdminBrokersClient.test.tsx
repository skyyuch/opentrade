/**
 * AdminBrokersClient — broker category (vertical) filter tests (ADR-0045 D7,
 * §6).
 *
 * The console admin broker table gained a client-side `category` dimension in
 * the bullion vertical's §5 wiring: a filter dropdown (All / Securities /
 * Bullion) over the in-memory roster, consistent with the existing
 * search / claim / license filters, plus a category column pill. This is an
 * internal admin surface (no Google UI prompt — robots-disallowed, team-built
 * styling), so per cursor rule 60 it has no swap dependency and can be tested
 * directly.
 *
 * Mock strategy:
 *   - `fetchAllBrokers` is stubbed so the table renders deterministic rows
 *     without a real API / JWT.
 *   - `useOpenTradeAuth` hands back a synchronous token (the component bails
 *     out of the load effect when the token is falsy).
 *   - `next/navigation`'s `useRouter` is stubbed because row clicks push a
 *     route.
 *   - next-intl labels come from the real console en.json `admin` slice.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';

import { AdminBrokersClient } from './AdminBrokersClient';

import type { BrokerListItem } from '../../../../lib/api/client';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('../../../../hooks/useOpenTradeAuth', () => ({
  useOpenTradeAuth: vi.fn(() => ({
    getAccessToken: vi.fn(() => 'console-jwt'),
  })),
}));

vi.mock('../../../../lib/api/client', () => ({
  fetchAllBrokers: vi.fn(),
}));

const apiClient = await import('../../../../lib/api/client');
const fetchAllBrokersMock = apiClient.fetchAllBrokers as unknown as ReturnType<typeof vi.fn>;

const securitiesBroker: BrokerListItem = {
  id: 'sec-1',
  slug: 'securities-broker-a',
  category: 'SECURITIES',
  displayName: '證券商A',
  displayNameZhHans: '证券商A',
  legalName: 'Securities Broker A Ltd',
  logoUrl: null,
  isClaimed: true,
  reviewCount: 5,
  licenseTypes: ['HK_SFC_TYPE_1'],
};

const bullionBroker: BrokerListItem = {
  id: 'bul-1',
  slug: 'hkgx-009',
  category: 'BULLION',
  displayName: '金商B',
  displayNameZhHans: '金商B',
  legalName: 'Bullion Dealer B Ltd',
  logoUrl: null,
  isClaimed: false,
  reviewCount: 3,
  licenseTypes: [],
};

const renderClient = () =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Hong_Kong">
      <AdminBrokersClient />
    </NextIntlClientProvider>,
  );

// The component shows a loading spinner until `fetchAllBrokers` resolves, so
// every test awaits the table appearing before asserting against its rows.
const awaitTable = () => screen.findByRole('table');

beforeEach(() => {
  fetchAllBrokersMock.mockResolvedValue([securitiesBroker, bullionBroker]);
});

describe('AdminBrokersClient — category filter (ADR-0045 D7)', () => {
  it('renders both verticals with their category column pill by default', async () => {
    renderClient();
    const table = await awaitTable();
    expect(within(table).getByText('Securities Broker A Ltd')).toBeInTheDocument();
    expect(within(table).getByText('Bullion Dealer B Ltd')).toBeInTheDocument();

    // The category column shows a localised pill per row.
    expect(within(table).getByText('Securities')).toBeInTheDocument();
    expect(within(table).getByText('Bullion')).toBeInTheDocument();
  });

  it('narrows to bullion dealers when the category filter selects BULLION', async () => {
    renderClient();
    await awaitTable();

    const categorySelect = screen.getByDisplayValue('All categories');
    await userEvent.selectOptions(categorySelect, 'BULLION');

    const table = await awaitTable();
    expect(within(table).getByText('Bullion Dealer B Ltd')).toBeInTheDocument();
    expect(within(table).queryByText('Securities Broker A Ltd')).not.toBeInTheDocument();
  });

  it('narrows to securities brokers when the category filter selects SECURITIES', async () => {
    renderClient();
    await awaitTable();

    const categorySelect = screen.getByDisplayValue('All categories');
    await userEvent.selectOptions(categorySelect, 'SECURITIES');

    const table = await awaitTable();
    expect(within(table).getByText('Securities Broker A Ltd')).toBeInTheDocument();
    expect(within(table).queryByText('Bullion Dealer B Ltd')).not.toBeInTheDocument();
  });

  it('restores both verticals when the filter is reset to All categories', async () => {
    renderClient();
    await awaitTable();

    const categorySelect = screen.getByDisplayValue('All categories');
    await userEvent.selectOptions(categorySelect, 'BULLION');
    await waitFor(() =>
      expect(within(getTableNow()).queryByText('Securities Broker A Ltd')).not.toBeInTheDocument(),
    );

    await userEvent.selectOptions(categorySelect, 'all');
    const table = getTableNow();
    expect(within(table).getByText('Securities Broker A Ltd')).toBeInTheDocument();
    expect(within(table).getByText('Bullion Dealer B Ltd')).toBeInTheDocument();
  });
});

// Synchronous table getter for assertions after the table is already mounted.
const getTableNow = () => screen.getByRole('table');
