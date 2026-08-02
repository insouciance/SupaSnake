#!/usr/bin/env bash

# Execute the one production-safe cohesive schema probe through Supabase's
# Management API. The dedicated endpoint runs the single structural SELECT as
# supabase_read_only_user. Fixture contracts must use run-local-sql-contracts.sh
# and are never accepted here.

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

jq -n --rawfile query "$probe" '{query: $query}' > "$request"

http_status=''
if http_status=$(curl --show-error --silent --max-time 60 \
    --request POST \
    --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    --header 'Content-Type: application/json' \
    --data-binary "@$request" \
    --output "$response" \
    --write-out '%{http_code}' \
    "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/database/query/read-only"); then
  :
else
  curl_status=$?
  echo "Linked cohesive schema probe request failed before an HTTP response (curl $curl_status)." >&2
  exit "$curl_status"
fi

if [ "$http_status" != '201' ]; then
  echo "Linked cohesive schema probe returned HTTP $http_status." >&2
  if jq -e . "$response" >/dev/null 2>&1; then
    jq -c '
      def bounded:
        if . == null then null else (tostring | .[0:1024]) end;
      if type == "object" then
        {
          message: ((.message // .error // "Management API request failed") | bounded),
          code: ((.code // null) | bounded),
          details: ((.details // null) | bounded),
          hint: ((.hint // null) | bounded)
        }
      else
        {message: "Management API returned a non-object JSON error"}
      end
    ' "$response" >&2
  else
    echo "Management API returned a non-JSON error body." >&2
  fi
  exit 1
fi

# A syntactically valid management error object is not evidence of a passing
# probe. Require the exact sentinel emitted only after every SQL assertion.
if ! jq -e '
  type == "array"
  and length == 1
  and (.[0] | type == "object")
  and (.[0] | keys == ["cohesive_release_probe"])
  and (.[0].cohesive_release_probe | type == "object")
  and (
    .[0].cohesive_release_probe
    | keys == ["checks", "probe", "status"]
  )
  and (.[0].cohesive_release_probe.status == "ready")
  and (
    .[0].cohesive_release_probe.probe
      == "cohesive_release_read_only_v2"
  )
  and (.[0].cohesive_release_probe.checks | type == "object")
  and (
    .[0].cohesive_release_probe.checks
    | keys == [
        "continuityConstraintsValid",
        "continuityTriggerValid",
        "favoriteRowsValid",
        "favoriteTriggerValid",
        "foundingBridgeSafe",
        "genomeAscendanceFunctionsValid",
        "genomeCatalogValid",
        "readOnlyExecution",
        "requiredFunctionsPresent",
        "requiredFunctionsServiceOnly",
        "requiredIndexesPresent"
      ]
  )
  and (.[0].cohesive_release_probe.checks | all(.[]; . == true))
' "$response" >/dev/null 2>&1; then
  echo "Linked cohesive schema probe did not return the exact ready sentinel." >&2
  if jq -e . "$response" >/dev/null 2>&1; then
    jq -c '
      if
        type == "array"
        and length == 1
        and (.[0].cohesive_release_probe | type == "object")
        and (.[0].cohesive_release_probe.checks | type == "object")
      then
        {
          status: .[0].cohesive_release_probe.status,
          probe: .[0].cohesive_release_probe.probe,
          failedChecks: [
            .[0].cohesive_release_probe.checks
            | to_entries[]
            | select(.value != true)
            | .key
          ]
        }
      else
        {
          message: "Management API returned an unexpected success shape",
          responseType: type,
          rowCount: (if type == "array" then length else null end)
        }
      end
    ' "$response" >&2
  else
    echo "Management API returned a non-JSON success body." >&2
  fi
  exit 1
fi
echo "Linked cohesive schema passed the read-only structural probe."
