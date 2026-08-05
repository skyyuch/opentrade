/**
 * Unit tests for SgSingstatCalendarProvider (ADR-0061 D2, batch 4).
 *
 * Coverage:
 *   - Extracts the ARC releases from the Next.js RSC payload
 *     (`self.__next_f.push([1,"…{\"arcData\":{\"data\":[…]}}…"])`) and maps a
 *     release to an indicator by an exact comma-terminated `singstatTitlePrefix`
 *     start-match; sibling series ("CPI By Household Income Group,", the fuller
 *     "GDP,") are cleanly excluded
 *   - `release_date` is anchored at 13:00 Singapore (SGT = UTC+8 → 05:00 UTC)
 *   - The title tail normalises to month ("YYYY-MM") / quarter ("YYYY Qn")
 *   - Schedule-only indicators stay null (no `singstatResourceId`, D1-honest)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - A dirty (non-ISO) date row is skipped; the good rows survive
 *   - A failed page fetch is isolated (yields nothing)
 *   - No configured indicators → inert (no fetch)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - RSC extraction (a brace inside a title cannot truncate it), date and
 *     period helpers
 *   - Value backfill from the Table Builder headline series (Q3-B): verbatim
 *     figures from the official pre-computed tables, locally-computed `pc1`
 *     YoY (monthly 12-back / quarterly 4-back) at the press releases' own
 *     one-decimal precision, previous = prior-period figure, unpublished
 *     periods honestly null (incl. the GDP advance-release late-fill), the
 *     `rowText` guard, and per-series failure isolation
 *
 * Self-made fixtures (not live URLs) keep the tests hermetic — shapes mirror
 * the official ARC page's embedded `{"arcData":{"data":[…]}}` RSC chunk and
 * the Table Builder `tabledata` JSON; the numeric fixtures use the real 2026
 * figures cross-checked against the official press releases (rule 00).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  SgSingstatCalendarProvider,
  extractSingstatEntries,
  matchIndicator,
  normalizeSingstatPeriod,
  parseSingstatTable,
  sgDateToUtc,
  shiftSingstatPeriod,
  singstatValueForPeriod,
} from './sg-singstat-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-08-15T00:00:00.000Z');

const cpi: CalendarIndicatorSource = {
  indicatorCode: 'SG_CPI',
  provider: 'SINGSTAT',
  authority: 'Department of Statistics Singapore',
  nameZhHant: '新加坡消費者物價指數',
  nameZhHans: '新加坡消费者物价指数',
  nameEn: 'Singapore Consumer Price Index (CPI)',
  region: 'SG',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.singstat.gov.sg/data-tools-services/advance-release-calendar',
  sourceUrl:
    'https://www.singstat.gov.sg/find-data/explore-data-themes/economy-prices/consumer-price-index/latest-news-data',
  singstatTitlePrefix: 'CPI For General Households,',
  lang: 'en',
  enabled: true,
};

const gdp: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'SG_GDP',
  category: 'GROWTH',
  singstatTitlePrefix: 'Advance Gross Domestic Product (GDP) Estimates,',
};

const unemployment: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'SG_UNEMPLOYMENT_RATE',
  category: 'EMPLOYMENT',
  unit: '%',
  singstatTitlePrefix: 'Unemployment Rate,',
};

type RawEntry = {
  id?: string;
  title: string;
  state?: string;
  description?: string;
  frequency?: string;
  release_date: string;
  subject?: string;
};

/** Wrap ARC entries in a page shell mirroring the real ARC page's RSC chunk. */
function pageWith(entries: RawEntry[]): string {
  const inner = `21:["$","$L29","node-0",${JSON.stringify({
    arcData: { themeFilter: ['Economy & Prices'], data: entries },
  })}]\n`;
  return [
    '<!DOCTYPE html><html><head><title>Advance Release Calendar</title></head><body>',
    '<script>self.__next_f.push([1,"1:HL[\\"/x.css\\"]\\n"])</script>',
    `<script>self.__next_f.push([1,${JSON.stringify(inner)}])</script>`,
    '<div id="__next"></div>',
    '</body></html>',
  ].join('\n');
}

