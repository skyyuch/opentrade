variable "name" {
  description = "Logical name of this frontend (e.g., `web`, `console`). Flows into resource names and tags."
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-<name>'."
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name for the static artefact. Globally unique. Convention: '<prefix>-<name>-<account_id>'."
  type        = string
}

variable "default_root_object" {
  description = "Document served at `/`. Next.js static export uses `index.html`."
  type        = string
  default     = "index.html"
}

variable "noindex" {
  description = "When true, attach a CloudFront response-headers policy that injects `X-Robots-Tag: noindex, nofollow` on every response. Required for apps/console per ADR-0010."
  type        = bool
  default     = false
}

variable "force_destroy" {
  description = "Phase 0 dev: true (we may destroy/recreate). Phase 4+ prod: false."
  type        = bool
  default     = true
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 covers North America + Europe edges only — cheapest tier; fine for dev."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.price_class)
    error_message = "price_class must be one of PriceClass_All, PriceClass_200, PriceClass_100."
  }
}
