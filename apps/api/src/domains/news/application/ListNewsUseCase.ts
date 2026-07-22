/**
 * Use case: list the aggregated news feed (per ADR-0057).
 *
 * Pure orchestration: clamps the limit, forwards the optional cursor + symbol
 * seam, and computes the next cursor. Ordering is fixed chronological (newest
 * first) in the repository — there is deliberately NO ranking/relevance
 * parameter here (ADR-0057 D1: no editorial ordering, avoids being read as
 * investment advice). Returns DTOs with `publishedAt` as an ISO string, ready
 * for the client.
 */

import type { INewsRepository } from '../domain/INewsRepository.js';
import type { ListNewsOptions, NewsItemRecord } from '../domain/NewsItemEntity.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export type NewsItemDto = {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  lang: string;
};

export type ListNewsResult = {
  items: NewsItemDto[];
  nextCursor: string | null;
};

export type ListNewsInput = {
  limit?: number;
  cursor?: string;
  symbol?: string;
};

function toDto(record: NewsItemRecord): NewsItemDto {
  return {
    id: record.id,
    title: record.title,
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl,
    publishedAt: record.publishedAt.toISOString(),
    lang: record.lang,
  };
}

export class ListNewsUseCase {
  constructor(private readonly repo: INewsRepository) {}

  async execute(input: ListNewsInput): Promise<ListNewsResult> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    // Fetch one extra row to detect whether a further page exists.
    const options: ListNewsOptions = { limit: limit + 1 };
    if (input.cursor !== undefined) options.cursor = input.cursor;
    if (input.symbol !== undefined) options.symbol = input.symbol;

    const records = await this.repo.list(options);

    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? last.id : null;

    return { items: page.map(toDto), nextCursor };
  }
}
