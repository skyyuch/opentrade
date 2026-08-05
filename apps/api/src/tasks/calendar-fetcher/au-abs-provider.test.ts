/**
 * Unit tests for AuAbsCalendarProvider (ADR-0061 D2, batch 3; Q3-B value
 * backfill).
 *
 * Coverage:
 *   - Parses future-release rows and maps whitelisted product event-names
 *     (case-insensitive) to indicatorCodes, reading the UTC release time
 *     straight from the `<time datetime="…Z">` attribute and normalising the
 *     reference period; non-whitelisted names are ignored
 *   - Schedule-only indicators stay null (no `absDataflowId`, D1-honest)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - Malformed rows are isolated (one bad row can't drop the good ones)
 *   - No configured ABS indicators / a fetch failure → inert (empty)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - Row parsing + period normalisation helpers
 *   - Value backfill from the ABS Data API (Q3-B): verbatim figures, `round1`
 *     headline rounding, the end-month quarterly-label join (WPI), honest
 *     nulls for unpublished periods, per-series failure isolation, and the
 *     SDMX parsing / period helpers
 *
 * Self-made HTML + SDMX-JSON fixtures (not live URLs) keep the tests hermetic
 * — the shapes mirror the official `/release-calendar/future-releases` Drupal
 * View markup and the `data.api.abs.gov.au` SDMX-JSON payload.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  AuAbsCalendarProvider,
  absSeriesPeriod,
  absValueForPeriod,
  normalizeAbsPeriod,
  parseAbsSdmxSeries,
  parseFutureReleaseRows,
  shiftAbsPeriod,
} from './au-abs-provider.js';

import type { AbsSdmxResponse } from './au-abs-provider.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-08-01T00:00:00.000Z');

const cpi: CalendarIndicatorSource = {
  indicatorCode: 'AU_CPI',
  provider: 'ABS',
  authority: 'Australian Bureau of Statistics',
  nameZhHant: '澳洲消費者物價指數',
  nameZhHans: '澳洲消费者物价指数',
  nameEn: 'Australia Consumer Price Index',
  region: 'AU',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.abs.gov.au/release-calendar/future-releases',
  sourceUrl: 'https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation',
  absEventName: 'Consumer Price Index, Australia',
  lang: 'en',
  enabled: true,
};

const gdp: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'AU_GDP',
  category: 'GROWTH',
  absEventName: 'Australian National Accounts: National Income, Expenditure and Product',
};

/** Build one future-release row in the ABS Drupal View shape. */
function row(datetime: string, eventName: string, referencePeriod: string): string {
  return (
    `<div class="views-field-field-rs-release-date event-date"> <span> ` +
    `<time datetime="${datetime}" class="datetime">human readable</time> </span></div>` +
    `<div class="views-field views-field-field-rs-product-name">` +
    `<h3 class="field-content event-name"> ${eventName}</h3> ` +
    `<button class="event-export event-export-ics" type="button" value="ICS"></button></div>` +
    `<div class="views-field views-field-field-rs-reference-period"> ` +
    `<span class="reference-period-wrapper">Reference period ` +
    `<span class="reference-period-value">${referencePeriod}</span></span></div>`
  );
}

const page = (...rows: string[]): string =>
  `<html><body><div class="view-content">${rows.join('<div class="views-row">')}</div></body></html>`;

const fetchReturning = (html: string): typeof fetch =>
  vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(html) }),
  ) as unknown as typeof fetch;

