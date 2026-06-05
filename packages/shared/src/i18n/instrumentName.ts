/**
 * Locale-aware display picker for catalog instruments, mirroring
 * `localizedBrokerName` (per cursor rule 51 §A + ADR-0038 D4).
 *
 * Instruments store names in (up to) three parallel columns:
 *   - `nameEn`     — English name. Crypto and US equities usually have one;
 *                    HK equities have one too. Nullable for safety.
 *   - `nameZh`     — Traditional Chinese name. HK equities have one; US
 *                    equities and crypto typically do NOT (null → English).
 *   - `nameZhHans` — Simplified Chinese, OpenCC-derived during sync. Nullable
 *                    and best-effort, exactly like `Broker.displayNameZhHans`.
 *
 * Unlike brokers (whose last-resort fallback is `slug`), an instrument's
 * guaranteed non-empty fallback is its `symbol` — the normalized canonical
 * code that is always present (e.g. "00005", "AAPL", "BTC"). A symbol is a
 * reasonable thing to show a user when no localized name exists.
 *
 * Pure function, no framework imports, so it can be called from React Server
 * Components, Hono handlers, Storybook, and tests alike.
 *
 * Locale handling:
 *   - `en`       → `nameEn ?? nameZh ?? symbol`
 *   - `zh-Hans`  → `nameZhHans ?? nameZh ?? nameEn ?? symbol`
 *   - `zh-Hant` and any other non-`en` locale
 *                → `nameZh ?? nameEn ?? symbol`
 */

import type { LocaleString } from './brokerName';

/**
 * Minimal shape required by the helper. The concrete `Instrument` DTO extends
 * this; the helper deliberately only sees the name columns plus the symbol
 * fallback so it stays reusable across partial selects and raw payloads.
 */
export type LocalizedInstrumentNameInput = {
  /** Normalized canonical code. Last-resort fallback; always non-empty. */
  readonly symbol: string;
  /** English name. Nullable: not every instrument has one. */
  readonly nameEn?: string | null | undefined;
  /** Traditional Chinese name. Nullable: US equities / crypto often lack one. */
  readonly nameZh?: string | null | undefined;
  /** Simplified Chinese name (OpenCC-derived). Nullable: best-effort. */
  readonly nameZhHans?: string | null | undefined;
};

/**
 * Pick the best name to display for `instrument` in `locale`.
 *
 * Always returns a non-empty string. The `symbol` fallback triggers whenever
 * every name column is missing, which is common for niche crypto/index rows.
 *
 * @example
 *   localizedInstrumentName(
 *     { symbol: '00005', nameZh: '匯豐控股', nameZhHans: '汇丰控股', nameEn: 'HSBC Holdings' },
 *     'zh-Hant',
 *   )
 *   // → '匯豐控股'
 *
 *   localizedInstrumentName(
 *     { symbol: 'AAPL', nameEn: 'Apple Inc.', nameZh: null },
 *     'zh-Hant',
 *   )
 *   // → 'Apple Inc.'  (zh-Hant falls back to English when nameZh is null)
 *
 *   localizedInstrumentName({ symbol: 'BTC' }, 'en')
 *   // → 'BTC'  (symbol is the guaranteed fallback)
 */
export const localizedInstrumentName = (
  instrument: LocalizedInstrumentNameInput,
  locale: LocaleString,
): string => {
  const { symbol, nameEn, nameZh, nameZhHans } = instrument;
  if (locale === 'en') {
    return nameEn ?? nameZh ?? symbol;
  }
  if (locale === 'zh-Hans') {
    return nameZhHans ?? nameZh ?? nameEn ?? symbol;
  }
  return nameZh ?? nameEn ?? symbol;
};
