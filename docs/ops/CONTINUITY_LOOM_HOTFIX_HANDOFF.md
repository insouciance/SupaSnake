# Continuity, Phantom-Crash, Fluidity, and Tactical Loom Hotfix Handoff

**Status:** implementation complete; final broad validation, integration, and
production release still in progress

**Feature branch:** `feat/continuity-loom-hotfix`

**Worktree:**
`/Volumes/Souci_WD/Dev/active/SupaSnake-worktrees/continuity-loom-hotfix`

**Starting SHA:** `cf4b76e12d924105a302681912591805c2d93dcc`

**Database migrations:** none

**Hosted state changed:** no

**Production deployed:** no

This document is intentionally self-contained. A replacement integration agent
must read `AGENTS.md`, `docs/README.md`, `PLATFORM_STATUS.md`, and
`docs/ops/RELEASE_RUNBOOK.md`, then continue in the worktree and branch above.
Do not reconstruct the assignment from chat history.

## 1. Player-reported release blockers covered

The hotfix addresses one connected failure cluster:

1. A resumed run could be interrupted every few seconds by a blocking
   **Try Connection** surface that could become impossible to dismiss.
2. Checkpoint failures and wall-clock time after a browser/process interruption
   could make an otherwise valid resumed run effectively unplayable.
3. COSMIC could report a crash without visible contact. The deterministic
   engine could throw while resolving a five-star wave after partially mutating
   state, allowing the client to proceed into a misleading terminal frame.
4. The Tactical Loom darkened the board, could clip beyond the right edge on
   mobile, changed outer geometry when details opened, and used a visually cheap
   dark action tray.
5. Result and other modal action rows used dark sticky backing bars.
6. Late-run performance could stutter because the full Genome state was deeply
   cloned and mirrored repeatedly on every movement tick and because multiple
   checkpoint owners serialized the same decision boundary.
7. Terminal direct, retry, duplicate, account-switch, Free Play, and reload
   paths did not all require the same exact session-bound server authority
   before showing a result.

The already-shipped snake/fog/material work was audited separately. Current
`origin/main` already contains the near-cubic opaque bright snake, interpolation,
stable long-body rendering, analytical dim board wash, and brighter physical
walls from commit `8bb3ef9`. No speculative duplicate visual edit was made in
this branch.

## 2. Root causes and implemented corrections

### 2.1 COSMIC phantom crash

**Root cause:** five-star wave route validation evaluated candidate stars one at
a time while treating sibling edible stars/reserved target cells as physical
blockers. One particular deterministic state therefore failed its safe-route
invariant after state had already begun changing.

**Correction:** `SnakeGameLogic` now preflights the complete wave against only
physical blockers, filters unreachable candidates, and uses a deterministic
safe fallback. An unexpected engine exception is also contained by the game
page before another tick or fabricated collision can occur; the UI offers
recovery from the last server-accepted checkpoint instead of calling the fault
a death.

**Regression proof:**
`src/lib/server/runContinuity.cosmicSafeRoute.test.ts` reproduces the exact old
seed/tick failure (tick 627) and verifies checkpoints before the wave, after the
wave, and after the next food.

### 2.2 Blocking checkpoint recovery

**Correction:** an active run never yields steering authority merely because a
checkpoint write failed or its freshness timer elapsed.

- Connection failures are a nonblocking cockpit status: `Save catching up ·
  play continues`.
- Deterministic checkpoint rejection is a nonblocking status: `Latest position
  pending verification · play continues`.
- Only a proven exclusive-lease conflict (`stale`) blocks the local simulation,
  because another tab then owns the authoritative run.
- The watchdog reports one expiry and does not poll or repeatedly mount a modal.
- Periodic checkpoint creation is scheduled after paint/idle.
- Checkpoint lifecycle flushing remains armed during pause, Loom, portal, and
  other player-selected holds.
- The literal **Try Connection** gameplay path has been removed.

Relevant files:

