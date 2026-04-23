# ProctoLearn Presentation Package

This package is the defense-ready narrative for the project.

## Core claim

The project demonstrates a full DevOps cycle: application delivery, containerization, CI/CD, observability, AI automation, and Infrastructure as Code.

## Suggested slide deck

### Slide 1. Title
- Project name: ProctoLearn
- Goal: secure, scalable, automated learning platform with proctoring
- Presenter name and date

### Slide 2. Problem and scope
- Online learning plus exam integrity
- Why proctoring, observability, and automation are required
- Modules covered in the project

### Slide 3. System architecture
- Frontend: Next.js + TypeScript
- Backend: NestJS + Prisma + PostgreSQL
- Storage: MinIO
- Automation: n8n, OPAL/OPA, Jenkins
- Infrastructure: Docker Compose, Terraform, Ansible

### Slide 4. Security and network hardening
- SSH key-only access
- Non-default SSH port
- UFW deny-by-default policy
- Fail2Ban protection
- Nginx reverse proxy with SSL
- Backup strategy

### Slide 5. Database and application
- PostgreSQL schema and seeded demo data
- Student/teacher/proctor/admin roles
- Course and exam flows
- Database-backed application logic

### Slide 6. Containerization and delivery
- Multi-service Docker Compose deployment
- Healthchecks and service separation
- Jenkins pipeline stages
- Automated validation and deployment

### Slide 7. Observability
- Prometheus scraping
- Grafana dashboards
- Alertmanager rules and Telegram notifications
- Demo alert firing/resolved proof
- Jenkins evidence integration

### Slide 8. AI and policy automation
- n8n exam-submit workflow
- Trust Score-based branching
- OPAL/OPA role-based authorization
- Example of automated decisions

### Slide 9. Infrastructure as Code
- Terraform baseline provisioning
- Ansible server hardening and deploy
- Idempotent configuration approach
- Evidence files for IaC runs

### Slide 10. Results and conclusion
- What is working today
- What is demonstrated live
- Why the architecture is ready for extension
- Final takeaway: defense-ready DevOps project

## Recommended speaking order

1. Architecture first.
2. Security and deployment next.
3. Application and database after that.
4. CI/CD, monitoring, and AI automation.
5. Close with IaC and final results.

## Live demo order

1. Show the app login and role-based flows.
2. Show Docker Compose running the stack.
3. Show Jenkins pipeline.
4. Show observability alert firing/resolving.
5. Show n8n and OPAL automation.
6. Show Terraform and Ansible files plus evidence outputs.

## Defense evidence to open during presentation

- [DEFENSE_CHECKLIST.md](DEFENSE_CHECKLIST.md)
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
- [evidence/README.md](evidence/README.md)
- [evidence/02-security-network/SECURITY_DEMO_CHECKLIST.md](evidence/02-security-network/SECURITY_DEMO_CHECKLIST.md)
- [evidence/07-observability/OBSERVABILITY_DEMO_CHECKLIST.md](evidence/07-observability/OBSERVABILITY_DEMO_CHECKLIST.md)
- [infra/README.md](infra/README.md)
- [DEVOPS_INTEGRATION_DEMO.md](DEVOPS_INTEGRATION_DEMO.md)
- [DEVOPS_3_TOOLS_GUIDE.md](DEVOPS_3_TOOLS_GUIDE.md)

## One-minute summary

ProctoLearn is a secure, containerized learning platform with proctoring, PostgreSQL-backed data, CI/CD via Jenkins, monitoring via Prometheus/Grafana/Alertmanager, AI automation via n8n and policy control via OPAL/OPA, and Infrastructure as Code with Terraform and Ansible. The project is organized so the full stack can be demonstrated, audited, and redeployed repeatably.
