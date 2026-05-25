/**
 * Broker-level sentiment distribution.
 *
 * Per ADR-0028 D7 the canonical broker-level verdict surfaced on the
 * detail page is the three-bucket sentiment distribution
 * (POSITIVE / NEUTRAL / NEGATIVE), with pre-backfill / unmappable null
 * rows excluded so the historical window does not skew the chart. The
 * composite index `[tenantId, brokerId, sentiment]` added in M3.1 means
 * the in-memory filter below counts off the same indexed range the
 * caller already scanned for the rating select — no extra query.
 *
 * Extracted from `presentation/routes.ts` (M6.1) so the calculation can
 * be tested as a pure function with table-driven cases instead of being
 * coupled to Prisma and Hono lifecycle. The route handler now imports
 * and delegates; the only behaviour change is "easier to test".
 *
 * Stays in `domain/` rather than `application/` because it has zero
 * orchestration (no I/O, no error envelope) — it is a pure value-object
 * derivation, the same layer as {@link ReviewEntity}.
 */

import type { ReviewSentiment } from '../../reviews/domain/ReviewEntity.js';

/**
 * Three-bucket count returned alongside the legacy
 * {@link import('../presentation/routes.js').ratingDistribution}. Each
 * field is the number of reviews whose `sentiment` column equals the
 * matching {@link ReviewSentiment} verdict.
 */
export type SentimentAggregate = {
  positive: number;
  neutral: number;
  negative: number;
};

/**
 * Shape accepted by {@link aggregateSentiment}. The caller projects each
 * review to just its sentiment column; nullable per ADR-0028 D1 +
 * the {@link import('../../reviews/domain/ReviewEntity.js').ReviewRecord}
 * contract.
 *
 * Typed as `string | null` rather than `ReviewSentiment | null` because
 * Prisma's runtime enum value comes through as `string` on the wire
 * boundary — the helper guards against unknown / null values so callers
 * do not need to narrow first.
 */
export type SentimentSlice = {
  readonly sentiment: string | null;
};

/**
 * Count reviews by sentiment bucket.
 *
 * Behaviour notes:
 *   - `null` sentiment rows are excluded from every bucket (per ADR-0028
 *     D1 + D7) so the pre-backfill window does not falsely inflate any
 *     verdict.
 *   - Unknown string values (anything outside POSITIVE / NEUTRAL /
 *     NEGATIVE) are also excluded — they should never appear in
 *     production because the Prisma enum constrains writes, but the
 *     defensive check guarantees the return object always sums to
 *     `≤ input.length` for any input.
 *   - Empty input returns `{ positive: 0, neutral: 0, negative: 0 }`.
 */
export const aggregateSentiment = (reviews: readonly SentimentSlice[]): SentimentAggregate => ({
  positive: reviews.filter((r) => r.sentiment === ('POSITIVE' satisfies ReviewSentiment)).length,
  neutral: reviews.filter((r) => r.sentiment === ('NEUTRAL' satisfies ReviewSentiment)).length,
  negative: reviews.filter((r) => r.sentiment === ('NEGATIVE' satisfies ReviewSentiment)).length,
});
