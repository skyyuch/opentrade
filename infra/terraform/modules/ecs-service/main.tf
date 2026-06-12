# --------------------------------------------------------------------------
# One ECS Fargate service (ADR-0046 D2)
# --------------------------------------------------------------------------
# Generic building block for the four UAT services (web / console / api /
# outbox-worker). Two shapes, switched by `target_group_arn`:
#
#   - HTTP service: registered into an ALB target group; the security
#     group admits the ALB on the container port.
#   - Background service (outbox worker): no target group, no ingress —
#     the task only initiates outbound connections.

locals {
  qualified_name = "${var.name_prefix}-${var.service_name}"
  has_lb         = var.target_group_arn != null

  container_definition = merge(
    {
      name      = var.service_name
      image     = var.image
      essential = true

      environment = [
        for name, value in var.environment : { name = name, value = value }
      ]

      secrets = [
        for name, arn in var.secrets : { name = name, valueFrom = arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = var.service_name
        }
      }
    },
    var.command == null ? {} : { command = var.command },
    var.container_port == null ? {} : {
      portMappings = [
        { containerPort = var.container_port, protocol = "tcp" }
      ]
    },
  )
}

data "aws_region" "current" {}

# --------------------------------------------------------------------------
# Security group
# --------------------------------------------------------------------------
# Egress-all (RDS, Secrets Manager, IPFS, chain RPC via NAT). Ingress only
# from the ALB, and only for services that actually receive traffic.

resource "aws_security_group" "service" {
  name_prefix = "${local.qualified_name}-"
  description = "ECS service ${var.service_name}"
  vpc_id      = var.vpc_id

  tags = {
    Name = local.qualified_name
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.service.id
  description       = "Allow all outbound"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "from_alb" {
  count = local.has_lb ? 1 : 0

  security_group_id            = aws_security_group.service.id
  description                  = "Container port from the ALB"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = var.alb_security_group_id
}

# --------------------------------------------------------------------------
# Task definition
# --------------------------------------------------------------------------

resource "aws_ecs_task_definition" "this" {
  family                   = local.qualified_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([local.container_definition])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  tags = {
    Name = local.qualified_name
  }
}

# --------------------------------------------------------------------------
# Service
# --------------------------------------------------------------------------

resource "aws_ecs_service" "this" {
  name            = local.qualified_name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = local.has_lb ? var.health_check_grace_period_seconds : null

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = local.has_lb ? [var.target_group_arn] : []

    content {
      target_group_arn = load_balancer.value
      container_name   = var.service_name
      container_port   = var.container_port
    }
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = local.qualified_name
  }

  lifecycle {
    precondition {
      condition     = !local.has_lb || (var.container_port != null && var.alb_security_group_id != null)
      error_message = "When target_group_arn is set, container_port and alb_security_group_id must also be set."
    }
  }
}
