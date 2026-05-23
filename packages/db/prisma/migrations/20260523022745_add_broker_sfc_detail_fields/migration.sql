-- AlterTable
ALTER TABLE "broker_claim_requests" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "brokers" ADD COLUMN     "addressEn" TEXT,
ADD COLUMN     "addressZh" TEXT,
ADD COLUMN     "ceNumber" TEXT,
ADD COLUMN     "sfcDetailJson" JSONB;

-- AlterTable
ALTER TABLE "review_translations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sbt_verification_requests" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "brokers_ceNumber_idx" ON "brokers"("ceNumber");
