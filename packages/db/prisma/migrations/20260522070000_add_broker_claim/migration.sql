-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "brokers" ADD COLUMN "claimedByUserId" UUID;

-- CreateTable
CREATE TABLE "broker_claim_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ceRefNumber" TEXT NOT NULL,
    "companyLetterIpfsCid" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "broker_claim_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broker_claim_requests_tenantId_status_idx" ON "broker_claim_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "broker_claim_requests_tenantId_brokerId_idx" ON "broker_claim_requests"("tenantId", "brokerId");

-- AddForeignKey
ALTER TABLE "broker_claim_requests" ADD CONSTRAINT "broker_claim_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_claim_requests" ADD CONSTRAINT "broker_claim_requests_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
