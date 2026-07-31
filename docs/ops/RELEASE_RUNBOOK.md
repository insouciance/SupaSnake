# Production Release Runbook

Current player-feature baseline: Career Spine runtime
`564dbb71a83198eba796503de3334d8d4d82f48d`, deployed 2026-07-31 by workflow
run 30608676126 as `dpl_FrfgGfaDnBjjJum6NwWfgUsrSdSR`, with hosted migrations
001–061. Canonical health reports the exact release SHA, healthy database,
Career phase `ready`, bridge version 1, Career version 1, and the presentation
surface enabled. Stripe remains in sandbox/test mode.

The independently recorded outgoing deployment is
`dpl_3pxrhgn79LyLZLMKJc6Eqc3cDS2e`. It is **not** an application rollback
target after migration 061: the cutover deliberately rejects its retired
writer. Preserve accepted server debt and forward-fix on the Career-aware
release line. Run 30608676126 operationally proved the corrected anchor order:
the workflow resolved the outgoing canonical deployment before staging, then
proved the promoted canonical alias by exact deployment ID and release SHA.

Keep this paragraph current. It sat fourteen migrations stale — claiming
001–038 while Phases 0, 1 and 2 had shipped through 052 — which would have made
precondition 5 below unusable: "any extra migration is a stop condition" is only
a check if the expected list is true. Update it in the same change that
dispatches a release, and record the rollback deployment id from the Vercel
dashboard at that time (precondition 3).

