# Database review

**Статус:** первичный обзор схемы и миграций завершён 9 октября 2026 года.

## Подтверждено

- Prisma schema содержит пользователей и роли, курсы, модули, уроки, экзамены, snapshots попыток, ответы, события, evidence, review records и certificates.
- Миграции хранятся в Git и CI выполняет `prisma migrate deploy` перед интеграционными проверками.
- Certificate `qrCode` имеет уникальное ограничение; review и выдача сертификата связаны с attempt и course.

## Ограничения

- Не выполнялись SQL plan/performance измерения и restore в отдельный PostgreSQL.
- Нельзя подтвердить совместимость с пользовательской production БД без её схемы и резервной копии.

## Следующий шаг

Запустить `npm run test:migrations`, integration tests и backup/restore fixture; отдельно проверить планы запросов каталогов, попыток и admin dashboard на объёме staging данных.
