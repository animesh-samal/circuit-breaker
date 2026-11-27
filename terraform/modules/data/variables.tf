variable "project" { type = string }

variable "uploads_bucket_name" {
  description = "Globally unique name for the private bucket that holds uploaded files."
  type        = string
}
