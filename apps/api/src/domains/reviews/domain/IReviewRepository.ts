/**
 * Port for review persistence.
 *
 * The reviews domain owns Review read/write operations. Infrastructure
 * adapters (PrismaReviewRepository) implement this interface, and use
 * cases depend on the port — not the concrete adapter.
 */

import type {
  ReviewRating,
  ReviewRecord,
  ReviewSentiment,
  SubmitReviewInput,
} from './ReviewEntity.js';

/**
 * Repository write contract. Tighter than {@link SubmitReviewInput} on
 * two axes: by the time the use case calls into the repo, the legacy
 * `rating` value has been synthesised (from sentiment if the caller
 * omitted it, per ADR-0028 D4) so it is non-optional at the boundary,
 * matching the DB column which stays NOT NULL until the Release-N+2
 * drop migration. `sentiment` is required at this boundary too — the
 * application layer must never persist a row that lacks a sentiment
 * verdict going forward (legacy nullable rows are the M3.2 backfill's
 * job).
 */
export type CreateReviewData = Omit<SubmitReviewInput, 'rating' | 'sentiment'> & {
  rating: ReviewRating;
  sentiment: ReviewSentiment;
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
