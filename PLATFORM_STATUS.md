# SupaSnake platform status

**Updated:** 2026-08-04

**Environment:** operator production, Stripe sandbox

**Canonical URL:** <https://supasnake.com>

## Production

| Item | State |
|---|---|
| Application | Healthy |
| Database | Healthy, Supabase `eu-central-1` |
| Schema | Migrations 001–069 deployed and aligned; no pending migration |
| FTUE | v2 enabled; one-click anonymous PRIMAL bootstrap |
| Run UI | Refined cockpit enabled |
| Practice | Training Lab enabled; deterministic and rewardless |
| Energy | Server-time recovery to 6; 1–6 commitment; nonlinear harvest |
| Clan battle | Automatic positive-Energy eligibility; three days; best five per member |
| Career | Durable run ingress; atomic progression; bounded recognition; server-backed attention and memory |
| Tactical Genome | v2 enabled; player-pulled relics, six loci, 13 shared Genes, three signatures, eight Splices, 2/3/4 neutral Strain ladder |
| Run continuity | Nonblocking save status in the cockpit; only a proven exclusive-lease conflict interrupts play |
| Language | Plain-language vocabulary live across the game, with a mounted glossary |
| Engine rules | `snake-rules-2026-08-05.2` |
| Player Evolution | **Live.** New players receive the seven-Gene starter curriculum; trials run in THE DROP and unlocks are revealed on Results |
| Public surface | 25 flags, contract hash `127f659c52f7dc6e7dacade7e142870ed9a46a0d70455cc5acaaf3de10e93d4a`; health reports 25/25 with no disabled flags |
| Wardrobe | Server-held; `NEXT_PUBLIC_SNAKE_COSMETICS` live, two cosmetic definitions in the catalog (face + crown) and no food skins by design |
| Presentation | The ratified 90s composition, live behind `NEXT_PUBLIC_NINETIES_COMPOSITION`; board themes SUPA SNAKE ORANGE / CYAN NEON / DARK NEON, HUD in 90s ink |
| Camera | ET-5 canonical framing: pinned azimuth 0, pitch 28, fit 1.00, fov 44, with a four-wall fairness gate and OrbitControls off the live board |
| Brand | The Mark: rebuilt vector wordmark at locked geometry, first favicon, PWA/maskable icon family |
| Player-feature baseline | `230fc68a2b82c8a5bce1836d88b6689a323cc606` |
| Current deployment | `dpl_AfZj1jhbxJfFDwGKgRvRxqvyNNnk` (`supasnake-8h3sqhc3r-josef-bells-projects.vercel.app`) |
| Previous deployment | `dpl_GPsiEqY6i1TbAZ4nVbExnSuUZ2Hm` (`e62d300`); identical schema, surface, hash and rules version; it gives up the relaunched home, setup and HUD |
| Retired pre-Genome artifact | `dpl_EnCt6pRQPqsgWzrohK7r9oYSAssx`; not rollback-safe for issued v2 sessions—use a dual-version flag-off forward release |
| Payments | Test/sandbox mode only |

The current release is the relaunch: 90S-Path, home, setup and HUD redrawn in
the cartoon (PR 107), carrying the previous release record. Nothing about the
contract moved: no migration, the hosted schema stays 001–069, and the public
surface stays at **25 flags** at the same hash, with the manifest verified
untouched before dispatch. The engine rules version is untouched at
`snake-rules-2026-08-05.2`, so open runs crossed the cutover seamlessly. It also
ships the nine-rule pattern library, which is the extrapolation authority for
the remaining surfaces.

