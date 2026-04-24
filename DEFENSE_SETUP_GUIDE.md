# 🎓 ProctoLearn — Defense Preparation Guide (95–100 points)

> Last updated: April 23, 2026  
> Machine: `arsen-VirtualBox` — Ubuntu 24.04.4 LTS ✅

---

## ⚡ Quick Priority Checklist

| # | Action | Script / Command | Evidence | Points |
|---|--------|-----------------|----------|--------|
| 1 | **Install Docker** | `sudo bash scripts/install-docker.sh` | — | prerequisite |
| 2 | **Start dev stack** | `docker compose -f docker-compose.dev.yml up -d` | — | prerequisite |
| 3 | **DB evidence** (Module 3) | `bash scripts/collect-db-evidence.sh` | `evidence/03-database/` | **+6** |
| 4 | **Telegram bot** (Module 7) | Edit `monitoring-project/.env` → `TELEGRAM_BOT_TOKEN` | screenshot | **+3** |
| 5 | **Ansible on VM** | `ansible-playbook -i infra/ansible/inventory.ini ...` | `evidence/09-iac/` | **+4** |
| 6 | **Grafana screenshot** | Open `http://localhost:3000` | screenshot | **+2** |
| 7 | **Jenkins build** | `docker compose -f docker-compose.dev.yml up jenkins` | screenshot | **+1** |
| 8 | **n8n workflow** | `bash scripts/start-n8n-and-trigger.sh` | screenshot | **+2** |
| 9 | **Terraform plan** | `bash scripts/collect-iac-evidence.sh` | `evidence/09-iac/` | **+2** |
| 10 | **App screenshots** | Open `http://localhost:3001` | screenshot | **+1** |

---

## Module 1 — OS (Target: 5/5) ✅

Evidence already collected: `evidence/01-os/os_info.txt`

The machine **is** a VirtualBox VM running Ubuntu 24.04.4 LTS.

```bash
# Nothing more needed — evidence already captured
cat evidence/01-os/os_info.txt
```

**Screenshot needed:** VirtualBox window (host) with the running VM.

---

## Module 2 — Security / Network (Target: 10/10)

### Step 1: Install security tools on this VM
```bash
sudo apt-get update
sudo apt-get install -y openssh-server ufw fail2ban

# SSH hardening (already in Ansible role)
sudo cp infra/ansible/roles/security/templates/sshd-hardening.conf.j2 \
        /etc/ssh/sshd_config.d/99-proctolearn-hardening.conf
# Edit: change Port 22 → Port 2222, PasswordAuthentication no, PermitRootLogin no
sudo systemctl restart ssh

# UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp     # SSH
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp      # HTTPS
sudo ufw allow 4000/tcp     # API
sudo ufw enable
sudo ufw status verbose     # ← screenshot this
```

### Step 2: Fail2Ban
```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo fail2ban-client status sshd   # ← screenshot this
```

### Step 3: SSL (self-signed for localhost)
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/proctolearn.key \
  -out /etc/ssl/certs/proctolearn.crt \
  -subj "/CN=localhost/O=ProctoLearn"

# Test nginx
sudo nginx -t   # ← screenshot this
curl -k https://localhost
```

### Step 4: Ansible PLAY RECAP
```bash
# Update inventory.ini with this machine's IP:
# 127.0.0.1 ansible_user=arsen ansible_connection=local

ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbook.yml \
  2>&1 | tee evidence/02-security-network/ansible_play_recap.txt
# ↑ Screenshot the PLAY RECAP line: ok=X changed=Y failed=0
```

### Step 5: Backup demonstration
```bash
# Start postgres first, then:
bash scripts/backup.sh
ls -lh backups/   # ← shows .sql.gz file → screenshot
```

**Evidence folder:** `evidence/02-security-network/`

---

## Module 3 — Database (Target: 20/20) 🔴 Missing!

```bash
# 1. Start stack
docker compose -f docker-compose.dev.yml up -d postgres pgadmin

# 2. Run seed (first time only)
docker compose -f docker-compose.dev.yml exec api npx prisma db push
docker compose -f docker-compose.dev.yml exec api npx ts-node prisma/seed.ts

# 3. Collect evidence (auto-script)
bash scripts/collect-db-evidence.sh

# 4. pgAdmin — open http://localhost:5050
#    Login: admin@proctolearn.com / admin123
#    Connect to Server "ProctoLearn Dev" (pre-configured)
#    Screenshot: table tree + query SELECT count(*) FROM users;
```

---

## Module 4 — Application (Target: 25/25)

```bash
# Start full dev stack
docker compose -f docker-compose.dev.yml up -d

# Wait ~60s for build, then open:
# http://localhost:3001    ← Frontend (screenshots needed)
# http://localhost:4000/api ← Swagger UI (screenshot)

