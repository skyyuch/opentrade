/**
 * Standalone SFC broker sync — fetches live from SFC public register API
 * and upserts into the database. Designed for both manual runs and as the
 * entry point for the ECS Scheduled Task (via apps/api sync entry point).
 *
 * Run locally:
 *   pnpm --filter @opentrade/db sync:sfc
 *
 * Unlike `fetch-sfc-brokers.ts` (offline → JSON file), this script writes
 * directly to the database without an intermediate file.
 */

import { PrismaClient } from '@prisma/client';

import { syncBrokers } from '../src/sfc/sync-brokers.js';

import type { SfcBrokerData } from '../src/sfc/types.js';

const SFC_API_URL = 'https://apps.sfc.hk/publicregWeb/searchByRaJson';
const REQUEST_DELAY_MS = 300;
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), ...'0123456789'.split('')];
const RA_TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const RA_DESCRIPTIONS: Record<number, string> = {
  1: 'Dealing in Securities',
  2: 'Dealing in Futures Contracts',
  3: 'Leveraged Foreign Exchange Trading',
  4: 'Advising on Securities',
  5: 'Advising on Futures Contracts',
  6: 'Advising on Corporate Finance',
  7: 'Providing Automated Trading Services',
  8: 'Securities Margin Financing',
  9: 'Asset Management',
  10: 'Providing Credit Rating Services',
};

type SfcItem = {
  ceref: string;
  name: string;
  nameChi: string | null;
  isCorp: boolean;
  isRi: boolean;
  hasActiveLicence: string;
};

type SfcResponse = {
  totalCount: number;
  items: SfcItem[];
};

type CorpAccumulator = {
  ceNumber: string;
  legalNameEn: string;
  legalNameZh: string;
  licenseTypes: Set<number>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.()[\]'"]/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchFromSfc(): Promise<SfcBrokerData[]> {
  console.log('Fetching SFC licensed corporations...');
  const corps = new Map<string, CorpAccumulator>();

  for (const ratype of RA_TYPES) {
    for (const letter of LETTERS) {
      const body = new URLSearchParams({
        licstatus: 'active',
        ratype: String(ratype),
        roleType: 'corporation',
        nameStartLetter: letter,
        page: '1',
        start: '0',
        limit: '9999',
      });

      const res = await fetch(SFC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'OpenTrade-SFC-Sync/1.0',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        throw new Error(`SFC API returned ${res.status} for ratype=${ratype} letter=${letter}`);
      }

      const data = (await res.json()) as SfcResponse;

      for (const item of data.items) {
        if (!item.isCorp || item.isRi) continue;
        if (item.hasActiveLicence !== 'Y') continue;

        const existing = corps.get(item.ceref);
        if (existing) {
          existing.licenseTypes.add(ratype);
        } else {
          const zhRaw = item.nameChi?.replace(/\0/g, '').trim();
          corps.set(item.ceref, {
            ceNumber: item.ceref,
            legalNameEn: item.name,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fallback
            legalNameZh: zhRaw || item.name,
            licenseTypes: new Set([ratype]),
          });
        }
      }

      await sleep(REQUEST_DELAY_MS);
    }
  }

  return [...corps.values()]
    .map((c) => ({
      ceNumber: c.ceNumber,
      legalNameEn: c.legalNameEn,
      legalNameZh: c.legalNameZh,
      slug: toSlug(c.legalNameEn),
      licenses: [...c.licenseTypes]
        .sort((a, b) => a - b)
        .map((t) => ({
          type: t,
          description: RA_DESCRIPTIONS[t] ?? `Type ${t}`,
        })),
    }))
    .sort((a, b) => a.ceNumber.localeCompare(b.ceNumber));
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const brokers = await fetchFromSfc();
  console.log(`Fetched ${brokers.length} corporations. Syncing to DB...`);

  const result = await syncBrokers(prisma, brokers);
  console.log(`Sync complete:`);
  console.log(`  Brokers: ${result.brokersCreated} created, ${result.brokersUpdated} updated`);
  console.log(`  Licenses: ${result.licensesCreated} created, ${result.licensesRevoked} revoked`);
}

try {
  await main();
} catch (err) {
  console.error('SFC sync failed:', err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
