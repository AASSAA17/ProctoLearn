# Журнал работ: контролируемый пилот и учебные черновики

Владелец: Arsen. Существенная помощь AI: проектирование, программирование, тестовая автоматизация и подготовка оригинальных черновиков на казахском. Это журнал фактических действий, не доказательство самостоятельного авторства владельца. Человеческие решения записываются только после получения.

## Исходная точка — 10.10.2026

- Ветка `feat/controlled-pilot-curriculum-20261010` создана от `7dbb807a173e89612b8080499f8d08d9d8850b35` — более нового изменения QR после `f24bbc2` и исходного `19cd99e`.
- Два существовавших untracked файла `docs/audit/REPOSITORY_FILE_*2026-10-09*` сохранены и не включаются в эту работу.
- Node24.19.0; frontend Next16.3.8 / React19.3 / TypeScript5.9.2; Nest11 / Prisma6.19.3 / PostgreSQL и приватное S3 существующего launcher. Известный AI gate не пройден полностью; пилот проектируется с AIoff.
- Демонстрационный профиль `.local/release-demo` и временный QR `.local/qr-phone-demo` не используются как база участников. Новый профиль `.local/pilot`, отдельные DB/bucket/ports. Тесты — только обозначенный disposable профиль.

## Рабочий реестр

| ID | Предпосылка | Приёмка | Статус | Доказательство / блокер |
|---|---|---|---|---|
| G0 | Текущий checkout | Подтвердить базу, dirty state, контракты и профили | VERIFIED | git log/status; AGENTS; актуальные authoring/schema/config/docs прочитаны |
| G1 | Изолированный production build/proxy | Реальный HTTPS, cookies/CSRF/WS без localhost телефона | IN_PROGRESS | ngrok не установлен/не настроен; запрошено точное действие владельца, без токена в чате |
| G2 | G1 + membership/schema | Приглашения, лимиты, отдельный прогресс, backup/restore/update | IN_PROGRESS | Реализация изолированного профиля и backend; реальных участников нет |
| G3 | Авторский C01 + importer | Полный C01, проверки, DRAFT, реальный editor flow | IN_PROGRESS | Полный C01 создан; structural0/0; actual grader/DTO PASS. Импорт и реальный editor flow выполняются следующим шагом |
| G4 | Стандарт C01 | 15/50/150/15,450 formative,195 final,15 проектов, проверки | IN_PROGRESS | Все15 полных авторских пакетов готовы:15/50/150/15,450formative/195final/15projects;105 технических примеров проверены,45 awaiting human/environment; G4 не закрыт |
| G5 | G1–G4 + действительное одобрение | Публикация одобренного материала, пилот и восстановление | HUMAN_REVIEW_PENDING | Нет одобрения невиданных уроков или согласия на первую публикацию данных участников |

## Выполненные проверки нового кода

- `node --require ts-node/register test/content-import.test.cjs` в backend:3PASS — DTO deny, профиль/роль/hash/task validation, конфликт правок/владельца. Это unit, не доказательство транзакционной DB приёмки.
- `node --require ts-node/register test/curriculum-scoring.cjs C01` в backend: PASS36formative/15final. Содержимое и ключи не печатаются; private report в `.local/pilot-author/scoring-report.json`.
- `prisma generate`: первоначально FAIL EPERM при замене загруженной Windows DLL работающего демо. Существующий процесс не остановлен; этот запуск не объявляется PASS. Генерированные типы обновлены; изоляция следующей сборки проверяется отдельно.

## Решения владельца, которые ещё нужны

## Проверки и артефакты текущего дополнения

| Работа | Пути / причина | Выполненная проверка | Артефакт / ограничение |
|---|---|---|---|
| Приглашения и отдельные места курса | backend/src/pilot, auth, enrollments, lessons, attempts; server-side admission и сохранение истории | unit, disposable integration; expiry/reuse/concurrency/suspension/withdrawal | `.local/pilot-integration.log`; реальные участники не создавались |
| Same-origin pilot proxy и lifecycle | scripts/pilot-{profile,proxy,seed}.cjs; frontend api/store/admin/pilot | 19 profile/proxy/launcher, 4 role-nav, 11 certificate/expiry PASS; optimized build PASS | HTTP loopback проверяется отдельно от настоящего HTTPS ngrok |
| Узкий атомарный importer | backend/src/content-import, receipt migration, scripts/curriculum-import.cjs | 3 unit + DB replay/rollback/edit-conflict PASS | Private import-map; DRAFT only |
| Полное авторство | curriculum manifest, private C01–C15, COURSE_QA_REPORT | validator0/0; actual scoring1290+645 PASS;105 technical example checks | 45 проверок среды/человеческих протоколов ожидаются; HUMAN_REVIEW_PENDING |
| Учебный график | scripts/curriculum-python-projects.cjs | pandas/Python/matplotlib выполнены; PNG визуально осмотрен | `.local/pilot-author/evidence/python-projects/study-pages.png` |
| Ограниченная локальная нагрузка | scripts/pilot-learning-workload.cjs; disposable resources | 1/3/5 отдельных reader clients,352HTTP,0errors; WebSocket, range, upload retry, logout/restart persistence | `.local/release-tests/pilot-learning-workload.json`; исходная сборка df253d7f9f2b97cb; final candidate повторяется отдельно |

Прежняя нагрузочная проверка: 30/90/150 запросов за примерно10.9/10.8/10.7с, p95≈69.8/73.0/39.4мс. Измерены процессы API/Next; это не пиковая RAM всей машины и не скорость WAN. Машина ASUS TUF Gaming F15 / i5-11400H / 16.9GB RAM. Wi-Fi negotiated292.5Mbps не считается upstream internet bandwidth. На публичного провайдера нагрузка не направлялась.

Изменения и объяснения подготовлены AI при фактических запусках инструментов. Прохождение языка/педагогики, native Linux/Docker, реальный телефон, параметры экзаменов, согласие добровольцев и publication требуют настоящего решения владельца/преподавателя.

ngrok account/self-setup; фактический phone preview; просмотр C01 и остальных курсов/ключей через защищённый редактор; passing score/duration; информированное участие и отдельное согласование записи; первая публикация реальных данных. Ни одно из них не выводится из согласия на количество курсов.
