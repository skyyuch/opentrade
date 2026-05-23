/**
 * SFC detail fetcher — enriches existing brokers with addresses, principals,
 * representatives, complaints officers, conditions (SFO + AMLO),
 * disciplinary actions, former names, and licence records from the SFC
 * public register HTML pages.
 *
 * Run via:
 *   pnpm --filter @opentrade/db fetch:sfc:details
 *
 * Add --force to re-fetch all brokers (even those with existing data):
 *   pnpm --filter @opentrade/db fetch:sfc:details -- --force
 *
 * Strategy: the SFC public register embeds data as JavaScript variables
 * directly in the HTML pages. We fetch the relevant sub-pages for each
 * corporation and extract these variables via regex, then parse as JSON.
 *
 * Pages fetched per broker:
 *   - /corp/{ceref}/addresses  → addressData
 *   - /corp/{ceref}/ro         → rorawData (responsible officers / principals)
 *   - /corp/{ceref}/rep        → reprawData (licensed representatives)
 *   - /corp/{ceref}/co         → cofficerData (complaints officer)
 *   - /corp/{ceref}/conditions → condData (SFO) + acondData (AMLO)
 *   - /corp/{ceref}/da         → daData (disciplinary actions)
 *   - /corp/{ceref}/prev_name  → prevNameData (previous names)
 *   - /corp/{ceref}/licences   → licRecordData (SFO) + amloRecordData (AMLO)
 */

import { Prisma, PrismaClient } from '@prisma/client';

const SFC_BASE_URL = 'https://apps.sfc.hk/publicregWeb/corp';
const REQUEST_DELAY_MS = 350;
const BATCH_LOG_INTERVAL = 50;
const FORCE_MODE = process.argv.includes('--force');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// SfcDetailJson shape — matches client.ts & API
// ---------------------------------------------------------------------------

type SfcAddress = {
  addressEn: string;
  addressZh?: string;
  isPrimary: boolean;
};

type SfcPerson = {
  nameEn: string;
  nameZh?: string;
  ceRef?: string;
  raTypes: number[];
};

type SfcComplaintsOfficer = {
  tel?: string;
  fax?: string;
  email?: string;
  address?: string;
  entityName?: string;
  entityNameChi?: string;
  ceRef?: string;
};

type SfcCondition = {
  text: string;
  textZh?: string;
  effectiveDate?: string;
};

type SfcDisciplinaryAction = {
  description: string;
  descriptionZh?: string;
  date?: string;
  url?: string;
};

type SfcFormerName = {
  nameEn?: string;
  nameZh?: string;
  effectiveUntil?: string;
};

type SfcLicenceRecord = {
  lcType: string;
  actType: number;
  actDesc: string;
  actDescZh: string;
  periods: Array<{ from: string; to?: string }>;
};

