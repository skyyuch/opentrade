-- CreateEnum
CREATE TYPE "EconomicRegion" AS ENUM ('US', 'HK', 'CN');

-- CreateEnum
CREATE TYPE "EconomicCategory" AS ENUM ('INFLATION', 'GROWTH', 'EMPLOYMENT', 'RATE_DECISION', 'TRADE', 'OTHER');

-- CreateTable
CREATE TABLE "economic_events" (
    "id" UUID NOT NULL,
    "indicatorCode" VARCHAR(60) NOT NULL,
    "nameZhHant" VARCHAR(200) NOT NULL,
    "nameZhHans" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200) NOT NULL,
    "region" "EconomicRegion" NOT NULL,
    "category" "EconomicCategory" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "periodLabel" VARCHAR(40) NOT NULL,
    "previousValue" DECIMAL(20,4),
    "actualValue" DECIMAL(20,4),
    "unit" VARCHAR(20) NOT NULL,
    "sourceName" VARCHAR(120) NOT NULL,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "economic_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "economic_events_indicatorCode_periodLabel_key" ON "economic_events"("indicatorCode", "periodLabel");

-- CreateIndex
CREATE INDEX "economic_events_scheduledAt_idx" ON "economic_events"("scheduledAt");

-- CreateIndex
CREATE INDEX "economic_events_region_category_idx" ON "economic_events"("region", "category");
