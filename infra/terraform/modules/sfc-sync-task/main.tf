# --------------------------------------------------------------------------
# Security group for the sync task
# --------------------------------------------------------------------------
# Egress-all (fetch SFC API over HTTPS), no ingress (task initiates all
# connections). Added to the RDS SG ingress so it can reach Postgres.

resource "aws_security_group" "sync_task" {
  name_prefix = "${var.name_prefix}-sfc-sync-"
  description = "SFC broker sync ECS task - egress-all, no ingress"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name_prefix}-sfc-sync"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "sync_all" {
  security_group_id = aws_security_group.sync_task.id
  description       = "Allow all outbound (SFC API + DB)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_sync" {
  security_group_id            = var.rds_security_group_id
  description                  = "Postgres from SFC sync task"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.sync_task.id
}

# --------------------------------------------------------------------------
# ECS task definition
# --------------------------------------------------------------------------

resource "aws_ecs_task_definition" "sync_sfc" {
  family                   = "${var.name_prefix}-sfc-sync"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "sfc-sync"
      image     = var.ecr_image
      essential = true
      command   = ["node", "dist/tasks/sync-sfc.js"]

      environment = [
        { name = "NODE_ENV", value = "production" },
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = var.db_secret_arn
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "sfc-sync"
        }
      }
    }
  ])

  tags = {
    Name = "${var.name_prefix}-sfc-sync"
  }
}

data "aws_region" "current" {}

# --------------------------------------------------------------------------
# EventBridge scheduled rule
# --------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "weekly_sync" {
  name                = "${var.name_prefix}-sfc-sync-weekly"
  description         = "Trigger SFC broker sync weekly (ADR-0020)"
  schedule_expression = var.schedule_expression
  state               = var.enabled ? "ENABLED" : "DISABLED"

  tags = {
    Name = "${var.name_prefix}-sfc-sync-weekly"
  }
}

# IAM role for EventBridge to invoke ECS RunTask
data "aws_iam_policy_document" "eventbridge_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventbridge_ecs" {
  name               = "${var.name_prefix}-sfc-sync-events"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_assume.json

  tags = {
    Name = "${var.name_prefix}-sfc-sync-events"
  }
}

data "aws_iam_policy_document" "eventbridge_run_task" {
  statement {
    sid    = "RunTask"
    effect = "Allow"
    actions = [
      "ecs:RunTask",
    ]
    resources = [aws_ecs_task_definition.sync_sfc.arn]
  }

  statement {
    sid    = "PassRole"
    effect = "Allow"
    actions = [
      "iam:PassRole",
    ]
    resources = [
      var.task_execution_role_arn,
      var.task_role_arn,
    ]
  }
}

resource "aws_iam_role_policy" "eventbridge_run_task" {
  name   = "${var.name_prefix}-sfc-sync-run-task"
  role   = aws_iam_role.eventbridge_ecs.id
  policy = data.aws_iam_policy_document.eventbridge_run_task.json
}

resource "aws_cloudwatch_event_target" "ecs" {
  rule     = aws_cloudwatch_event_rule.weekly_sync.name
  arn      = var.cluster_arn
  role_arn = aws_iam_role.eventbridge_ecs.arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.sync_sfc.arn
    task_count          = 1
    launch_type         = "FARGATE"

    network_configuration {
      subnets          = var.private_subnet_ids
      security_groups  = [aws_security_group.sync_task.id]
      assign_public_ip = false
    }
  }
}
