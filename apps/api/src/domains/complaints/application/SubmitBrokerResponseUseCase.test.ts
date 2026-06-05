/**
 * Unit tests for `SubmitBrokerResponseUseCase` — the orchestration that
 * wires ADR-0037 D1/D2/D3 into the application layer.
 *
 * Coverage targets:
 *   1. IPFS payload v2 shape — `kind: 'BROKER_RESPONSE'` discriminator +
 *      `respondsToContentHash` cryptographic link to the complaint.
 *   2. Pinata pin name format (`broker-response-<timestamp>`).
 *   3. One-response-per-complaint uniqueness guard (ADR-0037 D2).
 *   4. Complaint ownership validation (broker ID mismatch).
 *   5. Complaint-not-found error propagation.
 *   6. Repo hand-off — contentHash + ipfsCid flow correctly.
 *   7. keccak256 determinism — same input yields same hash.
 *
 * Both ports are mocked with `vitest-mock-extended` per rule 60.
 */

import { keccak256, toBytes } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import { SubmitBrokerResponseUseCase } from './SubmitBrokerResponseUseCase.js';

import type { IContentModerator } from '../../reviews/domain/IContentModerator.js';
import type { IIpfsService } from '../../reviews/infrastructure/IIpfsService.js';
import type {
  BrokerResponseRecord,
  SubmitBrokerResponseInput,
} from '../domain/BrokerResponseEntity.js';
import type { ComplaintRecord } from '../domain/ComplaintEntity.js';
import type { IBrokerResponseRepository } from '../domain/IBrokerResponseRepository.js';
import type { IComplaintRepository } from '../domain/IComplaintRepository.js';

const FIXED_CID = 'bafkreighbrokerresponsefakecidfortest';
const BROKER_ID = 'brk_test_broker';
const COMPLAINT_ID = 'cmp_test_0001';
const COMPLAINT_CONTENT_HASH = '0x' + 'ab'.repeat(32);

const baseInput = (
  overrides: Partial<SubmitBrokerResponseInput> = {},
): SubmitBrokerResponseInput => ({
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_merchant_alpha',
  complaintId: COMPLAINT_ID,
  body: 'We have reviewed this complaint and are taking corrective action.',
  sourceLocale: 'zh-Hant',
  ...overrides,
});

const fixtureComplaint = (overrides: Partial<ComplaintRecord> = {}): ComplaintRecord => ({
  id: COMPLAINT_ID,
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_complainant_alpha',
  brokerId: BROKER_ID,
  contentHash: COMPLAINT_CONTENT_HASH,
  ipfsCid: 'bafkreighcomplaintfakecid',
  title: 'Statement discrepancy',
  body: 'My statement shows phantom trades.',
  sentiment: 'NEGATIVE',
  sourceLocale: 'zh-Hant',
  evidenceIpfsCid: 'bafybeievidencefakecid',
  verifiedAt: null,
  verifiedByUserId: null,
  adminNote: null,
  createdAt: new Date('2026-05-25T10:00:00Z'),
  updatedAt: new Date('2026-05-25T10:00:00Z'),
  ...overrides,
});

const fixtureResponseRecord = (
  overrides: Partial<BrokerResponseRecord> = {},
): BrokerResponseRecord => ({
  id: 'rsp_test_0001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_merchant_alpha',
  brokerId: BROKER_ID,
  respondsToReviewId: COMPLAINT_ID,
  body: 'We have reviewed this complaint and are taking corrective action.',
  contentHash: '0x' + 'cc'.repeat(32),
  ipfsCid: FIXED_CID,
  sourceLocale: 'zh-Hant',
  createdAt: new Date('2026-05-26T10:00:00Z'),
  ...overrides,
});

