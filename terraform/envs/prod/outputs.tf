output "site_url" {
  description = "Open this once the manifests are applied."
  value       = "http://${module.compute.public_ip}"
}

output "public_ip" {
  value = module.compute.public_ip
}

output "instance_id" {
  description = "The node. Used by SSM and by anything targeting the host directly."
  value       = module.compute.instance_id
}

output "ssm_session" {
  description = "Shell onto the node without SSH."
  value       = module.compute.ssm_command
}

output "registry_host" {
  value = module.registry.registry_host
}

output "ecr_repositories" {
  value = module.registry.repository_urls
}

output "github_deploy_role" {
  description = "Set as the AWS_DEPLOY_ROLE variable in the GitHub repository."
  value       = module.identity.deploy_role_arn
}

output "dashboard_url" {
  value = module.observability.dashboard_url
}

output "deploys_table" {
  value = module.data.deploys_table
}
