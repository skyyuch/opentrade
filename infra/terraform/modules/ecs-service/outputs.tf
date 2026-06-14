output "service_name" {
  description = "Name of the ECS service (used by CI to force new deployments)."
  value       = aws_ecs_service.this.name
}

output "service_arn" {
  description = "ARN of the ECS service."
  value       = aws_ecs_service.this.id
}

output "task_definition_arn" {
  description = "ARN of the task definition revision the service runs."
  value       = aws_ecs_task_definition.this.arn
}

output "task_definition_family" {
  description = "Task definition family name."
  value       = aws_ecs_task_definition.this.family
}

output "security_group_id" {
  description = "Service security group ID. Pass into the RDS module's client_security_groups map for services that need Postgres."
  value       = aws_security_group.service.id
}
