variable "project" { type = string }
variable "region" { type = string }
variable "subnet_id" { type = string }
variable "security_group_id" { type = string }
variable "log_group_name" { type = string }
variable "log_group_arn" { type = string }
variable "ecr_repository_arns" { type = list(string) }
variable "dynamodb_table_arns" { type = list(string) }

variable "instance_type" {
  description = <<-EOT
    t3.small (2 GiB) is the smallest size that runs k3s comfortably. Measured on
    t3.micro (1 GiB): 790 MiB used and 580 MiB swapped with only k3s and its own
    system pods running, coredns restarting under pressure, and the Traefik
    install needing four attempts.
  EOT
  type        = string
  default     = "t3.small"
}

variable "disk_gb" {
  description = "Root volume. 30 GB is the free-tier EBS allowance."
  type        = number
  default     = 20
}

variable "key_name" {
  description = "EC2 key pair for SSH. Null is fine -- use SSM Session Manager instead."
  type        = string
  default     = null
}

variable "k3s_token" {
  description = "Cluster join token. Only matters if a second node is ever added."
  type        = string
  sensitive   = true
}
