# Production Release Runbook

Current production baseline: run-continuity, terminal-authority and Tactical
Loom runtime `4fb62712a5ecf57015aedab98cf732bfa11c69ad`, independently verified
on 3 August 2026 by successful production workflow `30853735919` (17m19s,
completed 21:31:04 UTC) as deployment `dpl_6LcpMZ3ZADXSYv9bdQKv2U3sovkw`
(`supasnake-m3mpjs2ij-josef-bells-projects.vercel.app`). This release carried no
migration; hosted migrations remain aligned through 065 with no pending plan.
Canonical health reports the exact release SHA, healthy database, project ref
`gmpwyzqafoyowndbvlma`, 22/22 public surfaces, public hash
`8bf7f5634d0e36982326920668c1f5a8e79df5f9cdf402c66925899509e0fd99`, and
Genome schema/catalog/Ascendance 2/2/2 with eight Splices, rules version 2, and
neutral 2/3/4 Strain thresholds. Canonical alias, cron owner, and every cron host
name the same READY production deployment; cron is enabled and its normalized
definition hash remains
`a59e17b1817d6a84747db483b6adfb8f8ed3de7f3613e459530cefa9491aaeaf`.
Stripe remains in sandbox/test mode.

The live interaction-v2 contract uses optional physical Gene relics on a
deterministic 6 ± 2-food cadence; already-issued or omitted interaction stamps
retain automatic-offer v1 compatibility. The now-previous deployment
`dpl_EjXZeApTYFtuc7RFitTWkgHtpWqQ` (`8bb3ef9`) is dual-version and shares hosted
schema 001–065, so it is the only artifact-level rollback candidate for this
application-only release — and it restores the blocking reconnect surface,
session-unbound terminal settlement, and the pre-fix five-star wave preflight,
so prefer a forward fix. The retired pre-Genome deployment
`dpl_EnCt6pRQPqsgWzrohK7r9oYSAssx` is still not a safe rollback target for
issued v2 sessions because it cannot resume or settle that immutable contract.
Use the dual-version, flag-off forward procedure below. Keep this volatile
paragraph current in each release-record change; do not copy its IDs into
workflow code.

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
   immediately before mutation. Until the exact outgoing Production artifact
   proves the full dual-version Genome v2 capability and corrected 2/3/4 Strain
   profile, the dedicated read-only preflight must prove before mutation and
   again immediately before Production that no durable v2 session exists.
   Validate the outgoing runtime, the hosted read-only schema contract, and the
   Preview public contract afterward.
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
7. For the first cutover, the aggregate production preflight must report zero
   Genome v2 evidence in run context, start manifest/draft, continuity
   checkpoint/terminal facts, and settled Genome. Any nonzero count stops this
   rules-version-2 release: design rules v3 or persist a frozen base-threshold
   profile instead. The workflow scopes this automatically from the exact
   outgoing artifact's Genome capability **and exact 2/3/4 application
   profile**—not from migration state—so a partial migration or older 3/4/5
   binary remains guarded while legitimate post-cutover sessions do not block
   later deployments. If outgoing Production exposes Genome v2 at all without
   the exact 2/3/4 marker, the workflow stops before the first preflight; a
   potentially writing 3/4/5 artifact cannot be treated as a legacy reader
   across two non-atomic point-in-time queries.

## SQL evidence boundary

The release has three deliberately different database gates:

- `scripts/run-local-sql-contracts.sh` runs the 059 Energy, 060 durable end,
  061 Career, 062 clan, 063 continuity, 064 favorite, and 065 Genome v2
  contracts plus both
  real two-connection races against the **final** local schema. It rejects any
  database URL that is not loopback port 54322. Later invariants require fixture
  maintenance; they never justify deleting an affected economy/session
  regression contract from the release gate.
- `supabase/tests/genome_v2_pre_release_read_only.sql` is the aggregate-only
  compatibility preflight for this first v2 cutover. Until the exact outgoing
  Production artifact proves schema/catalog/Ascendance version 2, all eight
  Splices, rules version 2, and exact Minor/Expression/Apex thresholds 2/3/4,
  it is executed twice via
  `scripts/probe-linked-genome-v2-precondition.sh`: before any schema mutation
  and immediately before Production. It checks every durable session envelope
  that can identify rules version 2 and returns counts only. A nonzero result is
  a hard stop, never a reason to rewrite or reinterpret an issued run. After a
  successful cutover the outgoing capability automatically retires this
  first-release-only premise; there is no operator bypass.
