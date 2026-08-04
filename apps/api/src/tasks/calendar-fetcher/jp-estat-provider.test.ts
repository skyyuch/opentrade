/**
 * Unit tests for JpEstatCalendarProvider (ADR-0061 D2, batch 3).
 *
 * Coverage:
 *   - Parses e-Stat 公表予定 rows and maps whitelisted government-statistics
 *     codes (`data-toukei_cd`) to indicatorCodes, narrowing by name
 *     include/exclude, converting the JST datetime to UTC and normalising the
 *     Japanese reference period; non-whitelisted codes are ignored
 *   - name include/exclude isolates the single headline release out of a
 *     `toukei_cd` family (national vs Tokyo CPI, 1st vs 2nd preliminary GDP),
 *     preventing `(indicatorCode, periodLabel)` upsert collisions
 *   - Values are always null (the page exposes no figures, D1)
 *   - Events outside the look-back / look-ahead window are dropped
 *   - Malformed rows are isolated (one bad row can't drop the good ones)
 *   - No configured e-Stat indicators / a fetch failure → inert (empty)
 *   - Never emits a forecast/consensus value or impact rating (D1)
 *   - Row parsing, JST→UTC and Japanese period-normalisation helpers
 *
 * A self-made HTML fixture (not a live URL) keeps the test hermetic — the shape
 * mirrors the official `/release-calendar` Drupal markup.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  JpEstatCalendarProvider,
  normalizeEstatPeriod,
  parseJstDateTime,
  parseReleaseRows,
} from './jp-estat-provider.js';

import type { CalendarIndicatorSource } from '@opentrade/config';

const NOW = new Date('2026-08-10T00:00:00.000Z');

const cpi: CalendarIndicatorSource = {
  indicatorCode: 'JP_CPI',
  provider: 'ESTAT',
  authority: 'Statistics Bureau of Japan',
  nameZhHant: '日本消費者物價指數（全國，按年）',
  nameZhHans: '日本消费者物价指数（全国，按年）',
  nameEn: 'Japan Consumer Price Index (nationwide)',
  region: 'JP',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.e-stat.go.jp/release-calendar',
  sourceUrl: 'https://www.stat.go.jp/data/cpi/index.html',
  estatToukeiCode: '00200573',
  estatNameIncludes: ['全国'],
  estatNameExcludes: ['東京都区部', '遡及'],
  lang: 'en',
  enabled: true,
};

const gdp: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'JP_GDP',
  category: 'GROWTH',
  unit: '%',
  estatToukeiCode: '00100409',
  estatNameIncludes: ['1次速報'],
  estatNameExcludes: ['2次速報'],
};

const labour: CalendarIndicatorSource = {
  ...cpi,
  indicatorCode: 'JP_LABOUR_FORCE',
  category: 'EMPLOYMENT',
  unit: '%',
  estatToukeiCode: '00200531',
  estatNameIncludes: ['基本集計'],
  estatNameExcludes: ['詳細集計'],
};

/** Build one release-calendar row in the e-Stat Drupal shape. */
function row(toukeiCode: string, jstDateTime: string, name: string): string {
  return (
    `<li class="stat-list-row">` +
    `<span class="stat-announce-kikan">総務省</span>` +
    `<span class="stat-announce-comment" data-toukei_cd="${toukeiCode}" ` +
    `data-kensakuKouhyou_date="${jstDateTime}">` +
    `<a tabindex="15" href="./release-calendar/detail/${toukeiCode}/${jstDateTime}" ` +
    `target="_blank"> ${name} </a></span></li>`
  );
}

const page = (...rows: string[]): string =>
  `<ul class="stat-list-body js-items">${rows.join('')}</ul>`;

const fetchReturning = (html: string): typeof fetch =>
  vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(html) }),
  ) as unknown as typeof fetch;

