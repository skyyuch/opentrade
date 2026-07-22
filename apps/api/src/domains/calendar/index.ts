/**
 * Public surface of the economic-calendar domain (ADR-0058).
 *
 * The router crosses the boundary for HTTP; the repository + its port are
 * exported so the calendar-fetcher task (ingestion, segment 4) and any future
 * consumer can read without reaching into another domain's internals.
 */

export { calendarRouter } from './presentation/routes.js';
export { PrismaCalendarRepository } from './infrastructure/PrismaCalendarRepository.js';
export { ListEventsUseCase } from './application/ListEventsUseCase.js';
export type { ICalendarRepository } from './domain/ICalendarRepository.js';
export type {
  EconomicEventRecord,
  ListEventsOptions,
  EconomicRegionValue,
  EconomicCategoryValue,
} from './domain/EconomicEventEntity.js';
