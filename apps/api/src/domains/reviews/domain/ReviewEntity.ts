/**
 * Domain types for the reviews bounded context.
 *
 * These are pure value objects / entity shapes used by the application layer.
 * They mirror the Prisma Review model but are decoupled from Prisma-specific
 * types so the domain layer has zero infrastructure imports.
 */

export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export type ReviewStatusValue = 'PENDING' | 'CONFIRMED' | 'FAILED';

/**
 * The locale the author was browsing in when they submitted the review.
 *
 * Per ADR-0027 (supersedes ADR-0023): we ship reviews as author-original
 * and no longer machine-translate at submit time. `sourceLocale` was added
 * to {@link SubmitReviewInput} so the value reflects author intent
 * (frontend next-intl locale or `Accept-Language` fallback) rather than
 * DeepL auto-detection, and so the ReviewCard can render a badge telling
 * readers which language the original was written in.
 */
export type ReviewSourceLocale = 'zh-Hant' | 'zh-Hans' | 'en';

/**
 * Three-way sentiment per ADR-0028 D1 — the canonical post-Phase-1.5
 * review verdict axis. Mirrors the Prisma `Sentiment` enum at the type
 * level so this domain file keeps its zero-infrastructure-import
 * discipline (rule 10): we never reach into `@prisma/client` runtime
 * values from the domain layer.
 *
 * Lifecycle (per ADR-0028 D4 + D6):
 *   - M4.1 (this commit): added as **optional** on {@link SubmitReviewInput}
 *     so the domain layer can land without forcing the presentation +
 *     application layers to refactor in the same commit.
 *   - M4.3: zod body schema on `POST /v1/reviews` collapses to **required**
 *     once the IPFS-v2 + rating-derivation pieces in M4.2 are in place.
 *   - {@link ReviewRecord}.sentiment stays nullable forever — legacy rows
 *     created before the M3.2 backfill (or rows the backfill could not
 *     map) carry `null`, and the UI surfaces a caption derived from
 *     `rating` per ADR-0028 D7 instead of fabricating a value.
 */
export type ReviewSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export type SubmitReviewInput = {
  tenantId: string;
  userId: string;
  brokerId: string;
  title: string;
  body: string;
  /**
   * Optional per ADR-0028 D4. Web form omits `rating` after M5; the
   * use case synthesises a legacy value from `sentiment` (reverse of
   * the M3.2 backfill table) so the deprecated `rating` column on
   * `Review` (NOT NULL until the Release-N+2 drop migration) and the
   * v2 IPFS payload's backward-compat `rating` field always carry a
   * value.
   */
  rating?: ReviewRating;
  /**
   * Required per ADR-0028 D4 — the canonical Phase-1.5+ review axis.
   * The zod body schema on `POST /v1/reviews` enforces this at the
   * API boundary; callers within `apps/api` must construct the input
   * with sentiment populated.
   */
  sentiment: ReviewSentiment;
  sourceLocale: ReviewSourceLocale;
};

export type ReviewRecord = {
  id: string;
  tenantId: string;
  userId: string;
  brokerId: string;
  contentHash: string;
  ipfsCid: string | null;
  chainReviewId: number | null;
  txHash: string | null;
  title: string;
  body: string;
  rating: number;
  status: ReviewStatusValue;
  /**
   * Nullable per ADR-0028 D1 + D7. `null` means the row pre-dates the
   * M3.2 backfill or was unmappable; consumers must not synthesise a
   * value and instead show the historical `rating`-derived caption.
   */
  sentiment: ReviewSentiment | null;
  sourceLocale: ReviewSourceLocale | null;
  createdAt: Date;
  updatedAt: Date;
};