type SfcDetailJson = {
  addresses?: SfcAddress[];
  principals?: SfcPerson[];
  representatives?: SfcPerson[];
  complaintsOfficer?: SfcComplaintsOfficer;
  conditionsSfo?: SfcCondition[];
  conditionsAmlo?: SfcCondition[];
  disciplinaryActions?: SfcDisciplinaryAction[];
  formerNames?: SfcFormerName[];
  licenseRecordsSfo?: SfcLicenceRecord[];
  licenseRecordsAmlo?: SfcLicenceRecord[];
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Raw SFC data types (from JS variables)
// ---------------------------------------------------------------------------

type RawAddressItem = {
  fullAddress?: string;
  fullAddressChin?: string;
  addrPrin?: string;
};

type RawPersonItem = {
  fullName?: string;
  entityNameChi?: string;
  ceRef?: string;
  regulatedActivities?: Array<{ actType?: number }>;
};

type RawCoItem = {
  tel?: string;
  fax?: string;
  email?: string;
  address?: { fullAddress?: string; fullAddressChin?: string };
  centralEntity?: { fullName?: string; entityNameChi?: string; ceRef?: string };
};

type RawCondItem = {
  conditionDtl?: string;
  conditionCDtl?: string;
  effDate?: string;
};

type RawDaItem = {
  descriptionDtl?: string;
  descriptionCDtl?: string;
  daDate?: string;
  url?: string;
  newsTitle?: string;
};

type RawPrevNameItem = {
  previousName?: string;
  previousNameChi?: string;
  effDate?: string;
};

type RawLicRecordItem = {
  lcType?: string;
  regulatedActivity?: {
    actType?: number;
    actDesc?: string;
    cactDesc?: string;
  };
  effectivePeriodList?: Array<{
    effectiveDate?: string;
    endDate?: string | null;
  }>;
};

// ---------------------------------------------------------------------------
// Per-broker fetcher
// ---------------------------------------------------------------------------

async function fetchCorpDetail(ceref: string): Promise<{
  addressEn: string | null;
  addressZh: string | null;
  sfcDetailJson: SfcDetailJson;
}> {
  const sfcDetail: SfcDetailJson = {};
  let addressEn: string | null = null;
  let addressZh: string | null = null;

  // 1. Addresses — fetch ALL, not just primary
  const addressHtml = await fetchPage(ceref, 'addresses');
  if (addressHtml) {
    const raw = extractJsVar(addressHtml, 'addressData') as RawAddressItem[] | null;
    if (raw?.length) {
      sfcDetail.addresses = raw
        .filter((a) => a.fullAddress?.trim())
        .map((a) => ({
          addressEn: a.fullAddress!.trim(),
          ...(a.fullAddressChin?.trim() ? { addressZh: a.fullAddressChin.trim() } : {}),
          isPrimary: a.addrPrin === 'Y',
        }));
      const primary = sfcDetail.addresses.find((a) => a.isPrimary) ?? sfcDetail.addresses[0];
      if (primary) {
        addressEn = primary.addressEn;
        addressZh = primary.addressZh ?? null;
      }
    }
  }
  await sleep(REQUEST_DELAY_MS);

  // 2. Responsible Officers (principals) — with ceRef + RA types
  const roHtml = await fetchPage(ceref, 'ro');
  if (roHtml) {
    const ros = extractJsVar(roHtml, 'rorawData') as RawPersonItem[] | null;
    if (ros?.length) {
      sfcDetail.principals = ros
        .filter((r) => r.fullName)
        .map((r) => ({
          nameEn: r.fullName!,
          ...(r.entityNameChi ? { nameZh: r.entityNameChi } : {}),
          ...(r.ceRef ? { ceRef: r.ceRef } : {}),
          raTypes: (r.regulatedActivities ?? [])
            .map((ra) => ra.actType)
            .filter((t): t is number => t != null)
            .sort((a, b) => a - b),
        }));
    }
  }
  await sleep(REQUEST_DELAY_MS);

  // 3. Licensed Representatives — same structure as RO
  const repHtml = await fetchPage(ceref, 'rep');
  if (repHtml) {
    const reps = extractJsVar(repHtml, 'reprawData') as RawPersonItem[] | null;
    if (reps?.length) {
      sfcDetail.representatives = reps
        .filter((r) => r.fullName)
        .map((r) => ({
          nameEn: r.fullName!,
          ...(r.entityNameChi ? { nameZh: r.entityNameChi } : {}),
          ...(r.ceRef ? { ceRef: r.ceRef } : {}),
          raTypes: (r.regulatedActivities ?? [])
            .map((ra) => ra.actType)
            .filter((t): t is number => t != null)
            .sort((a, b) => a - b),
        }));
    }
  }
  await sleep(REQUEST_DELAY_MS);

  // 4. Complaints Officer
  const coHtml = await fetchPage(ceref, 'co');
  if (coHtml) {
    const cos = extractJsVar(coHtml, 'cofficerData') as RawCoItem[] | null;
    if (cos?.length) {
      const co = cos[0]!;
      sfcDetail.complaintsOfficer = {
        ...(co.tel ? { tel: co.tel } : {}),
        ...(co.fax ? { fax: co.fax } : {}),
        ...(co.email ? { email: co.email } : {}),
        ...(co.address?.fullAddress ? { address: co.address.fullAddress } : {}),
        ...(co.centralEntity?.fullName ? { entityName: co.centralEntity.fullName } : {}),
        ...(co.centralEntity?.entityNameChi
          ? { entityNameChi: co.centralEntity.entityNameChi }
          : {}),
        ...(co.centralEntity?.ceRef ? { ceRef: co.centralEntity.ceRef } : {}),
      };
    }
  }
  await sleep(REQUEST_DELAY_MS);

  // 5. Conditions — SFO (condData) + AMLO (acondData)
  const condHtml = await fetchPage(ceref, 'conditions');
  if (condHtml) {
    const sfoConds = extractJsVar(condHtml, 'condData') as RawCondItem[] | null;
    if (sfoConds?.length) {
      const parsed = sfoConds
        .filter((c) => c.conditionDtl)
        .map((c) => ({
          text: c.conditionDtl!.replace(/<[^>]*>/g, '').trim(),
          ...(c.conditionCDtl ? { textZh: c.conditionCDtl.replace(/<[^>]*>/g, '').trim() } : {}),
          ...(c.effDate ? { effectiveDate: c.effDate } : {}),
        }));
      if (parsed.length) sfcDetail.conditionsSfo = parsed;
    }

    const amloConds = extractJsVar(condHtml, 'acondData') as RawCondItem[] | null;
    if (amloConds?.length) {
      const parsed = amloConds
        .filter((c) => c.conditionDtl)
        .map((c) => ({
          text: c.conditionDtl!.replace(/<[^>]*>/g, '').trim(),
          ...(c.conditionCDtl ? { textZh: c.conditionCDtl.replace(/<[^>]*>/g, '').trim() } : {}),
          ...(c.effDate ? { effectiveDate: c.effDate } : {}),
        }));
      if (parsed.length) sfcDetail.conditionsAmlo = parsed;
    }
  }
  await sleep(REQUEST_DELAY_MS);

  // 6. Disciplinary Actions
  const daHtml = await fetchPage(ceref, 'da');
  if (daHtml) {
    const das = extractJsVar(daHtml, 'daData') as RawDaItem[] | null;
    if (das?.length) {
      sfcDetail.disciplinaryActions = das
        .filter((d) => d.descriptionDtl || d.newsTitle)
        .map((d) => ({
          description: (d.descriptionDtl ?? d.newsTitle ?? '').replace(/<[^>]*>/g, '').trim(),
          ...(d.descriptionCDtl
            ? { descriptionZh: d.descriptionCDtl.replace(/<[^>]*>/g, '').trim() }
            : {}),
          ...(d.daDate ? { date: d.daDate } : {}),
          ...(d.url ? { url: d.url } : {}),
        }));
    }
  }
  await sleep(REQUEST_DELAY_MS);

  // 7. Previous Names
  const prevHtml = await fetchPage(ceref, 'prev_name');
  if (prevHtml) {
    const prevs = extractJsVar(prevHtml, 'prevNameData') as RawPrevNameItem[] | null;
    if (prevs?.length) {
      sfcDetail.formerNames = prevs
        .filter((p) => p.previousName || p.previousNameChi)
        .map((p) => ({
          ...(p.previousName ? { nameEn: p.previousName } : {}),
          ...(p.previousNameChi ? { nameZh: p.previousNameChi } : {}),
          ...(p.effDate ? { effectiveUntil: p.effDate } : {}),
        }));
    }
  }
  await sleep(REQUEST_DELAY_MS);

  // 8. Licence Records — SFO + AMLO
  const licHtml = await fetchPage(ceref, 'licences');
  if (licHtml) {
    const sfoRecs = extractJsVar(licHtml, 'licRecordData') as RawLicRecordItem[] | null;
    if (sfoRecs?.length) {
      sfcDetail.licenseRecordsSfo = sfoRecs
        .filter((r) => r.regulatedActivity)
        .map((r) => ({
          lcType: r.lcType ?? '',
          actType: r.regulatedActivity!.actType ?? 0,
          actDesc: r.regulatedActivity!.actDesc ?? '',
          actDescZh: r.regulatedActivity!.cactDesc ?? '',
          periods: (r.effectivePeriodList ?? []).map((p) => ({
            from: p.effectiveDate ?? '',
            ...(p.endDate ? { to: p.endDate } : {}),
          })),
        }));
    }

    const amloRecs = extractJsVar(licHtml, 'amloRecordData') as RawLicRecordItem[] | null;
    if (amloRecs?.length) {
      sfcDetail.licenseRecordsAmlo = amloRecs
        .filter((r) => r.regulatedActivity)
        .map((r) => ({
          lcType: r.lcType ?? '',
          actType: r.regulatedActivity!.actType ?? 0,
          actDesc: r.regulatedActivity!.actDesc ?? '',
          actDescZh: r.regulatedActivity!.cactDesc ?? '',
          periods: (r.effectivePeriodList ?? []).map((p) => ({
            from: p.effectiveDate ?? '',
            ...(p.endDate ? { to: p.endDate } : {}),
          })),
        }));
    }
  }

  return { addressEn, addressZh, sfcDetailJson: sfcDetail };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const whereClause = FORCE_MODE
    ? { ceNumber: { not: null } }
    : { ceNumber: { not: null }, sfcDetailJson: { equals: Prisma.DbNull } };

  const brokers = await prisma.broker.findMany({
    where: whereClause,
    select: { id: true, ceNumber: true, displayName: true },
    orderBy: { ceNumber: 'asc' },
  });

  console.log(
    `Found ${brokers.length} brokers to process (mode: ${FORCE_MODE ? 'force re-fetch ALL' : 'only missing'}).`,
  );
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
        Object.values(sfcDetailJson).some(
          (v) => (Array.isArray(v) && v.length > 0) || (typeof v === 'object' && v !== null),
        );

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
