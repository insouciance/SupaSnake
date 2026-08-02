# SupaSnake QA Checklist

_Last updated: 2026-08-02_

This is the current player-facing QA path for the deployed Redesign Wave,
pressure/visual-coherence follow-up, D1 dynasty-pressure ruling, and Energy
Commitment/Clan Energy Battle release, control responsiveness, Career Spine,
cohesive UX/run continuity, and the Genome v2 release candidate.
Work from top to bottom when doing a broad playtest; use the focused matrices
near the end when verifying a fix.

Design references:

- [Game Design v2](../game/GAME_DESIGN_V2.md)
- [Buildcraft: The Genome](../game/BUILDCRAFT_GENOME_DESIGN.md)
- [Energy Commitment and Clan Battles](../game/ENERGY_COMMITMENT_AND_CLAN_BATTLES.md)
- [Career Spine](../game/CAREER_SPINE.md)
- [Monetization Strategy](../game/MONETIZATION_STRATEGY.md)
- [Player Flow & Interruption Policy](../game/PLAYER_FLOW_INTERRUPTION_POLICY.md)
- [Supporter billing QA](../game/QA_PREMIUM_BILLING.md)
- [Launch checklist](./LAUNCH_CHECKLIST.md)

## Current target and test rules

| Item | Current QA target |
|---|---|
| Production | <https://supasnake.com> |
| Production behavior commit | `23ba6e6` — cohesive UX/run integrity baseline before Genome v2 |
| Current deployment | `dpl_EnCt6pRQPqsgWzrohK7r9oYSAssx` |
| Outgoing pre-Genome artifact | `dpl_EnCt6pRQPqsgWzrohK7r9oYSAssx`; unsafe after any v2 session starts |
| Hosted Supabase | `supasnake`, `eu-central-1`; migrations 001–064 deployed and aligned; 065 pending |
| FTUE rollout flag | `NEXT_PUBLIC_FTUE_V2=true` in Vercel Production |
| Genome rollout flag | Production baseline has no Genome v2 surface; release target requires `NEXT_PUBLIC_GENOME_V2=true` and 22/22 manifest flags |
| Career presentation flag | `NEXT_PUBLIC_CAREER_SPINE_V1=true`; settlement is unconditional |
| Payments | Stripe sandbox/test mode only |
| Support/legal contact | `support@supasnake.com` |
| Canonical source | `main`; canonical health currently reports exact SHA `23ba6e6` |

The complete Redesign Wave, post-playtest food/floor fixes,
pressure/visual-coherence follow-up, D1 dynasty-pressure ruling, and Energy
Commitment/Clan Energy Battle system, control responsiveness, and Career Spine
are live through the cohesive 062–064 release. Genome v2 is not live until
migration 065, the 22-flag public contract, the exact release SHA, and the
Genome capability all pass together. After the first v2 session is issued, use
a flag-off forward deployment of the dual-version code rather than the outgoing
application as rollback.

### Genome v2 release checks

- [ ] Every offer explicitly names its Strain(s) and renders their runes.
- [ ] The focused choice shows its affected 2/3/4 route and every directly
      connected Splice fate without ranking or recommending a build.
- [ ] Candidate, held, and Recode genes expose every Strain at first read through
      a rune + independent color + written-name badge; dual-Strain genes show both.
- [ ] The ordinary Loom remains compact and game-like at phone widths; any
      post-choice callout is pointer-transparent after play resumes.
- [ ] Codex and Workbench expose complete rules and direct six-locus Research
      without hiding undiscovered recipes or resembling a ranking dashboard.
- [ ] Results `Study this Genome` uses an authenticated, opaque, server-backed
      handoff; URLs and browser storage never contain authoritative run state.
- [ ] Flag-off new starts remain v1 while an already-issued v2 run resumes and
      settles under its immutable version.
- [ ] Deterministic settlement proves a materially large Yield spread between a
      coherent/executed Genome and a poor/misplayed one without declaring one
      universal optimum.
- [ ] Force-quit/resume, portal CONTINUE/MUTATE, Recode, BANK, crash, and
      Results/Research handoff pass on desktop and mobile.

Do not use live Stripe keys, products, prices, cards, or webhooks. Do not reset
the hosted Supabase project or delete its test data. Final legal review and
mailbox monitoring are commercial-launch gates, not blockers for this
operator-only deployment.

### Career Spine production evidence

- PR 48 merged to `main` as `564dbb71a83198eba796503de3334d8d4d82f48d`.
  Production workflow `30608676126` promoted
  `dpl_FrfgGfaDnBjjJum6NwWfgUsrSdSR` in Stripe test mode. The independently
  recorded outgoing deployment is `dpl_3pxrhgn79LyLZLMKJc6Eqc3cDS2e`.
- Protected PR checks and post-main Build, Lint, Test, and both isolated-Supabase
  E2E workflows passed. The release also passed TypeScript, full ESLint, Jest
  coverage, the production-target build, deterministic cockpit checks,
  credential scanning, and the production runtime dependency audit with zero
  vulnerabilities.
- A clean local database applied migrations 001–061. Phased 060-only bridge,
  061 cutover, legacy-writer rejection, duplicate settlement, recovery, and SQL
  concurrency paths passed before release.
- Production applied 060 while the outgoing app remained canonical, verified
  outgoing and staged health, promoted the exact incoming deployment, proved
  canonical alias identity, drained retired invocations for 360 seconds, then
  applied 061. The hosted migration history is aligned through 061 and database
  lint passed without error.
- Canonical `/api/health` reports release `564dbb71a83198eba796503de3334d8d4d82f48d`,
  healthy database, Career phase `ready`, bridge version 1, Career version 1,
  and `surfaceEnabled: true`.
- Earned progress is secured and recovered on the server. Browser storage is
  not an authority for progress, rewards, pending settlement, receipts,
  attention, or pursuits.
- After migration 061 the outgoing artifact cannot safely write earning
  results. Preserve pending envelopes and forward-fix; do not trade earned-data
  integrity for a fast artifact rollback.

### Career Spine — post-production manual rechecks

- Complete an earning run and confirm Results presents at most three meaningful
  recognition beats before offering exact routes into affected systems.
- During a dropped-response or reload scenario, confirm the accepted result
  settles or remains honestly pending without asking the player to resubmit or
  keep the tab open; no progress fact or recovery request may appear in browser
  storage.
- Confirm opening the notification bell or a destination does not silently
  clear unrelated attention. Clear only through the destination's deliberate
  acknowledgement rule.
- Confirm Career Pulse, personal bests, milestones, lineage history, and the
  player's own clan consequence agree with the settled run and reveal no other
  member's private productivity.

### Redesign Wave — completed release preconditions

The owner enabled `NEXT_PUBLIC_LADDER_V1` before the 2026-07-28 Redesign Wave
release and confirmed `NEXT_PUBLIC_GROWTH_LAB_V1`; both were build-time values.
Migration 057 applied in that release. The 2026-07-29 follow-up's linked preview
and apply steps both reported “Remote database is up to date.” D1 was ruled on
2026-07-29; the Growth Lab flag is historical and is not a release requirement
once the dynasty-pressure follow-up is integrated.

### Energy Commitment and Clan Energy Battle production evidence

- PR 43 merged as exact main SHA `61a1936`. Production workflow
  `30523606603` promoted `dpl_6T3zHoNvoHNWZG2fEMoAwkxT7bQR` in Stripe test mode
  and applied migration 059. The independently recorded outgoing deployment is
  `dpl_Bg8ru9SP2jAczR9hyW8PrMsNpCBX` at `95ad7d3`.