describe('AuAbsCalendarProvider.fetchEvents', () => {
  it('maps whitelisted event-names to drafts with null values, UTC time and periods', async () => {
    const provider = new AuAbsCalendarProvider({
      indicators: [cpi, gdp],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(
          row('2026-08-26T01:30:00Z', 'Consumer Price Index, Australia', 'July 2026'),
          row(
            '2026-09-03T01:30:00Z',
            'Australian National Accounts: National Income, Expenditure and Product',
            'June Quarter 2026',
          ),
          // Not whitelisted — must be ignored.
          row('2026-08-05T01:30:00Z', 'Selected Living Cost Indexes, Australia', 'June 2026'),
        ),
      ),
    });

    const drafts = await provider.fetchEvents();

    expect(drafts).toHaveLength(2);
    const cpiDraft = drafts.find((d) => d.indicatorCode === 'AU_CPI');
    expect(cpiDraft).toMatchObject({
      periodLabel: '2026-07',
      previousValue: null,
      actualValue: null,
    });
    // Read straight from the datetime attribute — already UTC, no DST maths.
    expect(cpiDraft?.scheduledAt.toISOString()).toBe('2026-08-26T01:30:00.000Z');
    expect(drafts.find((d) => d.indicatorCode === 'AU_GDP')?.periodLabel).toBe('2026 Q2');
  });

  it('matches the event-name case-insensitively', async () => {
    const provider = new AuAbsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(row('2026-08-26T01:30:00Z', 'CONSUMER price INDEX, australia', 'July 2026')),
      ),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.indicatorCode).toBe('AU_CPI');
  });

  it('drops events outside the look-back / look-ahead window', async () => {
    const provider = new AuAbsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(row('2028-08-26T01:30:00Z', 'Consumer Price Index, Australia', 'July 2028')),
      ),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('isolates a malformed row and keeps the good ones', async () => {
    const provider = new AuAbsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(
          row('not-a-date', 'Consumer Price Index, Australia', 'July 2026'),
          row('2026-09-24T01:30:00Z', 'Consumer Price Index, Australia', 'August 2026'),
        ),
      ),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-08');
  });

  it('is inert when no ABS indicators are configured', async () => {
    const fetchFn = vi.fn();
    const provider = new AuAbsCalendarProvider({
      indicators: [],
      now: () => NOW,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns empty on a fetch failure (whole-provider isolation)', async () => {
    const provider = new AuAbsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const provider = new AuAbsCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(row('2026-08-26T01:30:00Z', 'Consumer Price Index, Australia', 'July 2026')),
      ),
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

describe('parseFutureReleaseRows', () => {
  it('extracts datetime, period-less event-name and reference period per row', () => {
    const rows = parseFutureReleaseRows(
      page(
        row('2026-08-06T01:30:00Z', 'International Trade in Goods', 'June 2026'),
        row('2026-08-20T01:30:00Z', 'Labour Force, Australia', 'July 2026'),
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      datetime: '2026-08-06T01:30:00Z',
      eventName: 'International Trade in Goods',
      referencePeriod: 'June 2026',
    });
    expect(rows[1]?.eventName).toBe('Labour Force, Australia');
  });

  it('returns no rows when the markup has no time anchors', () => {
    expect(parseFutureReleaseRows('<html><body>nothing</body></html>')).toEqual([]);
  });
});

describe('normalizeAbsPeriod', () => {
  it('normalises month / quarter / year and falls back for the rest', () => {
    expect(normalizeAbsPeriod('July 2026')).toBe('2026-07');
    expect(normalizeAbsPeriod('June Quarter 2026')).toBe('2026 Q2');
    expect(normalizeAbsPeriod('September Quarter 2026')).toBe('2026 Q3');
    expect(normalizeAbsPeriod('December Quarter 2026')).toBe('2026 Q4');
    expect(normalizeAbsPeriod('2024')).toBe('2024');
    expect(normalizeAbsPeriod('2025-26 financial year')).toBe('2025-26 financial year');
    expect(normalizeAbsPeriod('July 2022 - June 2026')).toBe('July 2022 - June 2026');
    expect(normalizeAbsPeriod('')).toBe('');
  });
});

// --- Q3-B value backfill ----------------------------------------------------

/** Build an ABS Data API SDMX-JSON payload for one fully-pinned series. */
function sdmx(observations: [period: string, value: number | null][]): AbsSdmxResponse {
  return {
    data: {
      dataSets: [
        {
          series: {
            '0:0:0:0:0': {
              observations: Object.fromEntries(observations.map(([, v], i) => [String(i), [v]])),
            },
          },
        },
      ],
      structures: [
        {
          dimensions: {
            observation: [{ id: 'TIME_PERIOD', values: observations.map(([p]) => ({ id: p })) }],
          },
        },
      ],
    },
  };
}

const cpiWithData: CalendarIndicatorSource = {
  ...cpi,
  absDataflowId: 'CPI',
  absSeriesKey: '3.10001.10.50.M',
};
const lfWithData: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'AU_LABOUR_FORCE',
  category: 'EMPLOYMENT',
  unit: '%',
  absEventName: 'Labour Force, Australia',
  absDataflowId: 'LF',
  absSeriesKey: 'M13.3.1599.20.AUS.M',
  absTransform: 'round1',
};
const wpiWithData: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'AU_WAGE_PRICE_INDEX',
  category: 'EMPLOYMENT',
  absEventName: 'Wage Price Index, Australia',
  absDataflowId: 'WPI',
  absSeriesKey: '3.THRPEB.7.TOT.20.AUS.Q',
};
const itgsWithData: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'AU_INTL_TRADE_GOODS',
  category: 'TRADE',
  unit: 'M AUD',
  absEventName: 'International Trade in Goods',
  absDataflowId: 'ITGS',
  absSeriesKey: 'M1.170.20.AUS.M',
};

