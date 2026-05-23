/**
 * SFC detail fetcher — enriches existing brokers with address, principals,
 * representatives, conditions, disciplinary actions, and former names from
 * the SFC public register HTML pages.
 *
 * Run via:
 *   pnpm --filter @opentrade/db fetch:sfc:details
 *
 * Strategy: the SFC public register embeds data as JavaScript variables
 * directly in the HTML pages. We fetch the relevant sub-pages for each
 * corporation and extract these variables via regex, then parse as JSON.
 *
 * Pages fetched per broker:
 *   - /corp/{ceref}/addresses  → addressData (address), emailData, websiteData
 *   - /corp/{ceref}/ro         → rorawData (responsible officers)
 *   - /corp/{ceref}/conditions → condData (conditions)
 *   - /corp/{ceref}/da         → daData (disciplinary actions)
 *   - /corp/{ceref}/prev_name  → prevNameData (previous names)
 */

import { Prisma, PrismaClient } from '@prisma/client';

const SFC_BASE_URL = 'https://apps.sfc.hk/publicregWeb/corp';
const REQUEST_DELAY_MS = 400;
const BATCH_LOG_INTERVAL = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SfcDetailJson = {
  principals?: Array<{ nameEn: string; nameZh?: string; role?: string }>;
  representatives?: Array<{ nameEn: string; nameZh?: string; raTypes?: string[] }>;
  conditions?: Array<{ text: string; effectiveDate?: string }>;
  disciplinaryActions?: Array<{ description: string; date?: string; url?: string }>;
  formerNames?: Array<{ name: string; effectiveUntil?: string }>;
};

const headers: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (OpenTrade-SFC-DetailFetcher/1.0)',
  Accept: 'text/html,application/xhtml+xml',
};

function extractJsVar(html: string, varName: string): unknown {
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[.*?\\]);`, 's');
  const match = regex.exec(html);
  if (!match?.[1]) return null;

  try {
    const jsonStr = match[1]
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>')
      .replace(/\\u0026/g, '&')
      .replace(/\\""/g, '"')
      .replace(/\0/g, '');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function fetchPage(ceref: string, page: string): Promise<string | null> {
  try {
    const res = await fetch(`${SFC_BASE_URL}/${ceref}/${page}`, { headers });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type AddressItem = {
  fullAddress?: string;
  fullAddressChin?: string;
  addrPrin?: string;
};

type RoItem = {
  fullName?: string;
  entityNameChi?: string;
  regulatedActivities?: Array<{ actType?: number }>;
};

type CondItem = {
  conditionDtl?: string;
  conditionCDtl?: string;
  effDate?: string;
};

type DaItem = {
  descriptionDtl?: string;
  descriptionCDtl?: string;
  daDate?: string;
  url?: string;
  newsTitle?: string;
};

type PrevNameItem = {
  previousName?: string;
  previousNameChi?: string;
  effDate?: string;
};

async function fetchCorpDetail(ceref: string): Promise<{
  addressEn: string | null;
  addressZh: string | null;
  sfcDetailJson: SfcDetailJson;
}> {
  const sfcDetail: SfcDetailJson = {};
  let addressEn: string | null = null;
  let addressZh: string | null = null;

  const addressHtml = await fetchPage(ceref, 'addresses');
  if (addressHtml) {
    const addresses = extractJsVar(addressHtml, 'addressData') as AddressItem[] | null;
    if (addresses?.length) {
      const primary = addresses.find((a) => a.addrPrin === 'Y') ?? addresses[0];
      addressEn = primary?.fullAddress?.trim() || null;
      addressZh = primary?.fullAddressChin?.trim() || null;
    }
  }
  await sleep(REQUEST_DELAY_MS);

  const roHtml = await fetchPage(ceref, 'ro');
  if (roHtml) {
    const ros = extractJsVar(roHtml, 'rorawData') as RoItem[] | null;
    if (ros?.length) {
      sfcDetail.principals = ros
        .filter((r) => r.fullName)
        .map((r) => ({
          nameEn: r.fullName!,
          ...(r.entityNameChi ? { nameZh: r.entityNameChi } : {}),
        }));
    }
  }
  await sleep(REQUEST_DELAY_MS);

  const condHtml = await fetchPage(ceref, 'conditions');
  if (condHtml) {
    const conds = extractJsVar(condHtml, 'condData') as CondItem[] | null;
    if (conds?.length) {
      sfcDetail.conditions = conds
        .filter((c) => c.conditionDtl)
        .map((c) => ({
          text: c.conditionDtl!.replace(/<[^>]*>/g, '').trim(),
          ...(c.effDate ? { effectiveDate: c.effDate } : {}),
        }));
    }
  }
  await sleep(REQUEST_DELAY_MS);

  const daHtml = await fetchPage(ceref, 'da');
  if (daHtml) {
    const das = extractJsVar(daHtml, 'daData') as DaItem[] | null;
    if (das?.length) {
      sfcDetail.disciplinaryActions = das
        .filter((d) => d.descriptionDtl || d.newsTitle)
        .map((d) => ({
          description: (d.descriptionDtl ?? d.newsTitle ?? '').replace(/<[^>]*>/g, '').trim(),
          ...(d.daDate ? { date: d.daDate } : {}),
          ...(d.url ? { url: d.url } : {}),
        }));
    }
  }
  await sleep(REQUEST_DELAY_MS);

  const prevHtml = await fetchPage(ceref, 'prev_name');
  if (prevHtml) {
    const prevs = extractJsVar(prevHtml, 'prevNameData') as PrevNameItem[] | null;
    if (prevs?.length) {
      sfcDetail.formerNames = prevs
        .filter((p) => p.previousName)
        .map((p) => ({
          name: p.previousName!,
          ...(p.effDate ? { effectiveUntil: p.effDate } : {}),
        }));
    }
  }

  return { addressEn, addressZh, sfcDetailJson: sfcDetail };
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const brokers = await prisma.broker.findMany({
    where: {
      ceNumber: { not: null },
      sfcDetailJson: { equals: Prisma.DbNull },
    },
    select: { id: true, ceNumber: true, displayName: true },
    orderBy: { ceNumber: 'asc' },
  });

  console.log(`Found ${brokers.length} brokers without SFC detail data.`);
  if (brokers.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < brokers.length; i++) {
    const broker = brokers[i]!;
    const ceref = broker.ceNumber!;

    if ((i + 1) % BATCH_LOG_INTERVAL === 0 || i === 0) {
      console.log(`Progress: ${i + 1}/${brokers.length} (updated: ${updated}, failed: ${failed})`);
    }

    try {
      const { addressEn, addressZh, sfcDetailJson } = await fetchCorpDetail(ceref);

      const hasData =
        addressEn ||
        addressZh ||
        Object.values(sfcDetailJson).some((v) => Array.isArray(v) && v.length > 0);

      await prisma.broker.update({
        where: { id: broker.id },
        data: {
          ...(addressEn ? { addressEn } : {}),
          ...(addressZh ? { addressZh } : {}),
          sfcDetailJson: hasData
            ? (sfcDetailJson as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });

      if (hasData) updated++;
    } catch (err) {
      console.warn(`  Failed for ${ceref} (${broker.displayName}):`, err);
      failed++;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `\nDone. Updated: ${updated}, Failed: ${failed}, Skipped: ${brokers.length - updated - failed}`,
  );
}

try {
  await main();
} catch (err) {
  console.error('SFC detail fetch failed:', err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
