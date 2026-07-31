#!/usr/bin/env bash

set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_REF:?GITHUB_REF is required}"

if [ "$GITHUB_REF" != 'refs/heads/main' ]; then
  echo "Production deploys may only run from main; received $GITHUB_REF" >&2
  exit 1
fi

git fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'
checked_out=$(git rev-parse HEAD)
main_head=$(git rev-parse refs/remotes/origin/main)
if [ "$checked_out" != "$GITHUB_SHA" ] || [ "$main_head" != "$GITHUB_SHA" ]; then
  echo 'Production release authority is stale or not the exact current main commit.' >&2
  echo "checked_out=$checked_out main_head=$main_head dispatch=$GITHUB_SHA" >&2
  exit 1
fi

echo "Exact current main is $GITHUB_SHA."
