/**
 * Unit tests for `UpdateKolCategoryUseCase` (ADR-0053 §3).
 *
 * Coverage:
 *   - Sets both dimensions on an existing KOL
 *   - Forwards only the supplied keys (partial update / clear semantics)
 *   - Throws when the target KOL does not exist
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { UpdateKolCategoryUseCase } from './UpdateKolCategoryUseCase.js';

import type { IKolRepository } from '../domain/IKolRepository.js';
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

describe('UpdateKolCategoryUseCase', () => {
  let repo: MockProxy<IKolRepository>;
  let useCase: UpdateKolCategoryUseCase;

  beforeEach(() => {
    repo = mock<IKolRepository>();
    useCase = new UpdateKolCategoryUseCase(repo);
  });

  it('sets both dimensions on an existing KOL', async () => {
    repo.findById.mockResolvedValue(fixtureRecord());
    repo.updateCategory.mockResolvedValue(
      fixtureRecord({ type: 'FINANCIAL_KOL', focus: 'EQUITY' }),
    );

    const result = await useCase.execute({
      id: 'kol_test_0001',
      type: 'FINANCIAL_KOL',
      focus: 'EQUITY',
    });

    expect(repo.updateCategory).toHaveBeenCalledWith('kol_test_0001', {
      type: 'FINANCIAL_KOL',
      focus: 'EQUITY',
    });
    expect(result.type).toBe('FINANCIAL_KOL');
    expect(result.focus).toBe('EQUITY');
  });

  it('forwards only the supplied keys (partial / clear semantics)', async () => {
    repo.findById.mockResolvedValue(fixtureRecord({ type: 'FINANCIAL_KOL', focus: 'EQUITY' }));
    repo.updateCategory.mockResolvedValue(fixtureRecord({ type: 'FINANCIAL_KOL', focus: null }));

    await useCase.execute({ id: 'kol_test_0001', focus: null });

    expect(repo.updateCategory).toHaveBeenCalledWith('kol_test_0001', { focus: null });
  });

  it('throws when the target KOL does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'missing', type: 'INDICATOR_VENDOR' })).rejects.toThrow(
      'not found',
    );
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });
});
