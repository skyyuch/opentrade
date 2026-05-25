/**
 * One-shot data migration: populate `Review.sentiment` from the legacy
 * 1-5 star `Review.rating` column per ADR-0028 D2.
 *
 * Why this script exists (per ADR-0028 D2):
 *   - The M3.1 migration adds `sentiment` as a nullable column without
 *     touching existing rows (rule 31 「Migration 內含資料遷移」紅線).
 *   - Every `Review` row predating ADR-0028 still has a non-null `rating`
 *     (1-5) but a null `sentiment`. M5.4 / M6 UI surfaces fall back to a
 *     "依五星評分回推為 X" caption when `sentiment` is null, which is
 *     readable but inconsistent. This script backfills every legacy row
 *     so the new `SentimentDistribution` widget renders without holes.
 *
 * Mapping (per ADR-0028 D2 — deliberately coarse):
 *   - rating in {5, 4} → POSITIVE
 *   - rating === 3      → NEUTRAL
 *   - rating in {2, 1} → NEGATIVE
 *   - any other value  → counted as failed (should not happen given the
 *                        SmallInt + 1-5 contract, but we defend in depth)
 *
 *   The mapping is *not* trying to perfectly reconstruct the author's
 *   intent — that would require asking each user to re-classify, which is
 *   out of scope. The original `rating` value is preserved (it stays in
 *   schema for two releases per ADR-0028 D6) so a future ADR could
 *   revisit the mapping.
 *
 * Idempotency:
 *   - Only touches rows where `sentiment IS NULL`. The cursor pagination
 *     advances strictly, so re-running after a partial run picks up
 *     where the last run stopped without revisiting completed rows.
 *   - To redo a previously-mapped row, an operator must explicitly
 *     `UPDATE reviews SET "sentiment" = NULL WHERE id = ...` first.
 *
 * Run via:
 *   pnpm --filter @opentrade/db db:backfill:sentiment
 *   pnpm --filter @opentrade/db db:backfill:sentiment -- --dry-run
 *
 * `--dry-run` walks every NULL row and prints the mapping it would have
 * applied without writing to the DB. Use it before production to verify
 * the rating distribution against the actual review corpus.
 *
 * Output:
 *   Backfilling Review.sentiment...
 *     processed: 5 reviews
 *     POSITIVE:  3
 *     NEUTRAL:   1
 *     NEGATIVE:  1
 *     failed:    0
 *   Done.
 */

import { PrismaClient, Sentiment } from '@prisma/client';

const prisma = new PrismaClient();

const BATCH_SIZE = 200;

const DRY_RUN = process.argv.includes('--dry-run');

type BackfillCounters = {
  processed: number;
  positive: number;
  neutral: number;
  negative: number;
  failed: number;
};

const mapRatingToSentiment = (rating: number): Sentiment | null => {
  if (rating === 5 || rating === 4) return Sentiment.POSITIVE;
  if (rating === 3) return Sentiment.NEUTRAL;
  if (rating === 2 || rating === 1) return Sentiment.NEGATIVE;
  return null;
};

const backfill = async (): Promise<BackfillCounters> => {
  const counters: BackfillCounters = {
    processed: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    failed: 0,
  };

  type ReviewPage = { id: string; rating: number }[];

  let lastSeenId: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- break-driven page loop; exit condition is page.length === 0. Cursor advancement makes both dry-run and live modes correct (see backfill-source-locale.ts for the same rationale).
  while (true) {
    const page: ReviewPage = await prisma.review.findMany({
      where: {
        sentiment: null,
        ...(lastSeenId !== null ? { id: { gt: lastSeenId } } : {}),
      },
      select: { id: true, rating: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (page.length === 0) break;

    for (const review of page) {
      try {
        const sentiment = mapRatingToSentiment(review.rating);
        if (sentiment === null) {
          counters.failed++;
          console.error(`  ✗ id=${review.id}: unmappable rating=${review.rating}`);
          continue;
        }
        if (!DRY_RUN) {
          await prisma.review.update({
            where: { id: review.id },
            data: { sentiment },
          });
        }
        counters.processed++;
        if (sentiment === Sentiment.POSITIVE) counters.positive++;
        else if (sentiment === Sentiment.NEUTRAL) counters.neutral++;
        else counters.negative++;
      } catch (err) {
        counters.failed++;
        console.error(`  ✗ id=${review.id}: ${(err as Error).message}`);
      }
    }

    lastSeenId = page[page.length - 1]?.id ?? lastSeenId;

    console.log(`  ... processed ${counters.processed} so far`);
  }

  return counters;
};

const main = async (): Promise<void> => {
  console.log(`Backfilling Review.sentiment${DRY_RUN ? ' (DRY RUN — no DB writes)' : ''}...`);
  const result = await backfill();
  console.log(
    `  processed: ${result.processed} reviews${DRY_RUN ? '  (would have been written)' : ''}`,
  );
  console.log(`  POSITIVE:  ${result.positive}`);
  console.log(`  NEUTRAL:   ${result.neutral}`);
  console.log(`  NEGATIVE:  ${result.negative}`);
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
