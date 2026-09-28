#!/bin/sh
set -eu
if [ -n "${DB_HOST:-}" ]; then
  DATABASE_URL="$(node /app/docker/database-url.cjs)"
  export DATABASE_URL
fi
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node /app/node_modules/prisma/build/index.js migrate deploy
fi
exec "$@"
