# Production Release Runbook

Current production baseline: the Wave-2 release
`fb25918d731e8f292a106e168728ca0782b78c94` — the mobile hotfix (PR 95) atop the
server-held wardrobe and migration 069 (PR 90), the modal and polish batch
(PR 91), the previous release record (PR 93) and the LF-D closure (PR 94) —
independently verified on 7 August 2026 by successful production workflow
`31158876485` (verify 07:44–08:01 UTC, deploy 08:01–08:08:53 UTC,
`expected_migrations=069_snake_cosmetic_loadout.sql`) as deployment
`dpl_EhajnU3taMWsJBDqSAG2dzEkQoWt`
(`supasnake-6wigb55k0-josef-bells-projects.vercel.app`). The outgoing anchor was
`dpl_Hamna8jet9i7EcyNpL2FRnqLkicB` on `59fb580`.

**This release moved both the schema and the public surface.** Hosted migrations
went from 001–068 to **001–069**: `069_snake_cosmetic_loadout.sql` applied under
the reviewed `snake-cosmetic-loadout` rollout classifier, and its notice
recorded “2 snake cosmetic definitions now in the catalog (face + crown),
0 food skins by design”. The public surface went from 23 flags to **24** with
`NEXT_PUBLIC_SNAKE_COSMETICS`, and `contractHash` equals `declaredHash` at
`e60cd71ee0ca67a5be81d165b26d0bf8eab337319276862367a9f2b89d158017`, computed
independently from the checked-in manifest before dispatch. Canonical health
reports the exact release SHA, healthy database, project ref
`gmpwyzqafoyowndbvlma`, and Genome schema/catalog/Ascendance 2/2/2 with eight
Splices, rules version 2, and neutral 2/3/4 Strain thresholds.

The wardrobe was proved at runtime: `/api/player/cosmetics` and its `/equip`
child both answer 401 rather than 404, so the routes exist and are merely
unauthenticated; neither route existed at `59fb580`. **Name the discriminator
correctly** — the cosmetics chamber itself predates this release and ran off a
client-side `EQUIPPED_LOADOUT` constant. What shipped here is the *server-held*
wardrobe, so "the chamber renders" is not evidence of this release and the two
routes are.

The dedicated read-only probe remains `cohesive_release_read_only_v5` and came
back green on all 16 sentinels; PR 90 and PR 94 did not change the probe, which
was verified at the release SHA. Canonical alias, cron owner, and every cron
host name the same READY production deployment; cron is enabled and its
normalized definition hash remains
`a59e17b1817d6a84747db483b6adfb8f8ed3de7f3613e459530cefa9491aaeaf`.
Stripe remains in sandbox/test mode. The deploy workflow's reviewed rollout
allowlist holds six contracts — `genome-v2-initial`, `genome-v2-resume`,
`settlement-payload-bounds`, `player-gene-eligibility`,
`settlement-sweep-primary` and `snake-cosmetic-loadout` — the sixth exercised
end to end for the first time by this run.

**The engine rules version is unchanged at `snake-rules-2026-08-05.2`**, and the
rules chunk `2894-433978b3ede14d00.js` kept a byte-identical filename hash
across the cutover for the **third consecutive release**. This train therefore
has no run-continuity boundary: open runs crossed it seamlessly, with no
`incompatible` phase and no recovery path. A schema and flag change is not by
itself a continuity boundary; only the rules version is.

### Rollback shape for a migration-bearing release

This release has a **migration boundary**, and it behaves differently from the
flag and rules boundaries described elsewhere in this runbook.

Migration 069 **stays applied** on any rollback. It is purely additive, and the
workflow proved the outgoing application healthy against the post-069 schema at
its "Verify outgoing application on final bridge schema" step before cutover —
so the previous artifact is known to run correctly on 001–069, not merely
assumed to. A rollback here is therefore **deployment-level only**: return the
alias to `dpl_Hamna8jet9i7EcyNpL2FRnqLkicB` and leave the schema alone. Never
attempt to reverse 069; migrations are forward-only.

Removing the wardrobe from players is a *different* operation from rolling back
the deployment: it is a reviewed forward release with the flag off, per the
flag-off caveat below, and it removes the wardrobe only.

### The 069 header's release-order note is wrong

