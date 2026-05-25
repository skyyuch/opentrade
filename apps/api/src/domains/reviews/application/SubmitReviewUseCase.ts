/**
 * Application layer: submit a new review.
 *
 * Flow (per ADR-0019, with translation deprecated per ADR-0027):
 *   1. Build the IPFS payload JSON from user input.
 *   2. Compute keccak256 content hash (matches on-chain ReviewRegistry).
 *   3. Pin JSON to IPFS via Pinata.
 *   4. Persist Review row + OutboxEvent in a single DB transaction
 *      (transaction managed inside the repository per ADR-0006 outbox pattern).
 *   5. A background worker (Phase 1+) reads the outbox and submits the
 *      chain transaction; on confirmation it calls updateChainStatus.
 *
 * ADR-0027 deprecates the prior synchronous DeepL translation step
 * (ADR-0023 D1/D3): reviews now ship as author-original. The use case no
 * longer accepts a translation service. `sourceLocale` is recorded
 * directly from the request (frontend next-intl locale, or `Accept-Language`
 * fallback) so the ReviewCard can render a language badge.
 *
 * ADR-0028 D3: the IPFS payload schema bumps from v1 to v2 in this use
 * case. v2 carries the new `sentiment` axis (the canonical post-1.5
 * verdict) and **retains** the legacy `rating` field so v1-aware
 * indexers (third-party readers, on-chain receipts pointing at pre-v2
 * CIDs) keep working unchanged. The presence of the `sentiment` key is
 * the v1↔v2 discriminator; the explicit `version: 2` is for human
 * auditors.
 *
 * Pure orchestration — no HTTP, no Prisma, no `process.*` direct access.
 */

import { keccak256, toBytes } from 'viem';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { IReviewRepository } from '../domain/IReviewRepository.js';
import type {
  ReviewRating,
  ReviewRecord,
  ReviewSentiment,
  SubmitReviewInput,
} from '../domain/ReviewEntity.js';
import type { IIpfsService } from '../infrastructure/IIpfsService.js';

export type SubmitReviewOutput = {
  review: ReviewRecord;
};

/**
 * Reverse of the ADR-0028 D2 backfill mapping: collapse a sentiment
 * verdict back to a single 1–5 representative so the deprecated
 * `Review.rating` column (NOT NULL until Release N+2 per D6) and the v2
 * IPFS payload's backward-compat `rating` field always carry a value
 * even when the web form has stopped sending the legacy axis.
 *
 * POSITIVE → 5 (top of the POS bucket from the M3.2 forward mapping)
 * NEUTRAL  → 3
 * NEGATIVE → 1
 *
 * Deliberately deterministic and lossy — the goal is to satisfy the
 * legacy column shape, not to perfectly reverse the original author
 * intent (which can no longer be recovered).
 */
function deriveRatingFromSentiment(sentiment: ReviewSentiment): ReviewRating {
  if (sentiment === 'POSITIVE') return 5;
  if (sentiment === 'NEUTRAL') return 3;
  return 1;
}

export class SubmitReviewUseCase {
  constructor(
    private readonly reviewRepo: IReviewRepository,
    private readonly ipfsService: IIpfsService,
  ) {}

  async execute(input: SubmitReviewInput): Promise<SubmitReviewOutput> {
    if (input.rating !== undefined && (input.rating < 1 || input.rating > 5)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Rating must be between 1 and 5', 400);
    }

    const rating = input.rating ?? deriveRatingFromSentiment(input.sentiment);

    // ADR-0028 D3 — IPFS payload schema v2. The new `sentiment` field is
    // the canonical post-Phase-1.5 verdict; the legacy `rating` field is
    // retained so v1-aware indexers (third-party readers, on-chain
    // receipts pointing at pre-v2 CIDs) keep parsing payloads without a
    // schema migration. Forward (v2-aware) readers prefer `sentiment`
    // when present; the presence of the key is the v1↔v2 discriminator.
    const ipfsPayload = {
      version: 2,
      brokerId: input.brokerId,
      title: input.title,
      body: input.body,
      sentiment: input.sentiment,
      rating,
      author: input.userId,
      createdAt: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(ipfsPayload);
    const contentHash = keccak256(toBytes(payloadString));

    const pinResult = await this.ipfsService.pinJson(ipfsPayload, `review-${Date.now()}`);

    const review = await this.reviewRepo.create({
      ...input,
      rating,
      sentiment: input.sentiment,
      contentHash,
      ipfsCid: pinResult.cid,
    });

    return { review };
  }
}
