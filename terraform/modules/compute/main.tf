# The node.
#
# One EC2 instance running k3s. No managed control plane, because EKS charges
# $0.10/hour for one -- about $73/month before a single workload exists, or
# fifteen times this project's entire budget. k3s is CNCF-conformant: the same
# API, the same manifests, the same kubectl.

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ---------------------------------------------------------------------------
# Instance role
#
# The node authenticates to AWS through this role via the instance metadata
# service. No access keys exist anywhere -- not in the repo, not in the image,
# not in a Kubernetes Secret. Nothing to rotate and nothing to leak.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  name               = "${var.project}-node"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "node" {
  # Pull images. GetAuthorizationToken cannot be scoped to a repository -- it
  # is an account-level operation, which is why it sits in its own statement
  # with a wildcard resource rather than being lumped in below.
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchCheckLayerAvailability",
    ]
    resources = var.ecr_repository_arns
  }

  # Publish logs and metrics. PutMetricData has no resource-level permissions
  # either; it is constrained by namespace condition instead.
  statement {
    sid       = "CloudWatchWrite"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["CircuitBreaker"]
    }
  }

  statement {
    sid = "Logs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["${var.log_group_arn}:*"]
  }

  # Read metrics back for the console.
  statement {
    sid       = "CloudWatchRead"
    actions   = ["cloudwatch:GetMetricData", "cloudwatch:ListMetrics"]
    resources = ["*"]
  }

  # Deploy history and the cost cache.
  statement {
    sid       = "Dynamo"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"]
    resources = var.dynamodb_table_arns
  }

  # Cost Explorer is account-scoped; it has no resource ARNs at all.
  statement {
    sid       = "CostExplorer"
    actions   = ["ce:GetCostAndUsage", "ce:GetCostForecast"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "node" {
  name   = "${var.project}-node"
  role   = aws_iam_role.node.id
  policy = data.aws_iam_policy_document.node.json
}

# Lets you open a shell through Systems Manager without SSH, an open port, or a
# key pair. Strictly better than SSH for occasional access.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "node" {
  name = "${var.project}-node"
  role = aws_iam_role.node.name
}

# ---------------------------------------------------------------------------
# Instance
# ---------------------------------------------------------------------------

resource "aws_instance" "node" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.node.name
  key_name               = var.key_name

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    project    = var.project
    region     = var.region
    log_group  = var.log_group_name
    k3s_token  = var.k3s_token
    node_label = "${var.project}-node"
  })

  root_block_device {
    volume_size           = var.disk_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  # IMDSv2 required. Version 1 answers a plain HTTP GET, so any server-side
  # request forgery in a workload on this host can read the instance role's
  # temporary credentials. Requiring tokens closes that path, and it is a
  # standard finding in any AWS security review.
  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2 # containers need one extra hop
  }

  tags = { Name = "${var.project}-node" }

  lifecycle {
    ignore_changes = [ami] # a new Ubuntu release should not silently rebuild the cluster
  }
}

# A stable address, so DNS does not need updating on every reboot.
#
# Note the cost: every public IPv4 address bills $0.005/hour, roughly $3.65 a
# month, whether attached or not. Releasing unused EIPs is the single easiest
# saving on a small account.
resource "aws_eip" "node" {
  instance = aws_instance.node.id
  domain   = "vpc"

  tags = { Name = "${var.project}-eip" }
}
