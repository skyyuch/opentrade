/**
 * Use case: emit a new signal (per ADR-0036 D3 — pure Live mode).
 *
 * Only APPROVED KOLs may emit signals. The content hash is computed
 * server-side from the signal payload to ensure integrity when the
 * outbox worker later submits it on-chain.
 *
 * Per ADR-0036 D8: after signal creation, notifications are fan-out
 * to all followers of this KOL (best-effort, non-blocking).
 */

import { createHash } from 'node:crypto';

import type { IKolRepository } from '../../kols/domain/IKolRepository.js';
import type { INotificationRepository } from '../../notifications/domain/INotificationRepository.js';
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

    const contentPayload = JSON.stringify({
      kolId: input.kolId,
      assetClass: input.assetClass,
      symbol: input.symbol.trim().toUpperCase(),
      direction: input.direction,
      entryPrice: input.entryPrice,
      targetPrice: input.targetPrice,
      stoplossPrice: input.stoplossPrice ?? null,
      horizon: input.horizon,
      note: input.note?.trim() ?? null,
      timestamp: Date.now(),
    });

    const contentHash = '0x' + createHash('sha256').update(contentPayload).digest('hex');
    const ipfsCid = '';

    const signal = await this.signalRepo.create(input, contentHash, ipfsCid);

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
