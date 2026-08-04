/**
 * Unit tests for VnGsoCalendarProvider (ADR-0061 D2, batch 4).
 *
 * Coverage:
 *   - Extracts the embedded `var events=[…]` ARC array and maps a release to an
 *     indicator by `gsoNameIncludes` / `gsoNameExcludes` (case-insensitive,
 *     whitespace-collapsed); sibling lines (GDP "growth rate",
 *     "underemployment rate") are cleanly excluded
 *   - Date-only ARC dates are anchored at 09:00 Hanoi (ICT = UTC+7 → 02:00 UTC)
 *   - The leading period phrase normalises to month / quarter (first token wins)
 *   - Values are always null (the ARC exposes no figures, D1)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - A dirty (non-ISO) date row is skipped; the good rows survive
 *   - A failed page fetch is isolated (yields nothing)
 *   - No configured indicators → inert (no fetch)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - Array extraction (a `]` inside a title cannot truncate it), date and
 *     period helpers
 *
 * Self-made HTML fixtures (not a live URL) keep the test hermetic — the shape
 * mirrors the official release-calendar page's embedded `var events=[…]` JSON.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  VnGsoCalendarProvider,
  extractGsoEvents,
  matchIndicator,
  normalizeVnPeriod,
  vnDateToUtc,
} from './vn-gso-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-08-15T00:00:00.000Z');

const cpi: CalendarIndicatorSource = {
  indicatorCode: 'VN_CPI',
  provider: 'GSO',
  authority: 'General Statistics Office of Viet Nam',
  nameZhHant: '越南消費者物價指數',
  nameZhHans: '越南消费者物价指数',
  nameEn: 'Vietnam Consumer Price Index (CPI)',
  region: 'VN',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.nso.gov.vn/en/release-calendar-3/',
  sourceUrl: 'https://www.nso.gov.vn/en/press-room/',
  gsoNameIncludes: ['consumer price index (cpi)'],
  lang: 'en',
  enabled: true,
};

const gdp: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'VN_GDP',
  category: 'GROWTH',
  gsoNameIncludes: ['gross domestic product (gdp)'],
  gsoNameExcludes: ['growth rate', 'per capita', 'structure'],
};

const unemployment: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'VN_UNEMPLOYMENT_RATE',
  category: 'EMPLOYMENT',
  unit: '%',
  gsoNameIncludes: ['unemployment rate'],
  gsoNameExcludes: ['underemployment'],
};

type RawEvent = { title: string; status?: string; date: string; format?: string };

/** Wrap an events array in a page shell mirroring the real ARC page. */
function pageWith(events: RawEvent[]): string {
  return [
    '<!DOCTYPE html><html><head><title>Release calendar</title></head><body>',
    '<script type="text/javascript">',
    `var lang='en'; var events=${JSON.stringify(events)};`,
    '</script>',
    '<div class="calendar-events-list"></div>',
    '</body></html>',
  ].join('\n');
}

function fetchReturning(html: string): typeof fetch {
  return vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(html) }),
  ) as unknown as typeof fetch;
}

