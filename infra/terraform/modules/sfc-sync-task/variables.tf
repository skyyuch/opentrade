variable "name_prefix" {
  description = "Resource naming prefix (e.g. opentrade-dev)."
  type        = string
}

variable "cluster_arn" {
  description = "ECS cluster ARN where the sync task runs."
  type        = string
}

variable "task_execution_role_arn" {
  description = "IAM role ARN for ECS to pull images and inject secrets."
  type        = string
}

variable "task_role_arn" {
  description = "IAM role ARN for the running container (application identity)."
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch log group for task stdout/stderr."
  type        = string
}

variable "vpc_id" {
  description = "VPC where the task runs (same as RDS)."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for the Fargate task ENI."
  type        = list(string)
}

variable "ecr_image" {
  description = "Full ECR image URI including tag (e.g. 123456.dkr.ecr.region.amazonaws.com/repo:dev)."
  type        = string
}

variable "rds_security_group_id" {
  description = "Security group ID of the RDS instance. An ingress rule is added to allow the sync task."
  type        = string
}

variable "db_secret_arn" {
  description = "Secrets Manager ARN for the RDS master password (injected as DATABASE_URL)."
  type        = string
}

variable "schedule_expression" {
  description = "EventBridge schedule expression. Default: Monday 03:00 HKT (Sunday 19:00 UTC)."
  type        = string
  default     = "cron(0 19 ? * SUN *)"
}

variable "task_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 512
}

variable "enabled" {
  description = "Set to false to disable the EventBridge schedule without destroying resources."
  type        = bool
  default     = true
}
