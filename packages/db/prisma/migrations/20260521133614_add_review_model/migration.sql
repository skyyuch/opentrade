-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "contentHash" TEXT NOT NULL,
    "ipfsCid" TEXT,
    "chainReviewId" INTEGER,
    "txHash" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_tenantId_brokerId_createdAt_idx" ON "reviews"("tenantId", "brokerId", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_tenantId_userId_idx" ON "reviews"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "reviews_tenantId_status_idx" ON "reviews"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
