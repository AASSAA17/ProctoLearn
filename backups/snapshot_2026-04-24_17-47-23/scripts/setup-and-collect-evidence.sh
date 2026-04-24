#!/usr/bin/env bash
# =============================================================
# ProctoLearn — Full Automated Evidence Collection
# Usage: bash scripts/setup-and-collect-evidence.sh
# =============================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
BASE="$PROJECT_ROOT/evidence"
LOG="$BASE/setup_log_${TIMESTAMP}.txt"

# Colour helpers
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $*${NC}"; }
fail() { echo -e "${RED}❌  $*${NC}"; }

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

exec > >(tee -a "$LOG") 2>&1
echo "================================================"
echo " ProctoLearn Evidence Collection — $TIMESTAMP"
echo "================================================"

# ──────────────────────────────────────────────────
# MODULE 1 — OS
# ──────────────────────────────────────────────────
echo -e "\n[1/9] OS"
{
  echo "=== uname -a ==="; uname -a
  echo ""; echo "=== lsb_release -a ==="; lsb_release -a 2>/dev/null
  echo ""; echo "=== df -h ==="; df -h
  echo ""; echo "=== free -h ==="; free -h
  echo ""; echo "=== uptime ==="; uptime
  echo ""; echo "=== hostname ==="; hostname
  echo ""; echo "=== ip addr brief ==="; ip -brief addr show 2>/dev/null || ip addr show 2>/dev/null | head -40
  echo ""; echo "=== cpu info ==="; lscpu | grep -E "^(Architecture|CPU\(s\)|Model name|Virtualization)" 2>/dev/null
} > "$BASE/01-os/os_info_${TIMESTAMP}.txt"
ok "Module 1 — OS info captured → evidence/01-os/os_info_${TIMESTAMP}.txt"

# ──────────────────────────────────────────────────
# MODULE 2 — Security / Network
# ──────────────────────────────────────────────────
echo -e "\n[2/9] Security / Network"
{
  echo "=== SSH service status ==="; systemctl status ssh 2>/dev/null || systemctl status sshd 2>/dev/null || echo "SSH not running"
  echo ""; echo "=== SSH effective settings ==="; sudo sshd -T 2>/dev/null | grep -E "^(port|passwordauthentication|permitrootlogin|pubkeyauthentication) " || echo "Cannot read sshd -T (need sudo)"
  echo ""; echo "=== UFW status ==="; sudo ufw status verbose 2>/dev/null || ufw status 2>/dev/null || echo "UFW not installed"
  echo ""; echo "=== Fail2Ban status ==="; sudo fail2ban-client status 2>/dev/null || echo "Fail2Ban not installed"
  echo ""; echo "=== Fail2Ban sshd jail ==="; sudo fail2ban-client status sshd 2>/dev/null || echo "Fail2Ban sshd not configured"
  echo ""; echo "=== Listening ports ==="; ss -tlnp 2>/dev/null | head -30
  echo ""; echo "=== Firewall rules (iptables) ==="; sudo iptables -L -n --line-numbers 2>/dev/null | head -40 || echo "Cannot read iptables"
} > "$BASE/02-security-network/security_audit_${TIMESTAMP}.txt"
ok "Module 2 — Security audit captured"

# Ansible playbook hint
cat > "$BASE/02-security-network/ANSIBLE_COMMAND.txt" << 'HINT'
# Run Ansible security role against VM:
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbook.yml \
  --tags security 2>&1 | tee evidence/02-security-network/ansible_security_run.txt
HINT
ok "Module 2 — Ansible command hint saved"

