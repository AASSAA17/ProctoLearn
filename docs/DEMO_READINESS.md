# Final demo release — acceptance ledger

## Отдельный controlled pilot — 10.10.2026

Это дополнение не повышает статус демонстрации до production. `.local/release-demo` сохраняется; pilot использует отдельные DB/bucket/ports и production build. Операторские действия, действующие ограничения провайдера и открытые gates приведены в `PILOT_RUNBOOK.md` и `WORK_LOG.md`.

Пакет 15/50/150/15 подготовлен для редактора как DRAFT; ключи итоговых экзаменов приватны. Публикация требует настоящего преподавательского решения. HTTPS ngrok, физический телефон и реальные добровольные участники пока AWAITING_OPERATOR. AI остаётся отключён согласно прежнему незакрытому gate.

Baseline `95d14edf8961cfca3ae6ae152d380e74365e6391`; branch `release/final-demo-20261010`; execution date2026-10-10. Phase A only: functioning platform plus one original course. Full course production is Phase B. Implementation/release revision is recorded at freeze below.

**Overall: CONDITIONAL_DEMO_READY for laptop core; AI_DEMO_BLOCKED; FULL_DEMO_READY is not achieved.** The current remaining-gates follow-up and its limits are recorded below. Physical phone/camera/screen, native browser zoom, screen reader and repeatable model quality prevent unconditional acceptance. CI for each published SHA is a separate freeze gate, not inferred from local tests.

| ID | Priority | Acceptance criterion | Relevant paths | Owner | Status | Evidence | Blocker / limit |
|---|---|---|---|---|---|---|---|
| DEMO-01 | P0 | Isolated repeatable native start/stop/persistence | scripts/demo-release*, local-launch | ops | VERIFIED | Actual prepare/start/check/restart; stable seed; native build | Native Windows path; local Docker WSL unavailable |
| DEMO-02 | P0 | Login/reset/logout/change, scoped sessions and privileges | auth/mail; release-recovery | root | VERIFIED | Actual SMTP/browser reset; auth policy/cookie/integration suites | Mail catcher is local demo delivery |
| DEMO-03 | P0 | Private draft, owner publication/archive, preserve history | courses/modules/lessons/steps, teacher UI | courses | VERIFIED | Course15tests, realPG publication/concurrency, repeated stage9 | Legacy courses deliberately DRAFT |
| DEMO-04 | P0 | Enrollment, ordering, persisted progress and eligibility | enrollments/lessons/attempts | courses | VERIFIED | Original progress4/5=80%; real5/5 result; mixed lesson regression | Administrative exceptions labelled separately |
| DEMO-05 | P0 | Supported deterministic questions/tasks; private keys | exams/steps/submissions | courses | VERIFIED | Correct/incorrect formats, grading/access tests, teacher authoring | No human essay rubric or unsandboxed code execution |
| DEMO-06 | P0 | Snapshot/draft/reload/retry/races/expiry | attempts/attempt-expiry | root | VERIFIED | PG integration84tests incl restart-expiry; recorded browser exam/reload | Reconciler bounded100rows/pass15s |
| DEMO-07 | P0 | Private evidence, assigned review, appeal history | evidence/proctor/storage | root/ops | BLOCKED | Real MediaRecorder→API→PG/S3→playback; storage17tests; review/appeal suites | Synthetic browser sources; physical permissions/capture NOT_RUN |
| DEMO-08 | P0 | Immutable certificate lifecycle, PDF/QR and concurrency | certificates/admin/prisma/assets | root | VERIFIED | PG issue/revoke/index/snapshot tests; browser admin revoke; renderedPDF actualQRdecode | Legacy snapshots explicitly unavailable |
| DEMO-09 | P0 | Anonymous four-state verifier; trusted origin; phone rescan | verify/certificate-origin | root | BLOCKED | Independent browser valid→revoke→sameURL; unknown503retry; no-store | Physical phone/reachable HTTPS origin NOT_RUN |
| DEMO-10 | P1 | All role workspaces/management/audit | dashboards/admin/operations | root/courses | VERIFIED | Repeated stage9, admin revoke, real counts, retry regression | Demo dataset; not production volume acceptance |
| DEMO-11 | P1 | Responsive/keyboard/contrast/motion/zoom/performance | frontend | root/courses | BLOCKED |70reflow10axe10focus;320–1440screenshots; CSSzoom200%; currentlab | Native zoom200%, screenreader/other browsers NOT_RUN; INP unmeasured |
| DEMO-12 | P1 | Real RU/KK inference, scoped tools and isolated failure | ai/chat | ai | BLOCKED | RU44.443sPASS; security/mock/PG/isolationPASS | KK120sFAIL; authorizedlookup120.140sFAIL |
| DEMO-13 | P0 | Negative access/privateS3/config/secrets/dependencies | security suites/config/lockfiles | root | VERIFIED | Real auth/access/storage checks and scanner; scoped Next/js-yaml/parser patches | Frontend toolchain7high records for one unresolved braces advisory; no production claim |
| DEMO-14 | P0 | Consistent backup/new-target restore and usable records/bytes | backup/demo-release | ops | VERIFIED | Original25tables32objects backup/restore; student+proctor restored app and both WebM playback PASS | Private operator companion separate from DB/S3 archive |
| DATA | P0 | One original course + fictional role scenarios | demo-release-seed/media/scenarios | ops/courses | VERIFIED |2modules5lessons8questions; idempotent seeded content, actual4/5 and5/5 histories |12soriginal animation/transcript, not a full lecture library |
| DOCS | P1 | Architecture/runbook/results/diploma/content handoff | docs | root | VERIFIED | Linked compact document set below | Physical rehearsal/AI gates remain explicit |

