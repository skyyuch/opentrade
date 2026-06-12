# --------------------------------------------------------------------------
# S3 bucket (legacy static origin — retained, no longer the CDN origin)
# --------------------------------------------------------------------------
# ADR-0046 D4 switched the distribution origin to the ALB (the apps are
# Next.js SSR, which a static S3 origin cannot serve). The bucket, OAC,
# and bucket policy are retained per the ADR's "Neutral" note; removal
# is a separate cleanup follow-up.

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
# CloudFront distribution (ALB origin, SSR pass-through — ADR-0046 D4)
# --------------------------------------------------------------------------
# Phase 0 uses the default *.cloudfront.net domain. Custom domains
# (opentrade.io, console.opentrade.io) need ACM certificates in
# us-east-1, which is not yet enabled per ADR-0016. Phase 4+ will add
# `aliases`, `viewer_certificate`, and `acm_certificate_arn` here.
#
# The origin leg is HTTP-only: an HTTPS origin needs a certificate the
# ALB cannot have without a domain. Viewer TLS still terminates at
# CloudFront's default certificate, and the injected routing header +
# the ALB's CloudFront-prefix-list SG lock the origin down (ADR-0046 D3).
# No SPA fallback: the SSR origin owns its 404s; masking errors as 200s
# would hide real failures.

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name_prefix}-${var.name}"
  price_class     = var.price_class

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "alb-${var.name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Routing + origin lock: the ALB listener forwards on this header
    # and 403s anything without it. CloudFront overrides a same-named
    # viewer header, so clients cannot spoof their way to another app.
    custom_header {
      name  = var.routing_header_name
      value = var.name
    }
  }

  # SSR pages: no caching (responses vary by cookie/locale/auth), all
  # viewer headers, cookies, and query strings forwarded to Next.js.
  default_cache_behavior {
    target_origin_id       = "alb-${var.name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS-managed `CachingDisabled` cache policy.
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

    # AWS-managed `AllViewer` origin request policy (forwards all
    # headers — incl. Accept-Language for next-intl — plus cookies and
    # query strings).
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"

    response_headers_policy_id = var.noindex ? aws_cloudfront_response_headers_policy.this[0].id : null
  }

  # Hashed immutable build assets: cache aggressively at the edge.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "alb-${var.name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS-managed `CachingOptimized` cache policy (URL-only cache key,
    # long TTLs honouring the immutable Cache-Control from Next.js).
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    response_headers_policy_id = var.noindex ? aws_cloudfront_response_headers_policy.this[0].id : null
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
