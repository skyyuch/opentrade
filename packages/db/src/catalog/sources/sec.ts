/**
 * EQUITY_US source — the SEC `company_tickers.json` bulk file (ADR-0038 D5).
 *
 * Free, keyless (the SEC only asks for a descriptive User-Agent). The file is
 * an object keyed by an arbitrary index whose values are
 * `{ cik_str, ticker, title }`. US equities have no Chinese name, so `nameZh`
 * is null and the locale helper falls back to `nameEn`.
 */

import type { InstrumentData } from '../types.js';

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

// Fields typed as possibly-undefined: this is untrusted external JSON, so the
// guards below are real runtime checks, not redundant.
type SecEntry = { cik_str?: number; ticker?: string; title?: string };

export async function fetchSecInstruments(): Promise<InstrumentData[]> {
  const res = await fetch(SEC_TICKERS_URL, {
    headers: { 'User-Agent': 'OpenTrade-Instrument-Sync/1.0 (+https://opentrade.io)' },
  });
  if (!res.ok) {
    throw new Error(`GET ${SEC_TICKERS_URL} returned ${res.status}`);
  }

  const data = (await res.json()) as Record<string, SecEntry>;

  const instruments: InstrumentData[] = [];
  const seen = new Set<string>();
  for (const entry of Object.values(data)) {
    const ticker = entry.ticker?.trim().toUpperCase();
    const title = entry.title?.trim();
    if (!ticker || !title) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);

    instruments.push({
      category: 'EQUITY_US',
      symbol: ticker,
      displayCode: ticker,
      nameEn: title,
      nameZh: null,
      exchange: null,
      source: 'SEC',
    });
  }

  return instruments;
}
