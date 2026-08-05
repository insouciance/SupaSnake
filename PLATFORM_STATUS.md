# SupaSnake platform status

**Updated:** 2026-08-04

**Environment:** operator production, Stripe sandbox

**Canonical URL:** <https://supasnake.com>

## Production

| Item | State |
|---|---|
| Application | Healthy |
| Database | Healthy, Supabase `eu-central-1` |
| Schema | Migrations 001–068 deployed and aligned; no pending migration |
| FTUE | v2 enabled; one-click anonymous PRIMAL bootstrap |
| Run UI | Refined cockpit enabled |
| Practice | Training Lab enabled; deterministic and rewardless |
| Energy | Server-time recovery to 6; 1–6 commitment; nonlinear harvest |
| Clan battle | Automatic positive-Energy eligibility; three days; best five per member |
| Career | Durable run ingress; atomic progression; bounded recognition; server-backed attention and memory |
| Tactical Genome | v2 enabled; player-pulled relics, six loci, 13 shared Genes, three signatures, eight Splices, 2/3/4 neutral Strain ladder |
| Run continuity | Nonblocking save status in the cockpit; only a proven exclusive-lease conflict interrupts play |
| Language | Plain-language vocabulary live across the game, with a mounted glossary |
| Engine rules | `snake-rules-2026-08-05.1` |
| Player-feature baseline | `28d21f1c83f335ad48257fdc0a4966062007b479` |
| Current deployment | `dpl_Ad2ayZ2xdANctBKpcLk2q9vygL3M` (`supasnake-1ic69o9sk-josef-bells-projects.vercel.app`) |
| Previous deployment | `dpl_12zrsvyn4QAcYKAFoA4F1ai4rGwL` (`bf3020c`); schema-safe under forward-only 067/068, but serves the previous rules version and gives up the Side Door treatment, saturation extraction, and the primary sweep |
| Retired pre-Genome artifact | `dpl_EnCt6pRQPqsgWzrohK7r9oYSAssx`; not rollback-safe for issued v2 sessions—use a dual-version flag-off forward release |
| Payments | Test/sandbox mode only |

The current baseline arrived as two deployed trains. The first, `bf3020c`, was
deliberately invisible: PR 69 landed the WP-B server curriculum core and PR 78
its reviewed rollout contract, with PR 74, 75, 76 and 77 carrying docs, CI and
tests. It applied migration 067 and changed nothing a player can see — the flag
is absent from the public manifest, a test enforces that absence, and the
public-surface hash and 22/22 count were unchanged. The second, `28d21f1`,
is player-visible: PR 79 made the settlement sweep the primary settler with
migration 068, and PR 81 shipped the Side Door treatment, saturation extraction,
and the `snake-rules-2026-08-05.1` rules bump.

Each PR passed all ten protected-PR checks, including all four
isolated-Supabase E2E flag shapes, and each merge's post-main push workflows
passed on its exact main SHA. Both trains passed full type checking, lint,
`verify:constitution`, the production build, the deterministic cockpit
verifications, local migrations 001–068 from zero, ordinary and two-session SQL
integration, the production runtime dependency audit, staged and canonical
health, the 16-key `cohesive_release_read_only_v5` schema probe including its
`geneEligibilityContractValid` check, exact cron ownership, and focused
public-production smoke. Production workflows `30948525096` and `30969645760`
deployed them, applying migrations 067 and 068. Detailed evidence is maintained
in `docs/ops/QA_CHECKLIST.md`.

## Player-facing baseline

- Home Launch authenticates, bootstraps, prepares the run, and reaches the held
  board without a mandatory Lab or second Play action.
- PRIMAL is the authoritative starter for a genuinely new player.
- Every accepted earning run is secured before presentation, then feeds one
  coherent Career Spine: a bounded Results recognition sequence, server-backed
  attention, Career Pulse, lineage history, milestones, and personal or
  privacy-safe clan consequence.
