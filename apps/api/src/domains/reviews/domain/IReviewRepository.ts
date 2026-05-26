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

export type ReviewSort = 'latest' | 'positive_first' | 'negative_first';
export type ReviewAuthorFilter = 'all' | 'verified' | 'kol';

export type ReviewListOptions = {
  tenantId: string;
  brokerId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
  /**
   * Per ADR-0029 D1 / M7.6a: the Review table is shared between true
   * reviews and complaints via the `kind` discriminator. The reviews
   * domain only ever wants `kind = REVIEW` rows — listing without the
   * filter would silently return both after M7.3a, polluting the
   * broker page's reviews tab with complaint rows.
   *
   * Repos MUST default to `'REVIEW'` when this is omitted so the
   * default behaviour is correct. `'COMPLAINT'` is allowed for
   * symmetry (admin tools that want the same paging shape across
   * both kinds) but the canonical complaint read surface is
   * `/v1/complaints/broker/:slug`, which carries the evidence /
   * verification metadata this endpoint cannot ship.
   */
  kind?: 'REVIEW' | 'COMPLAINT' | undefined;
  sort?: ReviewSort | undefined;
  authorFilter?: ReviewAuthorFilter | undefined;
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
