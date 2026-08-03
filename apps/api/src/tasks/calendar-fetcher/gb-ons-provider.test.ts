/**
 * Unit tests for GbOnsCalendarProvider (ADR-0061 D2, batch 2).
 *
 * Coverage:
 *   - Maps releases to indicators by the stable `onsUriPrefix` slug prefix and
 *     derives the period from the slug remainder; non-matching slugs are ignored
 *   - Skips the `…timeseries` companion release and cancelled releases
 *   - Values are always null (ONS exposes the schedule only, D1)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - Malformed entries are isolated (one bad row can't drop the good ones)
 *   - No configured ONS indicators / a fetch failure → inert (empty)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *
 * A self-made JSON fixture (not a live URL) keeps the test hermetic — the
 * shape mirrors the official `search/releases` response.
 */

import { describe, expect, it, vi } from 'vitest';

import { GbOnsCalendarProvider, periodFromRemainder } from './gb-ons-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-08-10T00:00:00.000Z');

const cpi: CalendarIndicatorSource = {
  indicatorCode: 'GB_CPI_YOY',
  provider: 'ONS',
  authority: 'Office for National Statistics',
  nameZhHant: '英國消費者物價指數（按年）',
  nameZhHans: '英国消费者物价指数（按年）',
  nameEn: 'UK Consumer Price Inflation (YoY)',
  region: 'GB',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.ons.gov.uk/releasecalendar',
  sourceUrl:
    'https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/latest',
  onsUriPrefix: 'consumerpriceinflationuk',
  lang: 'en',
  enabled: true,
};

const retail: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'GB_RETAIL_SALES',
  category: 'OTHER',
  onsUriPrefix: 'retailsalesgreatbritain',
};

const release = (uri: string, releaseDate: string, cancelled = false): unknown => ({
  uri,
  description: { release_date: releaseDate, cancelled },
});

/**
 * Build an injectable fetch that returns the `upcoming` list for the
 * `type-upcoming` page and the `published` list for the `type-published` page,
 * mirroring the provider's two typed queries.
 */
const fetchByType = (upcoming: unknown[], published: unknown[] = []): typeof fetch =>
  vi.fn((url: string) => {
    const releases = url.includes('type-upcoming') ? upcoming : published;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ releases }) });
  }) as unknown as typeof fetch;

describe('GbOnsCalendarProvider.fetchEvents', () => {
  it('maps slugs by prefix to drafts with null values and slug-derived periods', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi, retail],
      now: () => NOW,
      fetchFn: fetchByType([
        release('/releases/consumerpriceinflationukaugust2026', '2026-08-19T06:00:00.000Z'),
        release('/releases/retailsalesgreatbritainjuly2026', '2026-08-21T06:00:00.000Z'),
        // Not a configured prefix — must be ignored.
        release('/releases/producerpriceinflationukjuly2026', '2026-08-19T06:00:00.000Z'),
      ]),
    });

    const drafts = await provider.fetchEvents();

    expect(drafts).toHaveLength(2);
    const cpiDraft = drafts.find((d) => d.indicatorCode === 'GB_CPI_YOY');
    expect(cpiDraft).toMatchObject({
      periodLabel: '2026-08',
      previousValue: null,
      actualValue: null,
    });
    expect(cpiDraft?.scheduledAt.toISOString()).toBe('2026-08-19T06:00:00.000Z');
    expect(drafts.find((d) => d.indicatorCode === 'GB_RETAIL_SALES')?.periodLabel).toBe('2026-07');
  });

  it('skips the …timeseries companion release', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchByType([
        release('/releases/consumerpriceinflationukaugust2026', '2026-08-19T06:00:00.000Z'),
        release(
          '/releases/consumerpriceinflationukaugust2026timeseries',
          '2026-08-19T06:00:00.000Z',
        ),
      ]),
    });

    expect(await provider.fetchEvents()).toHaveLength(1);
  });

  it('skips a cancelled release', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchByType([
        release('/releases/consumerpriceinflationukaugust2026', '2026-08-19T06:00:00.000Z', true),
      ]),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('falls back to the release month when the slug remainder is not a plain month', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchByType([
        release('/releases/consumerpriceinflationukapriltojune2026', '2026-08-19T06:00:00.000Z'),
      ]),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-08');
  });

  it('drops events outside the look-back / look-ahead window', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchByType([
        // ~2 years ahead — outside the look-ahead window.
        release('/releases/consumerpriceinflationukaugust2028', '2028-08-19T06:00:00.000Z'),
      ]),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('isolates a malformed entry and keeps the good ones', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchByType([
        { uri: 12345, description: { release_date: '2026-08-19T06:00:00.000Z' } },
        release('/releases/consumerpriceinflationukaugust2026', 'not-a-date'),
        release('/releases/consumerpriceinflationukseptember2026', '2026-09-17T06:00:00.000Z'),
      ]),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-09');
  });

  it('is inert when no ONS indicators are configured', async () => {
    const fetchFn = vi.fn();
    const provider = new GbOnsCalendarProvider({
      indicators: [],
      now: () => NOW,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns empty on a fetch failure (whole-provider isolation)', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchByType([
        release('/releases/consumerpriceinflationukaugust2026', '2026-08-19T06:00:00.000Z'),
      ]),
    });

    const [draft] = await provider.fetchEvents();
    expect(Object.keys(draft ?? {}).sort()).toEqual([
      'actualValue',
      'indicatorCode',
      'periodLabel',
      'previousValue',
      'scheduledAt',
    ]);
  });
});

describe('periodFromRemainder', () => {
  it('parses a plain month name + year, else returns null', () => {
    expect(periodFromRemainder('august2026')).toBe('2026-08');
    expect(periodFromRemainder('july2026')).toBe('2026-07');
    expect(periodFromRemainder('apriltojune2026')).toBeNull();
    expect(periodFromRemainder('2026')).toBeNull();
    expect(periodFromRemainder('')).toBeNull();
  });
});
