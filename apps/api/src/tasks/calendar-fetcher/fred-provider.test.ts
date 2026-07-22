/**
 * Unit tests for the FRED calendar provider (ADR-0058 D2/D3).
 *
 * Coverage:
 *   - buildDrafts periodic tail-alignment: a FRED observation (period START)
 *     maps to the release that PUBLISHED it (~one period later), and the next
 *     future release is a scheduled event with actualValue = null + a distinct
 *     period label (no upsert-key collision)
 *   - buildDrafts high-frequency (daily → FOMC) as-of matching: past decision
 *     takes the value on/before it, future decisions are actual = null
 *   - FredCalendarProvider: happy path over mocked FRED JSON, inert without an
 *     API key, per-indicator failure isolation, skips indicators lacking a
 *     FRED series id
 *   - Compliance guard (ADR-0058 D1): a draft never carries a
 *     forecast/consensus/impact field
 */

import { describe, expect, it, vi } from 'vitest';

import { buildDrafts, FredCalendarProvider } from './fred-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-07-20T00:00:00.000Z');

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const indicator = (overrides: Partial<CalendarIndicatorSource> = {}): CalendarIndicatorSource => ({
  indicatorCode: 'US_CPI_YOY',
  authority: 'BLS',
  nameZhHant: '美國消費者物價指數（按年）',
  nameZhHans: '美国消费者物价指数（按年）',
  nameEn: 'US Consumer Price Index (YoY)',
  region: 'US',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.bls.gov/schedule/news_release/cpi.htm',
  sourceUrl: 'https://www.bls.gov/cpi/',
  fredSeriesId: 'CPIAUCSL',
  lang: 'en',
  enabled: true,
  ...overrides,
});

