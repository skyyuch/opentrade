/**
 * Unit tests for `SubmitReviewUseCase` — the orchestration that wires
 * the M3 schema (sentiment + sourceLocale + rating-derivation) into the
 * M4 application layer per ADR-0028 D3 / D4.
 *
 * Coverage targets:
 *   1. The IPFS payload v2 schema (`version: 2`, `sentiment` carried
 *      alongside legacy `rating`, every field in the documented order)
 *      because that is the wire format that on-chain `contentHash`
 *      commits to — a regression in this object's shape is a silent
 *      consensus break.
 *   2. The reverse-mapping helper `deriveRatingFromSentiment` exercised
 *      via three execute() paths (POSITIVE / NEUTRAL / NEGATIVE), since
 *      the helper is intentionally not exported and the use case is the
 *      only legitimate caller.
 *   3. The explicit-rating override path (legacy `rating` carried by
 *      the caller bypasses the derivation) plus boundary validation
 *      for out-of-range values.
 *   4. Error propagation from both ports (IPFS and repository) so
 *      callers downstream see the `AppError` envelope unchanged.
 *
 * The use case has no DB / HTTP / chain dependencies — only two ports
 * (`IReviewRepository`, `IIpfsService`). Both are mocked with
 * `vitest-mock-extended` per rule 60 §Mock 規範 ("用
 * vitest-mock-extended 對 interface mock").
 */

import { keccak256, toBytes } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import { SubmitReviewUseCase } from './SubmitReviewUseCase.js';

import type { IContentModerator } from '../domain/IContentModerator.js';
import type { CreateReviewData, IReviewRepository } from '../domain/IReviewRepository.js';
import type { ReviewRecord, SubmitReviewInput } from '../domain/ReviewEntity.js';
import type { IIpfsService } from '../infrastructure/IIpfsService.js';

const FIXED_CID = 'bafkreigh2akiscaildc7e2eFakeCidForUnitTesting';

const baseInput = (overrides: Partial<SubmitReviewInput> = {}): SubmitReviewInput => ({
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_test_alpha',
  brokerId: 'brk_test_alpha',
  title: 'Solid execution and tight spreads',
  body: 'Has been my main HK broker for two years; statements arrive on time.',
  sentiment: 'POSITIVE',
  sourceLocale: 'zh-Hant',
  ...overrides,
});

const fixtureRecord = (overrides: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id: 'rev_test_0001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_test_alpha',
  brokerId: 'brk_test_alpha',
  contentHash: '0x' + 'aa'.repeat(32),
  ipfsCid: FIXED_CID,
  chainReviewId: null,
  txHash: null,
  title: 'Solid execution and tight spreads',
  body: 'Has been my main HK broker for two years; statements arrive on time.',
  rating: 5,
  status: 'PENDING',
  sentiment: 'POSITIVE',
  sourceLocale: 'zh-Hant',
  createdAt: new Date('2026-05-25T00:00:00.000Z'),
  updatedAt: new Date('2026-05-25T00:00:00.000Z'),
  ...overrides,
});

