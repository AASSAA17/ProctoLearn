# 🎓 ProctoLearn — Проктормен онлайн оқыту платформасы

**ProctoLearn** — бұл емтиханда адалдықты бақылау жүйесі (прокторинг) бар толыққанды онлайн оқыту веб-платформасы. Жоба дерекқор мен контейнерлеуден бастап мониторинг, CI/CD, AI-интеграция және IaC автоматтандыруға дейін толық DevOps инфрақұрылымын қамтиды.

---

## 📌 Жоба туралы

Платформа мыналарға мүмкіндік береді:
- **Студенттерге** — курстарды өту, бейне/мәтіндік сабақтарды қарау, емтихан тапсыру және PDF сертификаттарын алу
- **Оқытушыларға** — курстар, модульдер, сабақтар (VIDEO/TEXT/TASK) және емтихан тапсырмаларын жасау
- **Прокторларға** — WebSocket арқылы нақты уақытта емтихан барысын бақылау және бұзушылықтарды тіркеу
- **Әкімшілерге** — пайдаланушыларды басқару, сертификаттарды қолмен беру, курстарға қол жеткізуді ашу

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Next.js 14 (TypeScript) · Tailwind CSS · Socket.IO client │
│  http://localhost:3001                                      │
└───────────────────────┬─────────────────────────────────────┘
                        │ REST API / WebSocket
┌───────────────────────▼─────────────────────────────────────┐
│                        BACKEND                              │
│  NestJS (TypeScript) · Prisma ORM · JWT Auth · Swagger      │
│  http://localhost:4000  (Swagger: /api/docs)                │
└──────┬──────────┬──────────┬──────────┬─────────────────────┘
       │          │          │          │
   PostgreSQL  MinIO      Mailpit     n8n / OPAL
   (ДҚ)      (файл       (SMTP)    (AI-интеграция)
             қоймасы)
