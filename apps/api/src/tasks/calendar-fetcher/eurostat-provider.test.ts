/**
 * Unit tests for EurostatCalendarProvider (ADR-0061 D2; value backfill Q3-B).
 *
 * Coverage:
 *   - Maps whitelisted release titles (case-insensitive) to indicatorCodes and
 *     normalises the period label; non-whitelisted titles are ignored
 *   - Schedule-only indicators (no `eurostatDataset`) keep null values (D1)
 *   - Value backfill: released periods get previous/actual from the
 *     dissemination JSON-stat series (monthly and quarterly), unpublished
 *     periods stay honestly null, and a data failure / mis-specified filter
 *     set only skips that indicator (isolation)
 *   - Events outside the look-back/look-ahead window are dropped
 *   - Malformed entries are isolated (one bad row can't drop the good ones)
 *   - No configured EUROSTAT indicators / a fetch failure → inert (empty)
 *   - Period normalisation covers month / quarter / year / fallback
 *   - previousPeriodLabel month / quarter / year-boundary arithmetic
 *
 * Self-made JSON fixtures (not live URLs) keep the tests hermetic — the
 * shapes mirror the official `eventsJson` and dissemination JSON-stat
 * responses verified live on 2026-08-05.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  EurostatCalendarProvider,
  normalizeJsonStatPeriod,
  normalizePeriod,
  previousPeriodLabel,
} from './eurostat-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-08-10T00:00:00.000Z');

const hicpFlash: CalendarIndicatorSource = {
  indicatorCode: 'EA_HICP_FLASH_YOY',
  provider: 'EUROSTAT',
  authority: 'Eurostat',
  nameZhHant: '歐元區消費者物價指數（快報，按年）',
  nameZhHans: '欧元区消费者物价指数（快报，按年）',
  nameEn: 'Euro area HICP flash estimate (YoY)',
  region: 'EA',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://ec.europa.eu/eurostat/web/main/news/euro-indicators',
  sourceUrl: 'https://ec.europa.eu/eurostat/web/hicp',
  eurostatTitle: 'Flash estimate inflation euro area',
  lang: 'en',
  enabled: true,
};

const gdpFlash: CalendarIndicatorSource = {
  ...hicpFlash,
  indicatorCode: 'EA_GDP_FLASH_QOQ',
  category: 'GROWTH',
  eurostatTitle: 'Flash estimate GDP and employment - EU and euro area',
};

/** Build an injectable fetch that returns the given JSON array once. */
const fetchReturning = (payload: unknown): typeof fetch =>
  vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(payload),
    }),
  ) as unknown as typeof fetch;

/**
 * Build an injectable fetch that serves the schedule (`eventsJson`) and the
 * dissemination data endpoint (`/statistics/1.0/data/<dataset>`) from a map.
 */
const fetchRouting = (schedule: unknown, dataByDataset: Record<string, unknown>): typeof fetch =>
  vi.fn((input: unknown) => {
    const url = String(input);
    const match = /\/statistics\/1\.0\/data\/([^?]+)/.exec(url);
    const payload = match ? dataByDataset[match[1] ?? ''] : schedule;
    if (payload === undefined) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(payload),
    });
  }) as unknown as typeof fetch;

/** A minimal JSON-stat envelope with a single (time-only) headline series. */
const jsonStat = (timeIndex: Record<string, number>, values: Record<string, number>): unknown => ({
  id: ['freq', 'unit', 'coicop18', 'geo', 'time'],
  size: [1, 1, 1, 1, Object.keys(timeIndex).length],
  dimension: { time: { category: { index: timeIndex } } },
  value: values,
});

