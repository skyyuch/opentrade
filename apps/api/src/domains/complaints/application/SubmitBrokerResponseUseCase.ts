/**
 * Application layer: submit a broker public response to a complaint.
 *
 * Flow per ADR-0037 D1 + D3:
 *   1. Validate the complaint exists and belongs to the broker.
 *   2. Check one-response-per-complaint uniqueness (ADR-0037 D2).
 *   3. Build IPFS payload JSON with `kind: 'BROKER_RESPONSE'`.
 *   4. Compute keccak256 content hash.
 *   5. Pin JSON to IPFS via Pinata.
 *   6. Persist a `Review` row with `kind = REVIEW` +
 *      `respondsToReviewId` pointing to the complaint, plus an
 *      outbox event, in a single transaction.
 *
 * Phase 2.5 stops at step 6: per ADR-0037 D3 the worker handler
 * for `broker_response.submitted` is ack-only; Phase 3+ may add
 * on-chain anchoring.
 *
 * ADR-0034 layer 1: the broker's response text passes through the same
 * content-neutral pre-publication gate as reviews + complaints BEFORE any
 * hashing / IPFS pin / DB write. A merchant rebutting a complaint is still
 * publishing immutable content, so profanity / personal attacks /
 * contact-baiting / illegal content are blocked the same way.
 *
 * Pure orchestration — no HTTP, no Prisma, no `process.*`.
 */

import { keccak256, toBytes } from 'viem';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { IContentModerator } from '../../reviews/domain/IContentModerator.js';
import type { IIpfsService } from '../../reviews/infrastructure/IIpfsService.js';
import type {
  BrokerResponseRecord,
  SubmitBrokerResponseInput,
} from '../domain/BrokerResponseEntity.js';
import type { IBrokerResponseRepository } from '../domain/IBrokerResponseRepository.js';
import type { IComplaintRepository } from '../domain/IComplaintRepository.js';

export type SubmitBrokerResponseOutput = {
  response: BrokerResponseRecord;
};

export class SubmitBrokerResponseUseCase {
  constructor(
    private readonly complaintRepo: IComplaintRepository,
    private readonly responseRepo: IBrokerResponseRepository,
    private readonly ipfsService: IIpfsService,
    private readonly moderator: IContentModerator,
  ) {}

  async execute(
    input: SubmitBrokerResponseInput,
    brokerId: string,
  ): Promise<SubmitBrokerResponseOutput> {
    const complaint = await this.complaintRepo.findById(input.complaintId);
    if (!complaint) {
      throw new Error(`Complaint ${input.complaintId} not found`);
    }

    if (complaint.brokerId !== brokerId) {
      throw new Error('Complaint does not belong to this broker');
    }

    const alreadyResponded = await this.responseRepo.existsForComplaint(
      input.complaintId,
      brokerId,
    );
    if (alreadyResponded) {
      throw new Error('A response already exists for this complaint');
    }

    // ADR-0034 layer 1: content-neutral pre-publication gate. MUST run
    // before any hashing / IPFS pin / DB write so prohibited content is
    // never anchored or persisted. The response is text-only (no title in
    // Phase 2.5), so only the body is moderated. We surface only the
    // matched categories (never the matched substrings — rule 50).
    const verdict = await this.moderator.check(input.body, input.tenantId);
    if (!verdict.ok) {
      throw new AppError(
        ErrorCode.CONTENT_REJECTED,
        'Broker response content rejected by moderation',
        422,
        { details: { reason: 'content_rejected', categories: verdict.categories } },
      );
    }

    const ipfsPayload = {
      version: 2,
      kind: 'BROKER_RESPONSE' as const,
      title: '',
      body: input.body,
      respondsToReviewId: input.complaintId,
      respondsToContentHash: complaint.contentHash,
    };

    const payloadString = JSON.stringify(ipfsPayload);
    const contentHash = keccak256(toBytes(payloadString));

    const pinResult = await this.ipfsService.pinJson(ipfsPayload, `broker-response-${Date.now()}`);

    const response = await this.responseRepo.create({
      ...input,
      brokerId,
      contentHash,
      ipfsCid: pinResult.cid,
    });

    return { response };
  }
}
