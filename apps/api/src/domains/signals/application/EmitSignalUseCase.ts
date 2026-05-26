/**
 * Use case: emit a new signal (per ADR-0036 D3 — pure Live mode).
 *
 * Only APPROVED KOLs may emit signals. The content hash is computed
 * server-side from the signal payload to ensure integrity when the
 * outbox worker later submits it on-chain.
 */

import { createHash } from 'node:crypto';

import type { IKolRepository } from '../../kols/domain/IKolRepository.js';
import type { ISignalRepository } from '../domain/ISignalRepository.js';
import type { EmitSignalInput, SignalRecord } from '../domain/SignalEntity.js';

export class EmitSignalUseCase {
  constructor(
    private readonly signalRepo: ISignalRepository,
    private readonly kolRepo: IKolRepository,
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

    return this.signalRepo.create(input, contentHash, ipfsCid);
  }
}
