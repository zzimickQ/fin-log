#!/bin/sh
set -eu

# Apply pending database migrations on startup, unless explicitly skipped or
# no DATABASE_URL is configured. Fail fast: a server pointed at a database
# that is not migrated (or unreachable) is not useful.
if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "==> SKIP_MIGRATIONS=1 — not applying migrations"
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "==> DATABASE_URL not set — not applying migrations"
else
  echo "==> Applying database migrations"
  /app/node_modules/.bin/prisma migrate deploy
fi

exec node /app/dist/index.js
