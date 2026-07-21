/**
 * Curated economic-calendar official-source registry (ADR-0058 D2).
 *
 * Single source of truth for the primary statistical authorities the
 * calendar-fetcher task polls. Per rule 00 / rule 50 the source list must NOT
 * be hard-coded in task/domain code — it lives here so adding/removing an
 * indicator (and auditing the list for compliance) is a one-file change,
 * mirroring `./news.ts`.
 *
 * Compliance contract (ADR-0058 D1): every event stores and displays ONLY
 * facts published by the authority itself — indicator name / release time /
 * region / covered period / previous value / post-release actual value /
 * canonical official link. No forecast or consensus values, no
 * impact/importance rating, no interpretation. Ordering is strictly
 * chronological and never purchasable.
 *
 * Coverage grows batch by batch (ADR-0058 D2): US (BLS / BEA / Fed schedules
 * + FRED for released values) first, HK Census & Statistics Department next,
 * CN National Bureau of Statistics explicitly deferred.
 *
 * The FRED API key is NOT stored here — it lives in AWS Secrets Manager and
 * is injected via env at runtime (rule 50). This registry only records the
 * public series identifier each indicator maps to.
 *
 * `lang` uses the project locale vocabulary (ADR-0003): zh-Hant / zh-Hans / en.
 */

import type { SupportedLocale } from './locales.js';

/** Region an indicator belongs to (ADR-0058 D1). Mirrors the DB enum. */
export type CalendarRegion = 'US' | 'HK' | 'CN';

/**
 * Filtering-only category (ADR-0058 D1). Used purely for region/category
 * filtering — NEVER for ranking one event above another. Mirrors the DB enum.
 */
export type CalendarCategory =
  | 'INFLATION'
  | 'GROWTH'
  | 'EMPLOYMENT'
  | 'RATE_DECISION'
  | 'TRADE'
  | 'OTHER';

export type CalendarIndicatorSource = {
  /**
   * Stable machine code, e.g. `US_CPI_YOY`. Doubles as the first half of the
   * `(indicatorCode, periodLabel)` upsert key (ADR-0058 D6).
   */
  readonly indicatorCode: string;
  /** Issuing authority, e.g. "BLS" / "BEA" / "Federal Reserve". */
  readonly authority: string;
  /**
   * Trilingual display names (ADR-0058 D1 / D6), copied onto each
   * `EconomicEvent` row by the fetcher — mirrors the `Instrument` pattern.
   */
  readonly nameZhHant: string;
  readonly nameZhHans: string;
  readonly nameEn: string;
  readonly region: CalendarRegion;
  readonly category: CalendarCategory;
  /** Unit of `previousValue` / `actualValue`, e.g. "%" / "%_YOY" / "k". */
  readonly unit: string;
  /** Official release-schedule page the fetcher polls for `scheduledAt`. */
  readonly scheduleUrl: string;
  /**
   * Canonical official release page linked from every event
   * (`EconomicEvent.sourceUrl`) — always the primary source, never a
   * third-party aggregator (ADR-0058 D1).
   */
  readonly sourceUrl: string;
  /**
   * FRED series identifier used to backfill released `actual` / `previous`
   * observation values (ADR-0058 D2 two-phase population). Absent for
   * authorities not covered by FRED (e.g. HK C&SD, added in a later batch).
   */
  readonly fredSeriesId?: string;
  /** Primary language of the authority's release pages. */
  readonly lang: SupportedLocale;
  /** Disabled indicators are kept for provenance but skipped by the fetcher. */
  readonly enabled: boolean;
};

/**
 * The curated indicator list. US first batch (ADR-0058 D2); HK C&SD and CN
 * NBS entries are appended in later batches. Kept intentionally small to
 * start — each entry must trace to a primary statistical authority.
 */
export const CALENDAR_INDICATOR_SOURCES: readonly CalendarIndicatorSource[] = [
  {
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
  },
  {
    indicatorCode: 'US_NONFARM_PAYROLLS',
    authority: 'BLS',
    nameZhHant: '美國非農就業人數變動',
    nameZhHans: '美国非农就业人数变动',
    nameEn: 'US Nonfarm Payrolls',
    region: 'US',
    category: 'EMPLOYMENT',
    unit: 'k',
    scheduleUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm',
    sourceUrl: 'https://www.bls.gov/ces/',
    fredSeriesId: 'PAYEMS',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'US_UNEMPLOYMENT_RATE',
    authority: 'BLS',
    nameZhHant: '美國失業率',
    nameZhHans: '美国失业率',
    nameEn: 'US Unemployment Rate',
    region: 'US',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm',
    sourceUrl: 'https://www.bls.gov/cps/',
    fredSeriesId: 'UNRATE',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'US_GDP_QOQ',
    authority: 'BEA',
    nameZhHant: '美國實質國內生產總值（按季年率）',
    nameZhHans: '美国实际国内生产总值（按季年率）',
    nameEn: 'US Real GDP (QoQ, annualised)',
    region: 'US',
    category: 'GROWTH',
    unit: '%',
    scheduleUrl: 'https://www.bea.gov/news/schedule',
    sourceUrl: 'https://www.bea.gov/data/gdp/gross-domestic-product',
    fredSeriesId: 'A191RL1Q225SBEA',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'US_FED_FUNDS_RATE',
    authority: 'Federal Reserve',
    nameZhHant: '美國聯邦基金利率決議（上限）',
    nameZhHans: '美国联邦基金利率决议（上限）',
    nameEn: 'US Federal Funds Rate Decision (upper bound)',
    region: 'US',
    category: 'RATE_DECISION',
    unit: '%',
    scheduleUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/openmarket.htm',
    fredSeriesId: 'DFEDTARU',
    lang: 'en',
    enabled: true,
  },
] as const;

/** The subset the fetcher should actually poll. */
export function enabledCalendarIndicators(): readonly CalendarIndicatorSource[] {
  return CALENDAR_INDICATOR_SOURCES.filter((s) => s.enabled);
}
