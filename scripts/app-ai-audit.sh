#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
APP_DIR="$PROJECT_ROOT/evidence/04-app"
AI_DIR="$PROJECT_ROOT/evidence/08-ai-layer"
mkdir -p "$APP_DIR" "$AI_DIR"

save_text() {
  local path="$1"
  local title="$2"
  local body="$3"
  {
    echo "$title"
    echo "Generated at: $(date -Iseconds)"
    echo
    echo "$body"
    echo
  } >"$path"
}

if docker compose -f "$PROJECT_ROOT/docker-compose.server.yml" ps >/tmp/procto_app_status.log 2>&1; then
  save_text "$APP_DIR/app_status_${TIMESTAMP}.txt" 'Application Status' "$(cat /tmp/procto_app_status.log)"
else
  save_text "$APP_DIR/app_status_${TIMESTAMP}.txt" 'Application Status' 'ERROR: docker compose ps failed'
fi

if docker compose -f "$PROJECT_ROOT/docker-compose.server.yml" exec -T api sh -lc 'wget -qO- http://localhost:4000/health || true' >/tmp/procto_api_health.log 2>&1; then
  save_text "$APP_DIR/api_health_${TIMESTAMP}.txt" 'API Health' "$(cat /tmp/procto_api_health.log)"
else
  save_text "$APP_DIR/api_health_${TIMESTAMP}.txt" 'API Health' 'ERROR: api health check failed'
fi

save_text "$AI_DIR/n8n_workflow_${TIMESTAMP}.txt" 'n8n Workflow Snapshot' "$(cat "$PROJECT_ROOT/n8n/workflows/exam-submit-notify.json")"
save_text "$AI_DIR/opal_compose_${TIMESTAMP}.txt" 'OPAL Compose Snapshot' "$(cat "$PROJECT_ROOT/opal/docker-compose.opal.yml")"
save_text "$AI_DIR/opal_data_${TIMESTAMP}.txt" 'OPAL Users Data' "$(cat "$PROJECT_ROOT/opal/data/users.json")"

echo "App/AI evidence saved under evidence/04-app and evidence/08-ai-layer"
