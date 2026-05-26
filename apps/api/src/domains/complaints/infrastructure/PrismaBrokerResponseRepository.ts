/**
 * Prisma adapter for IBrokerResponseRepository per ADR-0037.
 *
 * Writes Review rows with `kind = REVIEW` + `respondsToReviewId` set,
 * sharing the same table as reviews and complaints. The outbox event
 * `broker_response.submitted` is written in the same transaction as the
 * row insert (per ADR-0006 outbox pattern); the worker treats it as
 * ack-only in Phase 2.5 (per ADR-0037 D3).
 */

import type { BrokerResponseRecord } from '../domain/BrokerResponseEntity.js';
import type {
  CreateBrokerResponseData,
  IBrokerResponseRepository,
} from '../domain/IBrokerResponseRepository.js';
import type { PrismaClient } from '@opentrade/db';

export class PrismaBrokerResponseRepository implements IBrokerResponseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateBrokerResponseData): Promise<BrokerResponseRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          brokerId: data.brokerId,
          contentHash: data.contentHash,
          ipfsCid: data.ipfsCid,
          title: '',
          body: data.body,
          // Per ADR-0028 D6: legacy `rating` column stays NOT NULL.
          // Per ADR-0037 D2: broker responses carry no sentiment.
          rating: 3,
          sentiment: null,
          sourceLocale: data.sourceLocale,
          kind: 'REVIEW',
          respondsToReviewId: data.complaintId,
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: data.tenantId,
          aggregateType: 'broker_response',
          aggregateId: created.id,
          eventType: 'broker_response.submitted',
          payload: {
            brokerId: data.brokerId,
            complaintId: data.complaintId,
            contentHash: data.contentHash,
            ipfsCid: data.ipfsCid,
            userId: data.userId,
          },
        },
      });

      return created;
    });

    return this.toRecord(row);
  }

  async existsForComplaint(complaintId: string, brokerId: string): Promise<boolean> {
    const count = await this.prisma.review.count({
      where: {
        respondsToReviewId: complaintId,
        brokerId,
        kind: 'REVIEW',
        deletedAt: null,
      },
    });
    return count > 0;
  }

  async findByComplaintId(complaintId: string): Promise<BrokerResponseRecord | null> {
    const row = await this.prisma.review.findFirst({
      where: {
        respondsToReviewId: complaintId,
        kind: 'REVIEW',
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
    return row ? this.toRecord(row) : null;
  }

  async findByComplaintIds(complaintIds: string[]): Promise<Map<string, BrokerResponseRecord>> {
    if (complaintIds.length === 0) return new Map();

    const rows = await this.prisma.review.findMany({
      where: {
        respondsToReviewId: { in: complaintIds },
        kind: 'REVIEW',
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    const map = new Map<string, BrokerResponseRecord>();
    for (const row of rows) {
      if (row.respondsToReviewId && !map.has(row.respondsToReviewId)) {
        map.set(row.respondsToReviewId, this.toRecord(row));
      }
    }
    return map;
  }

  private toRecord(row: {
    id: string;
    tenantId: string;
    userId: string;
    brokerId: string;
    respondsToReviewId: string | null;
    body: string;
    contentHash: string;
    ipfsCid: string | null;
    sourceLocale: string | null;
    createdAt: Date;
  }): BrokerResponseRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      brokerId: row.brokerId,
      respondsToReviewId: row.respondsToReviewId ?? '',
      body: row.body,
      contentHash: row.contentHash,
      ipfsCid: row.ipfsCid,
      sourceLocale: row.sourceLocale as BrokerResponseRecord['sourceLocale'],
      createdAt: row.createdAt,
    };
  }
}
