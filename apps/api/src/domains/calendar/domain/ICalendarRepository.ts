/**
 * Port for economic-event reads.
 *
 * Per DDD rule 10: the domain defines this interface; infrastructure provides
 * the Prisma implementation. Reads are strictly chronological (earliest
 * `scheduledAt` first — natural calendar order, ADR-0058 D1/D5) and
 * cursor-paginated. Writes (two-phase upsert) live in the calendar-fetcher
 * task, which owns ingestion, so this read port stays minimal.
 */

import type { EconomicEventRecord, ListEventsOptions } from './EconomicEventEntity.js';

export type ICalendarRepository = {
  /**
   * Returns active economic events, earliest first, optionally bounded by a
   * `[from, to]` window and filtered by region/category. The caller passes
   * `limit + 1` to detect whether a further page exists; the repository
   * returns at most that many rows.
   */
  list(options: ListEventsOptions): Promise<EconomicEventRecord[]>;
};
