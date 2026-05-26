/**
 * Prisma adapter for IComplaintRepository.
 *
 * Writes Review rows with `kind = COMPLAINT` per ADR-0029 D1, sharing
 * the same table with kind=REVIEW rows. Outbox events
 * (`complaint.submitted` / `complaint.verified` / `complaint.rejected`)
 * are written in the same transaction as the row insert/update per
 * the ADR-0006 outbox pattern; the worker treats them as ack-only in
 * Phase 1 (per ADR-0029 D7).
 *
 * Cursor-based pagination uses `createdAt` + `id` for deterministic
 * ordering even when multiple complaints share the same timestamp,
 * mirroring `PrismaReviewRepository`.
 */

import type { ComplaintRecord } from '../domain/ComplaintEntity.js';
import type {
  ComplaintListFilter,
  ComplaintListResult,
  CreateComplaintData,
  IComplaintRepository,
  VerifyComplaintMutation,
} from '../domain/IComplaintRepository.js';
import type { PrismaClient } from '@opentrade/db';

export class PrismaComplaintRepository implements IComplaintRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateComplaintData): Promise<ComplaintRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          brokerId: data.brokerId,
          contentHash: data.contentHash,
          ipfsCid: data.ipfsCid,
          title: data.title,
          body: data.body,
          // Per ADR-0028 D6: legacy `rating` column stays NOT NULL until
          // the Release-N+2 drop migration. SubmitComplaintUseCase passes
          // a derived value (NEGATIVE → 1 for default-tone complaints)
          // so the row satisfies the legacy column without burdening the
          // domain layer with the deprecated axis.
          rating: 1,
          sentiment: data.sentiment,
          sourceLocale: data.sourceLocale,
          kind: 'COMPLAINT',
          evidenceIpfsCid: data.evidenceIpfsCid,
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: data.tenantId,
          aggregateType: 'complaint',
          aggregateId: created.id,
          eventType: 'complaint.submitted',
          payload: {
            brokerId: data.brokerId,
            contentHash: data.contentHash,
            ipfsCid: data.ipfsCid,
            evidenceIpfsCid: data.evidenceIpfsCid,
            userId: data.userId,
          },
        },
      });

      return created;
    });

    return this.toRecord(row);
  }

  async findById(id: string): Promise<ComplaintRecord | null> {
    const row = await this.prisma.review.findFirst({
      where: { id, kind: 'COMPLAINT' },
    });
    return row ? this.toRecord(row) : null;
  }

  async list(filter: ComplaintListFilter): Promise<ComplaintListResult> {
    const limit = filter.limit ?? 20;

    const statusWhere = (() => {
      // Verification status is derived (per ADR-0029 D4 — there is no
      // status column) so we translate the requested filter into the
      // pair of boolean conditions on `verifiedAt` + `adminNote`.
      switch (filter.status) {
        case 'OPEN':
          return { verifiedAt: null, adminNote: null };
        case 'VERIFIED':
          return { verifiedAt: { not: null } };
        case 'REJECTED':
          return { verifiedAt: null, adminNote: { not: null } };
        case undefined:
          return {};
      }
    })();

    const where = {
      tenantId: filter.tenantId,
      kind: 'COMPLAINT' as const,
      deletedAt: null,
      ...(filter.brokerId ? { brokerId: filter.brokerId } : {}),
      ...statusWhere,
    };

    const findArgs: Parameters<typeof this.prisma.review.findMany>[0] = {
      where,
      orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      take: limit + 1,
    };

    if (filter.cursor) {
      findArgs.cursor = { id: filter.cursor };
      findArgs.skip = 1;
    }

    const rows = await this.prisma.review.findMany(findArgs);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return {
      items: items.map((r) => this.toRecord(r)),
      nextCursor,
    };
  }

  async applyVerification(id: string, mutation: VerifyComplaintMutation): Promise<ComplaintRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.review.findFirst({
        where: { id, kind: 'COMPLAINT' },
        select: { tenantId: true, brokerId: true },
      });
      if (!existing) {
        throw new Error(`Complaint ${id} not found`);
      }

      const updateData =
        mutation.kind === 'verify'
          ? {
              verifiedAt: mutation.now,
              verifiedByUserId: mutation.adminUserId,
              // Clear any prior reject note so a re-verified complaint
              // doesn't display stale text alongside the verified badge.
              adminNote: null,
            }
          : {
              // Per rule 00 «reject != delete»: only the adminNote
              // changes. verifiedAt stays null (no-op since it was
              // already null when status was OPEN); body / title /
              // evidence / contentHash / ipfsCid are immutable.
              adminNote: mutation.adminNote,
            };

      const updated = await tx.review.update({
        where: { id },
        data: updateData,
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: existing.tenantId,
          aggregateType: 'complaint',
          aggregateId: id,
          eventType: mutation.kind === 'verify' ? 'complaint.verified' : 'complaint.rejected',
          payload: {
            brokerId: existing.brokerId,
            adminUserId: mutation.adminUserId,
            ...(mutation.kind === 'reject' ? { adminNote: mutation.adminNote } : {}),
          },
        },
      });

      return updated;
    });

    return this.toRecord(row);
  }

  private toRecord(row: {
    id: string;
    tenantId: string;
    userId: string;
    brokerId: string;
    contentHash: string;
    ipfsCid: string | null;
    title: string;
    body: string;
    sentiment: string | null;
    sourceLocale: string | null;
    evidenceIpfsCid: string | null;
    verifiedAt: Date | null;
    verifiedByUserId: string | null;
    adminNote: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ComplaintRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      brokerId: row.brokerId,
      contentHash: row.contentHash,
      ipfsCid: row.ipfsCid,
      title: row.title,
      body: row.body,
      sentiment: row.sentiment as ComplaintRecord['sentiment'],
      sourceLocale: row.sourceLocale as ComplaintRecord['sourceLocale'],
      // Non-null for complaints by ADR-0029 D3 enforcement at submit
      // time; the column is nullable on the underlying table because
      // kind=REVIEW rows do not have evidence. This cast asserts the
      // discriminator-implied invariant — the repo's findById/list
      // both already filter `kind = COMPLAINT`.
      evidenceIpfsCid: row.evidenceIpfsCid ?? '',
      verifiedAt: row.verifiedAt,
      verifiedByUserId: row.verifiedByUserId,
      adminNote: row.adminNote,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
