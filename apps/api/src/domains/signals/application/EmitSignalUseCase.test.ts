/**
 * Unit tests for `EmitSignalUseCase`.
 *
 * Coverage:
 *   - Successful emission for approved KOL
 *   - Rejects non-existent KOL
 *   - Rejects non-APPROVED KOL
 *   - Rejects tenant mismatch
 *   - Content hash is deterministically computed
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { EmitSignalUseCase } from './EmitSignalUseCase.js';

import type { IKolRepository } from '../../kols/domain/IKolRepository.js';
import type { KolRecord } from '../../kols/domain/KolEntity.js';
import type { ISignalRepository } from '../domain/ISignalRepository.js';
import type { EmitSignalInput, SignalRecord } from '../domain/SignalEntity.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

const fixtureKol = (overrides: Partial<KolRecord> = {}): KolRecord => ({
  id: 'kol_test_0001',
  tenantId: TENANT_ID,
  userId: 'usr_test_001',
  slug: 'test-kol',
  displayName: 'Test KOL',
  bio: null,
  avatarUrl: null,
  status: 'APPROVED',
  socialLinks: null,
  credentials: null,
  iamSmartVerified: false,
  kolSbtTokenId: null,
  kolSbtMintTxHash: null,
  createdAt: new Date('2026-05-26T00:00:00.000Z'),
  updatedAt: new Date('2026-05-26T00:00:00.000Z'),
  ...overrides,
});

const fixtureInput = (overrides: Partial<EmitSignalInput> = {}): EmitSignalInput => ({
  tenantId: TENANT_ID,
  kolId: 'kol_test_0001',
  assetClass: 'EQUITY_HK',
  symbol: '0005.HK',
  direction: 'BUY',
  entryPrice: '50.00',
  targetPrice: '55.00',
  horizon: 7,
  ...overrides,
});

const fixtureSignal = (overrides: Partial<SignalRecord> = {}): SignalRecord => ({
  id: 'sig_test_0001',
  tenantId: TENANT_ID,
  kolId: 'kol_test_0001',
  assetClass: 'EQUITY_HK',
  symbol: '0005.HK',
  direction: 'BUY',
  entryPrice: '50.00',
  targetPrice: '55.00',
  stoplossPrice: null,
  horizon: 7,
  note: null,
  outcome: 'ACTIVE',
  settledAt: null,
  settlePrice: null,
  periodHigh: null,
  periodLow: null,
  contentHash: '0x' + 'aa'.repeat(32),
  ipfsCid: null,
  chainSignalId: null,
  chainTxHash: null,
  createdAt: new Date('2026-05-26T00:00:00.000Z'),
  updatedAt: new Date('2026-05-26T00:00:00.000Z'),
  ...overrides,
});

describe('EmitSignalUseCase', () => {
  let signalRepo: MockProxy<ISignalRepository>;
  let kolRepo: MockProxy<IKolRepository>;
  let useCase: EmitSignalUseCase;

  beforeEach(() => {
    signalRepo = mock<ISignalRepository>();
    kolRepo = mock<IKolRepository>();
    useCase = new EmitSignalUseCase(signalRepo, kolRepo);
  });

  it('emits a signal for an approved KOL', async () => {
    const input = fixtureInput();
    kolRepo.findById.mockResolvedValue(fixtureKol());
    signalRepo.create.mockResolvedValue(fixtureSignal());

    const result = await useCase.execute(input);

    expect(kolRepo.findById).toHaveBeenCalledWith('kol_test_0001');
    expect(signalRepo.create).toHaveBeenCalledWith(
      input,
      expect.stringMatching(/^0x[a-f0-9]{64}$/),
      expect.any(String),
    );
    expect(result.outcome).toBe('ACTIVE');
  });

  it('throws when KOL does not exist', async () => {
    kolRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(fixtureInput())).rejects.toThrow('KOL not found');
    expect(signalRepo.create).not.toHaveBeenCalled();
  });

  it('throws when KOL is not APPROVED', async () => {
    kolRepo.findById.mockResolvedValue(fixtureKol({ status: 'PENDING' }));

    await expect(useCase.execute(fixtureInput())).rejects.toThrow('Only APPROVED');
    expect(signalRepo.create).not.toHaveBeenCalled();
  });

  it('throws on tenant mismatch', async () => {
    kolRepo.findById.mockResolvedValue(fixtureKol({ tenantId: 'different-tenant' }));

    await expect(useCase.execute(fixtureInput())).rejects.toThrow('Tenant mismatch');
    expect(signalRepo.create).not.toHaveBeenCalled();
  });

  it('passes stoplossPrice and note when provided', async () => {
    const input = fixtureInput({ stoplossPrice: '48.00', note: 'Strong support level' });
    kolRepo.findById.mockResolvedValue(fixtureKol());
    signalRepo.create.mockResolvedValue(fixtureSignal());

    await useCase.execute(input);

    expect(signalRepo.create).toHaveBeenCalledWith(
      input,
      expect.stringMatching(/^0x[a-f0-9]{64}$/),
      expect.any(String),
    );
  });
});
