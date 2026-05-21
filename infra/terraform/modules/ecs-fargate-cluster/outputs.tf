output "cluster_arn" {
  description = "ECS cluster ARN."
  value       = aws_ecs_cluster.this.arn
}

output "cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "task_execution_role_arn" {
  description = "Role ECS itself assumes to pull images, fetch secrets, write logs."
  value       = aws_iam_role.task_execution.arn
}

output "task_role_arn" {
  description = "Role the running container's process assumes; application IAM goes here."
  value       = aws_iam_role.task.arn
}

output "log_group_name" {
  description = "CloudWatch log group every task should stream stdout/stderr into."
  value       = aws_cloudwatch_log_group.app.name
}

output "log_group_arn" {
  description = "ARN of the application log group."
  value       = aws_cloudwatch_log_group.app.arn
}