describe('buildDrafts — periodic (monthly) tail-alignment', () => {
  const releaseDates = [d('2026-05-13'), d('2026-06-11'), d('2026-07-15'), d('2026-08-12')];
  const observations = [
    { date: d('2026-04-01'), value: '2.3' },
    { date: d('2026-05-01'), value: '2.4' },
    { date: d('2026-06-01'), value: '2.7' },
  ];

  it('maps each observation to the release that published it (~1 period later)', () => {
    const drafts = buildDrafts('US_CPI_YOY', releaseDates, observations, NOW);

    expect(drafts).toHaveLength(4);
    expect(drafts[0]).toMatchObject({
      periodLabel: '2026-04',
      actualValue: '2.3',
      previousValue: null,
    });
    expect(drafts[1]).toMatchObject({
      periodLabel: '2026-05',
      actualValue: '2.4',
      previousValue: '2.3',
    });
    expect(drafts[2]).toMatchObject({
      periodLabel: '2026-06',
      actualValue: '2.7',
      previousValue: '2.4',
    });
  });

  it('makes the next release a scheduled event (actual null, distinct period)', () => {
    const drafts = buildDrafts('US_CPI_YOY', releaseDates, observations, NOW);
    const upcoming = drafts[3];

    expect(upcoming).toMatchObject({
      periodLabel: '2026-07',
      actualValue: null,
      previousValue: '2.7',
    });
    expect(upcoming?.scheduledAt.toISOString()).toBe('2026-08-12T00:00:00.000Z');
    // Distinct period label → no (indicatorCode, periodLabel) upsert collision.
    const labels = drafts.map((x) => x.periodLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('returns nothing when there are no release dates', () => {
    expect(buildDrafts('US_CPI_YOY', [], observations, NOW)).toEqual([]);
  });
});

describe('buildDrafts — high-frequency (daily → FOMC) as-of matching', () => {
  const releaseDates = [d('2026-06-18'), d('2026-07-30'), d('2026-09-17')];
  const observations = [
    { date: d('2026-06-15'), value: '5.50' },
    { date: d('2026-06-16'), value: '5.50' },
    { date: d('2026-06-17'), value: '5.50' },
    { date: d('2026-06-18'), value: '5.25' },
    { date: d('2026-07-18'), value: '5.25' },
    { date: d('2026-07-19'), value: '5.25' },
  ];

  it('fills the past decision from the value as of that date and leaves future decisions null', () => {
    const drafts = buildDrafts('US_FED_FUNDS_RATE', releaseDates, observations, NOW);

    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({ periodLabel: '2026-06-18', actualValue: '5.25' });
    expect(drafts[1]).toMatchObject({ periodLabel: '2026-07-30', actualValue: null });
    expect(drafts[2]).toMatchObject({ periodLabel: '2026-09-17', actualValue: null });
  });
});

type FredJson = Record<string, unknown>;

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function fakeFetch(
  routes: (url: string) => { ok: boolean; status: number; body: FredJson },
): typeof fetch {
  return vi.fn((input: string | URL | Request) => {
    const { ok, status, body } = routes(urlOf(input));
    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
    });
  }) as unknown as typeof fetch;
}

const CPI_ROUTES = (url: string): { ok: boolean; status: number; body: FredJson } => {
  if (url.includes('/fred/release/dates')) {
    return {
      ok: true,
      status: 200,
      body: {
        release_dates: [
          { date: '2026-05-13' },
          { date: '2026-06-11' },
          { date: '2026-07-15' },
          { date: '2026-08-12' },
        ],
      },
    };
  }
  if (url.includes('/fred/series/observations')) {
    return {
      ok: true,
      status: 200,
      body: {
        observations: [
          { date: '2026-04-01', value: '2.3' },
          { date: '2026-05-01', value: '2.4' },
          { date: '2026-06-01', value: '2.7' },
        ],
      },
    };
  }
  // /fred/series/release
  return { ok: true, status: 200, body: { releases: [{ id: 10 }] } };
};

describe('FredCalendarProvider', () => {
  it('is inert (no fetch) when no API key is configured', async () => {
    const fetchFn = fakeFetch(CPI_ROUTES);
    const provider = new FredCalendarProvider({
      apiKey: '',
      indicators: [indicator()],
      fetchFn,
      now: () => NOW,
    });

    expect(await provider.fetchEvents()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches and builds drafts for a configured FRED indicator', async () => {
    const provider = new FredCalendarProvider({
      apiKey: 'test-key',
      indicators: [indicator()],
      fetchFn: fakeFetch(CPI_ROUTES),
      now: () => NOW,
    });

    const drafts = await provider.fetchEvents();

    expect(drafts).toHaveLength(4);
    expect(drafts.every((x) => x.indicatorCode === 'US_CPI_YOY')).toBe(true);
    expect(drafts.filter((x) => x.actualValue === null)).toHaveLength(1);
  });

  it('isolates a per-indicator failure and skips indicators without a FRED series id', async () => {
    const fetchFn = fakeFetch((url) => {
      if (url.includes('BADSERIES')) return { ok: false, status: 500, body: {} };
      return CPI_ROUTES(url);
    });
    // `exactOptionalPropertyTypes` forbids `fredSeriesId: undefined`, so omit it.
    const { fredSeriesId: _omit, ...noFred } = indicator({ indicatorCode: 'US_NO_FRED' });
    const provider = new FredCalendarProvider({
      apiKey: 'test-key',
      indicators: [
        indicator(),
        indicator({ indicatorCode: 'US_BAD', fredSeriesId: 'BADSERIES' }),
        noFred,
      ],
      fetchFn,
      now: () => NOW,
    });

    const drafts = await provider.fetchEvents();

    // Only the healthy CPI indicator survives; the 500 and the no-series-id are dropped.
    expect(drafts.every((x) => x.indicatorCode === 'US_CPI_YOY')).toBe(true);
    expect(drafts).toHaveLength(4);
  });

  it('never emits a forecast/consensus/impact field (ADR-0058 D1)', async () => {
    const provider = new FredCalendarProvider({
      apiKey: 'test-key',
      indicators: [indicator()],
      fetchFn: fakeFetch(CPI_ROUTES),
      now: () => NOW,
    });

    const drafts = await provider.fetchEvents();
    const keys = Object.keys(drafts[0] ?? {});
    for (const forbidden of ['forecast', 'consensus', 'impact', 'importance', 'rating']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});
