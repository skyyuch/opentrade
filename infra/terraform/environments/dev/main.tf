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
  client_security_group_ids    = [module.sfc_sync.security_group_id]
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
# ECR repositories — one per container image (ADR-0046 D2)
# --------------------------------------------------------------------------
# The outbox worker reuses the opentrade-api image with a different
# command, so three repos cover all four UAT services.

module "ecr_api" {
  source = "../../modules/ecr-repo"

  repository_name      = "opentrade-api"
  image_tag_mutability = "MUTABLE" # Dev: `:dev` tag overwrites freely
  scan_on_push         = true
  force_delete         = true
}

module "ecr_web" {
  source = "../../modules/ecr-repo"

  repository_name      = "opentrade-web"
  image_tag_mutability = "MUTABLE" # Dev: `:dev` tag overwrites freely
  scan_on_push         = true
  force_delete         = true
}

module "ecr_console" {
  source = "../../modules/ecr-repo"

  repository_name      = "opentrade-console"
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
# Application load balancer (ADR-0046 D3)
# --------------------------------------------------------------------------
# Single internet-facing ALB fronting the three HTTP services. Each
# CloudFront distribution injects `X-Opentrade-App: <app>` as a custom
# origin header; listener rules route on it. The map key doubles as the
# header match value, so it must equal the CloudFront-side header value.

module "alb" {
  source = "../../modules/alb"

  name_prefix       = var.name_prefix
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids

  apps = {
    web = {
      container_port    = 3000
      health_check_path = "/" # Next.js SSR root; locale redirects (3xx) count as healthy
      priority          = 10
    }
    console = {
      container_port    = 3000
      health_check_path = "/"
      priority          = 20
    }
    api = {
      container_port    = 4000
      health_check_path = "/v1/health"
      priority          = 30
    }
  }
}

# --------------------------------------------------------------------------
# ECS services — Next.js front ends (ADR-0046 D2)
# --------------------------------------------------------------------------
# All NEXT_PUBLIC_* configuration is baked into the images at build time
# (ADR-0046 D5), so the running containers need no app-level environment.
# PORT=3000 / HOSTNAME=0.0.0.0 are set in the Dockerfiles.

module "service_web" {
  source = "../../modules/ecs-service"

  name_prefix             = var.name_prefix
  service_name            = "web"
  cluster_arn             = module.ecs.cluster_arn
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  task_execution_role_arn = module.ecs.task_execution_role_arn
  task_role_arn           = module.ecs.task_role_arn
  log_group_name          = module.ecs.log_group_name

  image                 = "${module.ecr_web.repository_url}:dev"
  container_port        = 3000
  target_group_arn      = module.alb.target_group_arns["web"]
  alb_security_group_id = module.alb.security_group_id
}

module "service_console" {
  source = "../../modules/ecs-service"

  name_prefix             = var.name_prefix
  service_name            = "console"
  cluster_arn             = module.ecs.cluster_arn
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  task_execution_role_arn = module.ecs.task_execution_role_arn
  task_role_arn           = module.ecs.task_role_arn
  log_group_name          = module.ecs.log_group_name

  image                 = "${module.ecr_console.repository_url}:dev"
  container_port        = 3000
  target_group_arn      = module.alb.target_group_arns["console"]
  alb_security_group_id = module.alb.security_group_id
}

# --------------------------------------------------------------------------
# SFC broker sync scheduled task (ADR-0020)
# --------------------------------------------------------------------------

module "sfc_sync" {
  source = "../../modules/sfc-sync-task"

  name_prefix             = var.name_prefix
  cluster_arn             = module.ecs.cluster_arn
  task_execution_role_arn = module.ecs.task_execution_role_arn
  task_role_arn           = module.ecs.task_role_arn
  log_group_name          = module.ecs.log_group_name
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  ecr_image               = "${module.ecr_api.repository_url}:dev"
  rds_security_group_id   = module.rds.security_group_id
  db_secret_arn           = module.rds.master_password_secret_arn
  enabled                 = false # Enable when API image with sync entry point is pushed
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

# --------------------------------------------------------------------------
# Static assets CDN (logos, avatars, etc.)
# --------------------------------------------------------------------------
# Unlike frontend-cdn, this has no SPA fallback — missing keys return 404.
# Logos are uploaded here by the broker logo crawl script.

module "assets_cdn" {
  source = "../../modules/static-assets"

  name        = "assets"
  name_prefix = var.name_prefix
  bucket_name = "${var.name_prefix}-assets-${var.account_id}"
  price_class = "PriceClass_200"
}