# Screenshots needed:
# 1. Home page / landing
# 2. Course catalog page
# 3. Exam page
# 4. Student/Teacher dashboard
# 5. Swagger UI at /api
# 6. Browser Network tab showing API call to /courses or /exams
```

---

## Module 5 — Docker (Target: 9/9)

```bash
docker compose -f docker-compose.dev.yml ps            # ← screenshot (all healthy)
docker compose -f docker-compose.dev.yml logs api --tail=20  # ← screenshot (no errors)
docker images | grep proctolearn                        # ← screenshot

# Save to evidence
docker compose -f docker-compose.dev.yml ps > evidence/05-containerization/compose_ps_$(date +%F).txt
docker compose -f docker-compose.dev.yml logs api --tail=30 > evidence/05-containerization/api_logs_$(date +%F).txt
```

---

## Module 6 — Git (Target: 6/6)

After making all the changes above, commit frequently:
```bash
git add -A
git commit -m "fix: replace hardcoded telegram token placeholder with env var"
git add evidence/
git commit -m "docs: add Module 3 database evidence directory and README"
git add .env monitoring-project/.env infra/terraform/terraform.tfvars
git commit -m "chore: add .env files and terraform.tfvars for local dev"
git add scripts/
git commit -m "feat: add automated evidence collection scripts for all modules"
git push origin main
```

---

## Module 7 — Observability (Target: 11/11)

### Step 1: Telegram Bot (2 minutes)
1. Open Telegram → message `@BotFather` → `/newbot`
2. Name: `ProctoLearnBot`, username: `proctolearn_YOURNAME_bot`
3. Copy the token
4. Message `@userinfobot` to get your `chat_id`
5. Edit `monitoring-project/.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:AAAA...
   TELEGRAM_CHAT_ID=987654321
   ```

### Step 2: Start monitoring stack
```bash
cd monitoring-project
docker compose up -d

# Access:
# Grafana:      http://localhost:3000  (admin / admin123)
# Prometheus:   http://localhost:9090
# Alertmanager: http://localhost:9093
# Zabbix:       http://localhost:8082

# Screenshots needed:
# 1. Grafana dashboard with Node Exporter metrics
# 2. Prometheus targets (all green)
# 3. Alertmanager UI with at least 1 alert
# 4. Telegram bot replying to /status command
```

### Step 3: Jenkins
```bash
cd /home/arsen/IdeaProjects/ProctoLearn
docker compose -f docker-compose.dev.yml up -d jenkins

# Access: http://localhost:8088
# Login: admin / admin123
# Create pipeline from Jenkinsfile in repo root
# Run pipeline → screenshot green build
```

---

## Module 8 — AI Layer (Target: 9/9)

### n8n
```bash
# Start n8n (included in dev stack)
docker compose -f docker-compose.dev.yml up -d n8n

# Access: http://localhost:5678
# Login: admin / admin123

# Import workflow:
# 1. Click "Add workflow" → "Import from file" → n8n/workflows/exam-submit-notify.json
# 2. Activate the workflow
# 3. Test via curl:
curl -X POST http://localhost:5678/webhook/proctolearn/exam-submit \
  -H "Content-Type: application/json" \
  -d '{"userId":"1","examId":"1","score":85}' -v

# 4. Screenshot: executed workflow in n8n UI
```

### OPAL / OPA
```bash
docker compose -f docker-compose.dev.yml up -d opa opal_redis opal_server opal_client

# Screenshots:
docker compose -f docker-compose.dev.yml ps | grep -E "opa|opal"
curl http://localhost:8181/health
```

---

## Module 9 — IaC (Target: 5/5)

```bash
# Install Terraform first
sudo bash scripts/install-tools.sh

# Then collect evidence
bash scripts/collect-iac-evidence.sh

# For Ansible with this machine as target:
# Edit inventory.ini:
#   127.0.0.1 ansible_user=arsen ansible_connection=local
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbook.yml \
  2>&1 | tee evidence/09-iac/ansible_play_recap.txt
# Screenshot the PLAY RECAP: ok=X changed=Y failed=0
```

---

## 📁 Final Evidence Checklist

```
evidence/
├── 01-os/           os_info.txt ✅, vm_screenshot.png (manual)
├── 02-security-network/  ansible_play_recap.txt, ufw_status.txt, fail2ban_sshd.txt
├── 03-database/     db_session.txt, pg_hba_conf.txt, pgadmin_screenshot.png
├── 04-app/          swagger_screenshot.png, frontend_screenshots/*.png
├── 05-containerization/ compose_ps.txt, api_logs.txt
├── 06-vcs/          git_log.txt (auto) ✅
├── 07-observability/ grafana_screenshot.png, telegram_bot_screenshot.png, jenkins_build.png
├── 08-ai-layer/     n8n_workflow_screenshot.png, opal_ps.txt
└── 09-iac/          terraform_plan.txt, ansible_play_recap.txt
```
