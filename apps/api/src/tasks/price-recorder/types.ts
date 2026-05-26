/**
 * Shared types for the price recorder subsystem.
 *
 * Per ADR-0036 D7: hybrid oracle — Chainlink for crypto, Yahoo Finance
 * for traditional finance. The off-chain price recorder polls hourly
 * OHLC data that the Settle Worker uses to determine signal outcomes.
 */

export interface OhlcBar {
  symbol: string;
  open: string;
  high: string;
  low: string;
  close: string;
  timestamp: Date;
}

export interface IPriceProvider {
  readonly source: 'CHAINLINK' | 'YAHOO_FINANCE' | 'MANUAL';
  fetchOhlc(symbols: string[]): Promise<OhlcBar[]>;
}
