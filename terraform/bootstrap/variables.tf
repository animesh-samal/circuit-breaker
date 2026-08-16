variable "project" {
  description = "Name prefix for every resource in this project."
  type        = string
  default     = "circuit-breaker"
}

variable "region" {
  description = "AWS region. Mumbai: closest to Hyderabad, so demos are responsive."
  type        = string
  default     = "ap-south-1"
}

variable "account_suffix" {
  description = <<-EOT
    Short unique suffix for the state bucket name. S3 bucket names are globally
    unique across every AWS account on earth, so "circuit-breaker-tfstate" is
    almost certainly taken. Use the last six digits of your account ID.
  EOT
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{4,12}$", var.account_suffix))
    error_message = "Use 4-12 lowercase alphanumeric characters."
  }
}
