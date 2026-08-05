/**
 * Unit tests for CaStatCanCalendarProvider (ADR-0061 D2, batch 2; Q3-B value
 * backfill).
 *
 * Coverage:
 *   - Maps whitelisted release titles (case-insensitive) to indicatorCodes,
 *     builds the 08:30 Eastern release time in UTC, and normalises the period;
 *     non-whitelisted titles are ignored
 *   - Schedule-only indicators stay null (no `statcanVectorId`, D1-honest)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - Malformed entries are isolated (one bad row can't drop the good ones)
 *   - No configured STATCAN indicators / a fetch failure → inert (empty)
 *   - DST-aware Eastern → UTC conversion + period normalisation
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - Value backfill from the WDS vectors: verbatim levels at the series' own
 *     precision, locally-computed standard `pc1` / `pch` percent changes at
 *     The Daily's one-decimal precision, previous = prior-period figure,
 *     unpublished periods honestly null, per-vector failure isolation, and a
 *     WDS outage never dropping the schedule drafts
 *
 * Self-made JSON fixtures (not live URLs) keep the tests hermetic — shapes
 * mirror the official `schedule-key_indicators-eng.json` and WDS
 * `getDataFromVectorsAndLatestNPeriods` responses; the numeric fixtures use
 * the real 2026 figures cross-checked against The Daily (rule 00).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  CaStatCanCalendarProvider,
  easternIsDst,
  normalizeStatCanPeriod,
  parseDailyRelease,
  parseWdsResults,
  shiftMonthLabel,
  valueForPeriod,
} from './ca-statcan-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-08-01T00:00:00.000Z');

const cpi: CalendarIndicatorSource = {
  indicatorCode: 'CA_CPI_YOY',
  provider: 'STATCAN',
  authority: 'Statistics Canada',
  nameZhHant: '加拿大消費者物價指數（按年）',
  nameZhHans: '加拿大消费者物价指数（按年）',
  nameEn: 'Canada Consumer Price Index (YoY)',
  region: 'CA',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-eng.htm',
  sourceUrl: 'https://www.statcan.gc.ca/en/subjects-start/prices_and_price_indexes',
  statcanTitle: 'Consumer Price Index',
  lang: 'en',
  enabled: true,
};

const gdp: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'CA_GDP_MONTHLY',
  category: 'GROWTH',
  statcanTitle: 'Gross domestic product by industry',
};

const fetchReturning = (payload: unknown): typeof fetch =>
  vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }),
  ) as unknown as typeof fetch;

describe('CaStatCanCalendarProvider.fetchEvents', () => {
  it('maps whitelisted titles to drafts with null values, EDT time and periods', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpi, gdp],
      now: () => NOW,
      fetchFn: fetchReturning([
        {
          date: '2026-08-19 00:00:01',
          type: 'meeting',
          title: 'Consumer Price Index',
          description: 'July 2026',
        },
        {
          date: '2026-08-29 00:00:01',
          type: 'meeting',
          title: 'Gross domestic product by industry',
          description: 'Second quarter 2026',
        },
        // Not whitelisted — must be ignored.
        {
          date: '2026-08-20 00:00:01',
          type: 'meeting',
          title: 'Wholesale trade',
          description: 'June 2026',
        },
      ]),
    });

    const drafts = await provider.fetchEvents();

    expect(drafts).toHaveLength(2);
    const cpiDraft = drafts.find((d) => d.indicatorCode === 'CA_CPI_YOY');
    expect(cpiDraft).toMatchObject({
      periodLabel: '2026-07',
      previousValue: null,
      actualValue: null,
    });
    // August is EDT (UTC-4): 08:30 ET → 12:30 UTC.
    expect(cpiDraft?.scheduledAt.toISOString()).toBe('2026-08-19T12:30:00.000Z');
    expect(drafts.find((d) => d.indicatorCode === 'CA_GDP_MONTHLY')?.periodLabel).toBe('2026 Q2');
  });

  it('drops events outside the look-back / look-ahead window', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning([
        {
          date: '2028-08-19 00:00:01',
          type: 'meeting',
          title: 'Consumer Price Index',
          description: 'July 2028',
        },
      ]),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('isolates a malformed entry and keeps the good ones', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning([
        { date: 12345, title: 'Consumer Price Index', description: 'July 2026' },
        { date: 'not-a-date', title: 'Consumer Price Index', description: 'July 2026' },
        { date: '2026-09-16 00:00:01', title: 'Consumer Price Index', description: 'August 2026' },
      ]),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-08');
  });

  it('is inert when no STATCAN indicators are configured', async () => {
    const fetchFn = vi.fn();
    const provider = new CaStatCanCalendarProvider({
      indicators: [],
      now: () => NOW,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns empty on a fetch failure (whole-provider isolation)', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning([
        { date: '2026-08-19 00:00:01', title: 'Consumer Price Index', description: 'July 2026' },
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

describe('CaStatCanCalendarProvider value backfill (Q3-B)', () => {
  // Real vectors + figures, cross-checked against The Daily (rule 00):
  // CPI all-items NSA index v41690973; unemployment rate v2062815.
  const cpiWithVector: CalendarIndicatorSource = {
    ...cpi,
    statcanVectorId: 41690973,
    statcanTransform: 'pc1',
  };
  const lfs: CalendarIndicatorSource = {
    ...cpi,
    indicatorCode: 'CA_LABOUR_FORCE_SURVEY',
    category: 'EMPLOYMENT',
    unit: '%',
    statcanTitle: 'Labour Force Survey',
    statcanVectorId: 2062815,
  };
  const gdpWithVector: CalendarIndicatorSource = {
    ...gdp,
    unit: '%_MOM',
    statcanVectorId: 65201210,
    statcanTransform: 'pch',
  };

  const schedulePayload = [
    { date: '2026-07-20 00:00:01', title: 'Consumer Price Index', description: 'June 2026' },
    { date: '2026-07-10 00:00:01', title: 'Labour Force Survey', description: 'June 2026' },
    {
      date: '2026-07-31 00:00:01',
      title: 'Gross domestic product by industry',
      description: 'May 2026',
    },
  ];

  const wdsSuccess = (vectorId: number, points: [string, number, number][]) => ({
    status: 'SUCCESS',
    object: {
      vectorId,
      vectorDataPoint: points.map(([refPer, value, decimals]) => ({
        refPer,
        value,
        decimals,
        scalarFactorCode: 0,
      })),
    },
  });

  const cpiPoints: [string, number, number][] = [
    ['2025-05-01', 164.3, 1],
    ['2025-06-01', 164.4, 1],
    ['2026-05-01', 169.6, 1],
    ['2026-06-01', 169.0, 1],
  ];
  const lfsPoints: [string, number, number][] = [
    ['2026-05-01', 6.6, 1],
    ['2026-06-01', 6.5, 1],
  ];
  const gdpPoints: [string, number, number][] = [
    ['2026-03-01', 2340869, 0],
    ['2026-04-01', 2354483, 0],
    ['2026-05-01', 2362482, 0],
  ];

  /** Dispatches the schedule GET vs the WDS POST like the live endpoints. */
  const dispatchingFetch = (wdsPayload: unknown, wdsOk = true): typeof fetch =>
    vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes('/t1/wds/')
          ? { ok: wdsOk, status: wdsOk ? 200 : 503, json: () => Promise.resolve(wdsPayload) }
          : { ok: true, json: () => Promise.resolve(schedulePayload) },
      ),
    ) as unknown as typeof fetch;

  it('backfills verbatim levels, computed pc1/pch, and previous-period figures', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpiWithVector, lfs, gdpWithVector],
      now: () => NOW,
      fetchFn: dispatchingFetch([
        wdsSuccess(41690973, cpiPoints),
        wdsSuccess(2062815, lfsPoints),
        wdsSuccess(65201210, gdpPoints),
      ]),
    });

    const drafts = await provider.fetchEvents();

    // CPI YoY (pc1): 169.0/164.4 → 2.8; previous month 169.6/164.3 → 3.2.
    expect(drafts.find((d) => d.indicatorCode === 'CA_CPI_YOY')).toMatchObject({
      periodLabel: '2026-06',
      actualValue: '2.8',
      previousValue: '3.2',
    });
    // Unemployment rate: verbatim level at the series' own precision.
    expect(drafts.find((d) => d.indicatorCode === 'CA_LABOUR_FORCE_SURVEY')).toMatchObject({
      actualValue: '6.5',
      previousValue: '6.6',
    });
    // GDP MoM (pch): 2362482/2354483 → 0.3; previous 2354483/2340869 → 0.6.
    expect(drafts.find((d) => d.indicatorCode === 'CA_GDP_MONTHLY')).toMatchObject({
      periodLabel: '2026-05',
      actualValue: '0.3',
      previousValue: '0.6',
    });
  });

  it('keeps unpublished periods honestly null (no observation yet)', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [lfs],
      now: () => NOW,
      // Series ends at May — the June draft must stay null on actual.
      fetchFn: dispatchingFetch([wdsSuccess(2062815, [['2026-05-01', 6.6, 1]])]),
    });

    const [draft] = await provider.fetchEvents();
    expect(draft).toMatchObject({
      periodLabel: '2026-06',
      actualValue: null,
      previousValue: '6.6',
    });
  });

  it('isolates a per-vector failure and still backfills the others', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpiWithVector, lfs],
      now: () => NOW,
      fetchFn: dispatchingFetch([
        { status: 'FAILED', object: { responseStatusCode: 1 } },
        wdsSuccess(2062815, lfsPoints),
      ]),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts.find((d) => d.indicatorCode === 'CA_CPI_YOY')).toMatchObject({
      actualValue: null,
      previousValue: null,
    });
    expect(drafts.find((d) => d.indicatorCode === 'CA_LABOUR_FORCE_SURVEY')).toMatchObject({
      actualValue: '6.5',
    });
  });

  it('keeps the schedule drafts (null values) when the WDS call fails', async () => {
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpiWithVector],
      now: () => NOW,
      fetchFn: dispatchingFetch(null, false),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ actualValue: null, previousValue: null });
  });

  it('does not call the WDS at all for schedule-only indicators', async () => {
    const fetchFn = dispatchingFetch([]);
    const provider = new CaStatCanCalendarProvider({
      indicators: [cpi], // No statcanVectorId.
      now: () => NOW,
      fetchFn,
    });

    await provider.fetchEvents();
    const urls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(urls.some((u) => u.includes('/t1/wds/'))).toBe(false);
  });
});