- The release gate passed 388/388 Jest suites and 5,568/5,568 tests with
  coverage, TypeScript, ESLint, the production build, the blocking runtime
  dependency audit with zero vulnerabilities, and `git diff --check`.
- A disposable local Supabase reset applied migrations 001–059 from zero. The
  Energy/Clan SQL integration exercised recovery, immutable consumption,
  duplicate protection, battle assignment, best-five replacement, settlement,
  and the old-runtime compatibility bridge inside a rollback transaction.
- Both isolated-Supabase E2E configurations passed, along with 8×4 cockpit
  geometry states, four real-WebGL profiles, and 22 frozen decision/legal
  states.
- The linked migration preview named only migration 059; apply completed and
  canonical application/database health passed. Linked database lint had no
  error. It reported two non-blocking migration-059 warnings: unused local
  recovery variables and a conservative text-to-UUID-array cast warning. The
  exercised SQL path passed; deployed migration history remains immutable.
- Public production returned 200 on `/`, `/game`, `/clan`, `/serpent`, and
  `/shop`; `/api/health` reported healthy application and database. Missing
  bearer authentication returned 401 on the Serpent, session-sweep,
  settlement-dispatch, and Signal settlement cron routes, and the clan Energy
  Battle API rejected an unauthenticated request with 401.
- The workflow's generated rollback summary remains unreliable because lookup
  occurs after staging. The independent anchor above, not the generated staged
  ID, is the release rollback evidence.

### Control responsiveness production evidence

- PR 45 merged the player-facing behavior as main SHA `8810223`; PR 46 merged
  the test-only CYBER speed-floor hardening as release SHA `abf9844`. Production
  workflow `30534158859` promoted `dpl_3pxrhgn79LyLZLMKJc6Eqc3cDS2e` in Stripe
  test mode. The independently known outgoing deployment is
  `dpl_6T3zHoNvoHNWZG2fEMoAwkxT7bQR` at `61a1936`.
- The release gate passed 389/389 Jest suites and 5,578/5,578 tests with
  coverage, TypeScript, ESLint, the blocking runtime dependency audit with zero
  vulnerabilities, and the production-target Vercel build. The focused control
  suite passed 10 suites / 263 tests before integration.
- Both isolated-Supabase E2E configurations passed on the behavior PR and again
  on the test hardening PR. The production-isolated journeys took 11m24s and
  11m13s respectively; the rollback journeys took 7m59s and 7m44s.
- Cockpit prototype, real-WebGL, frozen decision-surface, and Constitution gates
  passed for the player-facing change. No migration, dependency, environment,
  payment, or feature-flag value changed.
- The linked migration preview and apply both reported “Remote database is up
  to date”; linked database validation, staged health, and canonical production
  application/database health all passed.
- The workflow again recorded the newly staged artifact as its outgoing
  deployment because the lookup occurs after staging. The independent rollback
  above remains the valid app anchor.

### Control responsiveness — post-production manual rechecks

- On desktop and mobile, enter a turn just before a movement boundary and
  confirm the small default grace removes perceived lag without turning early;
  confirm Slipstream remains observably stronger at one full tick.
- On mobile, repeat very fast wall-coiling L-turns. Confirm two unresolved flick
  turns remain reliable, a rapid accidental third micro-U into the fresh neck is
  suppressed, and slow or spatially larger U-shaped manoeuvres remain legal and
  dangerous.
- In COSMIC, confirm normal play never pauses itself when food waves, portals, or
  gene offers appear. Confirm the hold counter starts at six, gains two at
  modelled lengths 25 and 40, remains visible on desktop and mobile, and a resume
  input never leaks into accidental steering.

### Energy Commitment — post-production manual rechecks

- Compare one-, three-, and six-Energy runs. Confirm Run Setup defaults to one,
  reflects server recovery/partial progress, updates the harvest preview
  exactly, and makes six a deliberate two-step commitment.
- Confirm Energy disappears once at start and is never refunded by crash,
  abandon, poor result, reconnect, revive, or duplicate completion.
- Compare all banks and Results against the server formula. Commitment applies
  to credited normal-run DNA only; Score, Yield, Depth, Mastery, fixed rewards,
  and leaderboard values remain unchanged.
- During a live clan cycle, confirm every positive-Energy normal run announces
  automatic eligibility, a banked result enters/replaces only the player's top
  five, and the result explains the fifth-best threshold, replaced result, and
  aggregate clan increase.
- Observe commitment distribution, bank timing, effective reward per Energy,
  high-frequency DNA inflation, late-cycle clustering, generation changes, and
  whether strong one-Energy runs remain competitively meaningful.

### Redesign Wave — what to judge, and what is already known

The wave's mandate was to land everything before a single playtest, so this is
one sitting against a complete design rather than a series of partial reads.

**D1 is closed.** CYBER and COSMIC use +1 normal growth throughout. PRIMAL uses
+4 below modelled length 75, +3 below 96, +2 below 120, then +1. What remains
open is threshold calibration from real PRIMAL play, not profile selection.
Gene offers use their own 4–8-food clock, independent of dynasty growth.

Known before you start, so they are not reported as discoveries:

- **One food on every profile.** COSMIC still places a constellation group —
  that group is its mechanic, not a leftover.
- **PRIMAL's wall-clock extraction window is 15.75 s, down from 18.0 s**, a
  consequence of its tempo moving to 175 ms. Deliberate: 90 ticks is 90 *moves*
  of runway whatever the tempo, and paying it in seconds would have granted more
  room than the shipped game ever had.
- **Salvage at zero passed doors is now 1.0, up from 0.6.** Dying before you
  have declined anything costs nothing. This raises total DNA at the shallow end
  and is an economy change — flagged, not buried.
- **Score is no longer comparable across the leaderboard.** The per-dynasty
  curves changed; the epoch bump is an unmade decision (see the status doc).
- **The sourced terrain grammar has not been judged by a human in a live run.**
  Block height, forming fill, slate integration, and the arena/Fortress/star/rung
  reliefs remain owner playtest questions.
- **The cell-persistent long-snake renderer has been seen only in controlled
  fixtures**, including 40- and 160-cell coils, never through the arc of a real
  run against live terrain.

### Dynasty-pressure and high-density-feedback release evidence

- Release workflow `30460660086` deployed exact main SHA `b15b5c3` in Stripe
  test mode. Vercel promoted `dpl_8mvz76gzhGNSWRnRgoiTPTgFr1zV`; the actual
  outgoing rollback is `dpl_2AtMADdjpLTtNBeUUB1AFN59nAAS` at `bfdf8a2`.
- Preflight independently confirmed the outgoing alias and a completed physical
  Supabase backup from 2026-07-29 07:31 UTC. PITR reports disabled; this release
  carried no migration.
- The migration preview and apply steps were no-ops, linked database lint
  completed without an error, and staged plus canonical app/database health
  passed.
- The release gate passed 382/382 Jest suites and 5,525/5,525 tests with
  coverage, TypeScript, ESLint, the production build, and the blocking runtime
  dependency audit with zero vulnerabilities.
- Protected PR and post-main Build/Lint/Test/E2E checks passed. The rollback
  E2E configuration recorded 79 passed / 23 skipped. The production
  configuration recorded 89 passed / 12 skipped / 1 flaky: the Build Seed/full
  telemetry-deck journey in `genome.spec.ts` missed the tactical-hold gate on
  its first attempt and passed on its configured retry.
- Local game-screen gates passed 8 viewports × 4 cockpit states, four real-WebGL
  profiles at only +3 arena calls, and 22 frozen decision/legal-surface cases.
  Controlled 40/20 and 160/80 snake/terrain profiles both held 60 draw calls
  with no browser error.
