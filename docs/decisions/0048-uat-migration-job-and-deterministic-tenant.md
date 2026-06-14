# ADR-0048: UAT schema migration via one-off ECS task + deterministic HK tenant id

## Status

Accepted (amends ADR-0046 Implementation Notes stage 5; relates ADR-0047)

## Date

2026-06-14

## Context

ADR-0046 Implementation Notes stage 5 said the operator would "run
`prisma migrate deploy` (one-off ECS task or local run against RDS) +
seed". The stage-7 apply session exposed that neither half of that
"or" actually exists:

- **No local run is possible.** RDS is `publicly_accessible = false`
  and its security group admits only the named client SGs (the api /
  outbox-worker ECS services). There is no bastion, no SSM-managed
  instance, and no VPN, so an operator laptop cannot reach the database
  to run Prisma migrations.
- **No migration-capable image exists.** The `apps/api` runtime image
  ships `CMD ["node", "dist/main.js"]` and is built with
  `pnpm --filter @opentrade/api --prod deploy --ignore-scripts`, which
  excludes the `prisma` CLI (a devDep) and does not carry the migration
  SQL files or `scripts/seed.ts`. A one-off ECS task using that image
  cannot apply migrations or seed.

A second, independent problem surfaced while wiring secrets: the seed
creates the `hk` tenant with a Prisma-generated random UUID, but
`apps/api` reads a fixed `DEFAULT_TENANT_ID` from Secrets Manager. On a
fresh RDS the seeded id would differ from every other environment,
forcing a "seed first, read the id back, then write the secret"
ordering dance on every environment bootstrap.

## Decision

### D1. Migrations + seed run as a one-off ECS Fargate task from a dedicated image stage

A new `migrate` stage is added to `apps/api/Dockerfile`, layered
`FROM builder` (the stage that already has the full pnpm workspace with
devDeps, the `prisma` CLI, `tsx`, the generated client, all migration
SQL, `scripts/seed.ts`, and the seed data JSON). Its command runs:

```
prisma migrate deploy && tsx scripts/seed.ts
```

against the `DATABASE_URL` injected from Secrets Manager. The stage is
placed **before** `runtime` so `runtime` remains the Dockerfile's last
stage — `deploy.yml`'s untargeted build keeps producing the API service
image unchanged; the migrate image is built explicitly with
`--target migrate` and pushed to the existing `opentrade-api` ECR repo
under the `:migrate` tag (no new repo).

A new Terraform module `modules/migrate-task` registers the task
definition + a task security group, and the dev composition adds that
SG to the RDS `client_security_groups` map so the task can reach
Postgres. The module mirrors `sfc-sync-task` but has no EventBridge
schedule — it is invoked on demand.

### D2. The migrate task is run owner-local via `aws ecs run-task`, NOT by CI

`aws ecs run-task` requires `ecs:RunTask` + `iam:PassRole` on the task
and execution roles. ADR-0047 D2 deliberately withholds exactly those
permissions from the GitHub deploy role so a compromised CI workflow
cannot change what runs or assume task identities. Rather than re-open
that surface, schema migrations are an **owner-local privileged
operation** (rule 80): the owner, holding `OpenTradeAdmin` via SSO,
builds/pushes the `:migrate` image and runs the task with
`aws ecs run-task --profile opentrade-dev`. `deploy.yml` is unchanged
and gains no new AWS permissions.

This keeps the deploy ordering explicit for UAT (owner migrates, then
triggers the image rollout). Automating "migrate-before-rollout" inside
CI — which would require widening the deploy role or a separate
narrowly-scoped migration role — is recorded as a Phase-4+ follow-up.

### D3. The `hk` tenant id is pinned to a deterministic UUID

`scripts/seed.ts` pins the `hk` tenant's `id` to the canonical constant
`e05ea634-e71d-447c-bd3d-87942eda6a2a` (the value already in local dev
and the `DEFAULT_TENANT_ID` everywhere). The upsert stays idempotent
(keyed on `code`); only the `create` branch sets the id, so existing
databases are untouched. `DEFAULT_TENANT_ID` is therefore stable across
local / UAT / future PRD, and the secret can be written before the seed
runs — no read-back ordering dependency.

