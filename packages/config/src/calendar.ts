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
 * EU/euro area (Eurostat) + Hong Kong (C&SD) land first; UK ONS + Canada
 * StatCan follow (batch 2); Mainland China (NBS), Australia (ABS) and Japan
 * (e-Stat) land in batch 3. Each
 * indicator records WHICH official provider serves it (`provider`) and the
 * provider-specific identifier(s) it needs, so a new authority is an additive
 * config + one pluggable `ICalendarProvider`, never a rewrite.
 *
 * Compliance note for CN (ADR-0058 D1 / ADR-0061 D4): ONLY the National Bureau
 * of Statistics of China (NBS) — the primary official statistical authority —
 * is a source. Private manufacturing PMIs (Caixin / S&P Global / au Jibun /
 * Nikkei etc.) are deliberately NEVER ingested; the NBS's own official
 * Manufacturing PMI is a first-party fact and is fine.
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
export type CalendarRegion = 'US' | 'HK' | 'CN' | 'EU' | 'EA' | 'GB' | 'CA' | 'AU' | 'JP' | 'NZ';

/**
 * The official statistical authority / API that serves an indicator's release
 * schedule (ADR-0061 D2). Each maps to one pluggable `ICalendarProvider` with
 * isolated per-source failure. A commercial aggregator is deliberately NOT a
 * provider (ADR-0058/0061 D4).
 */
export type CalendarProvider =
  | 'FRED'
  | 'EUROSTAT'
  | 'HK_CSD'
  | 'ONS'
  | 'STATCAN'
  | 'NBS'
  | 'ABS'
  | 'ESTAT'
  | 'STATSNZ';

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
  NZ: '🇳🇿',
};

/**
 * A pre-announced official release, encoded from an authority's published
 * annual schedule when it exposes no machine-readable API (ADR-0061 D2 — e.g.
 * Hong Kong C&SD, whose only source is the annual PDF at a fixed 16:30 HKT, and
 * Mainland China's NBS, whose only source is the annual "Regular Press Release
 * Calendar" at 9:30/10:00 Beijing time). The `HK_CSD` and `NBS` providers read
 * these verbatim; no external fetch is made.
 */
