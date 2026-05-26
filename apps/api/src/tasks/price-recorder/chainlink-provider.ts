/**
 * Chainlink price provider.
 *
 * Fetches the latest price for crypto pairs from Chainlink price feed
 * contracts on Base L2. Since Chainlink feeds are "latest price" not
 * OHLC, we record the latest price as both open/high/low/close for
 * hourly snapshots — the Settle Worker compares across multiple
 * snapshots to derive period high/low.
 *
 * Per ADR-0036 D7: primary source for crypto assets.
 */

import type { IPriceProvider, OhlcBar } from './types.js';

const CHAINLINK_FEEDS: Record<string, string> = {
  'BTC/USD': '0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F',
  'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
};

export class ChainlinkProvider implements IPriceProvider {
  readonly source = 'CHAINLINK' as const;

  async fetchOhlc(symbols: string[]): Promise<OhlcBar[]> {
    const results: OhlcBar[] = [];
    const now = new Date();

    for (const symbol of symbols) {
      const feedAddress = CHAINLINK_FEEDS[symbol.toUpperCase()];
      if (!feedAddress) continue;

      try {
        // Phase 2 stub: In production, this would call the Chainlink
        // AggregatorV3Interface.latestRoundData() via viem. For now,
        // we record placeholder data that the Settle Worker can query.
        // The actual on-chain integration is deferred until the RPC
        // endpoint is configured in the deployment environment.
        results.push({
          symbol: symbol.toUpperCase(),
          open: '0',
          high: '0',
          low: '0',
          close: '0',
          timestamp: now,
        });
      } catch {
        // Non-fatal
      }
    }

    return results;
  }
}

export { CHAINLINK_FEEDS };
