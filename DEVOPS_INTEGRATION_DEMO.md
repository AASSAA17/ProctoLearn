# ProctoLearn: Jenkins + n8n + OPAL Demo

## 1) Jenkins

### Логин/пароль
- URL: `http://localhost:8088`
- Username: `admin`
- Password: `admin123`

### Что добавлено
- `Jenkinsfile` в корне проекта.
- Этапы pipeline:
  1. Clone Repository
  2. Build Docker Images (`docker compose build api web`)
  3. Backend Tests (`npm run test --if-present` внутри `node:22-alpine`)
  4. Frontend Tests (`npm run test --if-present` внутри `node:22-alpine`)
  5. Deploy (`docker compose up -d --build`)

### Как запустить локально (через Docker)
1. Запустить Jenkins:
```bash
docker run -d --name jenkins-proctolearn \
  -p 8088:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  jenkins/jenkins:lts
```

2. Открыть Jenkins UI: `http://localhost:8088`
3. Создать `Pipeline` job:
- Definition: `Pipeline script from SCM`
- SCM: `Git`
- Repository URL: `https://github.com/AASSAA17/ProctoLearn.git`
- Branch: `*/main`
- Script Path: `Jenkinsfile`

4. Нажать `Build Now`.

### Что показывать на презентации
- `Stage View`: все этапы (Clone, Build, Tests, Deploy).
- Логи этапа `Build Docker Images` (видно сборку backend/frontend).
- Логи этапов `Backend Tests` и `Frontend Tests`.
- После `Deploy`: `docker compose ps` в post-блоке с поднятыми сервисами.

## 2) n8n

### Логин/пароль
- URL: `http://localhost:5678`
- Basic Auth Username: `admin`
- Basic Auth Password: `admin123`

### Что добавлено
- Backend интеграция: после `POST /attempts/:id/submit` отправляется webhook в n8n.
- Файл workflow: `n8n/workflows/exam-submit-notify.json`.
- Переменные в `.env.example`:
  - `N8N_EXAM_SUBMIT_WEBHOOK_URL`
  - `N8N_WEBHOOK_TOKEN`

### Payload из backend в n8n
```json
{
  "attemptId": "...",
  "userId": "...",
  "studentEmail": "student@example.com",
  "studentName": "Student Name",
  "examId": "...",
  "examTitle": "...",
  "score": 74,
  "passed": true,
  "trustScore": 43,
  "submittedAt": "2026-04-12T12:00:00.000Z"
}
```

### Как настроить n8n
1. Запустить n8n:
```bash
docker run -d --name proctolearn-n8n \
  -p 5678:5678 \
  -e N8N_WEBHOOK_TOKEN=change_me \
  -e SMTP_FROM=no-reply@proctolearn.local \
  -e PROCTOR_ALERT_EMAIL=proctor@proctolearn.local \
  n8nio/n8n:latest
```

2. Открыть `http://localhost:5678`.
3. Import workflow: `n8n/workflows/exam-submit-notify.json`.
4. В node `Email: Student Result` и `Email: Proctor Alert` выбрать SMTP credentials.
5. Активировать workflow (`Active`).
6. В `.env` проекта указать:
```env
N8N_EXAM_SUBMIT_WEBHOOK_URL=http://localhost:5678/webhook/proctolearn/exam-submit
N8N_WEBHOOK_TOKEN=change_me
```

