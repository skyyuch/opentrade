# ADR-0056: Compose DATABASE_URL from the RDS-managed secret at container start (amends ADR-0046 D9, ADR-0048)

## Status

Accepted (amends ADR-0046 D9's hand-filled `database-url` slot; relates
ADR-0017 D10, ADR-0047, ADR-0048, ADR-0051). Owner ratified 2026-06-25.

## Date

2026-06-25

## Context

The deployed UAT broker directory (`https://<web>.cloudfront.net/brokers`)
showed a red "Internal server error" box. Investigation on 2026-06-25 found a
recurring, time-bombed failure — **not** a login problem and **not** the
half-deploy class that ADR-0051 fixed:

- The `apps/api` ECS task crash-looped: the ALB health check on `/v1/health`
  returned **503**, ECS killed the task and started a new one, repeatedly.
- CloudWatch showed every DB query failing with Postgres `28P01`
  (`password authentication failed for user "opentrade_admin"`), surfaced by
  Prisma as `P1000` "the provided database credentials ... are not valid".
- Root cause: there are **two** secrets holding the database password, and
  they drifted apart:
  1. The **RDS-managed master user secret** (`rds!db-…`), created because the
     `rds-postgres` module sets `manage_master_user_password = true` (so no
     password ever lands in Terraform state, per ADR-0017 D10 / rule 50). This
     secret has **automatic rotation enabled, every 7 days**.
  2. A separate, **hand-filled** `opentrade/dev/database-url` connection-string
     secret (ADR-0046 D9), which the `api` / `outbox-worker` / `migrate` /
     `sfc-sync` tasks all read as `DATABASE_URL`.
- On 2026-06-25 05:11 UTC+1 RDS auto-rotated the master password (secret #1
  updated); the hand-filled secret #2 kept the old password. ~6 hours later
  every DB call 500'd. This will recur on every 7-day rotation.

The immediate outage was resolved by re-syncing secret #2's password from
secret #1 (and URL-encoding it — the rotated password contained reserved URL
characters, which first produced a Prisma `ERR_INVALID_URL`). That is a
manual band-aid that will rot again at the next rotation. The owner asked for
a permanent fix ("要做到根治").

The structural defect is **two sources of truth for one password**. Any design
that keeps a second, separately-maintained copy of the password can drift.

## Decision

**Eliminate the hand-filled `database-url` secret. Make the RDS-managed master
secret the single source of truth, and compose `DATABASE_URL` inside the
container at startup.**

Concretely:

1. **Container entrypoint (`apps/api`)** — add a small entrypoint that, when
   `DATABASE_URL` is not already set, composes it from discrete parts and
   exports it before `exec`-ing the container command:
   - `DB_PASSWORD` is injected from the **RDS-managed secret's `password`
     JSON key** (ECS `valueFrom = "<rds-secret-arn>:password::"`).
   - `DB_USERNAME` / `DB_HOST` / `DB_PORT` / `DB_NAME` are plain (non-secret)
     env from Terraform RDS outputs.
   - The password is URL-encoded (via Node `encodeURIComponent`) so rotated
     passwords containing reserved characters never break URL parsing.
   - Final value:
     `postgresql://${DB_USERNAME}:${enc(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require&uselibpqcompat=true`.
   - The "use `DATABASE_URL` if already set" branch keeps **local dev**
     (`.env` provides a full `DATABASE_URL`) and the entrypoint backward
     compatible with the old task definition during rollout.

2. **Terraform** — for the four DB-consuming tasks (`api`, `outbox-worker`,
   `migrate`, `sfc-sync`):
   - Remove the `DATABASE_URL` → `opentrade/dev/database-url` wiring.
   - Inject `DB_PASSWORD` from `module.rds.master_password_secret_arn`
     (`:password::`), and add `DB_USERNAME` / `DB_HOST` / `DB_PORT` /
     `DB_NAME` as plain env from the `rds-postgres` outputs.
   - Grant the **task execution role** `kms:Decrypt` on the RDS secret's KMS
     key (needed to inject a CMK-encrypted secret at launch). `GetSecretValue`
     on the RDS secret ARN is already granted.
   - Delete the now-unused `opentrade/dev/database-url` slot from
     `app_secret_names`.

3. **Keep `manage_master_user_password = true` and 7-day rotation ON.** With a
   single source of truth, rotation is no longer a foot-gun: a task restart
   (`force-new-deployment`) re-reads the current password. (A future
   enhancement may auto-trigger that restart on rotation; out of scope here.)

## Alternatives Considered

