variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-<service_name>'."
  type        = string
}

variable "service_name" {
  description = "Logical service name (e.g. web, console, api, outbox-worker). Flows into resource names, the container name, and the log stream prefix."
  type        = string
}

variable "cluster_arn" {
  description = "ARN of the ECS cluster the service runs on."
  type        = string
}

variable "vpc_id" {
  description = "VPC the service security group lives in."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets the Fargate tasks run in (egress via NAT)."
  type        = list(string)
}

variable "task_execution_role_arn" {
  description = "Role ECS assumes to pull the image, fetch secrets, and write logs."
  type        = string
}

variable "task_role_arn" {
  description = "Role the running container's process assumes."
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch log group the container streams stdout/stderr into."
  type        = string
}

variable "image" {
  description = "Full container image reference including tag (e.g. '<ecr-repo-url>:dev')."
  type        = string
}

variable "command" {
  description = "Container command override. Null keeps the image's default CMD. The outbox worker reuses the api image with a different command (ADR-0046 D2)."
  type        = list(string)
  default     = null
}

variable "container_port" {
  description = "Port the container listens on. Required when the service is attached to a target group; null for background services with no inbound traffic."
  type        = number
  default     = null
}

variable "target_group_arn" {
  description = "ALB target group to register tasks into. Null for background services (no load balancer attachment)."
  type        = string
  default     = null
}

variable "alb_security_group_id" {
  description = "ALB security group admitted to the container port. Required when target_group_arn is set."
  type        = string
  default     = null
}

variable "environment" {
  description = "Plain (non-secret) environment variables for the container."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secret environment variables: env var name to Secrets Manager secret ARN. Injected by ECS at task start; values never enter Terraform state (rule 50)."
  type        = map(string)
  default     = {}
}

variable "task_cpu" {
  description = "Fargate task CPU units. UAT cost-tunes with 256 (0.25 vCPU); prod raises per service (ADR-0046 D2)."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate task memory in MiB. UAT cost-tunes with 512; prod raises per service."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of tasks to keep running. UAT runs 1 per service; prod runs >= 2 across AZs (ADR-0046 D7)."
  type        = number
  default     = 1
}

variable "health_check_grace_period_seconds" {
  description = "Grace period before ALB health checks count against new tasks. Only applies when attached to a target group."
  type        = number
  default     = 60
}
