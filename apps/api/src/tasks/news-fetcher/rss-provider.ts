/**
 * RSS feed provider for the news-fetcher (per ADR-0057 D2).
 *
 * Reads the curated feed list from `@opentrade/config` (never hard-coded here)
 * and parses each feed with `rss-parser`. The headline, source, canonical link,
 * and publisher timestamp are extracted — RSS `description`/`content` snippets
 * are deliberately dropped (ADR-0057 D1: headline-only, conservative copyright
 * stance). Additionally (ADR-0060) the publisher's OWN feed-provided thumbnail
 * is extracted from the item's media enclosure (`media:thumbnail` /
 * `media:content` / `<enclosure>`), https-only — never scraped from the article
 * page. Per-feed failures are swallowed so one broken feed never blocks others.
 */

import Parser from 'rss-parser';

import { enabledNewsFeeds } from '@opentrade/config';

import type { INewsFeedProvider, NewsHeadline } from './types.js';
import type { NewsFeedSource } from '@opentrade/config';

const FEED_TIMEOUT_MS = 10_000;

/**
 * Some publishers (e.g. Yahoo) rate-limit / 429 requests that lack a
 * browser-like User-Agent, which would silently starve the whole feed. We
 * identify with a common desktop UA so headline + media extraction works.
 */
const FEED_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Media fields we ask `rss-parser` to surface, in priority order (ADR-0060). */
type MediaNode = { $?: { url?: string; type?: string; medium?: string } };
type MediaItem = Parser.Item & {
  'media:thumbnail'?: MediaNode | MediaNode[];
  'media:content'?: MediaNode | MediaNode[];
  enclosure?: { url?: string; type?: string };
};

export class RssFeedProvider implements INewsFeedProvider {
  private readonly parser = new Parser({
    timeout: FEED_TIMEOUT_MS,
    headers: { 'User-Agent': FEED_USER_AGENT },
    customFields: {
      item: [
        ['media:thumbnail', 'media:thumbnail', { keepArray: true }],
        ['media:content', 'media:content', { keepArray: true }],
      ],
    },
  });

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
  // Thumbnail is the publisher's OWN feed media enclosure only (ADR-0060).
  return {
    title,
    sourceName: feed.name,
    sourceUrl: link,
    publishedAt,
    lang: feed.lang,
    imageUrl: extractImageUrl(item),
  };
}

/**
 * Pull the publisher's own thumbnail from the RSS item's media enclosure
 * (ADR-0060). Priority: `media:thumbnail` → `media:content` (image only) →
 * `<enclosure>` (image only). Only `https:` URLs are accepted (no mixed content,
 * no `data:`). Returns `null` when the feed carries no usable image — we never
 * scrape the article page or synthesise one.
 */
function extractImageUrl(item: Parser.Item): string | null {
  const media = item as MediaItem;

  for (const node of toArray(media['media:thumbnail'])) {
    const url = httpsImageUrl(node.$?.url);
    if (url) return url;
  }

  for (const node of toArray(media['media:content'])) {
    const attrs = node.$;
    // Accept when explicitly an image, OR when the enclosure is untyped
    // (Yahoo's `<media:content url=.. width=.. height=..>` carries neither
    // `medium` nor `type`); reject only when it is explicitly non-image.
    const explicitImage = attrs?.medium === 'image' || (attrs?.type?.startsWith('image/') ?? false);
    const untyped = attrs?.medium === undefined && attrs?.type === undefined;
    const url = httpsImageUrl(attrs?.url);
    if (url && (explicitImage || untyped)) return url;
  }

  const enclosure = media.enclosure;
  if (enclosure?.type?.startsWith('image/')) {
    const url = httpsImageUrl(enclosure.url);
    if (url) return url;
  }

  return null;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function httpsImageUrl(raw: string | undefined): string | null {
  const url = raw?.trim();
  if (!url || url.length > 2048) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
