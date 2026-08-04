/**
 * Unit tests for NzStatsNzCalendarProvider (ADR-0061 D2, batch 3).
 *
 * Coverage:
 *   - Walks the window months, merges published + upcoming buckets, and maps a
 *     release to an indicator by the name BEFORE the first colon
 *     (case-insensitive); the "(income)" sibling is cleanly separated
 *   - NZ-local publication time is converted to UTC with DST awareness
 *     (NZST = UTC+12 winter, NZDT = UTC+13 summer)
 *   - Quarter periods use the END-month convention ("June … quarter" → Q2)
 *   - Values are always null (the endpoint exposes no figures, D1)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - Malformed rows / a failed month fetch are isolated
 *   - No configured indicators → inert (no fetch)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - Month enumeration, payload parsing, DST + period helpers
 *
 * Self-made JSON fixtures (not a live URL) keep the test hermetic — the shapes
 * mirror the official `/api/v1/releaseCalendarMonth/<YYYY-MM>` payload (flat
 * `upcoming[]` rows and `DateTaxonomyTerm`-nested `published[]` rows).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  NzStatsNzCalendarProvider,
  monthsInWindow,
  normalizeStatsNzPeriod,
  nzIsDst,
  parseMonthPayload,
  parseNzPublicationDate,
} from './nz-statsnz-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-08-15T00:00:00.000Z');

const cpi: CalendarIndicatorSource = {
  indicatorCode: 'NZ_CPI',
  provider: 'STATSNZ',
  authority: 'Stats NZ',
  nameZhHant: '紐西蘭消費者物價指數（按季）',
  nameZhHans: '新西兰消费者物价指数（按季）',
  nameEn: 'New Zealand Consumers Price Index',
  region: 'NZ',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.stats.govt.nz/release-calendar/',
  sourceUrl: 'https://www.stats.govt.nz/topics/prices',
  statsNzTitlePrefix: 'Consumers price index',
  lang: 'en',
  enabled: true,
};

const labour: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'NZ_LABOUR_MARKET',
  category: 'EMPLOYMENT',
  statsNzTitlePrefix: 'Labour market statistics',
};

const consents: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'NZ_BUILDING_CONSENTS',
  category: 'OTHER',
  statsNzTitlePrefix: 'Building consents issued',
};

/** A flat `upcoming[]` row. */
const upcoming = (displayName: string, publicationDate: string): Record<string, unknown> => ({
  ID: 1,
  DisplayName: displayName,
  PublicationDate: publicationDate,
});

/** A `published[]` row with its fields nested under `DateTaxonomyTerm`. */
const published = (displayName: string, publicationDate: string): Record<string, unknown> => ({
  ID: 2,
  Title: displayName,
  DateTaxonomyTerm: { DisplayName: displayName, PublicationDate: publicationDate },
});

const monthPayload = (
  buckets: { published?: unknown[]; upcoming?: unknown[] } = {},
): { items: { published: unknown[]; upcoming: unknown[] } } => ({
  items: { published: buckets.published ?? [], upcoming: buckets.upcoming ?? [] },
});

/** Serve a payload per `YYYY-MM`, empty for any month not in the map. */
function fetchForMonths(byMonth: Record<string, unknown>): typeof fetch {
  return vi.fn((url: string) => {
    const month = url.split('/').pop() ?? '';
    const payload = byMonth[month] ?? monthPayload();
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
  }) as unknown as typeof fetch;
}

