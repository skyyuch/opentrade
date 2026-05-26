/**
 * Price Recorder — hourly OHLC cron service.
 *
 * Per ADR-0036 D7: polls price providers at a configurable interval
 * (default 1 hour) and upserts OHLC data into the `price_records`
 * table. The Settle Worker (M9.2) queries this table to determine
 * signal outcomes.
 *
 * Designed to run as a standalone background task alongside the
 * outbox worker, started from the same process or as a separate
 * ECS task.
 */

import type { PrismaClient } from '@prisma/client';

import type { IPriceProvider, OhlcBar } from './types.js';

export interface PriceRecorderOptions {
  intervalMs: number;
  providers: IPriceProvider[];
}

export class PriceRecorder {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: PriceRecorderOptions,
  ) {}

  async recordOnce(symbols: string[]): Promise<number> {
    let totalRecorded = 0;

    for (const provider of this.options.providers) {
      let bars: OhlcBar[] = [];
      try {
        bars = await provider.fetchOhlc(symbols);
      } catch {
        continue;
      }

      for (const bar of bars) {
        try {
          await this.prisma.priceRecord.upsert({
            where: {
              symbol_source_timestamp: {
                symbol: bar.symbol,
                source: provider.source,
                timestamp: bar.timestamp,
              },
            },
            update: {
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
            },
            create: {
              symbol: bar.symbol,
              source: provider.source,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
              timestamp: bar.timestamp,
            },
          });
          totalRecorded++;
        } catch {
          // Non-fatal: individual bar failure shouldn't stop others
        }
      }
    }

    return totalRecorded;
  }

  async getActiveSymbols(): Promise<string[]> {
    const signals = await this.prisma.signal.findMany({
      where: { outcome: 'ACTIVE' },
      select: { symbol: true },
      distinct: ['symbol'],
    });
    return signals.map((s) => s.symbol);
  }

  start(): void {
    if (this.timer) return;

    const poll = async (): Promise<void> => {
      try {
        const symbols = await this.getActiveSymbols();
        if (symbols.length > 0) {
          await this.recordOnce(symbols);
        }
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
}
