output "repository_urls" {
  value = { for k, v in aws_ecr_repository.this : k => v.repository_url }
}

output "repository_arns" {
  value = [for v in aws_ecr_repository.this : v.arn]
}

output "registry_host" {
  value = split("/", values(aws_ecr_repository.this)[0].repository_url)[0]
}
