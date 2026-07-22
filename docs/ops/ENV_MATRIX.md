# Environment & Credentials Matrix

Status: 2026-07-22. Values are never recorded in this file.

## Production

Vercel project: `josef-bells-projects/supasnake`. Canonical URL:
`https://supasnake.com`. Production variables are marked **Sensitive**, so
Vercel returns `[SENSITIVE]` to local pulls and decrypts the real values only
inside its cloud build/runtime.

| Area | Required variables | State |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Configured; dedicated EU (`eu-central-1`) project |
| Stripe core | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Configured in sandbox/test mode |
| Stripe catalog | Five one-time `NEXT_PUBLIC_STRIPE_*` price IDs plus `NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY` and `NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY` | Configured; EUR, tax-inclusive prices |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Configured |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Configured; EU host |
| Application | `NEXT_PUBLIC_APP_URL`, `MIN_AGE_REQUIREMENT` | `https://supasnake.com`, age 14 |
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
- Production currently has migrations 001–026. Migrations 027–036 remain a
  deliberate release batch and must not be applied before the capability-aware
  application is promoted.
- Local and CI E2E use `supabase/config.toml` and a disposable Supabase stack;
  they do not use hosted credentials or production player data.
- `DATABASE_URL` is an operator convenience only. Runtime code does not use it,
  and `scripts/run_sql.sh` now refuses to run unless it is explicitly supplied.

## GitHub Actions

Repository: `insouciance/SupaSnake` (the legacy origin redirects here).
Environment `production` is restricted to `main` and contains only deployment
credentials:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`

Application secrets remain in Vercel rather than being duplicated in GitHub.
The production workflow is manual and requires the literal confirmation
`DEPLOY` plus an expected Stripe mode.

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
