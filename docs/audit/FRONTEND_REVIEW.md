# Frontend review

**Статус:** первичный обзор завершён 9 октября 2026 года; browser E2E и production-like UI review не запускались.

## Подтверждено

- Next.js App Router содержит маршруты auth, catalog, dashboard для четырёх ролей, lessons, exams, certificates и public QR verification.
- Ошибка local-stack E2E была связана с matcher запроса `/courses`: после добавления query-параметров старый matcher не перехватывал запрос. На текущей ветке используется predicate по API origin и pathname.
- В frontend есть loading, error и empty states для основных каталогов и dashboard-сценариев.

## Наблюдения

- GitHub run показывал React/ESLint предупреждения о cleanup refs, missing effect dependencies и `img` вместо `next/image`. Это P2 до подтверждения влияния на поведение.
- Адаптивность на размерах 360/375/390/768/1024/1440 и accessibility нельзя подтвердить без запуска приложения и Playwright.

## Следующий шаг

В окружении с `npm` выполнить `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, затем `npm run test:e2e` на изолированном local stack.
