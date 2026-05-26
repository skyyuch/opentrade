/**
 * Use case: list signals with filtering.
 *
 * Per ADR-0036 D4: signals are public once emitted (pure Live mode).
 */

import type { ISignalRepository, SignalListOptions } from '../domain/ISignalRepository.js';
import type { SignalRecord } from '../domain/SignalEntity.js';

export class ListSignalsUseCase {
  constructor(private readonly signalRepo: ISignalRepository) {}

  async execute(options: SignalListOptions): Promise<{ signals: SignalRecord[]; total: number }> {
    const countFilter: Omit<SignalListOptions, 'limit' | 'offset'> = {
      tenantId: options.tenantId,
    };
    if (options.kolId !== undefined) countFilter.kolId = options.kolId;
    if (options.symbol !== undefined) countFilter.symbol = options.symbol;
    if (options.outcome !== undefined) countFilter.outcome = options.outcome;

    const [signals, total] = await Promise.all([
      this.signalRepo.list(options),
      this.signalRepo.count(countFilter),
    ]);

    return { signals, total };
  }
}
