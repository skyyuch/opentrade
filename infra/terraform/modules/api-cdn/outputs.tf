output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID; needed for `aws cloudfront create-invalidation` (rarely useful here — caching is disabled)."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.this.arn
}

output "cloudfront_domain_name" {
  description = "Default *.cloudfront.net domain. Phase 4+ swaps for api.opentrade.io aliases."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_url" {
  description = "Full https URL of the API distribution. Build arg source for NEXT_PUBLIC_API_URL when baking the front-end images (ADR-0046 D5)."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}
