/**
 * Domain types for the economic-calendar bounded context (per ADR-0058).
 *
 * Aggregated official economic-release events are global reference data (no
 * tenantId, ADR-0058 D4). The compliance contract (ADR-0058 D1) means a record
 * carries ONLY facts published by the statistical authority itself — indicator
 * name / release time / region / covered period / previous value /
 * post-release actual value / canonical official link. NEVER a forecast or
 * consensus value, NEVER an impact/importance rating, NEVER interpretation.
 * The domain layer keeps zero infrastructure imports (rule 10), so the Prisma
 * enums are mirrored as hand-written unions (same pattern as `KolTypeValue`).
 */

/** Mirrors the `EconomicRegion` Prisma enum (ADR-0058 D1). */
export type EconomicRegionValue = 'US' | 'HK' | 'CN';

export const ECONOMIC_REGION_VALUES = [
  'US',
  'HK',
  'CN',
] as const satisfies readonly EconomicRegionValue[];

/**
 * Mirrors the `EconomicCategory` Prisma enum (ADR-0058 D1). Used purely for
 * filtering — NEVER for ranking one event above another (an editorial
 * importance rating is advice-adjacent and violates rule 00).
 */
export type EconomicCategoryValue =
  | 'INFLATION'
  | 'GROWTH'
  | 'EMPLOYMENT'
  | 'RATE_DECISION'
  | 'TRADE'
  | 'OTHER';

export const ECONOMIC_CATEGORY_VALUES = [
  'INFLATION',
  'GROWTH',
  'EMPLOYMENT',
  'RATE_DECISION',
  'TRADE',
  'OTHER',
] as const satisfies readonly EconomicCategoryValue[];

export type EconomicEventRecord = {
  id: string;
  /** Stable machine code, e.g. "US_CPI_YOY" (from `packages/config/calendar`). */
  indicatorCode: string;
  /** Trilingual display names (ADR-0058 D6, `Instrument` precedent). */
  nameZhHant: string;
  nameZhHans: string;
  nameEn: string;
  region: EconomicRegionValue;
  category: EconomicCategoryValue;
  /** Release timestamp — UTC; the sole ordering key (ADR-0058 D1/D7). */
  scheduledAt: Date;
  /** The covered period, e.g. "2026-06" / "2026 Q2". */
  periodLabel: string;
  /**
   * Decimal values are carried as strings (same convention as
   * `SignalRecord.entryPrice`) to avoid float precision loss. Null when the
   * authority has not published the figure (ADR-0058 D3 two-phase backfill).
   */
  previousValue: string | null;
  actualValue: string | null;
  /** Unit of `previousValue` / `actualValue`, e.g. "%" / "%_YOY" / "k". */
  unit: string;
  /** Issuing authority, e.g. "BLS" / "BEA". */
  sourceName: string;
  /** Canonical link to the official release page (ADR-0058 D1). */
  sourceUrl: string;
};

export type ListEventsOptions = {
  limit: number;
  /** Opaque cursor — the `id` of the last item from the previous page. */
  cursor?: string;
  /** Inclusive lower bound of the `scheduledAt` window (ADR-0058 D5). */
  from?: Date;
  /** Inclusive upper bound of the `scheduledAt` window (ADR-0058 D5). */
  to?: Date;
  /** Optional filter dimensions (ADR-0058 D5) — filtering only, never ranking. */
  region?: EconomicRegionValue;
  category?: EconomicCategoryValue;
};
