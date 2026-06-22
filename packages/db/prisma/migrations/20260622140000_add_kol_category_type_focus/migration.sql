-- CreateEnum
CREATE TYPE "KolType" AS ENUM ('FINANCIAL_KOL', 'INDICATOR_VENDOR');

-- CreateEnum
CREATE TYPE "KolFocus" AS ENUM ('EQUITY', 'CRYPTO', 'FOREX');

-- AlterTable
ALTER TABLE "kols" ADD COLUMN     "focus" "KolFocus",
ADD COLUMN     "type" "KolType";

-- CreateIndex
CREATE INDEX "kols_tenantId_type_idx" ON "kols"("tenantId", "type");

-- CreateIndex
CREATE INDEX "kols_tenantId_focus_idx" ON "kols"("tenantId", "focus");
