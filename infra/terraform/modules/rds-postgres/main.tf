# --------------------------------------------------------------------------
# Subnet group
# --------------------------------------------------------------------------

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-postgres"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.name_prefix}-postgres"
  }
}

# --------------------------------------------------------------------------
# Security group
# --------------------------------------------------------------------------
# Postgres SG denies-by-default. Inbound is granted only from explicitly
# named client security groups (e.g., the ECS service SG passed in
# Phase 1). No 0.0.0.0/0 rule, ever.

resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-postgres"
  description = "Inbound 5432 from allow-listed client SGs only."
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name_prefix}-postgres-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "client" {
  for_each = var.client_security_groups

  security_group_id            = aws_security_group.this.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = each.value
  description                  = "Postgres ingress from client SG: ${each.key}"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.this.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  description       = "Postgres egress: needed for engine telemetry to AWS managed services."
}

# --------------------------------------------------------------------------
# Parameter group
# --------------------------------------------------------------------------
# Custom parameter group lets us tune Postgres settings later without
# disturbing the instance. Phase 0 ships defaults; Phase 1 will likely
# enable `pg_stat_statements` for query observability.

resource "aws_db_parameter_group" "this" {
  name   = "${var.name_prefix}-postgres-pg16"
  family = "postgres16"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  tags = {
    Name = "${var.name_prefix}-postgres-pg16"
  }
}

# --------------------------------------------------------------------------
# Instance
# --------------------------------------------------------------------------
# Master password is managed by RDS itself (not by us): RDS generates a
# random password and writes it to a Secrets Manager secret. Apps read
# from that secret at runtime. No password ever appears in Terraform
# state.
#
# This is the AWS-recommended pattern — `manage_master_user_password = true`
# replaces the previous "make Terraform generate the password and put it
# in state" approach.

resource "aws_db_instance" "this" {
  identifier = "${var.name_prefix}-postgres"

  engine               = "postgres"
  engine_version       = var.engine_version
  instance_class       = var.instance_class
  parameter_group_name = aws_db_parameter_group.this.name

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.username

  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  publicly_accessible    = false
  multi_az               = var.multi_az

  backup_retention_period   = var.backup_retention_days
  copy_tags_to_snapshot     = true
  delete_automated_backups  = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-postgres-final-${formatdate("YYYYMMDDhhmm", timestamp())}"

  performance_insights_enabled = var.performance_insights_enabled

  apply_immediately          = true
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.name_prefix}-postgres"
  }

  lifecycle {
    # `final_snapshot_identifier` re-evaluates `timestamp()` on every plan,
    # which would force a no-op replacement otherwise.
    ignore_changes = [final_snapshot_identifier]
  }
}
