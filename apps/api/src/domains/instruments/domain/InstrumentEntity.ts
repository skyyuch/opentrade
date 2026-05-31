/**
 * Domain types for the instruments bounded context (per ADR-0038).
 *
 * Instruments are global market reference data (no tenantId). The category is
 * one of the five surfaced picker categories — a curated subset of the DB
 * `AssetClass` enum (ADR-0038 D2). The domain layer keeps zero infrastructure
 * imports (rule 10); the category union is sourced from `@opentrade/shared`,
 * the canonical cross-layer definition.
 */

import type { InstrumentCategory } from '@opentrade/shared';

export type { InstrumentCategory };

export type InstrumentRecord = {
  id: string;
  category: InstrumentCategory;
  symbol: string;
  displayCode: string;
  nameEn: string | null;
  nameZh: string | null;
  nameZhHans: string | null;
  exchange: string | null;
};

export type SearchInstrumentsOptions = {
  category?: InstrumentCategory;
  /** Free-text query matched against symbol / displayCode / nameEn / nameZh. */
  q?: string;
  limit: number;
};
