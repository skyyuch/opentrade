/**
 * Cross-cutting instrument-catalog types shared between `apps/api` (which
 * serves `GET /v1/instruments`) and the front-ends (which render the signal
 * target picker). Per ADR-0038.
 *
 * Framework-free: no Prisma, no Next, no Hono imports. The DB enum
 * `AssetClass` is the source of truth for the full set of values; this module
 * only enumerates the FIVE user-facing picker categories (a curated subset,
 * per ADR-0038 D2) so the UI and search endpoint agree on what to surface.
 */

/**
 * The five categories surfaced in the signal target picker, in display order.
 * A curated subset of the DB `AssetClass` enum (ADR-0038 D2). The legacy
 * values `FUTURES` / `SPOT` / `FOREX` remain valid in the schema but are NOT
 * offered as new picker categories.
 */
export const INSTRUMENT_CATEGORIES = [
  'EQUITY_HK',
  'EQUITY_US',
  'INDEX',
  'CRYPTO',
  'COMMODITY',
] as const;

/** Union of the five surfaced picker categories. */
export type InstrumentCategory = (typeof INSTRUMENT_CATEGORIES)[number];

/**
 * Narrowing guard: is `value` one of the five surfaced picker categories?
 * Use at trust boundaries (query params, free-text) before treating a string
 * as an `InstrumentCategory`.
 */
export const isInstrumentCategory = (value: unknown): value is InstrumentCategory =>
  typeof value === 'string' && (INSTRUMENT_CATEGORIES as readonly string[]).includes(value);

/**
 * Provenance of a catalog row. Mirrors `Instrument.source` (ADR-0038 D5).
 */
export type InstrumentSource = 'HKEX' | 'SEC' | 'COINGECKO' | 'CURATED';

/**
 * The instrument shape returned by `GET /v1/instruments` and consumed by the
 * picker. Names follow the parallel-columns pattern; render them through
 * `localizedInstrumentName` (never a raw column). `category` is typed as the
 * surfaced subset because the endpoint only returns picker-eligible rows.
 */
export type InstrumentDto = {
  readonly id: string;
  readonly category: InstrumentCategory;
  /** Normalized canonical code (uppercase). */
  readonly symbol: string;
  /** What the UI shows as the code (often equals `symbol`). */
  readonly displayCode: string;
  readonly nameEn: string | null;
  readonly nameZh: string | null;
  readonly nameZhHans: string | null;
  readonly exchange: string | null;
};
