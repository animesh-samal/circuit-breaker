output "table_arns" {
  value = [aws_dynamodb_table.deploys.arn, aws_dynamodb_table.cache.arn]
}

output "deploys_table" {
  value = aws_dynamodb_table.deploys.name
}

output "cache_table" {
  value = aws_dynamodb_table.cache.name
}
