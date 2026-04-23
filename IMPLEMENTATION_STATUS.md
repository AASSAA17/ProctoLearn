# Implementation Status

This file tracks the practical path to the target defense score.

## Completed now

- Security hardening of monitoring credentials:
  - `monitoring-project/docker-compose.yml` now uses env variables for Telegram and Grafana credentials.
  - `monitoring-project/alertmanager/alertmanager.yml` now uses `${TELEGRAM_BOT_TOKEN}` and `${TELEGRAM_CHAT_ID}`.
  - `monitoring-project/.env.example` added.
- Infrastructure as Code baseline added:
  - Terraform: `infra/terraform/*`
  - Ansible: `infra/ansible/*`
- CI/CD improvement:
  - `Jenkinsfile` includes `IaC Validation` stage.
- Defense assets prepared:
  - `DEFENSE_CHECKLIST.md`
  - `evidence/README.md`

## In progress

- End-to-end verification on target VM (Terraform apply + Ansible playbook run).
- Runtime evidence capture for all 9 grading modules.

## Remaining to reach final claim

- Execute infrastructure automation on VM and capture logs/screenshots.
- Verify alerts and AI integrations in live demo flow.
- Final presentation package (slides + speaking script + evidence links).

## Rule

The "100 points" claim should be stated only after all remaining items are completed and evidenced.
