#!/usr/bin/env bash

# Execute the repository's stateful SQL integration contracts against the
# isolated Supabase database. These are deliberately not pgTAP files: several
# contracts exercise transactions and real two-connection races that pg_prove's
# per-file wrapper cannot model.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

# shellcheck source=scripts/supabase-cli.sh
. "$repo_root/scripts/supabase-cli.sh"

if [ -n "${SUPABASE_LOCAL_DB_URL:-}" ]; then
  database_url=$SUPABASE_LOCAL_DB_URL
else
  database_url=$(supabase_cli status --output json | jq -er '.DB_URL')
fi

# Fixture contracts create users, sessions, clans, and economy rows. A typo or
# a stale environment variable must never point them at a hosted database.
case "$database_url" in
  postgresql://*@127.0.0.1:54322/*|postgresql://*@localhost:54322/*)
    ;;
  *)
    echo "Refusing SQL fixture contracts: expected isolated local Postgres on 127.0.0.1/localhost:54322." >&2
    exit 1
    ;;
esac

# dblink opens its second connection from inside the database container, where
# loopback:54322 is not the host-published Postgres port. Resolve the local
# Supabase database by its deterministic Compose service name instead. This is
# still the same isolated database whose external URL was proven above.
project_id=$(sed -nE 's/^project_id = "([A-Za-z0-9_-]+)"$/\1/p' supabase/config.toml)
if [ -z "$project_id" ]; then
  echo 'Could not derive the local Supabase project id for dblink.' >&2
  exit 1
fi
dblink_database_url=${database_url/@127.0.0.1:54322/@supabase_db_${project_id}:5432}
dblink_database_url=${dblink_database_url/@localhost:54322/@supabase_db_${project_id}:5432}
case "$dblink_database_url" in
  postgresql://*@supabase_db_${project_id}:5432/*)
    ;;
  *)
    echo 'Refusing SQL race contracts: local dblink target is not the isolated Supabase database.' >&2
    exit 1
    ;;
esac

# Every stateful economy/session contract runs against the final migrated
# schema. Historical fixtures are kept current with later invariants rather
# than being removed from the release gate when a shared table evolves.
ordinary_contracts=(
  supabase/tests/059_energy_commitment.sql
  supabase/tests/060_pending_game_session_ends.sql
  supabase/tests/061_career_spine.sql
  supabase/tests/062_competitive_clans.sql
  supabase/tests/063_run_continuity.sql
  supabase/tests/064_atomic_dynasty_favorites.sql
  supabase/tests/065_genome_v2.sql
  supabase/tests/067_player_gene_eligibility.sql
  supabase/tests/069_snake_cosmetic_loadout.sql
)

concurrency_contracts=(
  supabase/tests/061_game_reward_concurrency.sql
  supabase/tests/064_atomic_dynasty_favorites_concurrency.sql
)

for contract in "${ordinary_contracts[@]}" "${concurrency_contracts[@]}"; do
  if [ ! -f "$contract" ]; then
    echo "Required SQL contract is missing: $contract" >&2
    exit 1
  fi
done

for contract in "${ordinary_contracts[@]}"; do
  echo "Running isolated SQL contract: $contract"
  psql "$database_url" -X -v ON_ERROR_STOP=1 -f "$contract"
done

for contract in "${concurrency_contracts[@]}"; do
  echo "Running isolated two-connection SQL contract: $contract"
  psql "$database_url" -X -v ON_ERROR_STOP=1 \
    -v dblink_conn="$dblink_database_url" \
    -f "$contract"
done

echo "All isolated SQL contracts passed."