- **A. Disable RDS automatic rotation; keep the hand-filled secret.** Simplest
  (one Terraform flag), and the hand-filled secret would stop drifting because
  the password would never change. Rejected: it trades away password rotation
  (a security best practice) to avoid fixing the real defect, still keeps two
  sources of truth (a manual rotation or re-apply re-introduces drift), and is
  exactly the "臨時解" rule 00 forbids.

- **B. Set `manage_master_user_password = false` and manage the password
  ourselves in one secret.** Single source of truth, no entrypoint change.
  Rejected: it puts the password into Terraform state / variables, violating
  rule 50 and the explicit ADR-0017 D10 "no password ever appears in
  Terraform state" guarantee that motivated `manage_master_user_password` in
  the first place.

- **C. A Secrets Manager rotation Lambda that re-composes `database-url`
  whenever RDS rotates.** Keeps the app unchanged. Rejected for now: most
  moving parts (a Lambda, its IAM role, a rotation hook), still two secrets to
  keep consistent, and more failure surface than composing at startup. Can be
  revisited only if a future requirement forbids any app-side composition.

- **D. Point the ECS `DATABASE_URL` secret directly at the RDS secret.**
  Impossible as-is: the RDS-managed secret is JSON `{username, password}` with
  no host/port/db and no URL form; ECS can inject a JSON key but cannot
  synthesise a connection string. Composition must happen somewhere — the
  entrypoint is the least-invasive place (no TypeScript change).

## Consequences

### Positive

- One source of truth for the DB password (the RDS-managed secret). Drift is
  structurally impossible — the second secret no longer exists.
- 7-day automatic rotation stays on; recovery after a rotation is a plain
  redeploy with **zero manual secret editing**.
- URL-encoding handled once, in code — the `ERR_INVALID_URL` class of bug is
  gone regardless of which characters a future rotation produces.
- No password in Terraform state (ADR-0017 D10 / rule 50 preserved).
- Local dev is unchanged: `.env`'s `DATABASE_URL` still wins via the
  entrypoint's short-circuit.

### Negative

- The `apps/api` image gains an entrypoint script (small surface, but it is
  now on the startup path for all four DB tasks). A bug there fails every DB
  task — mitigated by the local-dev short-circuit being exercised constantly
  and a smoke check at deploy.
- A mid-life rotation still breaks **already-running** tasks until they
  restart (they read the password once at boot). This ADR removes the _manual
  secret surgery_, not the need for a restart; auto-restart-on-rotation is a
  deliberate follow-up.
- Requires a coordinated rollout: build/push the new image first (backward
  compatible), then `terraform apply` the task-def/role change. Documented in
  Implementation Notes.

## Implementation Notes

- **Rollout order (safe):** the entrypoint is backward compatible (uses
  `DATABASE_URL` if present). So: (1) build + push the new `opentrade-api`
  image (old task def still injects `DATABASE_URL` → entrypoint passes it
  through); (2) `terraform apply` to swap injection to `DB_*` + add execution
  role `kms:Decrypt`; (3) `force-new-deployment` for `api` + `outbox-worker`;
  (4) verify `/v1/health` 200 + broker list. `migrate` / `sfc-sync` pick up
  the new wiring on their next run.
- **KMS key:** add `module.rds` output for the master secret's KMS key ARN (or
  read it from the secret) and pass it into `ecs-fargate-cluster` for the
  execution-role `kms:Decrypt` statement. If the secret turns out to use the
  AWS-managed `aws/secretsmanager` key, the statement is harmless and the
  injection works via the default key policy.
- **Secret cleanup:** remove `opentrade/dev/database-url` from
  `var.app_secret_names` only after the new task defs are live, so a rollback
  still has the slot.
- **CI:** Terraform stays plan-only in CI (rule 80); the apply is owner-local.
  The image build/deploy goes through `deploy.yml` (ADR-0047) on push to main,
  or an owner-local `docker build`/push for an out-of-band hotfix.
- Files touched: `apps/api/Dockerfile` (+ entrypoint script under
  `apps/api/`), `infra/terraform/modules/rds-postgres/outputs.tf`,
  `infra/terraform/modules/ecs-fargate-cluster/{variables,main}.tf`,
  `infra/terraform/environments/dev/main.tf`,
  `infra/terraform/environments/dev/variables.tf` (drop the secret name).

## References

- ADR-0046 D9 — the hand-filled `database-url` secret slot this supersedes.
- ADR-0017 D10 / rule 50 — no password in Terraform state (preserved here).
- ADR-0047 — GitHub OIDC deploy pipeline (image build/rollout path).
- ADR-0048 / ADR-0051 — migrate task + automated migrate gate (same image,
  same DB-secret consumer set).
- Postgres error `28P01`; AWS RDS managed master user password + Secrets
  Manager rotation.
