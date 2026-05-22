/**
 * Production entry point for the SFC broker sync ECS Scheduled Task.
 *
 * This file is bundled by tsup as `dist/sync-sfc.js` and invoked by the
 * ECS task definition with CMD override: `["node", "dist/sync-sfc.js"]`.
 *
 * It delegates to `packages/db`'s sync logic and adds structured logging
 * and proper exit codes for ECS health reporting.
 *
 * Per ADR-0020: runs weekly via EventBridge, reuses the API Docker image.
 */

import { PrismaClient } from '@prisma/client';

import { syncBrokers } from '@opentrade/db/sfc';

import type { SfcBrokerData } from '@opentrade/db/sfc';

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

type SfcResponse = { totalCount: number; items: SfcItem[] };

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
        throw new Error(`SFC API ${res.status} for ratype=${ratype} letter=${letter}`);
      }

      const data = (await res.json()) as SfcResponse;

      for (const item of data.items) {
        if (!item.isCorp || item.isRi || item.hasActiveLicence !== 'Y') continue;

        const existing = corps.get(item.ceref);
        if (existing) {
          existing.licenseTypes.add(ratype);
        } else {
          const zhRaw = item.nameChi?.replace(/\0/g, '').trim();
          corps.set(item.ceref, {
            ceNumber: item.ceref,
            legalNameEn: item.name,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  const startedAt = Date.now();
  const log = (obj: Record<string, unknown>) => process.stdout.write(JSON.stringify(obj) + '\n');

  log({ level: 'info', msg: 'SFC sync started' });

  const brokers = await fetchFromSfc();
  log({
    level: 'info',
    msg: 'SFC fetch complete',
    corporations: brokers.length,
  });

  const result = await syncBrokers(prisma, brokers);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  log({
    level: 'info',
    msg: 'SFC sync complete',
    ...result,
    elapsedSeconds: elapsed,
  });
}

try {
  await main();
} catch (err) {
  process.stderr.write(
    JSON.stringify({
      level: 'error',
      msg: 'SFC sync failed',
      error: err instanceof Error ? err.message : String(err),
    }) + '\n',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
