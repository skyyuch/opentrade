output "alb_arn" {
  description = "ARN of the application load balancer."
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "Public DNS name of the ALB. CloudFront distributions use this as their origin domain."
  value       = aws_lb.this.dns_name
}

output "security_group_id" {
  description = "ALB security group ID. Service security groups admit ingress from it."
  value       = aws_security_group.alb.id
}

output "http_listener_arn" {
  description = "ARN of the HTTP :80 listener carrying the header-routing rules."
  value       = aws_lb_listener.http.arn
}

output "target_group_arns" {
  description = "Map of app name to target group ARN, for wiring into ecs-service modules."
  value       = { for name, tg in aws_lb_target_group.app : name => tg.arn }
}

output "routing_header_name" {
  description = "Header name each CloudFront distribution must inject as a custom origin header."
  value       = var.routing_header_name
}
