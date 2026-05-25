-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "sentiment" "Sentiment";

-- CreateIndex
CREATE INDEX "reviews_tenantId_brokerId_sentiment_idx" ON "reviews"("tenantId", "brokerId", "sentiment");
