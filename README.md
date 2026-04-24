<div align="center">

# 🎓 ProctoLearn

### Онлайн оқыту платформасы · Авторлық прокторинг жүйесі · Толық DevOps инфрақұрылым

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![Terraform](https://img.shields.io/badge/Terraform-IaC-7B42BC?style=flat-square&logo=terraform)](https://www.terraform.io/)
[![Prometheus](https://img.shields.io/badge/Prometheus-Monitoring-E6522C?style=flat-square&logo=prometheus)](https://prometheus.io/)

</div>

---

## 📌 Жоба туралы

**ProctoLearn** — онлайн білім беру мен академиялық адалдықты қамтамасыз ететін кешенді платформа. Жоба толыққанды DevOps инфрақұрылымымен жабдықталған: контейнеризация, CI/CD, мониторинг, IaC автоматтандыру және AI интеграциясы.

| Мақсат | Сипаттама |
|--------|-----------|
| 📚 Оқыту | Курстар, сабақтар, модульдер — толық LMS функциональдығы |
| 🛡️ Прокторинг | Емтихан кезіндегі автоматты бақылау және алдауды болдырмау |
| 🤖 Автоматтандыру | n8n workflow, OPAL/OPA политикалары |
| 📊 Бақылау | Prometheus + Grafana + Telegram алерттер |
| ⚙️ IaC | Terraform + Ansible арқылы толық автоматтандыру |

---

## 👥 Пайдаланушы рөлдері

| Рөл | Мүмкіндіктер |
|-----|-------------|
| 👨‍🎓 **STUDENT** | Курстарды оқу, емтихан тапсыру, сертификат алу |
| 👩‍🏫 **TEACHER** | Курс, сабақ, тест жасау, нәтижелерді талдау |
| 🛡️ **PROCTOR** | Сессияларды реалтайм бақылау, evidence қарау, Trust Score |
| 👑 **ADMIN** | Жүйеге толық қолжетімділік |

---

## 🧠 Прокторинг жүйесі

```
┌────────────────────────────────────────────────┐
│              ПРОКТОРИНГ ЖҮЙЕСІ                 │
├─────────────────────┬──────────────────────────┤
│ 📷 Камера           │ Міндетті веб-камера        │
│ 🖥️ Экран            │ Screen sharing талабы     │
│ ⏱️ Таймер           │ Серверлік уақыт бақылауы  │
│ 🔄 Tab switch       │ −10 Trust Score           │
│ 📋 Copy/Paste       │ −15 Trust Score           │
│ 🔲 Fullscreen exit  │ −5 Trust Score            │
│ 👤 Face not found   │ −20 Trust Score           │
│ 📸 Evidence         │ Авто скриншот → MinIO S3  │
└─────────────────────┴──────────────────────────┘
```

**Trust Score**: 100-ден басталады, күмәнді оқиға болған сайын азаяды. Проктор барлық сессияларды реалтайм режимінде бақылайды.

---

## 🏗️ Жүйе архитектурасы

```
┌──────────────────────────────────────────────────┐
│                    КЛИЕНТ                        │
│        Next.js 15 + TypeScript + Tailwind        │
│   Студент · Мұғалім · Проктор · Әкімші UI       │
└─────────────────┬────────────────────────────────┘
                  │ REST API + WebSocket (Socket.io)
┌─────────────────▼────────────────────────────────┐
│                  BACKEND                         │
│            NestJS 11 + TypeScript 5.9            │
│  Auth · Courses · Exams · Proctor · Certificates │
└───────┬──────────────────────────┬───────────────┘
        │                          │
┌───────▼────────┐         ┌───────▼──────┐
│  PostgreSQL 16 │         │    MinIO     │
│   16 кесте     │         │  (S3 файлдар)│
│  1110 қолданушы│         └──────────────┘
│  137 курс      │
└────────────────┘
        │
┌───────▼────────────────────────────────────────┐
│           ИНФРАҚҰРЫЛЫМ (33 контейнер)          │
│  Docker Compose · Nginx · Fail2Ban · UFW       │
│  Prometheus · Grafana · Alertmanager · Telegram│
│  Jenkins CI/CD · n8n · OPAL · OPA             │
│  Terraform · Ansible                          │
└────────────────────────────────────────────────┘
```

---

## 💻 Технологиялық стек

| Қабат | Технология | Мақсат |
|-------|-----------|--------|
| **Frontend** | Next.js 15, TypeScript 5.9, Tailwind CSS | UI, SSR |
| **Backend** | NestJS 11, REST API, Socket.io 4.8.3 | Бизнес-логика, WebSocket |
| **Database** | PostgreSQL 16 + Prisma ORM | Негізгі деректер |
| **Storage** | MinIO (S3-совместимый) | Evidence файлдары |
| **Auth** | JWT access 15m + refresh 7d + RBAC | Қауіпсіздік |
| **Monitoring** | Prometheus + Grafana + Alertmanager | Метрика, алерт |
| **CI/CD** | Jenkins (5 стадия) | Автодеплой |
| **AI Layer** | n8n + OPAL + OPA | Автоматтандыру + Policy |
| **IaC** | Terraform + Ansible | Инфрақұрылым коды |
| **Security** | UFW + Fail2Ban + Nginx + SSL | Желі қауіпсіздігі |

---

## 🗄️ Деректер базасы схемасы (16 кесте)

```
users · courses · lessons · course_modules · enrollments
exams · questions · attempts · answers · steps · submissions
proctor_events · evidence_files · certificates
lesson_progress · password_reset_tokens
```

---

## 🚀 Іске қосу

### Алдын ала талаптар
- Docker + Docker Compose
- Git

### 1. Репозиторийді клондау
```bash
git clone https://github.com/AASSAA17/ProctoLearn.git
cd ProctoLearn
```

### 2. Барлық сервистерді бір команда арқылы іске қосу
```bash
bash scripts/demo-start.sh
```

### 3. Немесе қолмен
```bash
# Негізгі стек (API + Web + DB + pgAdmin)
docker compose -f docker-compose.dev.yml up -d

# Мониторинг (Prometheus + Grafana + Alertmanager)
docker compose -f monitoring-project/docker-compose.yml up -d

# AI Layer (OPAL + OPA)
docker compose -f opal/docker-compose.opal.yml up -d
```

---

## 🌐 Сервис адрестері

| Сервис | URL |
|--------|-----|
| 🌐 Frontend | http://localhost:3001 |
| 🔧 API + Swagger | http://localhost:4000/api/docs |
| 🗄️ pgAdmin | http://localhost:5050 |
| 📦 MinIO Console | http://localhost:9001 |
| 📊 Grafana | http://localhost:3000 |
| 📈 Prometheus | http://localhost:9090 |
| 🔔 Alertmanager | http://localhost:9093 |
| 🔧 Jenkins | http://localhost:8088 |
| 🐳 Portainer | http://localhost:9002 |
| 🤖 n8n | http://localhost:5678 |
| 🔐 OPA | http://localhost:8181 |

---

## 🔐 Тест аккаунттары

| Рөл | Email | Пароль |
|-----|-------|--------|
| Admin | admin@proctolearn.kz | Admin@12 |
| Teacher | teacher@proctolearn.kz | Teach@12 |
| Student | student@proctolearn.kz | Stud@123 |

---

## 📂 Жоба құрылымы

```
ProctoLearn/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── auth/               # JWT + RBAC
│   │   ├── courses/            # Курстар
│   │   ├── exams/              # Емтихандар
│   │   ├── proctor/            # WebSocket Gateway
│   │   ├── evidence/           # MinIO файлдар
│   │   └── certificates/       # QR сертификаттар
│   └── prisma/schema.prisma    # 16 кесте
├── frontend/                   # Next.js UI
│   └── src/app/dashboard/
│       ├── courses/            # Курс тізімі
│       ├── exam/               # Прокторинг режим
│       ├── teacher/            # Мұғалім панелі
│       └── proctor/            # Проктор панелі
├── monitoring-project/         # Prometheus · Grafana · Alertmanager
├── infra/
│   ├── terraform/              # 9 ресурс (IaC)
│   └── ansible/                # playbook + рөлдер
├── opal/                       # OPAL Server + OPA
├── n8n/workflows/              # 2 автоматтандыру workflow
├── scripts/                    # backup.sh · demo-start.sh
├── jenkins/                    # Jenkins Dockerfile
├── Jenkinsfile                 # CI/CD pipeline (5 стадия)
└── docker-compose.dev.yml      # Негізгі compose
```

---

## 📊 Jenkins CI/CD Pipeline

```
IaC Validation → Build Docker Images → Backend Tests → Frontend Tests → Deploy
```

---

## 📡 Мониторинг стегі

```
Node Exporter ─┐
cAdvisor ───────┼──▶ Prometheus ──▶ Grafana (дашбордтар)
PG Exporter ───┘         │
                          └──▶ Alertmanager ──▶ Telegram Bot 🔔
```

Қосымша: **Zabbix** · **Nagios** · **Graphite** · **Portainer**

---

## 🤖 AI Layer

| Компонент | Сипаттама |
|-----------|-----------|
| **n8n** | exam-submit-notify + advanced-automation workflow |
| **OPAL Server** | GitHub-ты 20 сек сайын тексереді, политикаларды жаңартады |
| **OPAL Client** | OPA-ға политикаларды автоматты жеткізеді |
| **OPA** | Rego тілінде Policy-as-Code шешімдер |

---

## ⚙️ Infrastructure as Code

### Terraform (9 ресурс)
```hcl
docker_network   × 1   # Желі
docker_volume    × 2   # PostgreSQL + MinIO деректері
docker_image     × 3   # postgres · redis · minio
docker_container × 3   # Контейнерлер
```

```bash
cd infra/terraform
terraform init && terraform plan && terraform apply
```

### Ansible
```bash
cd infra/ansible
ansible-playbook -i inventory.ini playbook.yml
# Рөлдер: hardening → docker → deploy
```

---

## 🔒 Қауіпсіздік

| Компонент | Конфигурация |
|-----------|-------------|
| SSH | Порт 2222, тек key-based auth |
| UFW | Default deny, тек қажетті порттар |
| Fail2Ban | sshd қорғанысы, автоблокировка |
| Nginx | Reverse proxy + SSL терминация |
| JWT | Access 15 мин + Refresh 7 күн |
| Backup | `scripts/backup.sh` → `backups/` қалтасы |

---

## 📈 Жоба статистикасы

| Метрика | Мән |
|---------|-----|
| DB кестелер | 16 |
| API эндпоинт | 61 |
| Docker контейнер | 33 |
| Git коммит | 29+ |
| Terraform ресурс | 9 |
| n8n workflow | 2 |
| Мониторинг жүйе | 5 |
| Пайдаланушы рөлі | 4 |
| Тест деректер | 1110 users · 137 courses |

---

## 📄 Лицензия

Бұл жоба **оқу / дипломдық** мақсатта жасалған.  
© 2026 ProctoLearn · AASSAA17
