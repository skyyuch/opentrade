# OpenTrade — Terraform IaC

> All cloud infrastructure for OpenTrade lives in this directory.
> The shape, scope, and Phase-0 apply boundary are ratified in
> [ADR-0017](../../docs/decisions/0017-terraform-iac-and-phase0-apply-scope.md).

---

## Layout

```
infra/terraform/
├── README.md                  ← you are here
├── bootstrap/
│   └── state-backend/         ← one-time bootstrap; creates the S3 bucket
│                                + DynamoDB lock table that every other
│                                workspace stores its remote state in.
│                                Uses local state itself (chicken-and-egg).
├── environments/
│   └── dev/                   ← composition root for opentrade-dev
│                                (account 371637912734).  Wires every
│                                module together.  This is what you `apply`
│                                day-to-day.
└── modules/
    ├── alb/                   ← single internet-facing ALB; CloudFront
    │                            header routing to per-app target groups,
    │                            403 default action (ADR-0046 D3)
    ├── vpc/                   ← VPC + public/private subnets + IGW + NAT
    ├── rds-postgres/          ← Postgres 16 RDS instance + Secrets Manager
    │                            managed master password
    ├── ecs-fargate-cluster/   ← ECS cluster (no service yet) + task roles
    │                            + log group
    ├── ecr-repo/              ← ECR repository for one container image
    ├── frontend-cdn/          ← S3 (private, OAC) + CloudFront for one
    │                            Next.js app artefact
    └── secrets/               ← Secrets Manager scaffolding (empty slots
                                 for app secrets; values populated outside
                                 Terraform per rule 50)
```

The **module ⟂ environment** split is deliberate — modules are pure
"how to provision this thing", environments are "which combination of
those things in which account at which scale". Future `staging` and
`prod` environments (Phase 4+) will be sibling directories under
`environments/` reusing the same modules.

---

## First-time setup

### Prerequisites

- AWS CLI v2 configured per [`.cursor/rules/80-aws-accounts.mdc`][rule80]
- `aws sso login --profile opentrade-dev` produces a fresh session token
- `aws sts get-caller-identity --profile opentrade-dev` returns
  `Account: 371637912734` and role `OpenTradeAdmin`
- `terraform --version` ≥ 1.9 (use `tfenv` or `mise` if you have several)

### Bootstrap the state backend (one-time per repo)

The state backend has a chicken-and-egg problem: Terraform wants to
store its state in S3, but the S3 bucket itself has to be created by
Terraform. We solve it by giving the bootstrap workspace its own
**local** state, applying it once, and then committing the
`terraform.tfstate` artefact under `bootstrap/state-backend/.local-state/`
(gitignored).

```bash
cd infra/terraform/bootstrap/state-backend
terraform init                # downloads providers; uses local backend
terraform plan -out tfplan    # shows S3 bucket + DynamoDB table
terraform apply tfplan        # ~30s; creates both
```

After this runs once, the state backend is live and every other
workspace can reference it via `backend "s3"` blocks.

### Apply the dev environment

```bash
cd infra/terraform/environments/dev
terraform init                # downloads providers + reads remote state
terraform plan -out tfplan    # shows VPC + RDS + ECS + ECR + 2× CDN
                              # + Secrets Manager
terraform apply tfplan        # ~10–15 min; RDS is the slow part
```

Expected resources after a successful apply (per ADR-0017):

| Module                | Resources created                                  |
| --------------------- | -------------------------------------------------- |
| `vpc`                 | 1 VPC, 2 public + 2 private subnets, IGW, 1 NAT    |
| `rds-postgres`        | 1 db instance, 1 subnet group, 1 SG, 1 param group |
| `ecs-fargate-cluster` | 1 cluster, 1 task-exec role, 1 task role, 1 LG     |
| `ecr-repo`            | 1 ECR repository (`opentrade-api`)                 |
| `frontend-cdn` × 2    | 2 S3 buckets (private), 2 CloudFront distributions |
| `secrets`             | 3 Secrets Manager secrets (empty slots)            |

Expected steady-state cost: **~$54 USD/month** (per ADR-0017
"Cost envelope"). The `phase-0-soft-cap` budget alert at $50/month
**will fire** during the first full month — that is the alert's
design, not a violation.

---

## Daily commands

```bash
# From environments/dev/
terraform fmt -recursive          # auto-format
terraform validate                # syntax + provider schema
terraform plan                    # preview changes
terraform apply                   # apply (interactive prompt)
terraform destroy                 # tear down (interactive prompt)
terraform state list              # list everything in state
terraform output                  # print module outputs
```

Whenever you change a `.tf` file, run `fmt` + `validate` before
`plan`. The PR CI (per ADR-0018) enforces both via
`.github/workflows/terraform.yml`.

### Updating the provider lock file

