/**
 * Settle Worker — signal outcome resolution.
 *
 * Per ADR-0036 D4-D7: runs periodically to check expired signals and
 * settle them based on recorded OHLC price data from the Price Recorder.
 *
 * Settlement logic (per ADR-0036 D6):
 *   1. If `periodLow <= stoplossPrice` at any point → STOPPED (immediate loss)
 *   2. If `periodHigh >= targetPrice` (BUY) or `periodLow <= targetPrice` (SELL) → HIT_TARGET
 *   3. If horizon expired and close is in correct direction → HIT_DIRECTION
 *   4. If horizon expired and close is wrong direction → EXPIRED
 *   5. If no price data available → UNRESOLVED
 *
 * Designed to run every 5 minutes as a background task.
 */

import type { PrismaClient } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

import type {
  ISignalRepository,
  SettleSignalInput,
} from '../domains/signals/domain/ISignalRepository.js';
import type { SignalOutcomeValue } from '../domains/signals/domain/SignalEntity.js';

interface PriceWindow {
  periodHigh: string;
  periodLow: string;
  closePrice: string;
}

export interface SettleWorkerOptions {
  intervalMs: number;
}

export class SettleWorker {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly signalRepo: ISignalRepository,
    private readonly options: SettleWorkerOptions,
  ) {}

  async getPriceWindow(symbol: string, from: Date, to: Date): Promise<PriceWindow | null> {
    const records = await this.prisma.priceRecord.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        timestamp: { gte: from, lte: to },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (records.length === 0) return null;

    let periodHigh = records[0]!.high;
    let periodLow = records[0]!.low;
    const lastRecord = records[records.length - 1]!;

    for (const r of records) {
      if (this.decimalGt(r.high, periodHigh)) periodHigh = r.high;
      if (this.decimalLt(r.low, periodLow)) periodLow = r.low;
    }

    return {
      periodHigh: periodHigh.toString(),
      periodLow: periodLow.toString(),
      closePrice: lastRecord.close.toString(),
    };
  }

  determineOutcome(
    direction: string,
    entryPrice: string,
    targetPrice: string,
    stoplossPrice: string | null,
    priceWindow: PriceWindow,
  ): SignalOutcomeValue {
    const { periodHigh, periodLow, closePrice } = priceWindow;

    if (stoplossPrice) {
      if (direction === 'BUY' && parseFloat(periodLow) <= parseFloat(stoplossPrice)) {
        return 'STOPPED';
      }
      if (direction === 'SELL' && parseFloat(periodHigh) >= parseFloat(stoplossPrice)) {
        return 'STOPPED';
      }
    }

    if (direction === 'BUY' && parseFloat(periodHigh) >= parseFloat(targetPrice)) {
      return 'HIT_TARGET';
    }
    if (direction === 'SELL' && parseFloat(periodLow) <= parseFloat(targetPrice)) {
      return 'HIT_TARGET';
    }

    if (direction === 'BUY' && parseFloat(closePrice) > parseFloat(entryPrice)) {
      return 'HIT_DIRECTION';
    }
    if (direction === 'SELL' && parseFloat(closePrice) < parseFloat(entryPrice)) {
      return 'HIT_DIRECTION';
    }

    return 'EXPIRED';
  }

  async settleOnce(): Promise<number> {
    const now = new Date();
    const expired = await this.signalRepo.findActiveExpired(now);
    let settled = 0;

    for (const signal of expired) {
      const horizonEnd = new Date(signal.createdAt);
      horizonEnd.setDate(horizonEnd.getDate() + signal.horizon);

      const priceWindow = await this.getPriceWindow(signal.symbol, signal.createdAt, horizonEnd);

      if (!priceWindow) {
        const input: SettleSignalInput = {
          signalId: signal.id,
          outcome: 'UNRESOLVED',
          settlePrice: '0',
          periodHigh: '0',
          periodLow: '0',
        };
        await this.signalRepo.settle(input);
        settled++;
        continue;
      }

      const outcome = this.determineOutcome(
        signal.direction,
        signal.entryPrice,
        signal.targetPrice,
        signal.stoplossPrice,
        priceWindow,
      );

      const input: SettleSignalInput = {
        signalId: signal.id,
        outcome,
        settlePrice: priceWindow.closePrice,
        periodHigh: priceWindow.periodHigh,
        periodLow: priceWindow.periodLow,
      };

      await this.signalRepo.settle(input);
      settled++;
    }

    return settled;
  }

  start(): void {
    if (this.timer) return;

    const poll = async (): Promise<void> => {
      try {
        await this.settleOnce();
      } catch {
        // Will retry next interval
      }
    };

    void poll();
    this.timer = setInterval(() => void poll(), this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private decimalGt(a: Decimal, b: Decimal): boolean {
    return a.greaterThan(b);
  }

  private decimalLt(a: Decimal, b: Decimal): boolean {
    return a.lessThan(b);
  }
}
