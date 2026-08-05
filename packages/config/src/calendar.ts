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
export type CalendarRegion =
  | 'US'
  | 'HK'
  | 'CN'
  | 'EU'
  | 'EA'
  | 'GB'
  | 'CA'
  | 'AU'
  | 'JP'
  | 'NZ'
  | 'KR'
  | 'ID'
  | 'VN'
  | 'SG';

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
  | 'STATSNZ'
  | 'KOSTAT'
  | 'BPS'
  | 'GSO'
  | 'SINGSTAT';

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
  KR: '🇰🇷',
  ID: '🇮🇩',
  VN: '🇻🇳',
  SG: '🇸🇬',
};

/**
 * A pre-announced official release, encoded from an authority's published
 * annual schedule when it exposes no machine-readable API (ADR-0061 D2 — e.g.
 * Hong Kong C&SD, whose only source is the annual PDF at a fixed 16:30 HKT, and
 * Mainland China's NBS, whose only source is the annual "Regular Press Release
 * Calendar" at 9:30/10:00 Beijing time, and Indonesia's BPS annual Advance
 * Release Calendar at 11:00 WIB, whose whole site sits behind a Cloudflare
 * challenge so it cannot be fetched live). The `HK_CSD`, `NBS`, `KOSTAT` and
 * `BPS` providers read these verbatim; no external fetch is made.
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
   * Optional FRED `units` transformation applied to the observations so the
   * stored figure matches the indicator's headline definition (and its `unit`
   * label) rather than the raw series level (ADR-0058 D1 — the figure must be
   * the authority's own reported number). FRED computes these standard
   * transformations itself, so provenance stays with the official data
   * warehouse. Omitted → `lin` (raw level). Values used:
   *   - `pc1` — percent change from a year ago (year-over-year %), e.g. CPI YoY.
   *   - `chg` — change from the previous period, e.g. nonfarm payrolls (monthly
   *     change in thousands, not the total employment level).
   * See <https://fred.stlouisfed.org/docs/api/fred/series_observations.html>.
   * Present only for `provider: 'FRED'` indicators.
   */
  readonly fredUnits?: 'pc1' | 'chg';
  /**
   * Eurostat release-calendar title to match on (ADR-0061 D2). Eurostat's
   * `eventsJson` endpoint returns stable, periodic official titles (e.g.
   * "Flash estimate inflation euro area"); the Eurostat provider maps a
   * release to this indicator by an exact, case-insensitive title match.
   * Present only for `provider: 'EUROSTAT'` indicators. The `eventsJson`
   * calendar itself carries no figures; released values are backfilled from
   * the dissemination API via `eurostatDataset` / `eurostatFilters` below.
   */
  readonly eurostatTitle?: string;
  /**
   * Eurostat dissemination-API dataset code used to backfill the released
   * `previous` / `actual` figures (ADR-0058 D3 two-phase population, Q3-B
   * value backfill). The key-less statistics endpoint
   * `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<dataset>`
   * returns the authority's own published observations as JSON-stat — always
   * facts, never a forecast/consensus (D1). Dataset codes are verified against
   * the live API, NOT copied blindly from the release calendar's
   * `datasetCodes` hint: e.g. the calendar still lists `prc_hicp_manr` for
   * HICP, but that series was frozen at 2025-12 by the 2026 rebase
   * (2025=100) — the live successor is `prc_hicp_minr` (verified 2026-08-05,
   * figures cross-checked against the official euro-indicators news
   * releases). Present only for `provider: 'EUROSTAT'` indicators; omitted →
   * schedule-only (values stay null).
   */
  readonly eurostatDataset?: string;
  /**
   * Dimension filters appended to the `eurostatDataset` query so exactly one
   * series (one value per period) is returned, matching the indicator's
   * headline definition and `unit` label — e.g. `unit: 'RCH_A'` (annual rate
   * of change) for a `%_YOY` indicator, never the raw index level (the
   * US `CPIAUCSL` 333 lesson, rule 00). NOTE: the euro-area geo code is NOT
   * uniform across datasets — HICP/GDP carry the moving aggregate `EA` while
   * `une_rt_m` only carries the dated `EA21` — so the exact geo is part of
   * this per-indicator config, verified per dataset. Present only with
   * `eurostatDataset`.
   */
  readonly eurostatFilters?: Readonly<Record<string, string>>;
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
   * Substrings that must ALL be present in a Vietnam GSO release title for it to
   * map to this indicator (ADR-0061 D2, batch 4). Vietnam's General Statistics
   * Office (rebranded the National Statistics Office of Vietnam; the old
   * gso.gov.vn now resolves to nso.gov.vn) publishes its official Advance
   * Release Calendar as a machine-readable `var events=[{title,status,date}]`
   * JSON array embedded in the key-less release-calendar page (no Cloudflare
   * challenge — a plain server-side fetch succeeds). Each release title embeds
   * the covered period at the START and the indicator name at the END (e.g.
   * "The January/2026 consumer price index (CPI), gold price index, USD price
   * index"), so the GSO provider maps a release to this indicator by matching
   * these substrings (case-insensitive, whitespace-collapsed) — e.g.
   * `['consumer price index (cpi)']` for CPI, `['gross domestic product (gdp)']`
   * for the headline GDP. Present only for `provider: 'GSO'` indicators. The
   * calendar exposes no figures, so such events stay `previous/actual = null`
   * — honest and compliant (D1). The ARC commits to a date only (the release
   * is officially held "in the morning"); the provider anchors the time at
   * 09:00 Hanoi (ICT = UTC+7, no DST → 02:00 UTC), the date being the
   * authoritative fact. Filters are verified against the live ARC (2026-08-04).
   */
  readonly gsoNameIncludes?: readonly string[];
  /**
   * Substrings that must NOT appear in a Vietnam GSO release title (ADR-0061 D2,
   * batch 4). Excludes sibling releases that share a headline substring but are
   * a different indicator (e.g. `['growth rate','per capita','structure']` off
   * the headline GDP, `['underemployment']` off the unemployment rate). Present
   * only for `provider: 'GSO'` indicators.
   */
  readonly gsoNameExcludes?: readonly string[];
  /**
   * SingStat (Singapore Department of Statistics) Advance Release Calendar
   * (ARC) title prefix to match on (ADR-0061 D2, batch 4). SingStat publishes
   * its official whole-year ARC as a machine-readable JSON array embedded in
   * the server-rendered ARC page's Next.js RSC payload (`{"arcData":{"data":
   * [{title,release_date,…}]}}`), served over CloudFront with NO WAF challenge
   * — so the SingStat provider fetches it live (like GB/CA/AU/JP/NZ/VN), no
   * annual transcription needed. Each release `title` is
   * "<indicator name>, <period>" (e.g. "CPI For General Households, Jul 2026" /
   * "Advance Gross Domestic Product (GDP) Estimates, 2Q 2026"), so the provider
   * maps a release to this indicator when the (whitespace-collapsed,
   * case-insensitive) title STARTS WITH this exact prefix — including the
   * trailing comma so a prefix can never bleed into a sibling series (e.g.
   * "CPI For General Households," never matches "CPI By Household Income
   * Group,"). The period is parsed from the title tail (month "Mon YYYY" →
   * "YYYY-MM", quarter "nQ YYYY" → "YYYY Qn"). Present only for
   * `provider: 'SINGSTAT'` indicators. The ARC exposes no figures, so such
   * events stay `previous/actual = null` — honest and compliant (D1). The
   * authoritative fact is the `release_date` (a single date); SingStat's
   * standard release time is 13:00 Singapore (SGT = UTC+8, no DST → 05:00 UTC),
   * anchored by the provider. Prefixes are verified against the live ARC
   * (2026-08-04).
   */
  readonly singstatTitlePrefix?: string;
  /**
   * Pre-encoded official release schedule for authorities with no
   * machine-readable API (ADR-0061 D2). Present for `provider: 'HK_CSD'`
   * (C&SD annual PDF schedule, 16:30 HKT), `provider: 'NBS'` (Mainland
   * China's National Bureau of Statistics annual "Regular Press Release
   * Calendar", 9:30/10:00 Beijing time), `provider: 'KOSTAT'` (Statistics
   * Korea's official annual release schedule, 08:00 KST) and `provider: 'BPS'`
   * (Statistics Indonesia's Advance Release Calendar, 11:00 WIB — the whole BPS
   * site sits behind a Cloudflare challenge, so it is transcribed rather than
   * fetched live). Values are not published in machine-readable form, so these
   * events carry the schedule + period only (`previous/actual = null`) — honest
   * and compliant (D1).
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
    // Headline CPI YoY is BLS's 12-month % change on the NON-seasonally-adjusted
    // index (CPIAUCNS); `pc1` makes FRED report that year-over-year % directly
    // rather than the raw index level (~333), matching the `%_YOY` unit.
    fredSeriesId: 'CPIAUCNS',
    fredUnits: 'pc1',
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
    // The market figure is the MONTHLY CHANGE in payrolls (~+150k), not the
    // total employment level (~159,000k). `chg` makes FRED report the
    // period-over-period change in thousands, matching the `k` unit + the
    // "Nonfarm Payrolls (change)" name.
    fredSeriesId: 'PAYEMS',
    fredUnits: 'chg',
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

  // --- EU / euro area — Eurostat (ADR-0061 batch 1; values Q3-B) -------------
  // Served by the Eurostat provider via the official `eventsJson` release
  // calendar (key-less) for the schedule, plus the key-less dissemination
  // statistics API (`eurostatDataset` + `eurostatFilters`) to backfill the
  // released `previous` / `actual` figures (ADR-0058 D3 two-phase population).
  // `eurostatTitle` is the stable, periodic official title to match on. Every
  // dataset/filter combination below was verified live against the API and
  // its figures cross-checked against the official euro-indicators news
  // releases on 2026-08-05 (rule 00) — e.g. EA flash HICP 2026-07 = 2.9%, EA
  // unemployment 2026-06 = 6.3%, EA GDP 2026-Q2 = +0.4%, EU retail 2026-05 =
  // +0.5%.
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
    // HICP was rebased to 2025=100 in 2026: `prc_hicp_manr` is frozen at
    // 2025-12; `prc_hicp_minr` is the live successor (ECOICOP ver.2). RCH_A =
    // annual rate of change (the headline YoY %); flash figures land in this
    // dataset at release time (verified: updated 2026-07-31T11:00, the flash
    // release instant). `EA` is the moving euro-area aggregate (EA21 from
    // 2026), matching the press-release "euro area" headline.
    eurostatDataset: 'prc_hicp_minr',
    eurostatFilters: { unit: 'RCH_A', coicop18: 'TOTAL', geo: 'EA' },
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
    // Same rebased dataset as the EA flash; the EU aggregate is only
    // published with the full HICP release (~mid following month), so the
    // freshest month stays null until then — honest two-phase backfill.
    eurostatDataset: 'prc_hicp_minr',
    eurostatFilters: { unit: 'RCH_A', coicop18: 'TOTAL', geo: 'EU27_2020' },
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
    // Headline QoQ growth: chain-linked volumes, % change on previous period,
    // seasonally and calendar adjusted GDP at market prices. The quarter's
    // figure first lands with the preliminary flash (t+30), i.e. slightly
    // before this t+45 release — still the authority's own published fact.
    eurostatDataset: 'namq_10_gdp',
    eurostatFilters: { unit: 'CLV_PCH_PRE', s_adj: 'SCA', na_item: 'B1GQ', geo: 'EA' },
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
    // Headline seasonally-adjusted total unemployment rate (% of active
    // population). NOTE: `une_rt_m` carries no moving `EA` aggregate — only
    // dated compositions — so the geo is the current `EA21` (from 2026).
    eurostatDataset: 'une_rt_m',
    eurostatFilters: { s_adj: 'SA', age: 'TOTAL', sex: 'T', unit: 'PC_ACT', geo: 'EA21' },
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
    // Headline MoM change in the volume of retail sales (deflated turnover),
    // NACE G47, seasonally and calendar adjusted, % change on previous
    // period — matches the "Volume of retail trade" news-release headline.
    eurostatDataset: 'sts_trtu_m',
    eurostatFilters: {
      indic_bt: 'VOL_SLS',
      nace_r2: 'G47',
      s_adj: 'SCA',
      unit: 'PCH_PRE',
      geo: 'EU27_2020',
    },
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

  // --- South Korea — Statistics Korea / KOSTAT (ADR-0061 batch 4) -----------
  // KOSTAT is Korea's primary official statistical authority (reorganised in
  // 2026 as the Ministry of Data and Statistics — MODS; kostat.go.kr now
  // 301-redirects to mods.go.kr). Like HK C&SD and CN NBS it exposes no
  // machine-readable release API — its forward source is the official annual
  // "Statistical Release Schedule", published in English. So the KOSTAT
  // provider makes no network call: it reads the pre-encoded official schedule
  // below (already in UTC). The 2026 dates are transcribed verbatim from the
  // official English schedule (mods.go.kr/menu.es?mid=a20301000000) and the
  // release times confirmed against the Korean monthly release plan
  // (mods.go.kr/newsPln.es — 물가/고용/산업활동 all at 08:00 KST). Korea Standard
  // Time is UTC+9 with no DST, so 08:00 KST = 23:00 UTC on the PRECEDING day
  // (encoded directly below). NOTE (rule 00 資料正確性): this is a per-year table
  // — KOSTAT publishes the next year's schedule in advance, so these `releases`
  // arrays MUST be refreshed annually (tracked in docs/03-status.md). Values
  // (previous/actual) are not machine-readable, so these events carry the
  // schedule + period only (`previous/actual = null`) — honest and compliant
  // (D1). ONLY KOSTAT first-party indicators are here; Korea's private
  // Manufacturing PMI (S&P Global) is NOT an official statistic and is
  // deliberately excluded (ADR-0061 D4). GDP + the BOK base-rate decision are
  // deferred: their only forward source is a BOK HWP/PDF attachment (not
  // cleanly machine-readable), and the only "dated lists" found were commercial
  // aggregators (Investing.com / Trading Economics) which ADR-0058 D1 forbids
  // as a source — so encoding them now would violate rule 00 / D1. They follow
  // once a primary-source BOK schedule is verified.
  {
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
    // "The Consumer Price Index in <month>" at 08:00 KST = 23:00 UTC prev day;
    // periodLabel = the reference month reported.
    releases: [
      { dateUtc: '2026-02-02T23:00:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-05T23:00:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-01T23:00:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-05T23:00:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-01T23:00:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-01T23:00:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-03T23:00:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-01T23:00:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-01T23:00:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-02T23:00:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-01T23:00:00.000Z', periodLabel: '2026-11' },
      { dateUtc: '2026-12-30T23:00:00.000Z', periodLabel: '2026-12' },
    ],
    lang: 'en',
    enabled: true,
  },
  {
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
    // "The Economically Active Population Survey in <month>" at 08:00 KST =
    // 23:00 UTC prev day; periodLabel = the reference month reported.
    releases: [
      { dateUtc: '2026-01-13T23:00:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-02-10T23:00:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-17T23:00:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-14T23:00:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-12T23:00:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-10T23:00:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-14T23:00:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-11T23:00:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-08T23:00:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-15T23:00:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-10T23:00:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-15T23:00:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'KR_INDUSTRIAL_ACTIVITY',
    provider: 'KOSTAT',
    authority: 'Statistics Korea',
    nameZhHant: '南韓工業活動動向',
    nameZhHans: '韩国工业活动动向',
    nameEn: 'South Korea Monthly Industrial Activity',
    region: 'KR',
    category: 'OTHER',
    unit: '%_MOM',
    scheduleUrl: 'https://mods.go.kr/menu.es?mid=a20301000000',
    sourceUrl: 'https://mods.go.kr/eng/index.do',
    // "Monthly Industrial Statistics in <month>" at 08:00 KST = 23:00 UTC prev
    // day; periodLabel = the reference month reported.
    releases: [
      { dateUtc: '2026-01-29T23:00:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-03-03T23:00:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-30T23:00:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-29T23:00:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-28T23:00:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-29T23:00:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-30T23:00:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-30T23:00:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-29T23:00:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-29T23:00:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-29T23:00:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-29T23:00:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'en',
    enabled: true,
  },

  // --- Indonesia — BPS-Statistics Indonesia (ADR-0061 batch 4) --------------
  // BPS (Badan Pusat Statistik) is Indonesia's primary official statistical
  // authority. It publishes an official Advance Release Calendar (ARC) covering
  // the whole year, but the entire bps.go.id site sits behind a Cloudflare
  // JS/managed challenge (a server-side fetch gets HTTP 403 "Just a moment…"),
  // so a live fetch at runtime is not viable. Like HK C&SD / CN NBS / KR
  // KOSTAT, the BPS provider therefore makes no network call: it reads the
  // pre-encoded official schedule below (already in UTC). The 2026 dates are
  // transcribed verbatim from the official ARC list view
  // (bps.go.id/en/arc, 2026) and the release time is confirmed from the ARC's
  // own "Press Conference Schedule" widget, which states the Berita Resmi
  // Statistik (BRS) briefings occur at 11:00 WIB. Western Indonesia Time (WIB)
  // is UTC+7 with no DST, so 11:00 WIB = 04:00 UTC on the same day (encoded
  // directly below). NOTE (rule 00 資料正確性): this is a per-year table — BPS
  // publishes the next year's ARC at the start of each year, so these
  // `releases` arrays MUST be refreshed annually (tracked in docs/03-status.md).
  // Values (previous/actual) are not machine-readable, so these events carry the
  // schedule + period only (`previous/actual = null`) — honest and compliant
  // (D1). ONLY BPS first-party indicators are here; Indonesia's private
  // Manufacturing PMI (S&P Global) is NOT an official statistic and is
  // deliberately excluded (ADR-0061 D4); the Bank Indonesia BI-Rate is a
  // central-bank release (not a BPS statistic) and is out of this provider's
  // scope.
  {
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
    // "Consumer Price Index" (Inflasi/IHK), released the first working day of
    // the month at 11:00 WIB = 04:00 UTC; reports the previous month.
    releases: [
      { dateUtc: '2026-01-05T04:00:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-02-02T04:00:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-02T04:00:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-01T04:00:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-04T04:00:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-02T04:00:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-01T04:00:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-03T04:00:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-01T04:00:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-01T04:00:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-02T04:00:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-01T04:00:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'ID_TRADE_BALANCE',
    provider: 'BPS',
    authority: 'BPS-Statistics Indonesia',
    nameZhHant: '印尼對外商品貿易（出口與進口）',
    nameZhHans: '印度尼西亚对外商品贸易（出口与进口）',
    nameEn: 'Indonesia Exports and Imports',
    region: 'ID',
    category: 'TRADE',
    // Values are not machine-readable and stay null; unit is left empty because
    // no figure is ever rendered next to it (D1 honesty), mirroring HK/CN/JP/NZ.
    unit: '',
    scheduleUrl: 'https://www.bps.go.id/en/arc',
    sourceUrl: 'https://www.bps.go.id/en/pressrelease',
    // "Exports And Imports" (Ekspor-Impor), released the same first working day
    // as CPI at 11:00 WIB = 04:00 UTC; reports the previous month.
    releases: [
      { dateUtc: '2026-01-05T04:00:00.000Z', periodLabel: '2025-12' },
      { dateUtc: '2026-02-02T04:00:00.000Z', periodLabel: '2026-01' },
      { dateUtc: '2026-03-02T04:00:00.000Z', periodLabel: '2026-02' },
      { dateUtc: '2026-04-01T04:00:00.000Z', periodLabel: '2026-03' },
      { dateUtc: '2026-05-04T04:00:00.000Z', periodLabel: '2026-04' },
      { dateUtc: '2026-06-02T04:00:00.000Z', periodLabel: '2026-05' },
      { dateUtc: '2026-07-01T04:00:00.000Z', periodLabel: '2026-06' },
      { dateUtc: '2026-08-03T04:00:00.000Z', periodLabel: '2026-07' },
      { dateUtc: '2026-09-01T04:00:00.000Z', periodLabel: '2026-08' },
      { dateUtc: '2026-10-01T04:00:00.000Z', periodLabel: '2026-09' },
      { dateUtc: '2026-11-02T04:00:00.000Z', periodLabel: '2026-10' },
      { dateUtc: '2026-12-01T04:00:00.000Z', periodLabel: '2026-11' },
    ],
    lang: 'en',
    enabled: true,
  },
  {
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
    // "Economic Growth" (PDB), released quarterly on the 5th at 11:00 WIB =
    // 04:00 UTC; periodLabel = the quarter reported.
    releases: [
      { dateUtc: '2026-02-05T04:00:00.000Z', periodLabel: '2025 Q4' },
      { dateUtc: '2026-05-05T04:00:00.000Z', periodLabel: '2026 Q1' },
      { dateUtc: '2026-08-05T04:00:00.000Z', periodLabel: '2026 Q2' },
      { dateUtc: '2026-11-05T04:00:00.000Z', periodLabel: '2026 Q3' },
    ],
    lang: 'en',
    enabled: true,
  },

  // --- Vietnam — General Statistics Office / GSO (ADR-0061 batch 4) ---------
  // The GSO is Vietnam's primary official statistical authority (rebranded the
  // National Statistics Office of Vietnam and moved under the Ministry of
  // Finance; the old gso.gov.vn now resolves to nso.gov.vn). UNLIKE the other
  // Asian authorities in this batch (CN/KR/ID, whose sites are WAF-walled or
  // API-less and are therefore config-encoded), the GSO publishes its official
  // Advance Release Calendar as a machine-readable `var events=[]` JSON array
  // embedded in the key-less release-calendar page, and the site sits on plain
  // Apache with NO Cloudflare challenge — so the GSO provider fetches it live
  // (like GB/CA/AU/JP/NZ), no annual transcription needed. Each release title
  // embeds the period at the start and the indicator name at the end; the
  // provider maps a release to an indicator by `gsoNameIncludes` /
  // `gsoNameExcludes` substrings and normalises the leading period phrase to
  // the FRED-aligned label (ADR-0058 D6). The ARC exposes no figures, so these
  // events carry release date + period with `previous/actual = null` (honest,
  // D1). The ARC commits to a date only (the release is officially held "in the
  // morning" — Decree 62/2024/NĐ-CP moved it to the 6th of the following month);
  // the provider anchors 09:00 Hanoi (ICT = UTC+7, no DST → 02:00 UTC), the
  // date being the authoritative fact. ONLY GSO first-party indicators are
  // here; Vietnam's private Manufacturing PMI (S&P Global) is NOT an official
  // statistic and is deliberately excluded (ADR-0061 D4). Match filters are
  // verified against the live ARC (2026-08-04).
  {
    indicatorCode: 'VN_CPI',
    provider: 'GSO',
    authority: 'General Statistics Office of Viet Nam',
    nameZhHant: '越南消費者物價指數',
    nameZhHans: '越南消费者物价指数',
    nameEn: 'Vietnam Consumer Price Index (CPI)',
    region: 'VN',
    category: 'INFLATION',
    unit: '%_YOY',
    scheduleUrl: 'https://www.nso.gov.vn/en/release-calendar-3/',
    sourceUrl: 'https://www.nso.gov.vn/en/press-room/',
    // "The <period> consumer price index (CPI), gold price index, USD price
    // index" — the single headline CPI line per release.
    gsoNameIncludes: ['consumer price index (cpi)'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'VN_GDP',
    provider: 'GSO',
    authority: 'General Statistics Office of Viet Nam',
    nameZhHant: '越南國內生產總值（按季）',
    nameZhHans: '越南国内生产总值（按季）',
    nameEn: 'Vietnam Gross Domestic Product (GDP)',
    region: 'VN',
    category: 'GROWTH',
    unit: '%_YOY',
    scheduleUrl: 'https://www.nso.gov.vn/en/release-calendar-3/',
    sourceUrl: 'https://www.nso.gov.vn/en/press-room/',
    // Quarterly headline GDP. Exclude the sibling GDP-family lines that share
    // "gross domestic product" but are a different figure (growth rate,
    // per-capita, structure); the `(gdp)` token already excludes the annual
    // "gross domestic production (GDP)" (note: "production", not "product").
    gsoNameIncludes: ['gross domestic product (gdp)'],
    gsoNameExcludes: ['growth rate', 'per capita', 'structure'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'VN_INDUSTRIAL_PRODUCTION',
    provider: 'GSO',
    authority: 'General Statistics Office of Viet Nam',
    nameZhHant: '越南工業生產指數（IIP）',
    nameZhHans: '越南工业生产指数（IIP）',
    nameEn: 'Vietnam Index of Industrial Production (IIP)',
    region: 'VN',
    category: 'OTHER',
    unit: '%_YOY',
    scheduleUrl: 'https://www.nso.gov.vn/en/release-calendar-3/',
    sourceUrl: 'https://www.nso.gov.vn/en/press-room/',
    // "The <period> index of industrial production" — distinct from the
    // industrial "shipment" / "inventory" index lines (different phrase).
    gsoNameIncludes: ['index of industrial production'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'VN_RETAIL_SALES',
    provider: 'GSO',
    authority: 'General Statistics Office of Viet Nam',
    nameZhHant: '越南商品零售總額',
    nameZhHans: '越南商品零售总额',
    nameEn: 'Vietnam Retail Sales of Goods',
    region: 'VN',
    category: 'OTHER',
    unit: '%_YOY',
    scheduleUrl: 'https://www.nso.gov.vn/en/release-calendar-3/',
    sourceUrl: 'https://www.nso.gov.vn/en/press-room/',
    // "The <period> turnover of retail sales" (plural) — the monthly headline;
    // the annual roll-up is "turnover of retail sale" (singular) and does not
    // match, so no period-key collision.
    gsoNameIncludes: ['turnover of retail sales'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'VN_TRADE_BALANCE',
    provider: 'GSO',
    authority: 'General Statistics Office of Viet Nam',
    nameZhHant: '越南商品貿易差額',
    nameZhHans: '越南商品贸易差额',
    nameEn: 'Vietnam Trade Balance of Goods',
    region: 'VN',
    category: 'TRADE',
    // Values are not machine-readable and stay null; unit is left empty because
    // no figure is ever rendered next to it (D1 honesty), mirroring HK/CN/JP/NZ/ID.
    unit: '',
    scheduleUrl: 'https://www.nso.gov.vn/en/release-calendar-3/',
    sourceUrl: 'https://www.nso.gov.vn/en/press-room/',
    // "The <period> trade surplus/deficit of goods" — the monthly headline
    // merchandise balance; the annual "trade balance of goods" is a different
    // phrase and does not match.
    gsoNameIncludes: ['trade surplus/deficit of goods'],
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'VN_UNEMPLOYMENT_RATE',
    provider: 'GSO',
    authority: 'General Statistics Office of Viet Nam',
    nameZhHant: '越南失業率',
    nameZhHans: '越南失业率',
    nameEn: 'Vietnam Unemployment Rate',
    region: 'VN',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www.nso.gov.vn/en/release-calendar-3/',
    sourceUrl: 'https://www.nso.gov.vn/en/press-room/',
    // "The <period> unemployment rate" (quarterly). Exclude the sibling
    // "underemployment rate" (which in any case lacks the "unemployment"
    // substring — belt-and-suspenders).
    gsoNameIncludes: ['unemployment rate'],
    gsoNameExcludes: ['underemployment'],
    lang: 'en',
    enabled: true,
  },

  // --- Singapore — Department of Statistics / SingStat (ADR-0061 batch 4) ---
  // SingStat is Singapore's primary official statistical authority. UNLIKE the
  // other Asian authorities that are config-encoded (CN NBS / KR KOSTAT / ID
  // BPS, whose sites are API-less or Cloudflare-walled), SingStat publishes its
  // official whole-year Advance Release Calendar (ARC) as a machine-readable
  // JSON array embedded in the server-rendered ARC page's Next.js RSC payload
  // (`{"arcData":{"data":[{title,release_date,…}]}}`), served over CloudFront
  // with NO WAF challenge — so the SingStat provider fetches it live (like GB
  // ONS / CA StatCan / AU ABS / JP e-Stat / NZ Stats NZ / VN GSO), and no
  // annual transcription is needed. Each ARC `title` is
  // "<indicator name>, <period>"; the provider maps a release to an indicator
  // by an exact `singstatTitlePrefix` start-match (comma-terminated, so a
  // prefix can never bleed into a sibling series) and parses the period from
  // the title tail (month → "YYYY-MM", quarter → "YYYY Qn"). The ARC exposes no
  // figures, so these events carry release date + period with
  // `previous/actual = null` (honest, D1). The authoritative fact is the single
  // `release_date`; SingStat's standard release time is 13:00 Singapore
  // (SGT = UTC+8, no DST → 05:00 UTC), anchored by the provider. ONLY SingStat
  // first-party indicators are here; Singapore's private Manufacturing PMI
  // (S&P Global / SIPMM) and the MAS monetary-policy statement (a central-bank
  // release, not a SingStat statistic) are out of scope (ADR-0061 D4). Prefixes
  // are verified against the live ARC (2026-08-04).
  {
    indicatorCode: 'SG_CPI',
    provider: 'SINGSTAT',
    authority: 'Department of Statistics Singapore',
    nameZhHant: '新加坡消費者物價指數',
    nameZhHans: '新加坡消费者物价指数',
    nameEn: 'Singapore Consumer Price Index (CPI)',
    region: 'SG',
    category: 'INFLATION',
    unit: '%_YOY',
    scheduleUrl: 'https://www.singstat.gov.sg/data-tools-services/advance-release-calendar',
    sourceUrl:
      'https://www.singstat.gov.sg/find-data/explore-data-themes/economy-prices/consumer-price-index/latest-news-data',
    // "CPI For General Households, <Mon YYYY>" — the monthly headline; the
    // half-yearly "CPI By Household Income Group," sibling has a distinct prefix.
    singstatTitlePrefix: 'CPI For General Households,',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'SG_GDP',
    provider: 'SINGSTAT',
    authority: 'Ministry of Trade and Industry',
    nameZhHant: '新加坡國內生產總值（預估，按季）',
    nameZhHans: '新加坡国内生产总值（预估，按季）',
    nameEn: 'Singapore Advance GDP Estimates',
    region: 'SG',
    category: 'GROWTH',
    unit: '%_YOY',
    scheduleUrl: 'https://www.singstat.gov.sg/data-tools-services/advance-release-calendar',
    sourceUrl:
      'https://www.singstat.gov.sg/find-data/explore-data-themes/economy-prices/national-accounts/latest-news-data',
    // "Advance Gross Domestic Product (GDP) Estimates, <nQ YYYY>" — the flash
    // quarterly headline (first estimate). The later fuller "GDP, <nQ YYYY>"
    // and "Expenditure-/Income-Based GDP," releases have distinct prefixes and
    // never map here, so no period-key collision.
    singstatTitlePrefix: 'Advance Gross Domestic Product (GDP) Estimates,',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'SG_UNEMPLOYMENT_RATE',
    provider: 'SINGSTAT',
    authority: 'Ministry of Manpower',
    nameZhHant: '新加坡失業率（按季）',
    nameZhHans: '新加坡失业率（按季）',
    nameEn: 'Singapore Unemployment Rate',
    region: 'SG',
    category: 'EMPLOYMENT',
    unit: '%',
    scheduleUrl: 'https://www.singstat.gov.sg/data-tools-services/advance-release-calendar',
    sourceUrl:
      'https://www.singstat.gov.sg/find-data/explore-data-themes/economy-prices/labour-employment-wages-and-productivity/latest-news-data',
    // "Unemployment Rate, <nQ YYYY>" — quarterly. The ARC `description` may give
    // a date range ("To be released on 29 - 30 Oct"), but `release_date` is a
    // single authoritative date and is used verbatim.
    singstatTitlePrefix: 'Unemployment Rate,',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'SG_MERCHANDISE_TRADE',
    provider: 'SINGSTAT',
    authority: 'Enterprise Singapore',
    nameZhHant: '新加坡對外商品貿易',
    nameZhHans: '新加坡对外商品贸易',
    nameEn: 'Singapore Merchandise Trade',
    region: 'SG',
    category: 'TRADE',
    // Values are not machine-readable and stay null; unit is left empty because
    // no figure is ever rendered next to it (D1 honesty), mirroring HK/CN/JP/NZ.
    unit: '',
    scheduleUrl: 'https://www.singstat.gov.sg/data-tools-services/advance-release-calendar',
    sourceUrl:
      'https://www.singstat.gov.sg/find-data/explore-data-themes/trade-investment/merchandise-trade/latest-news-data',
    // "Merchandise Trade, <Mon YYYY>" — monthly headline external trade.
    singstatTitlePrefix: 'Merchandise Trade,',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'SG_RETAIL_SALES',
    provider: 'SINGSTAT',
    authority: 'Department of Statistics Singapore',
    nameZhHant: '新加坡零售銷售與餐飲服務指數',
    nameZhHans: '新加坡零售销售与餐饮服务指数',
    nameEn: 'Singapore Retail Sales and Food & Beverage Services Indices',
    region: 'SG',
    category: 'OTHER',
    unit: '%_YOY',
    scheduleUrl: 'https://www.singstat.gov.sg/data-tools-services/advance-release-calendar',
    sourceUrl:
      'https://www.singstat.gov.sg/find-data/explore-data-themes/industry/services/latest-news-data',
    // "Retail Sales and Food & Beverage Services Indices, <Mon YYYY>" — monthly.
    singstatTitlePrefix: 'Retail Sales and Food & Beverage Services Indices,',
    lang: 'en',
    enabled: true,
  },
  {
    indicatorCode: 'SG_INDUSTRIAL_PRODUCTION',
    provider: 'SINGSTAT',
    authority: 'Economic Development Board',
    nameZhHant: '新加坡工業生產指數',
    nameZhHans: '新加坡工业生产指数',
    nameEn: 'Singapore Index of Industrial Production',
    region: 'SG',
    category: 'OTHER',
    unit: '%_YOY',
    scheduleUrl: 'https://www.singstat.gov.sg/data-tools-services/advance-release-calendar',
    sourceUrl:
      'https://www.singstat.gov.sg/find-data/explore-data-themes/industry/manufacturing/latest-news-data',
    // "Index of Industrial Production, <Mon YYYY>" — monthly headline.
    singstatTitlePrefix: 'Index of Industrial Production,',
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