`supabase/migrations/069_snake_cosmetic_loadout.sql` carries a header stating
“Release order is DEPLOY THE APP FIRST, THEN APPLY THIS”. That is **not** what
this repository's deploy workflow does, and not what happened.

`deploy-production.yml` is migration-first: it applies the reviewed migration
rollout, then verifies the outgoing application against the resulting bridge
schema, and only then creates the Production deployment and cuts over. The
header describes an app-first order that the automated sequence does not offer.

Migration-first was safe here because 069 is purely additive — the outgoing app
neither reads nor writes the new objects — and the run proved it: the
bridge-schema health check passed with the outgoing artifact still canonical.
The header is a stale instruction, not a live hazard.

**The correction lives here rather than in the migration.** `AGENTS.md` forbids
editing a migration that is already merged or deployed, and 069 is both; a
docs-only record is not the place to make an exception to that rule. Read the
header as superseded by this section.

### What a rules bump does to a run in flight

Say this precisely, because the loose phrasing — “active runs replay under the
old version” — is wrong and would mislead a future operator.

A run whose `start_request_id` is set and whose `simulation_rules_version` no
longer matches `SNAKE_RULES_VERSION` resolves to phase `incompatible`
(`src/lib/server/runContinuity.ts`). `incompatible` is neither `prepared` nor
`active`, so `canContinue` is false and `requiresAbandon` is true: the player is
routed to recovery rather than silently resumed under rules the checkpoint was
not derived from. `src/app/api/game/session/route.ts` classifies the same
condition the same way on the abandon path.

**Earned value is never invalidated by the bump.** The phase resolution puts
`settling` and `terminal` ahead of the version comparison, so a completed run
with no terminal timestamp stays `settling` and an already-terminal outcome
stays `terminal` — and `requiresAbandon` explicitly excludes both. Terminal
facts remain immutable server truth derived under their own stamped engine
version, and the settlement sweep from migration 068 settles them unaided,
without the player's tab.

What is *not* solved is seamless continuation: a player mid-run across a bump
loses that run's continuation and goes through recovery. That is the open CE-6
item (FM-12), and it is a known gap rather than a property of this release.

The live interaction-v2 contract uses optional physical Gene relics on a
deterministic 8 ± 2-food cadence; already-issued or omitted interaction stamps
retain automatic-offer v1 compatibility. The now-previous deployment
`dpl_Hamna8jet9i7EcyNpL2FRnqLkicB` (`59fb580`) is the artifact-level rollback
candidate. It shares the same rules version, so rolling back crosses no
run-continuity boundary and interrupts no run in flight — but it predates
migration 069 and serves the **23-flag** surface at hash `ac678998…e2be`. As set
out above, 069 stays applied and the outgoing artifact was proven healthy
against it, so the rollback is deployment-level only; what it gives up is the
server-held wardrobe, the modal and polish batch, and the mobile hotfix. The
artifact before it (`dpl_6SMXi6Ke6APYWdS6wm3T2efxR3Na`, `03d185a`) additionally
gives up the INK & AMBER presentation and the adaptive-quality governor. Going
back to (`dpl_5e1E1JEjrxd6wg55zCs83g3Q7rF1`, `4e51e81`) serves
`snake-rules-2026-08-05.1`, so a rollback that far *is* a rules change: runs
checkpointed under `.2` would resolve as `incompatible` and be routed to
recovery, exactly as described above, while terminal and settling outcomes stay
safe. It also gives up the CYBER connectivity guarantee, the 8 ± 2 relic
cadence, and the food-wave and portal fairness fixes. Going back further
(`dpl_Ad2ayZ2xdANctBKpcLk2q9vygL3M`, `28d21f1`) additionally serves the
**22-flag** surface, so that is a public contract change in its
own right and withdraws the curriculum from every player mid-journey. Older
artifacts additionally restore the
stranded-settlement trap that
hard-blocked two production accounts behind the “Result secured” modal
(`dpl_CLE4n4uQVw7kYopCpavA5miY8yuT`, `2fe33ca`), the fatal Gilded Fork
rejection for Gene-only golden food (`dpl_6LcpMZ3ZADXSYv9bdQKv2U3sovkw`,
`4fb6271`) and the blocking reconnect surface, session-unbound terminal
settlement, and pre-fix five-star wave preflight
(`dpl_EjXZeApTYFtuc7RFitTWkgHtpWqQ`, `8bb3ef9`). The retired pre-Genome
deployment
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

