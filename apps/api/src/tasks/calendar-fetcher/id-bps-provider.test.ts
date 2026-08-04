/**
 * Unit tests for IdBpsCalendarProvider (ADR-0061 D2, batch 4).
 *
 * Coverage:
 *   - Emits one draft per configured release, carrying the UTC schedule +
 *     period, with null values (BPS publishes no machine-readable figures, D1)
 *   - Western Indonesia Time is correctly pre-encoded to UTC (11:00 WIB = 04:00
 *     UTC on the same day; Indonesia has no DST)
 *   - Makes no network call (config-encoded schedule only — the BPS site is
 *     behind a Cloudflare challenge, so it cannot be fetched live)
 *   - Skips malformed config dates without dropping the batch
 *   - Inert when no BPS indicators are configured
 *   - Never emits a forecast/consensus value or impact rating (D1)
 */

import { describe, expect, it } from 'vitest';

import { IdBpsCalendarProvider } from './id-bps-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const idCpi: CalendarIndicatorSource = {
  indicatorCode: 'ID_CPI',
  provider: 'BPS',
  authority: 'BPS-Statistics Indonesia',
  nameZhHant: '印尼消費者物價指數（按年）',
  nameZhHans: '印度尼西亚消费者物价指数（按年）',
  nameEn: 'Indonesia Consumer Price Index (YoY)',
  region: 'ID',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.bps.go.id/en/arc',
  sourceUrl: 'https://www.bps.go.id/en/pressrelease',
  // July 2026 CPI is released 2026-08-03 11:00 WIB = 2026-08-03 04:00 UTC.
  releases: [
    { dateUtc: '2026-07-01T04:00:00.000Z', periodLabel: '2026-06' },
    { dateUtc: '2026-08-03T04:00:00.000Z', periodLabel: '2026-07' },
  ],
  lang: 'en',
  enabled: true,
};

const idGdp: CalendarIndicatorSource = {
  indicatorCode: 'ID_GDP',
  provider: 'BPS',
  authority: 'BPS-Statistics Indonesia',
  nameZhHant: '印尼國內生產總值（經濟成長，按年）',
  nameZhHans: '印度尼西亚国内生产总值（经济增长，按年）',
  nameEn: 'Indonesia Economic Growth (GDP, YoY)',
  region: 'ID',
  category: 'GROWTH',
  unit: '%_YOY',
  scheduleUrl: 'https://www.bps.go.id/en/arc',
  sourceUrl: 'https://www.bps.go.id/en/pressrelease',
  releases: [{ dateUtc: '2026-08-05T04:00:00.000Z', periodLabel: '2026 Q2' }],
  lang: 'en',
  enabled: true,
};

describe('IdBpsCalendarProvider.fetchEvents', () => {
  it('emits one null-valued draft per configured release', async () => {
    const drafts = await new IdBpsCalendarProvider({ indicators: [idCpi] }).fetchEvents();

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toEqual({
      indicatorCode: 'ID_CPI',
      scheduledAt: new Date('2026-07-01T04:00:00.000Z'),
      periodLabel: '2026-06',
      previousValue: null,
      actualValue: null,
    });
  });

  it('pre-encodes 11:00 WIB to 04:00 UTC on the same day (no DST)', async () => {
    const drafts = await new IdBpsCalendarProvider({ indicators: [idCpi] }).fetchEvents();

    // 2026-08-03 11:00 WIB (UTC+7) === 2026-08-03 04:00 UTC.
    expect(drafts[1]?.scheduledAt.toISOString()).toBe('2026-08-03T04:00:00.000Z');
    expect(drafts[1]?.periodLabel).toBe('2026-07');
  });

  it('spans multiple indicators, one draft per release', async () => {
    const drafts = await new IdBpsCalendarProvider({
      indicators: [idCpi, idGdp],
    }).fetchEvents();
    expect(drafts.map((d) => d.indicatorCode)).toEqual(['ID_CPI', 'ID_CPI', 'ID_GDP']);
  });

  it('skips a malformed config date without dropping the batch', async () => {
    const broken: CalendarIndicatorSource = {
      ...idCpi,
      releases: [
        { dateUtc: 'not-a-date', periodLabel: '2026-05' },
        { dateUtc: '2026-08-03T04:00:00.000Z', periodLabel: '2026-07' },
      ],
    };

    const drafts = await new IdBpsCalendarProvider({ indicators: [broken] }).fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-07');
  });

  it('is inert when no BPS indicators are configured', async () => {
    expect(await new IdBpsCalendarProvider({ indicators: [] }).fetchEvents()).toEqual([]);
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const [draft] = await new IdBpsCalendarProvider({ indicators: [idCpi] }).fetchEvents();
    expect(Object.keys(draft ?? {}).sort()).toEqual([
      'actualValue',
      'indicatorCode',
      'periodLabel',
      'previousValue',
      'scheduledAt',
    ]);
    expect(draft?.previousValue).toBeNull();
    expect(draft?.actualValue).toBeNull();
  });
});
