/**
 * One-shot data migration: rename legacy bullion-dealer slugs from
 * `cgse-{memberCode}` to `hkgx-{memberCode}` (ADR-0050 rebrand, ADR-0051).
 *
 * Why this script exists:
 *   - The HKGX rebrand (ADR-0050) renamed the registry source CGSE → HKGX.
 *     The enum labels were handled by an in-place migration
 *     (`20260621090000_rename_cgse_to_hkgx`), but the broker `slug` is a data
 *     value the enum rename does not touch.
 *   - Fresh environments never need this: the seed data
 *     (`seed-data/hkgx-members.json`) already uses `hkgx-{code}` slugs, so a
 *     from-scratch seed produces correct slugs. Only databases seeded BEFORE
 *     the rebrand (local dev + UAT) carry `cgse-{code}` slugs.
 *   - Per cursor rule 31, a pure data transform belongs in an idempotent
 *     backfill script (NOT inline `UPDATE` in a migration). Run it once
 *     against any pre-rebrand database; the automated migrate gate (ADR-0051)
 *     does not run it — seeds and backfills stay explicit (ADR-0049, D3).
 *
 * Transform:
 *   - For every broker whose slug starts with `cgse-`, replace that 5-char
 *     prefix with `hkgx-`, keeping the member code intact
 *     (`cgse-055` → `hkgx-055`). This aligns existing rows with fresh seeds
 *     and with the sync upsert key, so future idempotent upserts UPDATE the
 *     same row instead of INSERTing a duplicate.
 *
 * Idempotency:
 *   - Only touches rows whose slug still starts with `cgse-`; a second run
 *     finds none and is a no-op. Cursor pagination (`id > lastSeenId`)
 *     advances strictly, so both LIVE and DRY_RUN terminate correctly.
 *
 * Run via:
 *   pnpm --filter @opentrade/db db:backfill:bullion-slugs
 *   pnpm --filter @opentrade/db db:backfill:bullion-slugs -- --dry-run
 *
 * In-VPC (UAT private RDS) via the migrate task command override (ADR-0049):
 *   aws ecs run-task ... --overrides '{"containerOverrides":[{"name":"migrate",
 *     "command":["sh","-c","pnpm exec tsx scripts/backfill-bullion-slugs.ts"]}]}'
 */

import { prisma } from '../src/index.js';

const BATCH_SIZE = 200;
const LEGACY_PREFIX = 'cgse-';
const NEW_PREFIX = 'hkgx-';

const DRY_RUN = process.argv.includes('--dry-run');

type BackfillCounters = {
  processed: number;
  renamed: number;
  failed: number;
};

const backfill = async (): Promise<BackfillCounters> => {
  const counters: BackfillCounters = { processed: 0, renamed: 0, failed: 0 };

  type BrokerPage = { id: string; slug: string }[];

  let lastSeenId: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- break-driven page loop; exit condition is page.length === 0. Cursor advancement keeps both dry-run and live modes correct (cursor rule 31 §Backfill).
  while (true) {
    const page: BrokerPage = await prisma.broker.findMany({
      where: {
        slug: { startsWith: LEGACY_PREFIX },
        ...(lastSeenId !== null ? { id: { gt: lastSeenId } } : {}),
      },
      select: { id: true, slug: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (page.length === 0) break;

    for (const broker of page) {
      try {
        const newSlug = `${NEW_PREFIX}${broker.slug.slice(LEGACY_PREFIX.length)}`;
        if (!DRY_RUN) {
          await prisma.broker.update({
            where: { id: broker.id },
            data: { slug: newSlug },
          });
        }
        counters.processed++;
        counters.renamed++;
        console.log(`  ${DRY_RUN ? 'would rename' : 'renamed'} ${broker.slug} -> ${newSlug}`);
      } catch (err) {
        counters.failed++;
        console.error(`  ✗ id=${broker.id} slug=${broker.slug}: ${(err as Error).message}`);
      }
    }

    lastSeenId = page[page.length - 1]?.id ?? lastSeenId;
  }

  return counters;
};

const main = async (): Promise<void> => {
  console.log(
    `Backfilling bullion slugs ${LEGACY_PREFIX}* -> ${NEW_PREFIX}*${DRY_RUN ? ' (DRY RUN — no DB writes)' : ''}...`,
  );
  const result = await backfill();
  console.log(`  processed: ${result.processed}${DRY_RUN ? '  (would have been written)' : ''}`);
  console.log(`  renamed:   ${result.renamed}`);
  console.log(`  failed:    ${result.failed}`);
  console.log('Done.');
};

try {
  await main();
} catch (err) {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
