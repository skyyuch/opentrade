/**
 * Curated financial-news RSS feed registry (ADR-0057 D2, expanded per
 * ADR-0058 D8).
 *
 * Single source of truth for the trusted third-party feeds the news-fetcher
 * task polls. Per rule 00 / rule 50 the source list must NOT be hard-coded in
 * task/domain code — it lives here so adding/removing a source (and auditing
 * the list for compliance) is a one-file change.
 *
 * Compliance contract (ADR-0057 D1): we only ever aggregate the headline,
 * source name, canonical link, and timestamp. We never store article bodies,
 * and the feed is rendered strictly chronologically. Only feeds whose terms
 * permit headline aggregation + linking belong here.
 *
 * Per-source ToS gate (ADR-0058 D8): every source carries a `ToS` comment
 * recording whether its terms were confirmed to permit headline aggregation +
 * outbound linking, when the check was done, and against which document.
 * Sources whose terms do NOT clearly permit that use are kept for provenance
 * with `enabled: false` and a follow-up note — they are never polled.
 *
 * Candidates audited and REJECTED on 2026-07-21 (not listed below, summary in
 * docs/03-status.md): 明報 (RSS page: 「此新聞服務不可作任何商業用途」),
 * 經濟通 etnet (RSS terms: personal / non-profit non-commercial use only),
 * 中新網 (legal notice forbids 轉載/鏈接/轉貼 without written authorisation),
 * 人民網 (copyright notice forbids 引用/轉載/鏈接 without written
 * authorisation), 信報/東方日報 (no working public RSS feed found).
 *
 * `lang` uses the project locale vocabulary (ADR-0003): zh-Hant / zh-Hans / en.
 */

import type { SupportedLocale } from './locales.js';

export type NewsFeedSource = {
  /** Stable identifier, used only for logging/diagnostics. */
  readonly id: string;
  /** Human-facing attribution rendered next to each headline. */
  readonly name: string;
  /** RSS/Atom feed URL. */
  readonly url: string;
  /** Primary language of the feed's headlines. */
  readonly lang: SupportedLocale;
  /** Disabled feeds are kept for provenance but skipped by the fetcher. */
  readonly enabled: boolean;
};

/**
 * The curated feed list. Each source must have its ToS confirmed to permit
 * headline aggregation + outbound linking before being enabled (ADR-0058 D8).
 */
export const NEWS_FEED_SOURCES: readonly NewsFeedSource[] = [
  // ToS NOT confirmed (checked 2026-07-21 against rthk.hk/copyright/ 知識產權
  // 告示): clause 3 limits content use to non-commercial personal / internal
  // organisational purposes, and clause 7 requires prior written government
  // consent even to hyperlink to any RTHK page. Headline aggregation +
  // outbound linking on a public platform is therefore not clearly permitted.
  // Disabled pending written consent (request via webmaster@rthk.gov.hk).
  {
    id: 'rthk-finance-zh',
    name: '香港電台 財經',
    url: 'https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml',
    lang: 'zh-Hant',
    enabled: false,
  },
  // ToS NOT confirmed + feed dead (checked 2026-07-21): the URL returns
  // HTTP 404 (Now no longer publishes a public RSS endpoint), and the
  // now.com 使用條款 / 免責及著作權聲明 grant no RSS licence and forbid
  // reproduction without written consent. Kept for provenance only.
  {
    id: 'now-finance-zh',
    name: 'Now 財經',
    url: 'https://news.now.com/rss/finance',
    lang: 'zh-Hant',
    enabled: false,
  },
  // ToS CONFIRMED 2026-07-21 against Yahoo Terms of Service §16 "RSS Feeds"
  // (legal.yahoo.com/xw/en/yahoo/terms/otos/): display of feed content is
  // permitted without modification, with attribution to the source website
  // and a link to the full article, and no advertising incorporated into the
  // feed. Our headline + source-name + outbound-link rendering (ADR-0057 D1)
  // satisfies all three conditions.
  {
    id: 'yahoo-finance-en',
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    lang: 'en',
    enabled: true,
  },
  // ToS CONFIRMED 2026-07-21: same Yahoo ToS §16 "RSS Feeds" as
  // `yahoo-finance-en` (one Yahoo ToS covers all regional properties).
  // Traditional-Chinese Hong-Kong edition (feed self-declares zh-Hant-HK) —
  // adds the HK-Chinese coverage ADR-0058 D8 asks for.
  {
    id: 'yahoo-finance-hk-zh',
    name: 'Yahoo 財經',
    url: 'https://hk.finance.yahoo.com/news/rssindex',
    lang: 'zh-Hant',
    enabled: true,
  },
  // ToS CONFIRMED 2026-07-21: news.gov.hk explicitly offers its RSS channels
  // so content distributors can 「產生並傳播新聞鏈結、標題和摘要等資料」
  // (news.gov.hk RSS page), and unlike RTHK its copyright notice does not
  // restrict hyperlinking. Its 版權聲明 forbids commercial reproduction of
  // protected content — we reproduce nothing beyond the headline and link
  // back with attribution, matching the feed's stated purpose.
  {
    id: 'newsgovhk-finance-zh',
    name: '香港政府新聞網 財經',
    url: 'https://www.news.gov.hk/tc/categories/finance/html/articlelist.rss.xml',
    lang: 'zh-Hant',
    enabled: true,
  },
  // ToS CONFIRMED 2026-07-21: same news.gov.hk RSS terms as
  // `newsgovhk-finance-zh`; English edition of the same official channel.
  {
    id: 'newsgovhk-finance-en',
    name: 'news.gov.hk Business & Finance',
    url: 'https://www.news.gov.hk/en/categories/finance/html/articlelist.rss.xml',
    lang: 'en',
    enabled: true,
  },
] as const;

/** The subset the fetcher should actually poll. */
export function enabledNewsFeeds(): readonly NewsFeedSource[] {
  return NEWS_FEED_SOURCES.filter((f) => f.enabled);
}
