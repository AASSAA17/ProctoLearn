# Module 3 — Database Evidence

PostgreSQL 16 managed via Docker Compose with pgAdmin for visual access.
All tables created by Prisma migrations; data seeded via `prisma/seed.ts`.

## How to collect evidence

```bash
# 1. Start the dev stack
cd /home/arsen/IdeaProjects/ProctoLearn
docker compose -f docker-compose.dev.yml up -d

# 2. Wait ~30 s, then connect to postgres
docker exec -it proctolearn_postgres psql -U proctolearn -d proctolearn_db

# 3. Inside psql — run these and screenshot each:
\dt
SELECT count(*) FROM users;
SELECT count(*) FROM courses;
SELECT count(*) FROM exams;
SELECT count(*) FROM lessons;
\q

# 4. Capture output to file
docker exec proctolearn_postgres psql -U proctolearn -d proctolearn_db \
  -c "\dt" \
  -c "SELECT count(*) AS users_count FROM users;" \
  -c "SELECT count(*) AS courses_count FROM courses;" \
  -c "SELECT count(*) AS exams_count FROM exams;" \
  > evidence/03-database/db_tables_and_counts.txt

# 5. pgAdmin — open http://localhost:5050
#    Login: admin@proctolearn.com / admin123
#    The proctolearn_db server is pre-configured via pgadmin/servers.json
#    Screenshot the table tree and query tool result.

# 6. pg_hba.conf (remote access proof)
docker exec proctolearn_postgres cat /var/lib/postgresql/data/pg_hba.conf \
  > evidence/03-database/pg_hba.conf.txt

# 7. Run this script to collect everything at once:
bash scripts/collect-db-evidence.sh
```

## Artifacts in this folder

| File | Description |
|------|-------------|
| `db_tables_and_counts.txt` | `\dt` + row counts from all main tables |
| `pg_hba.conf.txt` | PostgreSQL host-based auth config (remote access) |
| `pgadmin_screenshot.png` | pgAdmin connected to DB (manual screenshot) |
| `psql_session.txt` | Full psql session log |
