# ADR-0017: Terraform IaC structure and Phase-0 apply scope

## Status

Accepted

## Date

2026-05-21

## Context

ADR-0016 settled the AWS account boundary — one Organization, two
accounts (`opentrade-management` and `opentrade-dev`), `ap-southeast-1`
as the workload region. ADR-0002 set AWS as the sole cloud provider and
fixed a `< $200 USD/month` hard cost ceiling for Phase-0 dev. Both
ADRs left open the _physical shape_ of the Terraform code that would
provision the actual VPC, RDS, ECS, ECR, CloudFront, and Secrets Manager
resources, and how aggressively we should `terraform apply` in Phase 0.

Commit number-nine is the first commit that materially provisions cloud
infrastructure. Five interlocking design choices have to be made
together, not in isolation, because each one affects the others:

1. **IaC layout**. Where do the `.tf` files live? How are modules
   separated from environments? What is the chicken-and-egg story for
   the state backend itself?
2. **Provider + Terraform version pins**. What versions of Terraform
   and the AWS provider does CI standardise on? How do we re-evaluate
   them later?
3. **Phase-0 apply scope**. The original Phase-0 Definition of Done in
   `docs/02-roadmap.md` reads "Terraform `plan` 跑得起來（沒實際 apply）".
   But shipping Phase-1 (rich evidence-bearing review system on real
   ECS) needs a real database, real ECR, real CloudFront the moment
   the first `apps/api` container ships. Either we apply now or we
   apply at the start of Phase 1 — the decision affects the dev burn
   rate and the budget alert thresholds.
4. **Dev cost-tuning vs. prod-future-proofing**. The same modules will
   one day provision `staging` and `prod`. Where do we set "Phase 0
   defaults" so swapping in prod-grade settings later is a single
   variable bump, not a module rewrite?
5. **Secret management posture**. ADR-0002, rule 50, and rule 80 all
   forbid secret values in Terraform state. How do we shape the
   `secrets` module so it scaffolds the _names_ without ever touching
   the _values_?

This ADR resolves all five together so that every subsequent infra
commit, including the Phase-1 ECS service definition, has explicit
ground truth to pull against.

## Decision

Eleven coordinated decisions, ratified at the start of Commit number-nine.

### D1. Three-tier IaC layout: `bootstrap/`, `environments/`, `modules/`

```
infra/terraform/
├── README.md
├── bootstrap/
│   └── state-backend/         ← chicken-and-egg root; LOCAL state
└── environments/
    └── dev/                   ← composition root for opentrade-dev
        ├── versions.tf
        ├── providers.tf
        ├── backend.tf         ← S3 + DynamoDB pointing at bootstrap output
        ├── variables.tf
        ├── outputs.tf
        ├── main.tf            ← wires every module in modules/
        └── terraform.tfvars.example
└── modules/
    ├── vpc/
    ├── rds-postgres/
    ├── ecs-fargate-cluster/
    ├── ecr-repo/
    ├── frontend-cdn/
    └── secrets/
```

The split is **module ⟂ environment**: modules are pure "how to
provision this thing", environments are "which combination of those
things in which account at which scale". Future `staging` and `prod`
environments (Phase 4+) become sibling directories under `environments/`
that re-use the same modules with different variable values.

### D2. State backend: single S3 bucket + single DynamoDB lock table, in `opentrade-dev`

- S3 bucket: `opentrade-tfstate-dev-371637912734` (account ID embedded
  for global uniqueness; bucket-level SSE-S3, versioning, public-access
  block, 90-day non-current expiration).
- DynamoDB lock table: `opentrade-tfstate-locks-dev`, PAY_PER_REQUEST,
  point-in-time recovery enabled.
