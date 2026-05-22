variable "name" {
  description = "Logical name of this asset store (e.g., `assets`). Flows into resource names and tags."
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-<name>'."
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name. Globally unique. Convention: '<prefix>-<name>-<account_id>'."
  type        = string
}

variable "cors_allowed_origins" {
  description = "List of origins allowed to fetch assets via CORS."
  type        = list(string)
  default     = ["*"]
}

variable "force_destroy" {
  description = "Phase 0 dev: true. Phase 4+ prod: false."
  type        = bool
  default     = true
}

variable "price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_200"

  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.price_class)
    error_message = "price_class must be one of PriceClass_All, PriceClass_200, PriceClass_100."
  }
}
