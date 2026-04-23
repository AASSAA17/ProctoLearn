# Evidence Pack for Project Defense

Store screenshots, logs, and command outputs here for each scoring module.

## Suggested structure

- `01-os/` VM/OS deployment proof
- `02-security-network/` SSH, UFW, Fail2Ban, SSL, Nginx reverse proxy proof
- `03-database/` PostgreSQL setup, remote auth, seeded data proof
- `04-app/` frontend/backend features and DB integration proof
- `05-containerization/` Docker and compose stack proof
- `06-vcs/` GitHub repository and commit history proof
- `07-observability/` Prometheus, Grafana, Zabbix, alerts, Jenkins integration proof
- `08-ai-layer/` n8n and OPAL integration proof
- `09-iac/` Terraform and Ansible apply/provision proof

## Minimum artifacts per module

1. One architecture or config screenshot.
2. One runtime screenshot (service up, dashboard, logs, etc.).
3. One command output proving status.

## Auto-collection scripts

- Windows PowerShell: `scripts/collect-evidence.ps1`
- Linux/macOS shell: `scripts/collect-evidence.sh`

These scripts generate timestamped text evidence files in module folders.

For strict security module proof (SSH/UFW/Fail2Ban), use:

- Windows PowerShell: `scripts/security-audit.ps1`
- Linux/macOS shell: `scripts/security-audit.sh`

For observability proof (firing/resolved alerts, Telegram, Jenkins), use:

- Windows PowerShell: `scripts/observability-demo.ps1`
- Linux/macOS shell: `scripts/observability-demo.sh`
- Read-only snapshot collector: `scripts/observability-audit.ps1` / `scripts/observability-audit.sh`
