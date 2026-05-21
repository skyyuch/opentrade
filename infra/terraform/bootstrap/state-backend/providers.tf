# Bootstrap workspace deliberately uses LOCAL state. The S3 bucket and
# DynamoDB table created by this workspace are what every other workspace
# stores its remote state in — there is no remote backend yet to point at.
#
# After `terraform apply`, commit nothing from this directory except the
# .tf source. The local state file lives under `.local-state/` (gitignored
# at the workspace level via `.terraform/`).

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "OpenTrade"
      Environment = "shared"
      ManagedBy   = "Terraform"
      Workspace   = "bootstrap/state-backend"
      CostCenter  = "phase-0"
    }
  }
}
