# --------------------------------------------------------------------------
# One-off schema migration + seed ECS task (ADR-0048 D1)
# --------------------------------------------------------------------------
# Runs `prisma migrate deploy && tsx scripts/seed.ts` against the private
# RDS instance from inside the VPC. The image is the apps/api Dockerfile's
# `migrate` stage (full toolchain), pushed as `opentrade-api:migrate`.
#
# There is no schedule: the task is invoked on demand by the owner via
# `aws ecs run-task` (ADR-0048 D2 — NOT by CI, to preserve ADR-0047 D2's
# minimal deploy-role surface). The task's security group is exposed as an
# output; the composition root adds it to the RDS client_security_groups
# map so RDS owns the ingress rule (consistent with api / worker).

data "aws_region" "current" {}

resource "aws_security_group" "migrate" {
  name_prefix = "${var.name_prefix}-migrate-"
  description = "Migration task - egress-all, no ingress"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name_prefix}-migrate"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.migrate.id
  description       = "Allow all outbound (RDS, Secrets Manager, ECR)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.name_prefix}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "migrate"
      image     = var.ecr_image
      essential = true

      environment = [
        { name = "NODE_ENV", value = "production" },
        # ADR-0056: non-secret DB connection parts; the container entrypoint
        # combines these with the injected DB_PASSWORD into DATABASE_URL.
        { name = "DB_USERNAME", value = var.db_username },
        { name = "DB_HOST", value = var.db_host },
        { name = "DB_PORT", value = var.db_port },
        { name = "DB_NAME", value = var.db_name },
      ]

      # ADR-0056: DB password from the RDS-managed secret's `password` JSON
      # key — no hand-filled connection-string secret, no rotation drift.
      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = var.db_password_secret_arn
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "migrate"
        }
      }
    }
  ])

  tags = {
    Name = "${var.name_prefix}-migrate"
  }
}
