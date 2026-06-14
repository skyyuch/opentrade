# --------------------------------------------------------------------------
# Single internet-facing ALB with CloudFront-header routing (ADR-0046 D3)
# --------------------------------------------------------------------------
# All CloudFront distributions reach this ALB under the same Host header
# (no custom domain), so host-based routing cannot discriminate. Each
# distribution instead injects `X-Opentrade-App: <app>` as a custom origin
# header; listener rules match on it and forward to the app's target group.
#
# The header doubles as a coarse origin lock:
#   - the SG only admits the CloudFront origin-facing managed prefix list,
#   - requests lacking the header hit the fixed-response 403 default action.
# Direct-to-ALB traffic is therefore rejected even from CloudFront IP space.

# --------------------------------------------------------------------------
# Security group — ingress pinned to CloudFront origin-facing ranges
# --------------------------------------------------------------------------

data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-"
  description = "ALB - HTTP from CloudFront origin-facing ranges only"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name_prefix}-alb"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "http_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from CloudFront origin-facing managed prefix list"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow all outbound (to service target groups)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# --------------------------------------------------------------------------
# Load balancer
# --------------------------------------------------------------------------

resource "aws_lb" "this" {
  name               = "${var.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  idle_timeout               = var.idle_timeout_seconds
  enable_deletion_protection = var.enable_deletion_protection
  drop_invalid_header_fields = true

  tags = {
    Name = "${var.name_prefix}-alb"
  }
}

# --------------------------------------------------------------------------
# Target groups — one per routed app, Fargate awsvpc => target_type "ip"
# --------------------------------------------------------------------------

resource "aws_lb_target_group" "app" {
  for_each = var.apps

  name        = "${var.name_prefix}-${each.key}"
  vpc_id      = var.vpc_id
  port        = each.value.container_port
  protocol    = "HTTP"
  target_type = "ip"

  deregistration_delay = var.deregistration_delay_seconds

  health_check {
    path                = each.value.health_check_path
    interval            = var.health_check_interval_seconds
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }

  tags = {
    Name = "${var.name_prefix}-${each.key}"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# --------------------------------------------------------------------------
# Listener — 403 by default; header match forwards to the app target group
# --------------------------------------------------------------------------
# HTTP-only: TLS terminates at CloudFront's default certificate. An HTTPS
# listener requires an ACM certificate, which requires a custom domain
# (deferred per ADR-0046; the CloudFront->ALB leg stays on the AWS backbone).

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  tags = {
    Name = "${var.name_prefix}-http"
  }
}

resource "aws_lb_listener_rule" "app" {
  for_each = var.apps

  listener_arn = aws_lb_listener.http.arn
  priority     = each.value.priority

  condition {
    http_header {
      http_header_name = var.routing_header_name
      values           = [each.key]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[each.key].arn
  }

  tags = {
    Name = "${var.name_prefix}-route-${each.key}"
  }
}