- Independent public smoke found healthy app/database status; 200 on `/`,
  `/game`, `/login`, and `/lab`; 404 on all three dev fixtures; and 401 for a
  missing bearer on all eight configured cron routes.
- The workflow's generated rollback summary is wrong: because its lookup runs
  after staging, it selected the new staged deployment as the “outgoing” one.
  The rollback above was independently recorded from the canonical alias before
  dispatch; fix the lookup before relying on that summary in a future incident.

### Post-production manual rechecks

The automated production acceptance run is green. These tactile and
state-heavy cases still require real-device or exploratory verification:

- Real-device safe areas, mobile browser chrome, touch feel, and camera motion
  while live HUD content changes.
- First-food, BANK/combo/anomaly, one-to-six gene, real mutation, portal,
  infusion, surge, and BANK journeys against the live refinement.
- Real-device tactile confirmation that tactical hold, subsequent deliberate
  flick, and the compact landscape controls remain comfortable.
- Full live Deadeye targeting and Training preset save/reload/delete, PB
  persistence, and reward-invariance journeys.
- Verify CYBER and COSMIC remain at +1 normal growth; verify PRIMAL announces and
  applies +4 → +3 → +2 → +1 at modelled lengths 75/96/120. Record pressure
  onset, control, wall-clock time, and free-space state around each handoff.
- Confirm the opening growth inscription and CYBER speed-tier inscriptions are
  brief, transparent, non-blocking, absent from Ready/strategic decisions, and
  do not compete with Energy or pause telemetry.
- Exercise Thick Hide, Ouroboros, Phoenix, and Iron Scales in dense/edge states;
  confirm the preserved-length and movement-blocking outcomes remain legible.
- Grow into a genuinely long, tightly coiled snake and compare head tracking,
  interpolated tail vacancy, internal calm, collision attribution, and the
  one-shot contact-edge seal against a short run. The seal must not replay for a
  settled coil or fire on the initial body.
- Watch CYBER ring, PRIMAL Fortress, COSMIC calcification, and a ladder source
  transition from amber forming cell to slate solid. Confirm the VOLT bolt,
  FERAL claw, broken FLUX portal, and AURUM seal remain distinct without implying
  that rune orientation changes collision behavior.

### Training and UX release evidence

- Release workflow `30123163234` deployed exact main SHA `645578e` in Stripe
  test mode. Its migration dry-run named only `038_training_lab.sql`.
- The staged production-target app passed authenticated health against schema
  037 before Vercel promoted deployment `dpl_44KnYTUmDYygkcHrrdxsnaAoqDWB`.
  Migration 038 then applied, linked database lint passed without errors, and
  canonical application/database health passed.
- Independent hosted migration listing reports local/remote parity through
  038. The expected four warnings remain confined to older functions; no new
  Training lint warning was introduced.
- Complete release gates passed: 245/245 Jest suites and 2,944/2,944 tests,
  TypeScript, full ESLint, dependency and credential scans, production build,
  deterministic cockpit geometry/WebGL/decision checks, full isolated E2E,
  both protected PR check sets, and both post-main check sets.
- Public production passed the account-dialog viewport/focus matrix, both
  notification-attention journeys, the rewardless Training journey, and the
  canonical one-click PRIMAL launch test. In the first combined headless run,
  WebGL software rendering starved the URL poll even though the board was
  visible; an instrumented navigation trace reached `/game` and the exact test
  passed alone without retries in 11.4 seconds.
- The release is tagged `production-2026-07-24-training-ux`. The previous
  deployment `dpl_3raqVivFqkbEXvuWy4WUvx1RAgz6` is the immediate application
  rollback; forward-only migration 038 must remain applied.

### Cockpit refinement production evidence

The earlier uncommitted HUD/Pause candidate remains frozen for regression
reference and was not shipped. The isolated refinement completed every gate
below before the exact canary artifact was promoted.

- The deterministic cockpit fixture passes 8 supported viewports × 4 telemetry
  states with a centered, stable arena and no overflow. Desktop now uses equal
  shallow top/bottom decks; portrait geometry is preserved; 844×390 retains
  the proven compact symmetric side rails.
- The real-WebGL fixture passes four representative dynasty/viewport profiles
  at 53–62 calls and 586–1,852 triangles, with the arena still adding only
  three calls.
- The projected-camera unit contract proves the exact undertray envelope
  remains inside the clipped frame at 16° polar, 1.175 margin, 0.94 fit scale,
  and −0.3 target. Screenshot review confirms all four corners on phone
  portrait, phone landscape, desktop, and ultrawide.
- The decision fixture passes 22 frozen-state/legal-surface checks covering
  tactical hold, abandon confirmation, gene, mutation, portal, surge, and
  expression presentations. Strategic panels center on the arena; tactical
  hold has no modal; input surfaces are unavailable while a dialog owns focus.
- Focused unit coverage passes for camera projection, RunCockpit semantics,
  abandon focus/copy/actions, and gene/mutation/portal overlays. Focused ESLint,
  TypeScript, and the responsive/WebGL/decision verification scripts pass.
- Engine regressions continue to cover synchronous PASS, INFUSE → gene,
  INFUSE → Strain Surge, reversal, duplicate direction, queue cleanup, and
  atomic resume. Flick/D-pad regressions cover accepted and rejected paths.
- The complete application gate passes 230 Jest suites / 2,871 tests, full
  ESLint, TypeScript, the 83-page production build, `npm audit` with zero
  vulnerabilities, and diff/credential checks. The exact production-server
  artifact passes 16/16 focused Playwright checks with retries disabled.
- The Vercel Production environment contract passes in sealed-value mode for
  sandbox payments; both FTUE v2 and cockpit flags are configured `true`.
- Hosted migration history is aligned through 037. Migration 037 was applied
  after an isolated clone, repeated/concurrent bootstrap checks, and a
  restricted logical recovery snapshot; the post-backfill invariant check
  found zero inconsistent players and zero changed progression rows.
  Hosted database lint exits successfully with pre-existing cast/unused-
  parameter warnings in `settle_and_pair_duels`, `reroll_trait`,
  `grant_purchase_rewards`, and `compute_effective_stats`.
- The added/modified/untracked-file credential-pattern scan passed.
- The first protected canary exposed a real direct-route race: a new anonymous
  user could submit `POST /api/game/session` before the player row existed and
  receive 404. The final release makes session start invoke migration 037's
  atomic, idempotent `bootstrap_player` repair before rate, Energy, or session
  writes. Route-handler tests cover successful repair and retryable bootstrap
  failure; existing player choices remain protected by the RPC contract.
- The focused HUD journey uses deterministic authenticated player/collection/
  session responses. Separately, the selective FTUE release artifact passed
  14/14 protected-canary and 14/14 production Playwright checks against hosted
  migration 037, including genuinely new anonymous PRIMAL bootstraps.
- Final deployment `dpl_3raqVivFqkbEXvuWy4WUvx1RAgz6` passed 16/16 protected-
  canary and 16/16 public-production Playwright checks with retries disabled,
  including one-click anonymous PRIMAL bootstrap, authoritative run start,
  input, cockpit, strategic decisions, and consent. App/database health stayed
  healthy; no session-start 404, 5xx, error, or fatal runtime log occurred.
  The broader shared-deployment log contained only handled collection-
  validation 400s, the active-season Analyst 409, the guarded fixture 404s
  below, and a crawler request for the currently absent `/robots.txt`.
