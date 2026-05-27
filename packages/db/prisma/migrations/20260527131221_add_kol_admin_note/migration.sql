-- AlterTable
-- Per ADR-0036 D1.1 hybrid registration flow: REJECTED applications must
-- expose the admin moderator's reason on the applicant's /become-a-kol and
-- /kol/onboarding pages so the user can understand and resubmit. The
-- column is nullable (no UPDATE in this migration per rule 31 "Migration
-- 內含資料遷移" red line — existing REJECTED rows simply read NULL).
ALTER TABLE "kols" ADD COLUMN "adminNote" TEXT;
