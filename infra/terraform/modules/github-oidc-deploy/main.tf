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
