#!/usr/bin/env bash
# Run SQL on Supabase database
# Usage: ./scripts/run_sql.sh "SELECT * FROM players"
# Or:    ./scripts/run_sql.sh < migration.sql

set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL in your shell (never in this script)}"
PSQL_BIN="${PSQL_BIN:-psql}"

if ! command -v "$PSQL_BIN" >/dev/null 2>&1; then
  echo "psql not found; install PostgreSQL or set PSQL_BIN" >&2
  exit 1
fi

if [ -t 0 ]; then
  if [ "$#" -ne 1 ]; then
    echo 'Usage: run_sql.sh "SELECT ..." or pipe a SQL file to stdin' >&2
    exit 2
  fi
  "$PSQL_BIN" "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$1"
else
  "$PSQL_BIN" "$DATABASE_URL" -X -v ON_ERROR_STOP=1
fi
