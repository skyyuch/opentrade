variable "repository_name" {
  description = "ECR repository name (will appear in `<account>.dkr.ecr.<region>.amazonaws.com/<repository_name>`)."
  type        = string
}

variable "image_tag_mutability" {
  description = "MUTABLE during dev (so `:dev` keeps overwriting); IMMUTABLE in Phase 4+ prod."
  type        = string
  default     = "MUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.image_tag_mutability)
    error_message = "image_tag_mutability must be MUTABLE or IMMUTABLE."
  }
}

variable "scan_on_push" {
  description = "Run an automatic Inspector scan whenever a new image is pushed. Free for dev volume."
  type        = bool
  default     = true
}

variable "untagged_image_retention_count" {
  description = "Keep the last N untagged image manifests; older ones expire automatically."
  type        = number
  default     = 10
}

variable "tagged_image_retention_count" {
  description = "Keep the last N tagged image manifests; older ones expire automatically."
  type        = number
  default     = 30
}

variable "force_delete" {
  description = "Phase 0 dev: true (we may iterate destroy/apply). Phase 4+ prod: false."
  type        = bool
  default     = true
}