- Development-only geometry fixtures intentionally return 404 in production.
  Their exact source revision passed locally before deployment: 8 viewports ×
  4 cockpit states, 4 real-WebGL profiles, and 22 frozen decision/legal-surface
  checks. The manual real-device cases above remain a field-quality follow-up;
  deployment `dpl_5WdZhdbqF5RcgiSmuUPtiEk8WstX` was the rollback artifact for
  that earlier cockpit release; the current immediate rollback is recorded in
  the target table above.
- The temporary automation bypass was revoked after verification, its old value
  no longer reaches the protected deployment, and the local bypass/env capture
  files were removed.

### Suggested test accounts and evidence

- [ ] Fresh guest in a private/incognito window.
- [ ] Progressed account with at least 20 banked runs, two or more variants,
      multiple genes unlocked, and one snake from each dynasty.
- [ ] Second account for handles, clans, invites, and breeding combinations.
- [ ] Desktop keyboard/mouse and a real touch device; test portrait and
      landscape.
- [ ] Record device, browser, viewport, account, run mode, dynasty, snake,
      score/food count, and exact reproduction steps for every failure.
- [ ] Capture a screenshot or short recording for visual/input failures and
      preserve the failing network response for API failures.

## The player journey

At each stage, check function and feel. Rate the feeling from 1–5 and note the
weakest moment even when nothing is technically broken.

| Stage | When | Intended feeling |
|---|---|---|
| 1. First Contact | 0–30s | “This is a real game, not a website.” |
| 2. First Run | 1–5 min | “I understand it, and I want to improve.” |
| 3. The Fork | 5–20 min | “This dynasty is mine.” |
| 4. The Build | Every run | “What will this run become?” |
| 5. The Ritual | Daily | Purposeful return, not chores. |
| 6. The Investment | Multi-day | A collection and identity worth growing. |
| 7. The Season | Weekly | A changed ruleset worth revisiting. |
| 8. The Name | Early account life | The game recognizes me. |
| 9. The Chronicle | Long-term | My play has become a story. |
| 10. The Muster | Clan play | My group has a home and a rival. |
| 11. The Analyst | After runs/weeks | The game understands how I play. |
| 12. The Arena | Every run | Premium, readable, fair play space. |
| 13. The Genome | Mature runs | A build with commitment and emergence. |
| 14. The Bloodline | Across runs | My collection changes future strategy. |

## Stage 1 — First Contact

Use a fresh private/incognito window.

- [ ] `supasnake.com` opens in the Specimen Chamber with the snake breathing,
      eyes visible, and the whole specimen in frame at narrow and wide widths.
- [ ] Entrance order reads clearly: chamber → wordmark → counters → mission
      line → Launch.
- [ ] Launch is the obvious primary action; desktop and mobile navigation are
      reachable and labelled. A signed-out visitor is not asked to create an
      account before playing.
- [ ] Consent appears once. Its measured layout space keeps Launch unobscured in
      portrait, landscape, and desktop; safe areas are respected; Reject All
      and Accept persist the expected analytics choice.
- [ ] Age and legal surfaces are reachable and all support, privacy, and legal
      contact copy uses `support@supasnake.com`.
- [ ] Exactly one Launch click completes anonymous authentication, atomic player
      bootstrap, PRIMAL grant/equip, run creation, and navigation to the board.
- [ ] No starter chooser, Lab redirect, account prompt, Contracts board, second
      Launch, or second Play button appears before the first run.
- [ ] Repeated/concurrent bootstrap and browser refresh do not duplicate PRIMAL;
      returning players retain their existing equipped snake and dynasty.
- [ ] **Feel:** the first 30 seconds feel like a premium game. Record the
      weakest element on screen.

## Stage 2 — First Run

Start on desktop with keyboard controls.

- [ ] A fresh one-click launch bypasses the pre-run overlay and opens a held
      board with only “Swipe or press an arrow to move.” Direct or returning
      navigation may still expose the voluntary pre-run controls.
- [ ] The fresh FTUE board is completely frozen until a safe arrow/WASD or
      flick direction. Space does not start the first run; later non-FTUE
      Ready/resume screens may preserve the current heading with Space.
- [ ] Arrow keys and WASD steer. Rapidly enter Up then Left while moving Right:
      both legal turns execute on consecutive cells.
- [ ] A direct reversal is rejected without a hidden turn or movement glitch.
- [ ] Camera drag snaps to a board side; zoom remains clamped; reset restores
      the default view; the entire board remains judgeable.
- [ ] Food, snake, grid, boundaries, and portal have distinct silhouettes and
      readable depth.
- [ ] HUD score, DNA, energy, outcome preview, and any mode indicator are
      correct and do not obscure the playable board.
- [ ] Crash deliberately. The death sequence is legible and the result shows
      the correct salvage, streak, build, and navigation choices.
- [ ] Play Again starts a clean run with no stale direction, gene, portal,
      score, interpolation, or camera state.
- [ ] **Feel:** death feels attributable to the player, and another run is
      immediately attractive.

## Stage 3 — The Fork

- [ ] Bank at the first portal; the Extracted result makes the +25% base bank
      outcome clear and credits DNA once.
- [ ] Unlock and equip a variant from another dynasty; Lab, pre-run theme,
      snake appearance, and server ruleset all follow the equipped snake.
- [ ] PRIMAL keeps constant movement speed while its per-food value compounds.
- [ ] CYBER increases speed in visible tiers and its rising danger feels worth
      the payout.
- [ ] COSMIC’s open/closed edge phases are telegraphed clearly and behave as
      described.
- [ ] At a valuable portal, BANK, PASS, and later INFUSE create a genuine
      strategic hesitation rather than an obvious dominant choice.
- [ ] **Feel:** each dynasty has a recognizable identity, not a stat reskin.

## Stage 4 — The Build

“Mutations” are now player-facing **genes** in Genome-capable runs.

- [ ] A gene pickup appears every 4–8 foods (Patient doubles the interval), is
      independent of dynasty growth, is distinct from food,
      and signals its 40-tick despawn window without visual noise.
- [ ] Collecting it freezes the engine and presents two readable choices with
      name, effect, cost, and—after the FTUE gate—strain tags.
- [ ] Keyboard 1/2 and touch selection work; Escape declines; focus never lands
      behind the overlay.
- [ ] After picking or declining, the board stays held until deliberate input.
      Run the full input-gate matrix below.
- [ ] Held genes appear in the HUD with readable tooltips and on the result
      screen; up to six held slots are supported.
- [ ] Offers do not repeat an already-held gene and offer gravity feels related
      to the build without becoming deterministic.
- [ ] A gene that completes a splice shows `?` before discovery and the splice
      name after discovery.
- [ ] Across several runs, check that effects and costs both occur. Flag any
      always-pick, never-pick, or combination that invalidates other builds.
- [ ] **Feel:** the choice is a high point of the run and consecutive builds
      tell different stories.

## Stage 5 — The Ritual

- [ ] Contracts, Season, offline rewards, and account promotion are absent before
      the first completed result and none of them auto-open afterward.
- [ ] The contracts board offers three and allows two selections; progress
      advances only from qualifying real events. It opens only from its mission,
      destination badge, or notification-center action.
- [ ] Claiming a completed contract credits DNA, energy, and season XP exactly
      once.
- [ ] The Chamber mission line and centralized badge reflect selected/claimable
      contracts from one state source and open the correct surface.
- [ ] At zero energy, Earn is blocked with a useful timer while Free Play stays
      available.
- [ ] Free Play consumes no energy, pays no DNA, is clearly marked in the HUD,
      and gives a “would have banked” result.
- [ ] Daily reward and streak increment once per eligible day and survive
      sign-out/sign-in.
