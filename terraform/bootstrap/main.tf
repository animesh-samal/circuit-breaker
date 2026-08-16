# Bootstrap: the S3 bucket that holds every other stack's state.
#
# Chicken and egg: remote state needs a bucket, and the bucket needs to be
# created by something. This stack alone uses local state, is applied once, and
# then left alone. Its own terraform.tfstate is committed nowhere and matters
# very little -- if it were lost, these two resources could be imported back in
# a couple of minutes.
#
# Why remote state at all:
#   - It is shared. CI and your laptop operate on the same state rather than two
#     divergent local copies.
#   - It is locked. Two concurrent applies would otherwise interleave writes and
#     corrupt the file.
#   - It is versioned, so a bad apply can be rolled back to the previous state.
#
# State contains every attribute of every resource in plaintext, including
# generated passwords and keys. That is why the bucket blocks public access,
# enforces encryption, and is never committed to git.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.80"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

resource "aws_s3_bucket" "state" {
  bucket = "${var.project}-tfstate-${var.account_suffix}"

  # Deleting the state bucket destroys the record of every resource Terraform
  # manages. Nothing about that should be convenient.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Old state versions are useful for a few weeks, not forever. Each is a full
# copy of the file, and storage is billed per version.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}