describe('NzStatsNzCalendarProvider.fetchEvents', () => {
  it('maps whitelisted prefixes to drafts with null values, DST-correct UTC time and periods', async () => {
    const provider = new NzStatsNzCalendarProvider({
      indicators: [cpi, labour, consents],
      now: () => NOW,
      fetchFn: fetchForMonths({
        '2026-08': monthPayload({
          published: [published('Building consents issued: June 2026', '2026-08-03 10:45:00')],
          upcoming: [
            upcoming('Labour market statistics: June 2026 quarter', '2026-08-05 10:45:00'),
            // Sibling release: different prefix → must NOT map to NZ_LABOUR_MARKET.
            upcoming('Labour market statistics (income): June 2026 quarter', '2026-08-26 10:45:00'),
            // Not whitelisted — must be ignored.
            upcoming('Electronic card transactions: July 2026', '2026-08-17 10:45:00'),
          ],
        }),
        '2026-10': monthPayload({
          upcoming: [
            upcoming('Consumers price index: September 2026 quarter', '2026-10-22 10:45:00'),
          ],
        }),
      }),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(3);

    const consentsDraft = drafts.find((d) => d.indicatorCode === 'NZ_BUILDING_CONSENTS');
    expect(consentsDraft).toMatchObject({
      periodLabel: '2026-06',
      previousValue: null,
      actualValue: null,
    });
    // August is NZST (UTC+12): 10:45 local on 2026-08-03 = 22:45 UTC the day before.
    expect(consentsDraft?.scheduledAt.toISOString()).toBe('2026-08-02T22:45:00.000Z');

    const labourDraft = drafts.find((d) => d.indicatorCode === 'NZ_LABOUR_MARKET');
    expect(labourDraft?.periodLabel).toBe('2026 Q2');

    const cpiDraft = drafts.find((d) => d.indicatorCode === 'NZ_CPI');
    expect(cpiDraft?.periodLabel).toBe('2026 Q3');
    // October is NZDT (UTC+13): 10:45 local on 2026-10-22 = 21:45 UTC the day before.
    expect(cpiDraft?.scheduledAt.toISOString()).toBe('2026-10-21T21:45:00.000Z');
  });

  it('matches the title prefix case-insensitively', async () => {
    const provider = new NzStatsNzCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchForMonths({
        '2026-10': monthPayload({
          upcoming: [
            upcoming('CONSUMERS PRICE INDEX: September 2026 quarter', '2026-10-22 10:45:00'),
          ],
        }),
      }),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.indicatorCode).toBe('NZ_CPI');
  });

  it('drops events outside the look-back / look-ahead window', async () => {
    const provider = new NzStatsNzCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      // The month is fetched but the row's date is far in the future.
      fetchFn: fetchForMonths({
        '2026-10': monthPayload({
          upcoming: [
            upcoming('Consumers price index: September 2028 quarter', '2028-10-22 10:45:00'),
          ],
        }),
      }),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('isolates a malformed row and keeps the good ones', async () => {
    const provider = new NzStatsNzCalendarProvider({
      indicators: [consents],
      now: () => NOW,
      fetchFn: fetchForMonths({
        '2026-08': monthPayload({
          published: [
            published('Building consents issued: May 2026', 'not-a-date'),
            published('Building consents issued: June 2026', '2026-08-03 10:45:00'),
          ],
        }),
      }),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-06');
  });

  it('isolates a failed month fetch and keeps the other months', async () => {
    const fetchFn = vi.fn((url: string) => {
      if (url.endsWith('2026-08')) return Promise.resolve({ ok: false, status: 503 });
      const month = url.split('/').pop() ?? '';
      const payload =
        month === '2026-09'
          ? monthPayload({
              upcoming: [upcoming('Building consents issued: July 2026', '2026-09-02 10:45:00')],
            })
          : monthPayload();
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    }) as unknown as typeof fetch;

    const provider = new NzStatsNzCalendarProvider({
      indicators: [consents],
      now: () => NOW,
      fetchFn,
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.indicatorCode).toBe('NZ_BUILDING_CONSENTS');
  });

  it('is inert when no Stats NZ indicators are configured', async () => {
    const fetchFn = vi.fn();
    const provider = new NzStatsNzCalendarProvider({
      indicators: [],
      now: () => NOW,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const provider = new NzStatsNzCalendarProvider({
      indicators: [consents],
      now: () => NOW,
      fetchFn: fetchForMonths({
        '2026-08': monthPayload({
          published: [published('Building consents issued: June 2026', '2026-08-03 10:45:00')],
        }),
      }),
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

describe('monthsInWindow', () => {
  it('enumerates the YYYY-MM keys spanning the look-back/-ahead window inclusive', () => {
    expect(monthsInWindow(NOW)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('crosses the year boundary', () => {
    expect(monthsInWindow(new Date('2026-12-01T00:00:00.000Z'))).toContain('2027-01');
  });
});

describe('parseMonthPayload', () => {
  it('reads both the flat upcoming shape and the nested published shape', () => {
    const rows = parseMonthPayload(
      monthPayload({
        published: [published('Building consents issued: June 2026', '2026-08-03 10:45:00')],
        upcoming: [upcoming('Labour market statistics: June 2026 quarter', '2026-08-05 10:45:00')],
      }),
    );
    expect(rows).toEqual([
      {
        displayName: 'Building consents issued: June 2026',
        publicationDate: '2026-08-03 10:45:00',
      },
      {
        displayName: 'Labour market statistics: June 2026 quarter',
        publicationDate: '2026-08-05 10:45:00',
      },
    ]);
  });

  it('returns no rows for a shapeless payload', () => {
    expect(parseMonthPayload({})).toEqual([]);
    expect(parseMonthPayload(null)).toEqual([]);
    expect(parseMonthPayload({ items: { upcoming: 'nope' } })).toEqual([]);
  });
});

describe('parseNzPublicationDate', () => {
  it('applies NZST (UTC+12) in winter and NZDT (UTC+13) in summer', () => {
    // August = NZST: 10:45 - 12h = previous day 22:45 UTC.
    expect(parseNzPublicationDate('2026-08-05 10:45:00')?.toISOString()).toBe(
      '2026-08-04T22:45:00.000Z',
    );
    // January = NZDT: 10:45 - 13h = previous day 21:45 UTC.
    expect(parseNzPublicationDate('2026-01-20 10:45:00')?.toISOString()).toBe(
      '2026-01-19T21:45:00.000Z',
    );
  });

  it('returns null for malformed input', () => {
    expect(parseNzPublicationDate('not-a-date')).toBeNull();
    expect(parseNzPublicationDate('2026-13-40 10:45:00')).toBeNull();
  });
});

describe('nzIsDst', () => {
  it('is NZDT over summer and NZST over winter', () => {
    expect(nzIsDst(2026, 1, 15)).toBe(true);
    expect(nzIsDst(2026, 7, 15)).toBe(false);
    expect(nzIsDst(2026, 12, 15)).toBe(true);
  });

  it('handles both transition Sundays at day granularity (release is after 03:00)', () => {
    // DST starts on the last Sunday of September 2026 (the 27th).
    expect(nzIsDst(2026, 9, 20)).toBe(false);
    expect(nzIsDst(2026, 9, 27)).toBe(true);
    // DST ends on the first Sunday of April 2026 (the 5th).
    expect(nzIsDst(2026, 4, 3)).toBe(true);
    expect(nzIsDst(2026, 4, 5)).toBe(false);
  });
});

describe('normalizeStatsNzPeriod', () => {
  it('normalises quarter (end-month) / month / year and falls back for the rest', () => {
    expect(normalizeStatsNzPeriod(' June 2026 quarter')).toBe('2026 Q2');
    expect(normalizeStatsNzPeriod(' September 2026 quarter')).toBe('2026 Q3');
    expect(normalizeStatsNzPeriod(' December 2026 quarter')).toBe('2026 Q4');
    expect(normalizeStatsNzPeriod(' July 2026')).toBe('2026-07');
    expect(normalizeStatsNzPeriod(' 2025')).toBe('2025');
    expect(normalizeStatsNzPeriod(' Year ended June 2026')).toBe('Year ended June 2026');
    expect(normalizeStatsNzPeriod('')).toBe('');
  });
});
