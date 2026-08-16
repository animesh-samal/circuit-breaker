variable "project" { type = string }

variable "repositories" {
  description = "Service names. One repository each."
  type        = list(string)
  default     = ["api", "web"]
}
