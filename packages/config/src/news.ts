/**
 * Curated financial-news RSS feed registry (ADR-0057 D2).
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
 * The curated feed list. Candidate Hong-Kong-Chinese + English financial
 * sources; each must be confirmed to permit headline aggregation + outbound
 * linking before being enabled. Kept intentionally small to start.
 */
export const NEWS_FEED_SOURCES: readonly NewsFeedSource[] = [
  {
    id: 'rthk-finance-zh',
    name: '香港電台 財經',
    url: 'https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml',
    lang: 'zh-Hant',
    enabled: true,
  },
  {
    id: 'now-finance-zh',
    name: 'Now 財經',
    url: 'https://news.now.com/rss/finance',
    lang: 'zh-Hant',
    enabled: true,
  },
  {
    id: 'yahoo-finance-en',
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    lang: 'en',
    enabled: true,
  },
] as const;

/** The subset the fetcher should actually poll. */
export function enabledNewsFeeds(): readonly NewsFeedSource[] {
  return NEWS_FEED_SOURCES.filter((f) => f.enabled);
}
