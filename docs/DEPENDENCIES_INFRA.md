# Зависимости и инфраструктура: этап 7

Состояние документа: 28.09.2026. Этап 7 опубликован коммитом 1a021b6, CI 36361318325 полностью прошёл. Ниже разделены изменения в коде, выполненные локальные проверки и ещё ожидаемые проверки. Итоговый статус публикации и CI находится в [DELIVERY_STATUS.md](DELIVERY_STATUS.md).

## Версии и совместимость

Точные версии установок закреплены в `backend/package-lock.json` и `frontend/package-lock.json`. Установка выполняется через `npm ci`; Dockerfiles не используют `--legacy-peer-deps`. Обновления не выполнялись через `npm audit fix --force`.

| Компонент | Версия в текущем дереве | Изменение |
|---|---|---|
| Node.js | 24 в Dockerfiles и локальном окружении | Общая среда для сборки и запуска; отдельные существующие CI jobs ещё используют Node 22 |
| Next.js / React | 16.3.6 / 19.3.0 | Обновлены приложение, React DOM и связанные типы; `eslint-config-next` соответствует Next.js |
| NestJS core/common/platform | 11.2.6 | Сохранена основная версия 11; совместимый выпуск получен обновлением lock-файла |
| Nest Swagger / Config / CLI | 11.4.7 / 4.0.4 / 11.0.24 | Swagger 8 был рассчитан на Nest 9/10; выбран Swagger 11 с peer-зависимостью Nest 11 |
| Prisma CLI / Client | 6.19.3 / 6.19.3 | Сохранена основная версия 6 и существующая модель подключений к PostgreSQL |
| Nodemailer | 10.0.11 | Используются встроенные типы; отдельный `@types/nodemailer` удалён |
| AWS S3 client / presigner | 3.1141.0 / 3.1141.0 | Заменён npm SDK `minio`, сохранён интерфейс `MinioService` |
| XLSX export / test reader | `write-excel-file` 4.1.1 / `read-excel-file` 9.3.10 | Удалён `exceljs`; независимый XLSX reader находится в devDependencies |
| Локальное S3-хранилище | SeaweedFS 4.47 | Новый локальный стенд использует отдельные тома; старые данные MinIO автоматически не переносятся |

