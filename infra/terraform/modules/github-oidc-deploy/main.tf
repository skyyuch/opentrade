# --------------------------------------------------------------------------
# GitHub Actions OIDC identity provider
# --------------------------------------------------------------------------
# One per account per issuer URL. Lets GitHub-hosted workflow runs exchange
# their short-lived OIDC token for AWS credentials — no IAM user, no
# long-lived access key (rule 80 red line; ADR-0047 amends ADR-0018 D8).

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    # AWS has trusted GitHub's OIDC root CA directly since 2023-07, so these
    # pins are effectively ignored at runtime — the provider schema still
    # requires them. Both historical GitHub intermediates are listed.
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

# --------------------------------------------------------------------------
# Deploy role
# --------------------------------------------------------------------------
# Trust is pinned to a single repository AND a single ref: a workflow run
# from any fork, any PR, or any non-main branch presents a different `sub`
# claim and is refused at AssumeRoleWithWebIdentity time.

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:${var.allowed_ref}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${var.name_prefix}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json

  # Image build + push + forced deployment comfortably fits the default
  # 1-hour session; no reason to allow longer-lived CI credentials.
  max_session_duration = 3600
}

# --------------------------------------------------------------------------
# Permissions — deliberately minimal (ADR-0047)
# --------------------------------------------------------------------------
# The role can (a) push images into the whitelisted ECR repositories and
# (b) force new deployments on the whitelisted ECS services. It can NOT
# register task definitions or pass IAM roles, so a compromised workflow
# cannot swap the container command, environment, or task identity — the
# worst case is rolling out whatever was last pushed to the pinned tag.

data "aws_iam_policy_document" "deploy" {
  # GetAuthorizationToken is account-scoped; AWS only supports "*" here.
  statement {
    sid       = "EcrLogin"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPushImages"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = var.ecr_repository_arns
  }

  statement {
    sid    = "EcsForceNewDeployment"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices",
      "ecs:UpdateService",
    ]
    resources = var.ecs_service_arns
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.name_prefix}-github-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

# --------------------------------------------------------------------------
# Migration role (ADR-0051) — amends ADR-0047 D2 / ADR-0048 D2
# --------------------------------------------------------------------------
# Single-purpose role for the deploy.yml migrate gate. Reuses the same
# OIDC-federated trust (repo + ref pinned) as the deploy role, but its policy
# grants ONLY: push the :migrate image, RunTask the migrate task definition in
# one cluster, DescribeTasks to await it, and PassRole the migrate task's two
# IAM roles to ECS. It cannot register task definitions, touch services, or
# pass any other role. Created only when var.create_migrate_role is true.

locals {
  # Strip the trailing :<revision> and wildcard it so the RunTask grant tracks
  # the family across Terraform re-registrations (a new revision each apply).
  migrate_task_definition_family_arn = var.create_migrate_role ? "${replace(var.migrate_task_definition_arn, "/:[0-9]+$/", "")}:*" : ""
}

resource "aws_iam_role" "migrate" {
  count              = var.create_migrate_role ? 1 : 0
  name               = "${var.name_prefix}-github-migrate"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json

  # Build the :migrate image, run the task, await it — fits the 1-hour default.
  max_session_duration = 3600
}

data "aws_iam_policy_document" "migrate" {
  count = var.create_migrate_role ? 1 : 0

  statement {
    sid       = "EcrLogin"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPushMigrateImage"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = var.migrate_ecr_repository_arns
  }

  # RunTask only on the migrate family, only in the named cluster. IAM cannot
  # constrain containerOverrides.command — accepted in ADR-0051 D2 (CI already
  # controls the serving image, i.e. arbitrary code against the same DB).
  statement {
    sid       = "EcsRunMigrateTask"
    effect    = "Allow"
    actions   = ["ecs:RunTask"]
    resources = [local.migrate_task_definition_family_arn]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.migrate_cluster_arn]
    }
  }

  # DescribeTasks has no resource-level support; scope it to the cluster.
  statement {
    sid       = "EcsDescribeTasks"
    effect    = "Allow"
    actions   = ["ecs:DescribeTasks"]
    resources = ["*"]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.migrate_cluster_arn]
    }
  }

  # PassRole exactly the migrate task + execution roles, and only to ECS.
  statement {
    sid       = "PassMigrateTaskRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = var.migrate_pass_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "migrate" {
  count  = var.create_migrate_role ? 1 : 0
  name   = "${var.name_prefix}-github-migrate"
  role   = aws_iam_role.migrate[0].id
  policy = data.aws_iam_policy_document.migrate[0].json
}
