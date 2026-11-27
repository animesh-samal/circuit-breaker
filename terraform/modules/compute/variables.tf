variable "project" { type = string }
variable "region" { type = string }
variable "subnet_id" { type = string }
variable "security_group_id" { type = string }
variable "log_group_name" { type = string }
variable "log_group_arn" { type = string }
variable "ecr_repository_arns" { type = list(string) }
variable "dynamodb_table_arns" { type = list(string) }

variable "content_table_arn" {
  description = "The table the admin panel saves the site content in."
  type        = string
}

variable "uploads_bucket_arn" {
  description = "The private bucket that holds uploaded files such as the CV."
  type        = string
}

variable "admin_parameter_name" {
  description = "Name of the encrypted parameter holding the admin sign-in credentials."
  type        = string
  default     = "/circuit-breaker/admin"
}

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
