/**
 * Prisma implementation of ICalendarRepository (per ADR-0058 D3).
 *
 * Reads are served from the local `economic_events` cache populated by the
 * calendar-fetcher task — never a live external fetch on the request path.
 * Only `isActive` rows are returned, ordered strictly by `scheduledAt`
 * (earliest first — natural calendar order) with `id` as a stable tiebreaker
 * for cursor pagination. `region` / `category` narrow the result set but
 * never reorder it (ADR-0058 D1).
 */

import type { EconomicEventRecord, ListEventsOptions } from '../domain/EconomicEventEntity.js';
import type { ICalendarRepository } from '../domain/ICalendarRepository.js';
import type { EconomicEvent, PrismaClient } from '@opentrade/db';

function toRecord(row: EconomicEvent): EconomicEventRecord {
  return {
    id: row.id,
    indicatorCode: row.indicatorCode,
    nameZhHant: row.nameZhHant,
    nameZhHans: row.nameZhHans,
    nameEn: row.nameEn,
    region: row.region,
    category: row.category,
    scheduledAt: row.scheduledAt,
    periodLabel: row.periodLabel,
    previousValue: row.previousValue ? row.previousValue.toString() : null,
    actualValue: row.actualValue ? row.actualValue.toString() : null,
    unit: row.unit,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
  };
}

export class PrismaCalendarRepository implements ICalendarRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(options: ListEventsOptions): Promise<EconomicEventRecord[]> {
    const rows = await this.prisma.economicEvent.findMany({
      where: {
        isActive: true,
        ...(options.from || options.to
          ? {
              scheduledAt: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
        ...(options.region ? { region: options.region } : {}),
        ...(options.category ? { category: options.category } : {}),
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: options.limit,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    return rows.map(toRecord);
  }
}
