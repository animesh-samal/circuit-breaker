# GitHub Actions authentication, without any stored credentials.
#
# The usual approach is to create an IAM user, generate an access key, and paste
# it into repository secrets. That key is long-lived, sits in a system GitHub
# staff and every repo admin can reach, and has to be rotated by hand -- which
# nobody does.
#
# OIDC replaces it. GitHub mints a short-lived signed token describing which
# repository, branch and workflow is running. AWS verifies the signature against
# GitHub's public keys and issues temporary credentials. Nothing is stored, so
# nothing can leak, and there is nothing to rotate.
#
# If you take one security detail from this project into an interview, take this
# one -- it is the difference between a modern pipeline and a 2018 one.

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn

  repo_owner = split("/", var.github_repository)[0]
  repo_name  = split("/", var.github_repository)[1]

  # Wildcarding the IDs would reinstate the weakness the immutable format
  # exists to remove: names can be released and re-registered, IDs cannot.
  # Pinning them is strictly better and costs one lookup.
  owner_id = coalesce(var.github_owner_id, "*")
  repo_id  = coalesce(var.github_repository_id, "*")
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # The critical condition. Without a `sub` restriction, ANY repository on
    # GitHub could assume this role -- the trust would be in GitHub as a whole
    # rather than in your repository. Scope it as tightly as the workflow allows.
    #
    # Two patterns, because GitHub emits two subject formats:
    #
    #   legacy     repo:owner/repo:environment:production
    #   immutable  repo:owner@1234567/repo@7654321:environment:production
    #
    # The immutable form embeds the numeric account and repository IDs. It exists
    # to close a real hole in the legacy format: names can be released and
    # re-registered, so a deleted repository or a renamed organisation could let
    # somebody else claim the name and inherit this trust. Numeric IDs are never
    # reused, so the trust follows the actual repository rather than its label.
    #
    # Nearly every published example still shows only the legacy pattern, which
    # makes the resulting AccessDenied genuinely hard to diagnose -- STS will not
    # say which condition failed, by design.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:*",
        "repo:${local.repo_owner}@${local.owner_id}/${local.repo_name}@${local.repo_id}:*",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${var.project}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.assume.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:DescribeImages",
    ]
    resources = var.ecr_repository_arns
  }

  # Record the deploy so the console can show history.
  statement {
    sid       = "RecordDeploy"
    actions   = ["dynamodb:PutItem"]
    resources = var.dynamodb_table_arns
  }

  # Roll the deployment via SSM rather than exposing the Kubernetes API to the
  # internet. The pipeline sends a command to the node; the API server stays
  # bound to localhost and there is no kubeconfig in GitHub.
  statement {
    sid       = "RunShellScript"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:${var.region}::document/AWS-RunShellScript"]
  }

  # Scoped by tag, not by instance ID. Hardcoding the ID means the policy
  # silently stops matching the moment the node is replaced -- and it would fail
  # at deploy time, not at apply time, which is the worst place to find out.
  statement {
    sid       = "TargetProjectInstances"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:${var.region}:*:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Project"
      values   = [var.project]
    }
  }

  statement {
    sid       = "ReadCommandResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }

  # Lets the pipeline find the node by tag instead of being told its ID.
  statement {
    sid       = "FindNode"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.project}-github-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
