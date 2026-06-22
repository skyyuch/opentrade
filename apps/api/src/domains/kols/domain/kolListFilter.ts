/**
 * Pure helper that builds the Prisma `where` clause for KOL list/count
 * queries (the public `GET /v1/kols` directory and the admin listing).
 *
 * Mirrors `brokers/domain/brokerListFilter.ts`: a single, unit-testable
 * filter seam so the category dimensions are an ordinary additive predicate.
 *
 * Per ADR-0053: `type` (KOL kind) and `focus` (asset focus) are two
 * independent, nullable dimensions. When either is absent no predicate is
 * added for it, so the produced clause is byte-for-byte the pre-ADR-0053
 * filter (tenant + soft-delete + optional status) — existing callers and the
 * signal pipeline see zero behavioural change.
 */

import type { KolStatusValue, KolTypeValue, KolFocusValue } from './KolEntity.js';
import type { Prisma } from '@opentrade/db';

export type KolListFilterInput = {
  tenantId: string;
  /** Optional lifecycle status (UNCLAIMED / PENDING / APPROVED / ...). */
  status?: KolStatusValue | undefined;
  /** Optional category discriminator per ADR-0053. */
  type?: KolTypeValue | undefined;
  /** Optional asset-focus discriminator per ADR-0053. */
  focus?: KolFocusValue | undefined;
};

export function buildKolListWhere(input: KolListFilterInput): Prisma.KolWhereInput {
  return {
    tenantId: input.tenantId,
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.focus ? { focus: input.focus } : {}),
  };
}