/** Dispatch the ARC page and per-dataflow SDMX payloads by URL. */
function dispatchingFetch(
  html: string,
  tables: Record<string, AbsSdmxResponse | { status: number }>,
): typeof fetch {
  // The provider always passes a string URL.
  return vi.fn((input: string | URL) => {
    const url = String(input);
    if (url.includes('/release-calendar/')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
    }
    const match = Object.entries(tables).find(([flow]) => url.includes(`/rest/data/${flow}/`))?.[1];
    if (match && 'status' in match) {
      return Promise.resolve({ ok: false, status: match.status });
    }
    if (match) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(match) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  }) as unknown as typeof fetch;
}

describe('AuAbsCalendarProvider.fetchEvents — value backfill (Q3-B)', () => {
  it('backfills verbatim, round1 and end-month-quarterly figures onto the drafts', async () => {
    const html = page(
      // CPI June released 29 Jul — the figure is out; July is still pending.
      row('2026-07-29T01:30:00Z', 'Consumer Price Index, Australia', 'June 2026'),
      row('2026-08-26T01:30:00Z', 'Consumer Price Index, Australia', 'July 2026'),
      row('2026-07-16T01:30:00Z', 'Labour Force, Australia', 'June 2026'),
      // ABS labels this QUARTERLY release by its end month ("June 2026" = Q2).
      row('2026-08-19T01:30:00Z', 'Wage Price Index, Australia', 'June 2026'),
      row('2026-07-02T01:30:00Z', 'International Trade in Goods', 'May 2026'),
    );
    const provider = new AuAbsCalendarProvider({
      indicators: [cpiWithData, lfWithData, wpiWithData, itgsWithData],
      now: () => NOW,
      fetchFn: dispatchingFetch(html, {
        CPI: sdmx([
          ['2026-06', 3.8],
          ['2026-05', 4],
        ]),
        // The live LF series is unrounded; the release headline says 4.4%.
        LF: sdmx([
          ['2026-06', 4.42834371],
          ['2026-05', 4.37134808],
        ]),
        WPI: sdmx([
          ['2026-Q2', 3.4],
          ['2026-Q1', 3.3],
        ]),
        ITGS: sdmx([
          ['2026-05', -3018],
          ['2026-04', 1383],
        ]),
      }),
    });

    const drafts = await provider.fetchEvents();
    const byKey = new Map(drafts.map((d) => [`${d.indicatorCode}|${d.periodLabel}`, d]));

    // CPI June: official pre-computed YoY, verbatim.
    expect(byKey.get('AU_CPI|2026-06')).toMatchObject({ actualValue: '3.8', previousValue: '4' });
    // CPI July: not yet published — actual stays honestly null (D1) while the
    // previous-period figure (June, already out) is filled ahead of release.
    expect(byKey.get('AU_CPI|2026-07')).toMatchObject({
      actualValue: null,
      previousValue: '3.8',
    });
    // Labour Force: round1 reproduces the headline's one-decimal precision.
    expect(byKey.get('AU_LABOUR_FORCE|2026-06')).toMatchObject({
      actualValue: '4.4',
      previousValue: '4.4',
    });
    // WPI: the "June 2026" end-month label joins the quarterly series as Q2.
    expect(byKey.get('AU_WAGE_PRICE_INDEX|2026-06')).toMatchObject({
      actualValue: '3.4',
      previousValue: '3.3',
    });
    // Trade balance: verbatim $m level, negative kept as-is.
    expect(byKey.get('AU_INTL_TRADE_GOODS|2026-05')).toMatchObject({
      actualValue: '-3018',
      previousValue: '1383',
    });
  });

  it('keeps the schedule drafts when a data-API series fails (per-series isolation)', async () => {
    const html = page(
      row('2026-07-29T01:30:00Z', 'Consumer Price Index, Australia', 'June 2026'),
      row('2026-07-16T01:30:00Z', 'Labour Force, Australia', 'June 2026'),
    );
    const provider = new AuAbsCalendarProvider({
      indicators: [cpiWithData, lfWithData],
      now: () => NOW,
      fetchFn: dispatchingFetch(html, {
        CPI: { status: 503 },
        LF: sdmx([
          ['2026-06', 4.42834371],
          ['2026-05', 4.37134808],
        ]),
      }),
    });

    const drafts = await provider.fetchEvents();
    // The broken CPI series degrades to honest nulls; LF still fills.
    expect(drafts.find((d) => d.indicatorCode === 'AU_CPI')).toMatchObject({
      actualValue: null,
      previousValue: null,
    });
    expect(drafts.find((d) => d.indicatorCode === 'AU_LABOUR_FORCE')).toMatchObject({
      actualValue: '4.4',
    });
  });

  it('never calls the data API for schedule-only indicators', async () => {
    const html = page(row('2026-07-29T01:30:00Z', 'Consumer Price Index, Australia', 'June 2026'));
    const fetchFn = dispatchingFetch(html, {});
    const provider = new AuAbsCalendarProvider({
      indicators: [cpi], // No absDataflowId.
      now: () => NOW,
      fetchFn,
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ actualValue: null, previousValue: null });
    expect(fetchFn).toHaveBeenCalledTimes(1); // The calendar page only.
  });
});

