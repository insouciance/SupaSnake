# Production Release Runbook

The production schema is behind the Genome-capable application. Release the
application first and database migrations second. The manual GitHub workflow
encodes this order; do not run `supabase db push` independently.

## Preconditions

1. Release commit is on `main`; Build, Lint, Test and isolated E2E are green.
2. `docs/ops/LAUNCH_CHECKLIST.md` has no applicable no-go item.
3. Record the current Vercel deployment ID and confirm Supabase backup/PITR.
4. Confirm the expected Stripe mode. Use `test` until the reviewed live catalog,
   webhook and keys have all been installed.
5. Confirm the linked project ref is `gmpwyzqafoyowndbvlma` and dry-run output is
   exactly the intended pending release (currently 027–036).

## Automated sequence

Dispatch **Deploy to Production** on `main`, type `DEPLOY`, and select the Stripe
mode. The workflow performs:

1. Unit tests, type check, lint and high-severity dependency audit.
2. Vercel Sensitive-variable presence validation.
3. Supabase link and migration dry-run (no state change).
4. A production-target cloud build. `next.config.js` validates the decrypted
   environment values and fails on wrong URL, Stripe mode, Price IDs or keys.
5. A staged `--prod --skip-domain` deployment and health check against the
   current pre-migration schema.
6. Promotion of that capability-aware build to `supasnake.com`.
7. Application of pending Supabase migrations and linked database lint.
8. Canonical production health check after migration.

This closes the unsafe window: the old pre-Genome application never serves the
post-030 schema. If migration application fails, the newly promoted app is
designed to continue operating against the old schema while the migration issue
is investigated.

## Post-release smoke

- Home, login/guest flow, game start/end, collection and active snake
- Breeding gates, lineage chips, Codex progress and a Genome-enabled run
- Shop catalog in the selected mode; no real charge during a sandbox release
- `/api/health` reports application/database healthy
- Missing/incorrect bearer receives 401 on each cron endpoint
- Discord outbox and Analyst routes return counts only
- Registered deletion schedules; sign-in cancels; do not execute a real
  immediate deletion against an operator account
- Sentry release and PostHog consent behavior

## Failure and rollback

| Failure point | Safe response |
|---|---|
| Verification, env validation, dry-run or staged build fails | Stop. Production is unchanged. |
| Staged health fails | Do not promote or migrate. Inspect Vercel logs. |
| Promotion fails | Do not migrate. Production remains on the previous alias. |
| Migration fails before any migration commits | Keep the new compatible app; repair and rerun the forward migration. |
| Migration partially applies | Do not promote a pre-Genome build. Assess migration table/state, take a backup, and forward-fix. |
| Post-migration app regression | Deploy a capability-aware fix/revert based on this release line. Do not instant-rollback to the old pre-Genome production build. |

Database migrations are forward-only unless a separately reviewed restoration
plan proves reversal is lossless. `git revert`, Vercel Instant Rollback and a
database rollback are different operations; never assume one reverses the
others. Also note that Vercel Instant Rollback does not update cron definitions,
so verify cron state explicitly after any rollback.

## Stripe test-to-live transition

Treat the switch as a separate reviewed release:

1. Create/verify seven live EUR tax-inclusive prices and the live webhook.
2. Replace publishable key, secret key, webhook secret and all Price IDs in the
   Vercel production environment together.
3. Keep old test prices active until the first live deployment succeeds; old
   deployments embed their public Price IDs.
4. Dispatch the workflow with `payments_mode=live`; cloud-build validation must
   pass before promotion.
5. Perform one low-value real purchase/refund with accounting approval, verify
   idempotent credit and tax records, then monitor webhooks and Sentry.

## Hosted development boundary

Vercel Preview intentionally shares the existing hosted Supabase project and
Stripe sandbox. Use it for non-destructive hosted feedback and preserve the
operator's test data. CI/E2E uses a disposable local Supabase stack; never run
destructive resets, payment lifecycle automation, or account-erasure E2E
against the hosted project.
