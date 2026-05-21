output "vpc_id" {
  description = "VPC identifier."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "CIDR block this VPC was provisioned with."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet IDs, one per availability zone, in input AZ order."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs, one per availability zone, in input AZ order. RDS + ECS tasks live here."
  value       = aws_subnet.private[*].id
}

output "internet_gateway_id" {
  description = "IGW attached to the VPC."
  value       = aws_internet_gateway.this.id
}

output "nat_gateway_ids" {
  description = "Provisioned NAT gateway IDs. Length is 1 when `single_nat_gateway = true`."
  value       = aws_nat_gateway.this[*].id
}

output "availability_zones" {
  description = "AZs this VPC's subnets live in (echo of input)."
  value       = var.availability_zones
}
