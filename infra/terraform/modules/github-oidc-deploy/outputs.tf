output "role_arn" {
  description = "Deploy role ARN. Set as the AWS_DEPLOY_ROLE_ARN GitHub repository variable; deploy.yml assumes it via aws-actions/configure-aws-credentials."
  value       = aws_iam_role.deploy.arn
}

output "role_name" {
  description = "Deploy role name, for IAM console inspection."
  value       = aws_iam_role.deploy.name
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC identity provider (one per account)."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "migrate_role_arn" {
  description = "Dedicated migration role ARN (ADR-0051). Set as the AWS_MIGRATE_ROLE_ARN GitHub repository variable; the deploy.yml migrate gate assumes it to run prisma migrate deploy. Null when create_migrate_role = false."
  value       = var.create_migrate_role ? aws_iam_role.migrate[0].arn : null
}