- `src/hooks/useRunContinuityWatchdog.ts`
- `src/app/game/page.tsx`
- `src/lib/game/runContinuityClient.ts`
- `docs/game/PLAYER_FLOW_INTERRUPTION_POLICY.md`
- `docs/game/COHESIVE_PLAYER_JOURNEY.md`

### 2.3 Checkpoint and movement hot path

`SnakeGameLogic` now exposes cheap `isGameOver`, Genome-presence/suppression,
and Genome revision accessors. The game page takes a hot movement snapshot with
`includeGenomeV2: false` and clones/mirrors the large Genome reducer state only
when its monotonic revision changes. Ordinary ticks only synchronize Genome
state when a timed Genome window actually expires.

Duplicate checkpoint owners were removed from offer accept/decline and portal
mutation. Routine food collection no longer serializes a full checkpoint in
addition to the bounded periodic writer. Portal Continue retains an explicit
checkpoint because it does not emit the same engine boundary event. This keeps
the documented at-most-three-second routine rollback envelope while avoiding
serialization bursts exactly when control returns to the player.

### 2.4 Terminal authority and progress integrity

The terminal client now distinguishes:

- a local terminal prediction;
- a server-accepted durable pending settlement (`202` with the exact contract);
- a canonical immutable earning `RunImpactEnvelope`;
- a canonical session-bound Free Play receipt;
- an explicit non-reward closure such as abandonment/expiry/disconnection;
- a lease conflict;
- a malformed, empty, cross-session, or transient response.

Important invariants:

- HTTP success alone never opens Results.
- A generic `409 alreadyEnded` never proves payout.
- Empty/malformed 2xx and unrelated-session receipts retain recovery authority.
- `401`, `408`, `425`, `429`, and `5xx` remain retryable in the tab-memory
  settlement queue.
- New reward/progress state is never written to localStorage, sessionStorage,
  IndexedDB, or browser caches. `rewardOutbox` is tab memory only. It retains a
  one-time read-and-delete bridge solely for the retired historical
  localStorage key.
- Terminal transport and body reads are bounded and abortable.
- Results finalization is bound to the exact account and session that ended;
  an account change during the flourish invalidates it.
- First-run discovery is published only after guarded finalization succeeds.

### 2.5 Canonical Free Play recovery

Free Play has no Career impact envelope, so its settled `game_sessions` row now
reconstructs a compact canonical receipt containing exact session ID, validated
score, extracted/crashed outcome, Yield, hypothetical DNA, charge state, Genome
recap, and player state where available.

This receipt is returned for:

- initial completion;
- duplicate completion;
- legacy conditional-update races;
- atomic continuity-RPC races;
- terminal reload recovery.

The outbox removes a Free Play proof only after parsing a complete receipt for
the exact expected session. A Career impact, generic completed lifecycle,
durable-pending Career response, malformed receipt, or cross-session receipt
cannot acknowledge Free Play. Direct, in-tab retry, and reload all present the
server-authored score/outcome rather than the local prediction.

### 2.6 Pending Results honesty

An earning result whose immutable progression envelope is secured but whose
detailed impact receipt is not yet readable now shows only:

- `Run Secured`;
- `Outcome finalizing on the server`;
- `Score: Finalizing…`;
- `Yield: Finalizing…`.

It suppresses local crash/extraction claims, collision diagnosis, personal best,
share artifacts, Genome cards, and outcome-specific consequences until the
canonical receipt arrives. The legacy flag-off Results path has the same neutral
treatment.

### 2.7 Tactical Loom and modal presentation

- The arena remains visible through a fully transparent, blur-free outer Loom
  backdrop.
- The Loom panel itself remains opaque.
- Mobile width/height are bounded inside viewport and safe-area padding.
- The panel uses a fixed outer grid shell; long content scrolls only in the
  internal body.
- Details expand inside that shell rather than pushing the whole dialog down.
- `box-sizing: border-box`, `width: 100%`, `min-width: 0`, and a bounded flex
  basis keep outer geometry invariant before/after details.
- Action rows are integrated and transparent rather than sticky black trays.
- Run Results and Lab variant modal action bars received the same treatment.
- The post-run Genome recap is more compact.

