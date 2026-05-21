output "repository_name" {
  description = "ECR repository name."
  value       = aws_ecr_repository.this.name
}

output "repository_url" {
  description = "ECR repository URL; the `docker push` target."
  value       = aws_ecr_repository.this.repository_url
}

output "repository_arn" {
  description = "ECR repository ARN; useful for IAM policies."
  value       = aws_ecr_repository.this.arn
}

output "registry_id" {
  description = "AWS account ID owning the repository (always the deploy account)."
  value       = aws_ecr_repository.this.registry_id
}
