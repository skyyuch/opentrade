-- CreateEnum
CREATE TYPE "ReviewKind" AS ENUM ('REVIEW', 'COMPLAINT');

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "evidenceIpfsCid" TEXT,
ADD COLUMN     "kind" "ReviewKind" NOT NULL DEFAULT 'REVIEW',
ADD COLUMN     "respondsToReviewId" UUID,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedByUserId" UUID;

-- CreateIndex
CREATE INDEX "reviews_tenantId_brokerId_kind_verifiedAt_idx" ON "reviews"("tenantId", "brokerId", "kind", "verifiedAt");
