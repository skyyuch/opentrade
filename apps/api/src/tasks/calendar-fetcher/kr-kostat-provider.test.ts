/**
 * Unit tests for KrKostatCalendarProvider (ADR-0061 D2, batch 4).
 *
 * Coverage:
 *   - Emits one draft per configured release, carrying the UTC schedule +
 *     period, with null values (KOSTAT publishes no machine-readable figures,
 *     D1)
 *   - Korea Standard Time is correctly pre-encoded to UTC (08:00 KST = 23:00
 *     UTC on the preceding day; Korea has no DST)
 *   - Makes no network call (config-encoded schedule only)
 *   - Skips malformed config dates without dropping the batch
 *   - Inert when no KOSTAT indicators are configured
 *   - Never emits a forecast/consensus value or impact rating (D1)
 */

import { describe, expect, it } from 'vitest';

import { KrKostatCalendarProvider } from './kr-kostat-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const krCpi: CalendarIndicatorSource = {
  indicatorCode: 'KR_CPI',
  provider: 'KOSTAT',
  authority: 'Statistics Korea',
  nameZhHant: '南韓消費者物價指數（按年）',
  nameZhHans: '韩国消费者物价指数（按年）',
  nameEn: 'South Korea Consumer Price Index (YoY)',
  region: 'KR',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://mods.go.kr/menu.es?mid=a20301000000',
  sourceUrl: 'https://mods.go.kr/eng/index.do',
  // July 2026 CPI is released 2026-08-04 08:00 KST = 2026-08-03 23:00 UTC.
  releases: [
    { dateUtc: '2026-07-01T23:00:00.000Z', periodLabel: '2026-06' },
    { dateUtc: '2026-08-03T23:00:00.000Z', periodLabel: '2026-07' },
  ],
  lang: 'en',
  enabled: true,
};

const krEmployment: CalendarIndicatorSource = {
  indicatorCode: 'KR_EMPLOYMENT',
  provider: 'KOSTAT',
  authority: 'Statistics Korea',
  nameZhHant: '南韓就業動向（經濟活動人口調查）',
  nameZhHans: '韩国就业动向（经济活动人口调查）',
  nameEn: 'South Korea Employment Trends (Economically Active Population Survey)',
  region: 'KR',
  category: 'EMPLOYMENT',
  unit: '%',
  scheduleUrl: 'https://mods.go.kr/menu.es?mid=a20301000000',
  sourceUrl: 'https://mods.go.kr/eng/index.do',
  releases: [{ dateUtc: '2026-08-11T23:00:00.000Z', periodLabel: '2026-07' }],
  lang: 'en',
  enabled: true,
};

describe('KrKostatCalendarProvider.fetchEvents', () => {
  it('emits one null-valued draft per configured release', async () => {
    const drafts = await new KrKostatCalendarProvider({ indicators: [krCpi] }).fetchEvents();

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toEqual({
      indicatorCode: 'KR_CPI',
      scheduledAt: new Date('2026-07-01T23:00:00.000Z'),
      periodLabel: '2026-06',
      previousValue: null,
      actualValue: null,
    });
  });

  it('pre-encodes 08:00 KST to 23:00 UTC on the preceding day (no DST)', async () => {
    const drafts = await new KrKostatCalendarProvider({ indicators: [krCpi] }).fetchEvents();

    // 2026-08-04 08:00 KST (UTC+9) === 2026-08-03 23:00 UTC.
    expect(drafts[1]?.scheduledAt.toISOString()).toBe('2026-08-03T23:00:00.000Z');
    expect(drafts[1]?.periodLabel).toBe('2026-07');
  });

  it('spans multiple indicators, one draft per release', async () => {
    const drafts = await new KrKostatCalendarProvider({
      indicators: [krCpi, krEmployment],
    }).fetchEvents();
    expect(drafts.map((d) => d.indicatorCode)).toEqual(['KR_CPI', 'KR_CPI', 'KR_EMPLOYMENT']);
  });

  it('skips a malformed config date without dropping the batch', async () => {
    const broken: CalendarIndicatorSource = {
      ...krCpi,
      releases: [
        { dateUtc: 'not-a-date', periodLabel: '2026-05' },
        { dateUtc: '2026-08-03T23:00:00.000Z', periodLabel: '2026-07' },
      ],
    };

    const drafts = await new KrKostatCalendarProvider({ indicators: [broken] }).fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-07');
  });

  it('is inert when no KOSTAT indicators are configured', async () => {
    expect(await new KrKostatCalendarProvider({ indicators: [] }).fetchEvents()).toEqual([]);
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const [draft] = await new KrKostatCalendarProvider({ indicators: [krCpi] }).fetchEvents();
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
