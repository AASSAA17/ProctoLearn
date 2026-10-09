# Первичный архитектурный обзор

**Статус:** частично завершён 9 октября 2026 года.

## Подтверждённая карта системы

- `frontend/`: Next.js 16 App Router, TypeScript, Tailwind, Zustand и Socket.IO client.
- `backend/`: NestJS modular monolith с модулями auth, courses, learning, exams, attempts, proctoring, evidence, certificates, admin, notifications, operations, AI и health.
- `backend/prisma/`: PostgreSQL schema, миграции, demo seed и интеграционные проверки.
- `docker-compose.local.yml`: поддерживаемое изолированное Windows/local окружение с PostgreSQL, SeaweedFS, API и web.
- Legacy Compose и monitoring stack имеют отдельное назначение и не считаются подтверждённым production deployment.

## Наблюдения

1. Экзаменационные snapshots, события попыток, evidence retention и audit records реализованы в Prisma модели и покрываются целевыми backend-тестами.
2. CI разделяет frontend, backend, секреты и local-stack; local-stack поднимает реальную БД и S3-совместимое хранилище для browser E2E.
3. Корневой README содержит устаревшие сведения о версии Next.js и исторических вариантах инфраструктуры. Актуальный локальный путь описан в `docs/WINDOWS_LOCAL.md`.
4. На audit-ветке исправлены три подтверждённых P1 boundary gap: модульная последовательность уроков, прямые уроки в расчёте прогресса и раскрытие внутренних полей appeal history студенту.

## Ограничения

Этот документ не подтверждает production readiness. Для него нужны отдельные результаты миграций, CI на итоговом SHA, staging/release проверки, резервного копирования и обзора внешней инфраструктуры.
