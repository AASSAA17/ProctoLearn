#!/usr/bin/env bash
# ============================================================
# Collect Database Evidence (Module 3)
# Usage: bash scripts/collect-db-evidence.sh
# Run AFTER: docker compose -f docker-compose.dev.yml up -d
# ============================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
OUT="$PROJECT_ROOT/evidence/03-database"
mkdir -p "$OUT"

PGUSER=$(grep "^POSTGRES_USER=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2 || echo "proctolearn")
PGDB=$(grep "^POSTGRES_DB=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2 || echo "proctolearn_db")

# Try dev container first, then prod
PGCONTAINER="proctolearn_postgres"

if ! docker ps --filter "name=${PGCONTAINER}" --format "{{.Names}}" | grep -q "${PGCONTAINER}"; then
  echo "❌ Container '$PGCONTAINER' is not running."
  echo "   Run: docker compose -f docker-compose.dev.yml up -d"
  exit 1
fi

echo "📊 Collecting database evidence from $PGCONTAINER..."

docker exec "$PGCONTAINER" psql -U "$PGUSER" -d "$PGDB" << 'PSQL' > "$OUT/db_session_${TIMESTAMP}.txt" 2>&1
SELECT version();
\echo ''
\echo '=== List of all tables ==='
\dt
\echo ''
\echo '=== Row counts ==='
SELECT 'users'   AS tbl, count(*) FROM users;
SELECT 'courses' AS tbl, count(*) FROM courses;
SELECT 'exams'   AS tbl, count(*) FROM exams;
SELECT 'lessons' AS tbl, count(*) FROM lessons;
\echo ''
\echo '=== Sample users (no passwords) ==='
SELECT id, email, role, "createdAt" FROM users LIMIT 10;
\echo ''
\echo '=== Sample courses ==='
SELECT id, title, level FROM courses LIMIT 10;
PSQL

echo "✅ psql session saved → $OUT/db_session_${TIMESTAMP}.txt"

# pg_hba.conf
docker exec "$PGCONTAINER" cat /var/lib/postgresql/data/pg_hba.conf \
  > "$OUT/pg_hba_conf_${TIMESTAMP}.txt" 2>&1
echo "✅ pg_hba.conf saved"

# postgresql.conf listen_addresses
docker exec "$PGCONTAINER" psql -U "$PGUSER" -c "SHOW listen_addresses;" \
  >> "$OUT/pg_hba_conf_${TIMESTAMP}.txt" 2>&1
echo "✅ listen_addresses captured"

echo ""
echo "=== Files saved to $OUT: ==="
ls -lh "$OUT/"
echo ""
echo "Next: open http://localhost:5050 (pgAdmin) and take a screenshot."
