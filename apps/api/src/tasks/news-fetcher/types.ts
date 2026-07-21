/**
 * Shared types for the news-fetcher subsystem (per ADR-0057).
 *
 * A provider fetches third-party feeds and parses each entry down to the
 * compliance-bounded headline shape (ADR-0057 D1): title + source + canonical
 * link + timestamp. No article body is ever produced.
 */

export type NewsHeadline = {
  title: string;
  sourceName: string;
  /** Canonical link to the original article — the dedup key. */
  sourceUrl: string;
  publishedAt: Date;
  /** Primary language of the headline (zh-Hant / zh-Hans / en). */
  lang: string;
};

export type INewsFeedProvider = {
  /**
   * Fetch + parse all configured feeds into compliance-bounded headlines.
   * Implementations MUST isolate per-feed failures (a bad feed cannot break
   * the others).
   */
  fetchHeadlines(): Promise<NewsHeadline[]>;
};