The release passed all ten protected-PR checks including the four
isolated-Supabase E2E flag shapes — among them the `rollback` leg, which builds
and runs the INK & AMBER stone board, so the composition's off path is tested
rather than assumed — plus its post-main push workflows on the exact
main SHA, full type checking, lint, `verify:constitution`, the production build,
the deterministic cockpit verifications, local migrations 001–069 from zero,
ordinary and two-session SQL
integration, the production runtime dependency audit, staged and canonical
health, the 16-key `cohesive_release_read_only_v5` schema probe, exact cron
ownership, and focused public-production smoke. Production workflow
`31229536224` deployed it on a clean first dispatch. Detailed evidence is
maintained in `docs/ops/QA_CHECKLIST.md`.

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
  own deterministic 8 ± 2-food (6–10) clock.
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
  resolved movement ticks, on an 8 ± 2-food cadence (6–10 inclusive). Eight
  leaves room for a pick to matter before the next one lands; the trade, ruled
  and recorded, is that build opportunities by food 42 fall from seven to five.
  Placement and expiry never interrupt play; only
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
- Home, setup and the HUD are drawn in the cartoon, on one coherent path from
  home through setup into the game. The white borders are gone — literally: the
  `border-bone` token is no longer served at all.
- Setup is three elements rather than five. The energy reactor collapses when
  it reads 0 = FREE, and game mode is derived from the setup rather than picked
  separately. The anomaly now lives on home.
- The product has a mark. The rebuilt vector wordmark sits on the home screen at
  locked geometry, and the icon family — the first favicon the product has ever
  had, plus PWA and maskable icons — derives from that same source rather than
  from a traced screenshot.
- Arrival feels front-loaded rather than floaty: movement resolves with α 0.45
  and a 0.06 overshoot, owner-ratified as "real crisp and precise, huge
  difference". React is out of the movement hot path entirely — page commits per
  tick fell from 1.2 to a steady 0.0 — so the board's responsiveness no longer
  competes with rendering work.
- The board is drawn in the ratified 90s composition, with three board themes —
  SUPA SNAKE ORANGE, CYAN NEON and DARK NEON — and a HUD in matching 90s ink.
  The whole composition sits behind `NEXT_PUBLIC_NINETIES_COMPOSITION`, and the
  INK & AMBER stone board remains the tested off path.
- The camera is canonical and no longer drifts between sessions or devices:
  azimuth 0, pitch 28, fit 1.00, fov 44, with a four-wall fairness gate so no
  wall is privileged, and OrbitControls off the live board. Board-adjacent art
  is therefore judged at the angle the game is actually played at.
- The wardrobe is server-held. What a player has equipped lives on the server
  rather than in a client constant, so a cosmetic choice survives the browser
  and follows the account. The catalog ships two definitions — a face and a
  crown — and deliberately no food skins.
- The playtest-wave polish batch is closed: tray widths, the HUD suffix, modal
  close-button discipline, portal text fit, and the REPLAY label.
- Mobile steering, lighting and brightness are fixed: flick input steers again,
  lighting holds across zoom levels rather than shifting with it, and the
  quality governor gained a luminance-neutral floor (T4) so dropping a tier no
  longer changes how bright the board reads.
- The game screen is drawn in INK & AMBER: amber `#f2a03f` on ink `#0b1118`,
  with ink outlines and role-chosen stroke weights rather than the previous
  cyan. The palette is the styleguide's, recovered rather than invented.
- The board adapts its cost, never its identity. A governor watches tick
  retention and steps down a four-rung ladder — T0 full look, T1 quarter-
  resolution bloom, T2 terrain out of the shadow-casting pass, T3 no shadow map
  or composer — so a struggling device gets a board that plays correctly rather
  than a prettier one that stutters. Flat toon fills, ink outlines, the slab and
  the amber are present at every tier: two players on different tiers play
  exactly the same game, and one of them is looking at cheaper shadows.
- CYBER's board keeps closing, but it can no longer cut the arena in two. A
  terrain cell that would split the free field into separate regions is skipped
  and laid on a later pass once it no longer partitions anything, so cells the
  player had a route to are never sealed off behind a block. Unlimited inward
  ring progression is unchanged — it is CYBER's ruled trait.
- The carry only charges for doors the player was actually shown. A portal that
  cannot be drawn on a crowded board becomes a debt that is retried until it can
  be placed, rather than counting as met while never appearing; the debt
  survives a resume with the checkpoint.
- The food wave stays alive and the render stays honest: the board no longer
  keeps drawing a food that has already been consumed, so a long run cannot
  reach a state where it flies through food that does not register.
