resource "docker_network" "proctolearn" {
  name = var.network_name
}

resource "docker_volume" "postgres_data" {
  name = "proctolearn_iac_postgres_data"
}

resource "docker_volume" "minio_data" {
  name = "proctolearn_iac_minio_data"
}

resource "docker_image" "postgres" {
  name = "postgres:16-alpine"
}

resource "docker_image" "redis" {
  name = "redis:7-alpine"
}

resource "docker_image" "minio" {
  name = "minio/minio:latest"
}

resource "docker_container" "postgres" {
  name  = "proctolearn_iac_postgres"
  image = docker_image.postgres.image_id

  env = [
    "POSTGRES_USER=${var.postgres_user}",
    "POSTGRES_PASSWORD=${var.postgres_password}",
    "POSTGRES_DB=${var.postgres_db}"
  ]

  ports {
    internal = 5432
    external = var.postgres_host_port
  }

  volumes {
    volume_name    = docker_volume.postgres_data.name
    container_path = "/var/lib/postgresql/data"
  }

  networks_advanced {
    name = docker_network.proctolearn.name
  }

  restart = "unless-stopped"
}

resource "docker_container" "redis" {
  name  = "proctolearn_iac_redis"
  image = docker_image.redis.image_id

  ports {
    internal = 6379
    external = var.redis_host_port
  }

  networks_advanced {
    name = docker_network.proctolearn.name
  }

  restart = "unless-stopped"
}

resource "docker_container" "minio" {
  name  = "proctolearn_iac_minio"
  image = docker_image.minio.image_id

  command = ["server", "/data", "--console-address", ":9001"]

  env = [
    "MINIO_ROOT_USER=${var.minio_root_user}",
    "MINIO_ROOT_PASSWORD=${var.minio_root_password}"
  ]

  ports {
    internal = 9000
    external = var.minio_api_host_port
  }

  ports {
    internal = 9001
    external = var.minio_console_host_port
  }

  volumes {
    volume_name    = docker_volume.minio_data.name
    container_path = "/data"
  }

  networks_advanced {
    name = docker_network.proctolearn.name
  }

  restart = "unless-stopped"
}
