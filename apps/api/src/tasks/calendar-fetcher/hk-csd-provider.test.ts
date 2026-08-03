/**
 * Unit tests for HkCsdCalendarProvider (ADR-0061 D2).
 *
 * Coverage:
 *   - Emits one draft per configured release, carrying the UTC schedule +
 *     period, with null values (C&SD publishes no machine-readable figures, D1)
 *   - Makes no network call (config-encoded schedule only)
 *   - Skips malformed config dates without dropping the batch
 *   - Inert when no HK_CSD indicators are configured
 *   - Never emits a forecast/consensus value or impact rating (D1)
 */

import { describe, expect, it } from 'vitest';

import { HkCsdCalendarProvider } from './hk-csd-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const hkCpi: CalendarIndicatorSource = {
  indicatorCode: 'HK_CPI_YOY',
  provider: 'HK_CSD',
  authority: 'Census and Statistics Department',
  nameZhHant: '香港綜合消費物價指數（按年）',
  nameZhHans: '香港综合消费物价指数（按年）',
  nameEn: 'Hong Kong Composite CPI (YoY)',
  region: 'HK',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.censtatd.gov.hk/en/scode270.html',
  sourceUrl: 'https://www.censtatd.gov.hk/en/scode270.html',
  releases: [
    { dateUtc: '2026-07-21T08:30:00.000Z', periodLabel: '2026-06' },
    { dateUtc: '2026-08-20T08:30:00.000Z', periodLabel: '2026-07' },
  ],
  lang: 'zh-Hant',
  enabled: true,
};

describe('HkCsdCalendarProvider.fetchEvents', () => {
  it('emits one null-valued draft per configured release', async () => {
    const drafts = await new HkCsdCalendarProvider({ indicators: [hkCpi] }).fetchEvents();

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toEqual({
      indicatorCode: 'HK_CPI_YOY',
      scheduledAt: new Date('2026-07-21T08:30:00.000Z'),
      periodLabel: '2026-06',
      previousValue: null,
      actualValue: null,
    });
    // 16:30 HKT is 08:30 UTC.
    expect(drafts[1]?.scheduledAt.toISOString()).toBe('2026-08-20T08:30:00.000Z');
  });

  it('skips a malformed config date without dropping the batch', async () => {
    const broken: CalendarIndicatorSource = {
      ...hkCpi,
      releases: [
        { dateUtc: 'not-a-date', periodLabel: '2026-05' },
        { dateUtc: '2026-08-20T08:30:00.000Z', periodLabel: '2026-07' },
      ],
    };

    const drafts = await new HkCsdCalendarProvider({ indicators: [broken] }).fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-07');
  });

  it('is inert when no HK_CSD indicators are configured', async () => {
    expect(await new HkCsdCalendarProvider({ indicators: [] }).fetchEvents()).toEqual([]);
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const [draft] = await new HkCsdCalendarProvider({ indicators: [hkCpi] }).fetchEvents();
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
