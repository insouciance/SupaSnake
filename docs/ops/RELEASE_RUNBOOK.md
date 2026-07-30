# Production Release Runbook

Current player-feature baseline: application runtime `abf9844` — the control
responsiveness and uninterrupted-Cosmic release, deployed 2026-07-30 by workflow
run 30534158859, deployment `dpl_3pxrhgn79LyLZLMKJc6Eqc3cDS2e` — and hosted
migrations 001–059. The migration preview and apply steps were verified no-ops,
linked database validation passed, and the canonical application/database health
check passed. Rollback anchor for this release (precondition 3):
`dpl_6T3zHoNvoHNWZG2fEMoAwkxT7bQR`, commit `61a1936`; both runtimes use the same
hosted schema.

Run 30534158859 exposed a rollback-anchor ordering defect: the workflow queried
`vercel ls --prod` after creating the staged `--prod --skip-domain` artifact and
therefore named the new artifact instead of the outgoing canonical deployment.
The workflow now resolves `supasnake.com` itself with `vercel inspect` before
staging and blocks release unless that alias names a ready production artifact.
Confirm the next release summary names the known outgoing deployment before
treating this correction as operationally proven.

Keep this paragraph current. It sat fourteen migrations stale — claiming
001–038 while Phases 0, 1 and 2 had shipped through 052 — which would have made
precondition 5 below unusable: "any extra migration is a stop condition" is only
a check if the expected list is true. Update it in the same change that
dispatches a release, and record the rollback deployment id from the Vercel
dashboard at that time (precondition 3).

Future releases stage and verify the application before applying any named
forward-only migration, then prove both the staged application and the outgoing
canonical application against the migrated schema before promotion. The manual
GitHub workflow encodes this order; do not run `supabase db push` independently.
A repository-only merge that reconciles `main` with an already-live artifact is
not a production deployment.

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

Dispatch **Deploy to Production** on `main`, type `DEPLOY`, select the Stripe
mode, and enter the exact comma-separated pending migration filenames in
`expected_migrations` (`none` only when the dry-run must be empty). The workflow
performs:

1. Unit tests, type check, lint and high-severity dependency audit.
2. Vercel Sensitive-variable presence validation.
3. Supabase link and migration dry-run (no state change), mechanically matched
   to the dispatch's exact `expected_migrations` filenames (`none` for a no-op).
4. A production-target cloud build. `next.config.js` validates the decrypted
   environment values and fails on wrong URL, Stripe mode, Price IDs or keys.
   The workflow explicitly compiles `NEXT_PUBLIC_CAREER_SPINE_V1=true`; the
   flag is presentation-only and never gates settlement or earned progress.
5. A staged `--prod --skip-domain` deployment and authenticated health check
   against the current schema. Deployment protection must remain enabled.
6. Application of pending backward-compatible forward Supabase migrations and
   linked database lint.
7. A second staged health/capability-boundary check that requires the release
   SHA and Career Spine capability version against the migrated schema,
   followed by a canonical database-health check of the outgoing application.
8. Promotion of the staged build to `supasnake.com`.
9. Final canonical production health check asserting the promoted release SHA,
   Career Spine capability version, and that this artifact was compiled with
   the Career Spine presentation flag enabled.

The protected staged-health command consumes `VERCEL_TOKEN` from the job
environment. With Vercel CLI 56, do not repeat that credential as an explicit
`vercel curl --token` option: the subcommand forwards it to raw curl instead of
using it for CLI authentication.

This closes both release-boundary windows: the new application's health contract
is tested on both schemas before it can serve players, and the old application's
health contract is tested on the migrated schema before promotion. Feature-level
rolling compatibility still requires focused local/integration tests; these
health smokes do not claim to exercise every API. Every release with a pending
migration must document compatibility on both sides of the boundary. If no
migration is pending, the database step must remain a verified no-op.

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
| Initial staged health fails | Do not migrate or promote. Inspect Vercel logs. |
| Migration fails before any migration commits | Do not promote. The outgoing application remains canonical; repair and rerun the forward migration. |
| Migration partially applies | Do not promote an incompatible build. Assess migration table/state, take a backup, and forward-fix. |
| Either post-migration compatibility smoke fails | Do not promote. Keep the outgoing application canonical and forward-fix the additive schema/application boundary. |
| Promotion fails | The migrated schema and outgoing application have already passed compatibility smoke; retry promotion or investigate Vercel without reverting schema. |
| Post-migration app regression | Deploy a schema-compatible fix/revert based on the current release line; do not assume an older artifact is database-compatible. |

Database migrations are forward-only unless a separately reviewed restoration
plan proves reversal is lossless. `git revert`, Vercel Instant Rollback and a
database rollback are different operations; never assume one reverses the
others. Also note that Vercel Instant Rollback does not update cron definitions,
so verify cron state explicitly after any rollback.

## Stripe test-to-live transition

Treat the switch as a separate reviewed release:

1. Create/verify only the live EUR tax-inclusive product and price versions
   named by the reviewed release catalog. The first commercial release is
   Founding Keeper only; the current retired one-time IDs and old Premium plans
   are not a launch catalog.
2. Replace publishable key, secret key, webhook secret and the exact active Price
   IDs in the Vercel production environment together.
3. Keep old test prices active until the first live deployment succeeds; old
   deployments embed their public Price IDs.
4. Dispatch the workflow with `payments_mode=live`; cloud-build validation must
   pass before promotion.
5. Perform one approved real purchase/refund, verify idempotent entitlement,
   restoration, refund, consent and tax records, then monitor webhooks and
   Sentry.

## Hosted development boundary

Vercel Preview intentionally shares the existing hosted Supabase project and
Stripe sandbox. Use it for non-destructive hosted feedback and preserve the
operator's test data. CI/E2E uses a disposable local Supabase stack; never run
destructive resets, payment lifecycle automation, or account-erasure E2E
against the hosted project.
