/**
 * Application layer: submit a new review.
 *
 * Flow (per ADR-0019):
 *   1. Build the IPFS payload JSON from user input.
 *   2. Compute keccak256 content hash (matches on-chain ReviewRegistry).
 *   3. Pin JSON to IPFS via Pinata.
 *   4. Persist Review row + OutboxEvent in a single DB transaction
 *      (transaction managed inside the repository per ADR-0006 outbox pattern).
 *   5. A background worker (Phase 1+) reads the outbox and submits the
 *      chain transaction; on confirmation it calls updateChainStatus.
 *
 * Pure orchestration — no HTTP, no Prisma, no `process.*` direct access.
 */

import { keccak256, toBytes } from 'viem';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { IReviewRepository } from '../domain/IReviewRepository.js';
import type { ReviewRecord, SubmitReviewInput } from '../domain/ReviewEntity.js';
import type { IIpfsService } from '../infrastructure/IIpfsService.js';

export type SubmitReviewOutput = {
  review: ReviewRecord;
};

export class SubmitReviewUseCase {
  constructor(
    private readonly reviewRepo: IReviewRepository,
    private readonly ipfsService: IIpfsService,
  ) {}

  async execute(input: SubmitReviewInput): Promise<SubmitReviewOutput> {
    if (input.rating < 1 || input.rating > 5) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Rating must be between 1 and 5', 400);
    }

    const ipfsPayload = {
      version: 1,
      brokerId: input.brokerId,
      title: input.title,
      body: input.body,
      rating: input.rating,
      author: input.userId,
      createdAt: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(ipfsPayload);
    const contentHash = keccak256(toBytes(payloadString));

    const pinResult = await this.ipfsService.pinJson(ipfsPayload, `review-${Date.now()}`);

    const review = await this.reviewRepo.create({
      ...input,
      contentHash,
      ipfsCid: pinResult.cid,
    });

    return { review };
  }
}
