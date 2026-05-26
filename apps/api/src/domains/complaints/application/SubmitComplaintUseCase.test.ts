/**
 * Unit tests for `SubmitComplaintUseCase` — the orchestration that
 * wires the M7.1 schema (kind discriminator + evidence column) into
 * the M7.3 application layer per ADR-0029 D1 / D3.
 *
 * Coverage targets:
 *   1. The IPFS payload v2 schema for complaints — the `kind:
 *      'COMPLAINT'` discriminator and the `evidenceIpfsCid` field are
 *      the v1↔v2-for-complaint markers. A regression in this shape
 *      breaks any future indexer that routes by `kind`.
 *   2. The Pinata name format (`complaint-<timestamp>`) so the file
 *      browser stays grouped by kind.
 *   3. Repo hand-off — `contentHash` + `ipfsCid` flow from the IPFS
 *      call result into the repo write.
 *   4. Error propagation from both ports so the AppError envelope
 *      surfaces unchanged.
 *   5. The M7.5a contract that `title = ''` is a valid happy-path
 *      input (the web form makes it optional and the presentation
 *      layer coerces undefined → empty string).
 *
 * Both ports are mocked with `vitest-mock-extended` per rule 60.
 */

import { keccak256, toBytes } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import { SubmitComplaintUseCase } from './SubmitComplaintUseCase.js';

import type { IIpfsService } from '../../reviews/infrastructure/IIpfsService.js';
import type { ComplaintRecord, SubmitComplaintInput } from '../domain/ComplaintEntity.js';
import type { CreateComplaintData, IComplaintRepository } from '../domain/IComplaintRepository.js';

const FIXED_CID = 'bafkreigh2akiscaildc7e2eComplaintFakeCidForUnitTest';
const EVIDENCE_CID = 'bafybeievidencefakecidforcomplaintunittestpipelinedemo';

const baseInput = (overrides: Partial<SubmitComplaintInput> = {}): SubmitComplaintInput => ({
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_complainant_alpha',
  brokerId: 'brk_test_alpha',
  title: 'Statement discrepancy',
  body: 'My July statement shows two phantom trades I never placed; broker has not responded.',
  evidenceIpfsCid: EVIDENCE_CID,
  sentiment: 'NEGATIVE',
  sourceLocale: 'zh-Hant',
  ...overrides,
});

const fixtureRecord = (overrides: Partial<ComplaintRecord> = {}): ComplaintRecord => ({
  id: 'cmp_test_0001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_complainant_alpha',
  brokerId: 'brk_test_alpha',
  contentHash: '0x' + 'bb'.repeat(32),
  ipfsCid: FIXED_CID,
  title: 'Statement discrepancy',
  body: 'My July statement shows two phantom trades I never placed; broker has not responded.',
  sentiment: 'NEGATIVE',
  sourceLocale: 'zh-Hant',
  evidenceIpfsCid: EVIDENCE_CID,
  verifiedAt: null,
  verifiedByUserId: null,
  adminNote: null,
  createdAt: new Date('2026-05-25T00:00:00.000Z'),
  updatedAt: new Date('2026-05-25T00:00:00.000Z'),
  ...overrides,
});

