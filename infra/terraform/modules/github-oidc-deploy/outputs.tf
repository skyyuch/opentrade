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