function fetchReturning(html: string): typeof fetch {
  return vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(html) }),
  ) as unknown as typeof fetch;
}

describe('SgSingstatCalendarProvider.fetchEvents', () => {
  it('maps ARC titles to drafts with null values, SGT-anchored UTC time and periods', async () => {
    const html = pageWith([
      {
        title: 'CPI For General Households, Jul 2026',
        state: 'Upcoming',
        frequency: 'monthly',
        release_date: '2026-08-24',
        subject: 'Consumer Price Index',
      },
      // Sibling CPI series: must be EXCLUDED (different comma-terminated prefix).
      {
        title: 'CPI By Household Income Group, 2H 2026',
        state: 'Upcoming',
        frequency: 'half-yearly',
        release_date: '2026-08-24',
        subject: 'Consumer Price Index',
      },
      {
        title: 'Advance Gross Domestic Product (GDP) Estimates, 3Q 2026',
        state: 'Upcoming',
        description: 'Not Later Than',
        frequency: 'quarterly',
        release_date: '2026-10-14',
        subject: 'National Accounts',
      },
      // Sibling GDP series (the fuller release): must be EXCLUDED.
      {
        title: 'GDP, 3Q 2026',
        state: 'Upcoming',
        frequency: 'quarterly',
        release_date: '2026-11-25',
        subject: 'National Accounts',
      },
      {
        title: 'Unemployment Rate, 3Q 2026',
        state: 'Upcoming',
        description: 'To be released on 29 - 30 Oct',
        frequency: 'quarterly',
        release_date: '2026-10-29',
        subject: 'Labour, Employment, Wages and Productivity',
      },
      // Not a configured indicator — ignored.
      {
        title: 'Merchandise Trade, Jul 2026',
        state: 'Upcoming',
        frequency: 'monthly',
        release_date: '2026-08-17',
        subject: 'Merchandise Trade',
      },
    ]);

    const provider = new SgSingstatCalendarProvider({
      indicators: [cpi, gdp, unemployment],
      now: () => NOW,
      fetchFn: fetchReturning(html),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(3);

    const cpiDraft = drafts.find((d) => d.indicatorCode === 'SG_CPI');
    expect(cpiDraft).toMatchObject({
      periodLabel: '2026-07',
      previousValue: null,
      actualValue: null,
    });
    // 13:00 Singapore (SGT = UTC+8) on 2026-08-24 = 05:00 UTC the same day.
    expect(cpiDraft?.scheduledAt.toISOString()).toBe('2026-08-24T05:00:00.000Z');

    expect(drafts.find((d) => d.indicatorCode === 'SG_GDP')?.periodLabel).toBe('2026 Q3');
    expect(drafts.find((d) => d.indicatorCode === 'SG_UNEMPLOYMENT_RATE')?.periodLabel).toBe(
      '2026 Q3',
    );
  });

  it('matches the prefix case-insensitively and whitespace-collapsed', async () => {
    const html = pageWith([
      {
        title: 'cpi  for   general\nHOUSEHOLDS,  Aug 2026',
        state: 'Upcoming',
        release_date: '2026-09-23',
      },
    ]);
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(html),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ indicatorCode: 'SG_CPI', periodLabel: '2026-08' });
  });

  it('drops events outside the look-back / look-ahead window', async () => {
    const html = pageWith([
      {
        title: 'CPI For General Households, Apr 2027',
        state: 'Upcoming',
        release_date: '2027-05-24',
      },
    ]);
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(html),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('skips a dirty (non-ISO) date row and keeps the good ones', async () => {
    const html = pageWith([
      { title: 'CPI For General Households, Jul 2026', state: 'Upcoming', release_date: 'TBC' },
      {
        title: 'CPI For General Households, Aug 2026',
        state: 'Upcoming',
        release_date: '2026-09-23',
      },
    ]);
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(html),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-08');
  });

  it('isolates a failed page fetch', async () => {
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: vi.fn(() => Promise.resolve({ ok: false, status: 503 })) as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('is inert when no SingStat indicators are configured', async () => {
    const fetchFn = vi.fn();
    const provider = new SgSingstatCalendarProvider({
      indicators: [],
      now: () => NOW,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const html = pageWith([
      {
        title: 'CPI For General Households, Jul 2026',
        state: 'Upcoming',
        release_date: '2026-08-24',
      },
    ]);
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(html),
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

describe('SgSingstatCalendarProvider value backfill (Q3-B)', () => {
  // Real table ids + figures, cross-checked against the official press
  // releases (rule 00): CPI YoY M213781, unemployment M182342, retail index
  // M602121, quarterly GDP M014811.
  const cpiWithTable: CalendarIndicatorSource = {
    ...cpi,
    singstatResourceId: 'M213781',
    singstatRowText: 'All Items',
  };
  const retail: CalendarIndicatorSource = {
    ...cpi,
    indicatorCode: 'SG_RETAIL_SALES',
    category: 'OTHER',
    singstatTitlePrefix: 'Retail Sales and Food & Beverage Services Indices,',
    singstatResourceId: 'M602121',
    singstatRowText: 'Total',
    singstatTransform: 'pc1',
  };
  const unemploymentWithTable: CalendarIndicatorSource = {
    ...unemployment,
    singstatResourceId: 'M182342',
    singstatRowText: 'Total Unemployment Rate, (SA)',
  };
  const gdpWithTable: CalendarIndicatorSource = {
    ...gdp,
    singstatResourceId: 'M014811',
    singstatRowText: 'GDP In Chained (2015) Dollars',
    singstatTransform: 'pc1',
  };

  const scheduleHtml = pageWith([
    { title: 'CPI For General Households, Jun 2026', release_date: '2026-07-23' },
    {
      title: 'Retail Sales and Food & Beverage Services Indices, Jun 2026',
      release_date: '2026-08-05',
    },
    { title: 'Unemployment Rate, 2Q 2026', release_date: '2026-07-30' },
    {
      title: 'Advance Gross Domestic Product (GDP) Estimates, 2Q 2026',
      release_date: '2026-07-14',
    },
  ]);

  const table = (rowText: string, points: [string, string][]) => ({
    Data: {
      title: 'fixture',
      row: [{ seriesNo: '1', rowText, columns: points.map(([key, value]) => ({ key, value })) }],
    },
  });

  const tables: Record<string, unknown> = {
    M213781: table('All Items', [
      ['2026 Jun', '1.9'],
      ['2026 May', '1.8'],
    ]),
    M602121: table('Total', [
      ['2026 Jun', '97.276'],
      ['2026 May', '102.23'],
      ['2025 Jun', '93.525'],
      ['2025 May', '99.366'],
    ]),
    M182342: table('Total Unemployment Rate, (SA)', [
      ['2026 2Q', '2'],
      ['2026 1Q', '2'],
    ]),
    // The quarterly GDP table lags the advance release: 2026 2Q is absent.
    M014811: table('GDP In Chained (2015) Dollars', [
      ['2026 1Q', '151280.4'],
      ['2025 4Q', '154606.6'],
      ['2025 1Q', '142732.2'],
      ['2024 4Q', '146252.1'],
    ]),
  };

  /** Dispatches the ARC page GET vs the Table Builder GETs like the live endpoints. */
  const dispatchingFetch = (tablesByld: Record<string, unknown>, tablesOk = true): typeof fetch =>
    vi.fn((url: string) => {
      const m = /tabledata\/(\w+)\?/.exec(String(url));
      if (!m) return Promise.resolve({ ok: true, text: () => Promise.resolve(scheduleHtml) });
      return Promise.resolve({
        ok: tablesOk,
        status: tablesOk ? 200 : 503,
        json: () => Promise.resolve(tablesByld[m[1] ?? ''] ?? {}),
      });
    }) as unknown as typeof fetch;

  it('backfills official YoY tables, verbatim levels and computed pc1 figures', async () => {
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpiWithTable, retail, unemploymentWithTable, gdpWithTable],
      now: () => NOW,
      fetchFn: dispatchingFetch(tables),
    });

    const drafts = await provider.fetchEvents();

    // CPI: the authority's own pre-computed YoY strings, verbatim.
    expect(drafts.find((d) => d.indicatorCode === 'SG_CPI')).toMatchObject({
      periodLabel: '2026-06',
      actualValue: '1.9',
      previousValue: '1.8',
    });
    // Retail (pc1, monthly): 97.276/93.525 → 4.0; May 102.23/99.366 → 2.9.
    expect(drafts.find((d) => d.indicatorCode === 'SG_RETAIL_SALES')).toMatchObject({
      actualValue: '4.0',
      previousValue: '2.9',
    });
    // Unemployment: verbatim (SingStat trims "2.0" to "2").
    expect(drafts.find((d) => d.indicatorCode === 'SG_UNEMPLOYMENT_RATE')).toMatchObject({
      periodLabel: '2026 Q2',
      actualValue: '2',
      previousValue: '2',
    });
    // GDP (pc1, quarterly, late fill): 2026 Q2 not yet in the table → null;
    // previous quarter 151280.4/142732.2 → 6.0 (the Economic Survey figure).
    expect(drafts.find((d) => d.indicatorCode === 'SG_GDP')).toMatchObject({
      periodLabel: '2026 Q2',
      actualValue: null,
      previousValue: '6.0',
    });
  });

  it('skips the backfill on a rowText guard mismatch (honest nulls, rule 00)', async () => {
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpiWithTable],
      now: () => NOW,
      fetchFn: dispatchingFetch({ M213781: table('Food', [['2026 Jun', '2.1']]) }),
    });

    const [draft] = await provider.fetchEvents();
    expect(draft).toMatchObject({ actualValue: null, previousValue: null });
  });

  it('keeps the schedule drafts (null values) when the Table Builder call fails', async () => {
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpiWithTable],
      now: () => NOW,
      fetchFn: dispatchingFetch({}, false),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ actualValue: null, previousValue: null });
  });

  it('does not call the Table Builder at all for schedule-only indicators', async () => {
    const fetchFn = dispatchingFetch(tables);
    const provider = new SgSingstatCalendarProvider({
      indicators: [cpi], // No singstatResourceId.
      now: () => NOW,
      fetchFn,
    });

    await provider.fetchEvents();
    const urls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(urls.some((u) => u.includes('tabledata'))).toBe(false);
  });
});

describe('parseSingstatTable + singstatValueForPeriod + shiftSingstatPeriod', () => {
  it('normalises monthly and quarterly keys and keeps values verbatim', () => {
    const series = parseSingstatTable(
      {
        Data: {
          row: [
            {
              rowText: 'All Items',
              columns: [
                { key: '2026 Jun', value: '1.9' },
                { key: '2026 2Q', value: '2' },
                { key: '2026 Jul', value: '' }, // Not yet published.
                { key: 'na', value: '1' }, // Malformed key.
              ],
            },
          ],
        },
      },
      'All Items',
    );
    expect(series.get('2026-06')).toBe('1.9');
    expect(series.get('2026 Q2')).toBe('2');
    expect(series.size).toBe(2);
  });

  it('throws when series 1 rowText does not match the guard', () => {
    expect(() =>
      parseSingstatTable({ Data: { row: [{ rowText: 'Food', columns: [] }] } }, 'All Items'),
    ).toThrow();
    expect(() => parseSingstatTable({ Data: { row: [] } }, 'All Items')).toThrow();
  });

  it('computes pc1 across 12 months or 4 quarters, half away from zero', () => {
    const monthly = new Map([
      ['2026-06', '97.276'],
      ['2025-06', '93.525'],
    ]);
    expect(singstatValueForPeriod(monthly, '2026-06', 'pc1')).toBe('4.0');
    const quarterly = new Map([
      ['2026 Q1', '151280.4'],
      ['2025 Q1', '142732.2'],
    ]);
    expect(singstatValueForPeriod(quarterly, '2026 Q1', 'pc1')).toBe('6.0');
    // Missing base observation → honest null.
    expect(singstatValueForPeriod(monthly, '2026-06', undefined)).toBe('97.276');
    expect(singstatValueForPeriod(new Map([['2026-06', '1']]), '2026-06', 'pc1')).toBeNull();
  });

  it('shifts periods across year boundaries in both conventions', () => {
    expect(shiftSingstatPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftSingstatPeriod('2026-06', -12)).toBe('2025-06');
    expect(shiftSingstatPeriod('2026 Q1', -1)).toBe('2025 Q4');
    expect(shiftSingstatPeriod('2026 Q2', -4)).toBe('2025 Q2');
    expect(shiftSingstatPeriod('2H 2026', -1)).toBeNull();
  });
});

describe('extractSingstatEntries', () => {
  it('parses the RSC-embedded arcData and reads {title, release_date}', () => {
    const html = pageWith([
      {
        title: 'CPI For General Households, Aug 2026',
        state: 'Upcoming',
        release_date: '2026-09-23',
        subject: 'Consumer Price Index',
      },
    ]);
    expect(extractSingstatEntries(html)).toEqual([
      { title: 'CPI For General Households, Aug 2026', releaseDate: '2026-09-23' },
    ]);
  });

  it('is not truncated by a brace inside a title, and skips shapeless rows', () => {
    const html = pageWith([
      { title: 'Weird {brace} title, Aug 2026', release_date: '2026-09-23' },
      // Missing release_date — skipped.
      { title: 'CPI For General Households, Aug 2026', release_date: '' },
    ] as RawEntry[]);
    expect(extractSingstatEntries(html)).toEqual([
      { title: 'Weird {brace} title, Aug 2026', releaseDate: '2026-09-23' },
    ]);
  });

  it('returns [] when the marker or arcData is absent', () => {
    expect(extractSingstatEntries('<html>no calendar here</html>')).toEqual([]);
    expect(
      extractSingstatEntries('<script>self.__next_f.push([1,"9:[\\"no-arc-here\\"]\\n"])</script>'),
    ).toEqual([]);
  });
});

describe('matchIndicator', () => {
  const matchers = [
    { indicatorCode: 'SG_GDP', prefix: 'advance gross domestic product (gdp) estimates,' },
    { indicatorCode: 'SG_CPI', prefix: 'cpi for general households,' },
  ];

  it('matches on the comma-terminated prefix and excludes sibling series', () => {
    expect(matchIndicator('CPI For General Households, Jul 2026', matchers)).toBe('SG_CPI');
    // Sibling series with a different prefix must not match.
    expect(matchIndicator('CPI By Household Income Group, 2H 2026', matchers)).toBeNull();
    expect(
      matchIndicator('Advance Gross Domestic Product (GDP) Estimates, 3Q 2026', matchers),
    ).toBe('SG_GDP');
    // The fuller "GDP," release is not the advance estimate.
    expect(matchIndicator('GDP, 3Q 2026', matchers)).toBeNull();
  });
});

describe('sgDateToUtc', () => {
  it('anchors a strict-ISO date at 13:00 Singapore = 05:00 UTC (no DST)', () => {
    expect(sgDateToUtc('2026-08-24')?.toISOString()).toBe('2026-08-24T05:00:00.000Z');
    expect(sgDateToUtc('2026-01-05')?.toISOString()).toBe('2026-01-05T05:00:00.000Z');
  });

  it('returns null for a non-ISO / invalid date', () => {
    expect(sgDateToUtc('TBC')).toBeNull();
    expect(sgDateToUtc('24/08/2026')).toBeNull();
    expect(sgDateToUtc('2026-13-40')).toBeNull();
  });
});

describe('normalizeSingstatPeriod', () => {
  it('resolves a monthly tail to YYYY-MM', () => {
    expect(normalizeSingstatPeriod('CPI For General Households, Jul 2026')).toBe('2026-07');
    expect(normalizeSingstatPeriod('Merchandise Trade, Jan 2027')).toBe('2027-01');
  });

  it('resolves a quarterly tail (nQ YYYY) to YYYY Qn', () => {
    expect(normalizeSingstatPeriod('Advance Gross Domestic Product (GDP) Estimates, 3Q 2026')).toBe(
      '2026 Q3',
    );
    expect(normalizeSingstatPeriod('Unemployment Rate, 1Q 2027')).toBe('2027 Q1');
  });

  it('returns null when no month/quarter or no year is present', () => {
    expect(normalizeSingstatPeriod('CPI By Household Income Group, 2H 2026')).toBeNull();
    expect(normalizeSingstatPeriod('Some annual roll-up')).toBeNull();
  });
});