- `supabase/tests/cohesive_release_read_only.sql` is the post-bridge structural
  SQL contract permitted against the linked production project. It creates no
  fixtures and is one structural `SELECT` executed as
  `supabase_read_only_user` through the Management API's dedicated read-only
  endpoint. It proves exact function
  signatures and service-role grants without invoking those functions, absence
  of duplicate favorites, exact trigger/function binding, validated continuity
  constraints, required indexes, exact Genome catalog ids, versioned Codex
  identities, hardened Genome definers, and the complete API-role table
  privilege boundary (including TRUNCATE/TRIGGER/REFERENCES denial). The
  immediately preceding empty linked migration-plan proof remains the authority
  for the 062/063/064/065 ledger. Pure Genome projector behavior is exercised by
  the service-only capability and local stateful contract; the hosted probe
  remains structural and never invokes an application function.

Never run `062_competitive_clans.sql`, `063_run_continuity.sql`,
`064_atomic_dynasty_favorites.sql`, `065_genome_v2.sql`, or the 064 concurrency
test from `supabase/tests/` against hosted production. They intentionally create
and exercise fixture state.

## Cohesive release states

The A/B/C state machine below records the completed first Genome v2 cutover and
remains the recovery and incident-classification contract for a linked project
that genuinely lacks migration 065. It is not the ordinary state machine for
later application-only releases. Future releases start from the current 001–065
baseline and follow the Release law and Automated sequence in this runbook;
their linked migration plan is `none` unless an exact reviewed suffix is named
at dispatch.

### A. Pre-bridge

- Hosted schema: 001–064.
- Canonical alias: exact outgoing production deployment.
- Cron owner and every cron host: exact outgoing deployment.
- Cron definitions: byte-equivalent normalized `{path, schedule}` set from
  `vercel.json`; enabled.
- Incoming artifact: Preview target only, exact release SHA, exact manifest
  hash and production Supabase ref through the anonymous contract; service role
  deliberately disabled; never a production cron owner.
- First-release preflight: while outgoing Production does not yet prove both
  Genome-v2 capability and the corrected 2/3/4 application profile, zero
  durable Genome v2 sessions across all six persisted evidence locations.

If any check fails here, stop. No hosted migration has been attempted.

### B. Post-migration, pre-production

- Hosted schema: 001–065, or the recognized forward-only partial state while a
  failed push is being investigated.
- Canonical alias and cron state: still exactly outgoing.
- Outgoing application: healthy on the bridge schema.
- Preview: anonymous contract healthy with exact release SHA, exact public
  surface hash, exact project ref, and no service-role dependency.
- Read-only linked structural probe: passed.
- If the outgoing Production artifact does not yet prove Genome-v2 capability
  with the corrected 2/3/4 profile, the no-v2-session premise remains true; it
  is re-proved immediately before Production while the outgoing app remains
  legacy and Preview has no service role. Once the exact outgoing artifact
  proves both, later releases skip this first-cutover-only premise
  automatically.

Migration 062's seven-argument compatibility function cannot create a clan or
spend DNA. Migration 063 preserves legacy sessions while adding continuity.
Migration 064 enforces one favorite per dynasty even for the outgoing direct
writer. Migration 065 adds versioned Genome catalogs, discoveries, and
Ascendance functions without rewriting legacy rows or changing the outgoing
writer. These reviewed bridges are why the outgoing application remains valid
while the new release is still only Preview.

If the workflow stops here, production traffic and cron remain outgoing. Do not
reverse migrations; forward-fix and retry with the exact ordered pending suffix
(`none` on the current linked baseline; only an independently reviewed recovery
of a linked project that genuinely lacks 065 may name `065`). The linked dry-run,
never operator memory, decides.

### C. Post-cutover

- Hosted schema: 001–065.
- Canonical alias: exact deployment ID and host returned by the deliberate
  Production deployment.