7. Для локальной почты запустить Mailpit:
```bash
docker run -d --name proctolearn-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

8. В credential n8n для SMTP указать:
- Host: `host.docker.internal`
- Port: `1025`
- Secure: `false`
- User: пусто
- Password: пусто
- From email: `no-reply@proctolearn.local`

### Визуальный flow в браузере
`Webhook: Exam Submit` -> `IF: Verify Token` ->
- ветка A: `Email: Student Result` -> `Respond 200`
- ветка B: `IF: Trust Score < 50` -> `Email: Proctor Alert` -> `Respond 200`

### Что показывать на презентации
- Canvas workflow в n8n (узлы + связи).
- `Executions` после сабмита экзамена.
- 2 кейса:
  - Trust Score >= 50: письмо только студенту.
  - Trust Score < 50: студент + отдельное письмо проктору.

## 3) OPAL

### Логин/доступ
- OPAL/OPA не используют обычный username/password для UI.
- Для demo access используются токены:
  - `OPAL_MASTER_TOKEN=proctolearn-opal-token`
  - `OPAL_CLIENT_TOKEN=proctolearn-opal-token`

### Что добавлено
- `opal/docker-compose.opal.yml`
- `opal/policies/proctolearn.rego`
- `opal/data/users.json`

### Как запустить
```bash
docker compose -f opal/docker-compose.opal.yml up -d
```

### Загрузка role data в OPA
```powershell
$json = Get-Content -Raw opal/data/users.json
Invoke-RestMethod -Method Put -Uri http://localhost:8181/v1/data/proctolearn/users -ContentType "application/json" -Body $json
```

### Проверка доступа (пример)
```powershell
$body = @{
  input = @{
    user_id = "student-1"
    path = "/attempts/123/submit"
    action = "submit"
    resource_owner_id = "student-1"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri http://localhost:8181/v1/data/proctolearn/authz/allow -ContentType "application/json" -Body $body
```

### Добавить/убрать доступ конкретному пользователю
1. Добавить роль пользователю:
```powershell
Invoke-RestMethod -Method Put -Uri http://localhost:8181/v1/data/proctolearn/users/student-1/roles -ContentType "application/json" -Body '["STUDENT","PROCTOR"]'
```

2. Убрать роль:
```powershell
Invoke-RestMethod -Method Put -Uri http://localhost:8181/v1/data/proctolearn/users/student-1/roles -ContentType "application/json" -Body '["STUDENT"]'
```

### Что показывать на презентации
- Поднятые контейнеры `opa`, `opal_server`, `opal_client`.
- Тест policy decision до/после изменения ролей (`allow=true/false`).
- Объяснение, что роли ProctoLearn (`STUDENT/TEACHER/PROCTOR/ADMIN`) централизованно контролируются policy-слоем.

## Быстрый demo-сценарий (5-7 минут)
1. Jenkins: `Build Now` и Stage View.
2. n8n: визуальный flow + execution после `POST /attempts/:id/submit`.
3. OPAL/OPA: один `curl` на decision, затем смена ролей и повторный decision.

## Единые доступы для демо

| Сервис | URL | Логин | Пароль |
|--------|-----|-------|--------|
| ProctoLearn Admin | `http://localhost:3001` / API | `admin@proctolearn.kz` | `Admin@12` |
| ProctoLearn Teacher | `http://localhost:3001` / API | `teacher@proctolearn.kz` | `Teach@12` |
| ProctoLearn Student | `http://localhost:3001` / API | `student@proctolearn.kz` | `Stud@123` |
| ProctoLearn Proctor | `http://localhost:3001` / API | `proctor@proctolearn.kz` | `Proct@12` |
| PostgreSQL | `localhost:5433` | `postgres` | `1234` |
| pgAdmin | `http://localhost:5050` | `admin@proctolearn.com` | `1234` |
| MinIO Console | `http://localhost:9001` | `minioadmin` | `minioadmin123` |
| ProctoLearn API | `http://localhost:4000` | JWT Bearer token | см. аккаунт пользователя |
| ProctoLearn Web | `http://localhost:3001` | аккаунт приложения | пароль пользователя |
| n8n | `http://localhost:5678` | `admin` | `admin123` |
| Mailpit | `http://localhost:8025` | нет | нет |
| Jenkins | `http://localhost:8088` | `admin` | `admin123` |
| OPA | `http://localhost:8181` | нет | нет |
| OPAL | `http://localhost:7002` | токен | `proctolearn-opal-token` |
