# Certificate and QR verification review

**Статус:** исходный код и тестовые границы просмотрены; полный runtime сценарий не запускался.

## Подтверждено

- Сертификат получает уникальный verification code, а frontend строит public URL `/verify/:code`.
- Public verification возвращает ограниченные данные сертификата; PDF endpoint защищён проверкой владельца.
- Выдача сертификата вызывается после подтверждённого proctor review либо по отдельному административному пути с audit event.

## Ограничения и риск

- На audit-ветке добавлена модель отзыва `REVOKED` с `revokedAt`, `revokedBy` и причиной, миграция и административный endpoint. Runtime и migration checks ещё не запускались.
- QR, PDF, кириллица и длинные названия требуют browser/runtime и PDF проверки.

## Следующий шаг

Добавить или подтвердить отдельные regression tests для public valid/invalid code, owner-only PDF, duplicate issuance и revoked status, если отзыв входит в дипломный MVP.
