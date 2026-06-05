/**
 * Prisma adapter for IModerationTermRepository (per ADR-0034).
 *
 * Read path: {@link findEnabledTerms} feeds the gate (filters invalid enum
 * values defensively rather than throwing on the hot path).
 *
 * Admin write path (Phase B): every mutation runs inside `$transaction` and
 * writes a `ModerationTermAudit` row alongside the change (ADR-0034 D3 / rule
 * 52). There is deliberately no hard-delete method — `softDeleteTerm` only sets
 * `deletedAt`, preserving history.
 */

import { isModerationCategory } from '@opentrade/shared';

import type { IModerationTermRepository } from '../domain/IModerationTermRepository.js';
import type {
  CreateModerationTermInput,
  ModerationAuditMeta,
  ModerationTermAuditAction,
  ModerationTermAuditRecord,
  ModerationTermListFilter,
  ModerationTermRecord,
  UpdateModerationTermPatch,
} from '../domain/ModerationTermEntity.js';
import type { Prisma, PrismaClient } from '@opentrade/db';

/** Shape of a `moderation_terms` row as Prisma returns it (subset we read). */
type ModerationTermRow = {
  id: string;
  tenantId: string;
  category: string;
  term: string;
  isRegex: boolean;
  enabled: boolean;
  note: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Opaque snapshot of a term written into `beforeJson` / `afterJson`. Captures
 * the curated blocklist fields only — never any user content (rule 50).
 */
const snapshot = (row: ModerationTermRow) => ({
  category: row.category,
  term: row.term,
  isRegex: row.isRegex,
  enabled: row.enabled,
  note: row.note,
});

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

  async listTerms(
    tenantId: string,
    filter: ModerationTermListFilter = {},
  ): Promise<ModerationTermRecord[]> {
    const rows = await this.prisma.moderationTerm.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filter.category ? { category: filter.category } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findTermById(tenantId: string, id: string): Promise<ModerationTermRecord | null> {
    const row = await this.prisma.moderationTerm.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    return row ? this.toRecord(row) : null;
  }

  async createTerm(
    input: CreateModerationTermInput,
    meta: ModerationAuditMeta,
  ): Promise<ModerationTermRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.moderationTerm.create({
        data: {
          tenantId: input.tenantId,
          category: input.category,
          term: input.term,
          isRegex: input.isRegex,
          note: input.note,
          createdByUserId: input.createdByUserId,
        },
      });

      await this.writeAudit(tx, {
        tenantId: input.tenantId,
        termId: created.id,
        action: 'CREATE',
        beforeJson: null,
        afterJson: snapshot(created),
        meta,
      });

      return created;
    });

    return this.toRecord(row);
  }

  async updateTerm(
    tenantId: string,
    id: string,
    patch: UpdateModerationTermPatch,
    meta: ModerationAuditMeta,
  ): Promise<ModerationTermRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.moderationTerm.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!before) {
        return null;
      }

      const after = await tx.moderationTerm.update({
        where: { id },
        data: {
          ...(patch.category !== undefined ? { category: patch.category } : {}),
          ...(patch.term !== undefined ? { term: patch.term } : {}),
          ...(patch.isRegex !== undefined ? { isRegex: patch.isRegex } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        },
      });

      await this.writeAudit(tx, {
        tenantId,
        termId: id,
        action: 'UPDATE',
        beforeJson: snapshot(before),
        afterJson: snapshot(after),
        meta,
      });

      return this.toRecord(after);
    });
  }

  async setEnabled(
    tenantId: string,
    id: string,
    enabled: boolean,
    meta: ModerationAuditMeta,
  ): Promise<ModerationTermRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.moderationTerm.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!before) {
        return null;
      }

      const after = await tx.moderationTerm.update({
        where: { id },
        data: { enabled },
      });

      await this.writeAudit(tx, {
        tenantId,
        termId: id,
        action: enabled ? 'ENABLE' : 'DISABLE',
        beforeJson: snapshot(before),
        afterJson: snapshot(after),
        meta,
      });

      return this.toRecord(after);
    });
  }

  async softDeleteTerm(
    tenantId: string,
    id: string,
    meta: ModerationAuditMeta,
  ): Promise<ModerationTermRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.moderationTerm.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!before) {
        return null;
      }

      // Soft-delete only (rule 52): set deletedAt, never DELETE the row.
      const after = await tx.moderationTerm.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.writeAudit(tx, {
        tenantId,
        termId: id,
        action: 'DELETE',
        beforeJson: snapshot(before),
        afterJson: snapshot(after),
        meta,
      });

      return this.toRecord(after);
    });
  }

  async listAudits(tenantId: string, termId: string): Promise<ModerationTermAuditRecord[]> {
    const rows = await this.prisma.moderationTermAudit.findMany({
      where: { tenantId, termId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      termId: row.termId,
      action: row.action as ModerationTermAuditAction,
      beforeJson: row.beforeJson,
      afterJson: row.afterJson,
      actorUserId: row.actorUserId,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Persist one audit row. Always called with the transaction client so the
   * audit lands atomically with its term change (ADR-0034 D3).
   */
  private async writeAudit(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      termId: string;
      action: ModerationTermAuditAction;
      beforeJson: ReturnType<typeof snapshot> | null;
      afterJson: ReturnType<typeof snapshot> | null;
      meta: ModerationAuditMeta;
    },
  ): Promise<void> {
    await tx.moderationTermAudit.create({
      data: {
        tenantId: args.tenantId,
        termId: args.termId,
        action: args.action,
        // Omit the Json key when there is no snapshot (e.g. CREATE has no
        // before): an absent nullable Json column persists as SQL NULL, which
        // is what we want, and satisfies exactOptionalPropertyTypes.
        ...(args.beforeJson !== null ? { beforeJson: args.beforeJson } : {}),
        ...(args.afterJson !== null ? { afterJson: args.afterJson } : {}),
        actorUserId: args.meta.actorUserId,
        reason: args.meta.reason,
      },
    });
  }

  private toRecord(row: ModerationTermRow): ModerationTermRecord {
    if (!isModerationCategory(row.category)) {
      // Should never happen: the DB enum mirrors the shared union and all
      // writes go through validated inputs. Defensive — surfaces a corrupt row
      // rather than silently coercing it.
      throw new Error(`Unexpected moderation category: ${row.category}`);
    }
    return {
      id: row.id,
      tenantId: row.tenantId,
      category: row.category,
      term: row.term,
      isRegex: row.isRegex,
      enabled: row.enabled,
      note: row.note,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
