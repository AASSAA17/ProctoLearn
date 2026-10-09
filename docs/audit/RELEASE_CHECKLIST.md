# Release checklist

## Confirmed on current audit branch

- [x] Branch is isolated: `audit/diploma-release-20261009`.
- [x] Known E2E route-matching fix is present in `frontend/e2e/stage9.cjs`.
- [x] Static local-launch, release-smoke and backup-cli tests passed.
- [x] No production deployment or external service mutation performed.

## Required before release

- [ ] Install dependencies and run backend build/tests/integration/migrations.
- [ ] Run frontend test/typecheck/lint/build.
- [ ] Start isolated local stack and run browser E2E repeatedly.
- [ ] Run GitHub Actions `secrets`, `backend`, `frontend`, and `local-stack` successfully on one SHA.
- [ ] Review historical credential examples and rotate any externally exposed keys.
- [ ] Validate backup/restore in a disposable environment.
- [ ] Complete QR/PDF and mobile accessibility review.

## Release blockers currently open

The unchecked items are external/runtime verification gates. This document does not claim release readiness until they have evidence.
