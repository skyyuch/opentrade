output "task_definition_arn" {
  description = "ARN of the migrate task definition. Pass to `aws ecs run-task --task-definition`."
  value       = aws_ecs_task_definition.migrate.arn
}

output "task_definition_family" {
  description = "Family name of the migrate task definition (stable handle for run-task across revisions)."
  value       = aws_ecs_task_definition.migrate.family
}

output "security_group_id" {
  description = "Security group ID of the migrate task. The composition root adds this to the RDS client_security_groups map so RDS owns the ingress (ADR-0048)."
  value       = aws_security_group.migrate.id
}
