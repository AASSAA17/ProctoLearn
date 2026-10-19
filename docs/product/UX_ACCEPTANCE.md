# UX: журнал исполнения 20.10.2026

## Baseline

Исходная ветка feat/controlled-pilot-curriculum-20261010, HEAD 9ab1a947f4d71958a35ed3c7957f54d046605ec8. Новая ветка feat/product-ux-20261020 от того же HEAD с сохранёнными незакоммиченными изменениями 19.10: обычная регистрация, launcher mode, предварительная публикация, operator docs. Patch и список файлов сохранены приватно в `.local/ux-20261020-baseline`. Две пользовательские audit files не изменяем.

GitHub API 20.10: PR11 открыт, base fix/qr-phone-verification-20261010; Platform checks на 9ab1a94 completed/success. Это НЕ результат новой ветки. gh CLI отсутствует. Начальное состояние runtime: Pilot is not ready; принятый artifact 8cf02f8ba85b075a. Известный recovery: backup before-course-opening-20261019, отдельная demo сохраняется.

## Ledger

| ID | Предпосылка и наблюдаемая приёмка | Статус | Доказательство/следующий шаг |
|---|---|---|---|
| UX-01 | Серверная политика; закрытый режим объяснён до формы, открытый сохранён | VERIFIED | backend2+pilot12+auth15; browser обеих политик |
| UX-02 | Ошибка certs не скрывает enrollment; независимые retry и неизвестные числа | VERIFIED | unit4; browser503/retry сохраняет курс |
| UX-03 | Label/feedback/save retry, без раскрытия ключей и двойного completion | VERIFIED | learning12; browser correct/incorrect/save retry |
| UX-04 | Owner/admin preview DRAFT, нет academic writes | VERIFIED | course16; proxy9; настоящий preview401/200 и counts unchanged |
| UX-05 | Pilot modal: target/consequence/reason/error/focus; режим off объяснён | VERIFIED | browser Escape/focus/error/maxLength500 |
| UX-06 | Видны реальные проверки/статус, нет ложного APPROVED | IMPLEMENTED | local draft checklist; human review PENDING; no publication changes |
| UX-07 | Путь к сертификату использует реальные состояния API | VERIFIED | projection unit; verifier4 browser outcomes; no guessed issuance |
| UX-08 | Browser labels/errors/dialog/keyboard/reflow | PARTIALLY_VERIFIED | Chromium60reflow/5axe; nativezoom/screenreader/device NOT_RUN |
| UX-09 | Существующие токены/компоненты, небольшие общие primitives | IMPLEMENTED | ConfirmActionDialog + existing tokens; no dependency additions |
| UX-10 | Hero reduced motion/lazy/fallback/cleanup, без exam WebGL | PRESERVED | existing lazy/cleanup inspected; reducedmotion browser canvas0; GPU memory NOT_RUN |
| UX-11 | Понятное продолжение/навигация, завершение только с сервера | VERIFIED | next unfinished/direct URL helper tests + learning browser |

После каждой правки обновляется соответствующая запись в `changes/UX-*.md`: изменённые файлы, причина, реальная команда и результат, ограничения. PASSED только после выполнения; FAILED/BLOCKED/NOT_RUN сохраняются явно. Полная фаза не завершена только из-за успешной компиляции.

## Условия проверки

20.10 baseline browser до promotion: Chromium153.0.8010.12, headless/local/reduced-motion, отдельный context на каждую навигацию. `/`, `/auth/register`, `/courses` при390/1440:6 HTTP200, overflow0, CLS0, canvas0 при reduced motion. LCP в единичных наблюдениях140–700ms, long-task blocking0–12ms; это лабораторные сырые наблюдения, не рейтинг и не INP. Снимки и JSON `.local/ux-20261020-baseline/before`. Тот же протокол повторяется после сборки.

Автоматические примеры используют синтетические fixtures; destructive suites не запускаются на pilot/demo. Браузерные сценарии: обе политики регистрации и ошибки приглашения; partial dashboard failure; правильный/неправильный TASK и progress retry; защищённый preview без записи; pilot dialogs; сертификат valid/revoked/notfound/unavailable. Ширины: 320,360,375,390,430,768,1024,1280,1440,1920. Keyboard, reduced-motion, доступность label, overflow. Native zoom200%, физический телефон/камера, screenreader отмечаются отдельно при невозможности.

## Проверки перед финальным artifact

Backend243/243, frontend85/85, proxy/profile16/16 PASSED; full frontend lint0errors/18warnings. Исходная неудачная сборка 19.10 из-за буквы «ч» описана в истории чата; в этой работе дефекты concurrent typecheck зафиксированы в per-change docs и исправлены. После final artifact будет повторена browser матрица. Secret scan553 index files PASSED (локальный pinned Gitleaks8.30.1; первый вызов без PATH был BLOCKED, затем указан существующий binary, ничего не скачивалось).

AI assistance: реализация, тесты и этот журнал подготовлены Codex с профильными subagents. Human content review не выполнялся и не записан как APPROVED. Не создавались реальные участники/экзамены/сертификаты. Миграций и новых зависимостей нет. Перечень изменённых путей доступен через git diff исходного9ab1a94 к ветке feat/product-ux-20261020; два пользовательских audit файла исключены.

## Финальный artifact

83be191f017a3683, application source a6989be. Browser11 scenarios/60reflow/5axe PASSED; typecheck и optimized build PASSED; backend243/frontend85/proxy16 PASSED. Регистрация/каталог/preview доступны через прежний localhost3200. Новые manifests/docs не означают content approval. Полный отчёт: [DELIVERY_2026-10-20](DELIVERY_2026-10-20.md).
