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

save_output "$BASE/01-os/os_${TIMESTAMP}.txt" bash -c 'uname -a; echo; lsb_release -a 2>/dev/null; echo; df -h; echo; free -h'
save_output "$BASE/05-containerization/docker_ps_${TIMESTAMP}.txt" docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
save_output "$BASE/05-containerization/docker_compose_config_${TIMESTAMP}.txt" docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" ps
save_output "$BASE/06-vcs/git_status_${TIMESTAMP}.txt" git -C "$PROJECT_ROOT" status
save_output "$BASE/06-vcs/git_log_${TIMESTAMP}.txt" git -C "$PROJECT_ROOT" log --oneline -n 30
save_output "$BASE/06-vcs/git_contributors_${TIMESTAMP}.txt" git -C "$PROJECT_ROOT" shortlog -sn
save_output "$BASE/09-iac/terraform_files_${TIMESTAMP}.txt" find "$PROJECT_ROOT/infra/terraform" -type f
save_output "$BASE/09-iac/ansible_files_${TIMESTAMP}.txt" find "$PROJECT_ROOT/infra/ansible" -type f
save_output "$BASE/07-observability/monitoring_compose_config_${TIMESTAMP}.txt" docker compose -f "$PROJECT_ROOT/monitoring-project/docker-compose.yml" config
save_output "$BASE/04-app/api_health_${TIMESTAMP}.txt" curl -sf http://localhost:4000/health
save_output "$BASE/08-ai-layer/n8n_workflow_${TIMESTAMP}.txt" cat "$PROJECT_ROOT/n8n/workflows/exam-submit-notify.json"

# DB evidence (only if container is running)
if docker ps --filter "name=proctolearn_postgres" --format "{{.Names}}" 2>/dev/null | grep -q "proctolearn_postgres"; then
  PGUSER="$(grep '^POSTGRES_USER=' "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2 || echo proctolearn)"
  PGDB="$(grep '^POSTGRES_DB=' "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2 || echo proctolearn_db)"
  save_output "$BASE/03-database/db_tables_${TIMESTAMP}.txt" \
    docker exec proctolearn_postgres psql -U "$PGUSER" -d "$PGDB" -c "\dt"
  save_output "$BASE/03-database/db_counts_${TIMESTAMP}.txt" \
    docker exec proctolearn_postgres psql -U "$PGUSER" -d "$PGDB" \
      -c "SELECT count(*) FROM users;" \
      -c "SELECT count(*) FROM courses;" \
      -c "SELECT count(*) FROM exams;"
fi

echo "Evidence collection complete: $BASE"
