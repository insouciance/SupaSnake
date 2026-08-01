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

1. Build an ordinary Vercel **Preview** deployment. The release Preview has an
   explicitly disabled service-role value and proves only the public/anonymous
   contract at `/api/release-contract`: exact Git SHA, exact production
   Supabase project ref, anonymous connectivity, and the exact checked-in
   public-surface hash. Preview deployments cannot own or invoke production
   cron jobs; Vercel cron requests target the current production deployment.
2. Prove the canonical alias and the complete enabled cron schedule still name
   the exact outgoing production deployment.
3. Apply only the reviewed, exact migration plan. Re-prove current `main`, the
   exact SHA's successful push workflows, and the unchanged pending plan
   immediately before mutation. Validate the outgoing runtime, the hosted
   read-only schema contract, and the Preview public contract afterward.
4. Create one ordinary `vercel deploy --prod` deployment. There is no
   `--prod --skip-domain` staging interval and no unsupported attempt to
   re-promote an already-current deployment merely to move cron ownership.
5. Prove the canonical alias, release SHA, exact Supabase project and public
   surface contract, full service-only capabilities, cron owner, cron hosts,
   cron definitions, and enabled state all name the exact new deployment.

`config/production-public-surface.json` is the single release contract for
every production-on `NEXT_PUBLIC_*` surface and the production Supabase project
ref. Its deterministic SHA-256 is injected at build and runtime. The E2E
production leg, Preview, Production build validator, public contract endpoint,
and final health all consume this same manifest; no workflow carries a second
hand-maintained flag list.

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

1. The release commit is the exact current head of `main`; its **push** runs of
   Build, Lint, Test, and E2E are completed and successful. The release checks
   the GitHub Actions API fail-closed for this exact SHA before Preview, again
   before schema mutation, and again before Production.
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

- `scripts/run-local-sql-contracts.sh` runs the 059 Energy, 060 durable end,
  061 Career, 062 clan, 063 continuity, and 064 favorite contracts plus both
  real two-connection races against the **final** local schema. It rejects any
  database URL that is not loopback port 54322. Later invariants require fixture
  maintenance; they never justify deleting an affected economy/session
  regression contract from the release gate.
- `supabase/tests/cohesive_release_read_only.sql` is the only SQL contract that
  may run against the linked production project. It creates no fixtures. The
  Supabase Management API request sets `read_only: true`, while the SQL itself
  also begins `TRANSACTION READ ONLY`. It proves the seven-argument non-spending
  founding response, exact function grants, absence of duplicate favorites,
  exact trigger/function binding, validated continuity constraints, required
  indexes, exact 062/063/064 migration ledger, and cohesive capability JSON.

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
- Incoming artifact: Preview target only, exact release SHA, exact manifest
  hash and production Supabase ref through the anonymous contract; service role
  deliberately disabled; never a production cron owner.

If any check fails here, stop. No hosted migration has been attempted.

### B. Post-migration, pre-production

- Hosted schema: 001–064, or the recognized forward-only partial state while a
  failed push is being investigated.
- Canonical alias and cron state: still exactly outgoing.
- Outgoing application: healthy on the bridge schema.
- Preview: anonymous contract healthy with exact release SHA, exact public
  surface hash, exact project ref, and no service-role dependency.
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
- Canonical health: exact Git SHA, exact project ref/public-surface hash,
  database healthy, Career ready, Run Flow on, and cohesive capability versions
  at 1.
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
3. Exact manifest-driven public flags plus Production environment presence,
   exact project/hash, and payment-mode validation.
4. Linked migration dry-run and exact release allowlist classification. Unknown
   migrations stop; there is no inferred generic/additive path.
5. Exact outgoing canonical deployment and cron snapshot.
6. Ordinary Preview deployment with service role disabled and target
   verification (`preview`, never `production`). Its anonymous release contract
   must prove the exact manifest/project/SHA. Canonical and cron are re-proved.
7. Immediate current-main, exact-SHA CI, and pending-plan revalidation; exact
   062–064 initial/resume push and linked lint.
8. Empty post-push dry-run and hosted read-only migration-ledger/structural probe.
9. A second proof that canonical alias and cron remain exactly outgoing after
   all schema work.
10. Exact outgoing release health and a second Preview anonymous-contract proof
    on the final schema.
11. Immediate current-main, exact-SHA CI, and empty-plan proof, then one
    deliberate `vercel deploy --prod`; production values are decrypted and
    validated in Vercel's cloud build.
12. Exact new deployment inspection, canonical alias proof, cron owner/host/
    definition/enabled proof, and final health.
13. A best-effort `always()` read-only state classifier while the job remains
    alive. If the CLI result was ambiguous, it requires a coherent tuple of
    deployment ID/host/readiness/target, exact release, health, cron, and—on the
    new release—public project/hash. It never changes aliases or crons. After a
    Production command has started, an outgoing/outgoing snapshot is still
    unresolved: the accepted deployment may be building and cut over later.
    The workflow therefore freezes rather than calling that state safe. GitHub
    cancellation or job timeout can prevent this step and likewise always
    requires the manual incident procedure below.

## Failure and recovery

| Failure state | Required response |
|---|---|
| Verification, local SQL, environment, migration dry-run, outgoing snapshot, or Preview build fails | Stop. Hosted schema and production are unchanged. |
| Preview smoke fails before a standard migration | Stop. No hosted mutation occurred. |
| 062–064 push/lint/read-only probe fails | Do not create a Production deployment. Preserve forward-only state, confirm canonical and cron still exact outgoing, then forward-fix or use only the recognized ordered suffix. |
| Post-bridge outgoing or Preview smoke fails | Do not create a Production deployment. Schema is additive; production and cron remain outgoing. Forward-fix. |
| Production command fails or returns ambiguously while alias + cron still appear outgoing | Unresolved, not a safe pre-cutover stop. Freeze releases and inspect release-SHA Production candidates until no in-flight deployment can cut over; never retry from one immediate snapshot. |
| Production command returns ambiguously but live health reports the new SHA and cron exactly follows that canonical deployment | Treat as a post-cutover production incident. Freeze releases and inspect logs; do not promote outgoing. |
| Alias, cron owner, cron hosts, definitions, or enabled state are mixed/unknown | Freeze deployment automation. Record all IDs and hashes, inspect Vercel dashboard/API, and restore one coherent state under operator control. |
| Deploy job is cancelled or times out after the Production attempt starts | Assume classification did not run. Freeze releases and manually inspect canonical ID/host/readiness/target, `/api/health` release/project/hash, and complete cron state before any retry. |
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

The current release requires the cron definition hash to remain unchanged. A
future release that deliberately changes `vercel.json` cron definitions needs a
separate reviewed old→new manifest procedure; do not weaken the outgoing hash
check or disguise a cron change as an ordinary application release.

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

Vercel Preview uses the hosted Supabase URL and anonymous key for a single
non-destructive release-contract query. The release command replaces its
service-role value with an invalid sentinel, and no Preview health step calls a
service-only capability. CI/E2E uses an isolated local Supabase stack; never run
fixture SQL, destructive resets, payment lifecycle automation, or
account-erasure E2E against hosted production.