- The arena remains centered and clear of routine HUD elements.
- CYBER and COSMIC keep +1 normal body growth; PRIMAL owns the degressive
  +4/+3/+2/+1 body-pressure curve, while ordinary Genome opportunities use their
  own deterministic 6 ± 2-food (4–8) clock.
- Growth and CYBER speed changes use brief, non-blocking board callouts rather
  than permanent cockpit telemetry.
- Board pressure now has one shared physical/committed occupancy model across
  client mechanics, rendering, and server claim validation.
- Long snakes render as stable occupied cells with motion concentrated at the
  head and entering/departing boundaries rather than animating every body unit;
  newly completed tight coils earn a one-shot contact-edge seal.
- Restriction reads as transformed terrain: amber forming cells, matte slate
  solids, and pale Genome-derived source reliefs for arena, Fortress,
  calcification, or rung.
- Desktop uses compact top/bottom telemetry decks; portrait mobile keeps the
  proven composition and short landscape uses symmetric side rails.
- Strategic gene, mutation, portal, infusion, and surge decisions command the
  frozen arena in centered dialogs.
- Ordinary Genome opportunities place one reachable physical relic for 40
  resolved movement ticks. Placement and expiry never interrupt play; only
  deliberate collection rolls candidates and freezes the arena. The next
  interval begins after collection or expiry, and food eaten while a relic is
  live cannot accelerate it. Patient doubles the sampled interval and Ascetic
  suppresses ordinary relics.
- Tactical Loom choices name every contributing Strain at first read through a
  rune, independent family color, and written badge; dual-Strain Genes show both.
  The neutral first view stays compact, while `UNFOLD DETAILS` reveals the direct
  2/3/4 reaction route and Splice consequences without ranking either choice.
  The Loom sits on a transparent, non-clipping backdrop inside a pixel-invariant
  outer shell; it enters by alpha alone, so unfolding or resizing never shifts
  the frame the player is reading.
- The one free Genome Workbench is responsive and direct-manipulation-first;
  `/codex` is a compatibility route into the same instrument and the Research
  Record remains subordinate rather than becoming a duplicate rules surface.
- Genome terrain, target, route, wager, and body effects now resolve through the
  same authoritative mechanics used by validation and receive readable in-board
  feedback. Post-choice guidance is pointer-transparent and keeps the board held
  until deliberate movement.
- Eating Gold Trail's golden food without the Gilded Fork Splice is ordinary
  play. Engine and reducer share one availability predicate, so a fork choice is
  only committed where the Splice actually draws a second cell; the fatal
  `Gilded Fork rejected its board choice` fault can no longer end a live run.
- Interrupted earning runs renew their live continuity receipt and lease when
  resumed; the recovery watchdog no longer lets a stale receipt repeatedly
  interrupt otherwise healthy resumed play.
- A lagging checkpoint is reported, not enforced: the cockpit shows
  `Save catching up · play continues` or `Latest position pending verification ·
  play continues` and there is no blocking `Try Connection` surface. Only a
  proven exclusive-lease conflict interrupts an active run.
- Engine faults are contained to secured-checkpoint recovery and are never
  presented as a death the player did not cause. The COSMIC five-star wave
  preflight routes against physical blockers only and falls back
  deterministically.
- Terminal settlement is strictly session-bound. A successful HTTP response
  alone never opens Results, canonical Free Play receipts are reconstructed on
  the server, and a result still being finalized shows an honest `Finalizing…`
  state rather than an invented outcome.
- A settlement that failed to land can no longer trap an account. The server
  absorbs a stranded terminal run when the next one starts, the client retries
  from server state on a 2s→30s backoff that re-arms itself, and `Start a new
  run` is always available as an escape. This closed a production incident in
  which two accounts sat hard-blocked behind the `Result secured` modal.
- The stranded-settlement class is now closed rather than mitigated, in three
  independent layers: the server absorbs a stranded run on the next start, the
  settlement payload is projected to stay inside its bounds, and migration 066
  raises the database caps so a long run's payload can no longer be frozen at a
  size that could never settle.
