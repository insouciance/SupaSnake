#!/usr/bin/env bash

# Prove the first-release compatibility premise for Genome v2 through
# Supabase's read-only Management API. The response is aggregate-only and the
# harness fails closed on every shape other than the exact zero-session sentinel.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
probe="$repo_root/supabase/tests/genome_v2_pre_release_read_only.sql"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"

if [ "$SUPABASE_PROJECT_ID" != 'gmpwyzqafoyowndbvlma' ]; then
  echo "Refusing Genome v2 preflight for unexpected project: $SUPABASE_PROJECT_ID" >&2
  exit 1
fi
if [ ! -f "$probe" ]; then
  echo "Genome v2 pre-release probe is missing: $probe" >&2
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
  echo "Genome v2 preflight failed before an HTTP response (curl $curl_status)." >&2
  exit "$curl_status"
fi

if [ "$http_status" != '201' ]; then
  echo "Genome v2 preflight returned HTTP $http_status." >&2
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

if ! jq -e '
  type == "array"
  and length == 1
  and (.[0] | type == "object")
  and (.[0] | keys == ["genome_v2_preflight"])
  and (.[0].genome_v2_preflight | type == "object")
  and (
    .[0].genome_v2_preflight
    | keys == ["bySource", "status", "v2SessionCount"]
  )
  and (.[0].genome_v2_preflight.status == "clear")
  and (.[0].genome_v2_preflight.v2SessionCount == 0)
  and (.[0].genome_v2_preflight.bySource | type == "object")
  and (
    .[0].genome_v2_preflight.bySource
    | keys == [
        "checkpoint",
        "runContext",
        "settledGenome",
        "startManifest",
        "startManifestDraft",
        "terminalFacts"
      ]
  )
  and (.[0].genome_v2_preflight.bySource | all(.[]; . == 0))
' "$response" >/dev/null 2>&1; then
  echo "Genome v2 preflight did not return the exact zero-session sentinel." >&2
  if jq -e . "$response" >/dev/null 2>&1; then
    jq -c '
      if
        type == "array"
        and length == 1
        and (.[0].genome_v2_preflight | type == "object")
      then
        .[0].genome_v2_preflight as $result
        | {
            status: (
              if ($result.status | type) == "string"
              then ($result.status | .[0:64])
              else "invalid"
              end
            ),
            v2SessionCount: (
              if ($result.v2SessionCount | type) == "number"
              then $result.v2SessionCount
              else null
              end
            ),
            nonzeroSources: (
              if ($result.bySource | type) == "object"
              then [
                $result.bySource
                | to_entries[]
                | select(
                    .key == "checkpoint"
                    or .key == "runContext"
                    or .key == "settledGenome"
                    or .key == "startManifest"
                    or .key == "startManifestDraft"
                    or .key == "terminalFacts"
                  )
                | select((.value | type) == "number" and .value != 0)
                | {source: .key, count: .value}
              ]
              else []
              end
            )
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

echo "Genome v2 first-release precondition passed: no durable v2 session exists."
