variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-postgres'."
  type        = string
}

variable "vpc_id" {
  description = "VPC the database lives in."
  type        = string
}

variable "private_subnet_ids" {
  description = "Subnets for the DB subnet group. Must be private (not internet-routable)."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "RDS subnet groups need at least two subnets in different AZs even for single-AZ instances."
  }
}

variable "instance_class" {
  description = "RDS instance class. db.t4g.micro is the cheapest Postgres on Graviton."
  type        = string
}

variable "allocated_storage_gb" {
  description = "Initial gp3 storage allocation."
  type        = number
}

variable "max_allocated_storage_gb" {
  description = "Maximum storage RDS will autoscale to without operator intervention. 100GB is plenty for dev; way before that we'd want a bigger instance class anyway."
  type        = number
  default     = 100
}

variable "engine_version" {
  description = "Postgres major.minor. Must match an RDS-supported version in the target region; check via `aws rds describe-db-engine-versions --engine postgres`. Phase-0 default is the highest 16.x available in ap-southeast-1 as of 2026-05."
  type        = string
  default     = "16.14"
}

variable "db_name" {
  description = "Initial database name created on the instance."
  type        = string
}

variable "username" {
  description = "Master username. The matching password is auto-generated and stored in Secrets Manager."
  type        = string
}

variable "multi_az" {
  description = "Phase 0 dev: false. Phase 4+ prod: true. Multi-AZ doubles cost but provides automatic failover."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Daily automated backup retention. Even dev keeps 7 days; prod will move to 30."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Phase 0 dev: false (we may destroy/recreate during iteration). Phase 4+ prod: true."
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Phase 0 dev: true (no point snapshotting an empty DB). Phase 4+ prod: false."
  type        = bool
  default     = true
}

variable "performance_insights_enabled" {
  description = "Defer Performance Insights to Phase 1 (free tier covers 7 days retention)."
  type        = bool
  default     = false
}

variable "client_security_groups" {
  description = "Map of static client name -> security group ID allowed to talk to the database on 5432. A map (not a list) so for_each keys stay known at plan time even when the SG IDs are created in the same apply; list/toset would force a two-phase -target apply. Empty in Phase 0; UAT passes the apps/api + outbox-worker SGs."
  type        = map(string)
  default     = {}
}
