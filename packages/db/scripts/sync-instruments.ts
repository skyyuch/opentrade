/**
 * Instrument catalog sync entry point (per ADR-0038 D5).
 *
 * Assembles {@link InstrumentData} from every source and upserts it into the
 * global `Instrument` table via the idempotent {@link syncInstruments}.
 *
 * Run locally:
 *   pnpm --filter @opentrade/db sync:instruments
 *
 * Sources (all free / keyless per ADR-0038 D5):
 *   - INDEX / COMMODITY → curated JSON in seed/data/
 *   - EQUITY_HK → HKEX List of Securities (EN + TC bulk XLSX)
 *   - EQUITY_US → SEC company_tickers.json
 *   - CRYPTO    → CoinGecko top-N by market cap
 *
 * Each external source is fetched independently and its failure is isolated:
 * one provider being down (or rate-limiting) logs a warning and skips that
 * source rather than aborting the whole sync. This is safe because
 * reconciliation in `syncInstruments` is scoped per-source — a run missing a
 * source simply leaves that source's existing rows untouched (NOT retired),
 * so a transient outage never wipes a category from the catalog.
 *
 * Flags:
 *   --curated-only   load only the curated INDEX/COMMODITY JSON (offline).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { syncInstruments } from '../src/catalog/index.js';
import { fetchCoinGeckoInstruments } from '../src/catalog/sources/coingecko.js';
import { fetchHkexInstruments } from '../src/catalog/sources/hkex.js';
import { fetchSecInstruments } from '../src/catalog/sources/sec.js';

import type { InstrumentData } from '../src/catalog/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const loadCurated = (file: string): InstrumentData[] => {
  const jsonPath = resolve(__dirname, '../seed/data', file);
  return JSON.parse(readFileSync(jsonPath, 'utf-8')) as InstrumentData[];
};

const collectSource = async (
  name: string,
  fetcher: () => Promise<InstrumentData[]>,
): Promise<InstrumentData[]> => {
  try {
    const rows = await fetcher();
    console.log(`  ✔ ${name}: ${rows.length} instruments`);
    return rows;
  } catch (err) {
    console.warn(
      `  ⚠ ${name} failed, skipping: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
};

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const curatedOnly = process.argv.includes('--curated-only');

  const data: InstrumentData[] = [
    ...loadCurated('index-instruments.json'),
    ...loadCurated('commodity-instruments.json'),
  ];
  console.log(`  ✔ curated INDEX/COMMODITY: ${data.length} instruments`);

  if (!curatedOnly) {
    data.push(...(await collectSource('HKEX (EQUITY_HK)', fetchHkexInstruments)));
    data.push(...(await collectSource('SEC (EQUITY_US)', fetchSecInstruments)));
    data.push(...(await collectSource('CoinGecko (CRYPTO)', fetchCoinGeckoInstruments)));
  }

  console.log(`Syncing ${data.length} instruments...`);
  const result = await syncInstruments(prisma, data);
  console.log(
    `Sync complete: ${result.created} created, ${result.updated} updated, ` +
      `${result.reactivated} reactivated, ${result.retired} retired`,
  );
}

try {
  await main();
} catch (err) {
  console.error('Instrument sync failed:', err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
