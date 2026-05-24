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

const backfill = async (): Promise<BackfillResult> => {
  const result: BackfillResult = {
    processed: 0,
    converted: 0,
    skipped: 0,
    failed: 0,
  };

  // Stream brokers in pages so memory stays flat on large datasets.
  //
  // We deliberately do NOT use cursor pagination here. Because the WHERE
  // clause filters on the column we're about to update, every successful
  // update shrinks the result set monotonically. Re-issuing the same
  // "first N rows where displayNameZhHans IS NULL" query gives us the
  // next slice — there's no risk of repeats and no need to track a
  // cursor (which itself becomes stale once we update past it). A
  // skipped row (e.g. empty displayName → null conversion) would loop
  // forever, so we break out of the loop if we've processed a full page
  // without making progress.
  type BrokerPage = { id: string; slug: string; displayName: string }[];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- break-driven page loop; exit condition is page.length === 0 (or stall guard)
  while (true) {
    const page: BrokerPage = await prisma.broker.findMany({
      where: { displayNameZhHans: null },
      select: { id: true, slug: true, displayName: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (page.length === 0) break;

    const populatedBefore = result.converted;

    for (const broker of page) {
      result.processed++;
      try {
        const converted = toSimplifiedChinese(broker.displayName);
        if (converted === null) {
          result.skipped++;
          continue;
        }
        await prisma.broker.update({
          where: { id: broker.id },
          data: { displayNameZhHans: converted },
        });
        result.converted++;
      } catch (err) {
        result.failed++;
        console.error(`  ✗ slug=${broker.slug} id=${broker.id}: ${(err as Error).message}`);
      }
    }

    // Stall guard: if a full page came back but nothing was converted,
    // every row in it was a `skipped` (or `failed`) candidate. Those
    // rows will keep returning on the next query, so we'd loop forever.
    // The same row count was already added to `skipped`/`failed`, so we
    // can safely terminate.
    if (result.converted === populatedBefore) break;

    console.log(`  ... processed ${result.processed} so far`);
  }

  return result;
};

const main = async (): Promise<void> => {
  console.log('Backfilling Broker.displayNameZhHans...');
  const result = await backfill();
  console.log(`  processed: ${result.processed} brokers`);
  console.log(`  converted: ${result.converted}`);
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
