output "postgres_connection" {
  description = "Connection string for Terraform-managed PostgreSQL"
  value       = "postgresql://${var.postgres_user}:***@localhost:${var.postgres_host_port}/${var.postgres_db}"
}

output "redis_endpoint" {
  description = "Terraform-managed Redis endpoint"
  value       = "localhost:${var.redis_host_port}"
}

output "minio_endpoints" {
  description = "Terraform-managed MinIO API and console endpoints"
  value = {
    api     = "http://localhost:${var.minio_api_host_port}"
    console = "http://localhost:${var.minio_console_host_port}"
  }
}
