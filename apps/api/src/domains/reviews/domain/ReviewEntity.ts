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

export type SubmitReviewInput = {
  tenantId: string;
  userId: string;
  brokerId: string;
  title: string;
  body: string;
  rating: ReviewRating;
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
  sourceLocale: ReviewSourceLocale | null;
  createdAt: Date;
  updatedAt: Date;
};
