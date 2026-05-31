/**
 * Port for instrument-catalog reads.
 *
 * Per DDD rule 10: the domain defines this interface; infrastructure provides
 * the Prisma implementation. `findById` backs both the (future) detail lookup
 * and the signal-creation instrumentId resolution (ADR-0038 D6).
 */

import type { InstrumentRecord, SearchInstrumentsOptions } from './InstrumentEntity.js';

export type IInstrumentRepository = {
  search(options: SearchInstrumentsOptions): Promise<InstrumentRecord[]>;
  findById(id: string): Promise<InstrumentRecord | null>;
};
