/**
 * One-shot data migration: populate `Broker.displayNameZhHans` from
 * `Broker.displayName` via OpenCC (Traditional → Simplified Chinese).
 *
 * Why a script and not a Prisma migration:
 *   - Per ADR-0017 we keep structural migrations (DDL) separate from
 *     data migrations (DML on existing rows). The DDL lives in
 *     `prisma/migrations/.../add_broker_display_name_zh_hans/` and the
 *     data transform lives here so it can be (a) re-run safely on
 *     environments that have already been backfilled, (b) skipped when
 *     restoring a snapshot, and (c) audited against OpenCC version
 *     bumps without re-deploying schema.
 *
 * Idempotency:
 *   - The script only touches rows where `displayNameZhHans IS NULL`.
 *   - Running it twice on the same database is a no-op on the second
 *     invocation.
 *   - To re-run the conversion (e.g. after an OpenCC dictionary
 *     upgrade), `UPDATE brokers SET "displayNameZhHans" = NULL;` first.
 *
 * Run via:
 *   pnpm --filter @opentrade/db db:backfill:zh-hans
 *   pnpm --filter @opentrade/db db:backfill:zh-hans -- --dry-run
 *
 * `--dry-run` walks the same rows and runs OpenCC for each, but does
 * not write to the DB. Use it before a production run to size the
 * change and double-check OpenCC output on a fresh deploy.
 *
 * Output:
 *   Backfilling Broker.displayNameZhHans...
 *     processed: 3482 brokers
 *     converted: 3480
 *     skipped:   2  (empty / null displayName)
 *     failed:    0
 *   Done.
 */

import { PrismaClient } from '@prisma/client';

import { toSimplifiedChinese } from '../src/sfc/opencc.js';

const prisma = new PrismaClient();

type BackfillResult = {
  processed: number;
  converted: number;
  skipped: number;
  failed: number;
};

const BATCH_SIZE = 200;

const DRY_RUN = process.argv.includes('--dry-run');

const backfill = async (): Promise<BackfillResult> => {
  const result: BackfillResult = {
    processed: 0,
    converted: 0,
    skipped: 0,
    failed: 0,
  };

  // Stream brokers in pages with cursor-based advancement. The previous
  // approach relied on a mutable WHERE (re-issuing `displayNameZhHans IS
  // NULL` after each page shrank the result set), which works only when
  // every page actually writes. Once `--dry-run` lands the WHERE clause
  // never shrinks, so cursor pagination via `id > lastSeenId` is the
  // single correct strategy for both modes. The stall-guard from the
  // mutable-WHERE era is no longer needed because the cursor strictly
  // moves forward — skipped rows (empty displayName) and failed rows
  // are still advanced past on the next iteration.
  type BrokerPage = { id: string; slug: string; displayName: string }[];

  let lastSeenId: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- break-driven page loop; exit condition is page.length === 0
  while (true) {
    const page: BrokerPage = await prisma.broker.findMany({
      where: {
        displayNameZhHans: null,
        ...(lastSeenId !== null ? { id: { gt: lastSeenId } } : {}),
      },
      select: { id: true, slug: true, displayName: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (page.length === 0) break;

    for (const broker of page) {
      result.processed++;
      try {
        const converted = toSimplifiedChinese(broker.displayName);
        if (converted === null) {
          result.skipped++;
          continue;
        }
        if (!DRY_RUN) {
          await prisma.broker.update({
            where: { id: broker.id },
            data: { displayNameZhHans: converted },
          });
        }
        result.converted++;
      } catch (err) {
        result.failed++;
        console.error(`  ✗ slug=${broker.slug} id=${broker.id}: ${(err as Error).message}`);
      }
    }

    lastSeenId = page[page.length - 1]?.id ?? lastSeenId;

    console.log(`  ... processed ${result.processed} so far`);
  }

  return result;
};

const main = async (): Promise<void> => {
  console.log(
    `Backfilling Broker.displayNameZhHans${DRY_RUN ? ' (DRY RUN — no DB writes)' : ''}...`,
  );
  const result = await backfill();
  console.log(`  processed: ${result.processed} brokers`);
  console.log(`  converted: ${result.converted}${DRY_RUN ? '  (would have been written)' : ''}`);
  console.log(`  skipped:   ${result.skipped}  (empty / null displayName)`);
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
