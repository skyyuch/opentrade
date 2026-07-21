/**
 * News Fetcher — periodic RSS aggregation task (per ADR-0057 D3).
 *
 * Polls the configured provider at a fixed interval and upserts headlines into
 * the `news_items` cache table, deduped by `sourceUrl`. The public `/v1/news`
 * endpoint reads from that table, so page latency/availability is decoupled
 * from third-party feeds. Mirrors the PriceRecorder task pattern (scheduled
 * external pull -> DB upsert), runnable in the API process or a separate ECS
 * task.
 *
 * Compliance (ADR-0057 D1): only headline / source / link / timestamp are ever
 * written; `symbols` is left empty in the MVP (forward-compatible seam, D4).
 */

import type { INewsFeedProvider } from './types.js';
import type { PrismaClient } from '@opentrade/db';

export type NewsFetcherOptions = {
  intervalMs: number;
  provider: INewsFeedProvider;
};

export class NewsFetcher {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: NewsFetcherOptions,
  ) {}

  async fetchOnce(): Promise<number> {
    let headlines;
    try {
      headlines = await this.options.provider.fetchHeadlines();
    } catch {
      return 0;
    }

    let upserted = 0;
    for (const h of headlines) {
      try {
        await this.prisma.newsItem.upsert({
          where: { sourceUrl: h.sourceUrl },
          update: {
            title: h.title,
            sourceName: h.sourceName,
            publishedAt: h.publishedAt,
            lang: h.lang,
            fetchedAt: new Date(),
            isActive: true,
          },
          create: {
            title: h.title,
            sourceName: h.sourceName,
            sourceUrl: h.sourceUrl,
            publishedAt: h.publishedAt,
            lang: h.lang,
            symbols: [],
          },
        });
        upserted++;
      } catch {
        // Non-fatal: individual headline failure shouldn't stop the others.
      }
    }

    return upserted;
  }

  start(): void {
    if (this.timer) return;

    const poll = async (): Promise<void> => {
      try {
        await this.fetchOnce();
      } catch {
        // Will retry next interval.
      }
    };

    void poll();
    this.timer = setInterval(() => void poll(), this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