describe('EurostatCalendarProvider.fetchEvents', () => {
  it('maps whitelisted titles to drafts with null values and normalised periods', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [hicpFlash, gdpFlash],
      now: () => NOW,
      fetchFn: fetchReturning([
        {
          title: 'Flash estimate inflation euro area',
          period: 'August 2026',
          start: '2026-08-19T09:00Z',
          datasetCodes: 'prc_hicp_fp,prc_hicp_manr',
        },
        {
          title: 'Flash estimate GDP and employment - EU and euro area',
          period: 'Q2/2026',
          start: '2026-08-14T09:00Z',
          datasetCodes: 'namq_10_gdp',
        },
        // Not whitelisted — must be ignored.
        {
          title: 'Some other Eurostat release',
          period: 'July 2026',
          start: '2026-08-20T09:00Z',
        },
      ]),
    });

    const drafts = await provider.fetchEvents();

    expect(drafts).toHaveLength(2);
    const hicp = drafts.find((d) => d.indicatorCode === 'EA_HICP_FLASH_YOY');
    expect(hicp).toMatchObject({
      periodLabel: '2026-08',
      previousValue: null,
      actualValue: null,
    });
    expect(hicp?.scheduledAt.toISOString()).toBe('2026-08-19T09:00:00.000Z');

    const gdp = drafts.find((d) => d.indicatorCode === 'EA_GDP_FLASH_QOQ');
    expect(gdp?.periodLabel).toBe('2026 Q2');
  });

  it('matches titles case-insensitively', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [hicpFlash],
      now: () => NOW,
      fetchFn: fetchReturning([
        {
          title: 'FLASH ESTIMATE INFLATION EURO AREA',
          period: 'August 2026',
          start: '2026-08-19T09:00Z',
        },
      ]),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.indicatorCode).toBe('EA_HICP_FLASH_YOY');
  });

  it('drops events outside the look-back / look-ahead window', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [hicpFlash],
      now: () => NOW,
      fetchFn: fetchReturning([
        // ~2 years in the future — outside the look-ahead.
        {
          title: 'Flash estimate inflation euro area',
          period: 'August 2028',
          start: '2028-08-19T09:00Z',
        },
      ]),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('isolates a malformed entry and keeps the good ones', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [hicpFlash],
      now: () => NOW,
      fetchFn: fetchReturning([
        { title: 12345, period: 'August 2026', start: '2026-08-19T09:00Z' },
        { title: 'Flash estimate inflation euro area', period: 'August 2026', start: 'not-a-date' },
        {
          title: 'Flash estimate inflation euro area',
          period: 'September 2026',
          start: '2026-09-19T09:00Z',
        },
      ]),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-09');
  });

  it('is inert when no EUROSTAT indicators are configured', async () => {
    const fetchFn = vi.fn();
    const provider = new EurostatCalendarProvider({
      indicators: [],
      now: () => NOW,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns empty on a fetch failure (whole-provider isolation)', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [hicpFlash],
      now: () => NOW,
      fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('backfills previous/actual from the dissemination series and leaves unpublished periods null', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [{ ...hicpFlash, eurostatDataset: 'prc_hicp_minr' }],
      now: () => NOW,
      fetchFn: fetchRouting(
        [
          // Released 2026-07-31 (in the look-back window): July figure exists.
          {
            title: 'Flash estimate inflation euro area',
            period: 'July 2026',
            start: '2026-07-31T09:00Z',
          },
          // Upcoming release: August not yet published, but July serves as its previous.
          {
            title: 'Flash estimate inflation euro area',
            period: 'August 2026',
            start: '2026-09-01T09:00Z',
          },
        ],
        {
          prc_hicp_minr: jsonStat(
            { '2026-05': 0, '2026-06': 1, '2026-07': 2, '2026-08': 3 },
            // 2026-08 (index 3) absent — the authority has not published it.
            { '0': 3.2, '1': 2.8, '2': 2.9 },
          ),
        },
      ),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(2);

    const july = drafts.find((d) => d.periodLabel === '2026-07');
    expect(july).toMatchObject({ previousValue: '2.8', actualValue: '2.9' });

    const august = drafts.find((d) => d.periodLabel === '2026-08');
    expect(august).toMatchObject({ previousValue: '2.9', actualValue: null });
  });

  it('backfills a quarterly series, joining "Qn/YYYY" schedule labels to "YYYY-Qn" data labels', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [
        {
          ...gdpFlash,
          eurostatDataset: 'namq_10_gdp',
        },
      ],
      now: () => NOW,
      fetchFn: fetchRouting(
        [
          {
            title: 'Flash estimate GDP and employment - EU and euro area',
            period: 'Q2/2026',
            start: '2026-08-14T09:00Z',
          },
        ],
        {
          namq_10_gdp: jsonStat({ '2026-Q1': 0, '2026-Q2': 1 }, { '0': 0, '1': 0.4 }),
        },
      ),
    });

    const [draft] = await provider.fetchEvents();
    expect(draft).toMatchObject({
      periodLabel: '2026 Q2',
      previousValue: '0',
      actualValue: '0.4',
    });
  });

  it('keeps values null when the data endpoint fails (per-indicator isolation)', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [{ ...hicpFlash, eurostatDataset: 'prc_hicp_minr' }],
      now: () => NOW,
      // No data payload registered → the data call returns 404.
      fetchFn: fetchRouting(
        [
          {
            title: 'Flash estimate inflation euro area',
            period: 'July 2026',
            start: '2026-07-31T09:00Z',
          },
        ],
        {},
      ),
    });

    const [draft] = await provider.fetchEvents();
    expect(draft).toMatchObject({ previousValue: null, actualValue: null });
  });

  it('rejects a series whose filters did not isolate one headline (rule 00 — never guess a figure)', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [{ ...hicpFlash, eurostatDataset: 'prc_hicp_minr' }],
      now: () => NOW,
      fetchFn: fetchRouting(
        [
          {
            title: 'Flash estimate inflation euro area',
            period: 'July 2026',
            start: '2026-07-31T09:00Z',
          },
        ],
        {
          prc_hicp_minr: {
            // Two geos came back — picking one could store the WRONG figure.
            id: ['freq', 'unit', 'coicop18', 'geo', 'time'],
            size: [1, 1, 1, 2, 2],
            dimension: { time: { category: { index: { '2026-06': 0, '2026-07': 1 } } } },
            value: { '0': 2.8, '1': 2.9, '2': 2.9, '3': 3.1 },
          },
        },
      ),
    });

    const [draft] = await provider.fetchEvents();
    expect(draft).toMatchObject({ previousValue: null, actualValue: null });
  });

  it('does not call the data endpoint for schedule-only indicators', async () => {
    const fetchFn = fetchRouting(
      [
        {
          title: 'Flash estimate inflation euro area',
          period: 'July 2026',
          start: '2026-07-31T09:00Z',
        },
      ],
      {},
    );
    const provider = new EurostatCalendarProvider({
      indicators: [hicpFlash], // no eurostatDataset
      now: () => NOW,
      fetchFn,
    });

    await provider.fetchEvents();
    expect(fetchFn).toHaveBeenCalledTimes(1); // the schedule call only
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const provider = new EurostatCalendarProvider({
      indicators: [hicpFlash],
      now: () => NOW,
      fetchFn: fetchReturning([
        {
          title: 'Flash estimate inflation euro area',
          period: 'August 2026',
          start: '2026-08-19T09:00Z',
        },
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

describe('normalizePeriod', () => {
  it('normalises month / quarter / year and falls back for the rest', () => {
    expect(normalizePeriod('July 2026')).toBe('2026-07');
    expect(normalizePeriod('  August 2026 ')).toBe('2026-08');
    expect(normalizePeriod('Q2/2026')).toBe('2026 Q2');
    expect(normalizePeriod('Q4 2026')).toBe('2026 Q4');
    expect(normalizePeriod('2026')).toBe('2026');
    expect(normalizePeriod('First half 2026')).toBe('First half 2026');
    expect(normalizePeriod('')).toBe('');
  });
});

describe('normalizeJsonStatPeriod', () => {
  it('aligns JSON-stat time labels to the shared period convention', () => {
    expect(normalizeJsonStatPeriod('2026-07')).toBe('2026-07');
    expect(normalizeJsonStatPeriod('2026-Q2')).toBe('2026 Q2');
    expect(normalizeJsonStatPeriod('2026')).toBe('2026');
  });
});

describe('previousPeriodLabel', () => {
  it('steps back one month / quarter, across year boundaries', () => {
    expect(previousPeriodLabel('2026-07')).toBe('2026-06');
    expect(previousPeriodLabel('2026-01')).toBe('2025-12');
    expect(previousPeriodLabel('2026 Q2')).toBe('2026 Q1');
    expect(previousPeriodLabel('2026 Q1')).toBe('2025 Q4');
  });

  it('returns null outside the month/quarter conventions', () => {
    expect(previousPeriodLabel('2026')).toBeNull();
    expect(previousPeriodLabel('First half 2026')).toBeNull();
  });
});