describe('SubmitReviewUseCase', () => {
  let repo: MockProxy<IReviewRepository>;
  let ipfs: MockProxy<IIpfsService>;
  let moderator: MockProxy<IContentModerator>;
  let useCase: SubmitReviewUseCase;

  beforeEach(() => {
    repo = mock<IReviewRepository>();
    ipfs = mock<IIpfsService>();
    moderator = mock<IContentModerator>();
    moderator.check.mockResolvedValue({ ok: true, violations: [], categories: [] });
    ipfs.pinJson.mockResolvedValue({ cid: FIXED_CID });
    repo.create.mockImplementation((data: CreateReviewData) =>
      Promise.resolve(
        fixtureRecord({
          rating: data.rating,
          sentiment: data.sentiment,
          contentHash: data.contentHash,
          ipfsCid: data.ipfsCid,
          title: data.title,
          body: data.body,
          sourceLocale: data.sourceLocale,
        }),
      ),
    );
    useCase = new SubmitReviewUseCase(repo, ipfs, moderator);
  });

  describe('ADR-0034 — content moderation gate', () => {
    it('checks the combined title + body against the tenant blocklist before anything else', async () => {
      const input = baseInput({
        tenantId: 'tnt_mod_check',
        title: 'My title',
        body: 'My body content here',
      });

      await useCase.execute(input);

      expect(moderator.check).toHaveBeenCalledTimes(1);
      expect(moderator.check).toHaveBeenCalledWith(
        'My title\nMy body content here',
        'tnt_mod_check',
      );
    });

    it('rejects prohibited content with CONTENT_REJECTED (422) and never pins or persists', async () => {
      moderator.check.mockResolvedValueOnce({
        ok: false,
        violations: [{ category: 'PROFANITY', term: 'fuck' }],
        categories: ['PROFANITY'],
      });

      await expect(useCase.execute(baseInput())).rejects.toMatchObject({
        code: ErrorCode.CONTENT_REJECTED,
        statusCode: 422,
        details: { reason: 'content_rejected', categories: ['PROFANITY'] },
      });

      expect(ipfs.pinJson).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('does not leak the matched blocklist terms in the error (only categories)', async () => {
      moderator.check.mockResolvedValue({
        ok: false,
        violations: [{ category: 'CONTACT', term: 't\\.me/\\S+' }],
        categories: ['CONTACT'],
      });

      const error = await useCase.execute(baseInput()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details).toMatchObject({ categories: ['CONTACT'] });
      expect((error as AppError).details).not.toHaveProperty('violations');
    });

    it('allows clean (including negative) content through to the pipeline', async () => {
      const result = await useCase.execute(
        baseInput({ sentiment: 'NEGATIVE', body: 'This broker is a scam, lost my money' }),
      );

      expect(result.review.id).toBe('rev_test_0001');
      expect(ipfs.pinJson).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('ADR-0028 D4 — rating derivation from sentiment', () => {
    it('POSITIVE sentiment without explicit rating derives rating = 5', async () => {
      const result = await useCase.execute(baseInput({ sentiment: 'POSITIVE' }));

      expect(result.review.rating).toBe(5);
      const ipfsPayload = ipfs.pinJson.mock.calls[0]?.[0] as { rating: number };
      expect(ipfsPayload.rating).toBe(5);
      const repoArg = repo.create.mock.calls[0]?.[0];
      expect(repoArg?.rating).toBe(5);
      expect(repoArg?.sentiment).toBe('POSITIVE');
    });

    it('NEUTRAL sentiment without explicit rating derives rating = 3', async () => {
      const result = await useCase.execute(baseInput({ sentiment: 'NEUTRAL' }));

      expect(result.review.rating).toBe(3);
      const ipfsPayload = ipfs.pinJson.mock.calls[0]?.[0] as { rating: number };
      expect(ipfsPayload.rating).toBe(3);
      expect(repo.create.mock.calls[0]?.[0].sentiment).toBe('NEUTRAL');
    });

    it('NEGATIVE sentiment without explicit rating derives rating = 1', async () => {
      const result = await useCase.execute(baseInput({ sentiment: 'NEGATIVE' }));

      expect(result.review.rating).toBe(1);
      const ipfsPayload = ipfs.pinJson.mock.calls[0]?.[0] as { rating: number };
      expect(ipfsPayload.rating).toBe(1);
      expect(repo.create.mock.calls[0]?.[0].sentiment).toBe('NEGATIVE');
    });

    it('honours an explicit rating from the caller instead of deriving', async () => {
      const result = await useCase.execute(baseInput({ sentiment: 'POSITIVE', rating: 4 }));

      expect(result.review.rating).toBe(4);
      const ipfsPayload = ipfs.pinJson.mock.calls[0]?.[0] as { rating: number };
      expect(ipfsPayload.rating).toBe(4);
    });
  });

  describe('rating range validation', () => {
    it('rejects rating = 0 with VALIDATION_ERROR', async () => {
      await expect(useCase.execute(baseInput({ rating: 0 as unknown as 1 }))).rejects.toMatchObject(
        {
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 400,
        },
      );
      expect(ipfs.pinJson).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects rating = 6 with VALIDATION_ERROR', async () => {
      await expect(useCase.execute(baseInput({ rating: 6 as unknown as 5 }))).rejects.toMatchObject(
        {
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 400,
        },
      );
      expect(ipfs.pinJson).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws an AppError (not a bare Error) for invalid rating', async () => {
      await expect(
        useCase.execute(baseInput({ rating: 99 as unknown as 5 })),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('ADR-0028 D3 — IPFS payload v2 schema', () => {
    it('pins a payload carrying version=2 + sentiment + rating + all author metadata', async () => {
      await useCase.execute(
        baseInput({
          tenantId: '00000000-0000-4000-8000-000000000099',
          userId: 'usr_v2_author',
          brokerId: 'brk_v2_target',
          title: 'v2 payload check',
          body: 'Body content long enough to be plausibly real.',
          sentiment: 'NEGATIVE',
          sourceLocale: 'en',
        }),
      );

      expect(ipfs.pinJson).toHaveBeenCalledTimes(1);
      const payload = ipfs.pinJson.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(payload).toMatchObject({
        version: 2,
        brokerId: 'brk_v2_target',
        title: 'v2 payload check',
        body: 'Body content long enough to be plausibly real.',
        sentiment: 'NEGATIVE',
        rating: 1,
        author: 'usr_v2_author',
      });
      expect(typeof payload['createdAt']).toBe('string');
      expect(payload['createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('omits sourceLocale and tenantId from the IPFS payload (they stay DB-only)', async () => {
      await useCase.execute(baseInput({ sentiment: 'POSITIVE', sourceLocale: 'en' }));

      const payload = ipfs.pinJson.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('sourceLocale');
      expect(payload).not.toHaveProperty('tenantId');
    });

    it('computes contentHash as keccak256(JSON.stringify(payload))', async () => {
      await useCase.execute(baseInput({ sentiment: 'POSITIVE' }));

      const payload = ipfs.pinJson.mock.calls[0]?.[0];
      const repoArg = repo.create.mock.calls[0]?.[0];
      const expectedHash = keccak256(toBytes(JSON.stringify(payload)));

      expect(repoArg?.contentHash).toBe(expectedHash);
      expect(repoArg?.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('names the Pinata upload as `review-<timestamp>`', async () => {
      await useCase.execute(baseInput());

      const nameArg = ipfs.pinJson.mock.calls[0]?.[1];
      expect(nameArg).toMatch(/^review-\d+$/);
    });
  });

  describe('repository hand-off', () => {
    it('forwards the resolved ipfsCid + contentHash into the repository create call', async () => {
      await useCase.execute(baseInput({ sentiment: 'POSITIVE' }));

      expect(repo.create).toHaveBeenCalledTimes(1);
      const repoArg = repo.create.mock.calls[0]?.[0];
      expect(repoArg?.ipfsCid).toBe(FIXED_CID);
      expect(repoArg?.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('returns the freshly persisted review record', async () => {
      const result = await useCase.execute(baseInput({ sentiment: 'POSITIVE' }));

      expect(result.review.id).toBe('rev_test_0001');
      expect(result.review.status).toBe('PENDING');
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
      // The IPFS pin already succeeded by this point — that side effect
      // is acceptable per the outbox pattern (ADR-0006 / -0019): the row
      // is never written, so the chain anchor never fires, so the
      // dangling pin is benign storage cost only.
      expect(ipfs.pinJson).toHaveBeenCalledTimes(1);
    });
  });
});