Allowed ledger statuses: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, VERIFIED, BLOCKED, DEFERRED. A BLOCKED package can contain verified software checks; the missing acceptance is named explicitly rather than removed.

## Gates and remaining operator work

- Gate0 baseline: verified against actual repo/oldCI; earlier audit was context only.
- Gate1 core: software/security/data acceptance passed; physical evidence/phone checks conditional.
- Gate2 interface: role paths and automated/manual screenshot review passed; native zoom/device checks remain.
- Gate3 AI: bounded local-only implementation and failure isolation passed; actual model acceptance failed. Do not present model/tool answers as a verified live segment.
- Gate4 demo: prepared original course, scripted defense and recovery; actual backup/restore and restored browser exercise passed. Phone/manual hardware rehearsal pending.
- Gate5 freeze: final diff/revision, staged scanner and exact-SHA remote CI must be recorded. No merge to main or production deployment.

For unconditional demo acceptance, use an approved reachable application origin, regenerate/download matching QR PDF, verify physical phone valid→revoke→rescan, camera/screen chooser/stop/recovery and native zoom. Choose/configure a local model that completes real RU/KK/scoped lookup within the bound and rerun actual model acceptance. These are observable checks; a configuration file is not proof.

## Handoff

- [Launch, private account file, recovery and 8–10minute route](DEMO_RUNBOOK.md)
- [Executed evidence, failures, security and measured performance](TEST_RESULTS.md)
- [Implemented components, ER, state and sequences](ARCHITECTURE.md)
- [Diploma traceability, experiment protocol and slide outline](DIPLOMA_TECHNICAL_NOTES.md)
- [Phase B authoring contract](COURSE_AUTHORING_HANDOFF.md)
- [Real AI results and setup](AI_LOCAL_SETUP.md)
- [Backup contract and fresh-target restoration](BACKUP_RESTORE.md)

No real environment files were overwritten, historical migrations removed, owner database reset, privileged route exposed, or grade/certificate delegated to AI. No legal accreditation, electronic signature, production readiness or formal WCAG certification is claimed.

## Freeze record

Audited implementation commit: `3225a70a9499b667150d79243c1c704b04906b20`. Subsequent handoff-only commit adds the architecture inventory and this record without changing the built application. Local evidence in TEST_RESULTS applies to that implementation. Exact publication HEAD and its remote job outcomes are available in the branch PR checks; local results alone do not assert remote CI success. Final staged credential scan passed483indexed files before the implementation commit; two unrelated owner audit artifacts remain untracked and excluded.

Current laptop source is running at `http://localhost:3000`. Backup/recovery acceptance completed:25tables/32objects, fresh target plus actual student/proctor browser checks; returned to the original profile and preserved prepared states. Test infrastructure stopped. Private credentials remain only in `.local/release-demo/DEMO_ACCESS.txt`.

## Remaining-gates follow-up — 2026-10-10

Working branch: `fix/demo-remaining-gates-20261010`, based on verified `19cd99e73afa2b9017ec0a93c539ad053e0eb13e`. The preceding revision passed all four jobs in run38049311620; that historical success is not transferred to the new branch.

