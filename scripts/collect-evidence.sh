#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
BASE="$PROJECT_ROOT/evidence"

mkdir -p \
  "$BASE/01-os" \
  "$BASE/02-security-network" \
  "$BASE/03-database" \
  "$BASE/04-app" \
  "$BASE/05-containerization" \
  "$BASE/06-vcs" \
  "$BASE/07-observability" \
  "$BASE/08-ai-layer" \
  "$BASE/09-iac"

save_output() {
  local path="$1"
  shift
  if "$@" >"$path" 2>&1; then
    true
  else
    echo "Command failed: $*" >"$path"
  fi
}

save_output "$BASE/01-os/os_${TIMESTAMP}.txt" uname -a
save_output "$BASE/05-containerization/docker_ps_${TIMESTAMP}.txt" docker ps
save_output "$BASE/05-containerization/docker_compose_config_${TIMESTAMP}.txt" docker compose -f "$PROJECT_ROOT/docker-compose.server.yml" config
save_output "$BASE/06-vcs/git_status_${TIMESTAMP}.txt" git -C "$PROJECT_ROOT" status
save_output "$BASE/06-vcs/git_log_${TIMESTAMP}.txt" git -C "$PROJECT_ROOT" log --oneline -n 30
save_output "$BASE/09-iac/terraform_files_${TIMESTAMP}.txt" find "$PROJECT_ROOT/infra/terraform" -type f
save_output "$BASE/09-iac/ansible_files_${TIMESTAMP}.txt" find "$PROJECT_ROOT/infra/ansible" -type f
save_output "$BASE/07-observability/monitoring_compose_config_${TIMESTAMP}.txt" docker compose -f "$PROJECT_ROOT/monitoring-project/docker-compose.yml" config

echo "Evidence collection complete: $BASE"
