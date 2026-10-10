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
| G1 | Изолированный production build/proxy | Реальный HTTPS, cookies/CSRF/WS без localhost телефона | AWAITING_OPERATOR | Локальный338f8ecaac2e105a запущен; ngrok account/client, реальный TLS и физический телефон не подтверждены |
| G2 | G1 + membership/schema | Приглашения, лимиты, отдельный прогресс, backup/restore/update | LOCAL_VERIFIED / PUBLIC_PENDING | 1/3/5 клиентов,352HTTP,90integration PASS; backup/restore отдельно;0реальных участников |
| G3 | Авторский C01 + importer | Полный C01, проверки, DRAFT, реальный editor flow | DRAFT_IMPORTED / HUMAN_REVIEW_PENDING | Авторизованный импорт; editor course/TEXT/TASK PATCH200 без изменения;15exam questions; публикации нет |
| G4 | Стандарт C01 | 15/50/150/15,450 formative,195 final,15 проектов, проверки | CONTENT_READY / CHECKS_PARTIAL | Все15 полных авторских пакетов готовы:15/50/150/15,450formative/195final/15projects;105 технических примеров проверены,45 awaiting human/environment; G4 не закрыт |
| G5 | G1–G4 + действительное одобрение | Публикация одобренного материала, пилот и восстановление | HUMAN_REVIEW_PENDING | Нет одобрения невиданных уроков или согласия на первую публикацию данных участников |

## Выполненные проверки нового кода

- `node --require ts-node/register test/content-import.test.cjs` в backend:3PASS — DTO deny, профиль/роль/hash/task validation, конфликт правок/владельца. Это unit, не доказательство транзакционной DB приёмки.
- `node --require ts-node/register test/curriculum-scoring.cjs C01` в backend: PASS36formative/15final. Содержимое и ключи не печатаются; private report в `.local/pilot-author/scoring-report.json`.
- `prisma generate`: первоначально FAIL EPERM при замене загруженной Windows DLL работающего демо. Существующий процесс не остановлен; этот запуск не объявляется PASS. Генерированные типы обновлены; изоляция следующей сборки проверяется отдельно.

## Проверки и артефакты текущего дополнения

| Работа | Пути / причина | Выполненная проверка | Артефакт / ограничение |
|---|---|---|---|
| Приглашения и отдельные места курса | backend/src/pilot, auth, enrollments, lessons, attempts; server-side admission и сохранение истории | unit, disposable integration; expiry/reuse/concurrency/suspension/withdrawal | `.local/pilot-integration.log`; реальные участники не создавались |
| Same-origin pilot proxy и lifecycle | scripts/pilot-{profile,proxy,seed}.cjs; frontend api/store/admin/pilot | 19 profile/proxy/launcher, 4 role-nav, 11 certificate/expiry PASS; optimized build PASS | HTTP loopback проверяется отдельно от настоящего HTTPS ngrok |
| Узкий атомарный importer | backend/src/content-import, receipt migration, scripts/curriculum-import.cjs | 3 unit + DB replay/rollback/edit-conflict PASS | Private import-map; DRAFT only |
| Полное авторство | curriculum manifest, private C01–C15, COURSE_QA_REPORT | validator0/0; actual scoring1290+645 PASS;105 technical example checks | 45 проверок среды/человеческих протоколов ожидаются; HUMAN_REVIEW_PENDING |
| Учебный график | scripts/curriculum-python-projects.cjs | pandas/Python/matplotlib выполнены; PNG визуально осмотрен | `.local/pilot-author/evidence/python-projects/study-pages.png` |
| Ограниченная локальная нагрузка | scripts/pilot-learning-workload.cjs; disposable resources | 1/3/5 отдельных reader clients,352HTTP,0errors; WebSocket, range, upload retry, logout/restart persistence | `.local/release-tests/pilot-learning-workload.json`; финальная сборка338f8ecaac2e105a, sourcebca47b8, повторный workload PASS |

Прежняя нагрузочная проверка: 30/90/150 запросов за примерно10.9/10.8/10.7с, p95≈69.8/73.0/39.4мс. Измерены процессы API/Next; это не пиковая RAM всей машины и не скорость WAN. Машина ASUS TUF Gaming F15 / i5-11400H / 16.9GB RAM. Wi-Fi negotiated292.5Mbps не считается upstream internet bandwidth. На публичного провайдера нагрузка не направлялась.

Изменения и объяснения подготовлены AI при фактических запусках инструментов. Прохождение языка/педагогики, native Linux/Docker, реальный телефон, параметры экзаменов, согласие добровольцев и publication требуют настоящего решения владельца/преподавателя.

ngrok account/self-setup; фактический phone preview; просмотр C01 и остальных курсов/ключей через защищённый редактор; passing score/duration; информированное участие и отдельное согласование записи; первая публикация реальных данных. Ни одно из них не выводится из согласия на количество курсов.

## Финальная локальная приёмка

