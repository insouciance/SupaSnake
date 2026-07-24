# Production Release Runbook

Current baseline: application runtime `645578e`, Vercel deployment
`dpl_44KnYTUmDYygkcHrrdxsnaAoqDWB`, and hosted migrations 001–038. The linked
migration dry-run is currently a no-op. The immediate application rollback is
`dpl_3raqVivFqkbEXvuWy4WUvx1RAgz6`; migration 038 remains in place because it is
forward-only and compatible with that runtime.

Future releases stage and verify the application before applying any named
forward-only migration. The manual GitHub workflow encodes this order; do not
run `supabase db push` independently. A repository-only merge that reconciles
`main` with an already-live artifact is not a production deployment.

## Preconditions

1. Release commit is on `main`; Build, Lint, Test and isolated E2E are green.
2. `docs/ops/LAUNCH_CHECKLIST.md` has no applicable no-go item.
3. Record the current Vercel deployment ID and confirm Supabase backup/PITR.
4. Confirm the expected Stripe mode. Use `test` until the reviewed live catalog,
   webhook and keys have all been installed.
5. Confirm the linked project ref is `gmpwyzqafoyowndbvlma`. Dry-run output must
   be either “Remote database is up to date” or exactly the migration list named
   in the release plan. Any extra migration is a stop condition.

## Automated sequence

Dispatch **Deploy to Production** on `main`, type `DEPLOY`, and select the Stripe
mode. The workflow performs:

1. Unit tests, type check, lint and high-severity dependency audit.
2. Vercel Sensitive-variable presence validation.
3. Supabase link and migration dry-run (no state change).
4. A production-target cloud build. `next.config.js` validates the decrypted
   environment values and fails on wrong URL, Stripe mode, Price IDs or keys.
5. A staged `--prod --skip-domain` deployment and authenticated health check
   against the current schema. Deployment protection must remain enabled.
6. Promotion of that capability-aware build to `supasnake.com`.
7. Application of pending Supabase migrations and linked database lint.
8. Canonical production health check after the migration step, including when
   that step is a no-op.

The protected staged-health command consumes `VERCEL_TOKEN` from the job
environment. With Vercel CLI 56, do not repeat that credential as an explicit
`vercel curl --token` option: the subcommand forwards it to raw curl instead of
using it for CLI authentication.

This closes the unsafe window in a capability-changing release: an older
application never serves a schema it cannot understand. Every release with a
pending migration must document compatibility on both sides of the boundary.
If no migration is pending, the database step must remain a verified no-op.

## Repository-only mainline reconciliation

When production was deployed from a reviewed release branch before `main` was
updated:

1. Prove `origin/main` is an ancestor of the release line and record both SHAs.
2. Run the complete local and pull-request gates.
3. Preserve the deployed runtime commit identity; do not squash or rebase it.
4. Update `main` without dispatching **Deploy to Production**.
5. Wait for the post-main CI checks and confirm the canonical health endpoint.
6. Verify the Vercel production alias and hosted migration history did not
   change as a side effect of the repository merge.

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
| Migration fails before any migration commits | Keep the compatible staged application only when the release plan proves that state safe; repair and rerun the forward migration. |
| Migration partially applies | Do not promote an incompatible build. Assess migration table/state, take a backup, and forward-fix. |
| Post-migration app regression | Deploy a schema-compatible fix/revert based on the current release line; do not assume an older artifact is database-compatible. |

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
