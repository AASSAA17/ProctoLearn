#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
DEST_DIR="$PROJECT_ROOT/evidence/07-observability"
DEST_FILE="$DEST_DIR/observability_demo_${TIMESTAMP}.txt"
LOAD_LOG="$DEST_DIR/load_test_${TIMESTAMP}.txt"
mkdir -p "$DEST_DIR"

PROM_URL="${PROMETHEUS_URL:-http://localhost:9090}"
ALERT_NAME="${ALERT_NAME:-ObservabilityDemoApiLoad}"
LOAD_URL="${LOAD_URL:-http://localhost:4000/health}"
DURATION_SEC="${DURATION_SEC:-120}"
CONCURRENCY="${CONCURRENCY:-60}"
TIMEOUT_MS="${TIMEOUT_MS:-5000}"
FIRE_TIMEOUT_SEC="${FIRE_TIMEOUT_SEC:-300}"
RESOLVE_TIMEOUT_SEC="${RESOLVE_TIMEOUT_SEC:-600}"

{
  echo "ProctoLearn Observability Demo"
  echo "Generated at: $(date -Iseconds)"
  echo "AlertName: $ALERT_NAME"
  echo "LoadUrl: $LOAD_URL"
  echo "DurationSec: $DURATION_SEC"
  echo "Concurrency: $CONCURRENCY"
  echo "TimeoutMs: $TIMEOUT_MS"
  echo "FireTimeoutSec: $FIRE_TIMEOUT_SEC"
  echo "ResolveTimeoutSec: $RESOLVE_TIMEOUT_SEC"
  echo
} >"$DEST_FILE"

node scripts/load-test.js --url "$LOAD_URL" --duration "$DURATION_SEC" --concurrency "$CONCURRENCY" --timeout "$TIMEOUT_MS" >"$LOAD_LOG" 2>&1 &
LOAD_PID=$!

echo "Load test PID: $LOAD_PID" >>"$DEST_FILE"

wait_for_state() {
  local desired="$1"
  local timeout_sec="$2"
  local deadline=$((SECONDS + timeout_sec))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS "$PROM_URL/api/v1/alerts" | grep -q "\"alertname\":\"$ALERT_NAME\""; then
      if [ "$desired" = "firing" ]; then
        echo "FIRING detected at $(date -Iseconds)" >>"$DEST_FILE"
        return 0
      fi
    else
      if [ "$desired" = "resolved" ]; then
        echo "RESOLVED detected at $(date -Iseconds)" >>"$DEST_FILE"
        return 0
      fi
    fi
    sleep 5
  done
  echo "$desired not detected within timeout" >>"$DEST_FILE"
  return 1
}

wait_for_state firing "$FIRE_TIMEOUT_SEC" || true
wait "$LOAD_PID" || true
wait_for_state resolved "$RESOLVE_TIMEOUT_SEC" || true

{
  echo
  echo "=== Load Test Log ==="
  cat "$LOAD_LOG"
  echo
} >>"$DEST_FILE"

if docker logs alertmanager --since 20m >/tmp/procto_alertmanager_obs.log 2>&1; then
  {
    echo "=== Alertmanager Logs ==="
    cat /tmp/procto_alertmanager_obs.log
    echo
  } >>"$DEST_FILE"
fi

if docker logs proctolearn_jenkins --since 20m >/tmp/procto_jenkins_obs.log 2>&1; then
  {
    echo "=== Jenkins Logs ==="
    cat /tmp/procto_jenkins_obs.log
    echo
  } >>"$DEST_FILE"
fi

echo "Observability demo saved: $DEST_FILE"
