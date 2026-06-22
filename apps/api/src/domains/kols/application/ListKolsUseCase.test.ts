/**
 * Unit tests for `ListKolsUseCase`.
 *
 * Coverage:
 *   - Passes filter options through to the repository
 *   - Returns kols array with total count
 *   - Status filter narrows count query
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ListKolsUseCase } from './ListKolsUseCase.js';

import type { IKolRepository, KolListOptions } from '../domain/IKolRepository.js';
import type { KolRecord } from '../domain/KolEntity.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

const fixtureRecord = (overrides: Partial<KolRecord> = {}): KolRecord => ({
  id: 'kol_test_0001',
  tenantId: TENANT_ID,
  userId: 'usr_test_001',
  slug: 'test-kol',
  displayName: 'Test KOL',
  bio: null,
  avatarUrl: null,
  status: 'APPROVED',
  type: null,
  focus: null,
  socialLinks: null,
  credentials: null,
  iamSmartVerified: false,
  kolSbtTokenId: null,
  kolSbtMintTxHash: null,
  adminNote: null,
  createdAt: new Date('2026-05-26T00:00:00.000Z'),
  updatedAt: new Date('2026-05-26T00:00:00.000Z'),
  ...overrides,
});

describe('ListKolsUseCase', () => {
  let repo: MockProxy<IKolRepository>;
  let useCase: ListKolsUseCase;

  beforeEach(() => {
    repo = mock<IKolRepository>();
    useCase = new ListKolsUseCase(repo);
  });

  it('returns kols with total from repository', async () => {
    const options: KolListOptions = { tenantId: TENANT_ID, limit: 10, offset: 0 };
    const kols = [fixtureRecord(), fixtureRecord({ id: 'kol_test_0002', slug: 'test-kol-2' })];

    repo.list.mockResolvedValue(kols);
    repo.count.mockResolvedValue(2);

    const result = await useCase.execute(options);

    expect(result.kols).toEqual(kols);
    expect(result.total).toBe(2);
    expect(repo.list).toHaveBeenCalledWith(options);
    expect(repo.count).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('passes status filter to both list and count', async () => {
    const options: KolListOptions = {
      tenantId: TENANT_ID,
      status: 'PENDING',
      limit: 50,
      offset: 0,
    };

    repo.list.mockResolvedValue([]);
    repo.count.mockResolvedValue(0);

    await useCase.execute(options);

    expect(repo.list).toHaveBeenCalledWith(options);
    expect(repo.count).toHaveBeenCalledWith({ tenantId: TENANT_ID, status: 'PENDING' });
  });

  it('passes type and focus category filters to both list and count (ADR-0053)', async () => {
    const options: KolListOptions = {
      tenantId: TENANT_ID,
      status: 'APPROVED',
      type: 'FINANCIAL_KOL',
      focus: 'CRYPTO',
      limit: 50,
      offset: 0,
    };

    repo.list.mockResolvedValue([]);
    repo.count.mockResolvedValue(0);

    await useCase.execute(options);

    expect(repo.list).toHaveBeenCalledWith(options);
    expect(repo.count).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      status: 'APPROVED',
      type: 'FINANCIAL_KOL',
      focus: 'CRYPTO',
    });
  });

  it('returns empty array when no kols match', async () => {
    repo.list.mockResolvedValue([]);
    repo.count.mockResolvedValue(0);

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result.kols).toEqual([]);
    expect(result.total).toBe(0);
  });
});
