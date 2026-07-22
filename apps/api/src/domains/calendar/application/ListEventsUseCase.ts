/**
 * Use case: list economic-calendar events (per ADR-0058).
 *
 * Pure orchestration: clamps the limit, forwards the optional window
 * (`from`/`to`) + filter (`region`/`category`) + cursor, and computes the next
 * cursor. Ordering is fixed chronological (earliest `scheduledAt` first) in
 * the repository — there is deliberately NO ranking/importance parameter here
 * (ADR-0058 D1: no impact rating, no editorial ordering; region/category are
 * filters only). Returns DTOs with `scheduledAt` as an ISO string and decimal
 * values as strings, ready for the client.
 */

import type {
  EconomicCategoryValue,
  EconomicEventRecord,
  EconomicRegionValue,
  ListEventsOptions,
} from '../domain/EconomicEventEntity.js';
import type { ICalendarRepository } from '../domain/ICalendarRepository.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export type EconomicEventDto = {
  id: string;
  indicatorCode: string;
  nameZhHant: string;
  nameZhHans: string;
  nameEn: string;
  region: EconomicRegionValue;
  category: EconomicCategoryValue;
  scheduledAt: string;
  periodLabel: string;
  previousValue: string | null;
  actualValue: string | null;
  unit: string;
  sourceName: string;
  sourceUrl: string;
};

export type ListEventsResult = {
  items: EconomicEventDto[];
  nextCursor: string | null;
};

export type ListEventsInput = {
  limit?: number;
  cursor?: string;
  from?: Date;
  to?: Date;
  region?: EconomicRegionValue;
  category?: EconomicCategoryValue;
};

function toDto(record: EconomicEventRecord): EconomicEventDto {
  return {
    id: record.id,
    indicatorCode: record.indicatorCode,
    nameZhHant: record.nameZhHant,
    nameZhHans: record.nameZhHans,
    nameEn: record.nameEn,
    region: record.region,
    category: record.category,
    scheduledAt: record.scheduledAt.toISOString(),
    periodLabel: record.periodLabel,
    previousValue: record.previousValue,
    actualValue: record.actualValue,
    unit: record.unit,
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl,
  };
}

export class ListEventsUseCase {
  constructor(private readonly repo: ICalendarRepository) {}

  async execute(input: ListEventsInput): Promise<ListEventsResult> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    // Fetch one extra row to detect whether a further page exists.
    const options: ListEventsOptions = { limit: limit + 1 };
    if (input.cursor !== undefined) options.cursor = input.cursor;
    if (input.from !== undefined) options.from = input.from;
    if (input.to !== undefined) options.to = input.to;
    if (input.region !== undefined) options.region = input.region;
    if (input.category !== undefined) options.category = input.category;

    const records = await this.repo.list(options);

    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? last.id : null;

    return { items: page.map(toDto), nextCursor };
  }
}
