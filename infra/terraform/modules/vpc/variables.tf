variable "name_prefix" {
  description = "Resource name prefix; produces names like '<prefix>-vpc'."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
}

variable "availability_zones" {
  description = "AZs to spread subnets across. Two for dev (cost-tuned), three for Phase 4+ prod."
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "Need at least two AZs for any sane subnet layout."
  }
}

variable "single_nat_gateway" {
  description = "If true (Phase 0 / dev default), provision one NAT gateway in the first public subnet and route every private subnet through it. Saves ~$33/month at the cost of a single-AZ NAT failure mode. Set false in Phase 4+ prod."
  type        = bool
  default     = true
}

variable "enable_flow_logs" {
  description = "Whether to send VPC flow logs to CloudWatch. Costs ~$1/month at dev volume."
  type        = bool
  default     = true
}

variable "flow_logs_retention_days" {
  description = "CloudWatch log retention for VPC flow logs."
  type        = number
  default     = 14
}
