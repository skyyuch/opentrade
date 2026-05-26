/**
 * Yahoo Finance price provider.
 *
 * Fetches hourly OHLC data for traditional finance symbols (HK equities,
 * US equities, forex, futures, crypto). Uses the `yahoo-finance2` npm
 * package which handles cookie/crumb rotation automatically.
 *
 * Per ADR-0036 D7: primary source for all asset classes.
 * Architecture supports future swap to a paid provider (Twelve Data, etc.)
 * via the IPriceProvider interface without changing consumers.
 */

import YahooFinance from 'yahoo-finance2';

import type { IPriceProvider, OhlcBar } from './types.js';

const yf = new YahooFinance();

export class YahooFinanceProvider implements IPriceProvider {
  readonly source = 'YAHOO_FINANCE' as const;

  async fetchOhlc(symbols: string[]): Promise<OhlcBar[]> {
    const results: OhlcBar[] = [];
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    for (const symbol of symbols) {
      try {
        const chart = await yf.chart(symbol, {
          period1: twoHoursAgo,
          period2: now,
          interval: '1h',
        });

        const quotes = chart.quotes;
        if (quotes.length === 0) continue;

        const last = quotes[quotes.length - 1];
        if (!last) continue;

        const { open, high, low, close, date } = last;
        if (open == null || high == null || low == null || close == null) continue;

        results.push({
          symbol: symbol.toUpperCase(),
          open: open.toFixed(8),
          high: high.toFixed(8),
          low: low.toFixed(8),
          close: close.toFixed(8),
          timestamp: date,
        });
      } catch {
        // Non-fatal: individual symbol failure shouldn't stop others
      }
    }

    return results;
  }
}
