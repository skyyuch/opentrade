/**
 * Domain types for the complaints bounded context.
 *
 * Per ADR-0029 D1 + D2: complaints share the `Review` Prisma model with
 * a `kind` discriminator and four nullable complaint-only columns
 * (`evidenceIpfsCid`, `verifiedAt`, `verifiedByUserId`, `respondsToReviewId`).
 * They reuse the Review pipeline (IPFS pin + content hash) but stay
 * off-chain in Phase 1 — the on-chain anchor pipeline (per ADR-0019) is
 * gated behind the `kind = REVIEW` branch in the outbox worker (per
 * ADR-0029 D7); the `complaint.*` outbox events are ack-only until
 * Phase 3 wires the jury entry-point.
 *
 * The domain layer keeps zero infrastructure imports (rule 10): we
 * mirror the Prisma `ReviewKind` + `Sentiment` enums as string-literal
 * unions rather than re-export the runtime enum from `@prisma/client`.
 */

import type { ReviewSentiment, ReviewSourceLocale } from '../../reviews/domain/ReviewEntity.js';

/**
 * Per-complaint verification state, derived from `verifiedAt` +
 * `adminNote` per ADR-0029 D4 — there is no separate enum column.
 *
 *   - `OPEN`     — `verifiedAt = null` AND `adminNote = null`
 *                  (newly submitted, awaiting admin / jury review)
 *   - `VERIFIED` — `verifiedAt != null`
 *                  (admin or jury has substantiated the claim)
 *   - `REJECTED` — `verifiedAt = null` AND `adminNote != null`
 *                  (admin has rejected the verification claim;
 *                  per rule 00 the row stays visible — the complaint
 *                  itself is NOT deleted, only the platform's
 *                  "verified" stamp is withheld with a reason)
 */
export type ComplaintVerificationStatus = 'OPEN' | 'VERIFIED' | 'REJECTED';

export const COMPLAINT_VERIFICATION_STATUS_VALUES = [
  'OPEN',
  'VERIFIED',
  'REJECTED',
] as const satisfies readonly ComplaintVerificationStatus[];

/**
 * Input shape accepted by `SubmitComplaintUseCase`.
 *
 * `evidenceIpfsCid` is required at this layer (per ADR-0029 D3) — the
 * web form must upload the evidence file to Pinata before calling the
 * API and pass the CID along. Body length floor is enforced at the
 * presentation zod layer (mirroring the review submit floor).
 */
export type SubmitComplaintInput = {
  tenantId: string;
  userId: string;
  brokerId: string;
  title: string;
  body: string;
  /**
   * Per ADR-0029 D3: every complaint requires an evidence file. The
   * frontend uploads to Pinata directly (PNG / JPEG / PDF, max 5MB,
   * reusing the `/verify` flow's pipeline) and passes the resulting
   * CID through to this use case.
   */
  evidenceIpfsCid: string;
  /**
   * Sentiment defaults to `NEGATIVE` at the presentation layer for
   * complaints (the act of complaining IS a negative-toned signal),
   * but the domain layer accepts any of the three so an admin tool
   * could in theory log a `NEUTRAL` "informational" complaint. The
   * surfaced UI on `apps/web` only offers NEGATIVE.
   */
  sentiment: ReviewSentiment;
  sourceLocale: ReviewSourceLocale;
};

/**
 * Read-side representation of a single complaint row. Mirrors
 * `ReviewRecord` from the reviews domain plus the four complaint-only
 * fields. Kept as a separate type rather than extending `ReviewRecord`
 * because the discriminator (`kind: 'COMPLAINT'`) is part of the
 * complaint's identity at the domain layer, while a `ReviewRecord`
 * implicitly means `kind = REVIEW`.
 */
export type ComplaintRecord = {
  id: string;
  tenantId: string;
  userId: string;
  brokerId: string;
  contentHash: string;
  ipfsCid: string | null;
  title: string;
  body: string;
  sentiment: ReviewSentiment | null;
  sourceLocale: ReviewSourceLocale | null;
  /** Per ADR-0029 D3 — non-null for every complaint. */
  evidenceIpfsCid: string;
  /**
   * `null` while the complaint is OPEN or REJECTED; non-null once an
   * admin (Phase 1) or a jury (Phase 3, future) verifies the claim.
   */
  verifiedAt: Date | null;
  /**
   * Admin user id who set `verifiedAt`. Phase 3 will add a sibling
   * `verifiedByJuryProposalId` and make this column nullable when
   * jury verification is the source — the schema is already nullable
   * so this expansion lands without a breaking change.
   */
  verifiedByUserId: string | null;
  /**
   * Reject reason (when REJECTED) or future moderation note. Per
   * ADR-0029 D4 the reject path is non-destructive: the row stays
   * visible with a "not verified by platform" label, only the
   * verification claim is withheld.
   */
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};
