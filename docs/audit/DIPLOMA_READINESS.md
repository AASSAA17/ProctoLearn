# Diploma readiness

**Статус:** предварительная оценка, 9 октября 2026 года.

Тема диплома соответствует реализованному контуру: онлайн-курсы, роли студента/преподавателя/проктора/администратора, экзамен с проверкой и электронный сертификат с QR verification.

## Подтверждено исходным кодом

- Есть course/lesson/exam flows, progress, proctor review, certificate issuance и public verification route.
- Архитектура и persistence описаны в `docs/` и Prisma schema.

## Не подтверждено до защиты

- Полный runtime демонстрационный сценарий на чистом окружении.
- Все тесты и release gate на итоговом SHA.
- ERD, Use Case и sequence diagrams в отдельном оформленном пакете диплома.
- Production deployment, внешний SMTP, TLS, DNS и backup restore.

## Рекомендуемая демонстрация

Использовать только локальный demo seed без реальных персональных данных: регистрация/вход → курс → урок → экзамен → proctor decision → certificate PDF → QR public verification.
