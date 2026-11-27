# DynamoDB tables: deploy history, and the cache that keeps Cost Explorer cheap.
#
# PROVISIONED, not PAY_PER_REQUEST. This is the detail that catches people out:
# the DynamoDB always-free tier covers 25 read and 25 write capacity units in
# provisioned mode only. On-demand tables bill from the very first read. At this
# volume, 25/25 is several orders of magnitude more than needed and costs
# nothing, while the "simpler" on-demand choice would appear on every invoice.

resource "aws_dynamodb_table" "deploys" {
  name           = "${var.project}-deploys"
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5

  hash_key  = "pk"
  range_key = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  # Single fixed partition key with an ISO-8601 timestamp as the sort key. That
  # lets the API Query with ScanIndexForward=false to get newest-first at one
  # read unit per item, instead of Scanning the whole table -- correct at ten
  # rows and still correct at ten thousand.
  point_in_time_recovery {
    enabled = false # deploy history is reconstructible from git and CI logs
  }

  tags = { Name = "${var.project}-deploys" }
}

resource "aws_dynamodb_table" "cache" {
  name           = "${var.project}-cache"
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5

  hash_key = "key"

  attribute {
    name = "key"
    type = "S"
  }

  # DynamoDB deletes expired items itself, at no cost. Doing this with a
  # scheduled job would burn write capacity for the privilege.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = { Name = "${var.project}-cache" }
}

# What the website says, as one document, with every saved version kept.
#
# Written by the admin panel (see docs/admin.md). The table also holds two small
# bookkeeping items for sign-in: a failed-attempt counter and the last one-time
# code used. Same provisioned free-tier reasoning as the tables above; with the
# other two this is 15 of the 25 free units.
#
# It is deliberately NOT in the table_arns output. That list is shared with the
# deploy role, and CI has no business being able to write the site's content.

resource "aws_dynamodb_table" "content" {
  name           = "${var.project}-content"
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5

  hash_key  = "pk"
  range_key = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  # Old versions and sign-in counters carry an expiry; DynamoDB deletes them.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  # Point-in-time recovery is off: the table keeps its own version history, and
  # recovery is billed per gigabyte-month for a table that holds kilobytes.
  point_in_time_recovery {
    enabled = false
  }

  tags = { Name = "${var.project}-content" }
}

# Uploaded files: the CV. Private, encrypted, and versioned, so replacing the CV
# never destroys the old one. Nothing reads it directly; the API streams a file
# out, so an object cannot be fetched by guessing its address.

resource "aws_s3_bucket" "uploads" {
  bucket = var.uploads_bucket_name

  tags = { Name = var.uploads_bucket_name }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    # Replaced CVs are kept for a year, then removed.
    noncurrent_version_expiration {
      noncurrent_days = 365
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Refuse any request that is not over TLS.
data "aws_iam_policy_document" "uploads_tls" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.uploads.arn, "${aws_s3_bucket.uploads.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.uploads_tls.json

  depends_on = [aws_s3_bucket_public_access_block.uploads]
}
