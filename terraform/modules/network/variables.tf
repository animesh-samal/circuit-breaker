variable "project" {
  type = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.0.1.0/24"
}

variable "availability_zone" {
  type = string
}

variable "ssh_cidr" {
  description = "Your public IP as a /32, e.g. 203.0.113.7/32. Null disables SSH entirely."
  type        = string
  default     = null

  validation {
    condition     = var.ssh_cidr == null || can(cidrnetmask(var.ssh_cidr))
    error_message = "Must be a valid CIDR block, or null."
  }
}
