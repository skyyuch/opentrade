/**
 * CRYPTO source — CoinGecko (ADR-0038 D5).
 *
 * ADR-0038 D5 names CoinGecko `/coins/list`, but that endpoint returns ~17k
 * coins UNRANKED, including dead tokens and junk names — useless as a picker
 * catalog and noisy to reconcile. We use the equally free / keyless
 * `/coins/markets` endpoint instead, which is market-cap ranked, and keep the
 * top {@link TOP_N}. Same provider, same auth (none); a deliberate
 * implementation refinement of D5, not a source change. If CoinGecko ever
 * gates `/coins/markets`, falling back to `/coins/list` is a one-function swap.
 *
 * Crypto has no Chinese name here, so `nameZh` is null (locale helper falls
 * back to `nameEn`). The symbol is uppercased to match the canonical form.
 */

import type { InstrumentData } from '../types.js';

const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets';
const PER_PAGE = 250;
const TOP_N = 500;

// Fields typed as possibly-undefined: untrusted external JSON, so the guards
// below are real runtime checks, not redundant.
type MarketEntry = { id?: string; symbol?: string; name?: string };

export async function fetchCoinGeckoInstruments(): Promise<InstrumentData[]> {
  const pages = Math.ceil(TOP_N / PER_PAGE);
  const instruments: InstrumentData[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= pages; page++) {
    const url = `${COINGECKO_MARKETS_URL}?vs_currency=usd&order=market_cap_desc&per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'OpenTrade-Instrument-Sync/1.0 (+https://opentrade.io)' },
    });
    if (!res.ok) {
      throw new Error(`GET ${url} returned ${res.status}`);
    }

    const data = (await res.json()) as MarketEntry[];
    for (const entry of data) {
      const symbol = entry.symbol?.trim().toUpperCase();
      const name = entry.name?.trim();
      if (!symbol || !name) continue;
      // Multiple coins can share a ticker (e.g. wrapped variants); keep the
      // higher-ranked first occurrence so @@unique([CRYPTO, symbol]) holds.
      if (seen.has(symbol)) continue;
      seen.add(symbol);

      instruments.push({
        category: 'CRYPTO',
        symbol,
        displayCode: symbol,
        nameEn: name,
        nameZh: null,
        exchange: null,
        source: 'COINGECKO',
      });
    }
  }

  return instruments;
}
