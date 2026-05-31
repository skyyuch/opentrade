/**
 * Instrument-catalog sync surface (per ADR-0038). Exposes the source-agnostic
 * idempotent upsert and its types; source fetchers live under `./sources/`.
 */

export { syncInstruments } from './sync-instruments.js';
export type { InstrumentData, InstrumentSyncResult } from './types.js';
