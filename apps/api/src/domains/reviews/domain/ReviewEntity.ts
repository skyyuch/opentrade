/**
 * Domain types for the reviews bounded context.
 *
 * These are pure value objects / entity shapes used by the application layer.
 * They mirror the Prisma Review model but are decoupled from Prisma-specific
 * types so the domain layer has zero infrastructure imports.
 */

export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export type ReviewStatusValue = 'PENDING' | 'CONFIRMED' | 'FAILED';

export type SubmitReviewInput = {
  tenantId: string;
  userId: string;
  brokerId: string;
  title: string;
  body: string;
  rating: ReviewRating;
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
  createdAt: Date;
  updatedAt: Date;
};
