output "task_definition_arn" {
  description = "ARN of the SFC sync task definition."
  value       = aws_ecs_task_definition.sync_sfc.arn
}

output "eventbridge_rule_arn" {
  description = "ARN of the weekly EventBridge schedule rule."
  value       = aws_cloudwatch_event_rule.weekly_sync.arn
}

output "security_group_id" {
  description = "Security group ID of the sync task. Pass to RDS client_security_group_ids."
  value       = aws_security_group.sync_task.id
}
