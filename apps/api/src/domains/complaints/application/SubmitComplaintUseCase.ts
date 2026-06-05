/**
 * Application layer: submit a new complaint.
 *
 * Flow per ADR-0029 D1 + D3:
 *   1. Build the IPFS payload JSON from user input. Per ADR-0028 D3 the
 *      payload schema is v2; the `kind: 'COMPLAINT'` discriminator and
 *      the `evidenceIpfsCid` field are the v1↔v2-for-complaint markers
 *      (v1 had neither).
 *   2. Compute keccak256 content hash. The same hash shape as a review
 *      so a future Phase 3 jury anchor can reuse the on-chain pipeline
 *      from ADR-0019 without a migration.
 *   3. Pin JSON to IPFS via Pinata.
 *   4. Persist a `Review` row with `kind = COMPLAINT` plus an outbox
 *      event in a single transaction (transaction managed inside the
 *      repository per ADR-0006 outbox pattern).
 *
 * Phase 1 stops at step 4: per ADR-0029 D7 the worker handler for
 * `complaint.submitted` is ack-only; Phase 3 wires the jury entry-point.
 *
 * ADR-0034 layer 1: the same content-neutral pre-publication gate that
 * guards reviews runs here BEFORE any hashing / IPFS pin / DB write, so
 * prohibited content is never anchored or persisted. The complaint body
 * is the user-authored text; the (optional) title is gated alongside it.
 * Negative complaint language must pass — the gate blocks profanity /
 * personal attacks / contact-baiting / illegal content, not grievances.
 *
 * Pure orchestration — no HTTP, no Prisma, no `process.*`.
 */

import { keccak256, toBytes } from 'viem';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { IContentModerator } from '../../reviews/domain/IContentModerator.js';
import type { IIpfsService } from '../../reviews/infrastructure/IIpfsService.js';
import type { ComplaintRecord, SubmitComplaintInput } from '../domain/ComplaintEntity.js';
import type { IComplaintRepository } from '../domain/IComplaintRepository.js';

export type SubmitComplaintOutput = {
  complaint: ComplaintRecord;
};

export class SubmitComplaintUseCase {
  constructor(
    private readonly complaintRepo: IComplaintRepository,
    private readonly ipfsService: IIpfsService,
    private readonly moderator: IContentModerator,
  ) {}

  async execute(input: SubmitComplaintInput): Promise<SubmitComplaintOutput> {
    // ADR-0034 layer 1: content-neutral pre-publication gate. MUST run
    // before any hashing / IPFS pin / DB write so prohibited content is
    // never anchored or persisted. We surface only the matched categories
    // (never the matched substrings — they can contain PII, rule 50).
    const verdict = await this.moderator.check(`${input.title}\n${input.body}`, input.tenantId);
    if (!verdict.ok) {
      throw new AppError(
        ErrorCode.CONTENT_REJECTED,
        'Complaint content rejected by moderation',
        422,
        { details: { reason: 'content_rejected', categories: verdict.categories } },
      );
    }

    // Per ADR-0028 D3 — IPFS payload schema v2. The complaint variant
    // adds two fields v1 never had: `kind: 'COMPLAINT'` (the
    // discriminator that lets a future indexer route to a complaint
    // pipeline) and `evidenceIpfsCid` (the user-supplied evidence
    // pointer). The `version: 2` literal is the explicit-for-auditors
    // marker; the `kind` key is the parser-side discriminator.
    const ipfsPayload = {
      version: 2,
      kind: 'COMPLAINT' as const,
      brokerId: input.brokerId,
      title: input.title,
      body: input.body,
      sentiment: input.sentiment,
      evidenceIpfsCid: input.evidenceIpfsCid,
      author: input.userId,
      createdAt: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(ipfsPayload);
    const contentHash = keccak256(toBytes(payloadString));

    const pinResult = await this.ipfsService.pinJson(ipfsPayload, `complaint-${Date.now()}`);

    const complaint = await this.complaintRepo.create({
      ...input,
      contentHash,
      ipfsCid: pinResult.cid,
    });

    return { complaint };
  }
}
