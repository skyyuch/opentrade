# ADR-0051: Automated migrate gate in the deploy pipeline (amends ADR-0047 D2, ADR-0048 D2)

## Status

Accepted (amends ADR-0047 D2 and ADR-0048 D2, supersedes ADR-0048 A2's
Phase-4+ deferral; relates ADR-0046, ADR-0049, ADR-0050). Owner ratified
2026-06-21; the dedicated-migrate-role option (D2) was chosen.

## Date

2026-06-21

## Context

The owner reported that the deployed UAT site "has no data" on the broker /
bullion-dealer pages, and that getting data to appear repeatedly requires an
AI-guided ritual of logging into AWS and running tasks by hand. Investigation
on 2026-06-21 found the real failure, not a login problem:

- The HKGX rebrand (ADR-0050) renamed the Postgres enum values
  `Regulator.HK_CGSE → HK_HKGX` and `LicenseType.HK_CGSE_MEMBER →
HK_HKGX_MEMBER` via migration `20260621090000_rename_cgse_to_hkgx`.
- Pushing the rebrand to `main` triggered `deploy.yml`, which rebuilt and
  rolled out the three runtime images. `deploy.yml` does **not** run database
  migrations (ADR-0048 D2 keeps that owner-local), and the owner had not run
  the migrate task. So the new HKGX **code** went live against an
  un-migrated **database** still holding `HK_CGSE`.
- The regenerated Prisma client only knows `HK_HKGX`; reading a legacy
  `HK_CGSE` row throws. `GET /v1/brokers?category=BULLION` returned **HTTP
  500**, and any list query whose result set touched a bullion license also
  500'd — both securities and bullion directories appeared empty to the user.

This is a structural "half-deploy": **code and schema are deployed by two
different actors on two different clocks** — code by CI on every push,
schema by the owner manually and only when they remember. ADR-0048 D2 made
migration an owner-local privileged operation precisely to keep
`ecs:RunTask` + `iam:PassRole` out of the CI deploy role (ADR-0047 D2), and
ADR-0048 A2 (CI runs migrate before rollout) was deferred to "Phase 4+
behind a dedicated migration-role ADR". This document is that ADR, brought
forward because the manual coupling is now actively breaking UAT on every
schema-changing release and is the root cause of the owner's "I keep having
to log into AWS to get data" friction.

The owner has confirmed two preferences:

- Keep push-to-`main` **auto-deploy** (do not switch to manual-only),
  adding an automatic migrate step to prevent half-deploys.
- The fix must be a durable architectural solution, not a workaround
  (rule 00), and must not introduce long-lived AWS keys or IAM users
  (rule 80).

A secondary, deeper truth surfaced: an enum **rename** is not
backward-compatible in _either_ direction — old-code-new-schema breaks just
as new-code-old-schema does. Ordering alone cannot make a breaking migration
zero-downtime; only expand/contract migration discipline can. The pipeline
change below removes the failure mode we actually hit (new-code-old-schema)
and shrinks the residual window to seconds; the discipline note (D5)
addresses the rest.

## Decision

### D1. Add a `migrate` gate job that runs before any service rollout

`deploy.yml` gains a `migrate` job that the three app rollout jobs depend on
(`needs: migrate`). The migrate job:

1. Builds and pushes the `:migrate` image (`docker build --target migrate`,
   the `FROM builder` stage that carries the Prisma CLI, migration SQL, and
   `tsx`) to the `opentrade-api` ECR repo, reusing the GHA layer cache shared
   with the api build.
2. Runs the migrate ECS task with command override **`prisma migrate deploy`
   only** (see D3), via `aws ecs run-task`.
3. Waits for the task to stop (`aws ecs wait tasks-stopped`) and asserts the
   container `exitCode == 0`; a non-zero exit fails the job.

Because the app jobs `need` it, **a failed migration blocks the rollout**:
the services keep serving the previous, internally-consistent image instead
of going half-deployed. This is strictly safer than today, where a bad or
missing migration ships new code anyway and breaks reads.

### D2. Grant CI a narrowly-scoped migration capability (new dedicated role)

A new Terraform role `opentrade-dev-github-migrate` (in the
`github-oidc-deploy` module or a sibling) is created, trust-pinned to the
same `repo:<repo>:ref:refs/heads/main` subject as the deploy role. Its inline
policy grants **only**:

