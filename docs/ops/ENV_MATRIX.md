# Environment & Credentials Matrix

Status: 2026-07-31. Values are never recorded in this file.

## Production

Vercel project: `josef-bells-projects/supasnake`. Canonical URL:
`https://supasnake.com`. Production variables are marked **Sensitive**, so
Vercel returns `[SENSITIVE]` to local pulls and decrypts the real values only
inside its cloud build/runtime.

| Area | Required variables | State |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Configured; dedicated EU (`eu-central-1`) project |
| Stripe core | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Configured in sandbox/test mode |
| Stripe catalog | Legacy one-time `NEXT_PUBLIC_STRIPE_*` names plus `NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY` and `NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY` | Configured for sandbox compatibility; the one-time source catalog is empty and the old Premium name/prices are not approved for live sale. Founding Keeper requires its own reviewed price mapping |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Configured |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Configured; EU host |
| Application | `NEXT_PUBLIC_APP_URL`, `MIN_AGE_REQUIREMENT`, `NEXT_PUBLIC_FTUE_V2`, `NEXT_PUBLIC_HUD_COCKPIT_V1`, `NEXT_PUBLIC_LADDER_V1`, `NEXT_PUBLIC_CAREER_SPINE_V1`, `NEXT_PUBLIC_RUN_FLOW_V1` | `https://supasnake.com`, age 14, FTUE v2, refined cockpit, Ladder, Career presentation, cockpit Setup, and Victory Lap enabled; Career settlement is not flag-gated |
| Optional clan tuning | `CLAN_FOUNDING_DNA_COST`, `CLAN_INVITATION_LIFETIME_SECONDS`, `CLAN_BATTLE_*`, `CLAN_GLORY_*` | Optional; absence uses reviewed launch defaults. Founding defaults to 500 DNA and rejects a stale quote; battle/Glory rewards and timing are bounded in config and SQL. Exact names and defaults live in `.env.example` |
| Discord | Client, client secret, bot token, guild, redirect URI, 32-byte token key | Configured |
| Scheduled jobs | `CRON_SECRET` | Configured; exact bearer authentication required |
| Analyst | `OPENAI_API_KEY`; optional budget/kill-switch variables | Configured |
| Digest email | `RESEND_API_KEY` | **Missing**; weekly e-mail degrades off without affecting gameplay |

Run the non-disclosing contract check after `vercel pull`:

```sh
npm run verify:production-env -- \
  --env-file .vercel/.env.production.local \
  --allow-sealed \
  --payments-mode test
```

This proves every required name is present. Exact URL, key mode, price-ID and
key-shape validation runs again inside the Vercel production build, where the
Sensitive values are available.

## Supabase

- Linked production project: `gmpwyzqafoyowndbvlma` (`supasnake`,
  `eu-central-1`).
- Production has migrations 001–061. Production workflow 30608676126 applied
  Career bridge migration 060, promoted the exact Career-aware runtime, waited
  through the retired invocation bound, then applied cutover migration 061;
  final application/database/Career health passed.
- Future pending migrations must be named in the release evidence and applied
  through the reviewed production workflow only.
- Local and CI E2E use `supabase/config.toml` and a disposable Supabase stack;
  they do not use hosted credentials or production player data.
- `DATABASE_URL` is an operator convenience only. Runtime code does not use it,
  and `scripts/run_sql.sh` now refuses to run unless it is explicitly supplied.

## GitHub Actions

Repository: `insouciance/SupaSnake`.
Environment `production` is restricted to `main` and contains only deployment
credentials:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`

Application secrets remain in Vercel rather than being duplicated in GitHub.
The production workflow is manual and requires the literal confirmation
`DEPLOY`, an expected Stripe mode, and the exact pending migration set.

## Hosted development policy

Vercel Preview intentionally points at the existing hosted Supabase project
and Stripe sandbox so development receives hosted-environment feedback. The
project currently contains operator test data only. Preserve it: never reset,
truncate, reseed, or run destructive E2E/account-deletion flows there.
Automated E2E remains isolated in the disposable local Supabase stack.

## Local development

`.env` and `.env*.local` are ignored. `.env.example` is the variable-name and
format reference. Never copy a production service-role key into a test fixture,
commit, issue, or CI log.
