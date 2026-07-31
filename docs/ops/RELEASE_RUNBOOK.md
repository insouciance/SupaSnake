# Production Release Runbook

Current player-feature baseline: Career Spine runtime
`564dbb71a83198eba796503de3334d8d4d82f48d`, deployed 2026-07-31 by workflow
run 30608676126 as `dpl_FrfgGfaDnBjjJum6NwWfgUsrSdSR`, with hosted migrations
001–061. Canonical health reports the exact release SHA, healthy database,
Career phase `ready`, bridge version 1, Career version 1, and the presentation
surface enabled. Stripe remains in sandbox/test mode.

The independently recorded outgoing deployment is
`dpl_3pxrhgn79LyLZLMKJc6Eqc3cDS2e`. It is not an application rollback target
after migration 061 because that cutover rejects its retired settlement writer.
Keep this volatile paragraph current in the release-record change; do not copy
its IDs into workflow code.

## Release law

Production releases use one safe preflight environment and one deliberate
cutover:

1. Build an ordinary Vercel **Preview** deployment. Preview deployments cannot
   own or invoke production cron jobs; Vercel cron requests target the current
   production deployment.
2. Prove the canonical alias and the complete enabled cron schedule still name
   the exact outgoing production deployment.
3. Apply only the reviewed, exact migration plan. Validate both outgoing and
   Preview runtimes on the resulting schema.
4. Create one ordinary `vercel deploy --prod` deployment. There is no
   `--prod --skip-domain` staging interval and no unsupported attempt to
   re-promote an already-current deployment merely to move cron ownership.
5. Prove the canonical alias, release SHA, cron owner, cron hosts, cron
   definitions, and enabled state all name the exact new deployment.

This cadence follows Vercel's documented distinction between Preview and
Production deployments and its documented direct production-deploy path:

