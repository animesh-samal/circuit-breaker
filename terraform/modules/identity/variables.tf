variable "project" { type = string }
variable "region" { type = string }
variable "ecr_repository_arns" { type = list(string) }
variable "dynamodb_table_arns" { type = list(string) }

variable "github_repository" {
  description = "owner/repo, e.g. animesh-samal/circuit-breaker"
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9-_.]+/[A-Za-z0-9-_.]+$", var.github_repository))
    error_message = "Must be in owner/repo form."
  }
}

variable "github_owner_id" {
  description = <<-EOT
    Numeric GitHub account ID, from the `sub` claim or
    `curl https://api.github.com/users/<owner> | jq .id`. Null wildcards it,
    which works but weakens the trust to a name match.
  EOT
  type        = string
  default     = null
}

variable "github_repository_id" {
  description = <<-EOT
    Numeric repository ID, from the `sub` claim or
    `curl https://api.github.com/repos/<owner>/<repo> | jq .id`.
  EOT
  type        = string
  default     = null
}

variable "create_oidc_provider" {
  description = <<-EOT
    An AWS account may hold only one OIDC provider per URL. Set false if
    GitHub's provider already exists in this account from another project --
    otherwise the apply fails with EntityAlreadyExists.
  EOT
  type        = bool
  default     = true
}