- A new player is taught rather than dropped in. They receive a seven-Gene
  starter curriculum; trials are offered inside THE DROP rather than in a
  separate tutorial mode; unlocks are revealed on Results; the first BANK gets
  its own beat; and the clan handoff is revealed at eight banked runs.
- Anonymous accounts can no longer found a clan, and an OAuth change can no
  longer orphan one. Founding requires a durable account, so no clan can be left
  owned by an identity that cannot come back.
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
- Player Evolution is **live** as of `4e51e817`. The curriculum core shipped
  dormant in migration 067 and was switched on by adding
  `NEXT_PUBLIC_PLAYER_EVOLUTION_V1` to the public manifest — the first change to
  the public-surface contract in the project's history, taking it from 22 flags
  to 23.
- The public surface is defined only by `config/production-public-surface.json`.
  The deploy workflow injects every manifest flag and a freshly computed
  contract hash into both the job environment and the deployment, so a flag
  rollout needs **no** Vercel dashboard mutation. Never pin the contract hash as
  a literal anywhere: it is recomputed from the manifest, and a pinned copy goes
  stale on the next contract change.
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
NEXT_PUBLIC_PLAYER_EVOLUTION_V1=true  # the starter curriculum; the 23rd flag
NEXT_PUBLIC_SNAKE_COSMETICS=true  # the home cosmetics menu; the 24th flag, live since fb25918
NEXT_PUBLIC_NINETIES_COMPOSITION=true  # the 90s composition; the 25th flag, checked in but not yet deployed
```

The complete production set is defined only in
`config/production-public-surface.json`; the list above highlights the
player-flow flags most relevant to this status summary. The 23rd,
`NEXT_PUBLIC_PLAYER_EVOLUTION_V1`, was added by WP-F and went live with
`4e51e817`. The 24th, `NEXT_PUBLIC_SNAKE_COSMETICS`, was added by LF-B and went
live with the Wave-2 release (`fb25918`); the deployed artifact proves that
24/24 contract and hash
`e60cd71ee0ca67a5be81d165b26d0bf8eab337319276862367a9f2b89d158017`. The
checked-in manifest has since gone to **25 flags** and hash
`127f659c52f7dc6e7dacade7e142870ed9a46a0d70455cc5acaaf3de10e93d4a`, adding
`NEXT_PUBLIC_NINETIES_COMPOSITION` for the 90S-A composition — but that flag is
**not deployed**. It ships with the 90S-A release, which carries no migration,
and until that cutover live health correctly reports 24/24 and the current
hash. Never write 25/25 as a live fact before then.

## Known follow-ups

These do not invalidate the operator production release:

- **Constitution §5 amendment is pending (task 44).** Setup shipped as three
  elements, so the shipped surface and the Constitution's §5 element list
  currently disagree. The Constitution is the authority that has to move;
  recorded here so the divergence cannot sit unnoticed.
- The CYBER speed-ramp seed-window flake (task 45) is still open. In the deploy
  agent's words, "it cost a cycle tonight and will again" — the engine's
  `startTime = Date.now()` feeds the relic schedule, so the assertion window is
  wall-clock dependent.
- Mobile chamber wash-out (task 46), pre-existing and filed.
- Two SQL changes are queued for the next Track-A migration and were
  deliberately left out of the flag-on release, which carried no migration: the
  clan RPC-layer anonymous guard (defence in depth behind the route-level guard
  WP-E already ships) and a narrowing of the expire-race continuity predicate.
  Neither is reachable from the curriculum flag.
- Render-tier distribution across real devices is a new observable, reported by
  a Sentry breadcrumb on every tier change. It belongs in the next telemetry
  checkpoint: a population sitting at T2/T3 would mean the ratified look is not
  actually reaching most players, which is a design finding rather than a bug.
- Live Player Evolution tuning now that the curriculum is on: trial completion
  and abandonment, whether the seven-Gene starter pool holds up against real
  play, reveal pacing on Results, and the eight-bank clan handoff moment
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
