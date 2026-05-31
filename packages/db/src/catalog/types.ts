/**
 * Canonical shape produced by every instrument source (HKEX / SEC / CoinGecko
 * / curated JSON) and consumed by {@link syncInstruments}. Per ADR-0038 D5.
 *
 * Sources are responsible for normalizing into this shape; the sync upsert is
 * source-agnostic. `nameZhHans` is intentionally absent — it is derived from
 * `nameZh` via OpenCC inside the upsert (ADR-0038 D4), so sources never carry
 * it.
 */

/**
 * The five surfaced picker categories (ADR-0038 D2). Defined locally rather
 * than imported from `@opentrade/shared` because `@opentrade/db` is a low-level
 * package: the build graph does not build `@opentrade/shared` to `dist` before
 * type-checking `db`, so a cross-package import would break `tsc`. The
 * canonical list lives in `@opentrade/shared`'s `INSTRUMENT_CATEGORIES`; the
 * Prisma `AssetClass` enum is the runtime source of truth for the column.
 */
export type InstrumentCategory = 'EQUITY_HK' | 'EQUITY_US' | 'INDEX' | 'CRYPTO' | 'COMMODITY';

/** Provenance of a catalog row (ADR-0038 D5). Mirrors `Instrument.source`. */
export type InstrumentSource = 'HKEX' | 'SEC' | 'COINGECKO' | 'CURATED';

export type InstrumentData = {
  /** One of the five surfaced picker categories (ADR-0038 D2). */
  category: InstrumentCategory;
  /** Normalized canonical code; will be uppercased + trimmed on write. */
  symbol: string;
  /** What the UI shows as the code (often equals `symbol`). */
  displayCode: string;
  /** English name. Nullable: not every instrument has one. */
  nameEn?: string | null;
  /** Traditional Chinese name. Null for instruments with no Chinese name. */
  nameZh?: string | null;
  /** Listing venue, e.g. "HKEX" / "NASDAQ". Nullable for crypto/index. */
  exchange?: string | null;
  /** Provenance — drives per-source reconciliation in {@link syncInstruments}. */
  source: InstrumentSource;
};

export type InstrumentSyncResult = {
  created: number;
  updated: number;
  reactivated: number;
  retired: number;
};
