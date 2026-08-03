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
 * Coverage grows batch by batch (ADR-0058 D2 / ADR-0061 D2): US (FRED) +
 * EU/euro area (Eurostat) + Hong Kong (C&SD) land first; UK / Canada /
 * Australia / Japan are a fast-follow batch; CN is explicitly deferred. Each
 * indicator records WHICH official provider serves it (`provider`) and the
 * provider-specific identifier(s) it needs, so a new authority is an additive
 * config + one pluggable `ICalendarProvider`, never a rewrite.
 *
 * The FRED API key is NOT stored here — it lives in AWS Secrets Manager and
 * is injected via env at runtime (rule 50). This registry only records the
 * public series identifier each indicator maps to. Eurostat and HK C&SD are
 * key-less official sources.
 *
 * `lang` uses the project locale vocabulary (ADR-0003): zh-Hant / zh-Hans / en.
 */

import type { SupportedLocale } from './locales.js';

/**
 * Region an indicator belongs to (ADR-0058 D1 / ADR-0061 D1). Mirrors the DB
 * `EconomicRegion` enum. `region` is a filter/label only, NEVER a ranking. `EA`
 * is the euro area (a subset of `EU`); both carry the same flag.
 */
export type CalendarRegion = 'US' | 'HK' | 'CN' | 'EU' | 'EA' | 'GB' | 'CA' | 'AU' | 'JP';

/**
 * The official statistical authority / API that serves an indicator's release
 * schedule (ADR-0061 D2). Each maps to one pluggable `ICalendarProvider` with
 * isolated per-source failure. A commercial aggregator is deliberately NOT a
 * provider (ADR-0058/0061 D4).
 */
export type CalendarProvider = 'FRED' | 'EUROSTAT' | 'HK_CSD';

/**
 * Region → Unicode flag emoji (ADR-0061 D1). Purely a visual region marker;
 * mirrored by the web `CalendarList` so both server and client render the same
 * flag. The euro area (`EA`) shares the EU flag.
 */
export const CALENDAR_REGION_FLAG: Record<CalendarRegion, string> = {
  US: '🇺🇸',
  HK: '🇭🇰',
  CN: '🇨🇳',
  EU: '🇪🇺',
  EA: '🇪🇺',
  GB: '🇬🇧',
  CA: '🇨🇦',
  AU: '🇦🇺',
  JP: '🇯🇵',
};

/**
 * A pre-announced official release, encoded from an authority's published
 * annual schedule when it exposes no machine-readable API (ADR-0061 D2 — e.g.
 * Hong Kong C&SD, whose only source is the annual PDF, fixed 16:30 HKT). The
 * `HK_CSD` provider reads these verbatim; no external fetch is made.
 */
