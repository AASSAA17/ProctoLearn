# DevOps review

**Статус:** конфигурационный обзор завершён 9 октября 2026 года; фактический запуск контейнеров в этой среде невозможен.

## Подтверждено

- Для Windows документирован отдельный local stack через `start-local.cmd` и `docker-compose.local.yml`.
- Local stack разделяет PostgreSQL, API, web и S3-compatible storage; secrets и `.local` исключены из Git.
- CI включает readiness checks, миграции, browser E2E, release smoke и backup/storage проверки.

## Ограничения

- Docker daemon не запущен (`docker info` не подключился к `dockerDesktopLinuxEngine`), поэтому healthchecks, startup ordering, logs и graceful shutdown не проверены локально.
- Production TLS, firewall, DNS, external SMTP, backups и restore не предоставлены.

## Следующий шаг

Запустить Docker Desktop, выполнить `start-local.cmd --demo-minimal`, затем проверить `/ready`, web, private storage response, demo seed и `release-smoke.cjs`.
