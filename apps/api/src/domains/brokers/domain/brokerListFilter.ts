/**
 * Pure helper that builds the Prisma `where` clause for the public broker
 * list endpoint (`GET /v1/brokers`).
 *
 * The brokers domain has no repository layer yet (write operations still
 * live inline in `presentation/routes.ts`), so this pure function is the
 * single injection point for list filtering — and the unit-testable seam,
 * mirroring `aggregateSentiment`.
 *
 * Per ADR-0045 D2: a bullion dealer is a `Broker` row with
 * `category = BULLION`, not a separate entity. The `category` filter is
 * therefore an ordinary additive predicate on the same table; when it is
 * absent the clause is byte-for-byte the pre-ADR-0045 filter, so existing
 * callers (and the reviews / complaints / verify / claim pipelines that
 * bind to `brokerId`) see zero behavioural change.
 */

import type { BrokerCategory, Prisma } from '@opentrade/db';

export type BrokerListFilterInput = {
  tenantId: string;
  /** Free-text match against displayName / legalName (case-insensitive). */
  search?: string | undefined;
  /**
   * Optional category discriminator. When omitted, brokers of every
   * category are returned (no category predicate is added) — the principled
   * REST default and consistent with `GET /v1/instruments?category=`.
   */
  category?: BrokerCategory | undefined;
};

export function buildBrokerListWhere(input: BrokerListFilterInput): Prisma.BrokerWhereInput {
  return {
    tenantId: input.tenantId,
    deletedAt: null,
    ...(input.category ? { category: input.category } : {}),
    ...(input.search
      ? {
          OR: [
            { displayName: { contains: input.search, mode: 'insensitive' as const } },
            { legalName: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}