export type CalendarConfiguredRelease = {
  /**
   * Release timestamp as an ISO-8601 UTC string. HK C&SD publishes at a fixed
   * 16:30 HKT, i.e. 08:30 UTC (Hong Kong has no DST), pre-converted here.
   */
  readonly dateUtc: string;
  /** The covered period, e.g. "2025-12" / "2026 Q2" (ADR-0058 D6 upsert half). */
  readonly periodLabel: string;
};

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
  /**
   * Which official provider serves this indicator's release schedule
   * (ADR-0061 D2). The fetcher routes each indicator to its provider; a
   * provider ignores indicators tagged for another provider.
   */
  readonly provider: CalendarProvider;
  /** Issuing authority, e.g. "BLS" / "BEA" / "Federal Reserve" / "Eurostat". */
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
   * observation values (ADR-0058 D2 two-phase population). Present only for
   * `provider: 'FRED'` indicators.
   */
  readonly fredSeriesId?: string;
  /**
   * Eurostat release-calendar title to match on (ADR-0061 D2). Eurostat's
   * `eventsJson` endpoint returns stable, periodic official titles (e.g.
   * "Flash estimate inflation euro area"); the Eurostat provider maps a
   * release to this indicator by an exact, case-insensitive title match.
   * Present only for `provider: 'EUROSTAT'` indicators. Eurostat exposes the
   * schedule only (no values), so such events stay `previous/actual = null`.
   */
  readonly eurostatTitle?: string;
  /**
   * Pre-encoded official release schedule for authorities with no
   * machine-readable API (ADR-0061 D2). Present only for `provider: 'HK_CSD'`
   * indicators, whose sole source is the C&SD annual PDF schedule. Values are
   * not published in machine-readable form, so these events carry the schedule
   * + period only (`previous/actual = null`) — honest and compliant (D1).
   */
  readonly releases?: readonly CalendarConfiguredRelease[];
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
    provider: 'FRED',
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
    provider: 'FRED',
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
    provider: 'FRED',
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
    provider: 'FRED',
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
    provider: 'FRED',
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

  // --- EU / euro area — Eurostat (ADR-0061 batch 1) --------------------------
  // Served by the Eurostat provider via the official `eventsJson` release
  // calendar (key-less). Eurostat exposes the schedule only, so these events
  // carry release time + period with `previous/actual = null` (honest, D1).
  // `eurostatTitle` is the stable, periodic official title to match on.
  {
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
  },
  {
    indicatorCode: 'EU_HICP_YOY',
    provider: 'EUROSTAT',
    authority: 'Eurostat',
    nameZhHant: '歐盟消費者物價指數（按年）',
    nameZhHans: '欧盟消费者物价指数（按年）',
    nameEn: 'EU inflation (HICP, YoY)',
    region: 'EU',
    category: 'INFLATION',
    unit: '%_YOY',
    scheduleUrl: 'https://ec.europa.eu/eurostat/web/main/news/euro-indicators',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/hicp',
    eurostatTitle: 'Inflation (HICP)',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'EA_GDP_FLASH_QOQ',
    provider: 'EUROSTAT',
    authority: 'Eurostat',
    nameZhHant: '歐元區國內生產總值（快報，按季）',
    nameZhHans: '欧元区国内生产总值（快报，按季）',
    nameEn: 'Euro area GDP flash estimate (QoQ)',
    region: 'EA',
    category: 'GROWTH',
    unit: '%',
    scheduleUrl: 'https://ec.europa.eu/eurostat/web/main/news/euro-indicators',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/national-accounts',
    eurostatTitle: 'Flash estimate GDP and employment - EU and euro area',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'EA_UNEMPLOYMENT_RATE',
    provider: 'EUROSTAT',
    authority: 'Eurostat',
    nameZhHant: '歐元區失業率',
    nameZhHans: '欧元区失业率',
    nameEn: 'Euro area unemployment rate',
    region: 'EA',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://ec.europa.eu/eurostat/web/main/news/euro-indicators',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/lfs',
    eurostatTitle: 'Unemployment',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'EU_RETAIL_TRADE',
    provider: 'EUROSTAT',
    authority: 'Eurostat',
    nameZhHant: '歐盟零售貿易',
    nameZhHans: '欧盟零售贸易',
    nameEn: 'EU retail trade',
    region: 'EU',
    category: 'OTHER',
    unit: '%_MOM',
    scheduleUrl: 'https://ec.europa.eu/eurostat/web/main/news/euro-indicators',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/short-term-business-statistics',
    eurostatTitle: 'Retail trade',
    lang: 'en',
    enabled: true,
  },

  // --- Hong Kong — Census & Statistics Department (ADR-0061 batch 1) ---------
  // C&SD exposes no machine-readable release API; its only source is the
  // official annual PDF schedule (fixed 16:30 HKT = 08:30 UTC). The 2026
  // dates below are transcribed verbatim from the 2026 "Schedule of Regular
  // Press Releases" PDF. NOTE (rule 00 資料正確性): this is a per-year table —
  // C&SD publishes the next year's schedule each September, so these `releases`
  // arrays MUST be refreshed annually (tracked in docs/03-status.md). Values
  // (previous/actual) are not machine-readable, so these events carry the
  // schedule + period only (`previous/actual = null`) — honest and compliant.
  {
    indicatorCode: 'HK_CPI_YOY',
    provider: 'HK_CSD',
    authority: 'Census and Statistics Department',
    nameZhHant: '香港綜合消費物價指數（按年）',
    nameZhHans: '香港综合消费物价指数（按年）',
    nameEn: 'Hong Kong Composite CPI (YoY)',
    region: 'HK',
    category: 'INFLATION',
    unit: '%_YOY',
    scheduleUrl: 'https://www.censtatd.gov.hk/en/press_release_sc.html?scode=270&pcode=B1060001',
    sourceUrl: 'https://www.censtatd.gov.hk/en/scode270.html',
    // Reference month → 2026 release date (16:30 HKT).
    releases: [
      { dateUtc: '2026-01-22T08:30:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-02-25T08:30:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-20T08:30:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-23T08:30:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-21T08:30:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-23T08:30:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-21T08:30:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-20T08:30:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-23T08:30:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-22T08:30:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-20T08:30:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-21T08:30:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'zh-Hant',
    enabled: true,
  },
  {
    indicatorCode: 'HK_UNEMPLOYMENT_RATE',
    provider: 'HK_CSD',
    authority: 'Census and Statistics Department',
    nameZhHant: '香港失業率（經季節性調整）',
    nameZhHans: '香港失业率（经季节性调整）',
    nameEn: 'Hong Kong unemployment rate (seasonally adjusted)',
    region: 'HK',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www.censtatd.gov.hk/en/press_release_sc.html?scode=200&pcode=B1050001',
    sourceUrl: 'https://www.censtatd.gov.hk/en/scode200.html',
    // Rolling three-month window → 2026 release date; periodLabel = window end month.
    releases: [
      { dateUtc: '2026-01-20T08:30:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-02-20T08:30:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-18T08:30:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-23T08:30:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-19T08:30:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-16T08:30:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-17T08:30:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-20T08:30:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-17T08:30:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-22T08:30:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-17T08:30:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-17T08:30:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'zh-Hant',
    enabled: true,
  },
  {
    indicatorCode: 'HK_EXTERNAL_TRADE',
    provider: 'HK_CSD',
    authority: 'Census and Statistics Department',
    nameZhHant: '香港對外商品貿易',
    nameZhHans: '香港对外商品贸易',
    nameEn: 'Hong Kong external merchandise trade',
    region: 'HK',
    category: 'TRADE',
    // Values are not machine-readable and stay null; unit is left empty because
    // no figure is ever rendered next to it (D1 honesty).
    unit: '',
    scheduleUrl: 'https://www.censtatd.gov.hk/en/press_release_sc.html?scode=230&pcode=B1020003',
    sourceUrl: 'https://www.censtatd.gov.hk/en/scode230.html',
    // Reference month → 2026 release date (16:30 HKT).
    releases: [
      { dateUtc: '2026-01-27T08:30:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-02-27T08:30:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-26T08:30:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-28T08:30:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-28T08:30:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-25T08:30:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-27T08:30:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-25T08:30:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-24T08:30:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-28T08:30:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-26T08:30:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-28T08:30:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'zh-Hant',
    enabled: true,
  },
  // NOTE: HK GDP advance estimate (季頻) is intentionally NOT encoded yet. The
  // 2026 PDF linearised ambiguously on the exact release months during research
  // (docs/conversations/2026-08-03-calendar-multi-region-research.md 發現 3),
  // and shipping a wrong economic-release date violates rule 00 (資料正確性).
  // Deferred to a follow-up once the PDF table is re-read precisely.
] as const;

/** The subset the fetcher should actually poll. */
export function enabledCalendarIndicators(): readonly CalendarIndicatorSource[] {
  return CALENDAR_INDICATOR_SOURCES.filter((s) => s.enabled);
}

/**
 * The enabled indicators served by a given official provider (ADR-0061 D2).
 * Each `ICalendarProvider` implementation uses this to poll only its own
 * authority's indicators, so a broken source is isolated to one provider.
 */
export function calendarIndicatorsForProvider(
  provider: CalendarProvider,
): readonly CalendarIndicatorSource[] {
  return CALENDAR_INDICATOR_SOURCES.filter((s) => s.enabled && s.provider === provider);
}
