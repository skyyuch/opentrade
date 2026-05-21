# --------------------------------------------------------------------------
# Empty secret slots
# --------------------------------------------------------------------------
# This module deliberately creates secrets WITHOUT values. Per rule 50:
#
#   - Secret values must never enter Terraform state files.
#   - The values are written outside Terraform via:
#       aws secretsmanager put-secret-value \
#         --secret-id opentrade/dev/jwt-secret \
#         --secret-string "..."
#
# Each empty slot can be referenced by ARN by the ECS task role and the
# task execution role; the task definition (Phase 1) will inject the
# secret value into the container's environment at launch.

resource "aws_secretsmanager_secret" "this" {
  for_each = toset(var.secret_names)

  name                    = each.value
  description             = "OpenTrade application secret: ${each.value}. Value populated outside Terraform per rule 50."
  recovery_window_in_days = var.recovery_window_in_days

  tags = {
    Name = each.value
  }
}
