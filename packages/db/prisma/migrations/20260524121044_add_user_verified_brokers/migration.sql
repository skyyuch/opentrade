-- CreateTable
CREATE TABLE "user_verified_brokers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "brokerSlug" TEXT NOT NULL,
    "verificationId" UUID NOT NULL,
    "commitment" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_verified_brokers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_verified_brokers_verificationId_key" ON "user_verified_brokers"("verificationId");

-- CreateIndex
CREATE INDEX "user_verified_brokers_tenantId_userId_idx" ON "user_verified_brokers"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "user_verified_brokers_tenantId_brokerSlug_idx" ON "user_verified_brokers"("tenantId", "brokerSlug");

-- CreateIndex
CREATE UNIQUE INDEX "user_verified_brokers_userId_brokerSlug_key" ON "user_verified_brokers"("userId", "brokerSlug");

-- AddForeignKey
ALTER TABLE "user_verified_brokers" ADD CONSTRAINT "user_verified_brokers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_verified_brokers" ADD CONSTRAINT "user_verified_brokers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_verified_brokers" ADD CONSTRAINT "user_verified_brokers_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "sbt_verification_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique index per ADR-0025 D2: a (userId, brokerSlug) pair can have
-- only one APPROVED verification request. Plain Prisma @@unique cannot
-- express the WHERE clause, so we materialise it as raw SQL.
CREATE UNIQUE INDEX "sbt_verification_requests_user_broker_approved_unique"
  ON "sbt_verification_requests" ("userId", "brokerSlug")
  WHERE "status" = 'APPROVED';
