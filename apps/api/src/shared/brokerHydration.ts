/**
 * Locale-aware name hydration for endpoints that expose broker slugs in
 * their payload but don't already join the `brokers` table.
 *
 * Per cursor rule 51, every API response that ships a broker reference MUST
 * carry both `displayName` (Chinese) and `legalName` (English), so the
 * frontend can pick the right column with `localizedBrokerName(b, locale)`
 * from `@opentrade/shared`. Sending only the slug forces consumers to
 * render `hsbc-broking-securities-hong-kong-limited` (the actual user-
 * reported regression on /verify and /admin/verifications); sending only
 * `displayName` (the previous shortcut) leaks Chinese into English-locale
 * UIs.
 *
 * This helper centralises the "given a set of slugs, get a slug → name
 * map" step so handlers don't each redo the dedupe / batch fetch / map
 * dance. It does NOT do paging — the caller is responsible for keeping
 * the slug set bounded (in practice it always is: the list endpoints cap
 * at 50–100 rows and each row references at most a few brokers).
 *
 * Tenancy: every query is scoped by `tenantId` because Broker.slug is only
 * unique within a tenant (per Prisma schema); leaking another tenant's
 * `displayName` would be a data isolation bug, not just a 404.
 */

import { prisma } from '@opentrade/db';

/**
 * Subset of `Broker` columns required by `localizedBrokerName()`.
 * Re-exposed here (rather than importing from `@opentrade/shared`) so the
 * caller can spread the result directly into a response without a
 * type-shape gymnastic.
 */
export interface BrokerNameMeta {
  readonly displayName: string;
  readonly legalName: string | null;
}

/**
 * Fetch `{ displayName, legalName }` for every requested slug in a single
 * indexed query, returning a `Map` keyed by slug. Slugs that don't exist
 * (e.g. dangling `user_verified_brokers` rows after a broker is soft-
 * deleted) are simply absent from the map; callers should fall back to
 * the slug itself in that case.
 *
 * Empty input is a no-op that returns an empty map without hitting Prisma.
 */
export const hydrateBrokerNames = async (
  slugs: readonly string[],
  tenantId: string,
): Promise<Map<string, BrokerNameMeta>> => {
  if (slugs.length === 0) return new Map();

  const unique = [...new Set(slugs)];
  const brokers = await prisma.broker.findMany({
    where: { tenantId, slug: { in: unique } },
    select: { slug: true, displayName: true, legalName: true },
  });

  return new Map(
    brokers.map((b) => [b.slug, { displayName: b.displayName, legalName: b.legalName }]),
  );
};

/**
 * Convenience: enrich `{ brokerSlug, ... }` rows with a localised
 * `displayName + legalName` pair pulled from the hydration map. Rows whose
 * slug is missing from the map fall back to `{ displayName: slug,
 * legalName: null }` so the consumer never gets `undefined`.
 */
export const enrichWithBrokerNames = <T extends { brokerSlug: string }>(
  rows: readonly T[],
  nameMap: Map<string, BrokerNameMeta>,
): Array<T & BrokerNameMeta> => {
  return rows.map((row) => {
    const meta = nameMap.get(row.brokerSlug);
    return {
      ...row,
      displayName: meta?.displayName ?? row.brokerSlug,
      legalName: meta?.legalName ?? null,
    };
  });
};
