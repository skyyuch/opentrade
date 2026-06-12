# --------------------------------------------------------------------------
# API CloudFront distribution (ADR-0046 D4)
# --------------------------------------------------------------------------
# Browsers must reach the API over HTTPS, but without a custom domain the
# ALB cannot carry an ACM certificate — so a distribution fronts the API
# purely for its default *.cloudfront.net TLS. It is a pass-through:
# caching disabled, every header, cookie, and query string forwarded.
#
# The origin leg is HTTP-only (same constraint as frontend-cdn). The
# injected routing header + the ALB's CloudFront-prefix-list SG lock the
# origin down (ADR-0046 D3).

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

  default_cache_behavior {
    target_origin_id       = "alb-${var.name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS-managed `CachingDisabled` cache policy.
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

    # AWS-managed `AllViewer` origin request policy (forwards all
    # headers — incl. Authorization bearer tokens — plus cookies and
    # query strings).
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"
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
