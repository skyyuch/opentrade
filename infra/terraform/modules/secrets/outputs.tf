output "secret_arns" {
  description = "Map of secret name → ARN. Pass into IAM policy to grant `secretsmanager:GetSecretValue`."
  value       = { for n, s in aws_secretsmanager_secret.this : n => s.arn }
}

output "secret_arn_list" {
  description = "Flat list of ARNs; convenient as input to ECS task role policy."
  value       = [for s in aws_secretsmanager_secret.this : s.arn]
}

output "secret_names" {
  description = "Echo of input names; useful for asserting downstream consumer expectations."
  value       = sort(var.secret_names)
}
