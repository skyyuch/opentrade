-- Backfill the user_verified_brokers ledger from existing APPROVED rows
-- in sbt_verification_requests. The ADR-0025 Phase-1 schema only started
-- writing this table from the new approve handler onwards, so any user
-- whose verification was approved BEFORE that handler shipped is missing
-- from the canonical broker list and disappears from /settings,
-- /admin/users, broker counts, review-card badges, etc.
--
-- Idempotent by (verificationId) — the unique constraint on the new
-- table makes ON CONFLICT a safe no-op when this migration is re-run
-- against a partially-backfilled DB. Per ADR-0025 D5 we do NOT emit
-- outbox events for these backfills: those events are an audit-trail
-- for runtime approves, not a data-recovery hook, and the worker would
-- otherwise spam stale `verification.broker_added` notifications.
INSERT INTO user_verified_brokers (
  "id",
  "tenantId",
  "userId",
  "brokerSlug",
  "verificationId",
  "commitment",
  "approvedAt"
)
SELECT
  gen_random_uuid(),
  "tenantId",
  "userId",
  "brokerSlug",
  "id",
  "commitment",
  COALESCE("reviewedAt", "createdAt")
FROM sbt_verification_requests
WHERE status = 'APPROVED'
ON CONFLICT ("verificationId") DO NOTHING;