describe('VnGsoCalendarProvider.fetchEvents', () => {
  it('maps ARC titles to drafts with null values, ICT-anchored UTC time and periods', async () => {
    const html = pageWith([
      {
        title:
          'The July and 7 months 2026 consumer price index (CPI), gold price index, USD price index',
        status: 'Official',
        date: '2026-08-03',
      },
      {
        title: 'The second quarter and 6 months 2026 gross domestic product (GDP)',
        status: 'Estimate',
        date: '2026-07-03',
      },
      // Sibling GDP line: must be EXCLUDED by 'growth rate'.
      {
        title: 'The second quarter and 6 months 2026 gross domestic product growth rate',
        status: 'Estimate',
        date: '2026-07-03',
      },
      {
        title: 'The second quarter and 6 months 2026 unemployment rate',
        status: 'Estimate',
        date: '2026-07-03',
      },
      // Sibling employment line: must be EXCLUDED by 'underemployment'.
      {
        title: 'The second quarter and 6 months 2026 underemployment rate',
        status: 'Estimate',
        date: '2026-07-03',
      },
      // Not a configured indicator — ignored.
      {
        title: 'The July and 7 months 2026 turnover of travelling',
        status: 'Estimate',
        date: '2026-08-03',
      },
    ]);

    const provider = new VnGsoCalendarProvider({
      indicators: [cpi, gdp, unemployment],
      now: () => NOW,
      fetchFn: fetchReturning(html),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(3);

    const cpiDraft = drafts.find((d) => d.indicatorCode === 'VN_CPI');
    expect(cpiDraft).toMatchObject({
      periodLabel: '2026-07',
      previousValue: null,
      actualValue: null,
    });
    // 09:00 Hanoi (ICT = UTC+7) on 2026-08-03 = 02:00 UTC the same day.
    expect(cpiDraft?.scheduledAt.toISOString()).toBe('2026-08-03T02:00:00.000Z');

    expect(drafts.find((d) => d.indicatorCode === 'VN_GDP')?.periodLabel).toBe('2026 Q2');
    expect(drafts.find((d) => d.indicatorCode === 'VN_UNEMPLOYMENT_RATE')?.periodLabel).toBe(
      '2026 Q2',
    );
  });

  it('matches includes case-insensitively and whitespace-collapsed', async () => {
    const html = pageWith([
      {
        title: 'The   August  2026\nCONSUMER PRICE INDEX (CPI), gold price index',
        status: 'Official',
        date: '2026-09-03',
      },
    ]);
    const provider = new VnGsoCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(html),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ indicatorCode: 'VN_CPI', periodLabel: '2026-08' });
  });

  it('drops events outside the look-back / look-ahead window', async () => {
    const html = pageWith([
      {
        title: 'The April and first 4 months 2027 consumer price index (CPI)',
        status: 'Official',
        date: '2027-05-03',
      },
    ]);
    const provider = new VnGsoCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(html),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('skips a dirty (non-ISO) date row and keeps the good ones', async () => {
    const html = pageWith([
      {
        title: 'The July and 7 months 2026 consumer price index (CPI)',
        status: 'Official',
        date: 'The 6th next month of the month has incurred',
      },
      {
        title: 'The August 2026 consumer price index (CPI)',
        status: 'Official',
        date: '2026-09-03',
      },
    ]);
    const provider = new VnGsoCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(html),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-08');
  });

  it('isolates a failed page fetch', async () => {
    const provider = new VnGsoCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: vi.fn(() => Promise.resolve({ ok: false, status: 503 })) as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('is inert when no GSO indicators are configured', async () => {
    const fetchFn = vi.fn();
    const provider = new VnGsoCalendarProvider({
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
        title: 'The July and 7 months 2026 consumer price index (CPI)',
        status: 'Official',
        date: '2026-08-03',
      },
    ]);
    const provider = new VnGsoCalendarProvider({
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

describe('extractGsoEvents', () => {
  it('parses the embedded array and reads {title, date}', () => {
    const html = pageWith([
      {
        title: 'The August 2026 consumer price index (CPI)',
        status: 'Official',
        date: '2026-09-03',
      },
    ]);
    expect(extractGsoEvents(html)).toEqual([
      { title: 'The August 2026 consumer price index (CPI)', date: '2026-09-03' },
    ]);
  });

  it('is not truncated by a "]" inside a title, and skips shapeless/partial rows', () => {
    const html = pageWith([
      { title: 'Weird [bracket] title 2026 index of industrial production', date: '2026-09-03' },
      // Missing date — skipped.
      { title: 'The August 2026 consumer price index (CPI)', date: '' },
    ] as RawEvent[]);
    const events = extractGsoEvents(html);
    expect(events).toEqual([
      { title: 'Weird [bracket] title 2026 index of industrial production', date: '2026-09-03' },
    ]);
  });

  it('returns [] when the marker or array is absent', () => {
    expect(extractGsoEvents('<html>no calendar here</html>')).toEqual([]);
    expect(extractGsoEvents('<script>var events=not-an-array;</script>')).toEqual([]);
  });
});

describe('matchIndicator', () => {
  const matchers = [
    {
      indicatorCode: 'VN_GDP',
      includes: ['gross domestic product (gdp)'],
      excludes: ['growth rate'],
    },
    { indicatorCode: 'VN_CPI', includes: ['consumer price index (cpi)'], excludes: [] },
  ];

  it('matches on all-includes present and no-excludes present', () => {
    expect(matchIndicator('The Q2 2026 gross domestic product (GDP)', matchers)).toBe('VN_GDP');
    expect(
      matchIndicator('The Q2 2026 gross domestic product (GDP) growth rate', matchers),
    ).toBeNull();
    expect(matchIndicator('The Jan 2026 consumer price index (CPI), gold', matchers)).toBe(
      'VN_CPI',
    );
    expect(matchIndicator('The Jan 2026 core inflation index', matchers)).toBeNull();
  });
});

describe('vnDateToUtc', () => {
  it('anchors a strict-ISO date at 09:00 Hanoi = 02:00 UTC (no DST)', () => {
    expect(vnDateToUtc('2026-08-03')?.toISOString()).toBe('2026-08-03T02:00:00.000Z');
    expect(vnDateToUtc('2026-01-06')?.toISOString()).toBe('2026-01-06T02:00:00.000Z');
  });

  it('returns null for a non-ISO / invalid date', () => {
    expect(vnDateToUtc('The 6th next month of the month has incurred')).toBeNull();
    expect(vnDateToUtc('06/01/2026')).toBeNull();
    expect(vnDateToUtc('2026-13-40')).toBeNull();
  });
});

describe('normalizeVnPeriod', () => {
  it('resolves month / quarter with the first period token winning', () => {
    expect(normalizeVnPeriod('The January/2026 consumer price index (CPI)')).toBe('2026-01');
    expect(
      normalizeVnPeriod('The February and first 2 months 2026 index of industrial production'),
    ).toBe('2026-02');
    // "March" appears before "first quarter" → the month wins.
    expect(normalizeVnPeriod('The March and first quarter 2026 consumer price index (CPI)')).toBe(
      '2026-03',
    );
    expect(normalizeVnPeriod('The first quarter 2026 gross domestic product (GDP)')).toBe(
      '2026 Q1',
    );
    expect(normalizeVnPeriod('The second quarter and first 6 months 2026 unemployment rate')).toBe(
      '2026 Q2',
    );
    expect(normalizeVnPeriod('The fourth quarter and 2025 consumer price index (CPI)')).toBe(
      '2025 Q4',
    );
  });

  it('returns null when no year or no month/quarter is present', () => {
    expect(normalizeVnPeriod('Index of industrial production')).toBeNull();
    expect(normalizeVnPeriod('Population, Population density')).toBeNull();
    expect(normalizeVnPeriod('Some 2026 annual roll-up with no month or quarter')).toBeNull();
  });
});
