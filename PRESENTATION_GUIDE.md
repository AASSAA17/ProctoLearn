# 🎓 ProctoLearn — Полное руководство для презентации
> Дата защиты: Апрель 2026 | Целевой балл: **95–100 / 100**

---

## 📋 СТРУКТУРА ПРЕЗЕНТАЦИИ (7–9 слайдов)

### Слайд 1 — Титульный
**Название:** ProctoLearn — Онлайн платформа обучения с прокторингом  
**Подзаголовок:** Полноценная DevOps-инфраструктура: от ОС до AI-автоматизации  
**Стек:** Next.js 15 · NestJS 11 · PostgreSQL 16 · Docker · Prometheus · Terraform · Ansible · n8n · OPA

---

### Слайд 2 — Что такое проект?
**ProctoLearn** — это образовательная веб-платформа с системой автоматического прокторинга (контроля честности на экзаменах).

**Возможности платформы:**
- 👨‍🎓 Студент: записывается на курсы, проходит уроки, сдаёт экзамены под видеонаблюдением
- 👩‍🏫 Учитель: создаёт курсы, модули, уроки, тесты
- 🛡️ Проктор: наблюдает за сессиями в реальном времени, просматривает доказательства
- 👑 Администратор: полный контроль системы

**Прокторинг-функции:**
- 📷 Обязательная веб-камера
- 🖥️ Запись экрана
- 🔄 Логирование переключения вкладок (−10 баллов)
- 📋 Отслеживание copy/paste (−15 баллов)
- 📸 Автоскриншоты → MinIO (S3)
- 🏆 Trust Score: 0–100 (автоматический расчёт)

---

### Слайд 3 — Архитектура системы
```
┌──────────────────────────────────────────────────────────────┐
│                    КЛИЕНТ                                     │
│         Next.js 15 + TypeScript + Tailwind CSS               │
│    (Студент / Учитель / Проктор / Администратор UI)          │
└─────────────────────┬────────────────────────────────────────┘
                      │ REST API + WebSocket (Socket.io)
┌─────────────────────▼────────────────────────────────────────┐
│                   BACKEND                                     │
│              NestJS 11 + TypeScript 5.9                      │
│   Auth │ Courses │ Exams │ Proctor │ Certificates │ MinIO    │
└──────┬──────────────────────────────┬────────────────────────┘
       │                              │
┌──────▼──────┐               ┌───────▼──────┐
│ PostgreSQL  │               │    MinIO     │
│  16 таблиц  │               │ (Evidence S3)│
│ 1110 users  │               └──────────────┘
│ 137 courses │
└─────────────┘
           │
┌──────────▼─────────────────────────────────────┐
│              ИНФРАСТРУКТУРА                     │
│  Docker (33 контейнера) · Nginx · Fail2Ban      │
│  Prometheus · Grafana · Jenkins · n8n · OPA     │
│  Terraform · Ansible                           │
└────────────────────────────────────────────────┘
```

---

### Слайд 4 — Технологический стек (краткая таблица)
| Слой | Технология | Назначение |
|------|-----------|-----------|
| Frontend | Next.js 15, TypeScript 5.9, Tailwind CSS | UI, SSR |
| Backend | NestJS 11, REST API, Socket.io 4.8.3 | Бизнес-логика, WebSocket |
| Database | PostgreSQL 16 + Prisma ORM | Хранение данных |
| Storage | MinIO (S3-совместимый) | Evidence-файлы |
| Auth | JWT (access 15m + refresh 7d) + RBAC | Безопасность |
| Monitoring | Prometheus + Grafana + Alertmanager | Метрики и алерты |
| CI/CD | Jenkins (5 стадий) | Автодеплой |
| AI Layer | n8n + OPAL + OPA | Автоматизация и policy |
| IaC | Terraform + Ansible | Инфраструктура как код |
| Deploy | Docker + Docker Compose | Контейнеризация |

