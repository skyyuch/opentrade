/**
 * Idempotent database seed for `@opentrade/db`.
 *
 * Run via:
 *   pnpm --filter @opentrade/db db:seed
 *
 * Per cursor rule 31 every seed MUST be idempotent — running it twice on the
 * same database must leave it in the same state as running it once. We use
 * `prisma.upsert` keyed on the model's natural unique column (`Tenant.code`,
 * `Broker.slug + tenantId`, ...).
 *
 * Seed order matters due to FK constraints:
 *   1. Tenants (bootstrap data, required for all subsequent inserts)
 *   2. Brokers + BrokerLicenses (SFC data from seed/data/sfc-brokers.json)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';

import { BASELINE_MODERATION_TERMS } from '@opentrade/shared';

import { syncHkgxMembers } from '../src/hkgx/sync-members.js';
import { prisma, Prisma } from '../src/index.js';
import { syncBrokers } from '../src/sfc/sync-brokers.js';

import type { HkgxMemberData } from '../src/hkgx/types.js';
import type { SfcBrokerData } from '../src/sfc/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

type TenantSeed = {
  id: string;
  code: string;
  name: string;
  defaultLocale: string;
  timezone: string;
};

// Pinned so DEFAULT_TENANT_ID is identical across local / UAT / PRD and the
// secret can be written before the seed runs (ADR-0048 D3). The upsert stays
// idempotent on `code`; only the create branch applies this id, so existing
// databases are untouched.
const HK_TENANT_ID = 'e05ea634-e71d-447c-bd3d-87942eda6a2a';

const tenants: readonly TenantSeed[] = [
  {
    id: HK_TENANT_ID,
    code: 'hk',
    name: 'Hong Kong',
    defaultLocale: 'zh-Hant',
    timezone: 'Asia/Hong_Kong',
  },
];

const seedTenants = async (): Promise<void> => {
  for (const tenant of tenants) {
    const result = await prisma.tenant.upsert({
      where: { code: tenant.code },
      update: {
        name: tenant.name,
        defaultLocale: tenant.defaultLocale,
        timezone: tenant.timezone,
      },
      create: {
        id: tenant.id,
        code: tenant.code,
        name: tenant.name,
        defaultLocale: tenant.defaultLocale,
        timezone: tenant.timezone,
        isActive: true,
      },
    });
    console.log(`  ✔ tenant code="${result.code}" id=${result.id}`);
  }
};

const seedBrokers = async (): Promise<void> => {
  const jsonPath = resolve(__dirname, '../seed/data/sfc-brokers.json');
  let data: SfcBrokerData[];
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as SfcBrokerData[];
  } catch {
    console.log('  ⚠ seed/data/sfc-brokers.json not found. Run `pnpm fetch:sfc` first.');
    return;
  }

  console.log(`  Loading ${data.length} corporations from sfc-brokers.json...`);
  const result = await syncBrokers(prisma, data);
  console.log(`  ✔ brokers: ${result.brokersCreated} created, ${result.brokersUpdated} updated`);
  console.log(`  ✔ licenses: ${result.licensesCreated} created, ${result.licensesRevoked} revoked`);
};

const seedHkgxMembers = async (): Promise<void> => {
  const jsonPath = resolve(__dirname, '../seed-data/hkgx-members.json');
  let data: HkgxMemberData[];
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as HkgxMemberData[];
  } catch {
    console.log('  ⚠ seed-data/hkgx-members.json not found. Run `pnpm fetch:hkgx` first.');
    return;
  }

  console.log(`  Loading ${data.length} bullion dealers from hkgx-members.json...`);
  const result = await syncHkgxMembers(prisma, data);
  console.log(
    `  ✔ bullion brokers: ${result.brokersCreated} created, ${result.brokersUpdated} updated`,
  );
  console.log(
    `  ✔ HKGX licenses: ${result.licensesCreated} created, ${result.licensesUpdated} updated, ${result.membersRetired} retired`,
  );
};

const seedAdminUser = async (): Promise<void> => {
  const tenant = await prisma.tenant.findUnique({ where: { code: 'hk' } });
  if (!tenant) {
    console.log('  ⚠ Tenant "hk" not found. Skipping admin user seed.');
    return;
  }

  const username = 'admin';
  const passwordHash = await bcrypt.hash('123456', 10);
  const placeholderPrivyId = 'manual:admin-bootstrap';

  const result = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, role: 'ADMIN' },
    create: {
      tenantId: tenant.id,
      privyId: placeholderPrivyId,
      username,
      passwordHash,
      displayName: 'Admin',
      role: 'ADMIN',
    },
  });
  console.log(`  ✔ admin user username="${username}" id=${result.id} role=${result.role}`);
};

type HkKolSeed = {
  slug: string;
  displayName: string;
  bio?: string;
  socialLinks?: Record<string, string>;
  credentials?: { type: string; verified: boolean }[];
};

const seedKols = async (): Promise<void> => {
  const jsonPath = resolve(__dirname, '../seed/data/hk-kols.json');
  let data: HkKolSeed[];
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as HkKolSeed[];
  } catch {
    console.log('  ⚠ seed/data/hk-kols.json not found. Skipping KOL seed.');
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { code: 'hk' } });
  if (!tenant) {
    console.log('  ⚠ Tenant "hk" not found. Skipping KOL seed.');
    return;
  }

  let created = 0;
  let updated = 0;

  for (const kol of data) {
    const socialLinksValue = kol.socialLinks ?? Prisma.JsonNull;
    const credentialsValue = kol.credentials ?? Prisma.JsonNull;

    const result = await prisma.kol.upsert({
      where: { slug: kol.slug },
      update: {
        displayName: kol.displayName,
        bio: kol.bio ?? null,
        socialLinks: socialLinksValue,
        credentials: credentialsValue,
      },
      create: {
        tenantId: tenant.id,
        slug: kol.slug,
        displayName: kol.displayName,
        bio: kol.bio ?? null,
        socialLinks: socialLinksValue,
        credentials: credentialsValue,
        status: 'UNCLAIMED',
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      updated++;
    }
  }

  console.log(`  ✔ KOLs: ${created} created, ${updated} updated (${data.length} total)`);
};

/**
 * Seeds the `hk` tenant's moderation blocklist from the shared BASELINE list
 * (ADR-0034). Idempotent via find-or-create on (tenantId, category, term,
 * isRegex) — the table has no DB-level unique constraint yet (Phase B will add
 * a partial unique index that accounts for soft-delete), so we dedup in code
 * here to honour rule 31. The runtime gate also falls back to this exact
 * BASELINE when the table is empty, so seeding is an optimisation (populates
 * the Phase B admin UI), not a correctness dependency.
 */
