# Backend review

**Статус:** первичный обзор завершён 9 октября 2026 года; сборка и полный набор тестов в этой среде не запускались.

## Подтверждено

- NestJS разделён на модули auth, courses, learning, exams, attempts, proctoring, evidence, certificates, admin, notifications, operations, AI и health (`backend/src/app.module.ts`).
- DTO и guards используются на изменяющих endpoint'ах; проверки роли и владения ресурсом находятся в сервисах соответствующих модулей.
- Критические переходы попытки экзамена, решение проктора и выдача сертификата выполняются в транзакционных путях.
- Интеграционные тесты покрывают доступ, миграции, попытки, review policy, записи и S3-совместимое хранилище.

## Исправления на текущей audit-ветке

- Модульные уроки теперь участвуют в проверке последовательности предыдущих уроков.
- Прогресс курса учитывает как модульные, так и прямые уроки курса.
- Student appeal history получает только решение, причину и дату; внутренние `reviewerId` и `source` не выдаются.
- Admin password reset не возвращает plaintext временный пароль через API.

## Ограничения

- `npm` и `node_modules` недоступны локально, поэтому `npm run build`, `npm test` и integration tests имеют статус **не проверено**, а не «успешно».
- Production API, база и S3 не предоставлены; производительность и реальные backup/restore не подтверждены.

## Следующий шаг

Запустить `npm ci`, `npm run prisma:generate`, `npm run build`, `npm test`, `npm run test:migrations` и `npm run test:integration` в CI или окружении с PostgreSQL и S3 fixture.
