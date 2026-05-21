# --------------------------------------------------------------------------
# S3 bucket (private origin)
# --------------------------------------------------------------------------
# The bucket is fully private — public access is blocked at the bucket
# level, and CloudFront reaches it through Origin Access Control (OAC).
# Direct browser access to S3 returns 403.

resource "aws_s3_bucket" "this" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  tags = {
    Name = var.bucket_name
    App  = var.name
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }

    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --------------------------------------------------------------------------
# CloudFront Origin Access Control
# --------------------------------------------------------------------------
# OAC replaces the legacy Origin Access Identity (OAI). Recommended for
# all new distributions per AWS guidance.

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name_prefix}-${var.name}-oac"
  description                       = "OAC for the ${var.name} CloudFront distribution to read its S3 origin."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --------------------------------------------------------------------------
# CloudFront response-headers policy (optional X-Robots-Tag)
# --------------------------------------------------------------------------
# When `var.noindex = true`, every response carries
# `X-Robots-Tag: noindex, nofollow` regardless of what the origin sent.
# This is the apps/console hardening required by ADR-0010 §"Implementation
# Notes" — robots.txt + meta robots are belt; this header is suspenders.

resource "aws_cloudfront_response_headers_policy" "this" {
  count = var.noindex ? 1 : 0

  name = "${var.name_prefix}-${var.name}-noindex"

  custom_headers_config {
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow"
      override = true
    }
  }
}

# --------------------------------------------------------------------------
# CloudFront distribution
# --------------------------------------------------------------------------
# Phase 0 uses the default *.cloudfront.net domain. Custom domains
# (opentrade.io, console.opentrade.io) need ACM certificates in
# us-east-1, which is not yet enabled per ADR-0016. Phase 4+ will add
# `aliases`, `viewer_certificate`, and `acm_certificate_arn` here.

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name_prefix}-${var.name}"
  default_root_object = var.default_root_object
  price_class         = var.price_class

  origin {
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_id                = "s3-${var.name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${var.name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS-managed `CachingOptimized` cache policy.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    # AWS-managed `CORS-S3Origin` origin request policy (forwards
    # nothing the origin doesn't need; cheapest cache key).
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"

    response_headers_policy_id = var.noindex ? aws_cloudfront_response_headers_policy.this[0].id : null
  }

  # SPA fallback: serve `index.html` for unknown paths so client-side
  # routing works. Both apps/web and apps/console produce SPA-style
  # output for static segments.
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/${var.default_root_object}"
    error_caching_min_ttl = 60
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/${var.default_root_object}"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1"
  }

  tags = {
    Name = "${var.name_prefix}-${var.name}"
    App  = var.name
  }
}

# --------------------------------------------------------------------------
# Bucket policy: allow CloudFront-via-OAC only
# --------------------------------------------------------------------------

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    sid    = "AllowCloudFrontServicePrincipal"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.this.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.bucket_policy.json

  # Bucket policy depends on the distribution ARN, but the distribution
  # depends on the bucket. Terraform handles the cycle automatically
  # because the policy references the distribution but the distribution
  # only references the bucket's domain name (a string), not the policy.
  depends_on = [aws_s3_bucket_public_access_block.this]
}