export type CalendarConfiguredRelease = {
  /**
   * Release timestamp as an ISO-8601 UTC string, pre-converted from the
   * authority's local release time (both HK and Beijing are UTC+8 with no DST,
   * so HK 16:30 = 08:30 UTC, Beijing 09:30 = 01:30 UTC, Beijing 10:00 = 02:00
   * UTC).
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
   * ONS release-calendar URI slug prefix to match on (ADR-0061 D2 batch 2).
   * The UK ONS releases API (`api.beta.ons.gov.uk`) returns one entry per
   * dated release whose `uri` is a stable `/releases/<slug><period>` — e.g.
   * `/releases/consumerpriceinflationukjuly2026`. The ONS provider maps a
   * release to this indicator when the slug (after `/releases/`) starts with
   * this prefix (excluding the `…timeseries` duplicate). Present only for
   * `provider: 'ONS'` indicators. ONS exposes the schedule only (no values),
   * so such events stay `previous/actual = null` — honest and compliant (D1).
   */
  readonly onsUriPrefix?: string;
  /**
   * Statistics Canada "The Daily" release-schedule title to match on
   * (ADR-0061 D2 batch 2). StatCan's key-indicators schedule JSON
   * (`schedule-key_indicators-eng.json`) lists each forthcoming release with a
   * stable official `title` (e.g. "Consumer Price Index") and a `description`
   * period (e.g. "June 2026" / "Second quarter 2026"). The StatCan provider
   * maps a release to this indicator by an exact, case-insensitive `title`
   * match. Present only for `provider: 'STATCAN'` indicators. StatCan's
   * schedule carries no values, so such events stay `previous/actual = null`
   * — honest and compliant (D1). Release time is a fixed 08:30 Eastern (The
   * Daily), converted to UTC with DST awareness by the provider.
   */
  readonly statcanTitle?: string;
  /**
   * Australian Bureau of Statistics future-release product name to match on
   * (ADR-0061 D2 batch 3). ABS exposes no clean JSON release-schedule API; its
   * official forward calendar is the `/release-calendar/future-releases` page,
   * where each upcoming release is a semantic Drupal row carrying a
   * machine-readable UTC `<time datetime="…Z">`, a period-less product
   * `event-name` (e.g. "Consumer Price Index, Australia"), and a
   * `reference-period-value`. The ABS provider maps a release to this indicator
   * by an exact, case-insensitive `event-name` match. Present only for
   * `provider: 'ABS'` indicators. The page exposes no figures, so such events
   * stay `previous/actual = null` — honest and compliant (D1). The release time
   * is read directly from the `datetime` attribute (already UTC, so no DST math
   * is needed — ABS itself accounts for AEST/AEDT). `absEventName` values are
   * verified against the live future-release list.
   */
  readonly absEventName?: string;
  /**
   * Japan e-Stat government-statistics code (政府統計コード) to match on
   * (ADR-0061 D2 batch 3). Japan's official portal e-Stat exposes its forward
   * release schedule not via its appId REST API (which only lists already-
   * published tables, no forward calendar) but via the key-less "公表予定"
   * (release-calendar) Drupal page, whose semantic rows each carry the release
   * datetime (`data-kensakuKouhyou_date`, JST), the issuing ministry, and a
   * stable statistics code (`data-toukei_cd`) plus the release name+period. The
   * e-Stat provider fetches that page (key-less) and maps a release to this
   * indicator by an exact `data-toukei_cd` match, further narrowed by
   * `estatNameIncludes` / `estatNameExcludes` (one `toukei_cd` groups a family
   * of release variants — e.g. national vs Tokyo-ward CPI, or 1st vs 2nd
   * preliminary GDP — so the name filter isolates the single headline release
   * and prevents `(indicatorCode, periodLabel)` upsert collisions). Present only
   * for `provider: 'ESTAT'` indicators. The page exposes no figures, so such
   * events stay `previous/actual = null` — honest and compliant (D1). Release
   * time is read from `data-kensakuKouhyou_date` (JST = UTC+9, no DST) and
   * converted to UTC by the provider (no date library — D7). Codes + filters are
   * verified against the live release-calendar (2026-08-04).
   */
  readonly estatToukeiCode?: string;
  /**
   * Substrings that must ALL be present in an e-Stat release name for it to map
   * to this indicator (ADR-0061 D2 batch 3). Used with `estatToukeiCode` to pick
   * the single headline release out of a `toukei_cd` family (e.g. `['全国']`
   * for national CPI, `['基本集計']` for the headline Labour Force tabulation,
   * `['1次速報']` for the first-preliminary GDP). Present only for
   * `provider: 'ESTAT'`.
   */
  readonly estatNameIncludes?: readonly string[];
  /**
   * Substrings that must NOT appear in an e-Stat release name (ADR-0061 D2
   * batch 3). Excludes sibling variants sharing the same `toukei_cd` that would
   * otherwise collide on the upsert key or misrepresent the indicator (e.g.
   * `['東京都区部','遡及']` off national CPI, `['詳細集計']` off the headline
   * Labour Force, `['2次速報']` off first-preliminary GDP, `['確報']` off the
   * preliminary Industrial Production). Present only for `provider: 'ESTAT'`.
   */
  readonly estatNameExcludes?: readonly string[];
  /**
   * Stats NZ release-calendar statistic-name prefix to match on (ADR-0061 D2
   * batch 3). New Zealand's Stats NZ exposes its official forward schedule via
   * the key-less month endpoint `/api/v1/releaseCalendarMonth/<YYYY-MM>`
   * (browser-like headers required — the site sits behind an Incapsula WAF that
   * 403s the legacy `.json` asset path but serves this JSON API). Each release's
   * `DisplayName` is consistently `"<statistic name>: <period>"` (e.g.
   * "Consumers price index: June 2026 quarter"), so the Stats NZ provider maps a
   * release to this indicator by an exact, case-insensitive match of the name
   * BEFORE the first colon. Splitting on the first colon cleanly separates
   * sibling releases (e.g. "Labour market statistics" vs "Labour market
   * statistics (income)"). Present only for `provider: 'STATSNZ'` indicators.
   * The endpoint exposes no figures, so such events stay `previous/actual = null`
   * — honest and compliant (D1). Release time is a fixed 10:45 Pacific/Auckland,
   * converted to UTC with DST awareness by the provider (NZDT = UTC+13 late
   * Sep–early Apr, NZST = UTC+12 otherwise; no date library — D7). Prefixes are
   * verified against the live release-calendar (2026-08-04).
   */
  readonly statsNzTitlePrefix?: string;
  /**
   * Pre-encoded official release schedule for authorities with no
   * machine-readable API (ADR-0061 D2). Present for `provider: 'HK_CSD'`
   * (C&SD annual PDF schedule, 16:30 HKT) and `provider: 'NBS'` (Mainland
   * China's National Bureau of Statistics annual "Regular Press Release
   * Calendar", 9:30/10:00 Beijing time). Values are not published in
   * machine-readable form, so these events carry the schedule + period only
   * (`previous/actual = null`) — honest and compliant (D1).
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
  // --- United Kingdom — Office for National Statistics (ADR-0061 batch 2) ----
  // Served by the ONS provider via the official releases API
  // (`api.beta.ons.gov.uk/v1/search/releases`, key-less). The API lists each
  // dated release with a stable `/releases/<slug><period>` uri; the provider
  // maps a release to an indicator by `onsUriPrefix` (the stable slug prefix,
  // excluding the `…timeseries` duplicate). ONS exposes the schedule only, so
  // these events carry release time + period with `previous/actual = null`
  // (honest, D1). `onsUriPrefix` is verified against the live upcoming list.
  {
    indicatorCode: 'GB_CPI_YOY',
    provider: 'ONS',
    authority: 'Office for National Statistics',
    nameZhHant: '英國消費者物價指數（按年）',
    nameZhHans: '英国消费者物价指数（按年）',
    nameEn: 'UK Consumer Price Inflation (YoY)',
    region: 'GB',
    category: 'INFLATION',
    unit: '%_YOY',
    scheduleUrl: 'https://www.ons.gov.uk/releasecalendar',
    sourceUrl:
      'https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/latest',
    onsUriPrefix: 'consumerpriceinflationuk',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'GB_GDP_MONTHLY',
    provider: 'ONS',
    authority: 'Office for National Statistics',
    nameZhHant: '英國國內生產總值（月度估計）',
    nameZhHans: '英国国内生产总值（月度估计）',
    nameEn: 'UK GDP monthly estimate',
    region: 'GB',
    category: 'GROWTH',
    unit: '%_MOM',
    scheduleUrl: 'https://www.ons.gov.uk/releasecalendar',
    sourceUrl:
      'https://www.ons.gov.uk/economy/grossdomesticproductgdp/bulletins/gdpmonthlyestimateuk/latest',
    onsUriPrefix: 'gdpmonthlyestimateuk',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'GB_LABOUR_MARKET',
    provider: 'ONS',
    authority: 'Office for National Statistics',
    nameZhHant: '英國勞動市場統計',
    nameZhHans: '英国劳动市场统计',
    nameEn: 'UK labour market',
    region: 'GB',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www.ons.gov.uk/releasecalendar',
    sourceUrl:
      'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/uklabourmarket/latest',
    onsUriPrefix: 'uklabourmarket',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'GB_RETAIL_SALES',
    provider: 'ONS',
    authority: 'Office for National Statistics',
    nameZhHant: '英國零售銷售',
    nameZhHans: '英国零售销售',
    nameEn: 'UK retail sales',
    region: 'GB',
    category: 'OTHER',
    unit: '%_MOM',
    scheduleUrl: 'https://www.ons.gov.uk/releasecalendar',
    sourceUrl:
      'https://www.ons.gov.uk/businessindustryandtrade/retailindustry/bulletins/retailsales/latest',
    onsUriPrefix: 'retailsalesgreatbritain',
    lang: 'en',
    enabled: true,
  },

  // --- Canada — Statistics Canada (ADR-0061 batch 2) ------------------------
  // Served by the StatCan provider via the official key-indicators release
  // schedule JSON (`schedule-key_indicators-eng.json`, key-less), which lists
  // each forthcoming release with a stable official `title` + `description`
  // period. The provider maps a release to an indicator by exact `title`
  // match; release time is a fixed 08:30 Eastern (The Daily), DST-converted to
  // UTC by the provider. Schedule-only, so `previous/actual = null` (honest,
  // D1). `statcanTitle` values are verified against the live schedule.
  {
    indicatorCode: 'CA_CPI_YOY',
    provider: 'STATCAN',
    authority: 'Statistics Canada',
    nameZhHant: '加拿大消費者物價指數（按年）',
    nameZhHans: '加拿大消费者物价指数（按年）',
    nameEn: 'Canada Consumer Price Index (YoY)',
    region: 'CA',
    category: 'INFLATION',
    unit: '%_YOY',
    scheduleUrl: 'https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-eng.htm',
    sourceUrl:
      'https://www.statcan.gc.ca/en/subjects-start/prices_and_price_indexes/consumer_price_indexes',
    statcanTitle: 'Consumer Price Index',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'CA_GDP_MONTHLY',
    provider: 'STATCAN',
    authority: 'Statistics Canada',
    nameZhHant: '加拿大國內生產總值（按行業）',
    nameZhHans: '加拿大国内生产总值（按行业）',
    nameEn: 'Canada GDP by industry',
    region: 'CA',
    category: 'GROWTH',
    unit: '%_MOM',
    scheduleUrl: 'https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-eng.htm',
    sourceUrl:
      'https://www.statcan.gc.ca/en/subjects-start/economic_accounts/gross_domestic_product',
    statcanTitle: 'Gross domestic product by industry',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'CA_LABOUR_FORCE_SURVEY',
    provider: 'STATCAN',
    authority: 'Statistics Canada',
    nameZhHant: '加拿大勞動力調查',
    nameZhHans: '加拿大劳动力调查',
    nameEn: 'Canada Labour Force Survey',
    region: 'CA',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-eng.htm',
    sourceUrl: 'https://www.statcan.gc.ca/en/subjects-start/labour_',
    statcanTitle: 'Labour Force Survey',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'CA_RETAIL_TRADE',
    provider: 'STATCAN',
    authority: 'Statistics Canada',
    nameZhHant: '加拿大零售貿易',
    nameZhHans: '加拿大零售贸易',
    nameEn: 'Canada retail trade',
    region: 'CA',
    category: 'OTHER',
    unit: '%_MOM',
    scheduleUrl: 'https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-eng.htm',
    sourceUrl:
      'https://www.statcan.gc.ca/en/subjects-start/business_performance_and_ownership/retail_and_wholesale',
    statcanTitle: 'Retail trade',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'CA_MERCHANDISE_TRADE',
    provider: 'STATCAN',
    authority: 'Statistics Canada',
    nameZhHant: '加拿大國際商品貿易',
    nameZhHans: '加拿大国际商品贸易',
    nameEn: 'Canada international merchandise trade',
    region: 'CA',
    category: 'TRADE',
    unit: '',
    scheduleUrl: 'https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-eng.htm',
    sourceUrl: 'https://www.statcan.gc.ca/en/subjects-start/international_trade',
    statcanTitle: 'Canadian international merchandise trade',
    lang: 'en',
    enabled: true,
  },

  // --- Mainland China — National Bureau of Statistics (ADR-0061 batch 3) ----
  // NBS is China's primary official statistical authority. It exposes NO
  // machine-readable release API — its only forward schedule is the annual
  // "Regular Press Release Calendar of NBS" (published each December for the
  // coming year). So, like HK C&SD, the NBS provider makes no network call: it
  // reads the pre-encoded official schedule below (already in UTC). The 2026
  // dates are transcribed verbatim from the official English calendar
  // (stats.gov.cn/english/PressRelease/ReleaseCalendar/, 2026 edition,
  // published 2025-12-26). Beijing time (UTC+8, no DST): CPI/PPI/PMI at 09:30
  // = 01:30 UTC; National Economic Performance (GDP) at 10:00 = 02:00 UTC.
  // NOTE (rule 00 資料正確性): this is a per-year table (dates are "preliminary
  // and subject to adjustment" per the NBS note) — NBS publishes the next
  // year's calendar each December, so these `releases` arrays MUST be refreshed
  // annually (tracked in docs/03-status.md). Values (previous/actual) are not
  // machine-readable, so these events carry the schedule + period only
  // (`previous/actual = null`) — honest and compliant (D1). ONLY NBS official
  // indicators are here; private PMIs (Caixin/S&P Global) are excluded (D4).
  {
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
    // "National Economic Performance" (quarterly), released Jan/Apr/Jul/Oct at
    // 10:00 Beijing; periodLabel = the quarter reported.
    releases: [
      { dateUtc: '2026-01-19T02:00:00.000Z', periodLabel: '2025 Q4' },
      { dateUtc: '2026-04-16T02:00:00.000Z', periodLabel: '2026 Q1' },
      { dateUtc: '2026-07-15T02:00:00.000Z', periodLabel: '2026 Q2' },
      { dateUtc: '2026-10-19T02:00:00.000Z', periodLabel: '2026 Q3' },
    ],
    lang: 'en',
    enabled: true,
  },
  {
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
    // Monthly report at 09:30 Beijing; presents the previous month's data.
    releases: [
      { dateUtc: '2026-01-09T01:30:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-02-11T01:30:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-09T01:30:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-10T01:30:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-11T01:30:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-10T01:30:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-09T01:30:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-09T01:30:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-09T01:30:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-14T01:30:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-09T01:30:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-09T01:30:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'CN_PPI_YOY',
    provider: 'NBS',
    authority: 'National Bureau of Statistics of China',
    nameZhHant: '中國工業生產者出廠價格指數（按年）',
    nameZhHans: '中国工业生产者出厂价格指数（按年）',
    nameEn: 'China Producer Price Index (YoY)',
    region: 'CN',
    category: 'INFLATION',
    unit: '%_YOY',
    scheduleUrl: 'https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/',
    sourceUrl: 'https://www.stats.gov.cn/english/PressRelease/',
    // Monthly report at 09:30 Beijing (same dates as CPI); previous month.
    releases: [
      { dateUtc: '2026-01-09T01:30:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-02-11T01:30:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-09T01:30:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-10T01:30:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-11T01:30:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-10T01:30:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-09T01:30:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-09T01:30:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-09T01:30:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-14T01:30:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-09T01:30:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-09T01:30:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'CN_MANUFACTURING_PMI',
    provider: 'NBS',
    authority: 'National Bureau of Statistics of China',
    nameZhHant: '中國製造業採購經理指數（官方）',
    nameZhHans: '中国制造业采购经理指数（官方）',
    nameEn: 'China Manufacturing PMI (official)',
    region: 'CN',
    category: 'OTHER',
    // Index points; no figure is rendered (values not machine-readable), so the
    // unit is left empty (D1 honesty), mirroring HK external trade.
    unit: '',
    scheduleUrl: 'https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/',
    sourceUrl: 'https://www.stats.gov.cn/english/PressRelease/',
    // Monthly report at 09:30 Beijing; unlike the others, the PMI presents the
    // CURRENT month's data (NBS note 2). February's PMI is released on March 4
    // due to the Spring Festival (NBS note 5); periodLabel = the month surveyed.
    releases: [
      { dateUtc: '2026-01-31T01:30:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-04T01:30:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-03-31T01:30:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-04-30T01:30:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-05-31T01:30:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-06-30T01:30:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-07-31T01:30:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-08-31T01:30:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-09-30T01:30:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-10-31T01:30:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-11-30T01:30:00.000Z', periodLabel: '2026-11' },
      { dateUtc: '2026-12-31T01:30:00.000Z', periodLabel: '2026-12' },
    ],
    lang: 'en',
    enabled: true,
  },

  // --- Australia — Australian Bureau of Statistics (ADR-0061 batch 3) -------
  // ABS is Australia's primary official statistical authority. It exposes no
  // clean JSON release-schedule API; its official forward calendar is the
  // `/release-calendar/future-releases` page, whose semantic Drupal rows each
  // carry a machine-readable UTC `<time datetime="…Z">`, a period-less product
  // `event-name`, and a `reference-period-value`. The ABS provider fetches that
  // page (key-less) and maps a release to an indicator by exact, case-
  // insensitive `absEventName` match; the release time is read straight from
  // the `datetime` attribute (already UTC — ABS accounts for AEST/AEDT itself,
  // so no DST math). The page shows only a rolling near-term window and no
  // figures, so these events carry release time + period with
  // `previous/actual = null` (honest, D1). ONLY ABS first-party indicators are
  // here; private Manufacturing PMIs (S&P Global / Judo Bank / AiG) are
  // deliberately excluded (ADR-0061 D4). `absEventName` values are verified
  // against the live future-release list (2026-08-04).
  {
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
    sourceUrl:
      'https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/latest-release',
    absEventName: 'Consumer Price Index, Australia',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'AU_GDP',
    provider: 'ABS',
    authority: 'Australian Bureau of Statistics',
    nameZhHant: '澳洲國內生產總值（國民所得帳）',
    nameZhHans: '澳洲国内生产总值（国民所得帐）',
    nameEn: 'Australia GDP (National Accounts)',
    region: 'AU',
    category: 'GROWTH',
    unit: '%',
    scheduleUrl: 'https://www.abs.gov.au/release-calendar/future-releases',
    sourceUrl: 'https://www.abs.gov.au/statistics/economy/national-accounts',
    absEventName: 'Australian National Accounts: National Income, Expenditure and Product',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'AU_LABOUR_FORCE',
    provider: 'ABS',
    authority: 'Australian Bureau of Statistics',
    nameZhHant: '澳洲勞動力（失業率）',
    nameZhHans: '澳洲劳动力（失业率）',
    nameEn: 'Australia Labour Force',
    region: 'AU',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www.abs.gov.au/release-calendar/future-releases',
    sourceUrl:
      'https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia/latest-release',
    absEventName: 'Labour Force, Australia',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'AU_WAGE_PRICE_INDEX',
    provider: 'ABS',
    authority: 'Australian Bureau of Statistics',
    nameZhHant: '澳洲工資價格指數',
    nameZhHans: '澳洲工资价格指数',
    nameEn: 'Australia Wage Price Index',
    region: 'AU',
    category: 'EMPLOYMENT',
    unit: '%_YOY',
    scheduleUrl: 'https://www.abs.gov.au/release-calendar/future-releases',
    sourceUrl:
      'https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/wage-price-index-australia/latest-release',
    absEventName: 'Wage Price Index, Australia',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'AU_INTL_TRADE_GOODS',
    provider: 'ABS',
    authority: 'Australian Bureau of Statistics',
    nameZhHant: '澳洲商品國際貿易',
    nameZhHans: '澳洲商品国际贸易',
    nameEn: 'Australia International Trade in Goods',
    region: 'AU',
    category: 'TRADE',
    unit: '',
    scheduleUrl: 'https://www.abs.gov.au/release-calendar/future-releases',
    sourceUrl:
      'https://www.abs.gov.au/statistics/economy/international-trade/international-trade-goods/latest-release',
    absEventName: 'International Trade in Goods',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'AU_HOUSEHOLD_SPENDING',
    provider: 'ABS',
    authority: 'Australian Bureau of Statistics',
    nameZhHant: '澳洲每月家庭消費指標',
    nameZhHans: '澳洲每月家庭消费指标',
    nameEn: 'Australia Monthly Household Spending Indicator',
    region: 'AU',
    category: 'OTHER',
    unit: '%_MOM',
    scheduleUrl: 'https://www.abs.gov.au/release-calendar/future-releases',
    sourceUrl:
      'https://www.abs.gov.au/statistics/economy/finance/monthly-household-spending-indicator/latest-release',
    absEventName: 'Monthly Household Spending Indicator',
    lang: 'en',
    enabled: true,
  },

  // --- Japan — e-Stat (公表予定) official release calendar (ADR-0061 batch 3) -
  // e-Stat (政府統計の総合窓口) is Japan's official statistics portal. Its appId
  // REST API only lists already-published tables (past OPEN_DATE), NOT a forward
  // release schedule; the forward schedule is the key-less "公表予定"
  // (release-calendar) Drupal page. The e-Stat provider fetches that page
  // (key-less) and maps a release to an indicator by its stable government-
  // statistics code (`data-toukei_cd` → `estatToukeiCode`), narrowed by
  // `estatNameIncludes` / `estatNameExcludes` so exactly one headline release
  // per family is taken (each `toukei_cd` groups variants — national vs Tokyo
  // CPI, 1st vs 2nd preliminary GDP, preliminary vs final IP — that must not
  // collide on the upsert key). Release time is JST (UTC+9, no DST), converted
  // to UTC by the provider (no date library — D7). The page shows only a rolling
  // near-term window and no figures, so these events carry release time + period
  // with `previous/actual = null` (honest, D1). ONLY primary government
  // authorities (総務省 統計局 / 内閣府 / 経済産業省 / 財務省) are sourced;
  // private PMIs (au Jibun Bank / Nikkei / S&P Global) are NOT government
  // statistics, never appear in this official calendar, and are excluded by
  // design (ADR-0061 D4). Codes + name filters are verified against the live
  // release-calendar (2026-08-04).
  {
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
    // National CPI only — exclude the Tokyo-ward advance and the 2025-base
    // rebasing/back-cast (遡及) special release, both of which share this code.
    estatNameIncludes: ['全国'],
    estatNameExcludes: ['東京都区部', '遡及'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'JP_GDP',
    provider: 'ESTAT',
    authority: 'Cabinet Office',
    nameZhHant: '日本實質國內生產總值（初值）',
    nameZhHans: '日本实际国内生产总值（初值）',
    nameEn: 'Japan Real GDP (1st preliminary)',
    region: 'JP',
    category: 'GROWTH',
    unit: '%',
    scheduleUrl: 'https://www.e-stat.go.jp/release-calendar',
    sourceUrl: 'https://www.esri.cao.go.jp/jp/sna/sokuhou/sokuhou_top.html',
    estatToukeiCode: '00100409',
    // Quarterly QE (四半期別ＧＤＰ速報): take the 1st preliminary only; the 2nd
    // preliminary revision of the same quarter would collide on the period key.
    estatNameIncludes: ['1次速報'],
    estatNameExcludes: ['2次速報'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'JP_LABOUR_FORCE',
    provider: 'ESTAT',
    authority: 'Statistics Bureau of Japan',
    nameZhHant: '日本勞動力調查（失業率）',
    nameZhHans: '日本劳动力调查（失业率）',
    nameEn: 'Japan Labour Force Survey (unemployment)',
    region: 'JP',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www.e-stat.go.jp/release-calendar',
    sourceUrl: 'https://www.stat.go.jp/data/roudou/index.html',
    estatToukeiCode: '00200531',
    // Headline monthly basic tabulation (基本集計); exclude the quarterly
    // detailed tabulation (詳細集計) that shares this code and period.
    estatNameIncludes: ['基本集計'],
    estatNameExcludes: ['詳細集計'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'JP_INDUSTRIAL_PRODUCTION',
    provider: 'ESTAT',
    authority: 'Ministry of Economy, Trade and Industry',
    nameZhHant: '日本工業生產指數（速報）',
    nameZhHans: '日本工业生产指数（速报）',
    nameEn: 'Japan Industrial Production (preliminary)',
    region: 'JP',
    category: 'OTHER',
    unit: '%_MOM',
    scheduleUrl: 'https://www.e-stat.go.jp/release-calendar',
    sourceUrl: 'https://www.meti.go.jp/statistics/tyo/iip/index.html',
    estatToukeiCode: '00550300',
    // Take the preliminary (速報) release; the later final revision (確報) of
    // the same month shares this code and would collide on the period key.
    estatNameIncludes: ['速報'],
    estatNameExcludes: ['確報'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'JP_TRADE_BALANCE',
    provider: 'ESTAT',
    authority: 'Ministry of Finance',
    nameZhHant: '日本貿易統計（商品貿易）',
    nameZhHans: '日本贸易统计（商品贸易）',
    nameEn: 'Japan Trade Statistics (merchandise)',
    region: 'JP',
    category: 'TRADE',
    // Values are not machine-readable and stay null; unit is left empty because
    // no figure is ever rendered next to it (D1 honesty), mirroring HK/CN trade.
    unit: '',
    scheduleUrl: 'https://www.e-stat.go.jp/release-calendar',
    sourceUrl: 'https://www.customs.go.jp/toukei/info/index.htm',
    estatToukeiCode: '00350300',
    // One headline release per month: the export-final / import-9-digit-prelim
    // (輸出確報) print. Excludes the later import-final (輸入確報) of an earlier
    // month released the same day and the annual final (確定) — both lack this
    // token — so no period-key collision. Period is Reiwa-era dated.
    estatNameIncludes: ['輸出確報'],
    lang: 'en',
    enabled: true,
  },

  // --- New Zealand — Stats NZ (Tatauranga Aotearoa) (ADR-0061 batch 3) ------
  // Stats NZ is New Zealand's primary official statistical authority. Its
  // release calendar (the `.json` asset path 403s behind an Incapsula WAF) is
  // served as clean JSON by the key-less month endpoint
  // `/api/v1/releaseCalendarMonth/<YYYY-MM>` when fetched with browser-like
  // headers. Each release's `DisplayName` is "<statistic name>: <period>", so
  // the Stats NZ provider fetches the months spanning its window (key-less) and
  // maps a release to an indicator by an exact, case-insensitive match of the
  // name before the first colon (`statsNzTitlePrefix`). Splitting on the first
  // colon cleanly isolates sibling releases (e.g. the headline "Labour market
  // statistics" from "Labour market statistics (income)"). Release time is a
  // fixed 10:45 Pacific/Auckland, DST-converted to UTC by the provider. The
  // endpoint carries no figures, so these events carry release time + period
  // with `previous/actual = null` (honest, D1). ONLY Stats NZ first-party
  // indicators are here; New Zealand's private PMI/PSI (BusinessNZ) are NOT
  // official statistics and are deliberately excluded (ADR-0061 D4). Prefixes
  // are verified against the live release-calendar (2026-08-04).
  {
    indicatorCode: 'NZ_CPI',
    provider: 'STATSNZ',
    authority: 'Stats NZ',
    nameZhHant: '紐西蘭消費者物價指數（按季）',
    nameZhHans: '新西兰消费者物价指数（按季）',
    nameEn: 'New Zealand Consumers Price Index',
    region: 'NZ',
    category: 'INFLATION',
    unit: '%_YOY',
    scheduleUrl: 'https://www.stats.govt.nz/release-calendar/',
    sourceUrl: 'https://www.stats.govt.nz/topics/prices',
    statsNzTitlePrefix: 'Consumers price index',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'NZ_GDP',
    provider: 'STATSNZ',
    authority: 'Stats NZ',
    nameZhHant: '紐西蘭國內生產總值（按季）',
    nameZhHans: '新西兰国内生产总值（按季）',
    nameEn: 'New Zealand Gross Domestic Product',
    region: 'NZ',
    category: 'GROWTH',
    unit: '%',
    scheduleUrl: 'https://www.stats.govt.nz/release-calendar/',
    sourceUrl: 'https://www.stats.govt.nz/topics/economic-growth',
    statsNzTitlePrefix: 'Gross domestic product',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'NZ_LABOUR_MARKET',
    provider: 'STATSNZ',
    authority: 'Stats NZ',
    nameZhHant: '紐西蘭勞動市場統計（失業率）',
    nameZhHans: '新西兰劳动市场统计（失业率）',
    nameEn: 'New Zealand Labour Market Statistics',
    region: 'NZ',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www.stats.govt.nz/release-calendar/',
    sourceUrl: 'https://www.stats.govt.nz/topics/employment-and-unemployment',
    // Exact prefix before the first colon; the "(income)" sibling release has a
    // different prefix ("Labour market statistics (income)") so it never maps
    // to this headline unemployment indicator.
    statsNzTitlePrefix: 'Labour market statistics',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'NZ_TRADE_BALANCE',
    provider: 'STATSNZ',
    authority: 'Stats NZ',
    nameZhHant: '紐西蘭商品對外貿易',
    nameZhHans: '新西兰商品对外贸易',
    nameEn: 'New Zealand Overseas Merchandise Trade',
    region: 'NZ',
    category: 'TRADE',
    // Values are not machine-readable and stay null; unit is left empty because
    // no figure is ever rendered next to it (D1 honesty), mirroring HK/CN/JP.
    unit: '',
    scheduleUrl: 'https://www.stats.govt.nz/release-calendar/',
    sourceUrl: 'https://www.stats.govt.nz/topics/imports-and-exports',
    statsNzTitlePrefix: 'Overseas merchandise trade',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'NZ_BUILDING_CONSENTS',
    provider: 'STATSNZ',
    authority: 'Stats NZ',
    nameZhHant: '紐西蘭已核准建築許可',
    nameZhHans: '新西兰已核准建筑许可',
    nameEn: 'New Zealand Building Consents Issued',
    region: 'NZ',
    category: 'OTHER',
    unit: '%_MOM',
    scheduleUrl: 'https://www.stats.govt.nz/release-calendar/',
    sourceUrl: 'https://www.stats.govt.nz/topics/building-and-construction',
    statsNzTitlePrefix: 'Building consents issued',
    lang: 'en',
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
