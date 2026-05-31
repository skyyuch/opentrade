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
 *   - INDEX / COMMODITY → curated JSON in seed/data/ (this commit)
 *   - EQUITY_HK (HKEX) / EQUITY_US (SEC) / CRYPTO (CoinGecko) → added next.
 *
 * Curated index/commodity rows are always loaded. The external fetchers are
 * network-bound; until they land, this script keeps the curated catalog fresh
 * on its own — safe because reconciliation in `syncInstruments` is scoped
 * per-source (a curated-only run never retires HKEX/SEC/CoinGecko rows).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { syncInstruments } from '../src/catalog/index.js';

import type { InstrumentData } from '../src/catalog/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const loadCurated = (file: string): InstrumentData[] => {
  const jsonPath = resolve(__dirname, '../seed/data', file);
  return JSON.parse(readFileSync(jsonPath, 'utf-8')) as InstrumentData[];
};

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const data: InstrumentData[] = [
    ...loadCurated('index-instruments.json'),
    ...loadCurated('commodity-instruments.json'),
  ];

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
