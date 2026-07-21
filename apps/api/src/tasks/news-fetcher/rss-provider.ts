/**
 * RSS feed provider for the news-fetcher (per ADR-0057 D2).
 *
 * Reads the curated feed list from `@opentrade/config` (never hard-coded here)
 * and parses each feed with `rss-parser`. Only the headline, source, canonical
 * link, and publisher timestamp are extracted — RSS `description`/`content`
 * snippets are deliberately dropped (ADR-0057 D1: headline-only, conservative
 * copyright stance). Per-feed failures are swallowed so one broken feed never
 * blocks the others.
 */

import Parser from 'rss-parser';

import { enabledNewsFeeds } from '@opentrade/config';

import type { INewsFeedProvider, NewsHeadline } from './types.js';
import type { NewsFeedSource } from '@opentrade/config';

const FEED_TIMEOUT_MS = 10_000;

export class RssFeedProvider implements INewsFeedProvider {
  private readonly parser = new Parser({ timeout: FEED_TIMEOUT_MS });

  constructor(private readonly feeds: readonly NewsFeedSource[] = enabledNewsFeeds()) {}

  async fetchHeadlines(): Promise<NewsHeadline[]> {
    const headlines: NewsHeadline[] = [];

    for (const feed of this.feeds) {
      try {
        const parsed = await this.parser.parseURL(feed.url);
        for (const item of parsed.items) {
          const headline = toHeadline(item, feed);
          if (headline) headlines.push(headline);
        }
      } catch {
        // Non-fatal: individual feed failure shouldn't stop the others.
      }
    }

    return headlines;
  }
}

function toHeadline(item: Parser.Item, feed: NewsFeedSource): NewsHeadline | null {
  const title = item.title?.trim();
  const link = item.link?.trim();
  if (!title || !link) return null;

  const rawDate = item.isoDate ?? item.pubDate;
  if (!rawDate) return null;
  const publishedAt = new Date(rawDate);
  if (Number.isNaN(publishedAt.getTime())) return null;

  // Headline-only by design (ADR-0057 D1): no description/content persisted.
  return {
    title,
    sourceName: feed.name,
    sourceUrl: link,
    publishedAt,
    lang: feed.lang,
  };
}
