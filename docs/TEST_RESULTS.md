# Final demo acceptance — 2026-10-10

Scope: Phase A, one original course. Branch `release/final-demo-20261010`, implementation developed from `95d14edf8961cfca3ae6ae152d380e74365e6391`. Current release gates and revision are in [DEMO_READINESS.md](DEMO_READINESS.md). Historical audit/redesign runs are not counted as current evidence.

## Environment and executed checks

Windows, Node 24.19, PostgreSQL 18, SeaweedFS 4.47, installed Chrome/Playwright, production Next.js 16.3.8 build, NestJS 11, Prisma 6. Release uses its own PostgreSQL 5433/database/bucket; destructive integration suites use another marked profile on 55432/19000. Owner data was not reset. Docker/WSL was unavailable locally; the native supported path was exercised.

| Executed check | Result | Private evidence/reproduction |
|---|---|---|
| Backend production build | PASS | `.local/release-backend-build-final.log` |
| Frontend production build, TypeScript | PASS | `.local/release-frontend-build-final.log` |
| Backend unit/policy tests | PASS, 223 tests | `.local/release-backend-tests-final.log`; backend `npm test` |
| Frontend tests | PASS, 69 tests | `.local/release-frontend-tests-final.log`; frontend `npm test` |
| Frontend lint | PASS exit 0, 0 errors / 19 warnings | `.local/release-frontend-lint-final.log`; warnings retained, not described as clean |
| Real PostgreSQL integration | PASS, 84 tests | `.local/release-integration-final.log`; `node scripts/demo-release-tests.cjs run backend test:integration` |
| Clean migration, redeploy, historical upgrade/preservation and Prisma drift | PASS, 3 tests | `.local/release-migrations-final.log`; `... run backend test:migrations` |
| Actual private S3, recording integrity/retry, readiness, retention, backup/restore | PASS, 17 tests | `.local/release-storage-final.log`; `... run backend test:storage` |
| Scanner/lifecycle/backup/smoke/CI configuration unit group | PASS, 24 tests | `.local/release-ops-tests-final.log`; requires installed Gitleaks or explicit absolute `GITLEAKS_BIN` |
| Idempotent original seed, media generation/playback | PASS | ops seed/media tests; repeated prepare preserved password/content/progress |
| Stage9 real services/browser | PASS, repeated local runs | `.local/release-demo/evidence/final-stage9.log`; `node scripts/demo-release.cjs exec frontend e2e/stage9.cjs` |
| Original learning/result scenarios | PASS | `... exec frontend e2e/release-scenarios.cjs`; `evidence/original-scenarios.json` |
| Local SMTP password recovery | PASS | `... exec frontend e2e/release-recovery.cjs`; `recovery-result.json` |
| Certificate PDF, immutable facts, admin UI revoke, four verifier states | PASS | `... exec frontend e2e/release-certificates.cjs`; `evidence/certificate-acceptance.json` |
| Role UI/reflow | PASS: 70 checks across 10 pages/states | `... exec frontend e2e/release-ui.cjs`; `evidence/role-ui/report.json` |
| axe WCAG A/AA tagged checks and first visible keyboard focus | PASS: 10 pages each | Same report; not a WCAG certification or full screen-reader audit |
| Actual AI refusal isolation | PASS | `RUN_AI_CORE_ISOLATION=1`, `... exec backend test/integration/ai-core-isolation.cjs` |
| Actual Russian/Kazakh generation and tool use | PARTIAL/FAIL | See separate AI table below; never counted as verified AI |

Counts are Node test-runner reported tests, including nested tests; groups above must not be added to ad-hoc repeated runs as if all were distinct. Separate targeted certificate 2/2, course 15/15 and AI 12/12 passes are already represented in the full suites.

Stage9 uses actual API, database and S3. Browser-generated canvas streams go through MediaRecorder, chunk upload, finalization and authorized playback. They are **synthetic camera/screen evidence**, not a physical-device acceptance. Failure UI checks deliberately inject HTTP errors and are labelled fixtures. Six precisely identified authoring test courses were archived through their owner's API, preserving enrollment/review history. Original course state comes from actual API/browser learning and assessment, not direct completed/approved database inserts.

Recovery exercised registration, local SMTP delivery, browser reset, single-use rejection, old-session/old-password rejection, new login, password change and logout. Expired-token/cookie/CSRF/privilege cases also pass in automated auth suites. Local catcher is not external email delivery.

## Certificates and storage facts

Concurrent issuance, partial unique index, immutable facts, permanent revocation, owner-only PDF and mixed revoked/valid historical lookup pass against PostgreSQL. Public metadata excludes email, phone, private evidence and review reasons. Renaming a profile/course does not rewrite an issued certificate. Legacy facts stay null with `LEGACY_UNAVAILABLE`; no retrospective names were invented. Administrative exceptions preserve real lesson/submission history and carry `ADMIN_OVERRIDE`.

Actual issued PDF and an extreme-length layout fixture were rendered with Poppler and visually inspected. Kazakh/Cyrillic glyphs and QR layout are readable. zxing-cpp decoded the actual PDF QR and matched the configured verification URL. Anonymous independent browser showed VALID, then REVOKED after admin action at the same URL; random ID showed NOT_FOUND; HTTP503 fixture showed unavailable with successful retry. Admin catalog-load failure also now retries every required request.

