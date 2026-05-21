variable "secret_names" {
  description = "List of Secrets Manager secret names to create as empty slots. Convention: `opentrade/<env>/<key>`."
  type        = list(string)

  validation {
    condition = alltrue([
      for n in var.secret_names : can(regex("^opentrade/[a-z0-9-]+/[a-z0-9-]+$", n))
    ])
    error_message = "Every secret name must follow the `opentrade/<env>/<key>` convention with lowercase + digits + hyphens."
  }
}

variable "recovery_window_in_days" {
  description = "Soft-delete window after `aws secretsmanager delete-secret`. Phase 0 dev: 0 (immediate). Phase 4+ prod: 30."
  type        = number
  default     = 0

  validation {
    condition     = var.recovery_window_in_days == 0 || (var.recovery_window_in_days >= 7 && var.recovery_window_in_days <= 30)
    error_message = "recovery_window_in_days must be 0 (force delete) or between 7 and 30."
  }
}
