# Открытые вопросы аудита

**Обновлено:** 9 октября 2026 года.

| ID | Приоритет | Статус | Описание |
| --- | --- | --- | --- |
| OPS-001 | P2 | Открыто | Корневой README содержит устаревшие версии и исторические примеры инфраструктуры. Перед защитой требуется сверка с `docs/WINDOWS_LOCAL.md` и release runbook. |
| DEP-001 | P2 | Требует анализа | `npm ci` сообщил о зависимостях с известными уязвимостями: backend — 2 moderate, frontend — 2 moderate и 9 high. Автоматическое обновление не выполнялось; нужны пакетный отчёт, оценка достижимости и совместимости. |
| REL-001 | P1 | Внешняя проверка | Итоговый release gate требует успешных `secrets`, `backend`, `frontend` и `local-stack` в GitHub Actions на одном SHA. Локальный E2E не заменяет cloud CI. |
| SEC-001 | P2 | Исправлено локально | Внешний `/api/metrics` закрыт nginx-конфигурацией; требуется проверка в staging/production после развёртывания. |
| SEC-002 | P1 | Исправлено на audit-ветке | Admin password reset больше не возвращает plaintext временный пароль в HTTP response; требуется backend/CI regression check. |
| SEC-003 | P1 | Исправлено на audit-ветке | Добавлена модель отзыва сертификатов и admin endpoint; требуется миграция, тест valid/revoked QR и review API. |
| AUTH-001 | P2 | Открыто | Login/forgot-password throttling ограничен IP; account-level progressive backoff не подтверждён. |
| DOC-001 | P2 | Открыто | README содержит устаревшую версию Next.js и исторические credential/infrastructure примеры. |
