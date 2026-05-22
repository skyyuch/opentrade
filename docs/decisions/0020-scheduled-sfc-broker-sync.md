# ADR-0020: Scheduled SFC Broker Sync

## Status

Accepted

## Date

2026-05-22

## Context

OpenTrade Phase 1 pre-loads Hong Kong SFC licensed securities brokers from the public register so users see broker profiles even before any reviews are submitted (roadmap §1.4 "預載資料"). The SFC register is not static — new corporations receive licences, existing licences get revoked or varied. Without periodic sync, the platform would go stale within weeks.

Key questions:

1. How to keep broker data current after the initial seed
2. Where to run the scheduled sync (Lambda vs ECS Scheduled Task vs GitHub Actions cron)
3. How often to sync
4. How to handle the SFC API being undocumented and potentially unstable

## Decision

### D1: ECS Scheduled Task with EventBridge weekly rule

A Fargate task reusing the `apps/api` Docker image (with CMD override to `node dist/sync-sfc.js`) runs every Monday 03:00 HKT. It fetches all licensed corporations from the SFC public register API, then upserts Broker + BrokerLicense rows using the shared `syncBrokers()` function from `packages/db`.

### D2: Weekly frequency (Monday 03:00 HKT)

SFC publishes new licence announcements roughly weekly. Daily sync would add 7x the API load with minimal freshness benefit. Monthly is too stale for a credibility-focused platform. Weekly is the sweet spot.

### D3: Reuse API Docker image with CMD override

The sync entry point (`apps/api/src/tasks/sync-sfc.ts`) is bundled into the same Docker image as the API server. The ECS task definition overrides the container command to `["node", "dist/sync-sfc.js"]`. This avoids maintaining a separate Docker image and CI pipeline.

### D4: SFC data is public and the API is unauthenticated

The SFC public register API (`apps.sfc.hk/publicregWeb/searchByRaJson`) requires no API key or authentication. It is the same endpoint their web UI uses. We add a 300ms delay between requests and identify ourselves with `User-Agent: OpenTrade-SFC-Sync/1.0`.

### D5: Licence lifecycle via status, never delete

When a corporation no longer appears in SFC results for a regulated activity type, we mark the BrokerLicense row `REVOKED` — never delete. This aligns with the project red line of immutable records.

## Alternatives Considered

### A: AWS Lambda + EventBridge

- **Pros**: Cheapest (pay-per-invocation), no container overhead
- **Cons**: Prisma in Lambda is notoriously difficult (binary size, cold start, VPC attachment latency). Would require a separate deployment pipeline. 15-minute timeout could be tight for 360 API requests.
- **Rejected**: Complexity outweighs marginal cost savings. ECS reuses everything we already have.

### B: GitHub Actions scheduled workflow

- **Pros**: Free, simple YAML config, no AWS infrastructure
- **Cons**: GitHub runner cannot reach RDS in a private VPC subnet without a bastion or VPN. Would need to expose DB to the internet or add networking complexity.
- **Rejected**: Security risk (public DB endpoint) or excessive infrastructure (bastion) for a simple data sync.

### C: Manual-only (no automation)

- **Pros**: Zero infrastructure cost
- **Cons**: Relies on a human remembering to run the script. New brokers could be missing for weeks or months. Undermines the platform's credibility promise.
- **Rejected**: Core product promise is accurate, up-to-date data.

## Consequences

### Positive

- Broker data stays current within a 1-week window
- Reuses existing ECS cluster, ECR image, and IAM roles — minimal new infrastructure
- Fargate SPOT pricing makes the cost negligible (~$0.01/month)
- Sync logic is shared between seed and scheduled task — single source of truth

### Negative / Trade-offs

- SFC API is undocumented; endpoint changes could break sync silently
- 360 requests per run (10 RA types x 36 letters) takes ~2 minutes; acceptable for weekly but would need optimisation if frequency increased
- ECS task definition references the ECR image tag; image must be pushed before the task can actually run (resolved when API deployment lands)

### Neutral

- The Terraform module can be `terraform apply`-ed now but the task will fail to run until an image is pushed to ECR with the sync entry point

## Implementation Notes

- Terraform module: `infra/terraform/modules/sfc-sync-task/`
- Security group: egress-all (fetch SFC API), no ingress, added to RDS `client_security_group_ids`
- apps/api tsup config: second entry point `src/tasks/sync-sfc.ts`
- Log stream: same CloudWatch log group as the API (`/opentrade/<prefix>/ecs`)
- Phase 2+ considerations: add Slack/email notification on sync failure; add diff report (new brokers, revoked licences)

## References

- SFC Public Register: `https://apps.sfc.hk/publicregWeb/searchByRaJson`
- SFC Register legal notice: data is for verifying licensed person status only
- `packages/db/src/sfc/sync-brokers.ts` — shared sync logic
- `packages/db/scripts/fetch-sfc-brokers.ts` — offline fetcher
- ADR-0017: Terraform IaC structure
- Rule 80: AWS accounts operational standards
- Rule 81: Terraform IaC standards
