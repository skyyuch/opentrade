/**
 * Port for review persistence.
 *
 * The reviews domain owns Review read/write operations. Infrastructure
 * adapters (PrismaReviewRepository) implement this interface, and use
 * cases depend on the port — not the concrete adapter.
 */

import type { ReviewRecord, SubmitReviewInput } from './ReviewEntity.js';

export type CreateReviewData = SubmitReviewInput & {
  contentHash: string;
  ipfsCid: string;
};

export type ReviewListOptions = {
  tenantId: string;
  brokerId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
};

export type ReviewListResult = {
  items: ReviewRecord[];
  nextCursor: string | null;
};

export type IReviewRepository = {
  create(data: CreateReviewData): Promise<ReviewRecord>;
  findById(id: string): Promise<ReviewRecord | null>;
  listByBroker(options: ReviewListOptions): Promise<ReviewListResult>;
  updateChainStatus(
    id: string,
    update: { chainReviewId: number; txHash: string; status: 'CONFIRMED' },
  ): Promise<ReviewRecord>;
  markFailed(id: string): Promise<ReviewRecord>;
};