describe('SubmitComplaintUseCase', () => {
  let repo: MockProxy<IComplaintRepository>;
  let ipfs: MockProxy<IIpfsService>;
  let useCase: SubmitComplaintUseCase;

  beforeEach(() => {
    repo = mock<IComplaintRepository>();
    ipfs = mock<IIpfsService>();
    ipfs.pinJson.mockResolvedValue({ cid: FIXED_CID });
    repo.create.mockImplementation((data: CreateComplaintData) =>
      Promise.resolve(
        fixtureRecord({
          contentHash: data.contentHash,
          ipfsCid: data.ipfsCid,
          title: data.title,
          body: data.body,
          sentiment: data.sentiment,
          sourceLocale: data.sourceLocale,
          evidenceIpfsCid: data.evidenceIpfsCid,
        }),
      ),
    );
    useCase = new SubmitComplaintUseCase(repo, ipfs);
  });

  describe('ADR-0029 D1 — IPFS payload v2-for-complaint schema', () => {
    it('pins a payload carrying version=2 + kind=COMPLAINT + evidenceIpfsCid + sentiment', async () => {
      await useCase.execute(
        baseInput({
          tenantId: '00000000-0000-4000-8000-000000000099',
          userId: 'usr_v2_complainant',
          brokerId: 'brk_v2_target',
          title: 'v2 complaint payload check',
          body: 'Body content long enough to be plausibly real for the v2 shape.',
          sentiment: 'NEGATIVE',
          sourceLocale: 'en',
          evidenceIpfsCid: EVIDENCE_CID,
        }),
      );

      expect(ipfs.pinJson).toHaveBeenCalledTimes(1);
      const payload = ipfs.pinJson.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(payload).toMatchObject({
        version: 2,
        kind: 'COMPLAINT',
        brokerId: 'brk_v2_target',
        title: 'v2 complaint payload check',
        body: 'Body content long enough to be plausibly real for the v2 shape.',
        sentiment: 'NEGATIVE',
        evidenceIpfsCid: EVIDENCE_CID,
        author: 'usr_v2_complainant',
      });
      expect(typeof payload['createdAt']).toBe('string');
      expect(payload['createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('omits sourceLocale and tenantId from the IPFS payload (they stay DB-only)', async () => {
      await useCase.execute(baseInput({ sourceLocale: 'en' }));

      const payload = ipfs.pinJson.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('sourceLocale');
      expect(payload).not.toHaveProperty('tenantId');
    });

    it('accepts the M7.5a empty-title contract without throwing', async () => {
      // Per M7.5a the web form makes title optional; the presentation
      // layer coerces undefined → '' before the use case sees it, so
      // the empty string is a valid happy-path input here.
      const result = await useCase.execute(baseInput({ title: '' }));

      expect(result.complaint.title).toBe('');
      const payload = ipfs.pinJson.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(payload['title']).toBe('');
    });

    it('carries the sentiment through unchanged when an admin tool overrides default NEGATIVE', async () => {
      await useCase.execute(baseInput({ sentiment: 'NEUTRAL' }));

      const payload = ipfs.pinJson.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(payload['sentiment']).toBe('NEUTRAL');
      expect(repo.create.mock.calls[0]?.[0].sentiment).toBe('NEUTRAL');
    });

    it('computes contentHash as keccak256(JSON.stringify(payload))', async () => {
      await useCase.execute(baseInput());

      const payload = ipfs.pinJson.mock.calls[0]?.[0];
      const repoArg = repo.create.mock.calls[0]?.[0];
      const expectedHash = keccak256(toBytes(JSON.stringify(payload)));

      expect(repoArg?.contentHash).toBe(expectedHash);
      expect(repoArg?.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('names the Pinata upload as `complaint-<timestamp>`', async () => {
      await useCase.execute(baseInput());

      const nameArg = ipfs.pinJson.mock.calls[0]?.[1];
      expect(nameArg).toMatch(/^complaint-\d+$/);
    });
  });

  describe('repository hand-off', () => {
    it('forwards the resolved ipfsCid + contentHash into the repository create call', async () => {
      await useCase.execute(baseInput());

      expect(repo.create).toHaveBeenCalledTimes(1);
      const repoArg = repo.create.mock.calls[0]?.[0];
      expect(repoArg?.ipfsCid).toBe(FIXED_CID);
      expect(repoArg?.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('passes the evidenceIpfsCid straight through to the repo (no mutation)', async () => {
      await useCase.execute(baseInput({ evidenceIpfsCid: EVIDENCE_CID }));

      const repoArg = repo.create.mock.calls[0]?.[0];
      expect(repoArg?.evidenceIpfsCid).toBe(EVIDENCE_CID);
    });

    it('returns the freshly persisted complaint record with OPEN-state defaults', async () => {
      const result = await useCase.execute(baseInput());

      expect(result.complaint.id).toBe('cmp_test_0001');
      // Per ADR-0029 D4 every new complaint lands in OPEN state —
      // verifiedAt + verifiedByUserId + adminNote all null.
      expect(result.complaint.verifiedAt).toBeNull();
      expect(result.complaint.verifiedByUserId).toBeNull();
      expect(result.complaint.adminNote).toBeNull();
    });
  });

  describe('error propagation', () => {
    it('does not call the repository when IPFS pinning fails', async () => {
      const ipfsError = new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Pinata is angry', 503);
      ipfs.pinJson.mockRejectedValueOnce(ipfsError);

      await expect(useCase.execute(baseInput())).rejects.toBe(ipfsError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('propagates a repository error without swallowing it', async () => {
      const repoError = new AppError(ErrorCode.INTERNAL_ERROR, 'DB write failed', 500);
      repo.create.mockRejectedValueOnce(repoError);

      await expect(useCase.execute(baseInput())).rejects.toBe(repoError);
      // The IPFS pin already succeeded by this point — that side
      // effect is acceptable per the outbox pattern (ADR-0006 /
      // -0019 / -0029 D7): the row is never written, so the
      // complaint.submitted outbox event never fires, so the
      // dangling pin is benign storage cost only.
      expect(ipfs.pinJson).toHaveBeenCalledTimes(1);
    });
  });
});
