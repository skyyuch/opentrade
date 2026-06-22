/**
 * Unit tests for `ApplyKolUseCase`.
 *
 * Coverage:
 *   - Successful application creates a new KOL profile
 *   - Duplicate application throws an error
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ApplyKolUseCase } from './ApplyKolUseCase.js';

import type { IKolRepository } from '../domain/IKolRepository.js';
import type { ApplyKolInput, KolRecord } from '../domain/KolEntity.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

const fixtureInput = (overrides: Partial<ApplyKolInput> = {}): ApplyKolInput => ({
  userId: 'usr_test_001',
  tenantId: TENANT_ID,
  displayName: 'Test KOL',
  ...overrides,
});

const fixtureRecord = (overrides: Partial<KolRecord> = {}): KolRecord => ({
  id: 'kol_test_0001',
  tenantId: TENANT_ID,
  userId: 'usr_test_001',
  slug: 'test-kol',
  displayName: 'Test KOL',
  bio: null,
  avatarUrl: null,
  status: 'PENDING',
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

describe('ApplyKolUseCase', () => {
  let repo: MockProxy<IKolRepository>;
  let useCase: ApplyKolUseCase;

  beforeEach(() => {
    repo = mock<IKolRepository>();
    useCase = new ApplyKolUseCase(repo);
  });

  it('creates a new KOL profile when user has none', async () => {
    const input = fixtureInput();
    const expected = fixtureRecord();

    repo.findByUserId.mockResolvedValue(null);
    repo.create.mockResolvedValue(expected);

    const result = await useCase.execute(input);

    expect(repo.findByUserId).toHaveBeenCalledWith(TENANT_ID, 'usr_test_001');
    expect(repo.create).toHaveBeenCalledWith(input);
    expect(result).toEqual(expected);
  });

  it('throws when user already has a KOL profile', async () => {
    const input = fixtureInput();
    repo.findByUserId.mockResolvedValue(fixtureRecord());

    await expect(useCase.execute(input)).rejects.toThrow('already has a KOL profile');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('passes optional bio and socialLinks to the repository', async () => {
    const input = fixtureInput({
      bio: 'I am a financial analyst',
      socialLinks: { youtube: 'https://youtube.com/@test', twitter: 'https://x.com/test' },
    });
    repo.findByUserId.mockResolvedValue(null);
    repo.create.mockResolvedValue(fixtureRecord({ bio: 'I am a financial analyst' }));

    await useCase.execute(input);

    expect(repo.create).toHaveBeenCalledWith(input);
  });

  it('passes self-declared category dimensions to the repository (ADR-0053)', async () => {
    const input = fixtureInput({ type: 'FINANCIAL_KOL', focus: 'CRYPTO' });
    repo.findByUserId.mockResolvedValue(null);
    repo.create.mockResolvedValue(fixtureRecord({ type: 'FINANCIAL_KOL', focus: 'CRYPTO' }));

    await useCase.execute(input);

    expect(repo.create).toHaveBeenCalledWith(input);
  });
});
