output "vpc_id" {
  description = "VPC where every workload lives."
  value       = module.vpc.vpc_id
}

output "vpc_private_subnet_ids" {
  description = "Private subnet IDs; consumed by RDS subnet group and ECS service network config."
  value       = module.vpc.private_subnet_ids
}

output "vpc_public_subnet_ids" {
  description = "Public subnet IDs; consumed by NAT gateway and any future ALB."
  value       = module.vpc.public_subnet_ids
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint hostname. apps/api composes DATABASE_URL from this + the managed master password secret."
  value       = module.rds.db_endpoint
}

output "rds_master_password_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the auto-generated master password. apps/api reads it at boot."
  value       = module.rds.master_password_secret_arn
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN. The Phase-1 task definition + service will attach to this cluster."
  value       = module.ecs.cluster_arn
}

output "ecs_task_execution_role_arn" {
  description = "Task-execution IAM role ARN. ECS itself uses this to pull from ECR and write logs."
  value       = module.ecs.task_execution_role_arn
}

output "ecs_task_role_arn" {
  description = "Application IAM role assumed by the running container. Future Phase-1 IAM policy attaches here for Secrets Manager + S3 reads."
  value       = module.ecs.task_role_arn
}

output "ecr_repo_url" {
  description = "ECR repository URL for the apps/api image. `docker push` target."
  value       = module.ecr_api.repository_url
}

output "ecr_web_repo_url" {
  description = "ECR repository URL for the apps/web image. `docker push` target."
  value       = module.ecr_web.repository_url
}

output "ecr_console_repo_url" {
  description = "ECR repository URL for the apps/console image. `docker push` target."
  value       = module.ecr_console.repository_url
}

output "web_cdn_url" {
  description = "CloudFront URL for apps/web. Phase 4+ will swap this for opentrade.io behind ACM."
  value       = module.web_cdn.cloudfront_url
}

output "web_bucket_name" {
  description = "S3 bucket holding the apps/web Next.js artefact."
  value       = module.web_cdn.bucket_name
}

output "console_cdn_url" {
  description = "CloudFront URL for apps/console. Carries X-Robots-Tag: noindex, nofollow per ADR-0010."
  value       = module.console_cdn.cloudfront_url
}

output "console_bucket_name" {
  description = "S3 bucket holding the apps/console Next.js artefact."
  value       = module.console_cdn.bucket_name
}

output "sfc_sync_task_definition_arn" {
  description = "ARN of the SFC broker sync ECS task definition (ADR-0020)."
  value       = module.sfc_sync.task_definition_arn
}

output "sfc_sync_eventbridge_rule_arn" {
  description = "ARN of the weekly EventBridge rule for SFC sync."
  value       = module.sfc_sync.eventbridge_rule_arn
}

output "app_secret_arns" {
  description = "ARNs of every Secrets Manager slot apps/api reads. Values are written outside Terraform per rule 50."
  value       = module.app_secrets.secret_arns
}

output "assets_cdn_url" {
  description = "CloudFront URL for static assets (logos, avatars). Used by the logo crawl script."
  value       = module.assets_cdn.cloudfront_url
}

output "assets_bucket_name" {
  description = "S3 bucket holding static assets like broker logos."
  value       = module.assets_cdn.bucket_name
}
