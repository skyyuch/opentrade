# --------------------------------------------------------------------------
# Cluster
# --------------------------------------------------------------------------
# Phase 0 ships only the cluster + IAM scaffolding. The first ECS service
# (apps/api) lands in Phase 1 once the container image is in ECR with a
# real release tag. Until then the cluster sits idle (~ $0/month).

resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.container_insights_enabled ? "enabled" : "disabled"
  }

  tags = {
    Name = "${var.name_prefix}-cluster"
  }
}

# Force Fargate on this cluster — no EC2 capacity providers ever attach.
# Keeps "did this start an EC2 instance by accident?" off the worry list.
resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# --------------------------------------------------------------------------
# Application log group
# --------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/opentrade/${var.name_prefix}/ecs"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "/opentrade/${var.name_prefix}/ecs"
  }
}

# --------------------------------------------------------------------------
# Task execution role
# --------------------------------------------------------------------------
# ECS itself assumes this role to: pull images from ECR, fetch secrets at
# task launch, write to the log group above. NOT the role the running
# container code uses — that's `task_role` below.

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.name_prefix}-ecs-task-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Inline policy: read Secrets Manager + write to the application log group.
data "aws_iam_policy_document" "task_execution_extras" {
  statement {
    sid    = "WriteAppLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.app.arn}:*"]
  }

  dynamic "statement" {
    for_each = length(var.task_role_managed_secret_arns) > 0 ? [1] : []
    content {
      sid       = "ReadInjectedSecretsAtLaunch"
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = var.task_role_managed_secret_arns
    }
  }
}

resource "aws_iam_role_policy" "task_execution_extras" {
  name   = "${var.name_prefix}-ecs-task-exec-extras"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_extras.json
}

# --------------------------------------------------------------------------
# Task role (the running container's identity)
# --------------------------------------------------------------------------
# Application code inside the container assumes this role. Phase 0 grants
# Secrets Manager `GetSecretValue` on whitelisted ARNs only. Phase 1 will
# attach S3 read for IPFS staging buckets, KMS for envelope encryption, etc.

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "task_secrets_read" {
  count = length(var.task_role_managed_secret_arns) > 0 ? 1 : 0

  statement {
    sid       = "AppReadsAllowedSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.task_role_managed_secret_arns
  }
}

resource "aws_iam_role_policy" "task_secrets_read" {
  count = length(var.task_role_managed_secret_arns) > 0 ? 1 : 0

  name   = "${var.name_prefix}-ecs-task-secrets-read"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_secrets_read[0].json
}

# apps/api uploads broker logos / avatars (PutObjectCommand only — no
# read/delete from app code; reads go through CloudFront).
data "aws_iam_policy_document" "task_s3_write" {
  count = length(var.task_role_s3_write_bucket_arns) > 0 ? 1 : 0

  statement {
    sid       = "AppWritesAllowedBuckets"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = [for arn in var.task_role_s3_write_bucket_arns : "${arn}/*"]
  }
}

resource "aws_iam_role_policy" "task_s3_write" {
  count = length(var.task_role_s3_write_bucket_arns) > 0 ? 1 : 0

  name   = "${var.name_prefix}-ecs-task-s3-write"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3_write[0].json
}
