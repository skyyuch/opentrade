/**
 * Offline fetcher for SFC (Securities and Futures Commission) licensed
 * corporations. Queries the public register API and writes a normalised
 * JSON file to `seed/data/sfc-brokers.json`.
 *
 * Run via:
 *   pnpm --filter @opentrade/db fetch:sfc
 *
 * Strategy: the `searchByRaJson` endpoint returns corporation metadata but
 * NOT the `raDetails` array. To build a complete licence picture we query
 * EACH regulated activity type (1-10) × each starting letter (A-Z, 0-9)
 * and cross-reference by CE number. This yields ~360 requests at 300ms
 * each ≈ 2 minutes, giving us the full licence matrix for every corp.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

import type { SfcBrokerData } from '../src/sfc/types.js';

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

async function fetchPage(ratype: number, letter: string): Promise<SfcItem[]> {
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
      'User-Agent': 'OpenTrade-SFC-Seed/1.0',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`SFC API returned ${res.status} for ratype=${ratype} letter=${letter}`);
  }

  const data = (await res.json()) as SfcResponse;
  return data.items;
}

type CorpAccumulator = {
  ceNumber: string;
  legalNameEn: string;
  legalNameZh: string;
  licenseTypes: Set<number>;
};

async function main(): Promise<void> {
  console.log('Fetching SFC licensed corporations (all RA types)...');
  const corps = new Map<string, CorpAccumulator>();
  let requestCount = 0;

  for (const ratype of RA_TYPES) {
    process.stdout.write(`  RA Type ${ratype}: `);
    let typeCount = 0;

    for (const letter of LETTERS) {
      const items = await fetchPage(ratype, letter);
      requestCount++;

      for (const item of items) {
        if (!item.isCorp || item.isRi) continue;
        if (item.hasActiveLicence !== 'Y') continue;

        const existing = corps.get(item.ceref);
        if (existing) {
          existing.licenseTypes.add(ratype);
        } else {
          // SFC API sometimes returns \x00 for Chinese names
          const zhRaw = item.nameChi?.replace(/\0/g, '').trim();
          corps.set(item.ceref, {
            ceNumber: item.ceref,
            legalNameEn: item.name,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should also fallback
            legalNameZh: zhRaw || item.name,
            licenseTypes: new Set([ratype]),
          });
        }
        typeCount++;
      }

      await sleep(REQUEST_DELAY_MS);
    }

    console.log(`${typeCount} items`);
  }

  console.log(`\nTotal requests: ${requestCount}`);
  console.log(`Unique corporations: ${corps.size}`);

  const brokers: SfcBrokerData[] = [...corps.values()]
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

  const licenseDistribution = new Map<string, number>();
  for (const b of brokers) {
    for (const l of b.licenses) {
      const key = `Type ${l.type}: ${l.description}`;
      licenseDistribution.set(key, (licenseDistribution.get(key) ?? 0) + 1);
    }
  }
  console.log('\nLicense distribution:');
  for (const [key, count] of [...licenseDistribution.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }

  const outPath = resolve(__dirname, '../seed/data/sfc-brokers.json');
  writeFileSync(outPath, JSON.stringify(brokers, null, 2) + '\n', 'utf-8');
  console.log(`\nWritten ${brokers.length} brokers to ${outPath}`);
}

try {
  await main();
} catch (err) {
  console.error('Fetch failed:', err);
  process.exitCode = 1;
}