describe('parseAbsSdmxSeries', () => {
  it('maps observation indices onto TIME_PERIOD ids and normalises quarters', () => {
    const series = parseAbsSdmxSeries(
      sdmx([
        ['2026-Q1', 0.3],
        ['2025-Q4', 0.9],
        ['2026-06', 3.8],
      ]),
    );
    expect(series.get('2026 Q1')).toBe('0.3');
    expect(series.get('2025 Q4')).toBe('0.9');
    expect(series.get('2026-06')).toBe('3.8');
  });

  it('skips null observations and tolerates a missing structure', () => {
    const series = parseAbsSdmxSeries(
      sdmx([
        ['2026-06', null],
        ['2026-05', 4],
      ]),
    );
    expect(series.has('2026-06')).toBe(false);
    expect(series.get('2026-05')).toBe('4');
    expect(parseAbsSdmxSeries({}).size).toBe(0);
  });
});

describe('absSeriesPeriod', () => {
  const quarterly = new Map([
    ['2026 Q2', '3.4'],
    ['2026 Q1', '3.3'],
  ]);
  const monthly = new Map([['2026-06', '3.8']]);

  it('passes a direct hit through and maps an end-month label onto its quarter', () => {
    expect(absSeriesPeriod('2026 Q2', quarterly)).toBe('2026 Q2');
    expect(absSeriesPeriod('2026-06', quarterly)).toBe('2026 Q2');
    expect(absSeriesPeriod('2026-03', quarterly)).toBe('2026 Q1');
    expect(absSeriesPeriod('2026-06', monthly)).toBe('2026-06');
  });

  it('leaves non-monthly labels for a quarterly series untouched', () => {
    expect(absSeriesPeriod('2026', quarterly)).toBe('2026');
  });
});

describe('absValueForPeriod', () => {
  const series = new Map([
    ['2026-06', '4.42834371'],
    ['2026-05', '-4.45'],
    ['2026-04', '4'],
  ]);

  it('returns figures verbatim without a transform', () => {
    expect(absValueForPeriod(series, '2026-06', undefined)).toBe('4.42834371');
    expect(absValueForPeriod(series, '2026-04', undefined)).toBe('4');
  });

  it('rounds half away from zero to one decimal with round1', () => {
    expect(absValueForPeriod(series, '2026-06', 'round1')).toBe('4.4');
    expect(absValueForPeriod(series, '2026-05', 'round1')).toBe('-4.5');
    expect(absValueForPeriod(series, '2026-04', 'round1')).toBe('4.0');
  });

  it('returns null for a missing observation', () => {
    expect(absValueForPeriod(series, '2026-07', 'round1')).toBeNull();
    expect(absValueForPeriod(series, '2026-07', undefined)).toBeNull();
  });
});

describe('shiftAbsPeriod', () => {
  it('shifts months and quarters across year boundaries', () => {
    expect(shiftAbsPeriod('2026-07', -1)).toBe('2026-06');
    expect(shiftAbsPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftAbsPeriod('2026 Q2', -1)).toBe('2026 Q1');
    expect(shiftAbsPeriod('2026 Q1', -1)).toBe('2025 Q4');
  });

  it('returns null for labels outside both conventions', () => {
    expect(shiftAbsPeriod('2026', -1)).toBeNull();
    expect(shiftAbsPeriod('2025-26 financial year', -1)).toBeNull();
  });
});