- **Closed:** two moderate parser audit records through a Tailwind-scoped dependency override; explicit `DEMO_AI_PROVIDER=off` launch mode; actual browser acceptance of the disabled reply with readiness/catalog200; stage-by-stage diagnosis and bounded repeatability evidence for the installed model.
- **AWAITING_OPERATOR:** real camera/window chooser, sharing stop/upload/playback; physical phone VALID→revoke→same PDF rescan; native200%zoom; actual screen reader speech. One exact checklist is in DEMO_RUNBOOK. The owner confirmed no authorized HTTPS topology and requested instructions. No tunnel/firewall/trust-store/deployment was changed. The laptop stays on loopback.
- **AI_DEMO_BLOCKED:** candidate RU3/3, KK2/3, authorized lookup3/3, forbidden context and unavailable passed. One weak Kazakh definition failed; no claim of complete acceptance. Production inference code/settings remain unchanged; the live demonstration process explicitly runs AIoff. See AI_LOCAL_SETUP for every measurement and cold/warm limits.
- **Retained risk:** seven high npm records are one unresolved braces advisory in build/lint dependencies. No patched version was available in the checked advisory/registry. Frontend production dependency audit0; this does not establish production readiness.
- Existing prepared course,4/5learner,5/5result, issued history, accounts, original backups and operator companion remain preserved. New smoke creates/deletes only its UUID fictional user. No course content was populated from the new outline.

### Changed files and review checklist

| Change group | Files | Review focus |
| --- | --- | --- |
| Optional live AIoff launch | scripts/demo-release.cjs, scripts/demo-release.test.cjs | Explicit off/ollama allowlist; no cloud selection or private configuration rewrite; default unchanged |
| Actual disabled-mode browser acceptance | frontend/e2e/release-ai-disabled.cjs | Owned profile guard, real HTTP/browser reply, core200, exact unique fixture cleanup |
| Bounded actual-model diagnostics | backend/test/integration/ai-gates-diagnostic.cjs | Disposable records,120s ceiling, no raw reasoning/private prompt output; failures retained |
| Scoped CSS parser repair | frontend/package.json, frontend/package-lock.json | Parser6→7 compatibility override limited to Tailwind paths; build/unit/UI and Linux CI required |
| Operator/evidence/content handoff | DEMO_RUNBOOK, TEST_RESULTS, AI_LOCAL_SETUP, DEPENDENCIES_INFRA, COURSE_AUTHORING_HANDOFF, this ledger | No synthetic hardware PASS, no invented reachable URL, no inflated AI/readiness claims; outline remains uncreated draft |

Before integration: review this diff and retained dependency/AI risks; inspect all exact-head CI jobs; rehearse physical checks separately; reconcile PR6 overlap; rerun CI on the final integration revision. No automated merge or release tag is authorized by this checklist.

### Verified branch graph and proposed integration order

Fetched graph: main`9a232519` → audit/diploma-release-20261009`de54c657`(+4) → feat/hybrid-premium-redesign`95d14edf`(+7) → release/final-demo-20261010`19cd99e`(+3) → this focused fix. The ancestry was checked, not inferred from branch names.

1. Review the focused fix against `release/final-demo-20261010`; integrate only after owner approval.
2. PR8 is `release/final-demo-20261010 → feat/hybrid-premium-redesign`.
3. PR7 is `feat/hybrid-premium-redesign → audit/diploma-release-20261009`.
4. Review a separate `audit/diploma-release-20261009 → main` integration PR after reconciling outstanding work and checking its complete diff/CI.

PR6 is independently `fix-p2-batch3 → main` at`939647b`; `git cherry` does not find an equivalent patch in the release. Its changes must be reviewed/reconciled on the integration branch, not silently dropped or assumed present. Merging PR8 alone does not update main. Existing PR bases were not changed; no merge/force-push occurred.

Proposed preservation tag for the previously verified revision: `demo/verified-2026-10-10-19cd99e`. This is a proposal only, pointing to19cd99e; no tag/release was created. A later tag for this follow-up needs its own exact verified SHA and approval.

Follow-up implementation freeze: `1c68db3bef3865df08b9ccfbc1c0b6d5530358c0`; local launcher/frontend/off-browser checks repeated after commit. Final handoff HEAD adds this record only; exact-head remote CI is published with the focused PR. Independent focused review completed after the diagnostic metadata timeout repair. No remaining actionable review findings; physical/AI/dependency limits above still apply.

### Authorized temporary phone verifier follow-up — 2026-10-10

A later explicit owner request authorized Cloudflare Quick Tunnel for anonymous verification of two fictional certificates only. TECHNICAL_PUBLIC_VERIFICATION: PASS (actual HTTPS browser hydration, fixed same-origin bridge, boundary denial, dedicated revocation, decoded refreshed PDF QR, start/check/stop/restore/restart). PHYSICAL_PHONE_SCAN: AWAITING_OPERATOR. The previous absent-topology statement is historical. The local application remains available; no auth/admin/recording/AI/storage/database service is published. Temporary URL and private fixture data stay ignored. See DEMO_RUNBOOK B and the focused TEST_RESULTS follow-up. Permanent deployment, hardware acceptance and unrelated release gates remain separate.
