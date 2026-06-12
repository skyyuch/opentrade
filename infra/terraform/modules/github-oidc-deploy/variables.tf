variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-github-deploy'."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, as 'owner/name'. Case-sensitive — must match the canonical repository name exactly."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Must be 'owner/name' (e.g. skyyuch/opentrade)."
  }
}

variable "allowed_ref" {
  description = "Git ref whose workflow runs may assume the role. Deploys only ever run from main (rule 70: main is the only long-lived branch)."
  type        = string
  default     = "refs/heads/main"
}

variable "ecr_repository_arns" {
  description = "ECR repository ARNs the role may push images to. Push-only scope: the role cannot create or delete repositories."
  type        = list(string)

  validation {
    condition     = length(var.ecr_repository_arns) > 0 && alltrue([for a in var.ecr_repository_arns : can(regex("^arn:aws:ecr:", a))])
    error_message = "Provide at least one ECR repository ARN (arn:aws:ecr:...)."
  }
}

variable "ecs_service_arns" {
  description = "ECS service ARNs the role may force new deployments on. The role cannot register task definitions or pass IAM roles, so it can only roll out whatever image tag the service already references."
  type        = list(string)

  validation {
    condition     = length(var.ecs_service_arns) > 0 && alltrue([for a in var.ecs_service_arns : can(regex("^arn:aws:ecs:", a))])
    error_message = "Provide at least one ECS service ARN (arn:aws:ecs:...)."
  }
}