---

### Слайд 5 — База данных и API
**PostgreSQL 16 — 16 таблиц:**
`users, courses, lessons, exams, questions, attempts, answers, proctor_events, evidence_files, certificates, course_modules, enrollments, steps, submissions, lesson_progress, password_reset_tokens`

**API — 61 эндпоинт** (Swagger: http://localhost:4000/api/docs)

**Данные:** 1110 пользователей, 137 курсов

---

### Слайд 6 — Мониторинг и CI/CD
**Мониторинг:** Prometheus → Node Exporter + cAdvisor → Grafana dashboard → Alertmanager → **Telegram Bot**

**Jenkins CI/CD — 5 стадий:**
1. IaC Validation (terraform validate + ansible syntax-check)
2. Build Docker Images
3. Backend Tests
4. Frontend Tests
5. Deploy (Docker Compose)

---

### Слайд 7 — AI + IaC
**AI Layer:**
- **n8n**: 2 workflow (exam-submit-notify, advanced automation)
- **OPAL Server**: подписывается на GitHub-репо, обновляет политики каждые 20 сек
- **OPA**: выдаёт решения по политикам доступа

**IaC:**
- **Terraform**: 9 ресурсов (Docker network, 2 volume, 3 image, 3 container)
- **Ansible**: playbook.yml с ролями (hardening, docker, deploy)

---

### Слайд 8 — Результаты и баллы
| Модуль | Реализовано | Баллы |
|--------|-------------|-------|
| 1. ОС | Ubuntu 24.04 на VirtualBox | 5/5 |
| 2. Security | SSH :2222, UFW, Fail2Ban, Nginx+SSL, Backup | 10/10 |
| 3. База данных | PostgreSQL 16, 16 таблиц, pgAdmin, 1110 users | 20/20 |
| 4. Приложение | Next.js+NestJS, 61 endpoint, 4 роли, прокторинг | 25/25 |
| 5. Docker | 33 контейнера, multi-compose, Dockerfile | 9/9 |
| 6. Git | GitHub repo, 28 коммитов | 6/6 |
| 7. Мониторинг | Prometheus+Grafana+Alertmanager+Telegram+Jenkins | 11/11 |
| 8. AI Layer | n8n + OPAL + OPA | 9/9 |
| 9. IaC | Terraform (9 res) + Ansible (ok=18) | 5/5 |
| **ИТОГО** | **Экспертный уровень** | **100/100** |

---

## 🎤 ЧТО РАССКАЗАТЬ ПО КАЖДОМУ МОДУЛЮ

---

## Модуль 1: ОС (5 баллов)

**Что говорить:**
> "Проект развёрнут на виртуальной машине VirtualBox с операционной системой Ubuntu 24.04 LTS. Это актуальный Long-Term Support дистрибутив Linux. Для проверки запускаем команду `uname -a` — видим `Linux arsen-VirtualBox`."

**Команды для демонстрации:**
```bash
uname -a           # Linux arsen-VirtualBox ... Ubuntu 24.04
lsb_release -a     # Ubuntu 24.04 LTS
df -h              # Дисковое пространство
free -h            # Оперативная память
```

**Ключевые факты:**
- ОС: Ubuntu 24.04 LTS
- Платформа: VirtualBox (виртуальная машина)
- Kernel: Linux

---

## Модуль 2: Безопасность и Сеть (10 баллов)

**Что говорить:**
> "Для безопасности настроено несколько уровней защиты. SSH работает на нестандартном порту 2222, что снижает количество автоматических атак. UFW (Uncomplicated Firewall) настроен с политикой 'default deny' — разрешены только необходимые порты. Fail2Ban автоматически блокирует IP-адреса после нескольких неудачных попыток входа. Nginx работает как reverse proxy и обеспечивает SSL-терминацию. Также реализована система резервного копирования с архивацией БД в .sql.gz формате."

**Команды для демонстрации:**
```bash
sudo ufw status verbose          # Статус файрвола
sudo fail2ban-client status sshd # Заблокированные IP
sudo systemctl status nginx      # Статус Nginx
ls -la /home/arsen/IdeaProjects/ProctoLearn/backups/  # Бэкапы
```

**Ключевые факты:**
- SSH порт: 2222 (нестандартный)
- UFW: active, default deny incoming
- Fail2Ban: защита sshd
- Nginx: reverse proxy + SSL
- Backup scripts: `scripts/backup.sh` — архивирует БД + uploads + .env
- Бэкапы: `backups/db_2026-04-24_17-47-23.sql.gz`

---

## Модуль 3: База данных (20 баллов)

**Что говорить:**
> "База данных — PostgreSQL 16. Схема содержит 16 таблиц, охватывающих все аспекты образовательной платформы: пользователи, курсы, уроки, экзамены, попытки, прокторинг-события, доказательства. Работа с БД через Prisma ORM — это современный type-safe ORM для TypeScript. pgAdmin доступен на порту 5050 для визуального управления. В БД загружены реальные тестовые данные: 1110 пользователей и 137 курсов."

**Демонстрация:**
1. Открыть pgAdmin: http://localhost:5050 (admin@proctolearn.com / 1234)
2. Показать 16 таблиц в схеме public
3. Выполнить запросы:
```sql
SELECT COUNT(*) FROM users;        -- 1110
SELECT COUNT(*) FROM courses;      -- 137
SELECT role, COUNT(*) FROM users GROUP BY role;  -- распределение ролей
SELECT title, level FROM courses LIMIT 10;
```

**Ключевые факты:**
- СУБД: PostgreSQL 16
- ORM: Prisma
- Таблиц: 16
- Пользователей: 1110
- Курсов: 137
- Удалённый доступ: pgAdmin на порту 5050
- Схема: `backend/prisma/schema.prisma`

---

## Модуль 4: Приложение (25 баллов)

**Что говорить:**
> "Стек приложения: фронтенд на Next.js 15 с TypeScript и Tailwind CSS, бэкенд на NestJS 11. Это прогрессивные, современные фреймворки. Приложение реализует полный цикл образовательной платформы с уникальной системой прокторинга. Backend предоставляет 61 REST-эндпоинт, документированных в Swagger. WebSocket через Socket.io обеспечивает real-time мониторинг экзаменов. JWT-аутентификация с access-токеном (15 минут) и refresh-токеном (7 дней). RBAC — 4 роли."

**Демонстрация:**
1. Открыть фронтенд: http://localhost:3001
2. Войти как студент: student@proctolearn.kz / Stud@123 → показать курсы
3. Войти как учитель: teacher@proctolearn.kz / Teach@12 → показать создание курса
4. Открыть Swagger: http://localhost:4000/api/docs → показать 61 эндпоинт
5. Войти как admin: admin@proctolearn.kz / Admin@12 → показать панель

**Ключевые факты:**
- Frontend: Next.js 15, TypeScript 5.9, Tailwind CSS, Socket.io
- Backend: NestJS 11, REST API, WebSocket, Swagger
- API: 61 эндпоинт
- Роли: STUDENT, TEACHER, PROCTOR, ADMIN
- Auth: JWT (access 15m + refresh 7d) + RBAC
- Storage: MinIO S3 для evidence-файлов
- Прокторинг: Trust Score 0-100, WebSocket события, автоскриншоты
- Модули: auth, users, courses, lessons, exams, attempts, proctor, evidence, certificates, minio

---

## Модуль 5: Контейнеризация (9 баллов)

**Что говорить:**
> "Весь стек контейнеризован с помощью Docker. У нас несколько compose-файлов для разных сред. docker-compose.dev.yml — для разработки с hot-reload. docker-compose.server.yml — для production. monitoring-project/docker-compose.yml — для стека мониторинга. opal/docker-compose.opal.yml — для AI-слоя. Итого запущено 33 контейнера. У каждого сервиса свой Dockerfile с многоступенчатой сборкой."

**Команды для демонстрации:**
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -40
docker ps | wc -l                          # 33+ контейнеров
docker compose -f docker-compose.dev.yml ps  # Основной стек
```

**Ключевые факты:**
- Docker Compose файлы: 4 (dev, server, monitoring, opal)
- Общее кол-во контейнеров: 33
- Dockerfile для: backend, frontend, jenkins
- Сервисы: API, Web, PostgreSQL, Redis, MinIO, pgAdmin, Mailpit, Prometheus, Grafana, Alertmanager, Node Exporter, cAdvisor, Portainer, n8n, OPA, OPAL Server, OPAL Client, Jenkins и др.

---

## Модуль 6: Контроль версий (6 баллов)

**Что говорить:**
> "Проект опубликован на GitHub в публичном репозитории. История содержит 28 осмысленных коммитов с описанием изменений. Структура репозитория включает все необходимые файлы: Dockerfile, docker-compose.yml, скрипты автоматизации и README.md."

**Команды для демонстрации:**
```bash
git log --oneline | head -28    # 28 коммитов
git log --oneline --graph       # Граф ветвей
git remote -v                   # GitHub URL
```

**Ключевые факты:**
- GitHub: https://github.com/AASSAA17/ProctoLearn
- Коммитов: 28
- README.md: задокументирован
- В репозитории: Dockerfile, docker-compose.yml, Jenkinsfile, Terraform, Ansible

---

## Модуль 7: Наблюдаемость (11 баллов)

**Что говорить:**
> "Система мониторинга состоит из нескольких уровней. Prometheus собирает метрики с Node Exporter (ресурсы хоста) и cAdvisor (метрики контейнеров). Grafana визуализирует все данные на дашбордах — PostgreSQL Overview дашборд автоматически провизионируется при запуске. Alertmanager рассылает уведомления в Telegram через бота при критических событиях. Jenkins интегрирован с пайплайном из 5 стадий, который выполняет IaC-валидацию, сборку образов, тесты и деплой. Дополнительно подняты Zabbix, Nagios и Graphite."

**Демонстрация:**
1. Grafana: http://localhost:3000 (admin / admin123) → показать дашборды
2. Prometheus: http://localhost:9090 → Status → Targets (все UP)
3. Alertmanager: http://localhost:9093 → активные алерты
4. Jenkins: http://localhost:8088 (admin / admin123) → показать pipeline

**Ключевые факты:**
- Prometheus: scraping Node Exporter (9100), cAdvisor (8081), PostgreSQL exporter
- Grafana: дашборды автопровизионированы, порт 3000
- Alertmanager: порт 9093, Telegram уведомления
- Jenkins: 5 стадий (IaC Validation → Build → Tests → Deploy)
- Дополнительно: Zabbix (8082), Nagios (8084), Graphite (8085)
- Blackbox exporter — проверка доступности сервисов

---

## Модуль 8: Интеллектуальный слой (9 баллов)

**Что говорить:**
> "AI-слой реализован через несколько инструментов. n8n — это no-code платформа автоматизации. Первый workflow 'exam-submit-notify' — при отправке экзамена автоматически отправляет уведомление. Второй workflow 'advanced automation' — более сложный сценарий. OPAL — это Open Policy Administration Layer. OPAL Server подписывается на наш GitHub-репозиторий и каждые 20 секунд проверяет изменения в политиках. OPAL Client автоматически обновляет политики в OPA. OPA (Open Policy Agent) принимает решения об авторизации на основе Rego-политик. Это современный подход Policy-as-Code."

**Демонстрация:**
1. n8n: http://localhost:5678 → показать workflows
2. OPA: `curl http://localhost:8181/health` → `{"status":"ok"}`
3. OPA политика: `cat opal/policies/` → показать Rego-файлы
4. OPAL Server: http://localhost:7002 → статус

**Ключевые факты:**
- n8n: 2 workflow (exam-submit-notify.json, proctolearn-advanced-automation.json)
- OPAL Server: polling GitHub каждые 20 секунд
- OPAL Client: автообновление политик в OPA
- OPA: порт 8181, решения на основе Rego
- Policy-as-Code: политики хранятся в `opal/policies/`

---

## Модуль 9: Автоматизация IaC (5 баллов)

**Что говорить:**
> "Инфраструктура описана как код с помощью двух инструментов. Terraform управляет 9 ресурсами: Docker-сеть, 2 тома, 3 образа, 3 контейнера (PostgreSQL, Redis, MinIO). Это позволяет воссоздать всю инфраструктуру из кода одной командой. Ansible-playbook конфигурирует сервер: hardening безопасности, установка Docker, клонирование репозитория и запуск всего стека. Jenkins в первой стадии пайплайна автоматически валидирует конфиги Terraform и Ansible."

**Команды для демонстрации:**
```bash
cat infra/terraform/main.tf          # Показать Terraform ресурсы
terraform -chdir=infra/terraform validate  # Валидация
cat infra/ansible/playbook.yml       # Показать Ansible playbook
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbook.yml --syntax-check
```

**Ключевые факты:**
- Terraform ресурсы: 9 (docker_network, docker_volume x2, docker_image x3, docker_container x3)
- Terraform state: `infra/terraform/terraform.tfstate`
- Ansible: `infra/ansible/playbook.yml` + роли (hardening, docker, deploy)
- Ansible collections: `requirements.yml`
- Идемпотентность: повторный запуск безопасен
- Jenkins stage: `IaC Validation` — первая стадия в Jenkinsfile

---

## 🗂️ ФАЙЛОВАЯ СТРУКТУРА (для Code Review)

```
ProctoLearn/
├── backend/
│   ├── src/
│   │   ├── auth/          # JWT + RBAC (Guards, Decorators)
│   │   ├── users/         # Пользователи
│   │   ├── courses/       # Курсы
│   │   ├── lessons/       # Уроки
│   │   ├── exams/         # Экзамены + вопросы
│   │   ├── attempts/      # Попытки + автобалл
│   │   ├── proctor/       # WebSocket Gateway + сервис
│   │   ├── evidence/      # MinIO доказательства
│   │   ├── certificates/  # QR-сертификаты
│   │   └── minio/         # MinIO клиент
│   └── prisma/schema.prisma  # 16 таблиц
├── frontend/
│   └── src/app/
│       ├── auth/          # Login / Register
│       └── dashboard/
│           ├── courses/    # Список курсов
│           ├── exam/       # Экзамен + прокторинг
│           ├── teacher/    # Панель учителя
│           └── proctor/    # Панель проктора
├── monitoring-project/    # Prometheus + Grafana + Alertmanager
├── jenkins/               # Jenkins Dockerfile + init.groovy.d
├── infra/
│   ├── terraform/         # 9 ресурсов
│   └── ansible/           # playbook + роли
├── opal/                  # OPAL + OPA + политики
├── n8n/workflows/         # 2 workflow
├── scripts/               # backup.sh, demo-start.sh
├── backups/               # db + uploads + env
├── Jenkinsfile            # CI/CD pipeline
└── docker-compose.dev.yml # Основной compose
```

---

## 🚀 СКРИПТ БЫСТРОГО ЗАПУСКА ДЕМО

```bash
cd /home/arsen/IdeaProjects/ProctoLearn
bash scripts/demo-start.sh
```

После запуска все сервисы будут проверены автоматически.

---

## 🔑 УЧЁТНЫЕ ДАННЫЕ ДЛЯ ДЕМО

| Сервис | URL | Логин | Пароль |
|--------|-----|-------|--------|
| Frontend | http://localhost:3001 | admin@proctolearn.kz | Admin@12 |
| Frontend | http://localhost:3001 | teacher@proctolearn.kz | Teach@12 |
| Frontend | http://localhost:3001 | student@proctolearn.kz | Stud@123 |
| Swagger | http://localhost:4000/api/docs | — | — |
| pgAdmin | http://localhost:5050 | admin@proctolearn.com | 1234 |
| Grafana | http://localhost:3000 | admin | admin123 |
| Prometheus | http://localhost:9090 | — | — |
| Alertmanager | http://localhost:9093 | — | — |
| Jenkins | http://localhost:8088 | admin | admin123 |
| Portainer | http://localhost:9002 | admin | admin12345 |
| MinIO | http://localhost:9001 | minioadmin | minioadmin |
| n8n | http://localhost:5678 | — | см. регистрацию |

---

## 💬 ВОПРОСЫ НА ЗАЩИТЕ — ГОТОВЫЕ ОТВЕТЫ

**Q: Почему NestJS, а не Express?**
> NestJS построен поверх Express, но добавляет архитектуру Angular-подобных модулей, Dependency Injection, декораторы, Guards, Interceptors. Это делает код масштабируемым и тестируемым. Для крупной платформы это правильный выбор.

**Q: Зачем MinIO, а не хранить файлы на диске?**
> MinIO — S3-совместимое объектное хранилище. Evidence-файлы (скриншоты экзаменов) могут быть большими. MinIO обеспечивает масштабируемость, отдельное хранение от приложения, и совместимость с AWS S3 API.

**Q: Что такое Trust Score?**
> Trust Score — это числовой показатель от 0 до 100, отражающий уровень доверия к студенту во время экзамена. Начальное значение 100. За каждое подозрительное действие баллы списываются: переключение вкладок −10, copy/paste −15, выход из полноэкранного режима −5, лицо не обнаружено −20.

**Q: Что такое OPAL/OPA?**
> OPA (Open Policy Agent) — это движок политик. Политики написаны на языке Rego и определяют, кто имеет доступ к каким ресурсам. OPAL — это прослойка управления: он подписывается на GitHub-репозиторий и автоматически обновляет политики в OPA при каждом коммите. Это подход Policy-as-Code.

**Q: Что делает Terraform?**
> Terraform описывает инфраструктуру в виде HCL-кода. В нашем случае он создаёт Docker-сеть, тома для данных и контейнеры PostgreSQL, Redis, MinIO. Команда `terraform apply` гарантированно создаст всё это из кода, а повторный запуск ничего не сломает (идемпотентность).

**Q: Чем отличаются роли PROCTOR и ADMIN?**
> PROCTOR может наблюдать за экзаменами в реальном времени, просматривать evidence-файлы, читать trust score. ADMIN имеет полный доступ к системе: управление пользователями, курсами, настройки платформы.

**Q: Как работает Jenkins CI/CD?**
> Jenkinsfile описывает пайплайн из 5 стадий: 1) IaC Validation — проверяет terraform validate и ansible syntax-check. 2) Build Docker Images — собирает образы. 3) Backend Tests. 4) Frontend Tests. 5) Deploy — запускает docker compose.

---

## 📊 ИТОГОВЫЕ ЦИФРЫ ДЛЯ СЛАЙДОВ

| Метрика | Значение |
|---------|----------|
| Таблиц в БД | 16 |
| API эндпоинтов | 61 |
| Docker контейнеров | 33 |
| Git коммитов | 28 |
| Terraform ресурсов | 9 |
| n8n workflows | 2 |
| Строк кода (approx.) | ~15 000 |
| Ролей пользователей | 4 |
| Compose файлов | 4 |
| Систем мониторинга | 5 (Prometheus, Grafana, Zabbix, Nagios, Graphite) |

