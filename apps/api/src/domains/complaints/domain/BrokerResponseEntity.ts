/**
 * Domain types for the broker public response bounded context.
 *
 * Per ADR-0037 D1: a broker response is stored as a `Review` row with
 * `kind = REVIEW` and `respondsToReviewId` pointing to the complaint's
 * `Review.id`. It reuses the same IPFS pin + content hash pipeline as
 * reviews and complaints, but does NOT go on-chain in Phase 2.5
 * (ADR-0037 D3). The outbox event `broker_response.submitted` is
 * ack-only until Phase 3 wires chain anchoring.
 *
 * The domain layer keeps zero infrastructure imports (rule 10).
 */

import type { ReviewSourceLocale } from '../../reviews/domain/ReviewEntity.js';

/**
 * Input accepted by `SubmitBrokerResponseUseCase`.
 *
 * Per ADR-0037 D2: one response per complaint per broker, immutable
 * after submission. The use case enforces the uniqueness guard via a
 * count check before insert.
 *
 * Per ADR-0037 D8: body min 10 chars, max 2000, no evidence upload
 * (text-only in Phase 2.5), no sentiment (broker responses are not
 * opinions about the broker — they ARE the broker).
 */
export type SubmitBrokerResponseInput = {
  tenantId: string;
  /** The merchant user submitting the response. */
  userId: string;
  /** The complaint being responded to. */
  complaintId: string;
  /** Body of the response. Min 10, max 2000 chars (zod enforced). */
  body: string;
  sourceLocale: ReviewSourceLocale;
};

/**
 * Read-side shape of a broker response row. Subset of the full
 * `Review` model — only the fields relevant to displaying a response
 * alongside the complaint it answers.
 */
export type BrokerResponseRecord = {
  id: string;
  tenantId: string;
  userId: string;
  brokerId: string;
  /** Always the complaint id this response answers. */
  respondsToReviewId: string;
  body: string;
  contentHash: string;
  ipfsCid: string | null;
  sourceLocale: ReviewSourceLocale | null;
  createdAt: Date;
};