## Addendum: the Genome Discovery flag-on release (WP-F)

This addendum governed exactly one release — the one that first shipped
`NEXT_PUBLIC_PLAYER_EVOLUTION_V1` as a live public surface. **That release has
now happened** (`4e51e817b7ceb802530c35ffb8399afaa6b2fc3a`, workflow
`30992325611`): the flag is now an ordinary manifest entry and the standard
sequence above applies again. The addendum is kept as the record of the first
public-surface contract change, with its one wrong instruction corrected below.

### What changes, and what does not

The manifest goes from 22 flags to 23, so the deterministic public-surface
hash changes from
`8bf7f5634d0e36982326920668c1f5a8e79df5f9cdf402c66925899509e0fd99` to
`ac678998f5c58d0a1cab711e759271f426d2fa5b09a503bf20094406ffd8e2be`. Recompute
rather than copy:

```sh
node scripts/production-public-surface-cli.mjs hash
```

**No migration and no backfill.** The curriculum's table, RPCs and backfill
shipped dormant in migration 067 (the `bf3020c` train), which reported 32
graduation, 7 history-credit and 2,192 starter rows and is idempotent on
re-run. This release changes only which artifact the flag is compiled into.

### No operator prerequisite — the manifest is the source of truth

**An earlier version of this addendum instructed the operator to create
`NEXT_PUBLIC_PLAYER_EVOLUTION_V1` and a literal `SUPASNAKE_PUBLIC_SURFACE_HASH`
in the Vercel dashboard before dispatching. That instruction was wrong, and the
release proved it wrong.** No dashboard mutation is needed, and none is wanted.

`config/production-public-surface.json` is the single source of truth for every
production-on `NEXT_PUBLIC_*` value and for the contract hash. The workflow
derives both from it, in this order:

- The "Load exact production public-surface contract" step runs
  `production-public-surface-cli.mjs github-env >> "$GITHUB_ENV"`, which writes
  every manifest flag **and** a freshly computed
  `SUPASNAKE_PUBLIC_SURFACE_HASH` into the job environment.
- Only then does "Validate production environment contract" run
  `verify:production-env`. It therefore validates against the manifest-derived
  values, not against whatever the dashboard happens to hold.
- The deployment itself receives the same values through
  `production-public-surface-cli.mjs vercel-args`, which emits matched
  `--build-env`/`--env` pairs for the build-time inlining and the runtime read.

The evidence that no dashboard entry is required is not only structural: no
dashboard variable ever existed for `NEXT_PUBLIC_GENOME_V2`, and it shipped and
survived five releases this way.

Do **not** pin the hash as a literal in the dashboard. A pinned hash is a
stale-hash trap: the next manifest change recomputes the real hash and the
pinned copy then fails the release for no reason, or worse, has to be chased by
hand on every future contract change. Recompute it instead, and only for
reading:

```sh
node scripts/production-public-surface-cli.mjs hash
```

### Proof after cutover

Canonical `/api/health` must report `publicSurface.status = healthy`,
`enabledFlagCount = expectedFlagCount = 23`, and `contractHash` equal to the
hash above. `/api/release-contract` must report the same hash from the
anonymous surface. A 22/22 count or the old hash after cutover means the
environment, not the code, is wrong — treat it as a failed release health check
under "Failure and recovery" and do not roll back the application.

This passed on the actual cutover: 23/23 with an empty `disabledFlags`, the new
hash, and no dashboard variable having been created.

### Rollback: flag-off is a forward release, and a full pool

`NEXT_PUBLIC_PLAYER_EVOLUTION_V1` is a **build-time rollout boundary, not an
instantaneous kill switch** — the same shape as `NEXT_PUBLIC_GENOME_V2` above,
and it is handled the same way. An emergency flag-off requires one reviewed
forward release of the same dual-version code:

1. Remove the flag from `config/production-public-surface.json`, which returns
   the manifest to 22 flags and the hash to `8bf7f563…fd99`.
2. Remove it from the Vercel Production environment, or set it to a non-`true`
   value, and set `SUPASNAKE_PUBLIC_SURFACE_HASH` back to the 22-flag hash.
3. Build and deploy through the ordinary sequence.
4. Prove that a new run composes the **complete legal Dynasty roster**.

