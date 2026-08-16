# Infrastructure

Terraform for the whole system: network, node, registries, tables, CI identity,
and observability.

```
bootstrap/            state bucket (local state, applied once)
modules/
  network/            VPC, subnet, IGW, route table, security group
  compute/            EC2 + k3s + instance role
  registry/           ECR repositories
  data/               DynamoDB tables
  identity/           GitHub OIDC provider + deploy role
  observability/      alarms, dashboard, budget
envs/prod/            the live environment
```

## Apply

```bash
# 1. State bucket. Once, ever.
cd terraform/bootstrap
terraform init
terraform apply -var account_suffix=<last 6 digits of your account id>
# copy the bucket name from the output

# 2. Point the environment at it
cd ../envs/prod
# edit backend.tf with the bucket name
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars

terraform init
terraform plan     # read this properly
terraform apply
```

Roughly six minutes, most of it the instance booting and installing k3s.

## Afterwards

```bash
terraform output site_url
terraform output github_deploy_role   # -> GitHub repo variable AWS_DEPLOY_ROLE
aws ssm start-session --target $(terraform output -raw ...)   # shell on the node
```

Bootstrap progress is at `/var/log/bootstrap.log` on the node.

## Cost

| Resource | Monthly |
|---|---|
| EC2 t3.small | ~$15.50 |
| Public IPv4 | $3.65 — charged per address, attached or not |
| EBS 20 GB gp3 | ~$1.60 |
| ECR | $0 under 500 MB |
| DynamoDB | $0 — provisioned 5/5, inside the always-free 25/25 |
| CloudWatch | $0 within the free allowances at 7-day retention |
| S3 state | pennies |
| **Total** | **~$21** |

t3.micro was tried first and does not work: 790 MiB used and 580 MiB swapped
with only k3s and its own system pods running. Measured, not assumed.

Open optimisation: **t4g.small** is the same 2 GiB on Graviton for roughly 21%
less. It needs arm64 images, so it is a deliberate follow-up rather than a free
swap.

Deliberately not used: **EKS** ($73/mo control plane), **NAT Gateway** ($32/mo),
**ALB** ($18.40/mo). Each is the right answer in production and the wrong one
here, and the reasoning is recorded rather than hidden.

`terraform destroy` removes everything except the state bucket, which is
protected by `prevent_destroy`.

## Things worth knowing

**State holds secrets in plaintext.** Every attribute of every resource,
including the generated k3s token. That is why the bucket blocks public access,
enforces encryption, and is never committed.

**No stored AWS credentials anywhere.** The node authenticates through its
instance profile; GitHub Actions authenticates through OIDC. There is no access
key in this repository, in the image, or in a Kubernetes Secret.

**The OIDC `sub` condition is load-bearing.** Without it, any repository on
GitHub could assume the deploy role. See `modules/identity/main.tf`.

**IMDSv2 is required on the instance.** Version 1 answers an unauthenticated
GET, so any SSRF in a workload can read the node's temporary credentials.

**ECR tags are immutable.** A version number identifies exactly one image, so a
rollback to `v1.2.0` cannot quietly deploy something else.

**DynamoDB is provisioned, not on-demand.** The always-free tier covers
provisioned capacity only; on-demand bills from the first read.
