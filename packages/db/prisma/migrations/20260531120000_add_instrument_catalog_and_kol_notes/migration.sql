-- Instrument catalog + KOL analyst notes (ADR-0038 + ADR-0039).
--
-- NOTE: This migration is intentionally scoped to ONLY the two new features.
-- `prisma migrate diff` also surfaced an unrelated, pre-existing drift line
-- (`ALTER TABLE "notifications" ALTER COLUMN "id" DROP DEFAULT`) that predates
-- this change; it is deliberately NOT included here so this migration stays
-- atomic to the feature (per rule 70/96). That drift should be resolved in a
-- separate, dedicated migration.
--
-- Postgres 16 applies `ALTER TYPE ... ADD VALUE` inside the migration's
-- transaction safely here because the new enum values are not *used* (no data
-- inserts) within the same transaction — only the type is widened.

-- AlterEnum: append-only so positions 0-5 (the on-chain uint8 mapping) stay stable.
ALTER TYPE "AssetClass" ADD VALUE 'INDEX';
ALTER TYPE "AssetClass" ADD VALUE 'COMMODITY';

-- AlterTable
ALTER TABLE "signals" ADD COLUMN     "instrumentId" UUID;

-- CreateTable
CREATE TABLE "instruments" (
    "id" UUID NOT NULL,
    "category" "AssetClass" NOT NULL,
    "symbol" TEXT NOT NULL,
    "displayCode" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameZh" TEXT,
    "nameZhHans" TEXT,
    "exchange" TEXT,
    "source" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kol_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kolId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "bodyJson" JSONB NOT NULL,
    "imageCids" TEXT[],
    "linkedSignalId" UUID,
    "contentHash" TEXT NOT NULL,
    "ipfsCid" TEXT,
    "chainNoteId" INTEGER,
    "chainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kol_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instruments_category_isActive_idx" ON "instruments"("category", "isActive");

-- CreateIndex
CREATE INDEX "instruments_category_displayCode_idx" ON "instruments"("category", "displayCode");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_category_symbol_key" ON "instruments"("category", "symbol");

-- CreateIndex
CREATE INDEX "kol_notes_tenantId_kolId_createdAt_idx" ON "kol_notes"("tenantId", "kolId", "createdAt");

-- CreateIndex
CREATE INDEX "kol_notes_tenantId_linkedSignalId_idx" ON "kol_notes"("tenantId", "linkedSignalId");

-- CreateIndex
CREATE INDEX "signals_instrumentId_idx" ON "signals"("instrumentId");

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kol_notes" ADD CONSTRAINT "kol_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kol_notes" ADD CONSTRAINT "kol_notes_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "kols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kol_notes" ADD CONSTRAINT "kol_notes_linkedSignalId_fkey" FOREIGN KEY ("linkedSignalId") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
