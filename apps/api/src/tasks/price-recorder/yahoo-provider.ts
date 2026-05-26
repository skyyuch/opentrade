/**
 * Yahoo Finance price provider.
 *
 * Fetches hourly OHLC data for traditional finance symbols (HK equities,
 * US equities, forex, futures). Uses the public Yahoo Finance v8 API.
 *
 * Per ADR-0036 D7: this is the primary source for non-crypto assets.
 */

import type { IPriceProvider, OhlcBar } from './types.js';

export class YahooFinanceProvider implements IPriceProvider {
  readonly source = 'YAHOO_FINANCE' as const;

  async fetchOhlc(symbols: string[]): Promise<OhlcBar[]> {
    const results: OhlcBar[] = [];
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;

    for (const symbol of symbols) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&period1=${oneHourAgo}&period2=${now}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'OpenTrade/1.0' },
        });

        if (!res.ok) continue;

        const data = (await res.json()) as {
          chart?: {
            result?: Array<{
              indicators?: {
                quote?: Array<{
                  open?: number[];
                  high?: number[];
                  low?: number[];
                  close?: number[];
                }>;
              };
              timestamp?: number[];
            }>;
          };
        };

        const result = data.chart?.result?.[0];
        const quote = result?.indicators?.quote?.[0];
        const timestamps = result?.timestamp;

        if (!quote || !timestamps || timestamps.length === 0) continue;

        const lastIdx = timestamps.length - 1;
        const open = quote.open?.[lastIdx];
        const high = quote.high?.[lastIdx];
        const low = quote.low?.[lastIdx];
        const close = quote.close?.[lastIdx];

        if (open == null || high == null || low == null || close == null) continue;

        results.push({
          symbol: symbol.toUpperCase(),
          open: open.toFixed(8),
          high: high.toFixed(8),
          low: low.toFixed(8),
          close: close.toFixed(8),
          timestamp: new Date(timestamps[lastIdx]! * 1000),
        });
      } catch {
        // Non-fatal: log and continue
      }
    }

    return results;
  }
}
