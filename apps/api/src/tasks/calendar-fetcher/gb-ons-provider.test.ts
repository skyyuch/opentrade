/**
 * Unit tests for GbOnsCalendarProvider (ADR-0061 D2, batch 2; value backfill
 * Q3-B).
 *
 * Coverage:
 *   - Maps releases to indicators by the stable `onsUriPrefix` slug prefix and
 *     derives the period from the slug remainder; non-matching slugs are ignored
 *   - Skips the `…timeseries` companion release and cancelled releases
 *   - Schedule-only indicators (no `onsTimeseriesPath`) keep null values (D1)
 *   - Value backfill: released periods get previous/actual from the website
 *     timeseries months (verbatim strings), the publication-month shift maps
 *     the labour-market bulletin onto its rolling-quarter observation, and a
 *     data failure only skips that indicator (isolation)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - Malformed entries are isolated (one bad row can't drop the good ones)
 *   - No configured ONS indicators / a fetch failure → inert (empty)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - parseOnsMonths / shiftMonthLabel edge cases
 *
 * Self-made JSON fixtures (not live URLs) keep the tests hermetic — the
 * shapes mirror the official `search/releases` and website timeseries
 * responses verified live on 2026-08-05.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  GbOnsCalendarProvider,
  parseOnsMonths,
  periodFromRemainder,
  shiftMonthLabel,
} from './gb-ons-provider.js';

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
 * mirroring the provider's two typed queries. Timeseries `/data` URLs are
 * served from `seriesByPath` (path without the `/data` suffix); an
 * unregistered path returns 404 so failure isolation can be exercised.
 */
const fetchByType = (
  upcoming: unknown[],
  published: unknown[] = [],
  seriesByPath: Record<string, unknown> = {},
): typeof fetch =>
  vi.fn((url: string) => {
    if (url.includes('/timeseries/')) {
      const path = url.replace('https://www.ons.gov.uk', '').replace(/\/data$/, '');
      const payload = seriesByPath[path];
      if (payload === undefined) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    }
    const releases = url.includes('type-upcoming') ? upcoming : published;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ releases }) });
  }) as unknown as typeof fetch;

/** A minimal website-timeseries payload with "YYYY MMM" months. */
const timeseries = (months: [string, string][]): unknown => ({
  months: months.map(([date, value]) => ({ date, value, label: date })),
});

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

  it('backfills previous/actual from the timeseries months and leaves unpublished periods null', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [
        { ...cpi, onsTimeseriesPath: '/economy/inflationandpriceindices/timeseries/d7g7/mm23' },
      ],
      now: () => NOW,
      fetchFn: fetchByType(
        // Upcoming July bulletin: July not yet published, June is its previous.
        [release('/releases/consumerpriceinflationukjuly2026', '2026-08-19T06:00:00.000Z')],
        // Published June bulletin (in the look-back window).
        [release('/releases/consumerpriceinflationukjune2026', '2026-07-22T06:00:00.000Z')],
        {
          '/economy/inflationandpriceindices/timeseries/d7g7/mm23': timeseries([
            ['2026 MAY', '2.8'],
            ['2026 JUN', '2.6'],
          ]),
        },
      ),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(2);

    const june = drafts.find((d) => d.periodLabel === '2026-06');
    expect(june).toMatchObject({ previousValue: '2.8', actualValue: '2.6' });

    const july = drafts.find((d) => d.periodLabel === '2026-07');
    expect(july).toMatchObject({ previousValue: '2.6', actualValue: null });
  });

  it('applies the publication-month shift for the labour-market rolling quarter', async () => {
    const labour: CalendarIndicatorSource = {
      ...cpi,
      indicatorCode: 'GB_LABOUR_MARKET',
      category: 'EMPLOYMENT',
      onsUriPrefix: 'uklabourmarket',
      onsTimeseriesPath:
        '/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms',
      onsPeriodShiftMonths: -3,
    };
    const provider = new GbOnsCalendarProvider({
      indicators: [labour],
      now: () => NOW,
      fetchFn: fetchByType(
        [],
        // July bulletin (publication month) covers Mar–May → April observation.
        [release('/releases/uklabourmarketjuly2026', '2026-07-21T06:00:00.000Z')],
        {
          '/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms': timeseries(
            [
              ['2026 MAR', '4.9'],
              ['2026 APR', '4.9'],
            ],
          ),
        },
      ),
    });

    const [draft] = await provider.fetchEvents();
    expect(draft).toMatchObject({
      periodLabel: '2026-07',
      previousValue: '4.9',
      actualValue: '4.9',
    });
  });

  it('keeps values null when the timeseries endpoint fails (per-indicator isolation)', async () => {
    const provider = new GbOnsCalendarProvider({
      indicators: [
        { ...cpi, onsTimeseriesPath: '/economy/inflationandpriceindices/timeseries/d7g7/mm23' },
      ],
      now: () => NOW,
      // No series registered → the timeseries call returns 404.
      fetchFn: fetchByType(
        [],
        [release('/releases/consumerpriceinflationukjune2026', '2026-07-22T06:00:00.000Z')],
      ),
    });

    const [draft] = await provider.fetchEvents();
    expect(draft).toMatchObject({ previousValue: null, actualValue: null });
  });

  it('does not call the timeseries endpoint for schedule-only indicators', async () => {
    const fetchFn = fetchByType([
      release('/releases/consumerpriceinflationukaugust2026', '2026-08-19T06:00:00.000Z'),
    ]);
    const provider = new GbOnsCalendarProvider({
      indicators: [cpi], // no onsTimeseriesPath
      now: () => NOW,
      fetchFn,
    });

    await provider.fetchEvents();
    expect(fetchFn).toHaveBeenCalledTimes(2); // the two schedule pages only
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

describe('parseOnsMonths', () => {
  it('keeps values verbatim and skips unpublished or malformed entries', () => {
    const series = parseOnsMonths({
      months: [
        { date: '2026 MAY', value: '1.0' }, // trailing zero must survive
        { date: '2026 JUN', value: '-0.1' },
        { date: '2026 JUL', value: '' }, // not yet published
        { date: '2026 AUG', value: '..' }, // ONS missing marker
        { date: 'JUN 2026', value: '2.0' }, // wrong shape
      ],
    });
    expect(series.get('2026-05')).toBe('1.0');
    expect(series.get('2026-06')).toBe('-0.1');
    expect(series.size).toBe(2);
  });
});

describe('shiftMonthLabel', () => {
  it('shifts across year boundaries and rejects non-month labels', () => {
    expect(shiftMonthLabel('2026-07', -3)).toBe('2026-04');
    expect(shiftMonthLabel('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthLabel('2025-12', 1)).toBe('2026-01');
    expect(shiftMonthLabel('2026-07', 0)).toBe('2026-07');
    expect(shiftMonthLabel('2026 Q2', -1)).toBeNull();
    expect(shiftMonthLabel('2026', -1)).toBeNull();
  });
});