- [ ] **Feel:** contracts encourage different choices; energy does not create a
      dead end.

## Stage 6 — The Investment

- [ ] Collection cards show correct rarity, dynasty, generation, traits,
      lineage, equipped state, favorite state, and unlock progress.
- [ ] Unlocking deducts the displayed DNA exactly once and produces one owned
      snake.
- [ ] Gen-1 + Gen-1 breeding displays and deducts 300 DNA; higher-generation
      cost follows `200 + floor((gen1 + gen2) / 2) × 100`.
- [ ] Offspring generation is one above the higher parent and generation is
      prestige only—no hidden percentage stat boosts.
- [ ] Trait inheritance preview, reveal, reroll-token spending, and breeding
      history agree with the resulting snake.
- [ ] Same- and cross-dynasty lineage behavior passes Stage 14.
- [ ] Guest → saved account preserves collection, balances, records, and the
      equipped snake across sign-out/sign-in and another device.
- [ ] Clan creation/joining, current duel, score contribution, countdown, and
      weekly bonus are internally consistent.
- [ ] **Feel:** there is always a visible next item or mastery goal worth
      pursuing.

## Stage 7 — The Season

All required schema migrations are active on the hosted project.

- [ ] The current anomaly name, description, countdown, personal best, and top
      ten agree between pre-run panel and leaderboard.
- [ ] An anomaly run costs one energy, is labelled in the HUD, counts for
      streak/contracts, and stays out of normal dynasty weekly boards.
- [ ] Verify all five anomaly behaviors when they rotate or in a controlled
      test environment:
  - [ ] Gold Rush: food ×1.5, portals later, AURUM offer tilt.
  - [ ] Meteor Shower: food expires/respawns, VOLT offer tilt.
  - [ ] Blackout: visibility bubble is fair, UMBRA offer tilt.
  - [ ] Twin Exits: two synchronized portals, FLUX offer tilt.
  - [ ] Overgrown: extra growth per food, FERAL offer tilt.
- [ ] Strain-specific anomaly bonuses appear without disabling unrelated
      builds.
- [ ] Anomaly Tourist and Genome-era contracts progress and reward once.
- [ ] Season track XP, milestone claims, cosmetics, and trait-reroll tokens
      remain synchronized after refresh.
- [ ] Seasonal genes enter normal offers only when eligible and show both
      effect and cost.
- [ ] Gauntlet can ban one gene and suppress one strain’s Expression/Apex
      tiers; suppression does not remove its genes or Minor.
- [ ] Playoff bracket, live scores, settlement, and champion banner agree in
      playoff weeks.
- [ ] **Feel:** the week changes adaptation, not merely payout numbers.

## Stage 8 — The Name

- [ ] After an eligible result, the Player Card and identity notification offer
      a handle claim without automatically opening a claim modal.
- [ ] Availability responds while typing. Taken, reserved, malformed, and
      disguised-profane handles receive precise errors.
- [ ] A clean claim propagates to results, leaderboards, clan rows, Chronicle,
      and public profile without stale generated names.
- [ ] First claim is free; a subsequent change shows the 30-day cooldown date.
- [ ] Titles, banner, and up to three badges equip and update the Player Card.
- [ ] Founder treatment appears only for eligible pre-season accounts.
- [ ] Guest account upgrade offers handle claim and preserves progress.
- [ ] **Feel:** the account has a recognizable identity.

## Stage 9 — The Chronicle

- [ ] Chronicle renders the full Player Card and hides zero-value Legacy Score
      cleanly.
- [ ] Record categories, tier pips, next-rung progress, and awarded badges match
      server facts.
- [ ] Refresh Records is rate-limited and idempotent; no duplicate badges or
      Legacy Score inflation occurs.
- [ ] PB timeline, collection silhouettes/discovery dates, season chapters,
      clan history, rivalries, and legacy achievements handle empty and mature
      accounts gracefully.
- [ ] `/p/<handle>` is case-insensitive and contains no private balance, email,
      auth, billing, or internal-only data.
- [ ] Generated handles and unknown handles return 404; accounts below the
      privacy threshold show the reduced public view.
- [ ] **Feel:** the page reads as a career story rather than a statistics dump.

## Stage 10 — The Muster

Use a clan owner/officer, a second account, and the official Discord server.

- [ ] Settings explains Discord scopes/privacy before authorization; linking
      auto-joins the official server and displays the linked username.
- [ ] Linking a clan provisions the private channel and clan role with correct
      access; the clan panel switches to its linked state.
- [ ] Duel settlement and membership events post one correct embed.
- [ ] Handle-based invite, accept, roster appearance, promote/demote, and owner
      protections work from both accounts.
- [ ] Heraldry respects research locks and persists its preview.
- [ ] Discord Linked Role fields expose the correct public gameplay values.
- [ ] Own-server provisioning works only with required permissions.
- [ ] Unlinking removes provisioned clan resources and revokes the account
      connection without breaking the SupaSnake account.
- [ ] **Feel:** the clan has a home and a rival, not just a score table.

## Stage 11 — The Analyst

- [ ] Bank and crash runs produce specific post-run insight grounded only in
      recorded facts; the same run returns the cached artifact.
- [ ] Weekly digest totals agree with run history and do not invent numbers.
- [ ] Digest email is opt-in, guests are invited to add account recovery, one message
      is sent per eligible week, and opting out stops it.
- [ ] Season archetype and Season Recall follow their eligibility thresholds;
      sharing uses the public profile and leaks no private data.
- [ ] Gauntlet scouting brief is specific to the actual opponent.
- [ ] There is no chatbot, input box, or conversational Analyst surface.
- [ ] With Analyst generation disabled, every surface falls back to useful
      deterministic copy without an empty panel or failed run result.
- [ ] Analyst cron rejects requests without its secret.
- [ ] **Feel:** it feels observant, not generic or invasive.

## Stage 12 — The Arena

- [ ] PRIMAL, CYBER, and COSMIC boards are bright, distinct, and readable
      without washing out snake, food, boundaries, or pickups.
- [ ] Snake head, eyes, taper, tail, and direction are readable at speed; the
      body feels continuous rather than like unrelated boxes.
- [ ] At top CYBER speed and length 40+, movement/interpolation stay smooth and
      tight turns do not flicker, shimmer, gap, or rubber-band.
- [ ] Portal reads immediately as an exit; its one-time Extract hint appears
      once per device and urgency increases without strobing.
- [ ] Deadeye, Gridlock, Pathline, and Firefly work at their unlock thresholds;
      locked choices show the correct hint and are rejected server-side.
- [ ] Twin Exits and Blackout preserve their intended portal/lighting behavior.
- [ ] Desktop performance stays near the display’s frame floor without
      recurring GC hitches; mobile holds a playable frame rate and clear glow.
- [ ] `prefers-reduced-motion` removes nonessential pulses/transitions while
      retaining state and danger communication.
- [ ] **Feel:** the board matches the quality promised by the Chamber and stays
      comfortable through a long session.

## Stage 13 — The Genome

### FTUE and capability rollout

FTUE is based on server-side **banked run count**. Pre-unlock systems should be
absent, not shown as disabled future features.

- [ ] 0–3 banked runs: genes appear without strain tags; no strain meters,
      tiers, INFUSE, splices, Codex, or inherited starting points are exposed.
- [ ] At 4: strain tags, body tinting, five meters, and Minor passives appear.
- [ ] At 8: Expressions unlock and first activation receives its intended
      introduction/reward.
- [ ] At 10: eligible portals offer BANK / PASS / INFUSE.
- [ ] At 12 **and owning at least two variants**: lineage/heirloom starting
      points and the pre-run Build Seed appear.
