/**
 * Unit tests for `ListComplaintsUseCase` — a thin pass-through over
 * `IComplaintRepository.list`. The use case exists to keep the
 * verification-status filter owned by the application layer; the
 * presentation layer (Hono route) is intentionally minimal.
 *
 * Coverage targets:
 *   - Every filter combination (status OPEN / VERIFIED / REJECTED /
 *     undefined; brokerId set / unset; cursor + limit forwarded) is
 *     passed through unchanged.
 *   - The repo result is returned without rewrapping (no mapping at
 *     this layer per rule 10 — the presentation layer owns the wire
 *     shape).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ListComplaintsUseCase } from './ListComplaintsUseCase.js';

import type { ComplaintRecord } from '../domain/ComplaintEntity.js';
import type { ComplaintListResult, IComplaintRepository } from '../domain/IComplaintRepository.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

const fixtureRecord = (overrides: Partial<ComplaintRecord> = {}): ComplaintRecord => ({
  id: 'cmp_test_0001',
  tenantId: TENANT_ID,
  userId: 'usr_alpha',
  brokerId: 'brk_alpha',
  contentHash: '0x' + 'dd'.repeat(32),
  ipfsCid: 'bafkreigh2akiscaildc7e2eListTestFakeCidUnitOnly',
  title: 'Test complaint',
  body: 'Body content that is long enough to be plausibly real.',
  sentiment: 'NEGATIVE',
  sourceLocale: 'zh-Hant',
  evidenceIpfsCid: 'bafybeievidenceforlisttestpipelineunitcoverage',
  verifiedAt: null,
  verifiedByUserId: null,
  adminNote: null,
  createdAt: new Date('2026-05-20T00:00:00.000Z'),
  updatedAt: new Date('2026-05-20T00:00:00.000Z'),
  ...overrides,
});

describe('ListComplaintsUseCase', () => {
  let repo: MockProxy<IComplaintRepository>;
  let useCase: ListComplaintsUseCase;

  beforeEach(() => {
    repo = mock<IComplaintRepository>();
    useCase = new ListComplaintsUseCase(repo);
  });

  it('passes through the full filter shape to the repository', async () => {
    const expected: ComplaintListResult = {
      items: [fixtureRecord()],
      nextCursor: null,
    };
    repo.list.mockResolvedValue(expected);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      brokerId: 'brk_alpha',
      status: 'OPEN',
      cursor: 'cmp_cursor_0007',
      limit: 25,
    });

    expect(repo.list).toHaveBeenCalledTimes(1);
    expect(repo.list).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      brokerId: 'brk_alpha',
      status: 'OPEN',
      cursor: 'cmp_cursor_0007',
      limit: 25,
    });
    expect(result).toBe(expected);
  });

  it('forwards undefined status / brokerId / cursor / limit without coercion', async () => {
    repo.list.mockResolvedValue({ items: [], nextCursor: null });

    await useCase.execute({ tenantId: TENANT_ID });

    expect(repo.list).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it.each(['OPEN', 'VERIFIED', 'REJECTED'] as const)(
    'forwards status=%s through to the repo unchanged',
    async (status) => {
      repo.list.mockResolvedValue({ items: [], nextCursor: null });

      await useCase.execute({ tenantId: TENANT_ID, status });

      expect(repo.list).toHaveBeenCalledWith({ tenantId: TENANT_ID, status });
    },
  );

  it('returns the repo result by reference (no mapping at this layer)', async () => {
    const items = [fixtureRecord({ id: 'cmp_x' }), fixtureRecord({ id: 'cmp_y' })];
    const expected: ComplaintListResult = {
      items,
      nextCursor: 'cmp_y',
    };
    repo.list.mockResolvedValue(expected);

    const result = await useCase.execute({ tenantId: TENANT_ID, brokerId: 'brk_alpha' });

    expect(result).toBe(expected);
    expect(result.items).toBe(items);
  });

  it('propagates a repo rejection without swallowing it', async () => {
    const repoError = new Error('database is unhappy');
    repo.list.mockRejectedValueOnce(repoError);

    await expect(useCase.execute({ tenantId: TENANT_ID })).rejects.toBe(repoError);
  });

  it('handles an empty result set gracefully', async () => {
    repo.list.mockResolvedValue({ items: [], nextCursor: null });

    const result = await useCase.execute({ tenantId: TENANT_ID, brokerId: 'brk_with_zero' });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
