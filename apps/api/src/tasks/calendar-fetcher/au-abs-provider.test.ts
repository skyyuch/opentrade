/**
 * Unit tests for AuAbsCalendarProvider (ADR-0061 D2, batch 3).
 *
 * Coverage:
 *   - Parses future-release rows and maps whitelisted product event-names
 *     (case-insensitive) to indicatorCodes, reading the UTC release time
 *     straight from the `<time datetime="…Z">` attribute and normalising the
 *     reference period; non-whitelisted names are ignored
 *   - Values are always null (the page exposes no figures, D1)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - Malformed rows are isolated (one bad row can't drop the good ones)
 *   - No configured ABS indicators / a fetch failure → inert (empty)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - Row parsing + period normalisation helpers
 *
 * A self-made HTML fixture (not a live URL) keeps the test hermetic — the shape
 * mirrors the official `/release-calendar/future-releases` Drupal View markup.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  AuAbsCalendarProvider,
  normalizeAbsPeriod,
  parseFutureReleaseRows,
} from './au-abs-provider.js';

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
