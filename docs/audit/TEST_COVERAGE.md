# Test coverage status

**Дата:** 9 октября 2026 года.

## Запущено в текущем окружении

- `node --test scripts/local-launch.test.cjs` — 2/2 passed.
- `node --test scripts/release-smoke.test.cjs` — 2/2 passed.
- `node --test scripts/backup-cli.test.cjs` — 10/10 passed.
- `node --test scripts/check-secrets.test.cjs` — 3/5 passed; 2 проверки получили exit code 2, потому что локальный `gitleaks` отсутствует. Это ограничение окружения, не доказательство дефекта тестируемого scanner.

## Не проверено

- Backend unit, integration, migration и storage suites.
- Frontend unit, typecheck, lint, build и Playwright E2E.
- Полный CI release gate на одном commit SHA.

## Причина

Локально отсутствует `npm`, зависимости и запущенный Docker daemon. Не подменяю эти результаты предположением или mock-данными.