Совместимость Swagger подтверждена его [peerDependencies для 11.4.7](https://github.com/nestjs/swagger/blob/11.4.7/package.json). Nodemailer 10 требует Node.js 20 или новее и предоставляет CommonJS/ESM-сборки со встроенными типами; выбранный Node 24 удовлетворяет этому требованию. См. [официальный changelog Nodemailer](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md).

### Узкая замена зависимости Prisma

В `backend/package.json` добавлен scoped override:

```json
{
  "overrides": {
    "@prisma/config": {
      "deepmerge-ts": "8.0.2"
    }
  }
}
```

Причина — [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): версии `deepmerge-ts` ниже 8.0.0 могут исчерпать стек при объединении рекурсивных объектов. Advisory отдельно отмечает, что обычный JSON сам по себе не создаёт такие циклические ссылки. В данном дереве зависимость приходит через конфигурацию Prisma; override ограничен этим родителем.

Это переход основной версии транзитивной библиотеки, поэтому одного успешного `npm install` недостаточно. До закрытия этапа должны пройти генерация Prisma Client, миграции чистой и существующей тестовой БД, проверка drift и интеграционные сценарии PostgreSQL. На момент подготовки документа окончательные результаты этих проверок с новым override ещё подтверждаются.

## S3 и хранение записей

`MinioService` теперь использует `@aws-sdk/client-s3` и `@aws-sdk/s3-request-presigner`. Сохранены методы загрузки, чтения, удаления, ограниченного списка объектов и получения подписанных ссылок. Имена переменных `MINIO_*` оставлены для совместимости конфигурации; они задают S3 endpoint, регион, bucket, credentials и отдельный адрес хранилища для браузера.

Загрузка файла читает поток с диска и передаёт известный `Content-Length`. SDK не повторяет потоковую запись автоматически: повторы с проверкой идентификаторов и хешей выполняет существующий протокол загрузки. Список объектов ограничен 1000 элементами на запрос и сохраняет `StartAfter` для продолжения. Подписанные URL создаются для публичного endpoint без сетевого запроса к нему.

Для совместимости с S3-серверами задан режим checksum `WHEN_REQUIRED`; это не отключает прикладную проверку SHA-256 каждого фрагмента при сборке файла. Сведения о поведении checksum в SDK: [документация AWS](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html). Контроль хешей не подтверждает личность участника или подлинность содержания видео.

| Операция | Ограничение |
|---|---|
| Установка соединения S3 | 2 секунды |
| Проверка bucket для readiness | 2 секунды, запрос отменяется через `AbortSignal` |
| Проверка/создание bucket при старте | HEAD до 2 секунд; CREATE ещё до 2 секунд и только после ответа 404 |
| Загрузка файла | До 120 секунд; поток закрывается и при ошибке |
| Удаление и список объектов | До 30 секунд |
| Получение объекта | До 30 секунд на ответ с заголовками, затем до 120 секунд на чтение тела |

Отдельное ограничение тела ответа необходимо: SDK возвращает поток после получения заголовков. Если сервер после этого перестанет передавать данные, поток принудительно уничтожается по тайм-ауту. Ошибка запуска S3 не скрывает HTTP liveness; готовность приложения при этом остаётся отрицательной.

Правила квот, апелляций, неопределённого результата транзакции и отложенного удаления сирот остаются в [RECORDINGS_AND_APPEALS.md](RECORDINGS_AND_APPEALS.md).

## XLSX

Экспорты пользователей и курсов сохраняют формат `.xlsx`, столбцы, числовые счётчики, Unicode-текст и оформление. Строки пользователя записываются как текст, включая значения, начинающиеся с `=`, поэтому они не превращаются в формулы Excel. Новые тесты читают сформированный XLSX независимой библиотекой и проверяют XML на отсутствие формул и приватных полей.

`read-excel-file` и вспомогательная библиотека распаковки нужны тестам, а не обработке пользовательских файлов на API. `fflate` обновлён до 0.8.3; настоящий XLSX roundtrip прошёл. Аудит обоих полных деревьев зависимостей 28.09.2026: 0 известных уязвимостей.

## Liveness и readiness

`GET /health` возвращает `200 {"status":"ok"}` и показывает, что HTTP-процесс отвечает. `GET /ready` проверяет PostgreSQL и настроенный S3 bucket: возвращает 200 при доступности обеих зависимостей либо 503 с `status: "not_ready"`. Ответ содержит только статусы `database` и `storage`, без URL, credentials и текста внутренних ошибок. Оба ответа имеют `Cache-Control: no-store`.

Параллельные запросы `/ready` объединяются в одну проверку; результат кешируется на две секунды. Для БД используется отдельный Prisma Client с одним соединением и ограничениями подключения, ожидания пула, сокета и SQL по одной секунде. Это не сокращает время обычных транзакций экзамена и проверки результата. Для S3 используется отменяемый `storageProbe(2000)`. Простое ожидание через `Promise.race` не заменяет отмену сетевой операции.

## Docker и локальный запуск

Backend и frontend используют многостадийные образы `node:24-alpine`, выполняются от пользователя `node` и имеют healthcheck. Backend healthcheck обращается к `/ready`; frontend запускает standalone-сборку Next.js. Старый `docker-compose.yml` вынесен в явный профиль `legacy`, новый `docker-compose.local.yml` использует отдельный проект и новые тома. Опубликованные локальные порты привязаны к loopback.

Новый локальный вариант использует SeaweedFS 4.47. Нельзя подключать прежний каталог данных MinIO как том SeaweedFS: перенос требует копирования через S3 API, проверки объектов и согласования записей БД. Старое хранилище сохраняется до подтверждения переноса. Инструкции запуска, в том числе вариант Windows без Docker: [WINDOWS_LOCAL.md](WINDOWS_LOCAL.md).

## Подтверждённые проверки и оставшаяся работа

Локально выполнены пять тестов нового адаптера, включая настоящий HTTP-сервер, который не отвечает или зависает после заголовков: запрос/поток завершается, сокет закрывается. На настоящих PostgreSQL и SeaweedFS прошли три сценария хранения (четыре теста с родительской группой): сборка точных байтов, отказ при повреждённом фрагменте и безопасная очистка после ошибки БД. Подписанный URL проверен настоящим GET с `Range`, ответом 206 и сравнением байтов. TypeScript и 12 тестов политики авторизации/почты прошли после установки нового SDK и Nodemailer.

Проверены свежий backend `npm ci` без legacy peer options, build и 159 тестов; 59 интеграционных тестов PostgreSQL, три проверки миграций, девять тестов настоящего S3/readiness. Prisma 6.19.3 успешно генерирует клиент и применяет миграции. Frontend: build, typecheck, 52 теста, lint без ошибок (16 предупреждений). Финальный `npm audit` обоих проектов: 0 известных уязвимостей.

Windows launcher создал отдельный кластер PostgreSQL 18.3, применил все пять миграций, загрузил demo и запустил API, SeaweedFS и Next.js. Настоящий Chrome подтвердил вход и страницы четырёх ролей, HttpOnly сессию, readiness БД/S3 и отказ анонимному S3. Проверка выполнена в рабочей копии Codex; пользовательская папка требует обновления из main. Docker daemon локально недоступен; сборку образов и запуск минимального Compose проверяет отдельный CI job, CI 36361318325 подтвердил сборку образов, запуск минимального Compose, readiness и compiled demo seed.

Проверки запускаются штатными командами `npm test`, `npm run test:integration`, `npm run test:migrations` и `npm run test:storage` в backend, а также `npm test`, `npm run typecheck`, `npm run lint` и `npm run build` во frontend. Интеграционные команды требуют отдельную тестовую БД; тесты S3 требуют изолированный endpoint и случайный bucket тестового запуска. Их нельзя направлять на рабочие данные.

### Предупреждения поддержки библиотек

Остались отдельные задачи сопровождения, которые не закрываются только результатом `npm audit`:

- `prom-client` 15.1.3 помечен в npm как заменённый на `@prometheus-io/client`. Миграция должна сохранить имена метрик, labels и формат `/metrics`.
- Через `pdfkit` 0.17.2 приходят `crypto-js` 4.2.0 и `jpeg-exif` 1.1.4, помеченные как неподдерживаемые. Нужно оценить поддерживаемые замены и проверить формирование, шрифты и изображения сертификатов до перехода.
- Локальные проверки не подтверждают production TLS, настоящий SMTP, резервное копирование, восстановление после аварии или воспроизведение всех контейнеров/кодеков видео. Для них нужны отдельные проверки окружения и последующих этапов.

Предупреждение deprecation и опубликованная уязвимость — разные сигналы. Нулевой аудит, когда он подтверждён, означает отсутствие известных advisory в проверенном дереве на дату проверки и не означает отсутствие всех ошибок или рисков.

## Final demo dependency review — 2026-10-10

The historical zero-finding audit above is not the current audit. This release pins Next.js and eslint-config-next 16.3.8 (previously 16.3.6), source-map-js 1.2.2, and a scoped @nestjs/swagger → js-yaml 5.4.3 override. Backend and frontend production builds passed with those lockfiles; migration/drift and real PostgreSQL suites passed.

The two recorded frontend advisories were rechecked against the installed dependency graph and their primary GitHub advisories. They affect build/development tooling, not code shipped into the browser or the NestJS runtime:

| Advisory | Installed dependency paths | Reachability in ProctoLearn | Disposition |
|---|---|---|---|
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), `braces` stack exhaustion from a deeply nested brace pattern | `tailwindcss@3.4.19 → chokidar@3.6.0 → braces@3.0.3`; `tailwindcss → micromatch@4.0.8 → braces`; `tailwindcss → fast-glob@3.3.3 → micromatch → braces`; `eslint-config-next@16.3.8 → @next/eslint-plugin-next → fast-glob@3.3.1 → micromatch → braces` | Tailwind file discovery, its development watcher and ESLint inspect repository-controlled glob patterns. No HTTP, WebSocket, course, exam, CSS or file-upload field is passed to these glob APIs. An attacker would first need write access to build inputs or configuration and then need a developer/CI process to evaluate the crafted pattern. The effect is availability of that build/lint process, not the running application. | **Unresolved, mitigated.** GitHub reports no patched `braces` release; npm lists 3.0.3 as latest. npm proposes Tailwind 4.3.3 and eslint-config-next 14.2.35, both inappropriate for a narrow patch. Keep build inputs trusted, restrict CI write rights, and reassess when an upstream compatible patch exists. |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), quadratic flat-selector parsing in `postcss-selector-parser` | Before repair: `tailwindcss@3.4.19 → postcss-selector-parser@6.1.4` and `tailwindcss → postcss-nested@6.2.0 → postcss-selector-parser@6.1.4`. After repair both resolve to 7.1.6 through a parent-scoped npm override. | Only repository-controlled CSS is parsed during development/build. The application has no CSS sanitizer, CSS playground or request path that parses a student-supplied selector. The upstream advisory explicitly says ordinary build-time use on trusted sources is not affected. | **Closed for this tree.** Version 7.1.6 is the upstream patched release. The override is restricted to Tailwind's two paths; it does not replace PostCSS globally. Upstream describes the patch as behaviour-preserving on an 8,413-selector differential corpus. Local Tailwind/PostCSS compilation, frontend typecheck and all 69 frontend tests passed with the override. |

The `postcss-selector-parser` override crosses that package's declared major range, so it remains a compatibility decision to review when Tailwind 3 is retired. The package has the same runtime dependencies and Node engine declaration in 6.1.4 and 7.1.6; the v7 major release changed insertion-during-iteration semantics. The actual ProctoLearn Tailwind pipeline was exercised after the override. Migrating Tailwind 3 to 4 is a separate change: the official upgrade guide changes the PostCSS package, CSS directives and browser baseline, so it was not folded into this release repair.

Fresh full-tree `npm audit` result after the narrow repair: backend **0** findings (unchanged from the release verification); frontend **7 high**, **0 moderate**, **0 critical**. Frontend `npm audit --omit=dev` reports **0** findings, confirming that the remaining paths are development dependencies in this lockfile. npm counts `braces` plus six affected parent packages separately, so seven findings represent one unresolved advisory in this reviewed set. Do not describe the whole repository as vulnerability-free.

Private reproducible release audit outputs remain under `.local/`. They are point-in-time results, not a warranty. Production deployment remains outside this demo acceptance. Before production, rerun `npm audit`, confirm that repository globs/CSS are still trusted-only, and replace the override with an upstream-supported Tailwind dependency as soon as one is available.
