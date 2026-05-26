/**
 * Prisma implementation of ISignalRepository.
 *
 * Per DDD rule 10: adapts the domain port to Prisma. Outbox events
 * are emitted in the same transaction as the Signal row mutation.
 */

import type { PrismaClient } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

import type {
  ISignalRepository,
  SignalListOptions,
  SettleSignalInput,
} from '../domain/ISignalRepository.js';
import type {
  EmitSignalInput,
  SignalRecord,
  SignalOutcomeValue,
  AssetClassValue,
  SignalDirectionValue,
} from '../domain/SignalEntity.js';

function decimalToString(d: Decimal | null): string | null {
  return d ? d.toString() : null;
}

function toRecord(row: {
  id: string;
  tenantId: string;
  kolId: string;
  assetClass: string;
  symbol: string;
  direction: string;
  entryPrice: Decimal;
  targetPrice: Decimal;
  stoplossPrice: Decimal | null;
  horizon: number;
  note: string | null;
  outcome: string;
  settledAt: Date | null;
  settlePrice: Decimal | null;
  periodHigh: Decimal | null;
  periodLow: Decimal | null;
  contentHash: string;
  ipfsCid: string | null;
  chainSignalId: number | null;
  chainTxHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SignalRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    kolId: row.kolId,
    assetClass: row.assetClass as AssetClassValue,
    symbol: row.symbol,
    direction: row.direction as SignalDirectionValue,
    entryPrice: row.entryPrice.toString(),
    targetPrice: row.targetPrice.toString(),
    stoplossPrice: decimalToString(row.stoplossPrice),
    horizon: row.horizon,
    note: row.note,
    outcome: row.outcome as SignalOutcomeValue,
    settledAt: row.settledAt,
    settlePrice: decimalToString(row.settlePrice),
    periodHigh: decimalToString(row.periodHigh),
    periodLow: decimalToString(row.periodLow),
    contentHash: row.contentHash,
    ipfsCid: row.ipfsCid,
    chainSignalId: row.chainSignalId,
    chainTxHash: row.chainTxHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaSignalRepository implements ISignalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: EmitSignalInput,
    contentHash: string,
    ipfsCid: string,
  ): Promise<SignalRecord> {
    const result = await this.prisma.$transaction(async (tx) => {
      const signal = await tx.signal.create({
        data: {
          tenantId: input.tenantId,
          kolId: input.kolId,
          assetClass: input.assetClass,
          symbol: input.symbol.trim().toUpperCase(),
          direction: input.direction,
          entryPrice: input.entryPrice,
          targetPrice: input.targetPrice,
          stoplossPrice: input.stoplossPrice ?? null,
          horizon: input.horizon,
          note: input.note?.trim() ?? null,
          outcome: 'ACTIVE',
          contentHash,
          ipfsCid,
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          aggregateType: 'signal',
          aggregateId: signal.id,
          eventType: 'signal.submitted',
          payload: {
            kolId: input.kolId,
            symbol: signal.symbol,
            direction: input.direction,
            contentHash,
          },
        },
      });

      return signal;
    });

    return toRecord(result);
  }

  async findById(id: string): Promise<SignalRecord | null> {
    const row = await this.prisma.signal.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async list(options: SignalListOptions): Promise<SignalRecord[]> {
    const rows = await this.prisma.signal.findMany({
      where: {
        tenantId: options.tenantId,
        ...(options.kolId ? { kolId: options.kolId } : {}),
        ...(options.symbol ? { symbol: options.symbol.toUpperCase() } : {}),
        ...(options.outcome ? { outcome: options.outcome } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
    return rows.map(toRecord);
  }

  async count(options: Omit<SignalListOptions, 'limit' | 'offset'>): Promise<number> {
    return this.prisma.signal.count({
      where: {
        tenantId: options.tenantId,
        ...(options.kolId ? { kolId: options.kolId } : {}),
        ...(options.symbol ? { symbol: options.symbol.toUpperCase() } : {}),
        ...(options.outcome ? { outcome: options.outcome } : {}),
      },
    });
  }

  async settle(input: SettleSignalInput): Promise<SignalRecord> {
    const row = await this.prisma.signal.update({
      where: { id: input.signalId },
      data: {
        outcome: input.outcome,
        settledAt: new Date(),
        settlePrice: input.settlePrice,
        periodHigh: input.periodHigh,
        periodLow: input.periodLow,
      },
    });
    return toRecord(row);
  }

  async findActiveExpired(now: Date): Promise<SignalRecord[]> {
    const rows = await this.prisma.signal.findMany({
      where: {
        outcome: 'ACTIVE',
      },
    });

    return rows
      .filter((row) => {
        const expiresAt = new Date(row.createdAt);
        expiresAt.setDate(expiresAt.getDate() + row.horizon);
        return expiresAt <= now;
      })
      .map(toRecord);
  }
}