The private storage suite restored a real dump and three objects into fresh targets, checked record relations and SHA-256 bytes, anonymous403, and refusal of occupied/corrupt/missing/unfinished-retention cases. The separately executed original-demo backup/restore result is recorded in DEMO_READINESS/runbook; do not substitute the suite's fixture for that operator exercise.

## Actual local AI evidence

Runtime: existing Ollama at loopback11434, `qwen3:4b` Q4, 16.89GB host RAM, RTX3050 approximately4GB. No cloud fallback or downloaded replacement weights. Application tools are bounded/read-only and scoped by authenticated identity; grades/certificates are deterministic application decisions.

| Actual model/service experiment | Result |
|---|---|
| Russian generation | PASS, 44.443s |
| Kazakh generation, original runtime config | FAIL, 120s timeout |
| Authorized `my_courses` model lookup | FAIL, 120.140s timeout |
| Forbidden course context | PASS, 60.085s; private name absent |
| Two GPU-resident4096-context reasoning configurations | FAIL: bounded generation ended without final Kazakh answer |
| Closed provider endpoint + real HTTP/DB/S3 application | PASS: explicit unavailable49ms; readiness/catalog200 before, concurrently, after; own temporary API/user removed |

Original 8192-token context partially offloaded to CPU; 4096-context trials used GPU but did not meet completion acceptance. This is observed behavior on this machine, not a generalized model benchmark. **AI_DEMO_VERIFIED is not achieved.** Mock provider tests do not change that conclusion. See [AI_LOCAL_SETUP.md](AI_LOCAL_SETUP.md).

## UI and measured local performance

Widths320/360/390/768/1024/1440 across public pages and each role; completed-course state included. No page-level horizontal overflow in the final70checks. Tables scroll within a labelled keyboard-focusable region. Fixed low-contrast green states, compressed mobile exam banners/editor controls and missing real dashboard progress (now4/5=80%). Screenshots manually inspected at320. CSS zoom200% reflow was exercised; **native browser zoom200% remains unverified**.

Current-build performance lab: five fresh Chrome contexts per profile, production localhost, empty course API fixture, no CPU/network throttle, fonts-ready plus3s observation. OS/server caches may remain warm. Results:

| Profile | Median LCP | LCP range | Median CLS | Decoded JS / transferred JS |
|---|---|---|---|---|
| 390px, reduced motion |236ms|208–704ms|0|580,692 /180,621bytes|
| 1440px, default motion |256ms|220–372ms|0|1,123,432 /319,148bytes|

Reduced-motion samples loaded no WebGL scene; desktop loaded one scene. This is a synthetic initial-load lab, not field Core Web Vitals, backend latency or physical mobile/GPU evidence. **INP NOT_MEASURED.** Historical earlier-design numbers are not used to claim a current improvement. Artifact: chat `outputs/final-demo/current-performance-fixture-lab.json`.

Real local catalog read-only smoke:60requests, max6concurrent,60completed,0errors,p95=36ms (threshold3000ms); `.local/release-smoke-final.json`. Not a production capacity guarantee.

## Security, failures and limits

Full dependency audits after scoped patches: backend0; frontend9 (7high/2moderate), remaining glob/CSS toolchain advisories. Reachability and retained risk are documented in [DEPENDENCIES_INFRA.md](DEPENDENCIES_INFRA.md). Do not report a globally clean audit. Final staging must pass the credential/raw-evidence scanner.

Investigated failures were retained honestly: historical schema test used current Prisma fields before the new migration (fixed fixture); pre-existing certificate status index missing from Prisma schema (schema aligned, drift now zero); Seaweed directory-marker teardown and volume allocation (fixture-only cleanup and launcher capacity repaired); tests missing Gitleaks path/password symbols/expectedPOST201 corrected; UI contrast/progress/mobile bugs repaired. No failing security assertion was skipped to obtain green results.

Physical phone QR, physical webcam/screen chooser, native browser zoom, Firefox/Safari and screen-reader testing remain NOT_RUN. Loopback QR cannot reach the laptop from a phone; a separately approved reachable origin is needed. No firewall/tunnel changes or production publication occurred. Manual-vs-QR human experiment remains NOT_MEASURED. Final independent Linux/container run is the current branch PR's `Platform checks` local-stack job; its status must be read for the exact final SHA rather than inferred from this local report.

## Original-demo backup exercise — 2026-10-10

`final-demo-20261010`: actual quiescent backup and restore verified25tables/32objects with counts, keyinventory and SHA256 integrity. Fresh targets `release_restore_78d1b02b0c34` / `release-restore-78d1b02b0c34`; no seed on restored startup. Browser acceptance: student login,2modules5lessons/completed progress, approved original attempt, valid certificate PDF/public verifier; assigned proctor both WebM streams decode and advance playback; anonymous object403. Source app returned to its original data after the exercise. Archive lives privately under `.local/release-demo/backups/`; sibling operator companion holds private config/accounts and selected artifacts with hashes. This backup does not include Ollama weights or replace versioned application source.
