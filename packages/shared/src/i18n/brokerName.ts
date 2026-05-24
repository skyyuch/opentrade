/**
 * Canonical locale-aware display picker for any OpenTrade entity that uses
 * the "parallel columns" multilingual pattern (per cursor rule 51 §A).
 *
 * The platform stores entity names in (up to) three parallel columns:
 *   - `displayName`       — Traditional Chinese. Required by the schema.
 *   - `displayNameZhHans` — Simplified Chinese, derived from `displayName`
 *                           via OpenCC (per ADR-0026). Nullable because
 *                           backfill is best-effort and admins may want
 *                           to override or skip individual brokers.
 *   - `legalName`         — English. May be missing for entities that
 *                           have no official English name (some HK 公司).
 *
 * Whenever a UI surface displays one of these names, it MUST go through this
 * helper (or a thin wrapper around it). Rendering `displayName` directly is
 * a locale leak — English users see Chinese; rendering `legalName` directly
 * is the mirror leak. Rendering the slug is always wrong (slugs are routing
 * primitives, not user-facing copy).
 *
 * The helper is a pure function with no framework imports so it can be
 * called from React Server Components, Hono handlers, Storybook, and tests
 * alike.
 *
 * Locale handling:
 *   - `en`         → prefer `legalName`, fall back to `displayName`,
 *                    finally to `slug`.
 *   - `zh-Hans`    → prefer `displayNameZhHans`, fall back to
 *                    `displayName` (Traditional), then `legalName`,
 *                    finally to `slug`. The `displayName` fallback
 *                    is intentional: when OpenCC backfill rejects a
 *                    row, showing Traditional Chinese is strictly
 *                    better than slug or English for Simplified
 *                    Chinese readers.
 *   - `zh-Hant` and any other non-`en` locale → prefer `displayName`,
 *                    fall back to `legalName`, finally to `slug`.
 *
 * The fallback chain matters: `legalName` and `displayNameZhHans` are
 * nullable in the DB, and a small fraction of HK 公司 records have only
 * Chinese names. We never want to render an empty pill — slug is the worst
 * case but acceptable.
 *
 * Why not implement this per-app? Three reasons:
 *   1. It's invariant across web + console + (future) email + (future) SDK.
 *   2. Dragging `next-intl`'s `useLocale()` into pure logic ties the helper
 *      to React; the locale is *already* a string by the time it reaches
 *      this fork in code paths.
 *   3. Centralising the rule means future tweaks (e.g. zh-Hans-specific
 *      legal-name preference) live in exactly one place.
 */

/**
 * Minimal shape required by the helper. Concrete entity types
 * (`Broker`, future `Kol`, future `BrokerLicense`, ...) extend this with
 * their own fields, but the helper deliberately only sees the name columns
 * plus the slug fallback so it stays reusable.
 *
 * All name columns are typed as `string | null | undefined` — even
 * `displayName` which the DB schema marks NOT NULL — so that callers can
 * safely pass partial Prisma selects, raw outbox payloads, or future
 * entities without runtime guards. The slug fallback is the contract:
 * the helper always returns a non-empty string.
 */
export type LocalizedNameInput = {
  /** Routing primitive. Used as last-resort fallback; always non-empty. */
  readonly slug: string;
  /** Traditional Chinese display name. Schema is NOT NULL but typed
   *  nullable here for defensive use across partial-select call sites. */
  readonly displayName?: string | null | undefined;
  /** Simplified Chinese display name (OpenCC-derived per ADR-0026).
   *  Nullable: backfill is best-effort and admins may override. */
  readonly displayNameZhHans?: string | null | undefined;
  /** English legal name. Nullable: some HK 公司 have no official
   *  English name. */
  readonly legalName?: string | null | undefined;
};

/**
 * The OpenTrade locale set is enumerated in `packages/config/src/locales.ts`
 * but we only branch on `en` / `zh-Hans` / everything else here, so a free
 * `string` type is enough and keeps this module from depending on
 * `@opentrade/config`.
 */
export type LocaleString = string;

/**
 * Pick the best name to display for `entity` in `locale`.
 *
 * Always returns a non-empty string. The slug fallback only triggers when
 * every name column is missing — which the schema makes impossible for
 * `displayName`, so in practice this is a defensive guard for malformed
 * payloads.
 *
 * @example
 *   localizedBrokerName(
 *     { slug: 'hsbc-...', displayName: '匯豐', legalName: 'HSBC' },
 *     'en',
 *   )
 *   // → 'HSBC'
 *
 *   localizedBrokerName(
 *     { slug: 'hsbc-...', displayName: '匯豐', legalName: 'HSBC' },
 *     'zh-Hant',
 *   )
 *   // → '匯豐'
 *
 *   localizedBrokerName(
 *     {
 *       slug: 'hsbc-...',
 *       displayName: '匯豐',
 *       displayNameZhHans: '汇丰',
 *       legalName: 'HSBC',
 *     },
 *     'zh-Hans',
 *   )
 *   // → '汇丰'
 *
 *   localizedBrokerName(
 *     { slug: 'foo', displayName: '中文公司', legalName: null },
 *     'en',
 *   )
 *   // → '中文公司'  (en falls back to displayName when legalName is null)
 *
 *   localizedBrokerName(
 *     { slug: 'foo', displayName: '中文公司', displayNameZhHans: null },
 *     'zh-Hans',
 *   )
 *   // → '中文公司'  (zh-Hans falls back to Traditional when zh-Hans is null)
 */
export const localizedBrokerName = (entity: LocalizedNameInput, locale: LocaleString): string => {
  const { slug, displayName, displayNameZhHans, legalName } = entity;
  if (locale === 'en') {
    return legalName ?? displayName ?? slug;
  }
  if (locale === 'zh-Hans') {
    return displayNameZhHans ?? displayName ?? legalName ?? slug;
  }
  return displayName ?? legalName ?? slug;
};
