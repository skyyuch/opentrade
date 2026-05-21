output "state_bucket_name" {
  description = "S3 bucket that every other workspace points its remote backend at."
  value       = aws_s3_bucket.tfstate.id
}

output "state_bucket_arn" {
  description = "ARN of the state bucket; useful when granting cross-workspace IAM."
  value       = aws_s3_bucket.tfstate.arn
}

output "lock_table_name" {
  description = "DynamoDB table backing Terraform's state-lock."
  value       = aws_dynamodb_table.tfstate_locks.id
}

output "lock_table_arn" {
  description = "ARN of the state-lock table."
  value       = aws_dynamodb_table.tfstate_locks.arn
}

output "region" {
  description = "AWS region these resources live in."
  value       = var.region
}

output "backend_block_snippet" {
  description = "Drop-in `backend \"s3\"` snippet to paste into each workspace's backend.tf, with the `key` substituted per workspace."
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.tfstate.id}"
        key            = "<workspace-namespace>/terraform.tfstate"
        region         = "${var.region}"
        dynamodb_table = "${aws_dynamodb_table.tfstate_locks.id}"
        encrypt        = true
      }
    }
  EOT
}
