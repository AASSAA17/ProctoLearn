# Diploma engineering notes

## Scope and original contribution

Phase A integrates authoring, learning progress, deterministic assessment, private camera/screen evidence, assigned review, appeal, immutable certificate issuance and public verification in one application. It implements authorization, transactional invariants and failure handling across these stages. It does not invent QR codes, proctoring as a concept, PostgreSQL or a pretrained language model. Ollama is an optional local assistant; it does not grade, certify or make reviewer decisions.

The demonstration course is original and deliberately small. Its short video is a labelled animated demonstration of HTML structure, not a filmed academic lecture. Full syllabi, original teaching videos, explanations and academic review belong to Phase B (COURSE_AUTHORING_HANDOFF.md).

## Traceability

| Requirement | Implementation | Verification source |
|---|---|---|
| Reproducible isolated environment | scripts/demo-release.cjs, local-launch.cjs, native PostgreSQL/S3 | ops tests, live launch/check/restart and runbook |
| Session and recovery isolation | auth guards/cookies/CSRF, single-use reset digest, local mail sink | auth-cookies/auth-policy/session tests and live recovery |
| Private authoring and lifecycle | CourseStatus, CoursesService, owner guards, serializable publication/enrollment | access-courses, course-publication integration, stage9 browser |
| Ordered learning eligibility | LessonProgress, Submission, server prerequisite checks | access-lessons, admin-admission, access integration |
| Stable exam rules and retries | examSnapshot, draftRevision, submissionDigest, serializable CAS | attempt-reliability tests, browser expiry |
| Restart expiry recovery | AttemptExpiryService bounded cursor scan | certificate-release integration restart case |
| Reviewable evidence | recording manifests/chunks, private S3, completeness checks | recording-upload/storage/review/appeal tests and browser MediaRecorder |
| Immutable certificates | snapshot fields, DB trigger, partial unique active index | certificate-release integration; certificate-privacy; PDF visual review |
| Current public verification | no-store verifier, separate trusted public origin, 4 UI states | API/public UI tests; real phone remains a device check |
| Optional local AI | native Ollama transport, bounded tools, per-request history, exam restriction | ai-chat fake HTTP, ai-access PostgreSQL, opt-in real-model evidence |
| Recovery | consistent quiescent DB+objects backup; refuse nonempty restore | backup-cli and real backup-restore plus release roundtrip |

This table links requirements to checks; it does not declare those checks passed. Executed statuses, dates and artifacts belong in TEST_RESULTS.md.

## Key engineering decisions

1. **Modular monolith:** existing Nest modules share serializable transactions for review/certificate/history. Splitting into services would add distributed failure modes without a demonstrated requirement.
2. **Server authority:** the browser supplies intent, never trusted role, eligibility, score, approval or certificate facts. Client validation improves feedback but backend checks remain mandatory.
3. **Two completion axes:** an exam score and proctor review are separate. Passing alone does not issue a proctored certificate. Both complete recordings must exist and no manifest may remain unfinished.
4. **Snapshots:** changes to question rules cannot change an already-started attempt. Certificate names/titles remain those captured at issuance. Legacy missing historical facts are labelled unavailable rather than reconstructed from mutable records.
5. **Idempotency and concurrency:** enrollment composite uniqueness, optimistic draft revision, canonical submission digest, serializable review, notification dedupe keys and certificate partial uniqueness protect retries. A revoked certificate cannot be reactivated by replay.
6. **Private evidence:** object storage is not an anonymous recording CDN. Authorized requests return bounded playback access; public QR verification contains no evidence or reviewer details.
7. **Failure isolation:** AI is optional. A local model timeout or stopped provider yields an explicit chat error while application readiness continues to depend on core database/storage.
8. **Publication:** DRAFT/PUBLISHED/ARCHIVED describes visibility; it is not a complete versioned LMS publishing system. Existing learners retain archived access. Used lesson/task deletion is blocked by domain guards.

## Reproducible comparison: manual code vs QR

**Status: NOT_MEASURED. No participants, timing values or statistical results are claimed.**

Objective: compare navigation effort to the **same** public verification page. Both methods must produce the same status response and show the same certificate facts.

Preparation:

- Use only fictional certificates: one VALID, one REVOKED and one nonexistent code.
- Fix the tested SHA, phone model/browser, reachable HTTPS origin, lighting, printed QR dimensions, network conditions and warm/cold cache policy.
- Prepare a form asking the participant to enter the printed verification code/URL manually; QR condition scans the corresponding printed QR. Both navigate to `/verify/:code`.
- Alternate/counterbalance order to reduce learning effects. Define the number of trials before collecting data; do not invent a sample-size justification.
- Explain the task and obtain participant consent before retaining observations. Store no real learner identity.

Record per trial: anonymous participant/trial ID, method, code condition, start time, correct verifier result visible time, input mistakes, retries, network failure and abandonment. Success means correct state visible, not merely camera detection. Predefine whether a failed network trial is repeated or excluded and preserve the reason.

Report raw anonymized measurements, median completion time and spread, errors and failed trials for each method. For a small convenience sample use descriptive findings; do not claim broad causal superiority. QR verifies a registry record and does not authenticate the person presenting it.

## 8–10 minute defense route

| Time | Action | Honest framing |
|---|---|---|
| 0:00–0:45 | Open catalog; state learning-to-certificate problem | One original demonstration course |
| 0:45–1:45 | Teacher opens existing lesson, changes text; shows publish/archive controls | Prepared course, real owner-authorized writes |
| 1:45–2:45 | Student completes a remaining prepared task; reloads progress | Earlier lessons were prepared; not a whole course learned live |
| 2:45–4:15 | Eligible student starts short policy-valid exam, saves draft/reloads/submits | Screen/camera chooser requires human interaction; no timer bypass |
| 4:15–5:15 | Assigned proctor plays available evidence and records justified decision | Waiting uploads prevent approval; synthetic fixtures are labelled |
| 5:15–6:00 | Student downloads certificate PDF and compares fixed names | PDF has real QR and issuance basis |
| 6:00–6:45 | Phone anonymously opens QR verifier | Only show as live after reachable topology/device check passes |
| 6:45–7:30 | Admin revokes a dedicated fictional certificate; rescan same QR | Revocation is final; use a disposable demo certificate |
| 7:30–8:30 | Local AI answers useful course question and scoped lookup | Only if AI_DEMO_VERIFIED; latency is part of the demo |
| 8:30–9:30 | Show architecture, current test summary, backup/restore evidence | State remaining limits explicitly |

Rehearse with the exact released build. If actual inference takes longer, shorten the optional AI segment rather than claiming instant response. Do not approve incomplete uploads to fit the presentation time.

## Fallback and slide outline

Label fallback footage **«Запись демонстрации, версия …, дата …»**. Keep it alongside redacted screenshots from the verified build; never present a recording as proof of an unverified current device path. Synthetic browser recordings demonstrate transport/workflow, not physical webcam quality or real cheating detection.

Slides: (1) problem and scope, (2) roles/use cases, (3) implemented component diagram, (4) ER and invariants, (5) exam/review/certificate sequence, (6) auth/evidence/public-data boundaries, (7) local AI limits and measured behavior, (8) executed verification results, (9) live demonstration, (10) limitations and Phase B content plan. No institutional formatting standard or fabricated research citation is assumed.
