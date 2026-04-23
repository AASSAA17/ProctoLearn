variable "network_name" {
  description = "Docker network name for Terraform-managed infrastructure"
  type        = string
  default     = "proctolearn_iac_network"
}

variable "postgres_user" {
  description = "PostgreSQL username"
  type        = string
  default     = "postgres"
}

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "proctolearn_db"
}

variable "postgres_host_port" {
  description = "Host port for Terraform-managed PostgreSQL"
  type        = number
  default     = 55432
}

variable "redis_host_port" {
  description = "Host port for Terraform-managed Redis"
  type        = number
  default     = 56379
}

variable "minio_root_user" {
  description = "MinIO root user"
  type        = string
  default     = "minioadmin"
}

variable "minio_root_password" {
  description = "MinIO root password"
  type        = string
  sensitive   = true
}

variable "minio_api_host_port" {
  description = "Host port for MinIO API"
  type        = number
  default     = 59000
}

variable "minio_console_host_port" {
  description = "Host port for MinIO console"
  type        = number
  default     = 59001
}