Ordinary backward-compatible releases stage and verify the application before
applying any named forward-only migration, then prove both the staged application
and the outgoing canonical application against the migrated schema before
promotion. The cohesive UX release (062–064) is a second reviewed exception:
all three migrations are explicit outgoing-runtime bridges, and they are applied
before the production-target artifact is staged. [Vercel registers cron jobs from
production deployments](https://vercel.com/docs/cron-jobs/quickstart), while
[`--skip-domain` suppresses domain promotion](https://vercel.com/docs/cli/deploy)
rather than changing the deployment target; applying the bridge schema first ensures a
cron transferred during staging cannot run incoming code against schema 061.
Migration 062 rejects the outgoing unquoted founding signature without spending,
063 preserves legacy session rows/calls, and 064 enforces one dynasty favorite for
both the outgoing direct writer and the incoming RPC. The workflow snapshots cron
definitions and deployment ownership before staging, after staging, and after
promotion. The Career settlement cutover is the other reviewed exception: migration
060 first installs a store-only bridge that is compatible with the outgoing
application; the exact incoming build is then promoted and proven on that
bridge; only after the retired 300-second settlement invocation bound plus a
60-second margin may migration 061 reject the old writer and activate atomic
settlement. The manual GitHub workflow encodes both orders; do not run
`supabase db push` independently. A repository-only merge that reconciles
`main` with an already-live artifact is not a production deployment.

## Preconditions

1. Release commit is the exact current head of `main`; Build, Lint, Test and
   isolated E2E are green. Both workflow jobs re-fetch and prove this invariant.
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
4. The current production deployment and exact cron definition/owner snapshot.
   Definitions must equal `vercel.json`, remain enabled, and belong to the
   canonical outgoing deployment.
5. For the reviewed cohesive UX set only, application and lint of exact initial
   migrations 062–064 (or an ordered recovery suffix), followed by an outgoing
   health check. The outgoing founding and favorite writers are covered by the
   bridge tests; no unquoted founding request can debit DNA.
6. For the reviewed Career pair only, application of additive migration 060
   while the outgoing application remains canonical, followed by database lint
   and an outgoing-application health check. If a previous attempt already
   committed 060, an exact `061_career_spine.sql` pending set enters the same
   flow at the bridge-resume point.
7. A production-target cloud build. `next.config.js` validates the decrypted
   environment values and fails on wrong URL, Stripe mode, Price IDs or keys.
   The workflow explicitly compiles `NEXT_PUBLIC_CAREER_SPINE_V1=true` and
   `NEXT_PUBLIC_RUN_FLOW_V1=true`. The former is presentation-only and never
   gates settlement; the latter selects cockpit Setup and the Victory Lap.
8. A staged `--prod --skip-domain` deployment, exact cron-definition/owner
   verification, and authenticated health check
   against the current schema. Deployment protection remains enabled. The
   health contract requires the exact release SHA and either `bridge` capability
   version 1 during the Career cutover or `ready` Career version 1 otherwise.
   If a later pre-promotion check fails after cron ownership moved, the workflow
   re-promotes the still-canonical outgoing artifact and proves cron restoration.
9. For ordinary backward-compatible migrations, application and lint of the
   exact pending set, followed by staged and outgoing compatibility smokes.
10. Promotion of the staged build to `supasnake.com`.
11. A canonical-alias identity check proving that Vercel resolves
   `supasnake.com` to the staged deployment ID—not merely another artifact from
   the same commit. During the Career cutover, the subsequent canonical smoke
   also proves the exact release SHA, bridge phase and presentation flags before
   the drain clock starts.
   Promotion must also move the unchanged, enabled cron schedule to the staged
   deployment ID and host; an unknown owner or changed path/schedule fails.
12. A 360-second drain of retired settlement invocations, followed by a second
    dry-run that must name only `061_career_spine.sql`.
13. Application and lint of migration 061. New earning results accepted during
    the bridge are durable server debt and are adopted by the migration/runtime
    recovery path; the browser is never part of recovery.
14. Final canonical health check requiring the promoted release SHA, database
    health, ready Career/bridge capability versions, and both required
    presentation flags.

The protected staged-health command consumes `VERCEL_TOKEN` from the job
environment. With Vercel CLI 56, do not repeat that credential as an explicit
`vercel curl --token` option: the subcommand forwards it to raw curl instead of
using it for CLI authentication.

This closes both settlement-boundary windows. No new earning result can reach an
application without its durable ingress; no retired absolute writer can overlap
the atomic guard; and the hard migration is never attempted until the canonical
alias proves it is serving the expected bridge-aware SHA. Feature-level rolling
compatibility still requires focused local/integration tests; these health
smokes do not claim to exercise every API. Every release with a pending migration
must document compatibility on both sides of the boundary. If no migration is
pending, the database step remains a verified no-op.

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
| Migration 060 or its outgoing health/lint check fails | Do not stage or promote. The outgoing application remains canonical; assess the additive migration and forward-fix. |
| Migration 062–064 or its outgoing health/lint check fails | Do not stage or promote. Preserve the forward-only partial state, use only the recognized ordered suffix on retry, and forward-fix; the outgoing bridge contracts must remain non-spending and duplicate-safe. |
| Cron snapshot or ownership verification fails | Do not continue or promote. Identify the actual production cron deployment, paths, and schedules; never assume domain rollback repaired cron ownership. |
| Staged health fails after 060 | Do not promote. The outgoing application remains compatible with the bridge; fix and rerun with exact pending migration 061. |
| Either post-migration compatibility smoke fails | Do not promote. Keep the outgoing application canonical and forward-fix the additive schema/application boundary. |
| Promotion fails | The migrated schema and outgoing application have already passed compatibility smoke; retry promotion or investigate Vercel without reverting schema. |
| Career bridge canonical smoke or drain fails | Do not apply 061. Server-accepted ends remain durable in the bridge; forward-fix or resume with exact pending migration 061. |
| Migration 061 fails or partially applies | Do not promote an old artifact. Preserve pending evidence, inspect migration history/state, take a backup, and forward-fix on the bridge-aware release line. |
| Final ready-phase smoke fails | Forward-fix from the schema-compatible release line; do not assume the outgoing artifact can safely settle on 061. |

Database migrations are forward-only unless a separately reviewed restoration
plan proves reversal is lossless. `git revert`, Vercel Instant Rollback and a
database rollback are different operations; never assume one reverses the
others. Also note that Vercel Instant Rollback does not update cron definitions,
so verify cron state explicitly after any rollback.

The recorded outgoing artifact is not an automatic rollback target once the
new Career build has accepted bridge traffic, and it is categorically
incompatible after migration 061. Accepted pending envelopes are earned server
debt: preserve them and forward-fix rather than exchanging data safety for a
fast artifact rollback.

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
