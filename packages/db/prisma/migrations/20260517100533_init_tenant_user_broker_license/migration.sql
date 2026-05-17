-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'REVIEWER', 'JURY', 'ADMIN');

-- CreateEnum
CREATE TYPE "SbtTier" AS ENUM ('L1', 'L2', 'L3', 'L4');

-- CreateEnum
CREATE TYPE "Regulator" AS ENUM ('HK_SFC');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('HK_SFC_TYPE_1', 'HK_SFC_TYPE_2', 'HK_SFC_TYPE_3', 'HK_SFC_TYPE_4', 'HK_SFC_TYPE_5', 'HK_SFC_TYPE_6', 'HK_SFC_TYPE_7', 'HK_SFC_TYPE_8', 'HK_SFC_TYPE_9', 'HK_SFC_TYPE_10');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultLocale" TEXT NOT NULL DEFAULT 'zh-Hant',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Hong_Kong',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "privyId" TEXT NOT NULL,
    "walletAddress" TEXT,
    "email" TEXT,
    "displayName" TEXT,
    "preferredLocale" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "sbtTier" "SbtTier" NOT NULL DEFAULT 'L1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brokers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "brokers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_licenses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "regulator" "Regulator" NOT NULL,
    "licenseType" "LicenseType" NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "broker_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "users"("walletAddress");

-- CreateIndex
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE INDEX "users_tenantId_sbtTier_idx" ON "users"("tenantId", "sbtTier");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_privyId_key" ON "users"("tenantId", "privyId");

-- CreateIndex
CREATE INDEX "brokers_tenantId_isClaimed_idx" ON "brokers"("tenantId", "isClaimed");

-- CreateIndex
CREATE INDEX "brokers_tenantId_legalName_idx" ON "brokers"("tenantId", "legalName");

-- CreateIndex
CREATE UNIQUE INDEX "brokers_tenantId_slug_key" ON "brokers"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "broker_licenses_tenantId_brokerId_idx" ON "broker_licenses"("tenantId", "brokerId");

-- CreateIndex
CREATE INDEX "broker_licenses_tenantId_status_idx" ON "broker_licenses"("tenantId", "status");

-- CreateIndex
CREATE INDEX "broker_licenses_tenantId_regulator_licenseType_idx" ON "broker_licenses"("tenantId", "regulator", "licenseType");

-- CreateIndex
CREATE UNIQUE INDEX "broker_licenses_tenantId_regulator_licenseNumber_key" ON "broker_licenses"("tenantId", "regulator", "licenseNumber");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_licenses" ADD CONSTRAINT "broker_licenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_licenses" ADD CONSTRAINT "broker_licenses_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