The production-build mobile E2E verifies transparent backdrop, no blur, panel
bounds, stable outer shell, internal scrolling, transparent action row, compact
first read, explicit details expansion, Strain visibility, Phoenix commitment,
and that the next flick remains available after the Loom closes.

## 3. Important code paths changed

- `src/app/game/page.tsx`
- `src/app/api/game/session/route.ts`
- `src/lib/game/SnakeGameLogic.ts`
- `src/lib/server/runContinuity.ts`
- `src/lib/game/runContinuityClient.ts`
- `src/hooks/useRunContinuityWatchdog.ts`
- `src/lib/outbox/rewardOutbox.ts`
- `src/lib/game/runImpactClient.ts`
- `src/lib/game/settlementResponse.ts`
- `src/components/game/RunResults.tsx`
- `src/components/game/genome/TacticalLoomDecision.tsx`
- `src/components/game/genome/TacticalLoomDecision.module.css`
- `src/components/game/genome/GenomeYieldRecap.tsx`
- `src/components/lab/VariantDetailModal.tsx`
- `src/components/game/PauseMenu.tsx`
- `src/components/game/AbandonRunDialog.tsx`
- focused tests and two E2E specs listed by `git status`

There are no dependency, schema, migration, feature-flag, or production
environment changes in this branch.

## 4. Validation completed

Completed successfully in the feature worktree:

- `git diff --check`
- `npx tsc --noEmit`
- focused ESLint for all affected runtime, route, continuity, outbox, Results,
  Loom, and E2E files
- 10 focused Jest suites / **232 tests** covering engine, Cosmic safe routes,
  continuity contracts, route lifecycle, settlement parsing, outbox, impact,
  and Results
- canonical Free Play slice: **89/89 focused tests**
- Run Results component: **26/26 tests**
- full optimized `next build` with `NODE_ENV=production` and the three relevant
  public flags enabled
- production-build Playwright: resumed run remained actively steerable through
  one deterministic `400` plus more than 10.5 seconds of `503` checkpoint
  outage, later saved successfully, accepted a post-threshold direction, never
  mounted the old blocking surface, and resumed normally after a deliberate
  pause
- production-build Playwright: complete mobile Genome v2/Tactical Loom journey
  passed after the stable-shell width correction

Notes:

- The first local build attempt inherited a nonstandard `NODE_ENV` from the
  operator shell and stopped during static generation, leaving no prerender
  manifest. It was not considered a pass. Re-running with explicit
  `NODE_ENV=production` produced all 120 static pages and a valid production
  artifact.
- The first long-outage E2E assertion compared keyboard names (`ArrowRight`)
  with engine replay directions (`RIGHT`). The behavior was working; the test
  was corrected to compare the canonical enum and then passed.
- The first mobile stable-shell assertion exposed a real 8.7 px flex/content-box
  shift. The panel sizing was corrected, the app rebuilt, and the exact E2E
  passed.

## 5. Broad-suite status and validation still required

The first broad `npm test -- --runInBand` completed with **463/469 suites** and
**6,178/6,192 tests** green. Four failing suites were either missing the
repository Supabase test environment or contained assertions that still
expected the retired generic terminal-response/blocking-overlay shapes. Those
four suites were corrected or re-run with the repository environment and are
now green (**49/49 tests**).

`jest --onlyFailures` then identified the two suites hidden by the first run's
truncated output. Both were structural source assertions made stale by this
branch's intentional changes, not runtime regressions:

- the terrain renderer assertion still looked for the removed expensive
  `getGenome()` hot-path gate instead of `hasGenome()`;
- the Daily Take assertion anchored the earning response on
  `NextResponse.json`, although the authoritative earning response now uses
  `progressionJson`.

Those assertions have been updated to retain their original invariants. The
two suites pass **36/36 tests**, and Jest's failed-suite cache now reports no
remaining failed test. The replacement agent must nevertheless run the full
environment-backed suite once as the final integration gate. Do not describe
the original broad run itself as fully green: the green evidence is the focused
remediation plus an empty failed-suite cache.

