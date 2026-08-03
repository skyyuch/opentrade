/**
 * Unit tests for EurostatCalendarProvider (ADR-0061 D2).
 *
 * Coverage:
 *   - Maps whitelisted release titles (case-insensitive) to indicatorCodes and
 *     normalises the period label; non-whitelisted titles are ignored
 *   - Values are always null (Eurostat exposes the schedule only, D1)
 *   - Events outside the look-back/look-ahead window are dropped
 *   - Malformed entries are isolated (one bad row can't drop the good ones)
 *   - No configured EUROSTAT indicators / a fetch failure → inert (empty)
 *   - Period normalisation covers month / quarter / year / fallback
 *
 * A self-made JSON fixture (not a live URL) keeps the test hermetic — the
 * shape mirrors the official `eventsJson` response documented in research.
 */

import { describe, expect, it, vi } from 'vitest';

import { EurostatCalendarProvider, normalizePeriod } from './eurostat-provider.js';

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
