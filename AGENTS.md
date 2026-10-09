# ProctoLearn: working guidance

## Repository map

- `frontend/` is the Next.js 16 App Router application. It uses TypeScript, Tailwind, Zustand, Socket.IO, and the scripts in `frontend/package.json`.
- `backend/` is the NestJS 11 API. It uses Prisma, PostgreSQL, JWT sessions, Socket.IO, S3-compatible storage, and the scripts in `backend/package.json`.
- `backend/prisma/` contains the database schema, migrations, and seeds. Keep migrations in Git; never edit an applied migration.
- `docs/` is the source of truth for local operation, releases, security, sessions, recordings, and deployment. Read the relevant document before changing authentication, recording handling, Docker, or release files.
- `docker-compose.local.yml` and `start-local.cmd` are the supported Windows local environment. `docker-compose.yml`, `docker-compose.server.yml`, and monitoring files include legacy or specialized stacks; do not treat them as a production deployment without checking the associated documentation.

## Working rules

- Keep changes focused. Do not reformat unrelated files or update dependencies unless the task requires it.
- Treat recordings, evidence, user data, passwords, JWT keys, SMTP settings, storage credentials, and `.env*` files as private. Do not print, commit, or replace them.
- Preserve the security boundaries for role based access, exam attempts, recording uploads, and reviewer decisions. Changes to these areas need matching backend authorization checks and tests.
- Do not use Docker commands that remove volumes or delete data (`down -v`, `volume rm`, database resets) unless the user explicitly requests data deletion.
- Prefer the supported launcher for a full local stack on Windows: `./start-local.cmd --demo-minimal`. It creates local-only configuration and demo credentials under ignored paths.
- For a code change, inspect the closest existing test before adding a new test. Keep frontend tests under `frontend/test/` or `frontend/e2e/` and backend tests under `backend/test/`.

## Verification commands

Run only the checks relevant to changed code:

| Area | Command |
| --- | --- |
| Frontend type check | `npm run typecheck` in `frontend/` |
| Frontend tests | `npm test` in `frontend/` |
| Frontend lint | `npm run lint` in `frontend/` |
| Backend build | `npm run build` in `backend/` |
| Backend tests | `npm test` in `backend/` |
| Backend integration tests | `npm run test:integration` in `backend/` |
| Prisma migration checks | `npm run test:migrations` in `backend/` |

Do not claim a check passed unless it was run successfully in this checkout.

## Delegation

Use the installed global Codex subagents deliberately:

- `nextjs-developer` or `frontend-developer` for UI, App Router, accessibility, and client state work.
- `backend-developer` for NestJS, Prisma, REST, WebSocket, and authorization work.
- `security-auditor` for authentication, sessions, role access, uploaded recordings, storage URLs, and secrets.
- `test-automator` for targeted regression coverage.
- `docker-expert` or `devops-engineer` for Compose, local launch, CI, monitoring, and infrastructure work.
- `code-reviewer` for a final focused review of nontrivial changes.

Delegate explicitly with the task, affected paths, constraints, and expected verification. Keep implementation ownership with one agent when changes overlap.