**Flag-off is a dual-version fallback, not a data migration**, and this is what
makes it safe to do at any moment:

- `player_gene_eligibility` rows are not deleted, lowered or revoked — Rule 6
  holds through a rollback, and re-enabling the flag restores every account to
  exactly the prefix it had earned.
- A run already in flight settles under the pool it was **stamped** with at
  start, because settlement reads the run's own context and never recomposes a
  vocabulary. A flag flip mid-run changes the next run, never that one.
- A run started with the flag off writes the pre-curriculum context blob
  byte-for-byte, so nothing downstream can tell the difference.
- Every curriculum surface is inert with the flag off:
  `/api/genome/curriculum` answers `live: false`, the Workbench renders exactly
  today's palette, Results recommends what it recommended before, and no
  invitation is written. The `rollback` e2e leg runs the whole suite in this
  configuration, and `e2e/player-evolution.spec.ts` asserts the client never
  even requests a curriculum projection.

Never deploy an artifact older than migration 067 as a substitute for this
procedure.

### Known SQL follow-ups — neither blocks this release

Two database changes are queued for the **next Track-A migration** and are
deliberately not in this release, which carries no migration at all:

1. **The clan RPC-layer anonymous guard.** WP-E added the `is_anonymous` check
   to every clan found/join path in the API route. Pushing the same guard down
   into the RPC is defence in depth, not the fix — the route-level guard is the
   one a client actually meets.
2. **The expire-race continuity predicate.** A narrowing of the predicate that
   decides when a lease may be treated as expired.

Neither is reachable from the curriculum flag, and neither changes what this
release deploys. Record them here so the next Track-A package does not have to
rediscover them, and so a reader of this addendum does not mistake their
absence for an oversight.

### Telemetry note

The curriculum's instrumentation is consent-gated through the existing PostHog
path, so it produces nothing for a visitor who declined analytics. Every
conclusion drawn from it filters `player_cohort = 'player'` — the property is
stamped from `players.cohort` server-side, so the dev/QA/fixture accounts that
still make up most of this database do not reach a curriculum number. A
dashboard that omits that filter is reading noise, not players.

## Addendum: the LF-B home-chamber cosmetics release

This addendum governed the release that first ships
`NEXT_PUBLIC_SNAKE_COSMETICS`
— the home cosmetics menu, or wardrobe — as a live public surface. **That
release has now happened** (`fb25918d731e8f292a106e168728ca0782b78c94`, workflow
`31158876485`): migration 069 is applied, the deployed artifact serves the
24-flag surface at hash
`e60cd71ee0ca67a5be81d165b26d0bf8eab337319276862367a9f2b89d158017`, and every
24-flag statement in this repository is now a live fact rather than a checked-in
intention. The flag is an ordinary manifest entry from here on and the standard
sequence applies again; the addendum is kept as the record of the second
public-surface contract change.

### What changes, and what does not

The manifest goes from 23 flags to 24, so the deterministic public-surface hash
changes from
`ac678998f5c58d0a1cab711e759271f426d2fa5b09a503bf20094406ffd8e2be` to
`e60cd71ee0ca67a5be81d165b26d0bf8eab337319276862367a9f2b89d158017`. Recompute
rather than copy:

```sh
node scripts/production-public-surface-cli.mjs hash
```

**This release does carry a migration**, unlike the WP-F flag-on release: the
exact single-file plan `069_snake_cosmetic_loadout.sql`, under the reviewed
rollout contract `snake-cosmetic-loadout` already held in the deploy workflow's
allowlist. Enter that filename verbatim in `expected_migrations` at dispatch.
What 069 changes, what it deliberately does not touch, and why it moves no cron
definition are recorded in step 7 of the Automated sequence above; do not restate
its scope here.

### No dashboard prerequisite — the manifest is still the source of truth

The rule the WP-F addendum records applies unchanged, and for the same code
reason. The workflow's "Load exact production public-surface contract" step runs
`production-public-surface-cli.mjs github-env >> "$GITHUB_ENV"`, writing every
manifest flag **and** a freshly computed `SUPASNAKE_PUBLIC_SURFACE_HASH` into the
job environment *before* "Validate production environment contract" runs
`verify:production-env`; the deployment then receives the same manifest-derived
values through `production-public-surface-cli.mjs vercel-args`. So **no operator
has to create `NEXT_PUBLIC_SNAKE_COSMETICS=true` in the Vercel dashboard before
dispatch, and no operator has to set the new hash there.** Do not reissue the
instruction that was corrected above for `NEXT_PUBLIC_PLAYER_EVOLUTION_V1`.

