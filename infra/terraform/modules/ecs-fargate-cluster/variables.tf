variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-cluster'."
  type        = string
}

variable "container_insights_enabled" {
  description = "Enable Container Insights for the cluster. Free at Phase 0 task counts; ~$0 until services are running."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Default retention for the application log group that ECS tasks will write to."
  type        = number
  default     = 14
}

variable "task_role_managed_secret_arns" {
  description = "Secrets Manager secret ARNs the running container is allowed to read. The RDS-managed master password ARN + apps/api app secret ARNs all flow in here."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for a in var.task_role_managed_secret_arns : can(regex("^arn:aws:secretsmanager:", a))])
    error_message = "Every entry must be a Secrets Manager ARN."
  }
}

variable "task_exec_kms_decrypt_key_arns" {
  description = "KMS key ARNs the task EXECUTION role may kms:Decrypt, so ECS can inject secrets encrypted with a customer-managed key (the RDS-managed master password secret) at launch (ADR-0056)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for a in var.task_exec_kms_decrypt_key_arns : can(regex("^arn:aws:kms:", a))])
    error_message = "Every entry must be a KMS key ARN (arn:aws:kms:...)."
  }
}

variable "task_role_s3_write_bucket_arns" {
  description = "S3 bucket ARNs the running container may write objects into (s3:PutObject on every key). apps/api uploads broker logos / avatars to the assets bucket through this grant."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for a in var.task_role_s3_write_bucket_arns : can(regex("^arn:aws:s3:::", a))])
    error_message = "Every entry must be an S3 bucket ARN (arn:aws:s3:::bucket-name)."
  }
}