- `ecs:RunTask` on the `opentrade-dev-migrate` task-definition family ARN,
- `ecs:DescribeTasks` on the cluster's tasks,
- `iam:PassRole` on **exactly** the migrate task role and execution role
  (scoped by ARN, with an `iam:PassedToService = ecs-tasks.amazonaws.com`
  condition),
- ECR push on `opentrade-api` (to publish the `:migrate` image).

The existing `opentrade-dev-github-deploy` role is **unchanged** (still no
RunTask / PassRole). The migrate job assumes the migrate role; the app jobs
keep assuming the deploy role. Splitting the roles keeps least privilege and
clean audit separation between "publish + roll images" and "run a migration".

This consciously amends ADR-0047 D2 ("deliberately absent: `ecs:RunTask` and
`iam:PassRole`") and ADR-0048 D2 ("the migrate task is run owner-local, NOT
by CI"). The blast-radius argument: CI **already** controls the serving image
bytes (the api image runs arbitrary code against the same private RDS), so a
compromised pipeline can already reach the database. A scoped `RunTask` on a
single, Terraform-owned task definition does not materially widen that
surface. The one genuine increment is that `RunTask` permits a
`containerOverrides.command`, which IAM cannot constrain — a compromised
migrate role could run an arbitrary command in-VPC with DB access. We accept
this because (a) it is the same effective power CI already has via the api
image, (b) the role is single-purpose and ref-pinned, and (c) the
correctness win (no more half-deploys, owner removed from the data-refresh
loop) is large and recurring.

### D3. The automatic path runs migrate-only; seed/enrichment stays explicit

The gate runs `prisma migrate deploy` (idempotent: applies only pending
migrations, a no-op when none are pending — safe on every push). It does
**not** run `scripts/seed.ts` or any enrichment. Reference-data seeding and
enrichment remain explicit, separately-invoked operations (owner-local per
ADR-0049, or a future opt-in `workflow_dispatch` input), because:

- Seeding is not idempotent across identity-changing rebrands — e.g. the
  HKGX seed keys brokers on `hkgx-{code}` slugs while existing rows are
  `cgse-{code}`, so a blind reseed would **duplicate** the roster.
- `fetch-sfc-details` is a 3–4 h live scrape (ADR-0049 D2) that must never be
  coupled to a routine deploy.

DDL is safe to automate; data backfills need a human decision.

### D4. Keep push-to-main auto-deploy; the gate makes it safe

`on: push: branches: [main]` and `workflow_dispatch` are retained (owner
preference). The migrate gate is what makes unattended auto-deploy safe for
schema-changing commits. `concurrency` stays serialized so two deploys cannot
migrate/roll concurrently.

### D5. Breaking schema changes follow expand/contract (discipline, documented)

Migrate-first ordering eliminates the new-code-old-schema failure we hit, and
shrinks the old-code-new-schema window to the seconds between migration
success and rollout completion. For migrations that are not backward
compatible in either direction (enum `RENAME`, column `DROP`/`RENAME`,
`NOT NULL` tightening), even that window is a brief outage. Such changes must
be split into expand/contract steps across two deploys (add new → deploy code
that reads both → backfill → drop old). This is a development-discipline note
recorded here and to be reflected in `.cursor/rules/31-database-prisma.mdc`;
it is not enforced by the pipeline.

## Alternatives Considered

- **A1: Status quo — owner-local manual migrate (ADR-0048 D2).** The thing
  that just broke UAT and is the owner's stated pain. Rejected.
- **A2: Run migrations on api container start (entrypoint
  `migrate deploy && node dist/main.js`).** Bloats the runtime image with the
  Prisma CLI + migrations, makes all N api tasks race to migrate (needs
  advisory locking), couples app boot to DDL, and still leaves the breaking
  old-code/new-schema window because tasks roll one at a time. Rejected as an
  anti-pattern (mirrors ADR-0048 A3).
- **A3: Extend the existing deploy role with RunTask/PassRole instead of a
  new role.** Fewer Terraform resources, but merges "roll images" and "run
  migrations" into one credential, enlarging the blast radius of a single
  compromise and muddying audit. Rejected in favour of the dedicated role
  (D2); revisit only if the two-role overhead proves not worth it.
- **A4: Keep migrate manual but add a hard CI guard that fails the deploy if
  there are unapplied migrations.** Prevents the half-deploy (good) but still
  forces the owner to log into AWS and run the migrate task by hand for every
  schema change — it fixes the breakage but not the friction the owner asked
  to remove. Rejected as half a solution.
- **A5: Switch to manual-only `workflow_dispatch` deploys.** The owner
  explicitly chose to keep auto-deploy; this would trade one manual ritual
  for another. Rejected per D4.

## Consequences

### Positive

- Schema and code ship together, automatically, in the correct order. The
  half-deploy class of failure (the 2026-06-21 bullion 500) cannot recur for
  backward-compatible migrations and is reduced to a seconds-long window for
  breaking ones.
- The owner is removed from the routine data/schema-refresh loop: no manual
  `aws sso login` + build + `run-task` for ordinary releases. This directly
  resolves the "I keep having to log into AWS to get data" friction.
- A failed migration blocks rollout, so the site degrades to "previous
  consistent version" rather than "new code, broken reads".
- The credential increment is scoped to one task definition and isolated in
  a single-purpose role; the image-rolling deploy role is untouched.

### Negative / Trade-offs

- CI now holds `ecs:RunTask` + scoped `iam:PassRole` — a real expansion of
  the CI threat model that ADR-0047 D2 / ADR-0048 D2 deliberately avoided.
  Mitigated by ref-pinned trust, single-task scope, and a dedicated role, and
  justified by CI already controlling DB-touching serving code.
- `RunTask` command overrides cannot be IAM-restricted; a compromised migrate
  role could run arbitrary in-VPC commands. Accepted (see D2).
- Every push now also runs `prisma migrate deploy` (a fast no-op when nothing
  is pending) and builds/pushes the `:migrate` image, adding minutes and a
  little Fargate churn per deploy. Acceptable for UAT.
- Breaking migrations still require expand/contract discipline (D5); the
  pipeline does not enforce it.

### Neutral

- The `:migrate` image already exists (ADR-0048 D1); this only moves its
  build + invocation from the owner's laptop into CI.
- Reference-data seeding/enrichment posture (ADR-0049) is unchanged — still
  explicit, never coupled to deploy.
- PRD will want a hardened variant (immutable tags, a separate migration
  approval gate); out of scope here (UAT-focused, per ADR-0046).

## Implementation Notes

To be executed after owner ratification (flip Status → Accepted first):

1. `feat(infra)` — add `opentrade-dev-github-migrate` role + scoped policy
   (RunTask on `opentrade-dev-migrate` family, DescribeTasks, PassRole on the
   migrate task/execution roles with the `ecs-tasks` service condition, ECR
   push on `opentrade-api`); output its ARN. `terraform fmt` + `validate`;
   apply is owner-local (rule 80).
2. Set repo variable `AWS_MIGRATE_ROLE_ARN` from the new `terraform output`.
3. `ci` — add the `migrate` job to `deploy.yml` (build/push `:migrate`,
   `run-task` with `prisma migrate deploy` override, `wait tasks-stopped`,
   assert exit 0) and add `needs: migrate` to the three app jobs; reuse the
   private-subnet IDs + migrate SG (read at runtime, not hardcoded — rule 80)
   via a small describe step or repo variables.
4. `docs(rules)` — add the expand/contract note (D5) to
   `.cursor/rules/31-database-prisma.mdc`.
5. ADR index row + `docs/03-status.md` update.

The 2026-06-21 stop-gap (rebuild `:migrate`, `run-task` migrate-only, verify
bullion 200) was performed owner-local under the existing ADR-0048/0049
posture before this ADR; it restored UAT and is what this ADR automates.

## References

- [ADR-0046](./0046-uat-deployment-topology-and-prd-design.md) — UAT topology
- [ADR-0047](./0047-github-oidc-deploy-pipeline.md) — deploy role; D2 amended
  here
- [ADR-0048](./0048-uat-migration-job-and-deterministic-tenant.md) — migrate
  image + one-off task; D2 amended, A2 superseded here
- [ADR-0049](./0049-in-vpc-enrichment-bootstrap.md) — reference-data
  enrichment posture (unchanged)
- [ADR-0050](./0050-rebrand-cgse-to-hkgx.md) — the rename whose half-deploy
  motivated this ADR
- `.cursor/rules/80-aws-accounts.mdc` — no IAM users / no long-lived keys
- `.cursor/rules/50-security.mdc` — least privilege, secrets posture
- `.cursor/rules/31-database-prisma.mdc` — migration discipline (to gain D5)
