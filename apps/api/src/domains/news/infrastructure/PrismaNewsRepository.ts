/**
 * Prisma implementation of INewsRepository (per ADR-0057 D3).
 *
 * Reads are served from the local `news_items` cache populated by the
 * news-fetcher task — never a live external fetch on the request path. Only
 * `isActive` rows are returned, ordered strictly by `publishedAt` (newest
 * first) with `id` as a stable tiebreaker for cursor pagination.
 */

import type { INewsRepository } from '../domain/INewsRepository.js';
import type { ListNewsOptions, NewsItemRecord } from '../domain/NewsItemEntity.js';
import type { NewsItem, PrismaClient } from '@opentrade/db';

function toRecord(row: NewsItem): NewsItemRecord {
  return {
    id: row.id,
    title: row.title,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt,
    lang: row.lang,
  };
}

export class PrismaNewsRepository implements INewsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(options: ListNewsOptions): Promise<NewsItemRecord[]> {
    const symbol = options.symbol?.trim();
    const rows = await this.prisma.newsItem.findMany({
      where: {
        isActive: true,
        ...(symbol ? { symbols: { has: symbol } } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    return rows.map(toRecord);
  }
}
