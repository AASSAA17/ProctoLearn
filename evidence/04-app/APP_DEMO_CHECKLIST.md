# Application Demo Checklist

## What to show

1. Frontend and backend are up.
2. PostgreSQL data is seeded.
3. Role-based flows work:
   - student
   - teacher
   - proctor
   - admin
4. Course pages load data from the database.
5. Exam/proctor-related UI is present.

## Evidence files to collect

- API health output
- Login/session screenshot
- Course list screenshot
- DB seed output
- Docker Compose status output

## Suggested commands

- `docker compose -f docker-compose.server.yml ps`
- `docker compose -f docker-compose.server.yml logs -f api`
- `docker compose exec api npx prisma db push`
- `docker compose exec api npx ts-node prisma/seed.ts`

## Live defense note

Open the application, switch roles if needed, and show that the UI is backed by the database rather than static mock data.
