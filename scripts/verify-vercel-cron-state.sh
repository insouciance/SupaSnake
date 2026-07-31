#!/usr/bin/env bash

# Prove that Vercel's registered production cron schedule belongs to one exact
# deployment and host and still matches the reviewed vercel.json definition.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${VERCEL_ORG_ID:?VERCEL_ORG_ID is required}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is required}"
: "${EXPECTED_CRON_DEPLOYMENT_ID:?EXPECTED_CRON_DEPLOYMENT_ID is required}"
: "${EXPECTED_CRON_HOST:?EXPECTED_CRON_HOST is required}"

project_json=$(curl --fail-with-body --show-error --silent --max-time 20 \
  --header "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_ORG_ID")

expected=$(jq -ce '[.crons[] | {path, schedule}] | sort_by(.path, .schedule)' vercel.json)
actual=$(printf '%s' "$project_json" \
  | jq -ce '[.crons.definitions[] | {path, schedule}] | sort_by(.path, .schedule)')
actual_sha=$(printf '%s' "$actual" | sha256sum | cut -d' ' -f1)

if [ "$actual" != "$expected" ]; then
  echo 'Production cron definitions differ from reviewed vercel.json.' >&2
  exit 1
fi
if [ -n "${EXPECTED_CRON_DEFINITIONS_SHA:-}" ] \
    && [ "$actual_sha" != "$EXPECTED_CRON_DEFINITIONS_SHA" ]; then
  echo 'Production cron definition hash changed during the release.' >&2
  exit 1
fi

if ! printf '%s' "$project_json" | jq -e \
  --arg deployment "$EXPECTED_CRON_DEPLOYMENT_ID" \
  --arg host "$EXPECTED_CRON_HOST" \
  '.crons.deploymentId == $deployment
    and .crons.enabledAt != null
    and .crons.disabledAt == null
    and (.crons.definitions | type == "array" and length > 0)
    and ([.crons.definitions[].host] | all(. == $host))' >/dev/null; then
  echo 'Production cron owner, host, or enabled state is not exact.' >&2
  exit 1
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "definitions_sha=$actual_sha" >> "$GITHUB_OUTPUT"
fi

echo "Production cron state is exact for $EXPECTED_CRON_DEPLOYMENT_ID ($actual_sha)."
