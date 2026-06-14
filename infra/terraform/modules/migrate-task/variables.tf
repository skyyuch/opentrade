variable "name_prefix" {
  description = "Resource naming prefix (e.g. opentrade-dev)."
  type        = string
}

variable "cluster_arn" {
  description = "ECS cluster ARN where the migrate task runs (via run-task)."
  type        = string
}

variable "task_execution_role_arn" {
  description = "IAM role ARN for ECS to pull the image and inject secrets."
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
  description = "Full ECR image URI for the migrate stage, e.g. <repo>:migrate."
  type        = string
}

variable "database_url_secret_arn" {
  description = "Secrets Manager ARN of the full Postgres connection string (the database-url app secret), injected as DATABASE_URL. NOT the RDS master-password JSON secret."
  type        = string
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
