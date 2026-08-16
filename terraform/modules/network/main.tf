# Network.
#
# Written by hand rather than using the default VPC, because subnets, route
# tables and internet gateways are asked about constantly and wiring them once
# is worth more than reading about them ten times.
#
# Deliberately absent: a NAT gateway. It costs roughly $32/month plus data
# processing -- more than every other resource in this project combined. The
# correct production design puts workloads in private subnets behind NAT, or
# uses VPC endpoints for AWS-service traffic. Here the node sits in a public
# subnet with a security group doing the work. That is a real trade-off with a
# real cost, and stating it plainly is better than quietly paying for it.

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${var.project}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true

  tags = { Name = "${var.project}-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  # The default route. Without this the subnet has an internet gateway attached
  # to its VPC and still cannot reach the internet -- the gateway exists, but
  # nothing routes to it. This is the single most common VPC mistake.
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${var.project}-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "node" {
  name        = "${var.project}-node"
  description = "Ingress for the k3s node"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${var.project}-node" }
}

# Separate rule resources rather than inline ingress blocks. Inline blocks are
# authoritative: any rule added out-of-band gets silently removed on the next
# apply, and rules cannot be changed without replacing the whole group.
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.node.id
  description       = "HTTP from anywhere"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.node.id
  description       = "HTTPS from anywhere"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# SSH is restricted to a single caller-supplied CIDR. Opening 22 to 0.0.0.0/0
# attracts credential-stuffing traffic within minutes of the instance booting.
resource "aws_vpc_security_group_ingress_rule" "ssh" {
  count = var.ssh_cidr == null ? 0 : 1

  security_group_id = aws_security_group.node.id
  description       = "SSH from the operator only"
  cidr_ipv4         = var.ssh_cidr
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.node.id
  description       = "All outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
