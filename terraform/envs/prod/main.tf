terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Stack     = "prod"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# Cluster join token. Generated rather than hardcoded, kept in state (which is
# encrypted and private), and never printed. Only relevant if a second node is
# ever added.
resource "random_password" "k3s_token" {
  length  = 48
  special = false
}

# Shared by compute (needs the ARN for its IAM policy) and the CloudWatch agent
# (writes to it). Lives here rather than in a module to avoid a dependency cycle.
resource "aws_cloudwatch_log_group" "app" {
  name              = "/${var.project}/app"
  retention_in_days = var.log_retention_days
}

module "network" {
  source = "../../modules/network"

  project           = var.project
  availability_zone = data.aws_availability_zones.available.names[0]
  ssh_cidr          = var.ssh_cidr
}

module "registry" {
  source = "../../modules/registry"

  project = var.project
}

module "data" {
  source = "../../modules/data"

  project = var.project
}

module "compute" {
  source = "../../modules/compute"

  project             = var.project
  region              = var.region
  subnet_id           = module.network.subnet_id
  security_group_id   = module.network.security_group_id
  log_group_name      = aws_cloudwatch_log_group.app.name
  log_group_arn       = aws_cloudwatch_log_group.app.arn
  ecr_repository_arns = module.registry.repository_arns
  dynamodb_table_arns = module.data.table_arns
  instance_type       = var.instance_type
  key_name            = var.key_name
  k3s_token           = random_password.k3s_token.result
}

module "identity" {
  source = "../../modules/identity"

  project              = var.project
  region               = var.region
  github_repository    = var.github_repository
  github_owner_id      = var.github_owner_id
  github_repository_id = var.github_repository_id
  ecr_repository_arns  = module.registry.repository_arns
  dynamodb_table_arns  = module.data.table_arns
  create_oidc_provider = var.create_oidc_provider
}

module "observability" {
  source = "../../modules/observability"

  project            = var.project
  region             = var.region
  instance_id        = module.compute.instance_id
  monthly_budget_usd = var.monthly_budget_usd
  alert_email        = var.alert_email
}
