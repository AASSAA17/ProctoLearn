# Final demo release — acceptance ledger

Baseline `95d14edf8961cfca3ae6ae152d380e74365e6391`; branch `release/final-demo-20261010`; execution date2026-10-10. Phase A only: functioning platform plus one original course. Full course production is Phase B. Implementation/release revision is recorded at freeze below.

**Overall: CONDITIONAL_DEMO_READY for laptop core; AI_DEMO_VERIFIED and FULL_DEMO_READY are not achieved.** Core software paths pass local acceptance. Physical phone/camera/screen, native browser zoom and actual model KK/tool completion prevent unconditional acceptance. CI for the published final SHA is a separate freeze gate, not inferred from local tests.

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
| DEMO-13 | P0 | Negative access/privateS3/config/secrets/dependencies | security suites/config/lockfiles | root | VERIFIED | Real auth/access/storage checks and scanner; scoped Next/js-yaml patches | Frontend toolchain9advisories explicitly retained; no production claim |
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
