/**
 * One-shot data migration: populate `Review.sourceLocale` for rows that
 * predate ADR-0027 by best-effort character analysis.
 *
 * Why this script exists (per ADR-0027 D8):
 *   - Before ADR-0027 the column was meant to be filled by DeepL auto-
 *     detection on submit, but `DEEPL_API_KEY` was never set in Phase 1
 *     so the column is null for every row created before ADR-0027 D2
 *     landed.
 *   - ADR-0027 D6 wires a per-card "source language" badge on the
 *     ReviewCard. The badge is suppressed when sourceLocale is null,
 *     which is fine for the long tail but reads as inconsistent on the
 *     first few legacy rows visible right at the top of every broker
 *     page. This script fixes those.
 *
 * Detection (deliberately conservative):
 *   - Han ratio < 0.30  → 'en'        (predominantly Latin script)
 *   - Han ratio >= 0.30 AND OpenCC t→cn output equals the input
 *                       → 'zh-Hans'   (input was already Simplified)
 *   - Han ratio >= 0.30 AND OpenCC t→cn output differs from the input
 *                       → 'zh-Hant'   (input had Traditional-only chars)
 *
 *   The 0.30 threshold tolerates "mixed CJK + roman digit / brand /
 *   ticker" content while still classifying token-heavy Chinese reviews
 *   correctly. The OpenCC round-trip discriminates Hant vs Hans because
 *   characters that exist identically in both scripts (e.g. 「股票」)
 *   stay untouched, while a Traditional-only character (e.g. 「賺」)
 *   gets rewritten (→「赚」).
 *
 *   Edge case: a review written entirely in characters that are shared
 *   between Hans and Hant will be classified as `zh-Hans`. This is
 *   acceptable because (a) such content is legible in both locales, so
 *   the badge is informative either way, and (b) Phase 1 reviewers can
 *   manually correct via admin tooling if it ever matters.
 *
 * Idempotency:
 *   - Only touches rows where `sourceLocale IS NULL`.
 *   - Re-runs after an OpenCC dictionary upgrade or threshold change
 *     require explicit `UPDATE reviews SET "sourceLocale" = NULL WHERE ...`
 *     first.
 *   - Uses the same mutable-WHERE plus stall-guard pattern as
 *     `backfill-zh-hans.ts` (see that script's comments for the rationale)
 *     to keep the loop safe when every row in a page is unclassifiable.
 *
 * Run via:
 *   pnpm --filter @opentrade/db db:backfill:source-locale
 *   pnpm --filter @opentrade/db db:backfill:source-locale -- --dry-run
 *
 * `--dry-run` runs the classifier against every NULL row but does not
 * write to the DB. Use it before production to verify the OpenCC +
 * Han-ratio heuristic against the actual review distribution.
 *
 * Output:
 *   Backfilling Review.sourceLocale...
 *     processed: 2 reviews
 *     zh-Hant:   1
 *     zh-Hans:   0
 *     en:        1
 *     failed:    0
 *   Done.
 */

import { PrismaClient } from '@prisma/client';

import { toSimplifiedChinese } from '../src/sfc/opencc.js';

const prisma = new PrismaClient();

const HAN_RATIO_THRESHOLD = 0.3;
const BATCH_SIZE = 200;

const DRY_RUN = process.argv.includes('--dry-run');

// CJK Unified Ideographs Basic block (U+4E00–U+9FFF) plus Extension A
// (U+3400–U+4DBF). Covers every character a Phase 1 review is likely to
// hit; Extension B+ (rare archaic / variant glyphs above U+20000) is
// excluded on purpose so a single exotic character doesn't tip a
// majority-Latin review into the CJK bucket.
const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF]/g;

type Locale = 'zh-Hant' | 'zh-Hans' | 'en';

type BackfillCounters = {
  processed: number;
  zhHant: number;
  zhHans: number;
  en: number;
  failed: number;
};

const detectLocale = (title: string, body: string): Locale => {
  const text = `${title} ${body}`.trim();
  if (text === '') return 'en';

  const hanMatches = text.match(HAN_RE);
  const hanCount = hanMatches?.length ?? 0;
  const ratio = hanCount / text.length;

  if (ratio < HAN_RATIO_THRESHOLD) return 'en';

  const simplified = toSimplifiedChinese(text);
  if (simplified === null) return 'en';

  return simplified === text ? 'zh-Hans' : 'zh-Hant';
};

const backfill = async (): Promise<BackfillCounters> => {
  const counters: BackfillCounters = {
    processed: 0,
    zhHant: 0,
    zhHans: 0,
    en: 0,
    failed: 0,
  };

  type ReviewPage = { id: string; title: string; body: string }[];

  let lastSeenId: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- break-driven page loop; exit condition is page.length === 0. Cursor advancement makes both dry-run and live modes correct (see backfill-zh-hans.ts for the same rationale).
  while (true) {
    const page: ReviewPage = await prisma.review.findMany({
      where: {
        sourceLocale: null,
        ...(lastSeenId !== null ? { id: { gt: lastSeenId } } : {}),
      },
      select: { id: true, title: true, body: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (page.length === 0) break;

    for (const review of page) {
      try {
        const locale = detectLocale(review.title, review.body);
        if (!DRY_RUN) {
          await prisma.review.update({
            where: { id: review.id },
            data: { sourceLocale: locale },
          });
        }
        counters.processed++;
        if (locale === 'zh-Hant') counters.zhHant++;
        else if (locale === 'zh-Hans') counters.zhHans++;
        else counters.en++;
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
  console.log(`Backfilling Review.sourceLocale${DRY_RUN ? ' (DRY RUN — no DB writes)' : ''}...`);
  const result = await backfill();
  console.log(
    `  processed: ${result.processed} reviews${DRY_RUN ? '  (would have been written)' : ''}`,
  );
  console.log(`  zh-Hant:   ${result.zhHant}`);
  console.log(`  zh-Hans:   ${result.zhHans}`);
  console.log(`  en:        ${result.en}`);
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
