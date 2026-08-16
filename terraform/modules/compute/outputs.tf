output "instance_id" {
  value = aws_instance.node.id
}

output "public_ip" {
  description = "Point DNS here, or open it directly."
  value       = aws_eip.node.public_ip
}

output "role_arn" {
  value = aws_iam_role.node.arn
}

output "ssm_command" {
  description = "Open a shell without SSH."
  value       = "aws ssm start-session --target ${aws_instance.node.id} --region ${var.region}"
}
