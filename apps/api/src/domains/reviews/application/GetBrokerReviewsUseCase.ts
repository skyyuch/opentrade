/**
 * Application layer: list reviews for a broker.
 *
 * Public endpoint — no auth required. Returns paginated reviews with
 * cursor-based pagination for infinite scroll UX.
 */

import type { IReviewRepository, ReviewListResult } from '../domain/IReviewRepository.js';

export type GetBrokerReviewsInput = {
  tenantId: string;
  brokerId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
  /**
   * Per M7.6a: optional kind filter passed through to the repo. The
   * repo defaults to `'REVIEW'` when omitted so the dominant caller
   * (public reviews tab) gets the correct behaviour by default.
   */
  kind?: 'REVIEW' | 'COMPLAINT' | undefined;
};

export class GetBrokerReviewsUseCase {
  constructor(private readonly reviewRepo: IReviewRepository) {}

  async execute(input: GetBrokerReviewsInput): Promise<ReviewListResult> {
    const limit = Math.min(input.limit ?? 20, 50);
    return this.reviewRepo.listByBroker({
      tenantId: input.tenantId,
      brokerId: input.brokerId,
      cursor: input.cursor,
      limit,
      kind: input.kind,
    });
  }
}
