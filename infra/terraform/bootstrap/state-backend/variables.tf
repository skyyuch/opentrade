variable "region" {
  description = "AWS region for the state backend. Must match the workload region per ADR-0016 D2."
  type        = string
  default     = "ap-southeast-1"
}

variable "aws_profile" {
  description = "Local SSO profile to assume. Per rule 80, OpenTrade work always uses opentrade-* profiles."
  type        = string
  default     = "opentrade-dev"
}

variable "account_id" {
  description = "AWS account ID embedded into the state bucket name to guarantee global uniqueness."
  type        = string
  default     = "371637912734"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be a 12-digit AWS account number."
  }
}

variable "state_bucket_name_prefix" {
  description = "Prefix for the S3 bucket that holds Terraform state. Final name is '<prefix>-<account_id>'."
  type        = string
  default     = "opentrade-tfstate-dev"
}

variable "lock_table_name" {
  description = "DynamoDB table that Terraform uses for state-lock + consistency checks."
  type        = string
  default     = "opentrade-tfstate-locks-dev"
}
