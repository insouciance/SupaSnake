#!/usr/bin/env bash

# Execute the one production-safe cohesive schema probe through Supabase's
# Management API. The API's read_only flag and the SQL transaction's READ ONLY
# mode are independent fail-closed guards. Fixture contracts must use
# run-local-sql-contracts.sh and are never accepted here.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
probe="$repo_root/supabase/tests/cohesive_release_read_only.sql"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"

if [ "$SUPABASE_PROJECT_ID" != 'gmpwyzqafoyowndbvlma' ]; then
  echo "Refusing linked probe for unexpected project: $SUPABASE_PROJECT_ID" >&2
  exit 1
fi
if [ ! -f "$probe" ]; then
  echo "Read-only cohesive schema probe is missing: $probe" >&2
  exit 1
fi

request=$(mktemp)
response=$(mktemp)
cleanup() {
  rm -f "$request" "$response"
}
trap cleanup EXIT

jq -n --rawfile query "$probe" '{query: $query, read_only: true}' > "$request"

curl --fail-with-body --show-error --silent --max-time 60 \
  --request POST \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --header 'Content-Type: application/json' \
  --data-binary "@$request" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/database/query" \
  > "$response"

# A syntactically valid management error object is not evidence of a passing
# probe. Require the exact sentinel emitted only after every SQL assertion.
jq -e '
  [
    .. | objects
    | select(
        .status == "ready"
        and .probe == "cohesive_release_read_only_v1"
      )
  ]
  | length == 1
' "$response" >/dev/null
echo "Linked cohesive schema passed the read-only structural probe."