- [ ] At 15: splices become discoverable and the Codex link/page opens.
- [ ] At 20 banked runs, or earlier with any dynasty at Mastery M3: Apexes
      unlock.
- [ ] The server start response, not a client-only feature flag, controls
      Genome capability. Refreshing or switching accounts cannot borrow the
      previous account’s unlocks.

### Strain points and tier gates

- [ ] The HUD always shows AURUM, VOLT, FERAL, FLUX, and UMBRA once unlocked,
      in a stable order and with distinct accessible labels/colors.
- [ ] Each held gene grants its declared strain point; dual-tag genes grant one
      to each strain; a splice preserves both parents’ points.
- [ ] At 2 points the Minor activates automatically.
- [ ] At 3 points an Expression activates only with at least two actual in-run
      gene picks contributing to that strain.
- [ ] At 4 points an Apex activates only with at least three actual in-run gene
      picks contributing to that strain.
- [ ] Lineage, heirlooms, and surges can add points but never satisfy the two-
      or three-in-run-gene gate.
- [ ] Spawn-source points are capped at two per strain. A dedicated bloodline
      may start with a Minor, never one pick away from bypassing commitment.
- [ ] Activation happens at the food index that crosses the gate; economic
      effects apply only to later foods where specified.

### Five strain playstyles

Check both benefit and counterweight when encountered.

- [ ] AURUM: Gilt food value; Gilded Wake pickups with shorter portal windows;
      Midas Vein rapid-food bonus with reduced salvage.
- [ ] VOLT: Tempo slowdown; Arc Lightning consumes nearby food while all food
      is discounted; Overclocked Reality accelerates the world and raises food
      value while shortening portals.
- [ ] FERAL: Thick Hide survives one self-hit and charges +8 growth; Fortress
      turns deployed tail cells into permanent terrain without reducing logical
      length; Ouroboros rewards only eligible tail-tip bites, charges +2 growth,
      and discounts normal food.
- [ ] FLUX: Warp Skin grants/recharges a wall wrap; Rift Aura wraps all walls
      with food/portal costs; Singularity periodically pulls food and delays
      portals.
- [ ] UMBRA: Shadow Skin raises salvage; Phantom Coil gives a short self-phase
      after eating with shorter portals; Second Sun revives once, interacts
      correctly with Phoenix, and retains its bank penalty.
- [ ] No combination permits more than one revive per run.
- [ ] Effects remain visually understandable at long length and with multiple
      simultaneous tiers; reduced-motion mode substitutes static signalling.

### Splices and the six-slot build

- [ ] The held-gene cap is six, including HUD and result layouts.
- [ ] Picking the second recipe parent fuses the earliest-held eligible partner
      deterministically; two slots become one splice slot.
- [ ] The splice retains both parent tags and counts as two in-run genes for
      Expression/Apex gates.
- [ ] The client reports raw picks; the derived splice, effect, Codex discovery,
      and +250 first-discovery DNA agree after the server result.
- [ ] A first discovery rewards once account-wide; replaying it updates stats
      without another discovery grant.

### BANK / PASS / INFUSE

- [ ] Before the FTUE gate, portals retain the old BANK/PASS behavior and never
      expose INFUSE.
- [ ] An eligible Genome portal freezes on a BANK / PASS / INFUSE overlay.
      Keyboard 1/2/3, touch, focus order, and Escape behavior are unambiguous.
- [ ] BANK ends the run immediately and pays the displayed server-validated
      result; it does not enter the resume-input gate.
- [ ] PASS consumes the current door, schedules the next normal interval, and
      enters the deliberate input gate.
- [ ] INFUSE is unavailable below length 8 and after three infuses.
- [ ] INFUSE removes up to four tail segments immediately, adds +0.05 bank,
      subtracts 0.05 salvage, delays the next portal by two foods, and consumes
      the current portal.
- [ ] Below six held genes, INFUSE opens an immediate gravity-weighted gene
      offer; the board remains frozen through the entire portal→gene chain.
- [ ] At six held genes, INFUSE opens Strain Surge only for held strains; the
      chosen point can cross a tier threshold but is not an in-run gene.
- [ ] After INFUSE’s gene or surge choice, movement waits for deliberate input.
- [ ] Displayed bank and salvage values update immediately and obey final clamps
      bank `[0, 1.75]` and salvage `[0, 0.90]`.
- [ ] No instant bank is possible after infusion; the next portal requires the
      extended food interval.

### Genome result and sharing

- [ ] Bank and crash results list genes, splices, strain milestones, infuses,
      and the same payout facts accepted by the server.
- [ ] Genome Card body strip and gene sequence match the run; dual-tag/splice
      treatment is visible and an all-in run is labelled.
- [ ] Payout cascade reaches the credited total without rounding disagreement.
- [ ] Share / Download uses native sharing where supported and otherwise
      downloads a readable PNG; cancel is harmless and failures are explained.

## Stage 14 — The Bloodline and Codex

### Collection lineage and fallback

- [ ] Every non-bred variant has its dynasty affinity: PRIMAL→FERAL,
      CYBER→VOLT, COSMIC→FLUX.
- [ ] Common/uncommon affinity is strength 0, rare is 1, and epic/legendary is
      2; Gen 3+ prestige can raise the effective strength but never beyond 2.
- [ ] Existing/unlocked snakes with no snake-specific lineage fall back to the
      joined variant affinity in collection, detail, pre-run, and server start.
- [ ] A valid snake-specific lineage overrides the variant fallback.
- [ ] Malformed/unknown lineage data never renders an invalid strain, throws a
      client error, or becomes trusted starting power.
- [ ] Collection grid, variant detail, breeding preview/reveal/history, and
      pre-run Build Seed use consistent StrainChip labels, colors, pips, and
      selected-primary emphasis.
- [ ] Strength 0 communicates “offer bias only.” Strength 1 adds one starting
      point. Strength 2 adds the same point and guarantees a matching option in
      the first offer’s first slot.
- [ ] The first two offers receive lineage bias; later offers do not keep an
      unintended permanent bonus.

### Breeding and lineage controls

- [ ] Same-dynasty/same-strain parents preview and produce a Purebred outcome:
      max parent strength +1, capped by rolled rarity and the global cap.
- [ ] Same-dynasty/different-strain parents preview a true 50/50 strain outcome
      at max parent strength, with the actual roll audited in history.
- [ ] Cross-dynasty parent selection is enabled in UI and server. It produces a
      dual-lineage child rather than failing the old same-dynasty gate.
- [ ] A dual-lineage child biases both strains. For strength 1+, its detail view
      asks which strain is primary; selecting either persists and moves the
      starting point/guarantee accordingly.
- [ ] Before primary selection, a rare+ dual lineage grants no ambiguous hidden
      starting point; the warning is clear.
- [ ] Lineage reroll asks for confirmation, costs exactly 150 DNA, preserves
      strength and single/dual status, avoids duplicate dual strains, updates
      all current views, and records one transaction.
- [ ] Insufficient DNA, same snake twice, generation cap, missing parent, stale
      client balance, and concurrent breed/reroll attempts fail safely without
      duplicate child, deduction, or history.
- [ ] Breeding history records both parents, child, cost, traits, and exact
      lineage outcome without exposing another player’s data.

### Collection/API privacy shape

- [ ] Authenticated `GET /api/collection` returns only the caller’s mapped
      snakes plus their DNA balance. The caller’s own internal IDs may be
      present; raw joined database rows, auth/email/billing fields, service
      secrets, and other players are absent.
- [ ] The public variant catalog exposes only catalog affinity fields, never an
      owner’s snake-specific lineage or traits.
