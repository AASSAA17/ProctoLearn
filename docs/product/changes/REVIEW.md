# Независимый code/security review — 20.10.2026

Проверка выполнена Codex security-auditor, это AI review, не человеческое одобрение.

| Находка | Исправление | Подтверждение |
|---|---|---|
| HIGH: nonTASK content мог сохранять приватные ключи после смены типа | Recursive learner redaction для TEXT/VIDEO/TASK и lesson content | access-courses16/16, реальный owner preview без private keys |
| WITHDRAWN в open mode выглядел активным | ACTIVE filter и одинаковая check/complete семантика независимо от режима | enrollment-visibility2/2, полный backend243/243 |
| Причина suspend1000 вместо server500 | UI maxLength500 | Реальный browser dialog проверил maxlength, Escape, focus return и server error |
| React повторял score/passScore для certificate journey | Используются server FAILED/FINISHED/review/certificate records, неизвестное не объявляется выданным | dashboard-resilience4/4 |
| Повторяющийся id SectionFailure | useId | Dashboard axe scan без violations |

Права JWT/CSRF/roles сохранены; preview local staff allowlist закрыт в public gateway; API не создаёт academic rows. Второй человеческий review и физическое устройство остаются отдельными действиями.
