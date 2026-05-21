# --------------------------------------------------------------------------
# Identity sanity check
# --------------------------------------------------------------------------
# Stop a misconfigured profile before any AWS API call mutates the
# wrong account. ADR-0016 D5 + rule 80: OpenTrade work always uses
# `--profile opentrade-dev` (account 371637912734).

data "aws_caller_identity" "current" {}

resource "null_resource" "guard_account_id" {
  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.account_id
      error_message = "Caller is account ${data.aws_caller_identity.current.account_id} but expected ${var.account_id}. Did you forget --profile opentrade-dev?"
    }
  }
}

# --------------------------------------------------------------------------
# Network
# --------------------------------------------------------------------------

module "vpc" {
  source = "../../modules/vpc"

  name_prefix              = var.name_prefix
  vpc_cidr                 = var.vpc_cidr
  availability_zones       = var.availability_zones
  single_nat_gateway       = true # Dev cost-tuning per ADR-0017 D4
  enable_flow_logs         = true
  flow_logs_retention_days = 14
}

# --------------------------------------------------------------------------
# RDS Postgres
# --------------------------------------------------------------------------
# Phase 0 ships the database with NO client SGs attached — the apps/api
# ECS service won't exist until Phase 1. The `client_security_group_ids`
# input is therefore left empty; Phase 1 will pass the service SG.

module "rds" {
  source = "../../modules/rds-postgres"

  name_prefix          = var.name_prefix
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  instance_class       = var.db_instance_class
  allocated_storage_gb = var.db_allocated_storage_gb
  db_name              = var.db_name
  username             = var.db_username

  # Phase 0 dev defaults are baked into the module; the environment
  # composition root is where they would be overridden if needed.
  multi_az                     = false
  deletion_protection          = false
  skip_final_snapshot          = true
  performance_insights_enabled = false
  client_security_group_ids    = []
}

# --------------------------------------------------------------------------
# Secrets Manager scaffolding
# --------------------------------------------------------------------------

module "app_secrets" {
  source = "../../modules/secrets"

  secret_names            = var.app_secret_names
  recovery_window_in_days = 0 # Dev: no soft-delete window so re-applies are clean
}

# --------------------------------------------------------------------------
# ECR repository for apps/api
# --------------------------------------------------------------------------

module "ecr_api" {
  source = "../../modules/ecr-repo"

  repository_name      = "opentrade-api"
  image_tag_mutability = "MUTABLE" # Dev: `:dev` tag overwrites freely
  scan_on_push         = true
  force_delete         = true
}

# --------------------------------------------------------------------------
# ECS Fargate cluster (no service yet)
# --------------------------------------------------------------------------
# The task role gets `secretsmanager:GetSecretValue` on the union of:
#   - app secret slots (jwt, privy, deepl)
#   - the RDS-managed master password secret
# Phase 1 will add the apps/api task definition + service + load balancer.

module "ecs" {
  source = "../../modules/ecs-fargate-cluster"

  name_prefix                = var.name_prefix
  container_insights_enabled = true
  log_retention_days         = 14

  task_role_managed_secret_arns = concat(
    module.app_secrets.secret_arn_list,
    [module.rds.master_password_secret_arn],
  )
}

# --------------------------------------------------------------------------
# Frontend CDNs (one per Next.js app, per ADR-0010)
# --------------------------------------------------------------------------

module "web_cdn" {
  source = "../../modules/frontend-cdn"

  name        = "web"
  name_prefix = var.name_prefix
  bucket_name = "${var.name_prefix}-web-${var.account_id}"
  noindex     = false # apps/web is the SEO-facing surface
}

module "console_cdn" {
  source = "../../modules/frontend-cdn"

  name        = "console"
  name_prefix = var.name_prefix
  bucket_name = "${var.name_prefix}-console-${var.account_id}"
  noindex     = true # Console is robots-disallow per ADR-0010
}
