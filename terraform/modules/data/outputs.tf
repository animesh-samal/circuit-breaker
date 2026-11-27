output "table_arns" {
  value = [aws_dynamodb_table.deploys.arn, aws_dynamodb_table.cache.arn]
}

output "deploys_table" {
  value = aws_dynamodb_table.deploys.name
}

output "cache_table" {
  value = aws_dynamodb_table.cache.name
}

output "content_table" {
  value = aws_dynamodb_table.content.name
}

output "content_table_arn" {
  value = aws_dynamodb_table.content.arn
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "uploads_bucket_arn" {
  value = aws_s3_bucket.uploads.arn
}
