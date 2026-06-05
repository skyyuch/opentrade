-- CreateEnum
CREATE TYPE "BrokerCategory" AS ENUM ('SECURITIES', 'BULLION');

-- AlterEnum
ALTER TYPE "LicenseType" ADD VALUE 'HK_CGSE_MEMBER';

-- AlterEnum
ALTER TYPE "Regulator" ADD VALUE 'HK_CGSE';

-- AlterTable
ALTER TABLE "brokers" ADD COLUMN     "category" "BrokerCategory" NOT NULL DEFAULT 'SECURITIES';

-- CreateIndex
CREATE INDEX "brokers_tenantId_category_idx" ON "brokers"("tenantId", "category");
