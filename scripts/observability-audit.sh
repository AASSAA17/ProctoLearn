#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
DEST_DIR="$PROJECT_ROOT/evidence/07-observability"
DEST_FILE="$DEST_DIR/observability_audit_${TIMESTAMP}.txt"
mkdir -p "$DEST_DIR"

add_section() {
  local title="$1"
  local body="$2"
  {
    echo
    echo "=== $title ==="
    echo "$body"
    echo
  } >>"$DEST_FILE"
}

{
  echo "ProctoLearn Observability Audit"
  echo "Generated at: $(date -Iseconds)"
  echo "Project root: $PROJECT_ROOT"
  echo "Prometheus URL: ${PROMETHEUS_URL:-http://localhost:9090}"
  echo "Alertmanager URL: ${ALERTMANAGER_URL:-http://localhost:9093}"
  echo "Jenkins URL: ${JENKINS_URL:-http://localhost:8088}"
  echo
} >"$DEST_FILE"

for file in \
  "$PROJECT_ROOT/Jenkinsfile" \
  "$PROJECT_ROOT/monitoring-project/prometheus/alert.rules.yml" \
  "$PROJECT_ROOT/monitoring-project/prometheus/prometheus.yml" \
  "$PROJECT_ROOT/monitoring-project/alertmanager/alertmanager.yml"; do
  if [ -f "$file" ]; then
    add_section "$(basename "$file")" "$(cat "$file")"
  else
    add_section "$(basename "$file")" "File not found: $file"
  fi
 done

prom_url="${PROMETHEUS_URL:-http://localhost:9090}"
am_url="${ALERTMANAGER_URL:-http://localhost:9093}"

if curl -fsS "$prom_url/api/v1/alerts" >/tmp/procto_alerts.json 2>/dev/null; then
  add_section "Prometheus Active Alerts" "$(cat /tmp/procto_alerts.json)"
else
  add_section "Prometheus Active Alerts" "ERROR: unable to query $prom_url/api/v1/alerts"
fi

if curl -fsS "$prom_url/api/v1/rules" >/tmp/procto_rules.json 2>/dev/null; then
  add_section "Prometheus Rules" "$(cat /tmp/procto_rules.json)"
else
  add_section "Prometheus Rules" "ERROR: unable to query $prom_url/api/v1/rules"
fi

if curl -fsS "$am_url/api/v2/status" >/tmp/procto_am_status.json 2>/dev/null; then
  add_section "Alertmanager Status" "$(cat /tmp/procto_am_status.json)"
else
  add_section "Alertmanager Status" "ERROR: unable to query $am_url/api/v2/status"
fi

if curl -fsS "$am_url/api/v2/alerts" >/tmp/procto_am_alerts.json 2>/dev/null; then
  add_section "Alertmanager Alerts" "$(cat /tmp/procto_am_alerts.json)"
else
  add_section "Alertmanager Alerts" "ERROR: unable to query $am_url/api/v2/alerts"
fi

if docker logs proctolearn_jenkins --since 1h >/tmp/procto_jenkins.log 2>&1; then
  add_section "Jenkins Logs" "$(cat /tmp/procto_jenkins.log)"
else
  add_section "Jenkins Logs" "ERROR: unable to read Jenkins logs"
fi

if docker logs alertmanager --since 1h >/tmp/procto_alertmanager.log 2>&1; then
  add_section "Alertmanager Logs" "$(cat /tmp/procto_alertmanager.log)"
else
  add_section "Alertmanager Logs" "ERROR: unable to read Alertmanager logs"
fi

echo "Observability audit saved: $DEST_FILE"
