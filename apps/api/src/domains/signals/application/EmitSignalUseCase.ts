/**
 * Use case: emit a new signal (per ADR-0036 D3 — pure Live mode).
 *
 * Only APPROVED KOLs may emit signals. The content hash is computed
 * server-side from the signal payload to ensure integrity when the
 * outbox worker later submits it on-chain.
 *
 * IPFS pinning (added Session 3 — ADR-0038 Implementation Notes): the full
 * signal payload is pinned to IPFS BEFORE persistence, mirroring
 * SubmitReviewUseCase. The returned CID is stored on the Signal row so the
 * outbox worker (`signal.submitted` handler) has a non-empty `ipfsCid` to
 * pass to `KolSignalRegistry.emitSignal`. Previously `ipfsCid` was hardcoded
 * to '' which made the worker throw `has no ipfsCid` and never anchor the
 * signal on-chain — defeating the immutability promise. Pinning failure
 * (AppError 503) propagates and aborts creation, exactly like reviews: a
 * signal that cannot be anchored should not be silently created off-chain.
 *
 * Per ADR-0036 D8: after signal creation, notifications are fan-out
 * to all followers of this KOL (best-effort, non-blocking).
 */

import { createHash } from 'node:crypto';

import type { IInstrumentRepository } from '../../instruments/index.js';
import type { IKolRepository } from '../../kols/domain/IKolRepository.js';
import type { INotificationRepository } from '../../notifications/domain/INotificationRepository.js';
import type { IIpfsService } from '../../reviews/infrastructure/IIpfsService.js';
import type { ISignalRepository } from '../domain/ISignalRepository.js';
import type { EmitSignalInput, SignalRecord } from '../domain/SignalEntity.js';

export type SignalNotificationDeps = {
  notificationRepo: INotificationRepository;
  getFollowerUserIds: (kolId: string) => Promise<string[]>;
  getKolDisplayName: (kolId: string) => Promise<string>;
};

export class EmitSignalUseCase {
  constructor(
    private readonly signalRepo: ISignalRepository,
    private readonly kolRepo: IKolRepository,
    private readonly ipfsService: IIpfsService,
    private readonly instrumentRepo: IInstrumentRepository,
    private readonly notificationDeps?: SignalNotificationDeps,
  ) {}

  async execute(input: EmitSignalInput): Promise<SignalRecord> {
    const kol = await this.kolRepo.findById(input.kolId);
    if (!kol) {
      throw new Error('KOL not found');
    }
    if (kol.status !== 'APPROVED') {
      throw new Error('Only APPROVED KOLs can emit signals');
    }
    if (kol.tenantId !== input.tenantId) {
      throw new Error('Tenant mismatch');
    }

    // ADR-0038 D6: when a catalog instrument is selected, its canonical symbol
    // and category are the single source of truth — overriding any client-sent
    // symbol/assetClass. When no instrumentId is given, the KOL's free-text
    // symbol + assetClass are used verbatim (the catalog is an aid, not a gate).
    let resolvedInput = input;
    if (input.instrumentId) {
      const instrument = await this.instrumentRepo.findById(input.instrumentId);
      if (!instrument) {
        throw new Error('Instrument not found');
      }
      resolvedInput = { ...input, symbol: instrument.symbol, assetClass: instrument.category };
    }

    // The hashed object IS the pinned object so `contentHash` always matches
    // the IPFS content addressed by the returned CID.
    const ipfsPayload = {
      version: 1,
      kolId: resolvedInput.kolId,
      assetClass: resolvedInput.assetClass,
      symbol: resolvedInput.symbol.trim().toUpperCase(),
      instrumentId: resolvedInput.instrumentId ?? null,
      direction: resolvedInput.direction,
      entryPrice: resolvedInput.entryPrice,
      targetPrice: resolvedInput.targetPrice,
      stoplossPrice: resolvedInput.stoplossPrice ?? null,
      horizon: resolvedInput.horizon,
      note: resolvedInput.note?.trim() ?? null,
      createdAt: new Date().toISOString(),
    };

    const contentHash =
      '0x' + createHash('sha256').update(JSON.stringify(ipfsPayload)).digest('hex');

    const pinResult = await this.ipfsService.pinJson(ipfsPayload, `signal-${Date.now()}`);

    const signal = await this.signalRepo.create(resolvedInput, contentHash, pinResult.cid);

    if (this.notificationDeps) {
      // Best-effort: notification fan-out failure must not block signal creation
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      this.fanOutNotifications(signal, input.tenantId).catch(() => {});
    }

    return signal;
  }

  private async fanOutNotifications(signal: SignalRecord, tenantId: string): Promise<void> {
    if (!this.notificationDeps) return;

    const { notificationRepo, getFollowerUserIds, getKolDisplayName } = this.notificationDeps;

    const [followerIds, kolName] = await Promise.all([
      getFollowerUserIds(signal.kolId),
      getKolDisplayName(signal.kolId),
    ]);

    if (followerIds.length === 0) return;

    const inputs = followerIds.map((userId) => ({
      tenantId,
      userId,
      type: 'KOL_NEW_SIGNAL' as const,
      title: `${kolName} emitted a new ${signal.direction} signal`,
      body: `${signal.symbol} — ${signal.direction} (${signal.assetClass})`,
      metadata: {
        signalId: signal.id,
        kolId: signal.kolId,
        symbol: signal.symbol,
        direction: signal.direction,
      },
    }));

    await notificationRepo.createMany(inputs);
  }
}
