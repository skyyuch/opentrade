/**
 * Port interface for signal persistence.
 *
 * Per DDD rule 10: the domain layer defines this interface; the
 * infrastructure layer provides the Prisma implementation.
 */

import type { EmitSignalInput, SignalRecord, SignalOutcomeValue } from './SignalEntity.js';

export type SignalListOptions = {
  tenantId: string;
  kolId?: string;
  symbol?: string;
  outcome?: SignalOutcomeValue;
  limit?: number;
  offset?: number;
};

export type SettleSignalInput = {
  signalId: string;
  outcome: SignalOutcomeValue;
  settlePrice: string;
  periodHigh: string;
  periodLow: string;
};

export type ISignalRepository = {
  create(input: EmitSignalInput, contentHash: string, ipfsCid: string): Promise<SignalRecord>;

  findById(id: string): Promise<SignalRecord | null>;

  list(options: SignalListOptions): Promise<SignalRecord[]>;

  count(options: Omit<SignalListOptions, 'limit' | 'offset'>): Promise<number>;

  settle(input: SettleSignalInput): Promise<SignalRecord>;

  findActiveExpired(now: Date): Promise<SignalRecord[]>;
};
