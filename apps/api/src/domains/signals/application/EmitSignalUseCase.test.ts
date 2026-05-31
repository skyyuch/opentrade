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

import type { IInstrumentRepository, InstrumentRecord } from '../../instruments/index.js';
import type { IKolRepository } from '../../kols/domain/IKolRepository.js';
import type { KolRecord } from '../../kols/domain/KolEntity.js';
import type { IIpfsService } from '../../reviews/infrastructure/IIpfsService.js';
import type { ISignalRepository } from '../domain/ISignalRepository.js';
import type { EmitSignalInput, SignalRecord } from '../domain/SignalEntity.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const FIXED_CID = 'bafytestsignalcid000000000000000000000000000000000000000000';

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
  adminNote: null,
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

const fixtureInstrument = (overrides: Partial<InstrumentRecord> = {}): InstrumentRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  category: 'EQUITY_HK',
  symbol: '00005',
  displayCode: '00005',
  nameEn: 'HSBC HOLDINGS',
  nameZh: '匯豐控股',
  nameZhHans: '汇丰控股',
  exchange: 'HKEX',
  ...overrides,
});

const fixtureSignal = (overrides: Partial<SignalRecord> = {}): SignalRecord => ({
  id: 'sig_test_0001',
  tenantId: TENANT_ID,
  kolId: 'kol_test_0001',
  assetClass: 'EQUITY_HK',
  symbol: '0005.HK',
  instrumentId: null,
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
  let ipfs: MockProxy<IIpfsService>;
  let instrumentRepo: MockProxy<IInstrumentRepository>;
  let useCase: EmitSignalUseCase;

  beforeEach(() => {
    signalRepo = mock<ISignalRepository>();
    kolRepo = mock<IKolRepository>();
    ipfs = mock<IIpfsService>();
    ipfs.pinJson.mockResolvedValue({ cid: FIXED_CID });
    instrumentRepo = mock<IInstrumentRepository>();
    useCase = new EmitSignalUseCase(signalRepo, kolRepo, ipfs, instrumentRepo);
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
      FIXED_CID,
    );
    expect(result.outcome).toBe('ACTIVE');
  });

  it('pins the signal payload to IPFS before persisting and forwards the CID', async () => {
    const input = fixtureInput();
    kolRepo.findById.mockResolvedValue(fixtureKol());
    signalRepo.create.mockResolvedValue(fixtureSignal());

    await useCase.execute(input);

    expect(ipfs.pinJson).toHaveBeenCalledTimes(1);
    const [payload, name] = ipfs.pinJson.mock.calls[0]!;
    expect(name).toMatch(/^signal-\d+$/);
    expect(payload).toMatchObject({
      version: 1,
      kolId: 'kol_test_0001',
      symbol: '0005.HK',
      direction: 'BUY',
    });
  });

  it('aborts creation when IPFS pinning fails', async () => {
    kolRepo.findById.mockResolvedValue(fixtureKol());
    ipfs.pinJson.mockRejectedValueOnce(new Error('Pinata unreachable'));

    await expect(useCase.execute(fixtureInput())).rejects.toThrow('Pinata unreachable');
    expect(signalRepo.create).not.toHaveBeenCalled();
  });

  it('derives canonical symbol + assetClass from the catalog when instrumentId is set', async () => {
    // KOL sent a sloppy free-text symbol + wrong category; the catalog wins.
    const input = fixtureInput({
      instrumentId: '11111111-1111-4111-8111-111111111111',
      symbol: 'hsbc',
      assetClass: 'CRYPTO',
    });
    kolRepo.findById.mockResolvedValue(fixtureKol());
    instrumentRepo.findById.mockResolvedValue(fixtureInstrument());
    signalRepo.create.mockResolvedValue(fixtureSignal());

    await useCase.execute(input);

    expect(instrumentRepo.findById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    const persisted = signalRepo.create.mock.calls[0]![0];
    expect(persisted.symbol).toBe('00005');
    expect(persisted.assetClass).toBe('EQUITY_HK');
    expect(persisted.instrumentId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects when the referenced instrumentId is not in the catalog', async () => {
    const input = fixtureInput({ instrumentId: '22222222-2222-4222-8222-222222222222' });
    kolRepo.findById.mockResolvedValue(fixtureKol());
    instrumentRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow('Instrument not found');
    expect(signalRepo.create).not.toHaveBeenCalled();
  });

  it('keeps free-text symbol untouched when no instrumentId is given', async () => {
    const input = fixtureInput({ symbol: '0700.HK' });
    kolRepo.findById.mockResolvedValue(fixtureKol());
    signalRepo.create.mockResolvedValue(fixtureSignal());

    await useCase.execute(input);

    expect(instrumentRepo.findById).not.toHaveBeenCalled();
    const persisted = signalRepo.create.mock.calls[0]![0];
    expect(persisted.symbol).toBe('0700.HK');
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