# ──────────────────────────────────────────────────
# MODULE 3 — Database
# ──────────────────────────────────────────────────
echo -e "\n[3/9] Database"
if docker ps --filter "name=proctolearn_postgres" --format "{{.Names}}" 2>/dev/null | grep -q "proctolearn_postgres"; then
  PGUSER=$(grep POSTGRES_USER "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2 || echo "proctolearn")
  PGDB=$(grep POSTGRES_DB "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2 || echo "proctolearn_db")

  docker exec proctolearn_postgres psql -U "$PGUSER" -d "$PGDB" \
    -c "SELECT version();" \
    -c "\dt" \
    -c "SELECT count(*) AS users_count FROM users;" \
    -c "SELECT count(*) AS courses_count FROM courses;" \
    -c "SELECT count(*) AS exams_count FROM exams;" \
    -c "SELECT count(*) AS lessons_count FROM lessons;" \
    > "$BASE/03-database/db_tables_and_counts_${TIMESTAMP}.txt" 2>&1
  ok "Module 3 — DB tables/counts captured"

  docker exec proctolearn_postgres cat /var/lib/postgresql/data/pg_hba.conf \
    > "$BASE/03-database/pg_hba_conf_${TIMESTAMP}.txt" 2>&1
  ok "Module 3 — pg_hba.conf captured"
else
  warn "Module 3 — postgres container not running; start with: docker compose -f docker-compose.dev.yml up -d"
  echo "Container not running at $TIMESTAMP" > "$BASE/03-database/STATUS.txt"
fi

# ──────────────────────────────────────────────────
# MODULE 4 — Application
# ──────────────────────────────────────────────────
echo -e "\n[4/9] Application"
{
  echo "=== API health check ==="
  curl -sf http://localhost:4000/health 2>/dev/null || echo "API not reachable at localhost:4000"
  echo ""
  echo "=== Swagger/OpenAPI spec ping ==="
  curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost:4000/api 2>/dev/null || echo "Swagger not reachable"
  echo ""
  echo "=== Frontend ping ==="
  curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3001 2>/dev/null || echo "Frontend not reachable"
} > "$BASE/04-app/app_status_${TIMESTAMP}.txt"
ok "Module 4 — App status captured"

# ──────────────────────────────────────────────────
# MODULE 5 — Docker / Containerization
# ──────────────────────────────────────────────────
echo -e "\n[5/9] Docker"
{
  echo "=== docker version ==="; docker version 2>/dev/null || echo "Docker not installed"
  echo ""; echo "=== docker ps ==="; docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker not running"
  echo ""; echo "=== docker compose ps (dev stack) ==="; docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" ps 2>/dev/null || echo "Dev stack not up"
  echo ""; echo "=== docker compose ps (main stack) ==="; docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps 2>/dev/null || echo "Main stack not up"
  echo ""; echo "=== API container logs (last 20) ==="; docker logs --tail 20 proctolearn_api_dev 2>/dev/null || docker logs --tail 20 proctolearn_api 2>/dev/null || echo "API container not running"
} > "$BASE/05-containerization/docker_status_${TIMESTAMP}.txt"
ok "Module 5 — Docker status captured"

# ──────────────────────────────────────────────────
# MODULE 6 — VCS / Git
# ──────────────────────────────────────────────────
echo -e "\n[6/9] Git"
{
  echo "=== git log --oneline (last 30) ==="; git -C "$PROJECT_ROOT" log --oneline -n 30
  echo ""; echo "=== git status ==="; git -C "$PROJECT_ROOT" status
  echo ""; echo "=== git branch ==="; git -C "$PROJECT_ROOT" branch -a
  echo ""; echo "=== git remote ==="; git -C "$PROJECT_ROOT" remote -v
  echo ""; echo "=== commit count ==="; git -C "$PROJECT_ROOT" rev-list --count HEAD
} > "$BASE/06-vcs/git_log_${TIMESTAMP}.txt"
ok "Module 6 — Git history captured"

# ──────────────────────────────────────────────────
# MODULE 7 — Observability
# ──────────────────────────────────────────────────
echo -e "\n[7/9] Observability"
{
  echo "=== Monitoring stack compose config ==="
  docker compose -f "$PROJECT_ROOT/monitoring-project/docker-compose.yml" config 2>/dev/null | head -60 || echo "Cannot read compose config"
  echo ""; echo "=== Prometheus health ==="
  curl -sf http://localhost:9090/-/healthy 2>/dev/null || echo "Prometheus not running"
  echo ""; echo "=== Alertmanager health ==="
  curl -sf http://localhost:9093/-/healthy 2>/dev/null || echo "Alertmanager not running"
  echo ""; echo "=== Grafana health ==="
  curl -sf http://localhost:3000/api/health 2>/dev/null || echo "Grafana not running"
  echo ""; echo "=== Node Exporter metrics (sample) ==="
  curl -sf http://localhost:9100/metrics 2>/dev/null | grep "^node_load" | head -5 || echo "Node Exporter not running"
} > "$BASE/07-observability/observability_status_${TIMESTAMP}.txt"
ok "Module 7 — Observability status captured"

# Alertmanager config evidence
cp "$PROJECT_ROOT/monitoring-project/alertmanager/alertmanager.yml" \
   "$BASE/07-observability/alertmanager_config.yml" 2>/dev/null
cp "$PROJECT_ROOT/monitoring-project/prometheus/alert.rules.yml" \
   "$BASE/07-observability/alert_rules.yml" 2>/dev/null
ok "Module 7 — Alert configs copied"

# ──────────────────────────────────────────────────
# MODULE 8 — AI Layer (n8n + OPAL)
# ──────────────────────────────────────────────────
echo -e "\n[8/9] AI Layer"
{
  echo "=== n8n health ==="
  curl -sf http://localhost:5678/healthz 2>/dev/null || echo "n8n not running"
  echo ""; echo "=== OPA health ==="
  curl -sf http://localhost:8181/health 2>/dev/null || echo "OPA not running"
  echo ""; echo "=== OPAL server ==="
  curl -sf http://localhost:7002/healthcheck 2>/dev/null || echo "OPAL server not running"
  echo ""; echo "=== n8n workflow file ==="
  cat "$PROJECT_ROOT/n8n/workflows/exam-submit-notify.json" | python3 -m json.tool 2>/dev/null | head -40 || cat "$PROJECT_ROOT/n8n/workflows/exam-submit-notify.json"
} > "$BASE/08-ai-layer/ai_layer_status_${TIMESTAMP}.txt"
ok "Module 8 — AI layer status captured"

# ──────────────────────────────────────────────────
# MODULE 9 — IaC (Terraform + Ansible)
# ──────────────────────────────────────────────────
echo -e "\n[9/9] IaC"
TERRAFORM_DIR="$PROJECT_ROOT/infra/terraform"
ANSIBLE_DIR="$PROJECT_ROOT/infra/ansible"

# Terraform
if command -v terraform &>/dev/null; then
  {
    echo "=== terraform version ==="; terraform -version
    echo ""; echo "=== terraform init ==="; terraform -chdir="$TERRAFORM_DIR" init -no-color 2>&1
    echo ""; echo "=== terraform validate ==="; terraform -chdir="$TERRAFORM_DIR" validate -no-color 2>&1
    echo ""; echo "=== terraform plan ==="; terraform -chdir="$TERRAFORM_DIR" plan -no-color 2>&1 | head -100
  } > "$BASE/09-iac/terraform_plan_${TIMESTAMP}.txt"
  ok "Module 9 — Terraform plan captured"
else
  warn "Module 9 — terraform not installed. Install with: scripts/install-tools.sh"
  echo "terraform not installed at $TIMESTAMP" > "$BASE/09-iac/terraform_not_installed.txt"
fi

# Ansible
if command -v ansible &>/dev/null; then
  {
    echo "=== ansible version ==="; ansible --version
    echo ""; echo "=== ansible inventory ==="; ansible-inventory -i "$ANSIBLE_DIR/inventory.ini" --list 2>&1 | head -40
    echo ""; echo "=== ansible playbook check ==="; ansible-playbook -i "$ANSIBLE_DIR/inventory.ini" "$ANSIBLE_DIR/playbook.yml" --check --diff -o 2>&1 | head -60 || echo "Check run failed (VM may be unreachable)"
  } > "$BASE/09-iac/ansible_check_${TIMESTAMP}.txt"
  ok "Module 9 — Ansible check captured"
else
  warn "Module 9 — ansible not installed. Install with: pip install ansible"
  echo "ansible not installed at $TIMESTAMP" > "$BASE/09-iac/ansible_not_installed.txt"
fi

# Copy key Ansible/Terraform files as evidence
{
  echo "=== Terraform files ==="; find "$TERRAFORM_DIR" -type f | sort
  echo ""; echo "=== Ansible files ==="; find "$ANSIBLE_DIR" -type f | sort
} > "$BASE/09-iac/iac_file_inventory_${TIMESTAMP}.txt"
ok "Module 9 — IaC file inventory captured"

# ──────────────────────────────────────────────────
# Git commit
# ──────────────────────────────────────────────────
echo ""
echo "================================================"
echo " Evidence collection complete!"
echo " Saved to: $BASE"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Install Docker:       bash scripts/install-docker.sh"
echo "  2. Start dev stack:      docker compose -f docker-compose.dev.yml up -d"
echo "  3. Run DB evidence:      bash scripts/collect-db-evidence.sh"
echo "  4. Set Telegram token:   edit monitoring-project/.env → TELEGRAM_BOT_TOKEN"
echo "  5. Start monitoring:     cd monitoring-project && docker compose up -d"
echo "  6. Install Terraform:    bash scripts/install-tools.sh"
echo "  7. Commit all changes:   git add -A && git commit -m 'feat: add evidence and fix configs'"
