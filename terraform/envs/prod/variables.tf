variable "project" {
  type    = string
  default = "circuit-breaker"
}

variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "key_name" {
  description = "EC2 key pair name. Leave null and use SSM Session Manager."
  type        = string
  default     = null
}

variable "ssh_cidr" {
  description = "Your public IP as a /32. Null closes port 22 entirely."
  type        = string
  default     = null
}

variable "github_repository" {
  description = "owner/repo for the OIDC trust policy."
  type        = string
}

variable "create_oidc_provider" {
  description = "False if GitHub's OIDC provider already exists in this account."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "monthly_budget_usd" {
  description = <<-EOT
    Alert ceiling. Set above the expected ~$13 run rate so the alarm means
    "something is wrong", not "the project is running". An alarm that fires
    every month is an alarm you stop reading.
  EOT
  type        = string
  default     = "15"
}

variable "alert_email" {
  description = "Budget and alarm notifications."
  type        = string
}
