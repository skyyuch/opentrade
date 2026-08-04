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
 *   - Values are always null (the ARC exposes no figures, D1)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - A dirty (non-ISO) date row is skipped; the good rows survive
 *   - A failed page fetch is isolated (yields nothing)
 *   - No configured indicators → inert (no fetch)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - RSC extraction (a brace inside a title cannot truncate it), date and
 *     period helpers
 *
 * Self-made HTML fixtures (not a live URL) keep the test hermetic — the shape
 * mirrors the official ARC page's embedded `{"arcData":{"data":[…]}}` RSC chunk.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  SgSingstatCalendarProvider,
  extractSingstatEntries,
  matchIndicator,
  normalizeSingstatPeriod,
  sgDateToUtc,
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