- [Promoting a Preview deployment](https://vercel.com/docs/deployments/promote-preview-to-production)
- [`vercel deploy`](https://vercel.com/docs/cli/deploy)
- [How Vercel Cron targets production](https://vercel.com/docs/cron-jobs)
- [`vercel rollback`](https://vercel.com/docs/cli/rollback)

Vercel's current documentation conflicts about whether Instant Rollback updates
cron definitions: the Instant Rollback page says it does, while Managing Cron
Jobs says it does not. Therefore SupaSnake makes no automated cron-restoration
claim. A rollback is followed by an independent cron-state proof every time.

Database migrations remain forward-only. The manual GitHub workflow is the
only production mutation path; never run a separate hosted `supabase db push`.

## Preconditions

1. The release commit is the exact current head of `main`; protected Build,
   Lint, Test, isolated SQL contracts, and E2E are green. Both release jobs
   re-fetch and prove the main SHA again.
2. `docs/ops/LAUNCH_CHECKLIST.md` has no applicable no-go item.
3. Record the current canonical Vercel deployment ID and confirm Supabase
   backup/PITR.
4. Confirm the expected Stripe mode. Use `test` until the reviewed live catalog,
   webhook, and keys have all been installed.
5. Confirm the linked Supabase project ref is `gmpwyzqafoyowndbvlma`.
6. The linked migration dry-run must be empty or exactly equal the filenames
   entered at dispatch. Any extra, missing, reordered, or partial unreviewed
   migration is a stop condition.

## SQL evidence boundary

The release has two deliberately different database gates:

- `scripts/run-local-sql-contracts.sh` runs the stateful contracts introduced by
  the 062–064 bridge plus the 064 real two-connection `dblink` race. It rejects
  any database URL that is not loopback port 54322. CI runs it on a clean local
  migration replay, and the production verify job repeats it before acquiring
  production environment authority. This scope is deliberate: historical
  059/061 fixtures describe their own migration stages and predate 063's
  one-open-run invariant, so replaying them unchanged against the final schema
  is not a valid cohesive-release signal.
- `supabase/tests/cohesive_release_read_only.sql` is the only SQL contract that
  may run against the linked production project. It creates no fixtures. The
  Supabase Management API request sets `read_only: true`, while the SQL itself
  also begins `TRANSACTION READ ONLY`. It proves the seven-argument non-spending
  founding response, exact function grants, absence of duplicate favorites,
  exact trigger/function binding, validated continuity constraints, required
  indexes, and cohesive capability JSON.

Never run `062_competitive_clans.sql`, `063_run_continuity.sql`,
`064_atomic_dynasty_favorites.sql`, or the 064 concurrency test from
`supabase/tests/` against hosted production. They intentionally create and
exercise fixture state.

## Cohesive release states

The 062–064 release is allowed only through these observable states.

### A. Pre-bridge

- Hosted schema: 001–061.
- Canonical alias: exact outgoing production deployment.
- Cron owner and every cron host: exact outgoing deployment.
- Cron definitions: byte-equivalent normalized `{path, schedule}` set from
  `vercel.json`; enabled.
- Incoming artifact: Preview target only, exact release SHA; never a production
  cron owner.

If any check fails here, stop. No hosted migration has been attempted.

### B. Post-migration, pre-production

- Hosted schema: 001–064, or the recognized forward-only partial state while a
  failed push is being investigated.
- Canonical alias and cron state: still exactly outgoing.
- Outgoing application: healthy on the bridge schema.
- Preview: healthy with exact release SHA, Career ready, Run Flow on, and all
  cohesive capability versions at 1.
- Read-only linked structural probe: passed.

Migration 062's seven-argument compatibility function cannot create a clan or
spend DNA. Migration 063 preserves legacy sessions while adding continuity.
Migration 064 enforces one favorite per dynasty even for the outgoing direct
writer. These reviewed bridges are why the outgoing application remains valid
while the new release is still only Preview.

If the workflow stops here, production traffic and cron remain outgoing. Do not
reverse migrations; forward-fix and retry with the exact ordered pending suffix
(`063,064`, `064`, or `none` after all three committed).

### C. Post-cutover

- Hosted schema: 001–064.
- Canonical alias: exact deployment ID and host returned by the deliberate
  Production deployment.
- Canonical health: exact Git SHA, database healthy, Career ready, Run Flow on,
  and cohesive capability versions at 1.
- Cron owner and every cron host: exact new deployment.
- Cron definitions: unchanged normalized hash from the outgoing snapshot;
  enabled.

The release is complete only when all of these facts are true together.

## Automated sequence

Dispatch **Deploy to Production** on `main`, type `DEPLOY`, select the Stripe
mode, and enter the exact comma-separated pending migration filenames in
`expected_migrations`. Use `none` only when dry-run output must be empty.

The workflow performs:

1. Full Jest coverage, type check, lint, blocking production-dependency audit,
   and reported dev-tool audit.
2. Clean local Supabase replay and all ordinary/two-session SQL contracts.
3. Production environment presence and payment-mode validation.
4. Linked migration dry-run and exact migration classification.
5. Exact outgoing canonical deployment and cron snapshot.
6. Ordinary Preview deployment and target verification (`preview`, never
   `production`). It then re-proves canonical and cron are unchanged.
7. For 062–064 initial/resume, exact bridge push and linked lint. For future
   ordinary additive migrations, Preview is first smoked on the old schema,
   then the exact migration set is pushed and linted.
8. Hosted read-only cohesive structural probe.
9. A second proof that canonical alias and cron remain exactly outgoing after
   all schema work.
10. Outgoing health and exact Preview health on the final schema.
11. One deliberate `vercel deploy --prod`; production values are decrypted and
    validated in Vercel's cloud build.
12. Exact new deployment inspection, canonical alias proof, cron owner/host/
    definition/enabled proof, and final health.
13. An always-on, read-only state classifier. If the CLI result was ambiguous,
    it records whether production is still exactly outgoing, clearly cut over
    to the new SHA, or mixed/unknown. It never changes aliases or crons.

## Failure and recovery

| Failure state | Required response |
|---|---|
| Verification, local SQL, environment, migration dry-run, outgoing snapshot, or Preview build fails | Stop. Hosted schema and production are unchanged. |
| Preview smoke fails before a standard migration | Stop. No hosted mutation occurred. |
| 062–064 push/lint/read-only probe fails | Do not create a Production deployment. Preserve forward-only state, confirm canonical and cron still exact outgoing, then forward-fix or use only the recognized ordered suffix. |
| Post-bridge outgoing or Preview smoke fails | Do not create a Production deployment. Schema is additive; production and cron remain outgoing. Forward-fix. |
| Production build fails and state classifier proves outgoing alias + outgoing cron | Safe pre-cutover stop. Investigate build and retry; never “restore” what did not move. |
| Production command returns ambiguously but live health reports the new SHA and cron exactly follows that canonical deployment | Treat as a post-cutover production incident. Freeze releases and inspect logs; do not promote outgoing. |
| Alias, cron owner, cron hosts, definitions, or enabled state are mixed/unknown | Freeze deployment automation. Record all IDs and hashes, inspect Vercel dashboard/API, and restore one coherent state under operator control. |
| Final new-release health fails | Because 062–064 are reviewed as outgoing-compatible, the operator may use `vercel rollback <outgoing-url>` only after confirming the current failure is application-only. Then independently prove canonical ID/host, health, cron owner/hosts/definitions/enabled. If any proof fails, forward-fix rather than improvising aliases. |

Do not use `vercel promote <outgoing>` as rollback. A deployment that was
already Current cannot be promoted again under Vercel's documented production
state model; `vercel rollback` is the supported operation for a previously
served production deployment. A rollback never reverts Supabase migrations or
environment changes.

After any rollback, record that Vercel disables automatic production-domain
assignment until rollback is undone. The next release must explicitly inspect
that state and may require `vercel promote` to undo rollback before normal
auto-assignment resumes.

## Repository-only mainline reconciliation

When production was deployed from a reviewed release branch before `main` was
updated:

1. Prove `origin/main` is an ancestor of the release line and record both SHAs.
2. Run the complete local and pull-request gates.
3. Preserve the deployed runtime commit identity; do not squash or rebase it.
4. Update `main` without dispatching **Deploy to Production**.
5. Wait for post-main CI and confirm canonical health.
6. Verify Vercel canonical identity, hosted migration history, and cron state did
   not change as a side effect of repository reconciliation.

## Post-release smoke

- Home, guest/login, Setup, committed run start/continue/end, and Victory Lap
- Collection favorite, compact lineage, breeding, and Genome-enabled run
- Clan discovery, confirmed founding quote, applications, roles, and Glory
- `/api/health` exact release and capability contract
- Missing/incorrect bearer receives 401 on every cron endpoint
- Discord outbox and Analyst routes return counts only
- Registered deletion schedules and sign-in cancellation; never execute real
  immediate deletion against an operator account
- Sentry release and PostHog consent behavior

## Stripe test-to-live transition

Treat the switch as a separate reviewed release:

1. Create/verify only the live EUR tax-inclusive product and price versions in
   the reviewed release catalog.
2. Replace publishable key, secret key, webhook secret, and exact active Price
   IDs in the Vercel production environment together.
3. Keep old test prices active until the first live deployment succeeds; old
   deployments embed public Price IDs.
4. Dispatch with `payments_mode=live`; the production cloud build must validate
   the decrypted live contract before it can cut over.
5. Perform one approved real purchase/refund, verify idempotent entitlement,
   restoration, refund, consent, and tax records, then monitor webhooks/Sentry.

## Hosted development boundary

Vercel Preview intentionally shares the existing hosted Supabase project and
Stripe sandbox. Use it only for non-destructive release smoke. CI/E2E uses an
isolated local Supabase stack; never run fixture SQL, destructive resets,
payment lifecycle automation, or account-erasure E2E against hosted production.
