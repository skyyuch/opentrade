/**
 * Unit tests for `VerifyComplaintUseCase` — the admin verify / reject
 * flow per ADR-0029 D4 and rule 00 «reject != delete».
 *
 * Coverage targets:
 *   - VERIFY branch: 404 when missing, repo call shape (kind / now /
 *     adminUserId), returns the updated row.
 *   - REJECT branch: 404 when missing, adminNote length validation
 *     (< 5 / > 500), whitespace trimming before validation, repo
 *     call shape with trimmed text, returns the updated row.
 *   - Rule 00 invariants — the use case never asks the repo to mutate
 *     body / title / evidenceIpfsCid (we assert against the mutation
 *     contract by checking the call shape).
 *
 * The repo port is mocked with `vitest-mock-extended` per rule 60.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ErrorCode } from '../../../shared/errors/index.js';

import { VerifyComplaintUseCase } from './VerifyComplaintUseCase.js';

import type { ComplaintRecord } from '../domain/ComplaintEntity.js';
import type {
  IComplaintRepository,
  VerifyComplaintMutation,
} from '../domain/IComplaintRepository.js';

const COMPLAINT_ID = 'cmp_under_review_0001';
const ADMIN_ID = 'usr_admin_alpha';
const EVIDENCE_CID = 'bafybeievidenceforverifytestpipelineunitcoverage';

const fixtureRecord = (overrides: Partial<ComplaintRecord> = {}): ComplaintRecord => ({
  id: COMPLAINT_ID,
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_complainant_alpha',
  brokerId: 'brk_test_alpha',
  contentHash: '0x' + 'cc'.repeat(32),
  ipfsCid: 'bafkreigh2akiscaildc7e2eVerifyTestFakeCidUnitOnly',
  title: 'Statement discrepancy',
  body: 'My July statement shows two phantom trades I never placed.',
  sentiment: 'NEGATIVE',
  sourceLocale: 'zh-Hant',
  evidenceIpfsCid: EVIDENCE_CID,
  verifiedAt: null,
  verifiedByUserId: null,
  adminNote: null,
  createdAt: new Date('2026-05-20T00:00:00.000Z'),
  updatedAt: new Date('2026-05-20T00:00:00.000Z'),
  ...overrides,
});

describe('VerifyComplaintUseCase', () => {
  let repo: MockProxy<IComplaintRepository>;
  let useCase: VerifyComplaintUseCase;

  beforeEach(() => {
    repo = mock<IComplaintRepository>();
    useCase = new VerifyComplaintUseCase(repo);
  });

  describe('VERIFY branch', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(fixtureRecord());
      repo.applyVerification.mockImplementation((_id: string, mutation: VerifyComplaintMutation) =>
        Promise.resolve(
          fixtureRecord({
            verifiedAt: mutation.kind === 'verify' ? mutation.now : null,
            verifiedByUserId: mutation.kind === 'verify' ? mutation.adminUserId : null,
            adminNote: null,
          }),
        ),
      );
    });

    it('returns 404 AppError when the complaint does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(
        useCase.execute({ kind: 'verify', complaintId: COMPLAINT_ID, adminUserId: ADMIN_ID }),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        statusCode: 404,
      });
      expect(repo.applyVerification).not.toHaveBeenCalled();
    });

    it('asks the repo to apply a verify mutation with the admin id and a fresh timestamp', async () => {
      const before = Date.now();
      await useCase.execute({
        kind: 'verify',
        complaintId: COMPLAINT_ID,
        adminUserId: ADMIN_ID,
      });
      const after = Date.now();

      expect(repo.applyVerification).toHaveBeenCalledTimes(1);
      const [id, mutation] = repo.applyVerification.mock.calls[0]!;
      expect(id).toBe(COMPLAINT_ID);
      expect(mutation.kind).toBe('verify');
      if (mutation.kind === 'verify') {
        expect(mutation.adminUserId).toBe(ADMIN_ID);
        const ts = mutation.now.getTime();
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
      }
    });

    it('returns the verified complaint with verifiedAt + verifiedByUserId populated', async () => {
      const result = await useCase.execute({
        kind: 'verify',
        complaintId: COMPLAINT_ID,
        adminUserId: ADMIN_ID,
      });

      expect(result.complaint.verifiedAt).toBeInstanceOf(Date);
      expect(result.complaint.verifiedByUserId).toBe(ADMIN_ID);
      // Per ADR-0029 D4 a verify path clears any prior reject note.
      expect(result.complaint.adminNote).toBeNull();
    });

    it('is idempotent — verifying an already-verified row still succeeds without re-throwing', async () => {
      // Simulate the repo returning a row that's already verified.
      const alreadyVerified = fixtureRecord({
        verifiedAt: new Date('2026-04-01T00:00:00.000Z'),
        verifiedByUserId: 'usr_admin_beta',
      });
      repo.findById.mockResolvedValueOnce(alreadyVerified);

      const result = await useCase.execute({
        kind: 'verify',
        complaintId: COMPLAINT_ID,
        adminUserId: ADMIN_ID,
      });

      expect(result.complaint).toBeDefined();
      expect(repo.applyVerification).toHaveBeenCalledTimes(1);
    });
  });

  describe('REJECT branch', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(fixtureRecord());
      repo.applyVerification.mockImplementation((_id: string, mutation: VerifyComplaintMutation) =>
        Promise.resolve(
          fixtureRecord({
            adminNote: mutation.kind === 'reject' ? mutation.adminNote : null,
          }),
        ),
      );
    });

    it('returns 404 AppError when the complaint does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(
        useCase.execute({
          kind: 'reject',
          complaintId: COMPLAINT_ID,
          adminUserId: ADMIN_ID,
          adminNote: 'evidence does not show the trades claimed in the body',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        statusCode: 404,
      });
      expect(repo.applyVerification).not.toHaveBeenCalled();
    });

    it('rejects an adminNote shorter than 5 characters with VALIDATION_ERROR', async () => {
      await expect(
        useCase.execute({
          kind: 'reject',
          complaintId: COMPLAINT_ID,
          adminUserId: ADMIN_ID,
          adminNote: 'no',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 400,
      });
      expect(repo.applyVerification).not.toHaveBeenCalled();
    });

    it('rejects an adminNote whose trimmed form is empty', async () => {
      // The trim-then-validate ordering means "   " (all whitespace)
      // collapses to '' and is shorter than the 5-char floor.
      await expect(
        useCase.execute({
          kind: 'reject',
          complaintId: COMPLAINT_ID,
          adminUserId: ADMIN_ID,
          adminNote: '     ',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 400,
      });
    });

    it('rejects an adminNote longer than 500 characters with VALIDATION_ERROR', async () => {
      const tooLong = 'x'.repeat(501);
      await expect(
        useCase.execute({
          kind: 'reject',
          complaintId: COMPLAINT_ID,
          adminUserId: ADMIN_ID,
          adminNote: tooLong,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 400,
      });
      expect(repo.applyVerification).not.toHaveBeenCalled();
    });

    it('trims surrounding whitespace from the adminNote before persisting', async () => {
      await useCase.execute({
        kind: 'reject',
        complaintId: COMPLAINT_ID,
        adminUserId: ADMIN_ID,
        adminNote: '   evidence does not match the body   ',
      });

      const [, mutation] = repo.applyVerification.mock.calls[0]!;
      expect(mutation.kind).toBe('reject');
      if (mutation.kind === 'reject') {
        expect(mutation.adminNote).toBe('evidence does not match the body');
      }
    });

    it('asks the repo to apply a reject mutation carrying the adminUserId', async () => {
      await useCase.execute({
        kind: 'reject',
        complaintId: COMPLAINT_ID,
        adminUserId: ADMIN_ID,
        adminNote: 'evidence does not corroborate the claim',
      });

      expect(repo.applyVerification).toHaveBeenCalledTimes(1);
      const [id, mutation] = repo.applyVerification.mock.calls[0]!;
      expect(id).toBe(COMPLAINT_ID);
      expect(mutation.kind).toBe('reject');
      if (mutation.kind === 'reject') {
        expect(mutation.adminUserId).toBe(ADMIN_ID);
      }
    });

    it('returns the rejected complaint with adminNote populated and body untouched', async () => {
      const result = await useCase.execute({
        kind: 'reject',
        complaintId: COMPLAINT_ID,
        adminUserId: ADMIN_ID,
        adminNote: 'evidence does not corroborate the claim',
      });

      expect(result.complaint.adminNote).toBe('evidence does not corroborate the claim');
      // Per rule 00 «reject != delete»: the body / title / evidence
      // stay exactly as authored. The use case shape itself enforces
      // this — the discriminated mutation type has no body/title/
      // evidence fields on the reject variant — so we double-check
      // against the returned record (which the repo mock copies from
      // the base fixture).
      expect(result.complaint.body).toContain('phantom trades');
      expect(result.complaint.evidenceIpfsCid).toBe(EVIDENCE_CID);
    });
  });

  describe('rule 00 «reject != delete» — mutation contract', () => {
    it('reject path never carries body / title / evidenceIpfsCid into the repo mutation', async () => {
      // This guards against a future regression where someone adds
      // "while we're at it, scrub the body" to the reject path.
      repo.findById.mockResolvedValueOnce(fixtureRecord());
      repo.applyVerification.mockResolvedValueOnce(fixtureRecord());

      await useCase.execute({
        kind: 'reject',
        complaintId: COMPLAINT_ID,
        adminUserId: ADMIN_ID,
        adminNote: 'evidence does not match',
      });

      const [, mutation] = repo.applyVerification.mock.calls[0]!;
      const mutationKeys = Object.keys(mutation);
      expect(mutationKeys).not.toContain('body');
      expect(mutationKeys).not.toContain('title');
      expect(mutationKeys).not.toContain('evidenceIpfsCid');
      expect(mutationKeys).not.toContain('deletedAt');
    });
  });
});