One thing does need checking before dispatch, and it is the inverse of that
instruction. **If a literal `SUPASNAKE_PUBLIC_SURFACE_HASH` or a
`NEXT_PUBLIC_SNAKE_COSMETICS` value was ever pinned in the Vercel Production
dashboard, remove it.** `verify-production-env.mjs` builds its environment as
`{...process.env}` and then overlays the pulled `.vercel/.env.production.local`
on top, so a pinned dashboard value wins over the freshly computed one: a
dashboard hash still holding `ac678998…e2be` would fail the exact-match check
against the new 24-flag hash and stop the release. No such variable was ever
created for `NEXT_PUBLIC_GENOME_V2` or `NEXT_PUBLIC_PLAYER_EVOLUTION_V1`.
Confirm the same is true here, and then change nothing.

### Proof after cutover

Canonical `/api/health` must report `publicSurface.status = healthy`,
`enabledFlagCount = expectedFlagCount = 24`, and `contractHash` equal to
`e60cd71ee0ca67a5be81d165b26d0bf8eab337319276862367a9f2b89d158017`.
`/api/release-contract` must report the same hash from the anonymous surface. A
23/23 count or the old hash *after* cutover means the environment, not the code,
is wrong — treat it as a failed release health check under "Failure and
recovery" and do not roll back the application. *Before* cutover, 23/23 and
`ac678998…e2be` are the correct and expected answers, and neither is a defect.

This passed on the actual cutover: 24/24 at
`e60cd71ee0ca67a5be81d165b26d0bf8eab337319276862367a9f2b89d158017`, with the
wardrobe routes answering 401 rather than 404.

### Rollback: flag-off is a forward release, and it removes the wardrobe only

`NEXT_PUBLIC_SNAKE_COSMETICS` is a **build-time rollout boundary, not an
instantaneous kill switch** — the same shape as `NEXT_PUBLIC_GENOME_V2` and
`NEXT_PUBLIC_PLAYER_EVOLUTION_V1`, and handled the same way. An emergency
flag-off is one reviewed forward release:

1. Remove the flag from `config/production-public-surface.json`, which returns
   the manifest to 23 flags and the hash to `ac678998…e2be`.
2. Remove it from the Vercel Production environment if one was ever set there,
   or set it to a non-`true` value, and leave the contract hash to the workflow
   rather than pinning the 23-flag literal.
3. Build and deploy through the ordinary sequence.

Migration 069 stays applied; it is forward-only and additive, and the flag-off
artifact does not need it absent. With the flag off, Home renders as it did
before LF-B and the snake is not a tap target, but the loadout is still read and
still rendered, because the database is the authority either way. Rolling back
removes the wardrobe, never the clothes: no owned row in `player_cosmetics` and
no selection in `player_loadout` is deleted, so re-enabling the flag restores
every player to exactly the loadout they had.

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
  identities, hardened Genome definers, the complete API-role table
  privilege boundary (including TRUNCATE/TRIGGER/REFERENCES denial), and the
  aligned 262144 settlement payload bounds. That last check exists because
  migration 066 patches the practice-run bound through a `DO` block that
  returns quietly when it cannot find the old literal, so a successful push is
  not by itself proof that the stranding bound is gone. It additionally proves
  the migration 067 curriculum contract — identity key, RLS with a single
  own-row read policy and no write policy, every named CHECK, the browser-role
  write denial, and the seven service-only definers — conditionally on the
  table existing, because 067 is deploy-order-agnostic by design and the probe
  also runs on releases that precede it. What is asserted is that IF the table
  exists it has exactly that shape, including the complete browser-role
  boundary: `authenticated` holds exactly SELECT, `anon` holds nothing, and
  neither role nor `PUBLIC` can execute any of the seven RPCs. That boundary is
  asserted as **effective privilege** rather than as ACL contents. The
  migration's own contract tests assert the ACL, because a CLI-applied local
  database is applied by `postgres`, is born without the browser-role grants
  that `supabase_admin`'s default ACL would add, and therefore cannot reproduce
  the hazard. The hosted probe is in the opposite position: the effect is what
  is observable and what matters, and `has_*_privilege` resolves defaults,
  PUBLIC grants, explicit grants and role inheritance together. It is a
  regression gate on the boundary, not proof that a particular REVOKE was
  written. The immediately
  preceding empty linked migration-plan proof remains the authority for the
  062/063/064/065/066/067 ledger. Pure Genome projector behavior is exercised
  by the service-only capability and local stateful contract; the hosted probe
  remains structural and never invokes an application function.

