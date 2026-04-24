# 📝 ШПАРГАЛКА — ProctoLearn Defense Notes
> Печатай / держи на телефоне во время защиты

---

## ⚡ БЫСТРЫЙ ЗАПУСК
```bash
bash scripts/demo-start.sh
```

---

## 🔑 ЛОГИНЫ
| Кто | Логин | Пароль |
|-----|-------|--------|
| Admin (app) | admin@proctolearn.kz | Admin@12 |
| Teacher | teacher@proctolearn.kz | Teach@12 |
| Student | student@proctolearn.kz | Stud@123 |
| Grafana | admin | admin123 |
| pgAdmin | admin@proctolearn.com | 1234 (DB pass: proctolearn_pass) |
| Jenkins | admin | admin123 |
| Portainer | admin | admin12345 |

---

## 🌐 ССЫЛКИ
```
http://localhost:3001        ← Frontend
http://localhost:4000/api/docs ← Swagger (61 эндпоинт)
http://localhost:5050        ← pgAdmin
http://localhost:3000        ← Grafana
http://localhost:9090        ← Prometheus
http://localhost:9093        ← Alertmanager
http://localhost:8088        ← Jenkins
http://localhost:9002        ← Portainer
http://localhost:5678        ← n8n
http://localhost:8181/health ← OPA
```

---

## 📦 М1 — ОС (5 б.)
```bash
uname -a          # Ubuntu 24.04 LTS, arsen-VirtualBox
lsb_release -a
```
**Говорю:** Ubuntu 24.04 LTS на VirtualBox.

---

## 🔒 М2 — Безопасность (10 б.)
```bash
sudo ufw status verbose
sudo fail2ban-client status sshd
sudo systemctl status nginx
ls backups/
```
**Говорю:** SSH :2222 · UFW default deny · Fail2Ban · Nginx+SSL · Backup (`backups/db_2026-04-24*.sql.gz`)

---

## 🗄 М3 — БД (20 б.)
```sql
-- в pgAdmin localhost:5050
SELECT COUNT(*) FROM users;    -- 1110
SELECT COUNT(*) FROM courses;  -- 137
SELECT role, COUNT(*) FROM users GROUP BY role;
```
**Говорю:** PostgreSQL 16 · 16 таблиц · Prisma ORM · pgAdmin · 1110 users · 137 courses

---

## 💻 М4 — Приложение (25 б.)
1. `localhost:3001` → войти как student → показать курсы
2. `localhost:3001` → войти как teacher → показать создание курса
3. `localhost:4000/api/docs` → 61 эндпоинт
4. `localhost:3001` → войти как admin → панель управления

**Говорю:** Next.js 15 + NestJS 11 · TypeScript · 61 эндпоинт · 4 роли · JWT 15m+7d · Trust Score · WebSocket прокторинг · MinIO S3

---

## 🐳 М5 — Docker (9 б.)
```bash
docker ps | wc -l              # 33+
docker ps --format "table {{.Names}}\t{{.Status}}"
```
**Говорю:** 33 контейнера · 4 compose-файла (dev/server/monitoring/opal) · Dockerfile для каждого сервиса

---

## 🔀 М6 — Git (6 б.)
```bash
git log --oneline | wc -l      # 29 коммитов
git log --oneline | head -10
git remote -v
```
**Говорю:** GitHub: github.com/AASSAA17/ProctoLearn · 29 коммитов · README + все конфиги в репо

---

## 📊 М7 — Мониторинг (11 б.)
1. `localhost:9090` → Status → Targets → все UP
2. `localhost:3000` → дашборды Grafana
3. `localhost:9093` → Alertmanager → алерты
4. `localhost:8088` → Jenkins → Pipeline (5 стадий)

**Говорю:** Prometheus → Node Exporter + cAdvisor → Grafana → Alertmanager → Telegram Bot · Jenkins 5 стадий · + Zabbix, Nagios, Graphite

---

## 🤖 М8 — AI Layer (9 б.)
```bash
curl http://localhost:8181/health
# {"status":"ok"}
cat opal/policies/*.rego
```
1. `localhost:5678` → n8n → 2 workflows
2. `localhost:8181/health` → OPA работает

**Говорю:** n8n (exam-submit-notify + advanced-automation) · OPAL Server → GitHub polling каждые 20 сек · OPA = Policy-as-Code (Rego)

---

## ⚙️ М9 — IaC (5 б.)
```bash
cat infra/terraform/main.tf         # 9 ресурсов
terraform -chdir=infra/terraform validate
cat infra/ansible/playbook.yml
ansible-playbook ... --syntax-check
```
**Говорю:** Terraform 9 ресурсов (network+volumes+containers) · Ansible playbook (hardening+docker+deploy) · Jenkins stage-1 = IaC Validation

---

## 💬 КРАТКО НА ВОПРОСЫ
| Вопрос | Ответ |
|--------|-------|
| Почему NestJS? | Модули, DI, Guards, Interceptors — масштабируемо |
| Почему MinIO? | S3-совместимый, изолированное хранение evidence-файлов |
| Что такое Trust Score? | 0-100: tab_switch −10, copy/paste −15, fullscreen_exit −5, no_face −20 |
| Что такое OPA? | Движок политик, Rego язык, Policy-as-Code |
| Что делает Terraform? | Создаёт инфра из HCL-кода, идемпотентно |
| PROCTOR vs ADMIN? | Proctor = наблюдение; Admin = полный контроль |
| Как Jenkins работает? | IaC Validate → Build → Tests → Deploy |

---

## 📊 ЦИФРЫ (для уверенности)
```
16 таблиц  · 61 API эндпоинт  · 33 контейнера
29 коммитов · 9 Terraform ресурсов · 2 n8n workflows
4 роли · 4 compose-файла · 5 систем мониторинга
1110 users · 137 courses
```