- Точная проверенная source revision: `bca47b8734704257d28d39be9400277b10e432db`; sourceclean, build `338f8ecaac2e105a`, fingerprint `338f8ecaac2e105a332bc5095e855b7fa8f7fd776b38817c6b7cebff5c89f260`. Последующие изменения отчётов не меняют исполняемый artifact; активный пилот не обновляется от Git push.
- Backend unit **238PASS**, frontend **75PASS**, disposable integration **90PASS**, migration **3PASS**. Логи final unit/integration — `.local/pilot-*-final.log`; migration — `.local/pilot-migrations.log`. Первоначальный schema drift исправлен явным RESTRICT без изменения применённой миграции. Actual runtime выявил Nest parser-name collision; исправление проверено login201,143945-byte scoped DTO400,>2MiB413,ordinary110KiB413,health200. Неудачные промежуточные запуски не считаются финальным PASS.
- Финальный workload1/3/5:352HTTP/0ошибок, p95≈36.99/41.31/28.12мс;9progress rows/45submissions пережили actual API restart. Точные phase CPU/RAM/duration/requestrate приведены в приватном JSON и PILOT_RUNBOOK. Это тест ограниченного локального workload, не максимальная capacity.
- C01: actual authenticated editor показал4modules/12lessons/48steps; неизменённые course/TEXT/TASK сохранены200, content hashes совпали. Exam metadata15 вопросов, предложенные25min/75%. Действительный teacher/owner review **не получен**. ADMIN student learning shell блокирует; rendered draft preview не заявлен. Снимки fictional owner: `.local/pilot-author/evidence/c01-editor-outline.png`, `pilot-admin-mobile.png`.
- Все15 courses импортированы DRAFT; повтор всех15 — unchanged replay. Прочитанный cohort из pilot БД:15/50/150/450TASK/15exam/195question;15DRAFT;0memberships/0invitations. Module lessons учитываются через `module.courseId`, не только legacy `lesson.courseId`. Пять checkpoint сохранены после фактических ответов API, затем дополнены итоговой DB проверкой.
- Скрытые195question stems не найдены в2275файлах production frontend artifact. Публичный catalog содержит0новых drafts, anonymous draft GET404, missingCSRF403. Это scope проверки, не утверждение об отсутствии любого возможного канала утечки. AI выключен.
- До promotion: `backup before-final-pilot` и `restore-check before-final-pilot` **PASS28tables/0objects**, отдельные `pilot_restore_34ecad365b5d` / `pilot-restore-34ecad365b5d`. Старый pilot profile ранее инициализирован при неуспешном bootstrap e0; сохранён перед новым запуском. Демо не останавливалось и его данные не менялись.
- После импорта создан `backup after-curriculum-import`,28tables/0objects, release338f8. Restored databases/buckets сохраняются приватно; cleanup отдельно по точным именам, без удаления по маске.
- `restore-check after-curriculum-import`: **PASS28tables/0objects**, отдельные `pilot_restore_60132752528e` / `pilot-restore-60132752528e`,2026-10-10T14:59:12.321Z. После остановки/backup/restore исходный pilot снова запущен;15:02:09UTC actual runtime read подтверждает прежние15/50/150/450/15/195 и0memberships/0invitations. Это сохранение авторского cohort, не вымышленный live participant test.
- DPAPI author backup на PowerShell7.6.5: **83файла**, encryption/decryption in-memory hash comparison PASS; сохраняется вне Git в пользовательских Документах/ProctoLearn-private-backups. Отдельная попытка Windows PowerShell5.1 завершилась unsupported assembly и не объявляется PASS; runbook явно требует7. Off-device recovery требует сохранённых Windows account keys или отдельной защищённой экспортной процедуры.
- Изменения сохранены в draft [PR11](https://github.com/AASSAA17/ProctoLearn/pull/11), base `fix/qr-phone-verification-20261010`. Merge не выполняется. Private bundles/keys/maps/backups не отправляются в Git. Два исходных audit-файла владельца остаются вне коммитов этой работы.

### Точная следующая очередь

1. H1, prerequisiteG1: владелец разрешает клиент ngrok и самостоятельно подключает аккаунт/assigned hostname. Один запрос уже отправлен; токен не нужен в чате.
2. H2, prerequisiteH1: фактические TLS cookies/CSRF, два remote IP, WS/uploads, обычная phone navigation через warning; затем физический Safari/QRvalid+revoked. AWAITING_OPERATOR.
3. H3: native Linux и Docker проверки;45 human/environment protocols. Не запускать привилегированное исправление WSL и большие downloads без согласования.
4. H4: настоящий просмотр C01 и остальных курсов, параметры экзаменов, замечания и отдельная команда публикации одобренных курсов. HUMAN_REVIEW_PENDING.
5. H5: послеH1–H4 согласие добровольцев/раскрытие записи, отдельное разрешение первой экспозиции participant data и малый pilot. LIVE_PARTICIPANT_TESTED=false.

Автоматического продолжения после окончания сессии не обещается. CONTENT_READY=true означает готовые reviewable тексты и задания, не закрытие G4/G5 и не публикацию.
