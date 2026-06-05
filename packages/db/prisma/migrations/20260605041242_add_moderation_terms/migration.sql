-- CreateEnum
CREATE TYPE "ModerationCategory" AS ENUM ('PROFANITY', 'ATTACK', 'CONTACT', 'ILLEGAL');

-- CreateTable
CREATE TABLE "moderation_terms" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "category" "ModerationCategory" NOT NULL,
    "term" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "moderation_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_term_audits" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "actorUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_term_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_terms_tenantId_enabled_category_idx" ON "moderation_terms"("tenantId", "enabled", "category");

-- CreateIndex
CREATE INDEX "moderation_term_audits_tenantId_termId_createdAt_idx" ON "moderation_term_audits"("tenantId", "termId", "createdAt");

-- AddForeignKey
ALTER TABLE "moderation_terms" ADD CONSTRAINT "moderation_terms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_term_audits" ADD CONSTRAINT "moderation_term_audits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
