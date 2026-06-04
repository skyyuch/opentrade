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

import { prisma, Prisma } from '../src/index.js';
import { syncBrokers } from '../src/sfc/sync-brokers.js';

import type { SfcBrokerData } from '../src/sfc/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

type TenantSeed = {
  code: string;
  name: string;
  defaultLocale: string;
  timezone: string;
};

const tenants: readonly TenantSeed[] = [
  {
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

const main = async (): Promise<void> => {
  console.log('Seeding @opentrade/db...');
  console.log('• Tenants');
  await seedTenants();
  console.log('• Admin User');
  await seedAdminUser();
  console.log('• SFC Brokers');
  await seedBrokers();
  console.log('• HK KOLs');
  await seedKols();
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
