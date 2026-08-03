/**
 * Unit tests for CaStatCanCalendarProvider (ADR-0061 D2, batch 2).
 *
 * Coverage:
 *   - Maps whitelisted release titles (case-insensitive) to indicatorCodes,
 *     builds the 08:30 Eastern release time in UTC, and normalises the period;
 *     non-whitelisted titles are ignored
 *   - Values are always null (StatCan's schedule exposes no figures, D1)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - Malformed entries are isolated (one bad row can't drop the good ones)
 *   - No configured STATCAN indicators / a fetch failure → inert (empty)
 *   - DST-aware Eastern → UTC conversion + period normalisation
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *
 * A self-made JSON fixture (not a live URL) keeps the test hermetic — the
 * shape mirrors the official `schedule-key_indicators-eng.json` response.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  CaStatCanCalendarProvider,
  easternIsDst,
  normalizeStatCanPeriod,
  parseDailyRelease,
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
