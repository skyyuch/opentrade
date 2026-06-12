variable "name" {
  description = "Logical name of this API surface (e.g. `api`). Flows into resource names and tags, and is the routing header value the ALB matches on."
  type        = string
  default     = "api"
}

variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-<name>'."
  type        = string
}

variable "alb_dns_name" {
  description = "DNS name of the ALB this distribution uses as its origin (ADR-0046 D4). HTTP-only origin leg; TLS terminates at CloudFront."
  type        = string
}

variable "routing_header_name" {
  description = "Custom origin header CloudFront injects so the ALB listener can route to the API target group (ADR-0046 D3). The header value is `var.name`."
  type        = string
  default     = "X-Opentrade-App"
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
