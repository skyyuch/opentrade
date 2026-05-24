/**
 * Prisma adapter for IReviewRepository.
 *
 * Creates Review rows alongside OutboxEvent rows in a single transaction
 * (per ADR-0006 outbox pattern). The outbox event carries the minimal data
 * a background worker needs to submit the on-chain transaction.
 *
 * Cursor-based pagination uses `createdAt` + `id` for deterministic ordering
 * even when multiple reviews share the same timestamp.
 */

import type {
  CreateReviewData,
  IReviewRepository,
  ReviewListOptions,
  ReviewListResult,
} from '../domain/IReviewRepository.js';
import type { ReviewRecord } from '../domain/ReviewEntity.js';
import type { PrismaClient } from '@opentrade/db';

export class PrismaReviewRepository implements IReviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateReviewData): Promise<ReviewRecord> {
    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          brokerId: data.brokerId,
          contentHash: data.contentHash,
          ipfsCid: data.ipfsCid,
          title: data.title,
          body: data.body,
          rating: data.rating,
          sourceLocale: data.sourceLocale,
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: data.tenantId,
          aggregateType: 'review',
          aggregateId: created.id,
          eventType: 'review.submitted',
          payload: {
            brokerId: data.brokerId,
            contentHash: data.contentHash,
            ipfsCid: data.ipfsCid,
            userId: data.userId,
          },
        },
      });

      return created;
    });

    return this.toRecord(review);
  }

  async findById(id: string): Promise<ReviewRecord | null> {
    const row = await this.prisma.review.findUnique({ where: { id } });
    return row ? this.toRecord(row) : null;
  }

  async listByBroker(options: ReviewListOptions): Promise<ReviewListResult> {
    const limit = options.limit ?? 20;

    const where = {
      tenantId: options.tenantId,
      brokerId: options.brokerId,
      deletedAt: null,
    };

    const findArgs: Parameters<typeof this.prisma.review.findMany>[0] = {
      where,
      orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      take: limit + 1,
    };

    if (options.cursor) {
      findArgs.cursor = { id: options.cursor };
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

  async updateChainStatus(
    id: string,
    update: { chainReviewId: number; txHash: string; status: 'CONFIRMED' },
  ): Promise<ReviewRecord> {
    const row = await this.prisma.review.update({
      where: { id },
      data: {
        chainReviewId: update.chainReviewId,
        txHash: update.txHash,
        status: update.status,
      },
    });
    return this.toRecord(row);
  }

  async markFailed(id: string): Promise<ReviewRecord> {
    const row = await this.prisma.review.update({
      where: { id },
      data: { status: 'FAILED' },
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
    chainReviewId: number | null;
    txHash: string | null;
    title: string;
    body: string;
    rating: number;
    status: string;
    sourceLocale: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ReviewRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      brokerId: row.brokerId,
      contentHash: row.contentHash,
      ipfsCid: row.ipfsCid,
      chainReviewId: row.chainReviewId,
      txHash: row.txHash,
      title: row.title,
      body: row.body,
      rating: row.rating,
      status: row.status as ReviewRecord['status'],
      sourceLocale: row.sourceLocale as ReviewRecord['sourceLocale'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
