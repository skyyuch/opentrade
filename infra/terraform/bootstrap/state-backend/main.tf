# --------------------------------------------------------------------------
# Identity sanity check
# --------------------------------------------------------------------------
# Fail fast if the caller is somehow pointed at the wrong account. This
# protects against the rule-80 red line "never apply OpenTrade Terraform
# against the legacy account".

data "aws_caller_identity" "current" {}

resource "null_resource" "guard_account_id" {
  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.account_id
      error_message = "Caller is account ${data.aws_caller_identity.current.account_id} but expected ${var.account_id}. Did you forget --profile opentrade-dev?"
    }
  }
}

# --------------------------------------------------------------------------
# State bucket
# --------------------------------------------------------------------------
# A single S3 bucket holds remote state for every workspace under
# environments/.  Per-workspace state files are namespaced by `key` in
# each workspace's `backend "s3"` block.

locals {
  state_bucket_name = "${var.state_bucket_name_prefix}-${var.account_id}"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.state_bucket_name

  # State files contain enough operational metadata that we treat them as
  # sensitive. Versioning + bucket-level encryption + force-destroy=false
  # is the minimum responsible posture.
  force_destroy = false

  tags = {
    Name = local.state_bucket_name
    Role = "terraform-remote-state"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }

    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  # Old non-current state versions accumulate forever otherwise. 90 days
  # is a generous window for "I deleted something I shouldn't have" while
  # keeping the bucket size bounded.
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# --------------------------------------------------------------------------
# State lock table
# --------------------------------------------------------------------------
# DynamoDB table for Terraform's state-lock + consistency checks. Schema
# is fixed by Terraform: a single hash key named LockID (string).

resource "aws_dynamodb_table" "tfstate_locks" {
  name = var.lock_table_name

  # PAY_PER_REQUEST keeps cost ~ $0/month at OpenTrade Phase-0 lock volume
  # (a handful of operations a day). Provisioned capacity makes no sense
  # here.
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name = var.lock_table_name
    Role = "terraform-state-lock"
  }
}
