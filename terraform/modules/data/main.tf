# DynamoDB tables: deploy history, and the cache that keeps Cost Explorer cheap.
#
# PROVISIONED, not PAY_PER_REQUEST. This is the detail that catches people out:
# the DynamoDB always-free tier covers 25 read and 25 write capacity units in
# provisioned mode only. On-demand tables bill from the very first read. At this
# volume, 25/25 is several orders of magnitude more than needed and costs
# nothing, while the "simpler" on-demand choice would appear on every invoice.

resource "aws_dynamodb_table" "deploys" {
  name         = "${var.project}-deploys"
  billing_mode = "PROVISIONED"
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
  name         = "${var.project}-cache"
  billing_mode = "PROVISIONED"
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