const seedModerationTerms = async (): Promise<void> => {
  const tenant = await prisma.tenant.findUnique({ where: { code: 'hk' } });
  if (!tenant) {
    console.log('  ⚠ Tenant "hk" not found. Skipping moderation term seed.');
    return;
  }

  let created = 0;
  for (const term of BASELINE_MODERATION_TERMS) {
    const isRegex = term.isRegex ?? false;
    const existing = await prisma.moderationTerm.findFirst({
      where: { tenantId: tenant.id, category: term.category, term: term.term, isRegex },
    });
    if (existing) continue;
    await prisma.moderationTerm.create({
      data: { tenantId: tenant.id, category: term.category, term: term.term, isRegex },
    });
    created++;
  }

  console.log(
    `  ✔ moderation terms: ${created} created, ${BASELINE_MODERATION_TERMS.length - created} already present`,
  );
};

const main = async (): Promise<void> => {
  console.log('Seeding @opentrade/db...');
  console.log('• Tenants');
  await seedTenants();
  console.log('• Admin User');
  await seedAdminUser();
  console.log('• SFC Brokers');
  await seedBrokers();
  console.log('• HKGX Bullion Dealers');
  await seedHkgxMembers();
  console.log('• HK KOLs');
  await seedKols();
  console.log('• Moderation Terms');
  await seedModerationTerms();
  console.log('Done.');
};

try {
  await main();
} catch (err) {
  console.error('Seed failed:', err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
