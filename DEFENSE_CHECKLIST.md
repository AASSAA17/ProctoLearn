# ProctoLearn Defense Checklist (Target: 100/100)

## 1. OS Foundation (5)

- [ ] VM with Linux deployed and reachable.
- [ ] OS version screenshot in `evidence/01-os/`.

## 2. Security & Network (10)

- [ ] SSH key auth only.
- [ ] Non-default SSH port configured.
- [ ] UFW default deny inbound.
- [ ] Fail2Ban enabled.
- [ ] Nginx reverse proxy + SSL configured.
- [ ] Backup and restore flow demonstrated.

## 3. Database (20)

- [ ] PostgreSQL running.
- [ ] Auth and remote connectivity configured.
- [ ] Schema and seeded data demonstrated.

## 4. Application (25)

- [ ] Frontend + backend running.
- [ ] DB integration shown.
- [ ] Role flows demonstrated (student/teacher/proctor/admin).

## 5. Containerization (9)

- [ ] Dockerfiles for services.
- [ ] Compose starts full stack.
- [ ] Health/status shown.

## 6. Version Control (6)

- [ ] Public GitHub repo with source code.
- [ ] Clear commit history and branch policy.

## 7. Observability (11)

- [ ] Prometheus scraping active.
- [ ] Grafana dashboard data visible.
- [ ] Alerts firing and resolved.
- [ ] Telegram alert delivery shown.
- [ ] Jenkins pipeline integrated.

## 8. AI Layer (9)

- [ ] n8n workflow active.
- [ ] Exam submit webhook triggered.
- [ ] OPAL/OPA policy decision demonstrated.

## 9. IaC Automation (5)

- [ ] Terraform apply creates baseline infra.
- [ ] Ansible playbook configures server and deploys stack.
- [ ] Idempotent rerun shown.

## Final defense package

- [ ] 5-10 slides presentation.
- [ ] GitHub links for all key files.
- [ ] Live demo script rehearsed.
- [ ] Evidence captured in `evidence/`.