describe('SubmitBrokerResponseUseCase', () => {
  let complaintRepo: MockProxy<IComplaintRepository>;
  let responseRepo: MockProxy<IBrokerResponseRepository>;
  let ipfsService: MockProxy<IIpfsService>;
  let moderator: MockProxy<IContentModerator>;
  let useCase: SubmitBrokerResponseUseCase;

  beforeEach(() => {
    complaintRepo = mock<IComplaintRepository>();
    responseRepo = mock<IBrokerResponseRepository>();
    ipfsService = mock<IIpfsService>();
    moderator = mock<IContentModerator>();
    moderator.check.mockResolvedValue({ ok: true, violations: [], categories: [] });
    useCase = new SubmitBrokerResponseUseCase(complaintRepo, responseRepo, ipfsService, moderator);
  });

  describe('ADR-0034 — content moderation gate', () => {
    it('checks the response body against the tenant blocklist after the ownership + uniqueness guards', async () => {
      complaintRepo.findById.mockResolvedValue(fixtureComplaint());
      responseRepo.existsForComplaint.mockResolvedValue(false);
      ipfsService.pinJson.mockResolvedValue({ cid: FIXED_CID });
      responseRepo.create.mockResolvedValue(fixtureResponseRecord());

      await useCase.execute(
        baseInput({ body: 'A measured, factual rebuttal of the claim.' }),
        BROKER_ID,
      );

      expect(moderator.check).toHaveBeenCalledTimes(1);
      expect(moderator.check).toHaveBeenCalledWith(
        'A measured, factual rebuttal of the claim.',
        '00000000-0000-4000-8000-000000000001',
      );
    });

    it('rejects prohibited content with CONTENT_REJECTED (422) and never pins or persists', async () => {
      complaintRepo.findById.mockResolvedValue(fixtureComplaint());
      responseRepo.existsForComplaint.mockResolvedValue(false);
      moderator.check.mockResolvedValueOnce({
        ok: false,
        violations: [{ category: 'ATTACK', term: 'idiot' }],
        categories: ['ATTACK'],
      });

      await expect(useCase.execute(baseInput(), BROKER_ID)).rejects.toMatchObject({
        code: ErrorCode.CONTENT_REJECTED,
        statusCode: 422,
        details: { reason: 'content_rejected', categories: ['ATTACK'] },
      });

      expect(ipfsService.pinJson).not.toHaveBeenCalled();
      expect(responseRepo.create).not.toHaveBeenCalled();
    });

    it('does not leak the matched blocklist terms in the error (only categories)', async () => {
      complaintRepo.findById.mockResolvedValue(fixtureComplaint());
      responseRepo.existsForComplaint.mockResolvedValue(false);
      moderator.check.mockResolvedValue({
        ok: false,
        violations: [{ category: 'CONTACT', term: 't\\.me/\\S+' }],
        categories: ['CONTACT'],
      });

      const error = await useCase.execute(baseInput(), BROKER_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details).toMatchObject({ categories: ['CONTACT'] });
      expect((error as AppError).details).not.toHaveProperty('violations');
    });
  });

  it('pins IPFS payload with kind BROKER_RESPONSE and linked content hash', async () => {
    complaintRepo.findById.mockResolvedValue(fixtureComplaint());
    responseRepo.existsForComplaint.mockResolvedValue(false);
    ipfsService.pinJson.mockResolvedValue({ cid: FIXED_CID });
    responseRepo.create.mockResolvedValue(fixtureResponseRecord());

    await useCase.execute(baseInput(), BROKER_ID);

    const pinCall = ipfsService.pinJson.mock.calls[0]!;
    const payload = pinCall[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      version: 2,
      kind: 'BROKER_RESPONSE',
      title: '',
      respondsToReviewId: COMPLAINT_ID,
      respondsToContentHash: COMPLAINT_CONTENT_HASH,
    });
    expect(typeof payload['body']).toBe('string');
  });

  it('uses broker-response-<timestamp> pin name format', async () => {
    complaintRepo.findById.mockResolvedValue(fixtureComplaint());
    responseRepo.existsForComplaint.mockResolvedValue(false);
    ipfsService.pinJson.mockResolvedValue({ cid: FIXED_CID });
    responseRepo.create.mockResolvedValue(fixtureResponseRecord());

    await useCase.execute(baseInput(), BROKER_ID);

    const pinName = ipfsService.pinJson.mock.calls[0]![1];
    expect(pinName).toMatch(/^broker-response-\d+$/);
  });

  it('computes deterministic keccak256 content hash', async () => {
    complaintRepo.findById.mockResolvedValue(fixtureComplaint());
    responseRepo.existsForComplaint.mockResolvedValue(false);
    ipfsService.pinJson.mockResolvedValue({ cid: FIXED_CID });
    responseRepo.create.mockResolvedValue(fixtureResponseRecord());

    await useCase.execute(baseInput(), BROKER_ID);

    const createCall = responseRepo.create.mock.calls[0]![0];
    const expectedPayload = JSON.stringify({
      version: 2,
      kind: 'BROKER_RESPONSE',
      title: '',
      body: baseInput().body,
      respondsToReviewId: COMPLAINT_ID,
      respondsToContentHash: COMPLAINT_CONTENT_HASH,
    });
    const expectedHash = keccak256(toBytes(expectedPayload));
    expect(createCall.contentHash).toBe(expectedHash);
  });

  it('passes ipfsCid from pin result to repo create', async () => {
    complaintRepo.findById.mockResolvedValue(fixtureComplaint());
    responseRepo.existsForComplaint.mockResolvedValue(false);
    ipfsService.pinJson.mockResolvedValue({ cid: FIXED_CID });
    responseRepo.create.mockResolvedValue(fixtureResponseRecord());

    await useCase.execute(baseInput(), BROKER_ID);

    const createCall = responseRepo.create.mock.calls[0]![0];
    expect(createCall.ipfsCid).toBe(FIXED_CID);
    expect(createCall.brokerId).toBe(BROKER_ID);
  });

  it('throws when complaint is not found', async () => {
    complaintRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(baseInput(), BROKER_ID)).rejects.toThrow(
      'Complaint cmp_test_0001 not found',
    );
  });

  it('throws when complaint does not belong to this broker', async () => {
    complaintRepo.findById.mockResolvedValue(fixtureComplaint({ brokerId: 'brk_other_broker' }));

    await expect(useCase.execute(baseInput(), BROKER_ID)).rejects.toThrow(
      'Complaint does not belong to this broker',
    );
  });

  it('throws 409 when a response already exists per ADR-0037 D2', async () => {
    complaintRepo.findById.mockResolvedValue(fixtureComplaint());
    responseRepo.existsForComplaint.mockResolvedValue(true);

    await expect(useCase.execute(baseInput(), BROKER_ID)).rejects.toThrow(
      'A response already exists for this complaint',
    );
  });

  it('propagates IPFS service errors', async () => {
    complaintRepo.findById.mockResolvedValue(fixtureComplaint());
    responseRepo.existsForComplaint.mockResolvedValue(false);
    ipfsService.pinJson.mockRejectedValue(new Error('Pinata unreachable'));

    await expect(useCase.execute(baseInput(), BROKER_ID)).rejects.toThrow('Pinata unreachable');
  });

  it('propagates repo create errors', async () => {
    complaintRepo.findById.mockResolvedValue(fixtureComplaint());
    responseRepo.existsForComplaint.mockResolvedValue(false);
    ipfsService.pinJson.mockResolvedValue({ cid: FIXED_CID });
    responseRepo.create.mockRejectedValue(new Error('DB write failed'));

    await expect(useCase.execute(baseInput(), BROKER_ID)).rejects.toThrow('DB write failed');
  });

  it('returns the response record from the repo', async () => {
    const record = fixtureResponseRecord();
    complaintRepo.findById.mockResolvedValue(fixtureComplaint());
    responseRepo.existsForComplaint.mockResolvedValue(false);
    ipfsService.pinJson.mockResolvedValue({ cid: FIXED_CID });
    responseRepo.create.mockResolvedValue(record);

    const result = await useCase.execute(baseInput(), BROKER_ID);
    expect(result.response).toBe(record);
  });
});
