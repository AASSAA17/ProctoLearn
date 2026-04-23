# ProctoLearn

ProctoLearn is a web learning platform with proctoring features, CI/CD, observability, AI workflow integration, and Infrastructure as Code automation.

## Project modules

- Application: `frontend/` and `backend/`
- Server stack: `docker-compose.server.yml`
- Monitoring stack: `docker-compose.monitoring.yml` and `monitoring-project/`
- CI/CD: `Jenkinsfile` and `jenkins/`
- AI integrations: `n8n/` and `opal/`
- IaC: `infra/terraform/` and `infra/ansible/`

## Quick links

- Backend docs: `backend/README.md`
- Monitoring docs: `monitoring-project/README.md`
- IaC docs: `infra/README.md`
- Defense checklist: `DEFENSE_CHECKLIST.md`
- Evidence pack: `evidence/README.md`

## Security note

Do not commit real credentials or API tokens.
Use `.env` files and rotate any previously exposed tokens immediately.
