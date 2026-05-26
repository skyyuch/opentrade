-- CreateEnum
CREATE TYPE "KolStatus" AS ENUM ('UNCLAIMED', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY_HK', 'EQUITY_US', 'FUTURES', 'SPOT', 'FOREX', 'CRYPTO');

-- CreateEnum
CREATE TYPE "SignalDirection" AS ENUM ('BUY', 'SELL', 'HOLD');

-- CreateEnum
CREATE TYPE "SignalOutcome" AS ENUM ('ACTIVE', 'HIT_TARGET', 'HIT_DIRECTION', 'STOPPED', 'EXPIRED', 'UNRESOLVED');

-- CreateTable
CREATE TABLE "kols" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "status" "KolStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "socialLinks" JSONB,
    "credentials" JSONB,
    "iamSmartVerified" BOOLEAN NOT NULL DEFAULT false,
    "kolSbtTokenId" INTEGER,
    "kolSbtMintTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "kols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kolId" UUID NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" "SignalDirection" NOT NULL,
    "entryPrice" DECIMAL(20,8) NOT NULL,
    "targetPrice" DECIMAL(20,8) NOT NULL,
    "stoplossPrice" DECIMAL(20,8),
    "horizon" SMALLINT NOT NULL,
    "note" VARCHAR(500),
    "outcome" "SignalOutcome" NOT NULL DEFAULT 'ACTIVE',
    "settledAt" TIMESTAMP(3),
    "settlePrice" DECIMAL(20,8),
    "periodHigh" DECIMAL(20,8),
    "periodLow" DECIMAL(20,8),
    "contentHash" TEXT NOT NULL,
    "ipfsCid" TEXT,
    "chainSignalId" INTEGER,
    "chainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kol_follows" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kolId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kol_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kols_slug_key" ON "kols"("slug");

-- CreateIndex
CREATE INDEX "kols_tenantId_status_idx" ON "kols"("tenantId", "status");

-- CreateIndex
CREATE INDEX "kols_tenantId_userId_idx" ON "kols"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "signals_tenantId_kolId_createdAt_idx" ON "signals"("tenantId", "kolId", "createdAt");

-- CreateIndex
CREATE INDEX "signals_tenantId_outcome_idx" ON "signals"("tenantId", "outcome");

-- CreateIndex
CREATE INDEX "signals_tenantId_symbol_idx" ON "signals"("tenantId", "symbol");

-- CreateIndex
CREATE INDEX "signals_tenantId_assetClass_idx" ON "signals"("tenantId", "assetClass");

-- CreateIndex
CREATE INDEX "kol_follows_kolId_idx" ON "kol_follows"("kolId");

-- CreateIndex
CREATE UNIQUE INDEX "kol_follows_userId_kolId_key" ON "kol_follows"("userId", "kolId");

-- AddForeignKey
ALTER TABLE "kols" ADD CONSTRAINT "kols_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kols" ADD CONSTRAINT "kols_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "kols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kol_follows" ADD CONSTRAINT "kol_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kol_follows" ADD CONSTRAINT "kol_follows_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "kols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