- The game speaks one plain vocabulary rather than jargon: THE DROP, BANK and
  RIDE ON, TRADE UP, GOLDEN HOUR, and GOLD, PULSE, COILS, WARP and RISK. A
  mounted glossary is available wherever the terms appear, so a term is never
  the thing standing between a player and the decision.
- The Side Door is a route, not a trap. It reads through a tether, a chevron,
  an arrival beat, and forming Scars, so a player can see where it goes and what
  it costs before committing.
- Filling the board is a win, not a death. A run that runs out of room settles
  as a successful extraction with `extraction_kind` `saturation`, on the same
  settlement path as a portal extraction.
- Settlement no longer depends on the player's tab staying open: the server
  sweep is the primary settler. It has a stranded-terminal driver, takes no
  head-of-line blocking from a single stuck row, and retries on a backoff capped
  at 24 hours without ever giving up.
- Replay, reducer, and wave geometry accept everything legal play can produce.
  Replay poisoning, wave-geometry disagreement, Phase Gate edge cases, and bare
  catches are handled at one source of truth rather than at each call site.
- Every amount the player is shown — Score, DNA, Yield, Depth, Mastery XP,
  costs, pools, thresholds — reads as a whole number through one shared
  formatter. Factors, percentages, durations, and prices keep their decimals,
  and stored values keep full precision; the four-decimal scaled-Yield readout
  that started this is gone.
- Results and Lab action rows are part of their surfaces rather than a dark
  floating tray: transparent, in document order, and on a 320×568 phone the
  Results dock lands inside the first viewport with nothing pinned.
- Pause is a tactical hold, not a menu. Accepted movement resumes; Abandon Run
  is a secondary confirmed action.
- Desktop and mobile accept a turn inside a 25%-tick grace window (capped at
  40ms) and execute it at the next valid movement point; Slipstream retains its
  distinct full-tick benefit.
- Mobile flick input holds at most two unresolved turns and narrowly suppresses
  only a rapid third-turn micro-U that would enter the newly formed neck. It has
  no general steering cooldown or broad collision forgiveness.
- COSMIC remains uninterrupted in normal play. Voluntary tactical holds begin
  at six and gain two at modelled lengths 25 and 40, for ten across the typical
  run; no food wave or tactical object pauses the game automatically.
- The Training Lab provides voluntary drills, circuits, and custom routes;
  attempts are server-replayed and cannot grant run rewards.
- Stored Energy recovers from server time at one unit per hour to a cap of six,
  including partial and offline progress. Run Setup defaults to one committed
  Energy and requires a second explicit confirmation for six.
- Personal credited DNA applies the immutable commitment curve only to normal
  run harvest. Score, Yield, Depth, Mastery, achievements, unlocks, and fixed
  rewards remain commitment-independent.
- A positive-Energy normal run begun during an active clan cycle is assigned
  automatically. Each member's five strongest banked Yields contribute; the
  viewer sees their own replacement threshold and aggregate clan totals.

## Engineering baseline

- Next.js App Router, React, TypeScript strict mode
- react-three-fiber / Three.js rendering
- Zustand client state with deterministic engine logic outside rendering
- Supabase server-authoritative progress, economy, and session settlement
- No progress, reward, recovery request, receipt, attention state, or pursuit
  authority in `localStorage`, `sessionStorage`, IndexedDB, or browser caches
- Stripe, Sentry, PostHog, Discord, and Analyst integrations with documented
  degraded modes
- Jest, Playwright, GitHub Actions, Vercel, and isolated Supabase CI
- Player Evolution (WP-B) server curriculum core and migration 067 are deployed
  but **dormant**: no flag in the public manifest, a test that enforces that
  absence, and no player-visible surface. Treat it as infrastructure in place
  awaiting its rollout decision, not as a shipped feature — `PLATFORM_STATUS`
  describes what players can see, and today they see none of it.
- Merge cadence, as of 2026-08-04: pull requests auto-merge on green
  (`gh pr merge --squash --auto`) and strict up-to-date is off, because
  GitHub's merge queue proved to be organization-only for this account. The
  stated safety nets are the four post-main push workflows on every new `main`
  SHA and the deploy workflow's exact-head gate, which refuses to promote
  anything other than the precise commit it validated.