Per ADR-0018 + rule 81, `.terraform.lock.hcl` **IS committed** for
both workspaces (`bootstrap/state-backend/` and `environments/dev/`).
That lock file is what lets CI's
`terraform init -backend=false` resolve providers from a pinned set
without contacting AWS.

When you bump `versions.tf` (e.g., AWS provider 5.83 → 5.90), refresh
the multi-platform hashes once so both Mac (founder) and Linux (CI)
runners pick up the new providers:

```bash
cd infra/terraform/bootstrap/state-backend
terraform providers lock \
  -platform=linux_amd64 \
  -platform=darwin_arm64 \
  -platform=darwin_amd64

cd ../../environments/dev
terraform providers lock \
  -platform=linux_amd64 \
  -platform=darwin_arm64 \
  -platform=darwin_amd64
```

Commit the resulting `.terraform.lock.hcl` deltas alongside the
`versions.tf` bump in the same PR.

---

## Module conventions (codified in ADR-0017 D7)

Every module under `modules/` ships with exactly four files:

| File           | Purpose                                                  |
| -------------- | -------------------------------------------------------- |
| `versions.tf`  | `required_version`, `required_providers`                 |
| `variables.tf` | All inputs, with `type`, `description`, `default` if any |
| `main.tf`      | Resources                                                |
| `outputs.tf`   | All outputs, with `description`                          |

Modules **must not** declare a `provider` block — providers are
declared at the environment level and passed in implicitly.
Modules **must not** read environment variables — every input is
explicit.

---

## Deploy checklist

Phase 1 production deploy is human-in-loop until the OIDC role in
ADR-0018 D7 lands. Run in order:

1. `cd infra/terraform/environments/dev && terraform apply` — only
   when infra has changed; otherwise skip.
2. Push the `apps/api` image to ECR per
   [`apps/api/README.md`](../../apps/api/README.md#push-to-ecr-phase-0-dev-environment).
3. Apply schema + data migrations per
   [`apps/api/README.md` §production deployment runbook](../../apps/api/README.md#production-deployment-runbook).
   The data-side steps (`db:backfill:zh-hans` + `db:backfill:source-locale`
   - `db:backfill:sentiment`) are canonicalised in
     [`packages/db/README.md`](../../packages/db/README.md#pre-deploy-backfill-per-adr-0026--adr-0027--adr-0028).
4. Roll the ECS Fargate service. `/v1/health` HEALTHCHECK gates
   traffic.

Each step is idempotent on its own; the order matters so the new
container observes the data shape it was compiled against.

---

## What is **not** here in Phase 0

- ECS service / task definition for `apps/api` — ships in Phase 1 when
  `apps/api` has a release-tagged image in ECR.
- Custom domain + ACM certificate — needs `us-east-1` opt-in (per
  ADR-0016 implementation notes); deferred to Phase 4+.
- WAF / Shield Advanced — Phase 4+ prod only (per ADR-0002).
- Multi-AZ RDS, dual NAT — Phase 4+ prod only (per ADR-0017 D5+D4).
- Service Control Policies — Phase 4+ (per ADR-0016 D7).
- `staging` / `prod` environments — Phase 4+ (per ADR-0016 D1).

---

## Hard rules (per rule 80 + rule 50 + rule 81)

- ❌ Never commit `*.tfstate` / `*.tfvars` (`.gitignore` enforces this)
- ❌ Never put secrets in `*.tf` or `*.tfvars` — values go to Secrets
  Manager via the AWS console or `aws secretsmanager put-secret-value`,
  outside the Terraform state.
- ❌ Never write the AWS region as a literal string — use `var.region`.
- ❌ Never write account IDs as literals in module code — pass via vars.
- ❌ Never `terraform apply` against the management account — only
  `opentrade-dev` accepts workload Terraform until Phase 4+.
- ❌ Never `terraform apply` from CI — CI only runs `validate` per
  ADR-0018 D7. `apply` is human-in-loop until the Phase 4+ OIDC role
  lands.
- ✅ Always commit `.terraform.lock.hcl` alongside any `versions.tf`
  change so CI and laptops resolve identical providers.

---

## Related decisions

- [ADR-0002](../../docs/decisions/0002-aws-stack.md) — AWS sole cloud
- [ADR-0010](../../docs/decisions/0010-split-web-and-console.md) — two
  Next.js apps, two CloudFronts
- [ADR-0014](../../docs/decisions/0014-api-runtime-architecture.md) —
  apps/api Dockerfile contract
- [ADR-0016](../../docs/decisions/0016-aws-account-architecture.md) —
  AWS Organization, accounts, SSO
- [ADR-0017](../../docs/decisions/0017-terraform-iac-and-phase0-apply-scope.md)
  — this directory's structure and Phase-0 apply scope
- [`.cursor/rules/80-aws-accounts.mdc`][rule80] — daily AWS operational
  discipline

[rule80]: ../../.cursor/rules/80-aws-accounts.mdc
