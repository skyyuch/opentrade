# Remote state lives in the bucket created by
# infra/terraform/bootstrap/state-backend/. That workspace must be
# applied once before this one can `init`.
#
# Backend configuration cannot reference Terraform variables, so the
# bucket / table names are repeated here as literals. They MUST stay in
# sync with bootstrap/state-backend/variables.tf defaults.

terraform {
  backend "s3" {
    bucket         = "opentrade-tfstate-dev-371637912734"
    key            = "environments/dev/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "opentrade-tfstate-locks-dev"
    encrypt        = true
  }
}
