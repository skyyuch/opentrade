/**
 * Unit tests for CnNbsCalendarProvider (ADR-0061 D2, batch 3).
 *
 * Coverage:
 *   - Emits one draft per configured release, carrying the UTC schedule +
 *     period, with null values (NBS publishes no machine-readable figures, D1)
 *   - Beijing local time is correctly pre-encoded to UTC (09:30 = 01:30 UTC,
 *     10:00 = 02:00 UTC; China has no DST)
 *   - Makes no network call (config-encoded schedule only)
 *   - Skips malformed config dates without dropping the batch
 *   - Inert when no NBS indicators are configured
 *   - Never emits a forecast/consensus value or impact rating (D1)
 */

import { describe, expect, it } from 'vitest';

import { CnNbsCalendarProvider } from './cn-nbs-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const cnCpi: CalendarIndicatorSource = {
  indicatorCode: 'CN_CPI_YOY',
  provider: 'NBS',
  authority: 'National Bureau of Statistics of China',
  nameZhHant: '中國居民消費價格指數（按年）',
  nameZhHans: '中国居民消费价格指数（按年）',
  nameEn: 'China Consumer Price Index (YoY)',
  region: 'CN',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/',
  sourceUrl: 'https://www.stats.gov.cn/english/PressRelease/',
  releases: [
    { dateUtc: '2026-07-09T01:30:00.000Z', periodLabel: '2026-06' },
    { dateUtc: '2026-08-09T01:30:00.000Z', periodLabel: '2026-07' },
  ],
  lang: 'en',
  enabled: true,
};

const cnGdp: CalendarIndicatorSource = {
  indicatorCode: 'CN_GDP_YOY',
  provider: 'NBS',
  authority: 'National Bureau of Statistics of China',
  nameZhHant: '中國國內生產總值（按年）',
  nameZhHans: '中国国内生产总值（按年）',
  nameEn: 'China Gross Domestic Product (YoY)',
  region: 'CN',
  category: 'GROWTH',
  unit: '%_YOY',
  scheduleUrl: 'https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/',
  sourceUrl: 'https://www.stats.gov.cn/english/PressRelease/',
  releases: [{ dateUtc: '2026-07-15T02:00:00.000Z', periodLabel: '2026 Q2' }],
  lang: 'en',
  enabled: true,
};

describe('CnNbsCalendarProvider.fetchEvents', () => {
  it('emits one null-valued draft per configured release', async () => {
    const drafts = await new CnNbsCalendarProvider({ indicators: [cnCpi] }).fetchEvents();

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toEqual({
      indicatorCode: 'CN_CPI_YOY',
      scheduledAt: new Date('2026-07-09T01:30:00.000Z'),
      periodLabel: '2026-06',
      previousValue: null,
      actualValue: null,
    });
    // 09:30 Beijing is 01:30 UTC (UTC+8, no DST).
    expect(drafts[1]?.scheduledAt.toISOString()).toBe('2026-08-09T01:30:00.000Z');
  });

  it('pre-encodes the 10:00 Beijing GDP release to 02:00 UTC with a quarter period', async () => {
    const [draft] = await new CnNbsCalendarProvider({ indicators: [cnGdp] }).fetchEvents();

    expect(draft?.scheduledAt.toISOString()).toBe('2026-07-15T02:00:00.000Z');
    expect(draft?.periodLabel).toBe('2026 Q2');
  });

  it('spans multiple indicators, one draft per release', async () => {
    const drafts = await new CnNbsCalendarProvider({ indicators: [cnCpi, cnGdp] }).fetchEvents();
    expect(drafts.map((d) => d.indicatorCode)).toEqual(['CN_CPI_YOY', 'CN_CPI_YOY', 'CN_GDP_YOY']);
  });

  it('skips a malformed config date without dropping the batch', async () => {
    const broken: CalendarIndicatorSource = {
      ...cnCpi,
      releases: [
        { dateUtc: 'not-a-date', periodLabel: '2026-05' },
        { dateUtc: '2026-08-09T01:30:00.000Z', periodLabel: '2026-07' },
      ],
    };

    const drafts = await new CnNbsCalendarProvider({ indicators: [broken] }).fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-07');
  });

  it('is inert when no NBS indicators are configured', async () => {
    expect(await new CnNbsCalendarProvider({ indicators: [] }).fetchEvents()).toEqual([]);
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const [draft] = await new CnNbsCalendarProvider({ indicators: [cnCpi] }).fetchEvents();
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