describe('valueForPeriod + parseWdsResults + shiftMonthLabel', () => {
  const series = new Map([
    ['2026-05', { value: 100, decimals: 0 }],
    ['2026-06', { value: 100.26, decimals: 2 }],
    ['2026-07', { value: 99.48, decimals: 2 }],
  ]);

  it('rounds percent changes to one decimal, symmetrically for negatives', () => {
    // +0.26% → 0.3; June→July -0.778…% → -0.8 (sign-symmetric rounding).
    expect(valueForPeriod(series, '2026-06', 'pch')).toBe('0.3');
    expect(valueForPeriod(series, '2026-07', 'pch')).toBe('-0.8');
  });

  it('renders an unchanged level as 0.0 and keeps trailing zeros on levels', () => {
    const flat = new Map([
      ['2026-05', { value: 7, decimals: 1 }],
      ['2026-06', { value: 7, decimals: 1 }],
    ]);
    expect(valueForPeriod(flat, '2026-06', 'pch')).toBe('0.0');
    expect(valueForPeriod(flat, '2026-06', undefined)).toBe('7.0');
  });

  it('returns null for missing observations, zero bases and non-monthly labels', () => {
    expect(valueForPeriod(series, '2026-08', undefined)).toBeNull();
    expect(valueForPeriod(series, '2026-06', 'pc1')).toBeNull(); // No 2025-06.
    const zeroBase = new Map([
      ['2026-05', { value: 0, decimals: 0 }],
      ['2026-06', { value: 1, decimals: 0 }],
    ]);
    expect(valueForPeriod(zeroBase, '2026-06', 'pch')).toBeNull();
    expect(valueForPeriod(series, '2026 Q2', 'pch')).toBeNull();
  });

  it('parses WDS results per vector and skips malformed data points', () => {
    const parsed = parseWdsResults([
      {
        status: 'SUCCESS',
        object: {
          vectorId: 42,
          vectorDataPoint: [
            { refPer: '2026-06-01', value: 6.5, decimals: 1 },
            { refPer: '2026-07-01', value: null, decimals: 1 }, // Suppressed.
            { refPer: 'nope', value: 1, decimals: 0 }, // Malformed.
          ],
        },
      },
      { status: 'FAILED' },
    ]);
    expect(parsed.get(42)?.get('2026-06')).toEqual({ value: 6.5, decimals: 1 });
    expect(parsed.get(42)?.has('2026-07')).toBe(false);
    expect(parsed.size).toBe(1);
  });

  it('shifts month labels across year boundaries and rejects non-months', () => {
    expect(shiftMonthLabel('2026-01', -12)).toBe('2025-01');
    expect(shiftMonthLabel('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthLabel('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthLabel('2026 Q2', -1)).toBeNull();
  });
});

describe('parseDailyRelease + easternIsDst', () => {
  it('converts 08:30 Eastern to UTC with DST awareness', () => {
    // Summer (EDT, UTC-4) → 12:30 UTC.
    expect(parseDailyRelease('2026-08-19 00:00:01')?.toISOString()).toBe(
      '2026-08-19T12:30:00.000Z',
    );
    // Winter (EST, UTC-5) → 13:30 UTC.
    expect(parseDailyRelease('2026-01-20 00:00:01')?.toISOString()).toBe(
      '2026-01-20T13:30:00.000Z',
    );
    expect(parseDailyRelease('nope')).toBeNull();
  });

  it('applies the March/November DST transitions', () => {
    // 2026: DST starts Sun Mar 8, ends Sun Nov 1.
    expect(easternIsDst(2026, 3, 7)).toBe(false);
    expect(easternIsDst(2026, 3, 8)).toBe(true);
    expect(easternIsDst(2026, 10, 31)).toBe(true);
    expect(easternIsDst(2026, 11, 1)).toBe(false);
  });
});

describe('normalizeStatCanPeriod', () => {
  it('normalises month / quarter / year and falls back for the rest', () => {
    expect(normalizeStatCanPeriod('July 2026')).toBe('2026-07');
    expect(normalizeStatCanPeriod('Second quarter 2026')).toBe('2026 Q2');
    expect(normalizeStatCanPeriod('Fourth quarter 2026')).toBe('2026 Q4');
    expect(normalizeStatCanPeriod('2026')).toBe('2026');
    expect(normalizeStatCanPeriod('Week ending 24 July 2026')).toBe('Week ending 24 July 2026');
    expect(normalizeStatCanPeriod('')).toBe('');
  });
});
