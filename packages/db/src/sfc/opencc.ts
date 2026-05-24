/**
 * Traditional → Simplified Chinese conversion for broker `displayName`.
 *
 * Background (per ADR-0026):
 *   - The `Broker` table stores Traditional Chinese in `displayName`
 *     (sourced verbatim from the SFC public register, which is HK 港繁).
 *   - To serve `zh-Hans` users we materialise a Simplified Chinese copy in
 *     `displayNameZhHans` rather than converting at request time (runtime
 *     conversion violates the "no hack / no runtime overhead" red line in
 *     cursor rule 00, and prevents admins from overriding individual
 *     conversions).
 *
 * Conversion choice:
 *   - OpenCC `t → cn` (Traditional → Mainland Simplified) — matches the
 *     `t2s.json` config called out in ADR-0026 D2. The generic `t` source
 *     is preferred over `hk` here because broker legal names are almost
 *     entirely composed of standard CJK characters plus common corp
 *     suffixes ("有限公司", "證券", "投資") for which `t → cn` and
 *     `hk → cn` produce identical output. Should we ever need HK-variant
 *     character handling (rare in legal corp names but possible for KOL
 *     handles), a successor ADR can flip the locale to `hk` here.
 *
 * Performance:
 *   - `opencc-js` is pure JS with the dictionary bundled (no I/O, no native
 *     dependency). Cost is dominated by initial Trie construction
 *     (~50 ms on M-series hardware) which we amortise via a lazy singleton.
 *   - Per-conversion cost is sub-millisecond for short strings, so calling
 *     this from inside the per-broker upsert loop in `sync-brokers.ts` is
 *     cheap enough to leave inline.
 *
 * Why live under `src/sfc/`:
 *   - The SFC pipeline is currently the only source of brokers (and
 *     therefore the only place we mint new Traditional Chinese display
 *     names). If a second source emerges (e.g. KOL nicknames in Phase 2)
 *     we'll lift this helper up to `src/i18n/` and write a new ADR.
 */

import OpenCC from 'opencc-js';

let converterSingleton: ((text: string) => string) | null = null;

/**
 * Returns a memoised Traditional → Simplified converter. Building the
 * converter loads the OpenCC dictionary into a Trie; doing it once per
 * process keeps the per-broker conversion cost negligible.
 */
const getConverter = (): ((text: string) => string) => {
  converterSingleton ??= OpenCC.Converter({ from: 't', to: 'cn' });
  return converterSingleton;
};

/**
 * Convert a Traditional Chinese string to Simplified Chinese. Returns
 * `null` when the input is empty, whitespace, or `null`/`undefined`,
 * matching the `displayNameZhHans` column type so callers can pass the
 * result straight into Prisma writes.
 *
 * The function is safe to call on already-Simplified input (it will
 * return the same string) but the caller is responsible for not
 * round-tripping through this helper repeatedly — `t → cn` is not
 * guaranteed to be an identity on its own output.
 */
export const toSimplifiedChinese = (input: string | null | undefined): string | null => {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  return getConverter()(trimmed);
};