describe('JpEstatCalendarProvider.fetchEvents', () => {
  it('maps whitelisted rows to drafts with null values, UTC time and periods', async () => {
    const provider = new JpEstatCalendarProvider({
      indicators: [cpi, gdp],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(
          row('00200573', '202608210830', '消費者物価指数 全国(2026年7月分)'),
          row('00100409', '202608170850', '国民経済計算 四半期別ＧＤＰ速報(2026年4-6月期 1次速報)'),
          // A statistics code we do not track — must be ignored.
          row('00550100', '202608170850', '生産動態統計調査 2026年(6月分 速報)'),
        ),
      ),
    });

    const drafts = await provider.fetchEvents();

    expect(drafts).toHaveLength(2);
    const cpiDraft = drafts.find((d) => d.indicatorCode === 'JP_CPI');
    expect(cpiDraft).toMatchObject({
      periodLabel: '2026-07',
      previousValue: null,
      actualValue: null,
    });
    // 08:30 JST = 23:30 UTC the previous day (UTC+9, no DST — no date library).
    expect(cpiDraft?.scheduledAt.toISOString()).toBe('2026-08-20T23:30:00.000Z');
    const gdpDraft = drafts.find((d) => d.indicatorCode === 'JP_GDP');
    expect(gdpDraft?.periodLabel).toBe('2026 Q2');
    expect(gdpDraft?.scheduledAt.toISOString()).toBe('2026-08-16T23:50:00.000Z');
  });

  it('narrows a toukei_cd family by name include/exclude (national CPI, not Tokyo)', async () => {
    const provider = new JpEstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(
          row('00200573', '202608210830', '消費者物価指数 全国(2026年7月分)'),
          // Same code, Tokyo-ward advance — excluded so it can't collide.
          row('00200573', '202608280830', '消費者物価指数 東京都区部（中旬速報値）(2026年8月分)'),
          // Same code, 2025-base back-cast special release — excluded.
          row('00200573', '202608071600', '消費者物価指数 全国(2025年基準による指数 遡及結果)'),
        ),
      ),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.indicatorCode).toBe('JP_CPI');
    expect(drafts[0]?.periodLabel).toBe('2026-07');
  });

  it('keeps only the 1st-preliminary GDP so revisions never collide on the period key', async () => {
    const provider = new JpEstatCalendarProvider({
      indicators: [gdp],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(
          row('00100409', '202608170850', '国民経済計算 四半期別ＧＤＰ速報(2026年4-6月期 1次速報)'),
          // Same quarter, 2nd preliminary — excluded to avoid an upsert collision.
          row('00100409', '202609080850', '国民経済計算 四半期別ＧＤＰ速報(2026年4-6月期 2次速報)'),
        ),
      ),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026 Q2');
  });

  it('labels a monthly release by its month even when it embeds a quarter average', async () => {
    const provider = new JpEstatCalendarProvider({
      indicators: [labour],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(
          row(
            '00200531',
            '202610300830',
            '労働力調査 2026年９月分(基本集計（2026年７～９月期平均）,基本集計（2026年９月分）)',
          ),
        ),
      ),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    // The leading "9月分" is the true period, not the embedded "7～9月期平均".
    expect(drafts[0]?.periodLabel).toBe('2026-09');
  });

  it('drops events outside the look-back / look-ahead window', async () => {
    const provider = new JpEstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(row('00200573', '202808210830', '消費者物価指数 全国(2028年7月分)')),
      ),
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('isolates a malformed datetime and keeps the good rows', async () => {
    const provider = new JpEstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(
          row('00200573', '202699210830', '消費者物価指数 全国(2026年7月分)'),
          row('00200573', '202609170830', '消費者物価指数 全国(2026年8月分)'),
        ),
      ),
    });

    const drafts = await provider.fetchEvents();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.periodLabel).toBe('2026-08');
  });

  it('is inert when no e-Stat indicators are configured', async () => {
    const fetchFn = vi.fn();
    const provider = new JpEstatCalendarProvider({
      indicators: [],
      now: () => NOW,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns empty on a fetch failure (whole-provider isolation)', async () => {
    const provider = new JpEstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch,
    });

    expect(await provider.fetchEvents()).toEqual([]);
  });

  it('never emits a forecast/consensus value or impact rating (ADR-0058 D1)', async () => {
    const provider = new JpEstatCalendarProvider({
      indicators: [cpi],
      now: () => NOW,
      fetchFn: fetchReturning(
        page(row('00200573', '202608210830', '消費者物価指数 全国(2026年7月分)')),
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

describe('parseReleaseRows', () => {
  it('extracts toukei code, JST datetime and release name per row', () => {
    const rows = parseReleaseRows(
      page(
        row('00350300', '202608280930', '普通貿易統計 令和8年7月(月分（輸出確報；輸入9桁速報）)'),
        row('00550300', '202608310850', '鉱工業生産・出荷・在庫指数 2026年(7月分 速報)'),
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      toukeiCode: '00350300',
      jstDateTime: '202608280930',
      name: '普通貿易統計 令和8年7月(月分（輸出確報；輸入9桁速報）)',
    });
    expect(rows[1]?.toukeiCode).toBe('00550300');
  });

  it('returns no rows when the markup has no release spans', () => {
    expect(parseReleaseRows('<html><body>nothing</body></html>')).toEqual([]);
  });
});

describe('parseJstDateTime', () => {
  it('converts a compact JST datetime to UTC (−9h, day rollover)', () => {
    expect(parseJstDateTime('202608210830')?.toISOString()).toBe('2026-08-20T23:30:00.000Z');
    expect(parseJstDateTime('202608171330')?.toISOString()).toBe('2026-08-17T04:30:00.000Z');
  });

  it('returns null for malformed / out-of-range values', () => {
    expect(parseJstDateTime('2026XX210830')).toBeNull();
    expect(parseJstDateTime('20260821083')).toBeNull();
    expect(parseJstDateTime('202613010830')).toBeNull(); // month 13
  });
});

describe('normalizeEstatPeriod', () => {
  it('normalises month, full-width, quarter, Reiwa era and year-only', () => {
    expect(normalizeEstatPeriod('消費者物価指数 全国(2026年7月分)')).toBe('2026-07');
    // Full-width digits.
    expect(normalizeEstatPeriod('労働力調査 2026年７月分(基本集計)')).toBe('2026-07');
    // Quarter range (end-month agnostic; first month → quarter).
    expect(normalizeEstatPeriod('国民経済計算 四半期別ＧＤＰ速報(2026年4-6月期 1次速報)')).toBe(
      '2026 Q2',
    );
    expect(normalizeEstatPeriod('四半期別ＧＤＰ速報(2026年10-12月期 1次速報)')).toBe('2026 Q4');
    // Reiwa era: 令和8 = 2026.
    expect(normalizeEstatPeriod('普通貿易統計 令和8年7月(月分（輸出確報）)')).toBe('2026-07');
    // Reiwa 元年 = year 1 = 2019.
    expect(normalizeEstatPeriod('統計 令和元年3月分')).toBe('2019-03');
    // Annual only.
    expect(normalizeEstatPeriod('普通貿易統計 令和7年(確定)')).toBe('2025');
  });

  it('takes the earliest period token (monthly release embedding a quarter average)', () => {
    expect(
      normalizeEstatPeriod(
        '労働力調査 2026年9月分(基本集計（2026年7～9月期平均）,基本集計（2026年9月分）)',
      ),
    ).toBe('2026-09');
  });

  it('falls back to the trimmed original for an unrecognised period', () => {
    expect(normalizeEstatPeriod('特別集計 結果  ')).toBe('特別集計 結果');
  });
});
