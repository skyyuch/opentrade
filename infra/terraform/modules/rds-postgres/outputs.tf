output "db_endpoint" {
  description = "Postgres endpoint hostname:port. Use this when composing DATABASE_URL."
  value       = aws_db_instance.this.endpoint
}

output "db_address" {
  description = "Postgres endpoint hostname only (no port)."
  value       = aws_db_instance.this.address
}

output "db_port" {
  description = "Postgres listener port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Initial database name."
  value       = aws_db_instance.this.db_name
}

output "db_username" {
  description = "Master username; the matching password is in Secrets Manager (see master_password_secret_arn)."
  value       = aws_db_instance.this.username
}

output "master_password_secret_arn" {
  description = "ARN of the RDS-managed Secrets Manager secret holding the master password. apps/api reads it via aws-sdk."
  value       = one(aws_db_instance.this.master_user_secret[*].secret_arn)
}

output "security_group_id" {
  description = "Security group attached to the Postgres instance. Pass into the apps/api ECS service SG to allow ingress."
  value       = aws_security_group.this.id
}

output "subnet_group_name" {
  description = "DB subnet group covering both private subnets."
  value       = aws_db_subnet_group.this.name
}

output "parameter_group_name" {
  description = "Custom parameter group; future tuning happens here."
  value       = aws_db_parameter_group.this.name
}

output "instance_arn" {
  description = "RDS instance ARN; useful for CloudWatch alarms and IAM policies."
  value       = aws_db_instance.this.arn
}