## Alternatives Considered

- **A1: Ephemeral SSM bastion (t4g.nano, no public IP) + laptop
  port-forward + local `prisma migrate deploy`.** Reuses the existing
  Prisma toolchain with zero image work, but leaves migration as a
  laptop-only manual step with no repeatable artefact, adds a transient
  EC2 + instance profile + SG churn, and is the kind of "spin it up,
  forget to tear it down" surface rule 80 discourages. Rejected as the
  long-term answer; the migrate image is repeatable and CI-promotable.
- **A2: CI (`deploy.yml`) runs the migrate task before rolling the
  services.** The cleanest fully-automated pipeline, but requires
  granting the deploy role `ecs:RunTask` + `iam:PassRole` — precisely
  the surface ADR-0047 D2 refused. Deferred to Phase 4+ behind a
  dedicated migration-role ADR.
- **A3: Run migrations on api container start (entrypoint
  `migrate deploy && node dist/main.js`).** Bloats the runtime image
  with the Prisma CLI + migrations, makes every one of N tasks race to
  migrate (needs advisory locking), couples app boot to DDL, and still
  leaves seed unsolved. Rejected as an anti-pattern for a multi-task
  service.
- **A4: Keep the random seeded tenant id and read it back.** Forces a
  bootstrap ordering dance and divergent `DEFAULT_TENANT_ID` per
  environment for no benefit. Rejected in favour of the deterministic
  pin (D3).

## Consequences

### Positive

- Schema migration + seed against a private RDS is now a repeatable,
  versioned artefact (`opentrade-api:migrate`) runnable in-VPC, not a
  bespoke laptop tunnel.
- ADR-0047 D2's minimal CI credential surface is preserved intact; no
  new GitHub-held AWS permissions.
- `DEFAULT_TENANT_ID` is environment-invariant; bootstrapping a new
  environment no longer requires reading a generated id back into a
  secret.

### Negative / Trade-offs

- The `:migrate` image is the full builder tree (devDeps + toolchain),
  noticeably larger than the slim runtime image. Acceptable: it runs
  briefly, on demand, and is not the serving image.
- Migration is a manual owner step for UAT; an accidental "deploy new
  code before migrating" ordering is possible until the Phase-4+ CI
  automation (A2) lands. Mitigated by the owner-present deploy ritual.
- Pinning the tenant id hard-codes a UUID constant in seed code; this
  is seed data, not a secret, so it is acceptable in the repo.

### Neutral

- The migrate task reuses the api task/execution roles and the
  `database-url` secret; no new IAM identity.
- `runtime` staying the Dockerfile's last stage means `deploy.yml`
  needs no `--target` change.

## Implementation Notes

Landed in the UAT stage 5+7 operator session (after the stage-7 apply):

1. `fix(infra)` — first-apply plannability + ASCII SG descriptions
   (pre-requisite, separate commits).
2. ADR-0048 + `docs/decisions/README.md` index row (this document).
3. `feat(db)` — pin `hk` tenant id in `scripts/seed.ts` (D3).
4. `feat(api)` — `migrate` Dockerfile stage before `runtime` (D1).
5. `feat(infra)` — `modules/migrate-task` + dev wiring + RDS client SG
   entry + output (D1).
6. Owner ops: fill secrets, build/push `:migrate`, `aws ecs run-task`
   migrate + seed, then set repo variables and trigger `deploy.yml`.

## References

- [ADR-0016](./0016-aws-account-architecture.md) — owner-local
  privileged ops; account boundary
- [ADR-0017](./0017-terraform-iac-and-phase0-apply-scope.md) — module
  conventions, secrets-outside-Terraform
- [ADR-0020](./0020-scheduled-sfc-broker-sync.md) — one-off ECS task
  pattern this mirrors
- [ADR-0041](./0041-adopt-prisma-7.md) — Prisma 7 client / migration
  layout
- [ADR-0046](./0046-uat-deployment-topology-and-prd-design.md) — UAT
  topology; stage 5 amended here
- [ADR-0047](./0047-github-oidc-deploy-pipeline.md) — CI credential
  surface this preserves (D2)
- `.cursor/rules/80-aws-accounts.mdc` — owner-local privileged ops
