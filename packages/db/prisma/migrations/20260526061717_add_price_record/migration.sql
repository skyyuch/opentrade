-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('CHAINLINK', 'YAHOO_FINANCE', 'MANUAL');

-- CreateTable
CREATE TABLE "price_records" (
    "id" UUID NOT NULL,
    "symbol" VARCHAR(30) NOT NULL,
    "source" "PriceSource" NOT NULL,
    "open" DECIMAL(20,8) NOT NULL,
    "high" DECIMAL(20,8) NOT NULL,
    "low" DECIMAL(20,8) NOT NULL,
    "close" DECIMAL(20,8) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_records_symbol_source_timestamp_key" ON "price_records"("symbol", "source", "timestamp");

-- CreateIndex
CREATE INDEX "price_records_symbol_timestamp_idx" ON "price_records"("symbol", "timestamp");