- Canonical health: exact Git SHA, exact project ref/public-surface hash,
  database healthy, Career ready, Run Flow on, cohesive capability versions at
  1, and Genome capability `status=healthy`, schema/catalog/Ascendance version
  2, and eight active Splices.
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
4. Linked migration dry-run, exact release allowlist classification, exact
   outgoing Production inspection, and—until that outgoing artifact proves the
   full Genome v2 capability with the corrected 2/3/4 profile—the first
   aggregate zero-v2-session proof. Unknown migrations or premature durable v2
   evidence stop; there is no inferred generic/additive path.
5. Exact outgoing canonical deployment and cron snapshot.
6. Ordinary Preview deployment with service role disabled and target
   verification (`preview`, never `production`). Its anonymous release contract
   must prove the exact manifest/project/SHA. Canonical and cron are re-proved.
7. Immediate current-main, exact-SHA CI, and pending-plan revalidation; exact
   reviewed 062–065 initial/resume suffix push and linked lint.
8. Empty post-push dry-run and hosted read-only migration-ledger/structural probe.
9. A second proof that canonical alias and cron remain exactly outgoing after
   all schema work.
10. Exact outgoing release health and a second Preview anonymous-contract proof
    on the final schema.
11. Immediate current-main, exact-SHA CI, empty-plan proof, and, for the first
    cutover only, a second aggregate zero-v2-session proof, then one deliberate
    `vercel deploy --prod`; production values are decrypted and validated in
    Vercel's cloud build.
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
| Outgoing Production exposes Genome v2 without the exact rules-v2 2/3/4 profile | Stop before Preview or mutation. The outgoing writer is incompatible with a non-atomic threshold correction; introduce a frozen profile/rules v3 or first establish a reviewed no-write transition. |
| During the first cutover, either Genome v2 zero-session preflight is nonzero or malformed | Stop before mutation/cutover. Do not deploy 2/3/4 as rules v2; introduce rules v3 or a frozen threshold profile. |
| Preview smoke fails before a standard migration | Stop. No hosted mutation occurred. |
| 062–065 push/lint/read-only probe fails | Do not create a Production deployment. Preserve forward-only state, confirm canonical and cron still exact outgoing, then forward-fix or use only the recognized ordered suffix. |
| Post-bridge outgoing or Preview smoke fails | Do not create a Production deployment. Schema is additive; production and cron remain outgoing. Forward-fix. |
| Production command fails or returns ambiguously while alias + cron still appear outgoing | Unresolved, not a safe pre-cutover stop. Freeze releases and inspect release-SHA Production candidates until no in-flight deployment can cut over; never retry from one immediate snapshot. |
| Production command returns ambiguously but live health reports the new SHA and cron exactly follows that canonical deployment | Treat as a post-cutover production incident. Freeze releases and inspect logs; do not promote outgoing. |
| Alias, cron owner, cron hosts, definitions, or enabled state are mixed/unknown | Freeze deployment automation. Record all IDs and hashes, inspect Vercel dashboard/API, and restore one coherent state under operator control. |
| Deploy job is cancelled or times out after the Production attempt starts | Assume classification did not run. Freeze releases and manually inspect canonical ID/host/readiness/target, `/api/health` release/project/hash, and complete cron state before any retry. |
| Final new-release health fails | Freeze new starts and inspect whether any v2 session was issued. Once a v2 session exists, do **not** roll back to the outgoing application; forward-deploy the current dual-version code with Genome v2 intake disabled, preserving resume/settlement. Even before the first v2 session, prefer a forward fix and independently prove canonical ID/host, health, cron owner/hosts/definitions/enabled. |

Do not use `vercel promote <outgoing>` as rollback. A deployment that was
already Current cannot be promoted again under Vercel's documented production
state model. Although `vercel rollback` can restore a previously served
deployment, it never reverts Supabase migrations or environment changes and is
not compatible with already-issued Genome v2 sessions.

`NEXT_PUBLIC_GENOME_V2` is a build-time rollout boundary, not an instantaneous
kill switch. An emergency flag-off therefore requires one reviewed forward
release of the same dual-version code: remove the flag from the production-on
manifest, remove or set the Vercel Production value to a non-`true` value, build
and deploy, then prove that new starts receive v1 while an existing v2 session
still resumes and settles. Never deploy the outgoing pre-v2 application as a
substitute for this procedure.

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