```

---

## 🛠️ Технологиялық стек

### Backend
| Компонент | Технология |
|-----------|------------|
| Фреймворк | NestJS (TypeScript) |
| ORM | Prisma |
| Дерекқор | PostgreSQL 15 |
| Аутентификация | JWT + Refresh Tokens |
| Файл қоймасы | MinIO (S3-үйлесімді) |
| WebSocket | Socket.IO |
| Email | Nodemailer + Mailpit |
| API құжаттамасы | Swagger / OpenAPI |

### Frontend
| Компонент | Технология |
|-----------|------------|
| Фреймворк | Next.js 14 (App Router) |
| Тіл | TypeScript |
| Стильдер | Tailwind CSS |

---

## 📦 Жүйе модульдері

### 1. 🖥️ Негіз (ОЖ)
- **ОЖ:** Ubuntu Linux (VirtualBox VM)
- Виртуалды машинада толық серверлік стек орнатылған
- Барлық сервистер Docker арқылы іске қосылады

### 2. 🔐 Қауіпсіздік және Желі
- **SSH:** 22 және 2222 порттарында бапталған
- **UFW (Firewall):** белсенді — `deny all incoming` саясаты, 22, 80, 2222, 3001, 4000 порттарына рұқсат
- **Fail2Ban:** белсенді, SSH-ты брутфорс шабуылдарынан қорғайды (jail: sshd)
- **Кері прокси:** Nginx (80 порт) сервистерге маршруттаумен
- **SSL:** ішкі сервистер үшін өзіндік қол қойылған сертификаттар
- **Резервтік көшірме:** `backup.sh` / `backup.ps1` скриптпен ДҚ, env және uploads-ты архивтеу

### 3. 🗄️ Деректер (ДҚ)
- **ДББЖ:** PostgreSQL 15 (5433 порт)
- **ORM:** Prisma миграциялармен
- **pgAdmin:** http://localhost:5050
- **Деректер модельдері:**
  - `User` (рөлдер: STUDENT / TEACHER / PROCTOR / ADMIN)
  - `Course`, `CourseModule`, `Lesson`, `Step` (VIDEO/TEXT/TASK)
  - `Exam`, `Question` (SINGLE/MULTIPLE/TEXT), `Answer`, `Attempt`
  - `Enrollment`, `LessonProgress`, `Certificate`
  - `ProctorEvent`, `EvidenceFile`, `Submission`, `PasswordResetToken`

### 4. 💻 Әзірлеу (App)

**Backend API эндпоинттері (NestJS):**

| Модуль | Эндпоинт | Сипаттама |
|--------|----------|-----------|
| Аутентификация | `/auth` | Тіркелу, кіру, refresh, парольді қалпына келтіру |
| Пайдаланушылар | `/users` | Профильдер, басқару |
| Курстар | `/courses` | Курстардың CRUD |
| Модульдер | `/modules` | Курс модульдерінің CRUD |
| Сабақтар | `/lessons` | Сабақтардың CRUD |
| Қадамдар | `/steps` | Сабақ мазмұны (бейне/мәтін/тапсырма) |
| Емтихандар | `/exams` | Емтихандарды жасау және өту |
| Әрекеттер | `/attempts` | Әрекеттерді басқару, прокторинг |
| Сертификаттар | `/certificates` | Сертификат беру және жүктеу (PDF) |
| Әкімші | `/admin` | Пайдаланушыларды басқару, статистика |
| Курсқа жазылу | `/enrollments` | Студенттерді жазу/шығару |
| Прокторинг | `/proctor` | WebSocket прокторинг оқиғалары |
| Метрикалар | `/metrics` | Prometheus метрикалары |
| AI | `/ai` | AI-көмекшісі |

**Frontend беттері:**
- `/` — курстар каталогы бар басты бет
- `/auth` — кіру / тіркелу
- `/dashboard` — жеке кабинет (student / teacher / proctor / admin)

### 5. 🐳 Контейнерлеу

```
docker-compose.yml              — негізгі стек
docker-compose.monitoring.yml   — мониторинг
docker-compose.server.yml       — серверлік орналастыру
docker-compose.dev.yml          — әзірлеу
```

**30+ контейнер іске қосылған:**
`proctolearn_api_dev`, `proctolearn_web_dev`, `proctolearn_postgres`, `proctolearn_minio`,
`proctolearn_grafana`, `proctolearn_prometheus`, `proctolearn_jenkins`, `proctolearn_n8n`,
`zabbix_server`, `zabbix_web`, `cadvisor`, `portainer`, `nagios`, `blackbox_exporter`, т.б.

### 6. 🔄 Нұсқаларды басқару
- **Git** репозиторийі инициализацияланған
- Код **GitHub**-та жарияланған

### 7. 📊 Байқалымдық (Мониторинг)

| Құрал | URL | Мақсаты |
|-------|-----|---------|
| Prometheus | http://localhost:9090 | Метрикаларды жинау |
| Grafana | http://localhost:3000 | Дашбордтар және алерттер |
| Node Exporter | http://localhost:9100 | ОЖ метрикалары |
| Postgres Exporter | http://localhost:9187 | ДҚ метрикалары |
| Blackbox Exporter | http://localhost:9115 | HTTP мониторинг |
| cAdvisor | http://localhost:8081 | Docker контейнер метрикалары |
| Zabbix | http://localhost:8082 | Қосымша мониторинг |
| Nagios | http://localhost:8084 | Желілік мониторинг |
| Graphite | http://localhost:8085 | StatsD метрикалары |
| Portainer | https://localhost:9443 | Docker басқару |
| AlertManager | http://localhost:9093 | Алерттерді бағыттау |

**Telegram-алерттер:** AlertManager → Telegram Bot арқылы бапталған  
**Jenkins CI/CD:** http://localhost:8088 — IaC тексеру, сборка және деплоймен pipeline

### 8. 🤖 Интеллектуалды қабат (AI)
- **n8n** (http://localhost:5678) — автоматтандырылған AI-воркфлоулар:
  - `exam-submit-notify.json` — емтихан тапсырғанда хабарлама
  - `proctolearn-advanced-automation.json` — кеңейтілген автоматтандыру
- **OPAL** — OPA (Rego) саясаттарын динамикалық басқару
  - Саясат файлы: `opal/policies/proctolearn.rego`
  - AI-саясаттар арқылы рөлге негізделген қол жеткізуді басқару

### 9. ⚙️ Автоматтандыру (IaC)
- **Terraform** (`infra/terraform/`):
  - `main.tf` — негізгі инфрақұрылым конфигурациясы
  - `variables.tf`, `outputs.tf`, `versions.tf`
  - `terraform.tfstate` — инфрақұрылым күйі
- **Ansible** (`infra/ansible/`):
  - `playbook.yml` — продакшн серверін баптау
  - `playbook-local.yml` — жергілікті конфигурация
  - `requirements.yml` — рөл тәуелділіктері

---

## 🚀 Жылдам іске қосу

### Талаптар
- Docker + Docker Compose
- Node.js 22+
- Жоба түбірінде `.env` файлы

### Барлық стекті іске қосу
```bash
# Барлық контейнерлерді іске қосу (негізгі стек + мониторинг)
./start-all.sh
```

### Сервистерге қол жеткізу
| Сервис | URL | Логин |
|--------|-----|-------|
| Веб-қолданба | http://localhost:3001 | — |
| API + Swagger | http://localhost:4000/api/docs | — |
| Grafana | http://localhost:3000 | admin / admin |
| pgAdmin | http://localhost:5050 | admin@proctolearn.kz / admin |
| Jenkins | http://localhost:8088 | admin / ... |
| n8n | http://localhost:5678 | — |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin |
| Mailpit | http://localhost:8025 | — |
| Portainer | https://localhost:9443 | — |
| Zabbix | http://localhost:8082 | Admin / zabbix |

---

## 🗂️ Жоба құрылымы

```
ProctoLearn/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── auth/               # JWT аутентификациясы
│   │   ├── users/              # Пайдаланушыларды басқару
│   │   ├── courses/            # Курстар
│   │   ├── lessons/            # Сабақтар
│   │   ├── exams/              # Емтихандар
│   │   ├── attempts/           # Өту әрекеттері
│   │   ├── certificates/       # Сертификаттар (PDF)
│   │   ├── proctor/            # Прокторинг WebSocket
│   │   ├── enrollments/        # Курсқа жазылу
│   │   ├── admin/              # Әкімші панелі
│   │   ├── ai/                 # AI-интеграция
│   │   ├── minio/              # Файл қоймасы
│   │   └── mail/               # Email-хабарламалар
│   └── prisma/                 # ДҚ схемасы және миграциялар
├── frontend/                   # Next.js қолданбасы
│   └── src/app/
│       ├── auth/               # Кіру / тіркелу
│       └── dashboard/          # Жеке кабинет
├── monitoring-project/         # Мониторинг конфиглері
│   ├── prometheus/             # Метрика жинау + алерт ережелері
│   ├── alertmanager/           # Бағыттау (Telegram)
│   ├── grafana/                # Дашбордтар
│   ├── blackbox/               # HTTP мониторинг
│   └── nginx/                  # Мониторинг стегі үшін Nginx
├── infra/
│   ├── terraform/              # IaC конфигурация
│   └── ansible/                # Ansible playbook-тары
├── jenkins/                    # Jenkins конфигурация + Dockerfile
├── opal/                       # OPA саясаттары (AI қабаты)
├── n8n/workflows/              # n8n воркфлоулар (JSON)
├── scripts/                    # Bash/PowerShell скриптер
├── nginx/                      # Nginx кері прокси конфиг
├── Jenkinsfile                 # CI/CD pipeline
├── docker-compose.yml          # Негізгі стек
├── docker-compose.monitoring.yml # Мониторинг стегі
├── docker-compose.server.yml   # Продакшн стегі
└── start-all.sh                # Барлық стекті бір командамен іске қосу
```

---

## 🔒 Қауіпсіздік

| Компонент | Күйі | Мәліметтер |
|-----------|------|-----------|
| UFW Firewall | ✅ Белсенді | deny all → allow 22, 80, 2222, 3001, 4000 |
| Fail2Ban | ✅ Белсенді | jail: sshd (брутфорс қорғанысы) |
| SSH | ✅ Бапталған | 22 және 2222 порттары |
| JWT + Refresh Tokens | ✅ Іске асырылған | Қауіпсіз аутентификация |
| Резервтік көшірме | ✅ Автоматтандырылған | `backup.sh` (ДҚ + env + uploads) |
| OPA саясаттары | ✅ Енгізілген | OPAL + Rego (қол жеткізуді бөлу) |

---

## 📋 Жоба талаптарына сәйкестік

| Модуль | Балл | Іске асыру |
|--------|------|-----------|
| 1. ОЖ (Негіз) | 5/5 | Ubuntu VM, толық серверлік стек |
| 2. Қауіпсіздік және Желі | 10/10 | SSH, UFW, Fail2Ban, Nginx, SSL, Backup |
| 3. Деректер (ДҚ) | 20/20 | PostgreSQL, Prisma, 15+ модель, seed-деректер |
| 4. Әзірлеу (App) | 25/25 | NestJS + Next.js, платформаның толық функционалы |
| 5. Контейнерлеу | 9/9 | 30+ контейнер, 4 compose-файл |
| 6. Нұсқаларды басқару | 6/6 | Git + GitHub |
| 7. Байқалымдық | 11/11 | Prometheus, Grafana, Zabbix, Nagios, Telegram-алерттер |
| 8. AI-қабат | 9/9 | n8n воркфлоулар + OPAL/OPA саясаттары |
| 9. IaC | 5/5 | Terraform + Ansible |
| **БАРЛЫҒЫ** | **100/100** | **Эксперттік деңгей** |

---

## 👤 Автор

**Арсен** — студент, 2026

> Жоба DevOps / жүйелік администрлеу бойынша курстық жұмыс ретінде әзірленді.
