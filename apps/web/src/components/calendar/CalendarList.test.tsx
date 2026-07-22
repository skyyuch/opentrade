/**
 * CalendarList component tests (ADR-0058 /calendar page island).
 *
 * Scope: the island renders the server-seeded page and refetches on filter
 * changes; ordering / windowing correctness is proven server-side
 * (ListEventsUseCase tests) and in `calendarWindow.test.ts`. Here we cover
 * the React wiring: a populated page renders the trilingual name + official
 * facts (period / previous / actual), the upcoming vs released badge keys off
 * the post-release `actualValue` backfill (D3), the empty state shows, filter
 * chips trigger a refetch with the right region/category params, and "load
 * more" appends the cursor page.
 *
 * NextIntl wrapping: the component pulls labels via `useTranslations`, so
 * tests render under `NextIntlClientProvider` with the real en.json
 * `calendar` slice — assertions match visible strings and surface i18n drift.
 *
 * `fetchCalendar` is mocked module-level (matching the component's relative
 * `../../lib/api/client` import) so filter/pagination paths are observable
 * without a network call.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import enMessages from '../../../messages/en.json';

import { CalendarList } from './CalendarList';

import type * as ApiClientModule from '../../lib/api/client';
import type { EconomicEventItem } from '../../lib/api/client';

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api/client');
  return {
    ...actual,
    fetchCalendar: vi.fn(),
  };
});

const apiClient = await import('../../lib/api/client');
const fetchCalendarMock = apiClient.fetchCalendar as unknown as Mock;

const RELEASED_EVENT: EconomicEventItem = {
  id: '11111111-1111-1111-1111-111111111111',
  indicatorCode: 'US_CPI_YOY',
  nameZhHant: '美國 CPI（按年）',
  nameZhHans: '美国 CPI（按年）',
  nameEn: 'US CPI (YoY)',
  region: 'US',
  category: 'INFLATION',
  scheduledAt: '2026-07-15T12:30:00.000Z',
  periodLabel: '2026-06',
  previousValue: '3.1',
  actualValue: '3.4',
  unit: '%_YOY',
  sourceName: 'BLS',
  sourceUrl: 'https://www.bls.gov/cpi/',
};

const UPCOMING_EVENT: EconomicEventItem = {
  id: '22222222-2222-2222-2222-222222222222',
  indicatorCode: 'US_FOMC_RATE',
  nameZhHant: '美國聯儲局利率決議',
  nameZhHans: '美国联储局利率决议',
  nameEn: 'US FOMC Rate Decision',
  region: 'US',
  category: 'RATE_DECISION',
  scheduledAt: '2026-07-29T18:00:00.000Z',
  periodLabel: '2026-07',
  previousValue: '4.25',
  actualValue: null,
  unit: '%',
  sourceName: 'Federal Reserve',
  sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/openmarket.htm',
};

const renderList = (initialItems: EconomicEventItem[], initialCursor: string | null = null) =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Hong_Kong">
      <CalendarList initialItems={initialItems} initialCursor={initialCursor} />
    </NextIntlClientProvider>,
  );

afterEach(() => {
  vi.resetAllMocks();
});

describe('CalendarList — populated page', () => {
  it('renders the localized name, official facts, and outbound source link', () => {
    renderList([RELEASED_EVENT]);

    expect(screen.getByText('US CPI (YoY)')).toBeInTheDocument();
    expect(screen.getByText('BLS')).toBeInTheDocument();
    expect(screen.getByText(/Period: 2026-06/)).toBeInTheDocument();
    expect(screen.getByText('3.1 %_YOY')).toBeInTheDocument();
    expect(screen.getByText('3.4 %_YOY')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /US CPI/ });
    expect(link).toHaveAttribute('href', RELEASED_EVENT.sourceUrl);
    expect(link).toHaveAttribute('rel', expect.stringContaining('nofollow'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows the released badge when actualValue is present', () => {
    renderList([RELEASED_EVENT]);
    expect(screen.getByText('Released')).toBeInTheDocument();
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
  });

  it('shows the upcoming badge and the pending placeholder before release', () => {
    renderList([UPCOMING_EVENT]);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('TBA')).toBeInTheDocument();
    expect(screen.queryByText('Released')).not.toBeInTheDocument();
  });

  it('renders the scheduled time in Hong Kong time (ADR-0058 D7)', () => {
    // 2026-07-15T12:30Z = 20:30 HK.
    renderList([RELEASED_EVENT]);
    expect(screen.getByText(/08:30 PM|20:30/)).toBeInTheDocument();
  });

  it('hides the load-more button when there is no next cursor', () => {
    renderList([RELEASED_EVENT], null);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});

describe('CalendarList — empty state', () => {
  it('renders the empty message when there are no events', () => {
    renderList([]);
    expect(screen.getByText('No events in this window.')).toBeInTheDocument();
  });
});

describe('CalendarList — filters', () => {
  it('refetches with the region filter when a region chip is clicked', async () => {
    fetchCalendarMock.mockResolvedValue({ items: [RELEASED_EVENT], nextCursor: null });

    renderList([RELEASED_EVENT, UPCOMING_EVENT]);
    await userEvent.click(screen.getByRole('button', { name: 'United States' }));

    await waitFor(() => {
      expect(fetchCalendarMock).toHaveBeenCalledTimes(1);
    });
    const params = fetchCalendarMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params['region']).toBe('US');
    expect(params['category']).toBeUndefined();
    expect(typeof params['from']).toBe('string');
    expect(typeof params['to']).toBe('string');
  });

  it('refetches with the category filter when a category chip is clicked', async () => {
    fetchCalendarMock.mockResolvedValue({ items: [UPCOMING_EVENT], nextCursor: null });

    renderList([RELEASED_EVENT, UPCOMING_EVENT]);
    await userEvent.click(screen.getByRole('button', { name: 'Rate decision' }));

    await waitFor(() => {
      expect(screen.getByText('US FOMC Rate Decision')).toBeInTheDocument();
    });
    expect(screen.queryByText('US CPI (YoY)')).not.toBeInTheDocument();
    const params = fetchCalendarMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params['category']).toBe('RATE_DECISION');
  });

  it('widens the window when the month timeframe is selected', async () => {
    fetchCalendarMock.mockResolvedValue({ items: [], nextCursor: null });

    renderList([RELEASED_EVENT]);
    await userEvent.click(screen.getByRole('button', { name: 'This month' }));

    await waitFor(() => {
      expect(screen.getByText('No events in this window.')).toBeInTheDocument();
    });
    const params = fetchCalendarMock.mock.calls[0]?.[0] as { from: string; to: string };
    const spanDays = (Date.parse(params.to) - Date.parse(params.from)) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBeGreaterThan(27);
  });

  it('shows the error message when a filter refetch fails', async () => {
    fetchCalendarMock.mockRejectedValue(new Error('network'));

    renderList([RELEASED_EVENT]);
    await userEvent.click(screen.getByRole('button', { name: 'Hong Kong' }));

    await waitFor(() => {
      expect(
        screen.getByText('The calendar is temporarily unavailable. Please try again later.'),
      ).toBeInTheDocument();
    });
  });
});

describe('CalendarList — load more', () => {
  it('appends the next page and clears the cursor when exhausted', async () => {
    fetchCalendarMock.mockResolvedValue({ items: [UPCOMING_EVENT], nextCursor: null });

    renderList([RELEASED_EVENT], 'cursor-1');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(screen.getByText('US FOMC Rate Decision')).toBeInTheDocument();
    });
    expect(screen.getByText('US CPI (YoY)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();

    const params = fetchCalendarMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params['cursor']).toBe('cursor-1');
  });
});