Still required before integration:

1. Full environment-backed `npm test -- --runInBand --silent` as the final
   integration gate. The failed-suite cache has already been exhausted.
2. Full `npm run lint`.
3. Relevant visual verification scripts:
   - `npm run verify:cockpit-prototype`
   - `npm run verify:cockpit-webgl`
   - `npm run verify:cockpit-decisions`
4. Final `npx tsc --noEmit` and `git diff --check` after all edits.
5. Review the entire staged diff and confirm only assignment files are staged.

The already-completed production build and targeted E2Es should not be repeated
unless a runtime/CSS/route change is made after this handoff. Test-only assertion
or documentation edits do not require rebuilding the application artifact.

## 6. Integration and release sequence

The user explicitly authorized merge to `main` and production deployment, and
asked that testing be consolidated rather than duplicated. The integration
owner should:

1. Fetch `origin/main` and inspect whether it advanced from starting SHA
   `cf4b76e12d924105a302681912591805c2d93dcc`.
2. Rebase this feature branch on current `origin/main`; resolve conflicts only
   inside this assignment. There is no migration to renumber.
3. Re-run only conflict-affected focused tests plus final type/diff checks if
   the rebase is nontrivial.
4. Make focused commits (recommended split: runtime continuity/engine;
   terminal authority; Loom/results presentation; tests/docs).
5. Push only `feat/continuity-loom-hotfix`.
6. Integrate as the designated integration owner according to `AGENTS.md` and
   the protected-branch policy. Never force-push or bypass a required check.
7. Confirm the exact `main` SHA and its push workflows are green.
8. Deploy only through the `Deploy to Production` workflow documented in
   `docs/ops/RELEASE_RUNBOOK.md`, using `expected_migrations=none` and the
   repository's existing Stripe sandbox/test selection. Do not run a hosted
   Supabase push; this release has no migration.
9. After workflow completion, verify:
   - `https://supasnake.com/api/health` is healthy and reports the exact release
     SHA;
   - `/api/release-contract` reports the checked-in public-surface hash and all
     expected production flags;
   - canonical alias and cron owner remain coherent with the new deployment;
   - `/`, `/game`, and anonymous authentication load;
   - no blocking Try Connection gameplay copy exists.
10. Update `PLATFORM_STATUS.md`, `docs/ops/QA_CHECKLIST.md`, and the volatile
    current-release paragraph of `docs/ops/RELEASE_RUNBOOK.md` with exact
    workflow/deployment evidence only after production proves it.

## 7. Risks and manual owner checks after production

- Physically force-quit Chrome mid-COSMIC run, reopen, Continue, and play for at
  least 30 seconds. A save warning may appear in the cockpit, but steering must
  never be covered or stopped.
- Exercise a long COSMIC five-star sequence near calcified terrain. No crash may
  occur without a visible physical collision; an internal invariant failure
  must route to secured recovery rather than Game Over.
- On a 390 px phone, collect a Gene relic, open/fold details, scroll the Loom,
  choose a Gene, and immediately flick. The outer panel must stay fixed and the
  flick must reach the game.
- Test a real Free Play crash and extraction, including browser reload after the
  terminal moment. Results must use the server score/outcome and must never
  claim persistent rewards.
- Monitor checkpoint invalidation, terminal retry, pending-settlement age, and
  engine-fault telemetry after release. The code now preserves play and
  recovery, but live frequency will determine whether another deterministic
  engine state remains undiscovered.
- The game route remains large (roughly 902 kB first-load JS in the successful
  local build). The hot movement cloning correction is intentionally narrow;
  broader bundle/state-store work is a separate performance package.

## 8. Explicit non-goals

- No gameplay tuning, Gene balance, offer cadence, physics, speed, growth, or
  collision forgiveness changed.
- No new local persistence or offline client authority was introduced.
- No database migration or hosted-state repair is part of this branch.
- No speculative second redesign of the already-shipped snake/fog/material
  renderer was added.
- No production release claim is valid until the documented workflow and final
  canonical health proofs complete.
