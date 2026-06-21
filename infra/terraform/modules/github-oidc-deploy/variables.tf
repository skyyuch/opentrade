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

# --------------------------------------------------------------------------
# Dedicated migration role (ADR-0051) — optional, off by default
# --------------------------------------------------------------------------
# A SECOND, single-purpose role trust-pinned to the same repo+ref. It can
# RunTask the migrate task definition (any revision) inside one cluster,
# PassRole exactly the migrate task/execution roles, and push the :migrate
# image — and nothing else. Kept separate from the deploy role so a compromise
# of one credential does not grant the other's powers. The deploy.yml migrate
# gate assumes it; the app rollout jobs keep using the deploy role.

variable "create_migrate_role" {
  description = "Whether to create the dedicated migration role (ADR-0051). When false, only the deploy role is created and the migrate_* inputs are ignored."
  type        = bool
  default     = false
}

variable "migrate_task_definition_arn" {
  description = "ARN of the migrate task definition (any revision). The migration role's RunTask grant covers the whole family (trailing :<revision> is stripped and wildcarded). Required when create_migrate_role = true."
  type        = string
  default     = ""
}

variable "migrate_cluster_arn" {
  description = "ECS cluster ARN the migration role may RunTask / DescribeTasks within (enforced via an ecs:cluster condition). Required when create_migrate_role = true."
  type        = string
  default     = ""
}

variable "migrate_pass_role_arns" {
  description = "IAM role ARNs the migration role may PassRole to ECS — exactly the migrate task role and execution role. Constrained by an iam:PassedToService = ecs-tasks.amazonaws.com condition. Required when create_migrate_role = true."
  type        = list(string)
  default     = []
}

variable "migrate_ecr_repository_arns" {
  description = "ECR repository ARNs the migration role may push the :migrate image to (typically just opentrade-api). Required when create_migrate_role = true."
  type        = list(string)
  default     = []
}
