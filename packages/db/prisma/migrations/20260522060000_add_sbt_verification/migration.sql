-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "sbtTokenId" INTEGER,
ADD COLUMN "sbtMintTxHash" TEXT;

-- CreateTable
CREATE TABLE "sbt_verification_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "brokerSlug" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "evidenceIpfsCid" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "sbt_verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sbt_verification_requests_tenantId_status_idx" ON "sbt_verification_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sbt_verification_requests_tenantId_userId_idx" ON "sbt_verification_requests"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "sbt_verification_requests" ADD CONSTRAINT "sbt_verification_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sbt_verification_requests" ADD CONSTRAINT "sbt_verification_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