- Both live in `opentrade-dev` (account `371637912734`) — _not_ in the
  management account, per rule 80 ("Terraform state must not live in
  management").
- Each environment workspace stores its state under a different `key`
  prefix in the same bucket (Phase 0 dev → `environments/dev/`).
- The bootstrap workspace itself uses **local state** (chicken-and-egg);
  this is the only workspace in the repo that does so.

The `backend "s3"` block cannot reference Terraform variables, so the
bucket name and lock-table name are repeated as literals in every
workspace's `backend.tf`. They MUST stay in sync with
`bootstrap/state-backend/variables.tf` defaults — a constraint that is
documented in both files.

### D3. Module file convention: `versions.tf` / `variables.tf` / `main.tf` / `outputs.tf`

Every module under `modules/` ships exactly four files in this order:

| File           | Purpose                                                            |
| -------------- | ------------------------------------------------------------------ |
| `versions.tf`  | `required_version` ≥ 1.9, `required_providers`                     |
| `variables.tf` | All inputs with explicit `type`, `description`, optional `default` |
| `main.tf`      | Resources (and `data` blocks they depend on)                       |
| `outputs.tf`   | All outputs with `description`, no logic                           |

Modules **must not** declare a `provider` block. The provider with
`default_tags` is the environment's responsibility, and Terraform's
implicit provider inheritance handles the wiring.

Modules **must not** read environment variables. Every input is an
explicit `variable`.

Modules **must not** hard-code names; every name is built from
`var.name_prefix` + a logical suffix.

### D4. Phase-0 apply scope: full real infrastructure (dev tier), not "plan-only"

Originally Phase-0 DoD said "Terraform `plan` 跑得起來（沒實際 apply）"
(`docs/02-roadmap.md`). This ADR **supersedes that**: Commit number-nine
runs `terraform apply` against `opentrade-dev` for the entire stack
(VPC + RDS + ECS cluster + ECR + 2× CloudFront + Secrets slots),
provisioning real resources at dev tier.

Why we changed our mind: the alternative — apply at the start of
Phase 1 instead — saves at most one month's worth of idle cost (~$54)
and offers nothing in return except a bigger Phase-1 first-week
surface area. Real-infrastructure `terraform plan` output already
catches 80 % of "did the modules wire up right" issues; the remaining
20 % (security group reachability, IAM evaluation, RDS subnet group
constraints) are only catchable by a real apply. We pay $54 once, in
controlled circumstances, with the founder watching, rather than
discover everything at Phase-1 launch.

The roadmap's Phase-0 DoD is patched in the same commit to read
"Terraform `apply` runs cleanly against `opentrade-dev`".

### D5. Dev cost-tuning: single NAT, single-AZ RDS, no Multi-AZ, no Performance Insights, no WAF

The dev environment chooses the cheapest correct configuration on every
axis where doing so costs only the failure-mode "single AZ goes down ⇒
dev unreachable" — never correctness:

| Knob                     | Phase-0 dev value         | Phase-4+ prod value  | Saving               |
| ------------------------ | ------------------------- | -------------------- | -------------------- |
| NAT gateways             | 1 (single AZ)             | 2–3 (one per AZ)     | ~$33/month per NAT   |
| RDS Multi-AZ             | false                     | true                 | ~$15/month           |
| RDS Performance Insights | disabled                  | enabled (free tier)  | $0 but configurable  |
| RDS instance class       | `db.t4g.micro` (Graviton) | `db.r7g.large` or up | bulk of monthly bill |
| ECS task running         | 0 (cluster only)          | 1+ tasks always-on   | ~$15/task/month      |
| WAF / Shield Advanced    | not provisioned           | provisioned in front | ~$5–25/month + rules |
| CloudFront price class   | `PriceClass_100`          | `PriceClass_All`     | ~30 % off bandwidth  |

These are all controlled by module variables with sensible defaults; the
prod environment (Phase 4+) flips the variables, the modules don't change.

### D6. Cost envelope: dev steady-state ~$54/month, hard cap $200, soft cap $50 budget

| Line item             | Estimate (USD/mo) |
| --------------------- | ----------------- |
| NAT Gateway × 1       | $32.85            |
| NAT data processing   | ~$0.25            |
| RDS db.t4g.micro      | $13.14            |
| RDS gp3 storage 20 GB | $2.30             |
| ECS cluster (idle)    | $0                |
| ECR repository        | $0 (free tier)    |
| S3 (3 buckets)        | ~$0.50            |
| CloudFront × 2        | ~$0.20            |
| Secrets Manager × 4   | $1.60             |
| CloudWatch Logs       | ~$3.50            |
| DynamoDB lock         | $0 (free tier)    |
| **Total**             | **~$54**          |

This breaches ADR-0002's "Phase 0 expected < $50 USD/month" by ~$4
**by design**, and respects ADR-0002's `< $200 USD/month` hard cap by
a comfortable margin. The `phase-0-soft-cap` $50 budget alert (per
ADR-0016 D8) **will fire** at 80 % actual ($40) during the first full
month — that is the alert behaving correctly, not a violation.
`phase-0-hard-cap` $200 stays unbreached.

### D7. Provider + Terraform version pins

```hcl
terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    aws    = { source = "hashicorp/aws",    version = "~> 5.83" }
    random = { source = "hashicorp/random", version = "~> 3.6"  }
    null   = { source = "hashicorp/null",   version = "~> 3.2"  }
  }
}
```

- Terraform `>= 1.9.0, < 2.0.0` — covers everything between Terraform
  1.9.x (current LTS-equivalent) and the next major. Tested locally on
  1.15.4.
- AWS provider `~> 5.83` — pin to minor; auto-update through
  5.83.x → 5.84.x; never auto-jump to 6.x.
- `random` and `null` are utility providers used sparingly (random
  password backstop where we don't go through Secrets-Manager-managed
  passwords, `null_resource` for account-ID identity guards).

CI (Commit number-ten) will re-resolve these on every PR via
`terraform init`. Bumping any of them requires a successor ADR.

### D8. Identity guard on every workspace

Every workspace's `main.tf` opens with:

```hcl
data "aws_caller_identity" "current" {}

resource "null_resource" "guard_account_id" {
  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.account_id
      error_message = "Caller is account ${data.aws_caller_identity.current.account_id} but expected ${var.account_id}. Did you forget --profile opentrade-dev?"
    }
  }
}
```

This makes `terraform plan` against the wrong AWS account fail at
plan time with a human-readable error, before any `apply` can mutate
the wrong account. It is the in-code enforcement of rule 80's "never
apply OpenTrade Terraform against the legacy account" red line.

### D9. Default tags: stable five-key set

`provider "aws"` declares `default_tags`:

| Tag key       | Value (Phase 0) | Phase 4+ behaviour            |
| ------------- | --------------- | ----------------------------- |
| `Project`     | `OpenTrade`     | unchanged                     |
| `Environment` | `dev`           | switches per environment      |
| `ManagedBy`   | `Terraform`     | unchanged                     |
| `CostCenter`  | `phase-0`       | bumps per phase or workstream |
| `Owner`       | `skyyu`         | becomes a team identifier     |

Cost-allocation reports group on `Environment` + `CostCenter`. These
five keys are the project-wide standard; modules may add resource-
specific tags (e.g., `Name`, `Tier=public/private`) but never override
the five core keys.

### D10. Secrets Manager scaffolding without values

The `secrets/` module creates `aws_secretsmanager_secret` resources
**without** `secret_string`. Slot names follow the convention
`opentrade/<env>/<key>` — currently `opentrade/dev/jwt-secret`,
`opentrade/dev/privy-app-secret`, `opentrade/dev/deepl-api-key`.

Secret values are written outside Terraform via:

```bash
aws secretsmanager put-secret-value \
  --secret-id opentrade/dev/jwt-secret \
  --secret-string "<value>" \
  --profile opentrade-dev
```

The RDS master password is handled differently: RDS itself generates
and rotates it via `manage_master_user_password = true`, and the
resulting Secrets Manager ARN is exported via `module.rds.master_password_secret_arn`.
That ARN flows into the ECS task role's `secretsmanager:GetSecretValue`
allow-list automatically.

The Phase-0 `secrets/` module sets `recovery_window_in_days = 0` so
re-applies during early iteration are clean. Phase 4+ prod will set
30 (the AWS recommended window).

### D11. ECS cluster ships in Phase 0; ECS service ships in Phase 1

The `ecs-fargate-cluster` module provisions the cluster, task-execution
role, application task role, and CloudWatch log group, but **no
service or task definition**. Reasons:

- The first deployable image needs an ECR push first — and an `apps/api`
  release tag, which doesn't exist until Phase 1's first migration apply.
- The service definition is tightly coupled to the load balancer and
  health-check shape; Phase 1 will introduce both.
- An empty cluster costs $0 — there is no benefit to gating it.

The task role gets `secretsmanager:GetSecretValue` permission on
`module.app_secrets.secret_arn_list` ∪ `[module.rds.master_password_secret_arn]`
in Phase 0 already, so Phase 1 can simply add the task definition
without touching IAM.

## Alternatives Considered

### A. Plan-only Phase 0 (no apply)

- **Pros**: Zero monthly burn until Phase 1 begins.
- **Cons**: Defers all "did the modules really wire up" pain to the
  Phase-1 launch week, where the surface area is larger and the founder
  has more on their plate. The expected delay is one month and ~$54.
- **Conclusion**: rejected. The cost of debugging real-infra issues
  in isolation now is far lower than under Phase-1 pressure.

### B. Single big workspace (no module-environment split)

- **Pros**: Simplest possible layout; everyone knows where every
  resource is.
- **Cons**: When `staging` and `prod` arrive in Phase 4+, every
  resource has to be either copy-pasted or refactored into modules
  retrospectively. Refactoring Terraform mid-project is risky because
  state moves are surgical operations.
- **Conclusion**: rejected. Module-environment split costs almost
  nothing now and saves a refactor later.

### C. Multi-AZ RDS + dual NAT in Phase 0

- **Pros**: Phase-0 dev exercises the same Multi-AZ failover behaviour
  as Phase-4 prod; "no surprises at launch".
- **Cons**: ~$48/month additional burn for failover behaviour we
  cannot exercise (no traffic, no test harness). Multi-AZ failover
  semantics are well-documented; we don't need our own dev to
  rediscover them.
- **Conclusion**: rejected for Phase 0. Phase 4+ flips the boolean.

### D. Local state only; no remote backend

- **Pros**: No bootstrap chicken-and-egg; just `terraform apply` from
  any laptop.
- **Cons**: Single-machine state is incompatible with even one CI
  workflow or one second contributor. State-loss equals total
  re-provision.
- **Conclusion**: rejected. Remote state is a Phase-0 must-have.

### E. Secrets Manager values populated by Terraform

- **Pros**: One-step apply; no follow-up `aws secretsmanager
put-secret-value` step.
- **Cons**: Plain values end up in Terraform state. Even with state
  encryption at rest, that violates rule 50's "never long-lived
  secrets in Terraform state" red line.
- **Conclusion**: rejected. The two-step (terraform creates slot,
  CLI puts value) is by design.

### F. ECS service in Phase 0 too (not just cluster)

- **Pros**: Phase 1 has nothing left to do for compute.
- **Cons**: Requires an `apps/api` image to point at; without one the
  service is unhealthy from minute one. Phase-0's `apps/api` produces
  a `dev` image only; we don't have the CI pipeline to push proper
  release tags yet (ships in Commit number-ten).
- **Conclusion**: rejected. Cluster-now / service-Phase-1 is the
  natural split.

### G. Use the AWS Cloud Development Kit (CDK) instead of Terraform

- **Pros**: Express infra as TypeScript; reuse type system across
  apps/api and infra.
- **Cons**: AGENTS.md technology table fixes Terraform; switching
  IaC tool requires a successor ADR. Terraform's AWS provider is the
  reference and has the most prior art for the patterns we use.
- **Conclusion**: rejected. Discussed for completeness; reverting
  the choice would be a bigger ADR than this one.

### H. CDK for Terraform (cdktf)

- **Pros**: Hybrid — TypeScript fluency with Terraform plan/apply.
- **Cons**: Adds a build step before plan; debugging unfamiliar to
  most contributors; tooling churn during Phase 0 is the wrong
  trade-off.
- **Conclusion**: rejected.

## Consequences

### Positive

- Phase 0 ends with a real, queryable, IAM-governed AWS environment
  that any subsequent commit can attach compute to. Phase 1 starts
  from "push image, deploy task" rather than "first build infra".
- Module ⟂ environment split makes adding `staging` + `prod` in
  Phase 4+ a copy-of-`environments/dev/` exercise rather than a
  refactor.
- Identity guards on every workspace prevent the entire class of
  "I forgot --profile and ran apply against the legacy account"
  incidents at the source-code level, not at the human-discipline
  level.
- Default tags are project-wide; cost reports group correctly from
  day one with no retroactive tagging push.
- Secret slot pattern lets the founder rotate `JWT_SECRET` etc.
  without ever touching Terraform — and without rule 50 having to
  flex.
- Cost stays predictable: single NAT, single-AZ RDS, idle ECS cluster
  add to ~$54/month, well below the ADR-0002 hard cap.

### Negative / Trade-offs

- ADR-0002's "Phase 0 expected < $50 USD/month" wording is
  technically breached by ~$4. ADR-0002 is _not_ superseded — its
  hard `< $200` ceiling stands — but a footnote in ADR-0002 may be
  warranted at a future revision pass.
- `docs/02-roadmap.md` Phase-0 DoD is patched in the same commit
  ("`plan` runs cleanly" → "`apply` runs cleanly"). Future readers
  comparing the roadmap to the codebase will see a tightened bar.
- Image size for `apps/api` is ~554 MB (Debian slim + Prisma engines
  - node_modules). Compared to a pure JS bundle (15 kB built by tsup),
    the bulk is Prisma's binary engine and the Debian base. Worth
    revisiting in Phase 4 with distroless / alpine + binaryTargets.
- The `apps/api` Dockerfile resolves Prisma's generated `.prisma/`
  directory dynamically out of pnpm's `.pnpm` content store. Prisma
  upgrades that change that layout will require a Dockerfile bump.
  Documented inline in the Dockerfile.
- The chicken-and-egg state-backend bootstrap forever lives with
  local state in `bootstrap/state-backend/`. Disaster recovery
  procedure for "lost the state-backend bucket" is documented in
  the workspace's README.

### Neutral

- Phase 0 ECS cluster sits idle costing $0 until Phase 1's first task
  definition lands. No action required between phases.
- ECR repository is empty until first `docker push`. The smoke build
  produced `opentrade-api:dev` locally; it is not pushed in Commit
  number-nine because there is no release tag yet (Phase 1 ships
  `:0.1.0`).
- VPC flow logs to CloudWatch cost ~$3.50/month at dev volume. Worth
  it for catching SG misconfigurations during Phase 1 development.

## Implementation Notes

The following landed in Commit number-nine alongside this ADR:

- `infra/terraform/{README.md, bootstrap/state-backend/, environments/dev/, modules/{vpc,rds-postgres,ecs-fargate-cluster,ecr-repo,frontend-cdn,secrets}/}`
- `apps/api/Dockerfile` (multi-stage Debian slim build per ADR-0014
  follow-through; image 554 MB; smoke-tested locally with HTTP 503
  DOWN response on bad creds, validating the full stack of
  Node + Hono + Prisma engine + DB ping)
- `apps/api/.dockerignore`
- `~/.local/bin/terraform` v1.15.4 installed locally; `~/.zshrc`
  appended with `export PATH="$HOME/.local/bin:$PATH"`
- `docs/02-roadmap.md` Phase-0 DoD updated from "plan only" to
  "apply against opentrade-dev cleanly"
- `docs/decisions/README.md` ADR index gains row for ADR-0017

End-to-end validation that occurred during Commit number-nine:

- `terraform fmt -recursive` — clean (3 alignment fixes auto-applied
  during initial run)
- `terraform validate` against `bootstrap/state-backend/` — clean
- `terraform validate` against `environments/dev/` — clean
- `bootstrap/state-backend/`: `terraform apply` produced S3 bucket
  - DynamoDB lock table in `opentrade-dev`
- `environments/dev/`: `terraform init` (against the just-applied
  remote backend) + `terraform plan` + `terraform apply` produced
  the full Phase-0 stack
- `terraform output` (dev) returned populated values for every
  output — see Commit number-nine commit message

Follow-ups tracked in `docs/03-status.md`:

- **Phase 1**: write the apps/api ECS task definition + service +
  ALB; push first release-tagged image to ECR; add CloudWatch alarms
  for service health.
- **Phase 1**: populate the three Secrets Manager value slots with
  real `JWT_SECRET` / `PRIVY_APP_SECRET` / `DEEPL_API_KEY` values via
  CLI; rotate JWT secret to ES256 keypair per rule 50.
- **Phase 4+**: introduce `environments/staging/` + `environments/prod/`
  alongside the SCP module per ADR-0016 D7.
- **Phase 4+**: enable `us-east-1` in `opentrade-management` for
  CloudFront ACM + Route 53 work, so the `frontend-cdn` module can
  attach `aliases` for `opentrade.io` / `console.opentrade.io`.
- **Phase 4+**: revisit RDS Multi-AZ, dual NAT, WAF, and Performance
  Insights for the `prod` environment via successor ADR.

## References

- [ADR-0002](./0002-aws-stack.md) — AWS as sole cloud
- [ADR-0010](./0010-split-web-and-console.md) — two CloudFronts; per-app
  `X-Robots-Tag` differentiation
- [ADR-0014](./0014-api-runtime-architecture.md) — Dockerfile contract
  (Prisma engines copy, tsup bundling, env fail-fast)
- [ADR-0016](./0016-aws-account-architecture.md) — Organization, accounts,
  SSO; bootstraps the trust domain this ADR provisions resources into
- [`.cursor/rules/50-security.mdc`](../../.cursor/rules/50-security.mdc) —
  secret-handling rules
- [`.cursor/rules/80-aws-accounts.mdc`](../../.cursor/rules/80-aws-accounts.mdc)
  — operational AWS discipline
- [Terraform CHANGELOG 1.15](https://github.com/hashicorp/terraform/blob/v1.15/CHANGELOG.md)
- [AWS provider 5.x release notes](https://github.com/hashicorp/terraform-provider-aws/releases)
- [Prisma binary engine layout](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections#postgresql)
