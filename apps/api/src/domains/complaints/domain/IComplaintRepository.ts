/**
 * Port for complaint persistence per ADR-0029.
 *
 * Complaints share the `Review` Prisma model with a `kind = COMPLAINT`
 * discriminator. This port exposes only complaint-shaped operations;
 * the reviews domain owns the `kind = REVIEW` operations on the same
 * underlying table (rule 10 keeps the two domains decoupled at the
 * application layer even though they share a row type).
 */

import type { ComplaintRecord, SubmitComplaintInput } from './ComplaintEntity.js';

/**
 * Repository write contract for complaint creation. Tighter than
 * {@link SubmitComplaintInput} because by the time the use case calls
 * into the repo the IPFS pin + content hash have been computed.
 */
export type CreateComplaintData = SubmitComplaintInput & {
  contentHash: string;
  ipfsCid: string;
};

export type ComplaintListFilter = {
  tenantId: string;
  brokerId?: string | undefined;
  /**
   * Filter by derived verification status (OPEN / VERIFIED / REJECTED
   * per `ComplaintVerificationStatus`). Implemented at the repo layer
   * as a pair of boolean checks on `verifiedAt` and `adminNote` since
   * the verification status is not a column.
   */
  status?: 'OPEN' | 'VERIFIED' | 'REJECTED' | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

export type ComplaintListResult = {
  items: ComplaintRecord[];
  nextCursor: string | null;
};

/**
 * Verification mutation. Two mutually-exclusive operations live behind
 * this single type so the use case can emit one of two outbox events
 * (`complaint.verified` vs `complaint.rejected`) and the repo can
 * keep the DB write inside a single transaction.
 *
 * Per ADR-0029 D4 + rule 00 «reject != delete»:
 *   - `kind = 'verify'`: sets `verifiedAt = now()` + `verifiedByUserId`,
 *      clears `adminNote` so a previously-rejected complaint that an
 *      admin reconsiders can be re-verified without ghost text.
 *   - `kind = 'reject'`: sets `adminNote = reason`, leaves `verifiedAt`
 *      null. Does NOT set `deletedAt`. Does NOT change `body` /
 *      `title` / `evidenceIpfsCid` — the complaint stays publicly
 *      visible exactly as authored.
 */
export type VerifyComplaintMutation =
  | {
      kind: 'verify';
      adminUserId: string;
      now: Date;
    }
  | {
      kind: 'reject';
      adminUserId: string;
      adminNote: string;
      now: Date;
    };

export type IComplaintRepository = {
  create(data: CreateComplaintData): Promise<ComplaintRecord>;
  findById(id: string): Promise<ComplaintRecord | null>;
  list(filter: ComplaintListFilter): Promise<ComplaintListResult>;
  /**
   * Apply a verify-or-reject mutation, emit the corresponding outbox
   * event in the same transaction, and return the updated record.
   * Per ADR-0029 D7 the outbox event is ack-only in Phase 1 (worker
   * side); writing it here keeps the audit trail in lockstep with
   * the row mutation.
   */
  applyVerification(id: string, mutation: VerifyComplaintMutation): Promise<ComplaintRecord>;
};