Never run `062_competitive_clans.sql`, `063_run_continuity.sql`,
`064_atomic_dynasty_favorites.sql`, `065_genome_v2.sql`, or the 064 concurrency
test from `supabase/tests/` against hosted production. They intentionally create
and exercise fixture state.

## Cohesive release states

The A/B/C state machine below records the completed first Genome v2 cutover and
remains the recovery and incident-classification contract for a linked project
that genuinely lacks migration 065. It is not the ordinary state machine for
later application-only releases. Future releases start from the current 001–069
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

- Hosted schema: 001–069, or the recognized forward-only partial state while a
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

- Hosted schema: 001–069.
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
7. Immediate current-main, exact-SHA CI, and pending-plan revalidation; the
   reviewed rollout push and linked lint. The recognized rollouts are the exact
   062–065 initial/resume suffix, the exact single-file
   `066_settlement_payload_bounds.sql` plan, the exact single-file
   `067_player_gene_eligibility.sql` plan, the exact single-file
   `068_settlement_sweep_primary.sql` plan, and the exact single-file
   `069_snake_cosmetic_loadout.sql` plan; each is named explicitly by the
   apply and validate steps, and any other plan stops at classification.
   Contracts are written for plans this workflow can actually observe. It
   dry-runs only after `supabase link` against the production project ref, and
   refuses any other ref before linking, so a combined plan that exists solely
   in a fresh replay of the whole migration set is not a rollout contract and
   is deliberately absent from the allowlist.
   `068` redefines `list_pending_game_progression_sessions` (dropped and
   recreated, because its return type gains the attempt count), adds
   `list_stranded_terminal_runs` and `settlement_recovery_backoff`, and adds
   one partial index. It moves no value and rewrites no row: the only UPDATE
   it performs stamps a recovery attempt and counts up. **It changes no cron
   definition** — the settlement sweep keeps its `*/10 * * * *` schedule, so
   `EXPECTED_CRON_DEFINITIONS_SHA` is unaffected and every cron proof in this
   procedure holds unchanged.
   `069` extends the cosmetic slot vocabulary to `face`, `crown` and
   `food_skin` (each CHECK dropped by its 022 name and re-added whole, never a
   second constraint alongside), adds `default_owned` and `supporter_only` to
   `cosmetic_definitions`, seeds two free snake cosmetics
   (`face_shades_deadpan`, `crown_braids_amber`), adds the read RPCs
   `read_snake_loadout` and `read_snake_cosmetic_catalog`, and re-creates
   `equip_cosmetic` so it serves the new slots, resolves ownership through
   `default_owned` instead of a hardcoded banner id, and pins `search_path`.
   It also closes a policy-without-GRANT gap open since 022: `player_cosmetics`
   and `player_loadout` carried own-row SELECT policies with no matching table
   grant, so those reads were unreachable; both are revoked and re-granted
   `SELECT` to `authenticated` only. It moves no value and rewrites no player
   row: the only UPDATE it performs backfills the catalog flag that replaces
   the `banner_hatchery_standard` literal, and unequip deletes a selection from
   `player_loadout` while the owned row in `player_cosmetics` is never touched.
   **It changes no cron definition** — no schedule is added, removed or
   retimed, so `EXPECTED_CRON_DEFINITIONS_SHA` is unaffected and every cron
   proof in this procedure holds unchanged. Release order is deploy the app
   first, then apply: the app degrades to "no snake cosmetics" while the RPCs
   are absent, so a deploy that precedes this file is a quiet no-op.
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
| A reviewed rollout push, lint, or read-only probe fails | Do not create a Production deployment. Preserve forward-only state, confirm canonical and cron still exact outgoing, then forward-fix or use only the recognized ordered suffix. |
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