- [ ] Unauthorized and invalid-token collection/breeding/lineage requests are
      rejected; changing a body ID cannot read or mutate another player’s snake.
- [ ] Collection, unlock, breeding, lineage-select, and reroll responses use the
      same sanitized lineage shape: one or two known strains, strength 0–2, and
      a primary only when it belongs to a dual lineage.

### Codex

- [ ] Before 15 banked runs the Lab does not expose the Codex link and `/codex`
      gives a correct locked-progress message.
- [ ] Once unlocked, Codex displays completion, all five strain milestone
      tracks, splice discoveries, and per-gene pick/bank stats.
- [ ] First Expression per strain grants 150 DNA once; first Apex per strain
      grants 400 once; first splice grants 250 once.
- [ ] Undiscovered genes/splices conceal intended information while discovered
      entries reveal name, effect, cost, strains, and accurate stats.
- [ ] Refreshing, replaying, or submitting the same run cannot duplicate Codex
      rewards.
- [ ] 100% completion grants Genome Weaver once and displays it as unlocked.
- [ ] Codex is free for every eligible player and has no Premium power gate.
- [ ] **Feel:** breeding creates a meaningful starting strategy and the Codex
      encourages experimentation rather than checklist grinding.

## Focused regression — FTUE v2 player flow and interruptions

Apply migration 037, run the application with `NEXT_PUBLIC_FTUE_V2=true`, and
use a clean browser context with a genuinely new anonymous identity.

Release evidence (2026-07-23):

- Migration `037` passed repeated, concurrent, preservation, repair, permission,
  uniqueness, equip, and unlock-and-equip checks before hosted application.
- The exact application release passed TypeScript, full ESLint, 225 Jest suites
  / 2,857 tests, a production build with 81 routes, and credential/diff checks.
- Protected canary and public production each passed all 14 focused real-server
  Playwright checks. Post-production logs contained no errors or HTTP 500s.
- After final production browser verification, all 283 hosted players had one settings
  row and exactly one equipped snake matching `active_snake_id`; zero players
  were inconsistent.
- The temporary canary alias and test-only bypass credential were removed after
  promotion. The prior deployment remains intact for rollback.

- [ ] Launch state progresses through authenticating → bootstrapping → loading
      run; duplicate clicks stay disabled and the label reads “Launching…”.
- [ ] A bootstrap or run-start failure stays on Home with an announced Retry;
      it never redirects to Lab and never spends energy twice.
- [ ] The active PRIMAL starter is resolved from catalog data, granted once,
      equipped once, and returned with `needsStarterSelection: false`.
- [ ] Two simultaneous bootstrap requests return the same owned/equipped snake.
      Existing equipped snakes, selected dynasties, DNA, energy, records, and
      collection rows remain unchanged.
- [ ] A player with owned snakes but broken/missing equipment is repaired from
      existing ownership before any starter grant.
- [ ] Home Launch creates one server session; `/game?launch=ftue-v2` consumes it
      once and does not issue a second start request or energy deduction.
- [ ] The first board shows exactly the minimal movement prompt. Safe keyboard
      and touch-flick directions start; unsafe reversal/Space do not.
- [ ] Before the first result there is no automatic starter chooser, Lab, account,
      Contracts, Season, offline-reward, identity, or tutorial modal and no
      automatic meta-system redirect.
- [ ] A direct `/game` visit with an incomplete setup self-repairs; if the
      critical repair fails, the screen returns to Home Retry rather than
      directing the player to Lab.
- [ ] The first result contextualizes DNA and offers (but does not open) Lab.
      Lab discovery, account preservation, and identity use the shared badge /
      notification center and clear only on the appropriate destination/action.
- [ ] Intentionally opening Lab clears its badge, offers unlock-and-equip in one
      transaction, includes “Play with this Snake,” and provides a clear Home
      route without an automatic account prompt.
- [ ] Consent and Launch bounding boxes never intersect at every viewport in the
      next matrix; Customize remains scrollable, safe-area-aware, keyboard
      reachable, and uses 44px controls.
- [ ] With `NEXT_PUBLIC_FTUE_V2=false`, the rollback route remains coherent and
      does not corrupt players created under v2.

## Focused regression — HUD, board geometry, and responsive layout

Run every viewport once at score zero and once after the first food makes all
live telemetry appear:

Run Cockpit v1 release evidence (2026-07-24): the exact production bundle
passed the matrix locally and again on `supasnake.com` without retries. Every
visible telemetry/status/control/decision/input zone was sampled atomically
with the real WebGL board and proved non-intersecting. The authored background
hash remained unchanged. Physical-device checks listed below remain manual.

- [x] 320×568 mobile portrait.
- [x] 375×667 mobile portrait.
- [x] 390×844 mobile portrait.
- [x] 844×390 mobile landscape.
- [x] 768×1024 tablet portrait.
- [x] 1280×720 desktop.
- [x] 1440×900 desktop.
- [x] 2560×1080 ultrawide desktop.

At each relevant viewport, inspect these HUD states individually and in the
largest legitimate combination:

- [ ] Score 0, before any dynamic bank preview.
- [ ] Immediately after first food.
- [ ] Live portal and BANK/PASS/INFUSE preview.
- [ ] Combo/streak telemetry.
- [ ] Anomaly and Free Play indicators.
- [ ] One through six held genes, including a dual-tag gene/splice.
- [ ] All five strain meters with multiple active tiers.
- [ ] Build Seed/pre-run information and long snake/variant names.

Geometry and quality checks:

- [x] Telemetry decks, tactical-hold status, reset/abandon controls, and browser
      safe areas never intersect the playable board or hide a boundary.
      Strategic decision dialogs are the intentional frozen-state exception.
- [x] Score, DNA, mode/Energy, genes, strains, and extraction risk use stable
      compact instruments without reflowing the board.
- [ ] The canvas starts at the measured HUD boundary on first authenticated
      paint and after every HUD resize; no 200ms-style transient overlap is
      visible. **RECHECK**
- [x] The board remains centered, fully framed, and large enough for reliable
      play. Reduced-height landscape retains at least the current 180 CSS px
      engineering floor and usable controls.
- [ ] Eating the first food, adding/removing a ticker item, taking a gene,
      activating a tier, rotating the phone, and browser chrome expanding do
      not cause a disruptive camera jump, clipping, or input loss.
- [ ] Notch, Dynamic Island, rounded corners, status bar, address bar, and home
      indicator are respected in portrait and landscape.
- [ ] Touch capture covers the intended play region but never steals HUD,
      overlay, pause, or reset button presses.
- [ ] Layout remains premium and internally consistent without changing the
      established visual identity.

## Focused regression — tactical hold and deliberate resume input

Test keyboard and Flick separately, including their distinct queue capacities.

### Initial Ready and manual tactical hold

- [ ] On initial Ready, no engine tick occurs and the pause control is hidden;
      only a legal start input begins movement. **RECHECK**
- [ ] Escape/P or the Pause control during active play enters tactical hold
      exactly once and freezes head, score, timers, pickups, portal windows, and
      animations tied to ticks. No Pause modal appears.
- [ ] Tactical hold keeps the complete board visible indefinitely and exposes
      concise resume guidance plus a secondary Abandon control.
- [ ] Space releases the desktop gate while preserving current heading.
- [ ] A legal direction atomically sets/queues the direction and releases the
      gate; there is no tick between those operations.
- [ ] A duplicate/current direction may release the gate safely.
- [ ] An opposite/reversal direction is rejected and leaves the gate and board
      frozen until a safe input arrives. **RECHECK**
