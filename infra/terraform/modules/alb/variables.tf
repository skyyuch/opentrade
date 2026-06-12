variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-alb'."
  type        = string
}

variable "vpc_id" {
  description = "VPC the ALB and target groups live in."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets (>= 2 AZs) the internet-facing ALB attaches to."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "An ALB requires subnets in at least two availability zones."
  }
}

variable "apps" {
  description = <<-EOT
    Routed applications, keyed by app name (e.g. web, console, api). The key
    doubles as the routing-header match value each CloudFront distribution
    injects (ADR-0046 D3). One target group + one listener rule per entry.
  EOT
  type = map(object({
    container_port    = number
    health_check_path = string
    priority          = number
  }))

  validation {
    condition     = length(var.apps) == length(distinct([for app in var.apps : app.priority]))
    error_message = "Each app must have a unique listener rule priority."
  }
}

variable "routing_header_name" {
  description = "Custom header CloudFront injects at the origin and the listener rules match on. Requests without it hit the 403 default action."
  type        = string
  default     = "X-Opentrade-App"
}

variable "health_check_interval_seconds" {
  description = "Seconds between target health checks."
  type        = number
  default     = 30
}

variable "deregistration_delay_seconds" {
  description = "Draining time before a deregistered target is dropped. Dev keeps it short for fast deploy cycles; prod may raise it."
  type        = number
  default     = 30
}

variable "idle_timeout_seconds" {
  description = "ALB idle connection timeout. Must exceed the slowest expected SSR/API response."
  type        = number
  default     = 60
}

variable "enable_deletion_protection" {
  description = "Phase 0 dev: false (we may destroy/recreate). Phase 4+ prod: true."
  type        = bool
  default     = false
}
