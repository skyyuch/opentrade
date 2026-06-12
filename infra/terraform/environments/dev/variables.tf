variable "region" {
  description = "AWS region. Per ADR-0016 D2, OpenTrade workloads run in ap-southeast-1."
  type        = string
  default     = "ap-southeast-1"
}

variable "aws_profile" {
  description = "Local SSO profile to assume. Per rule 80, daily work uses opentrade-dev."
  type        = string
  default     = "opentrade-dev"
}

variable "account_id" {
  description = "Expected AWS account ID. Used to fail fast if the caller is wired to the wrong account."
  type        = string
  default     = "371637912734"
}

variable "environment" {
  description = "Environment name; flows into resource names and `Environment` tag."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "owner" {
  description = "Human owner tag. Phase 0 has one human; Phase 4+ may switch to a team identifier."
  type        = string
  default     = "skyyu"
}

variable "name_prefix" {
  description = "Resource name prefix; produces names like `opentrade-dev-vpc`. Keeps every resource visually grouped in the AWS console."
  type        = string
  default     = "opentrade-dev"
}

variable "github_repository" {
  description = "GitHub repository (owner/name, case-sensitive) whose main-branch workflow runs may assume the deploy role (ADR-0047)."
  type        = string
  default     = "skyyuch/opentrade"
}

# --------------------------------------------------------------------------
# Network
# --------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC. /16 leaves room for /20 subnets per AZ if we ever need to scale."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Two AZs in `region`. Two is enough for dev (no Multi-AZ failover); Phase 4+ prod will use three."
  type        = list(string)
  default     = ["ap-southeast-1a", "ap-southeast-1b"]
}

# --------------------------------------------------------------------------
# RDS
# --------------------------------------------------------------------------

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is the cheapest Postgres class on ARM Graviton, good for Phase 0 dev volume."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  description = "Initial gp3 storage. RDS auto-scales storage if `max_allocated_storage` is set, which the module does."
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Initial Postgres database name created on the instance. apps/api targets this."
  type        = string
  default     = "opentrade"
}

variable "db_username" {
  description = "Master username for RDS. The password is generated and managed by Secrets Manager."
  type        = string
  default     = "opentrade_admin"
}

# --------------------------------------------------------------------------
# Application secret slots
# --------------------------------------------------------------------------
# Per rule 50 + ADR-0017 D8, only the *names* of secrets are managed by
# Terraform. The actual secret values are written outside Terraform via
# `aws secretsmanager put-secret-value` so they never enter state files.

variable "app_secret_names" {
  description = "Secrets Manager secret names that apps/api will read. Slots only — values populated outside Terraform."
  type        = list(string)

  # Mirrors the runtime requirements of `apps/api/src/shared/env.ts`
  # (ADR-0046 D9). Notes:
  #   - `database-url` holds the full Postgres connection string, composed
  #     by the operator from the RDS endpoint + managed master password so
  #     it never enters Terraform state (rule 50).
  #   - `jwt-private-key-pem` / `jwt-public-key-pem` are the ES256 keypair;
  #     the former symmetric `jwt-secret` slot was removed (never populated,
  #     superseded by the keypair — rule 50 forbids HS256 anyway).
  #   - `deepl-api-key` is deprecated but kept: ADR-0027 may rewire it for
  #     on-demand translation.
  default = [
    "opentrade/dev/database-url",
    "opentrade/dev/privy-app-id",
    "opentrade/dev/privy-app-secret",
    "opentrade/dev/privy-verification-key",
    "opentrade/dev/jwt-private-key-pem",
    "opentrade/dev/jwt-public-key-pem",
    "opentrade/dev/pinata-jwt",
    "opentrade/dev/chain-relayer-private-key",
    "opentrade/dev/default-tenant-id",
    "opentrade/dev/review-registry-address",
    "opentrade/dev/kol-signal-registry-address",
    "opentrade/dev/kol-note-registry-address",
    "opentrade/dev/deepl-api-key",
  ]
}