- [ ] A legal flick releases the gate; a rejected gesture gives feedback
      without releasing it.
- [ ] Escape/P while held is a no-op; it cannot bounce into a redundant menu or
      silently resume the engine.
- [ ] Pause and Escape/P cannot re-enter hold during the 600ms rearm period,
      then work normally afterward.
- [ ] Rapid directions at the gate preserve the accepted input and normal
      two-entry queue rules; there is no double loop, skipped cell, or stale
      direction from before the pause.

### Choice overlays

- [ ] Gene, mutation, portal, infusion, and surge choices are dominant centered
      dialogs over the visibly frozen arena, with readable consequences at
      every supported viewport.
- [ ] Gene pick and gene decline both end at the deliberate input gate.
- [ ] Portal PASS ends at the deliberate input gate.
- [ ] Portal INFUSE followed by a gene choice remains frozen across both
      overlays and gates only after the gene resolves.
- [ ] Portal INFUSE at six genes remains frozen through Strain Surge selection
      and gates only after the surge resolves.
- [ ] BANK ends the run and never flashes or enters a resume gate.
- [ ] Only advertised overlay shortcuts resolve a choice: Escape declines a
      gene, and P is the portal PASS shortcut. Space, direction keys, flicks,
      and every unrelated key cannot leak through or advance the
      engine before resolution.
- [ ] Overlay focus is trapped, controls have visible focus, 1/2/3 shortcuts
      match labels, and closing restores a logical input target.
- [ ] Direction keys, Space, flick, pause, and camera shortcuts cannot
      leak through a strategic dialog or destructive confirmation.

### Abandon confirmation

- [ ] Abandon is available only from tactical hold and opens a destructive
      `alertdialog`; it does not alter cockpit geometry.
- [ ] Copy states that current score and run DNA will not be recorded and only
      warns about Energy when the run actually consumed Energy.
- [ ] Keep planning or Escape returns to the same frozen tactical hold. Confirm
      ends the run, clears session/gate/rearm state, and records no run reward.

### Hold-abuse and state cleanup

- [ ] Pause is useful for planning but cannot be toggled every adjacent tick by
      holding/repeating P or Escape.
- [ ] Abandon and Play Again cancel rearm timers and clear all gate/queue state.
- [ ] Backgrounding/foregrounding, visibility changes, resize/orientation, and
      brief network delay do not silently release the board.
- [ ] Long pauses do not change server payout facts or produce impossible event
      timestamps.

## Mobile control pass

- [ ] Chamber, pre-run, board, overlays, result, and bottom navigation fit in
      portrait and landscape without page scroll or bounce.
- [ ] Flick threshold and direction feel deliberate; cyan accepted and rose
      rejected feedback agree with the engine.
- [ ] Chained flicks preserve a legal two-turn L/S sequence; a third unresolved
      flick is rejected before it can turn an intended coil into a U-turn.
- [ ] Touch steering remains flick-only after orientation or refresh; no stale
      control-mode preference can restore a D-pad.
- [ ] `?debug=input` reports recognized flick, queue, rejection reason, and
      timing without changing gameplay.
- [ ] Multi-touch, a second finger, long press, pinch, and an interrupted swipe
      do not inject phantom moves or scroll/zoom the page.
- [ ] **Feel:** skilled flick play seems learnable and fair for a long session.

## Cross-cutting product checks

- [ ] Audio collect, choice, activation, portal, crash, extraction, breeding,
      and UI sounds are distinct, correctly mixed, and not tiring after ten
      runs; mute/volume preferences persist.
- [ ] Color is coherent while dynasty, rarity, strain, danger, and UI accent
      remain distinguishable without relying on color alone.
- [ ] Keyboard navigation, visible focus, dialog roles/labels, readable names,
      44px touch targets, and screen-reader status announcements are present on
      all new controls.
- [ ] Reduced motion, text zoom, browser zoom, and narrow widths preserve every
      decision and result.
- [ ] No screen looks or behaves like a disconnected website panel.
- [ ] No dead end requires browser Back; expected exits preserve progress.
- [ ] Refreshing during a start, choice, result, claim, breed, reroll, or payment
      never duplicates a mutation or reward.

## Auth, privacy, payments, and service smoke

- [ ] Fresh guest can play; anonymous progress upgrade preserves all data; sign
      out/in and another device restore it.
- [ ] Welcome-back gate prevents a returning account from silently starting a
      disconnected guest after site data is cleared.
- [ ] Password reset and account email delivery work through configured SMTP.
- [ ] Consent rejection produces no optional PostHog requests; acceptance
      enables expected events without private payloads.
- [ ] Data export, deletion request, contact, legal, privacy, cookies, terms,
      withdrawal, accessibility, and Impressum routes render and use
      `support@supasnake.com`.
- [ ] Stripe checks use sandbox only. Follow the complete subscription and
      webhook matrix in [Premium and billing QA](../game/QA_PREMIUM_BILLING.md).
- [ ] Sandbox checkout credits the purchased item exactly once; webhook replay
      is idempotent; cancel/failure returns safely; no live-mode identifier is
      present.
- [ ] `/api/health` is healthy, `/game` returns 200, authenticated run start/end,
      collection, Codex, lineage, and breeding calls return expected statuses.
- [ ] Sentry receives a controlled test event with source maps while normal QA
      produces no unexplained new error cluster.

## Engineering release gate

These are agent/operator checks, not a substitute for the human feel pass.

- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes without automated fixes.
- [x] `npm test -- --runInBand` passes (245 suites / 2,944 tests).
- [x] Focused SnakeGameLogic, Genome, lineage, breeding, collection, Codex,
      migration, HUD, and input-gate regression tests pass.
- [x] `npm run build` passes locally and in the Vercel cloud with the intended
      production environment validation.
- [x] Playwright passes the real-game viewport matrix and keyboard/Flick/D-pad
      input matrix without relying only on mocked UI state.
- [x] A disposable local Supabase reset applies migrations 001–038 from zero;
      database lint and migration tests pass without modifying hosted data.
- [x] Linked migration dry-run/list shows local and hosted histories aligned;
      migrations 029, 030, 037, and 038 remain forward-safe and idempotent where promised.
- [ ] Hosted RLS/security checks cover collection, breeding history, lineage,
      Codex rewards, contact records, deletion workflow, and service-role-only
      operations.
- [x] No committed generated Supabase `Database` type artifact currently exists;
      manual schema mirrors (`snake-data-model.ts`, API row mappers, and SQL/TS
      lineage logic) are checked together. If generated types are introduced,
      regenerate them after migration 036 and review the diff.
- [x] Secret scan finds no credentials, `.env` material, tokens, webhook
      secrets, customer data, or exported hosted rows in the diff/history.
- [x] Final `git diff`, untracked-file review, production environment check,
      Vercel cloud build, migration action, and rollback/forward-fix plan are
      reviewed before promotion.

## Release decision and reporting

Before applying migrations or promoting a deployment that affects the hosted
environment, record the exact command/action and meaningful risk for approval.
Never silently change the production deployment during an active QA session.

For each issue, report:

```text
Severity: blocker / high / medium / low / polish
Environment: production / local / preview
Device + browser:
Viewport + orientation:
Account state + banked runs:
Dynasty + snake + run mode:
Steps:
Expected:
Actual:
Repro rate:
Screenshot/video/network evidence:
```

Release is blocked by data loss/duplication, unauthorized access, payment-mode
or entitlement errors, inability to see/control the board, an automatic tick
after a decision, server/client payout disagreement, migration failure, or a
repeatable crash. Cosmetic and tuning findings may ship only when explicitly
accepted and recorded.
