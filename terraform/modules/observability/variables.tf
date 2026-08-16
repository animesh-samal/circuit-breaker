variable "project" { type = string }
variable "region" { type = string }
variable "instance_id" { type = string }

variable "monthly_budget_usd" {
  description = "Hard ceiling for alerting. Budgets themselves are free."
  type        = string
  default     = "5"
}

variable "alert_email" {
  description = "Where budget and alarm notifications go."
  type        = string
}
