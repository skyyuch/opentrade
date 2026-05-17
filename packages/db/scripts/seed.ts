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
 * Why hardcode the HK tenant here instead of reading from JSON:
 *   - It is bootstrap data, not domain data; there is exactly one row in V1
 *     and it is required for any subsequent insert to satisfy the tenant FK.
 *   - Reading from JSON would push the value into a file that is itself
 *     hardcoded in the same repo — adding indirection without flexibility.
 *   - When Phase 2 adds `tw` / `sg`, the addition is a one-line change here
 *     plus an entry in the {@link tenants} array.
 *
 * Phase 1 will add a second seed (broker list scraped from SFC public data)
 * that DOES read from `seed/data/sfc-brokers.json` — that's the right
 * pattern for domain data.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      // `update` is intentionally narrow: a seed re-run should NOT clobber
      // values an operator changed via admin tooling. Only name/locale/tz
      // (the bootstrap defaults) get refreshed; `isActive` is left untouched.
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

const main = async (): Promise<void> => {
  console.log('Seeding @opentrade/db...');
  console.log('• Tenants');
  await seedTenants();
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
