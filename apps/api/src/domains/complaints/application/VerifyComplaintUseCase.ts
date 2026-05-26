/**
 * Application layer: admin verify or reject a complaint.
 *
 * Single use case with two branches (verify / reject) rather than two
 * separate classes — the read-side flow is identical (load row,
 * validate kind=COMPLAINT, gate by current state) and 60 %+ of the
 * code would duplicate. The discriminated input keeps the call sites
 * type-safe.
 *
 * Phase 1 invariants per ADR-0029 D4 + rule 00 «reject != delete»:
 *   - VERIFY: sets verifiedAt = now() + verifiedByUserId, clears any
 *     prior adminNote so a re-verified complaint isn't displayed with
 *     stale text. Idempotent on already-verified rows (re-verifying
 *     is a no-op other than refreshing verifiedByUserId / verifiedAt).
 *   - REJECT: sets adminNote = reason. NEVER sets deletedAt, NEVER
 *     mutates body / title / evidenceIpfsCid / contentHash / ipfsCid.
 *     The complaint stays publicly visible exactly as authored — only
 *     the platform's "verified" stamp is withheld with a reason.
 *
 * Pure orchestration — no HTTP, no Prisma, no `process.*`.
 */

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { ComplaintRecord } from '../domain/ComplaintEntity.js';
import type { IComplaintRepository } from '../domain/IComplaintRepository.js';

export type VerifyComplaintInput =
  | {
      kind: 'verify';
      complaintId: string;
      adminUserId: string;
    }
  | {
      kind: 'reject';
      complaintId: string;
      adminUserId: string;
      adminNote: string;
    };

export type VerifyComplaintOutput = {
  complaint: ComplaintRecord;
};

export class VerifyComplaintUseCase {
  constructor(private readonly complaintRepo: IComplaintRepository) {}

  async execute(input: VerifyComplaintInput): Promise<VerifyComplaintOutput> {
    const existing = await this.complaintRepo.findById(input.complaintId);
    if (!existing) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Complaint not found', 404);
    }

    const now = new Date();

    if (input.kind === 'verify') {
      const complaint = await this.complaintRepo.applyVerification(input.complaintId, {
        kind: 'verify',
        adminUserId: input.adminUserId,
        now,
      });
      return { complaint };
    }

    // Reject branch: re-validate adminNote at the application layer
    // even though the zod schema upstream already enforces min/max —
    // belt + suspenders for any caller that bypasses the HTTP path
    // (a future internal job, a subagent test, etc.).
    const trimmed = input.adminNote.trim();
    if (trimmed.length < 5) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Reject reason must be at least 5 characters',
        400,
      );
    }
    if (trimmed.length > 500) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Reject reason must be 500 characters or less',
        400,
      );
    }

    const complaint = await this.complaintRepo.applyVerification(input.complaintId, {
      kind: 'reject',
      adminUserId: input.adminUserId,
      adminNote: trimmed,
      now,
    });
    return { complaint };
  }
}
