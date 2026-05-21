# Bootstrap — Terraform state backend

This workspace exists **only** to create the S3 bucket and DynamoDB
table that every other Terraform workspace in this repo uses for
remote state + state-lock.

> Apply this workspace **once per repo lifetime**. After the resources
> exist, you almost never come back here.

---

## Why a separate workspace

Terraform's `backend "s3"` block reads its own state from the very S3
bucket it would otherwise have to create. Solving this chicken-and-egg
needs an isolated workspace whose own state lives **locally**.

Once the S3 bucket and DynamoDB table exist, every other workspace
(starting with `environments/dev/`) writes its state into S3 + locks
through DynamoDB. Only this directory keeps a local state file.

---

## How to apply

```bash
# Make sure you're authenticated to opentrade-dev:
aws sso login --profile opentrade-dev
aws sts get-caller-identity --profile opentrade-dev
# → Account: 371637912734, role OpenTradeAdmin

cd infra/terraform/bootstrap/state-backend
terraform init                  # local backend; ~10s
terraform plan -out tfplan      # 2 resources to add
terraform apply tfplan          # ~30s
```

The local `terraform.tfstate` lives in this directory after apply.
It is gitignored.

---

## Outputs

After apply, run `terraform output` to get:

- `state_bucket_name` — paste into every workspace's `backend.tf`
- `lock_table_name` — same
- `backend_block_snippet` — full block ready to copy

---

## What you should see on AWS

| Resource               | Identifier                                                |
| ---------------------- | --------------------------------------------------------- |
| S3 bucket              | `opentrade-tfstate-dev-371637912734`                      |
| Bucket versioning      | Enabled                                                   |
| Bucket encryption      | SSE-S3 (AES256), bucket-key on                            |
| Bucket public access   | Fully blocked                                             |
| Lifecycle rule         | 90-day non-current version expiration                     |
| DynamoDB table         | `opentrade-tfstate-locks-dev`                             |
| Billing mode           | PAY_PER_REQUEST (essentially free at Phase-0 lock volume) |
| Point-in-time recovery | Enabled                                                   |
| Encryption at rest     | AWS-managed key                                           |

Steady-state monthly cost: <$1.

---

## Re-running

`terraform plan` after the initial apply should show **no changes**
unless you bumped a `var.*` default. If you do bump a var, prefer
writing a successor ADR before re-applying — these resources are
load-bearing for the rest of the IaC.

---

## Tearing down

Don't, unless you are wiping the project. `terraform destroy` here
deletes every other workspace's ability to track state. If you really
mean it:

```bash
# 1. Migrate every workspace's state to local first:
cd ../../environments/dev
terraform init -migrate-state -backend=false  # answer "no" to copying
# 2. Then destroy this:
cd ../../bootstrap/state-backend
terraform destroy
```

Document the reason in a fresh ADR before doing this.