Production feature defaults:

```text
NEXT_PUBLIC_FTUE_V2=true
NEXT_PUBLIC_HUD_COCKPIT_V1=true
NEXT_PUBLIC_GROWTH_LAB_V1=true  # inert legacy environment value; code retired
NEXT_PUBLIC_LADDER_V1=true
NEXT_PUBLIC_CAREER_SPINE_V1=true  # presentation only; never gates settlement
NEXT_PUBLIC_RUN_FLOW_V1=true  # cockpit Setup and Victory Lap
NEXT_PUBLIC_GENOME_V2=true  # new starts use physical-interaction v2; stamped v1 remains supported
```

The complete 22-flag production set is defined only in
`config/production-public-surface.json`; the list above highlights the
player-flow flags most relevant to this status summary.

## Known follow-ups

These do not invalidate the operator production release:

- Physical iOS Safari and Android Chrome safe-area, browser-chrome, haptic,
  audio, camera, and long-session touch validation
- Owner calibration of PRIMAL's ruled 75/96/120 growth thresholds, plus live-run
  judgement of the coil seal, smoother tail boundary, Genome-derived terrain
  runes, and each source's forming-to-solid transition
- Live Energy tuning: commitment distribution, bank timing, effective reward
  per Energy, progression inflation among high-frequency returners, and whether
  six-Energy attempts become disproportionately attractive
- Live clan tuning: best-five replacement cadence, three-day participation,
  low-Energy skill competitiveness, late-cycle clustering, and generation
  progression during a battle
- Live Career tuning: recognition significance and pacing, Results readability,
  attention noise, lineage-memory usefulness, and clan-consequence clarity
- Live Genome tuning: player-pulled relic pursuit and expiry rates, offer-category
  diversity, DECLINE/Recode frequency, actual 2/3/4 Strain and Splice activation,
  build Yield spread, Dynasty fit, portal mutation costs, and whether any route
  becomes universally dominant
- Monitor pending-settlement age, recovery latency, quarantine volume, duplicate
  end requests, and the ratio of accepted run ends that need asynchronous
  adoption
- Define a reviewed retention policy for routine Career receipts before
  enabling any pruning; permanent milestones and earned history remain durable
- Linked database lint passed with no error and existing non-blocking warnings.
  Address warnings only through a reviewed forward migration; never rewrite
  deployed migration history.
- Migration 061 intentionally closes the retired Career writer. Migration 065
  is additive, but the retired pre-v2 application cannot resume or settle an
  issued immutable v2 contract. Genome rollout incidents therefore require the
  documented dual-version, flag-off forward fix rather than restoring it.
- Final commercial legal review and support-mailbox operating procedures
- Stripe test-to-live review and a controlled real purchase/refund
- `RESEND_API_KEY` if weekly digest email becomes a marketed feature
- Add a deliberate `/robots.txt` policy before public discovery/SEO work

## Sources of truth

- Product direction: `docs/game/GAME_DESIGN_V2.md`
- Genome/buildcraft: `docs/game/TACTICAL_GENOME_V2.md`
- Player flow: `docs/game/PLAYER_FLOW_INTERRUPTION_POLICY.md`
- Cockpit: `docs/game/HUD_COCKPIT_REDESIGN.md`
- Energy and clan battles: `docs/game/ENERGY_COMMITMENT_AND_CLAN_BATTLES.md`
- Career and recognition: `docs/game/CAREER_SPINE.md`
- Monetization: `docs/game/MONETIZATION_STRATEGY.md`
- Production QA: `docs/ops/QA_CHECKLIST.md`
- Environment state: `docs/ops/ENV_MATRIX.md`
- Deployment procedure: `docs/ops/RELEASE_RUNBOOK.md`
- Commercial gates: `docs/ops/LAUNCH_CHECKLIST.md`

The verified state of the game as built — every claim cited to code or a
migration — is `docs/GROUND_TRUTH.md`. Read it before designing or changing any
game system.
