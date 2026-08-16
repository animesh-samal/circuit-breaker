output "deploy_role_arn" {
  description = "Set this as AWS_DEPLOY_ROLE in the GitHub repository variables."
  value       = aws_iam_role.deploy.arn
}
