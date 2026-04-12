# ProctoLearn Demo: Jenkins, n8n, OPAL

Ниже короткий сценарий для защиты. Показывай сервисы в этом порядке: Jenkins -> n8n -> OPAL.

## 1) Jenkins

### Что открыть
1. Открой [http://localhost:8088](http://localhost:8088).
2. Войди под:
   - Username: `admin`
   - Password: `admin123`
3. Открой созданный Pipeline job.
4. Нажми Build Now.
5. Покажи Stage View и логи стадий.

### Что говорить
- "Это Jenkins pipeline для CI/CD проекта ProctoLearn."
- "Сначала Jenkins клонирует репозиторий, потом собирает Docker-образы backend и frontend."
- "После этого запускаются тесты backend и frontend, а затем выполняется деплой через docker compose."
- "На защите я показываю, что pipeline прозрачно разделён на этапы и можно отследить каждую стадию в логах."

### На что обратить внимание
- Stage View с этапами Clone, Build, Tests, Deploy.
- Логи сборки и тестов.
- Итоговый запуск контейнеров через docker compose.

## 2) n8n

### Что открыть
1. Открой [http://localhost:5678](http://localhost:5678).
2. Войди под:
   - Username: `admin`
   - Password: `admin123`
3. Импортируй workflow из [n8n/workflows/exam-submit-notify.json](n8n/workflows/exam-submit-notify.json).
4. Открой canvas workflow.
5. Активируй workflow.
6. Отправь сабмит попытки через `POST /attempts/:id/submit`.
7. Открой Executions и покажи результат.

### Что говорить
- "Это n8n workflow для автоматизации после сдачи экзамена."
- "Когда студент отправляет ответ, backend вызывает webhook в n8n."
- "Сначала отправляется письмо студенту с результатом."
- "Если Trust Score ниже 50, n8n отправляет отдельное письмо проктору."
- "Так мы автоматически связываем экзамен, прокторинг и уведомления без ручной работы."

### На что обратить внимание
- Узел Webhook.
- Узел проверки токена.
- Условие Trust Score < 50.
- Два письма: студенту и проктору.
- Executions после сабмита.

## 3) OPAL

### Что открыть
1. Открой [http://localhost:8181](http://localhost:8181) для OPA decision API.
2. Покажи policy file [opal/policies/proctolearn.rego](opal/policies/proctolearn.rego).
3. Покажи demo data [opal/data/users.json](opal/data/users.json).
4. Если нужно, покажи compose-файл [opal/docker-compose.opal.yml](opal/docker-compose.opal.yml).

### Что говорить
- "OPAL/OPA отвечает за централизованное управление доступом."
- "У нас есть роли STUDENT, TEACHER, PROCTOR и ADMIN."
- "Policy решает, что пользователь может делать, а что нет."
- "Я могу добавить или убрать роль у конкретного пользователя и сразу проверить, изменился ли доступ."
- "Это позволяет отделить бизнес-логику от правил доступа."

### На что обратить внимание
- Decision API с allow true/false.
- Изменение ролей в data store.
- Пример deny by default.
- Пример доступа после изменения роли.

## Короткий порядок показа
1. Jenkins: показать pipeline и нажать Build Now.
2. n8n: показать workflow и execution после submit.
3. OPAL: показать policy decision и смену роли пользователя.

## Короткая речь на 1 минуту
"Сначала я показываю Jenkins, который собирает и деплоит проект по pipeline. Затем n8n, который автоматически отправляет письма после сдачи экзамена, включая отдельный алерт проктору при низком Trust Score. Потом OPAL, который централизованно управляет доступом по ролям STUDENT, TEACHER, PROCTOR и ADMIN. Таким образом, в проекте есть CI/CD, автоматизация событий и policy-based access control."

## Креды для демонстрации
- Jenkins: `admin` / `admin123`
- n8n: `admin` / `admin123`
- OPAL: токен `proctolearn-opal-token`

## Что ещё надо настроить

### Jenkins
- Для локальной демонстрации API key не нужен.
- Если репозиторий станет private, тогда в Jenkins нужен GitHub Personal Access Token или SSH key для checkout.
- Где взять токен: GitHub -> Settings -> Developer settings -> Personal access tokens.
- Для текущей демки достаточно `admin / admin123`.

### n8n
- Для локального демо API key не нужен.
- Нужны только:
   - доступ в UI `admin / admin123`
   - импорт workflow
   - SMTP credentials для отправки писем
- Если используешь Mailpit, никакой внешний ключ не нужен.
- Если хочешь отправлять настоящие письма, API key или SMTP данные берутся у почтового провайдера:
   - SendGrid: API key в dashboard SendGrid
   - Mailgun: SMTP/API credentials в Mailgun
   - Resend: API key в Resend dashboard
- Для демо я рекомендую Mailpit, чтобы ничего внешнего не настраивать.

### OPAL / OPA
- API key как у SaaS-сервисов не нужен.
- Для демо используются токены:
   - `OPAL_MASTER_TOKEN`
   - `OPAL_CLIENT_TOKEN`
- Их ты задаёшь сам в `.env`, это не внешний ключ.
- Если хочешь интеграцию с GitHub/private policy repo, тогда может понадобиться GitHub token для доступа к репозиторию policy.

### Самое важное перед показом
1. Jenkins уже должен открываться и пускать `admin / admin123`.
2. n8n workflow должен быть импортирован и активирован.
3. В n8n SMTP credential должен указывать на Mailpit или внешний SMTP.
4. OPAL/OPA policy data должна быть загружена, иначе decision будет `deny`.
