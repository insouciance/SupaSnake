#!/usr/bin/env bash

set -euo pipefail

: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${EXPECTED_MIGRATIONS:?EXPECTED_MIGRATIONS is required}"

expected=$(printf '%s' "$EXPECTED_MIGRATIONS" | tr -d '[:space:]')
if ! [[ "$expected" =~ ^(none|[0-9]{3,}_[A-Za-z0-9._-]+\.sql(,[0-9]{3,}_[A-Za-z0-9._-]+\.sql)*)$ ]]; then
  echo "EXPECTED_MIGRATIONS must be 'none' or an exact comma-separated filename list." >&2
  exit 1
fi
if [ "$expected" = 'none' ]; then expected=''; fi

preview_file=$(mktemp)
trap 'rm -f "$preview_file"' EXIT
supabase db push --linked --include-all --dry-run \
  --password "$SUPABASE_DB_PASSWORD" 2>&1 | tee "$preview_file"
actual=$(grep -oE '[0-9]{3,}_[A-Za-z0-9._-]+\.sql' "$preview_file" \
  | sort -u | paste -sd, - || true)

if [ "$actual" != "$expected" ]; then
  echo "Pending migrations differ: expected '${expected:-none}', got '${actual:-none}'." >&2
  exit 1
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "actual=$actual" >> "$GITHUB_OUTPUT"
fi
echo "Linked migration plan is exactly ${actual:-none}."
