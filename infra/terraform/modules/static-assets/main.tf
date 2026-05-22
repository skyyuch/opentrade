# --------------------------------------------------------------------------
# S3 bucket (private origin for static assets like logos, avatars, etc.)
# --------------------------------------------------------------------------
# Fully private bucket — CloudFront reaches it via OAC.
# Unlike frontend-cdn, there is NO SPA fallback: missing keys return 404.

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
# CORS (allow browser fetches from any OpenTrade origin)
# --------------------------------------------------------------------------

resource "aws_s3_bucket_cors_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    max_age_seconds = 86400
  }
}

# --------------------------------------------------------------------------
# CloudFront Origin Access Control
# --------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name_prefix}-${var.name}-oac"
  description                       = "OAC for the ${var.name} CloudFront distribution to read its S3 origin."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --------------------------------------------------------------------------
# CloudFront distribution (static assets — no SPA fallback)
# --------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name_prefix}-${var.name}"
  price_class     = var.price_class

  origin {
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_id                = "s3-${var.name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${var.name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS-managed CachingOptimized policy
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    # AWS-managed CORS-S3Origin origin request policy
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"
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

  depends_on = [aws_s3_bucket_public_access_block.this]
}
