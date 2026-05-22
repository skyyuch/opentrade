output "bucket_name" {
  description = "S3 bucket holding static assets."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket."
  value       = aws_s3_bucket.this.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_domain_name" {
  description = "Default *.cloudfront.net domain for the assets CDN."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_url" {
  description = "Full https URL of the assets CDN."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}
