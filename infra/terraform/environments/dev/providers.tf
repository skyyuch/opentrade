# `default_tags` is the single source of truth for OpenTrade tags. Every
# resource the AWS provider creates inherits these unless explicitly
# overridden. Per rule 80 + ADR-0017 D9, the four tag keys are stable
# project-wide; cost allocation reports group on `Environment` and
# `CostCenter`.

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "OpenTrade"
      Environment = var.environment
      ManagedBy   = "Terraform"
      CostCenter  = "phase-0"
      Owner       = var.owner
    }
  }
}
