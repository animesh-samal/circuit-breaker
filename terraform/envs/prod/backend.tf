# Remote state.
#
# Fill in the bucket name from the bootstrap stack's output, then run
# `terraform init`.
#
# use_lockfile puts the lock in S3 itself, as a conditional write. The older
# approach was a separate DynamoDB table -- still the answer most interview
# questions expect, and still what you will find in most existing codebases, but
# it is now deprecated in favour of this. Worth knowing both: the concept
# (prevent two applies from interleaving writes) is what matters, and the
# mechanism has simply moved into S3.

terraform {
  backend "s3" {
    bucket       = "circuit-breaker-tfstate-022140"
    key          = "prod/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}
