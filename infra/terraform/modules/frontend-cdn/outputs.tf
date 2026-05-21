output "bucket_name" {
  description = "S3 bucket holding the artefact."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket."
  value       = aws_s3_bucket.this.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID; needed for `aws cloudfront create-invalidation`."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.this.arn
}

output "cloudfront_domain_name" {
  description = "Default *.cloudfront.net domain. Phase 4+ swaps for opentrade.io aliases."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_url" {
  description = "Convenience: full https URL of the distribution's default domain."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}
