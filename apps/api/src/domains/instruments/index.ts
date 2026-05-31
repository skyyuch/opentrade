/**
 * Public surface of the instruments domain (ADR-0038).
 *
 * The router crosses the boundary for HTTP; the repository + its port are
 * exported so the signals domain can resolve `instrumentId` at signal-creation
 * time (ADR-0038 D6) without reaching into another domain's internals.
 */

export { instrumentsRouter } from './presentation/routes.js';
export { PrismaInstrumentRepository } from './infrastructure/PrismaInstrumentRepository.js';
export type { IInstrumentRepository } from './domain/IInstrumentRepository.js';
export type { InstrumentRecord } from './domain/InstrumentEntity.js';
