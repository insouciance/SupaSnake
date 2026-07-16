# Environment & Credentials Matrix

Status as of 2026-07-16. One row per variable: where it lives, who creates it.

## Already configured ✅

| Variable | Local `.env` | Vercel (prod+preview) | Source |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | Fresh project `supasnake` (`gmpwyzqafoyowndbvlma`, eu-central-1) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | Same |
| `DATABASE_URL` | ✅ | ✅ | Session pooler; password in `.supabase-db-password` (gitignored, chmod 600) |
| `NEXT_PUBLIC_POSTHOG_HOST` | ✅ | ✅ | `https://eu.i.posthog.com` |
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ | prod: `https://supasnake.vercel.app` |
| `MIN_AGE_REQUIREMENT` | ✅ | ✅ | 13 |

Old Vercel project vars from 299 days ago were purged (none were Stripe; no Court OS leakage found).

## Needs YOU (dashboard signups/keys) — paste into `.env`, then I push to Vercel

| Service | What to do | Variables |
|---|---|---|
| **PostHog** | Create EU-cloud project "supasnake" at posthog.com → Project Settings → copy API key | `NEXT_PUBLIC_POSTHOG_KEY` |
| **Sentry** | Create project "supasnake" (platform: Next.js) → copy DSN; create org auth token (scope: project:releases) for sourcemap upload | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` |
| **Stripe** | Dashboard → account switcher → **Create new account** "SupaSnake" (NEVER reuse Court OS). Test-mode keys first; products come later with shop go-live | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` (+ webhook secret and 5 price IDs at shop go-live) |
| **Resend** | Create account → verify sending domain → SMTP credentials → paste into **Supabase Dashboard → Auth → SMTP settings** (no app env var needed) | — |

## Supabase project state

- Fresh project `supasnake` (eu-central-1), migrations 001–008 applied (004 claude_memories removed from repo), seed: 3 dynasties / 5 variants / 28 daily-reward tiers / 18 achievements.
- Old projects `snake`, `SupaSnake`, `Supe_Snake` deleted 2026-07-16.
- DB password: `.supabase-db-password` in repo root (gitignored). Also needed for `supabase link`/`db push`.
- **Auto-pause warning:** free-tier projects pause after ~1 week idle — this likely caused the historical "lost progress / broken DB" episodes. Upgrade to Pro before launch, or keep traffic/pings running.

## Vercel

- Project: `josef-bells-projects/supasnake` (linked via `.vercel/project.json`).
- Deploys: CLI (`npx vercel deploy` preview, `--prod` for production). GitHub auto-deploys can be wired with `npx vercel git connect` once repo/project mapping is wanted; the old GH-Actions deploy workflows (`deploy-staging.yml`/`deploy-production.yml`) need `VERCEL_TOKEN`/`ORG_ID`/`PROJECT_ID` secrets or should be replaced by Vercel Git integration (decision pending in WS3).
- `.npmrc` carries `legacy-peer-deps=true` until the R3F 9 / React 19 upgrade lands.
