# The one place the Supabase CLI version lives. SOURCE this file; do not run it.
#
# WHY A PIN AT ALL
#
# An older CLI does not merely lag - it cannot read this repository. 2.65.5
# rejects supabase/config.toml outright over the `local_smtp` key and cannot
# apply migration 061, and both failures present as repository bugs rather than
# as a stale tool. CI has always been pinned, via `supabase/setup-cli` in the
# workflows; local machines were not pinned at all, so "works in CI, broken on
# my laptop" was the expected outcome rather than a surprise.
#
# HOW IT RESOLVES
#
# CI installs the pinned CLI with supabase/setup-cli, so `supabase` on PATH is
# already the correct build and is used directly - no download, no change in
# behaviour. Anywhere else, or wherever the installed CLI is a different build,
# this falls back to `npx supabase@<pin>`, matching the `npx vercel@56.3.1`
# convention the deploy workflow already uses.
#
# Keep SUPABASE_CLI_VERSION equal to the `version:` of every
# `supabase/setup-cli` step; scripts/isolated-supabase.test.js enforces that.

SUPABASE_CLI_VERSION='2.109.1'

# Run the pinned Supabase CLI: `supabase_cli start`, `supabase_cli db reset`, …
supabase_cli() {
  if [ -z "${SUPABASE_CLI_COMMAND:-}" ]; then
    local found=''
    if command -v supabase >/dev/null 2>&1; then
      found="$(supabase --version 2>/dev/null | head -n1 | tr -dc '0-9.')"
    fi

    if [ "$found" = "$SUPABASE_CLI_VERSION" ]; then
      SUPABASE_CLI_COMMAND='supabase'
    else
      echo "supabase-cli: using npx supabase@$SUPABASE_CLI_VERSION (on PATH: ${found:-none})" >&2
      SUPABASE_CLI_COMMAND="npx --yes supabase@$SUPABASE_CLI_VERSION"
    fi
  fi

  # Unquoted on purpose: the npx form is several words.
  # shellcheck disable=SC2086
  command $SUPABASE_CLI_COMMAND "$@"
}
