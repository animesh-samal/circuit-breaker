output "state_bucket" {
  description = "Put this in envs/prod/backend.tf."
  value       = aws_s3_bucket.state.id
}

output "backend_block" {
  description = "Copy-paste backend configuration for the environment stacks."
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket       = "${aws_s3_bucket.state.id}"
        key          = "prod/terraform.tfstate"
        region       = "${var.region}"
        encrypt      = true
        use_lockfile = true
      }
    }
  EOT
}
