/**
 * Prisma adapter for IModerationTermRepository (per ADR-0034).
 *
 * Phase A: read-only. Returns enabled, non-deleted terms for a tenant.
 */

import { isModerationCategory } from '@opentrade/shared';

import type { IModerationTermRepository } from '../domain/IModerationTermRepository.js';
import type { ModerationTermRecord } from '../domain/ModerationTermEntity.js';
import type { PrismaClient } from '@opentrade/db';

export class PrismaModerationTermRepository implements IModerationTermRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findEnabledTerms(tenantId: string): Promise<ModerationTermRecord[]> {
    const rows = await this.prisma.moderationTerm.findMany({
      where: { tenantId, enabled: true, deletedAt: null },
    });

    return rows
      .filter((row) => isModerationCategory(row.category))
      .map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        // Narrowed by the filter above; the DB enum mirrors the shared union.
        category: row.category,
        term: row.term,
        isRegex: row.isRegex,
        enabled: row.enabled,
        note: row.note,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  }
}
