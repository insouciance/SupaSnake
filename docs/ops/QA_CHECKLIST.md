# SupaSnake QA Checklist

_Last updated: 2026-07-23_

This is the current player-facing QA path for the deployed Genome release. Work
from top to bottom when doing a broad playtest; use the focused matrices near
the end when verifying a fix.

Design references:

- [Game Design v2](../game/GAME_DESIGN_V2.md)
- [Buildcraft: The Genome](../game/BUILDCRAFT_GENOME_DESIGN.md)
- [Player Flow & Interruption Policy](../game/PLAYER_FLOW_INTERRUPTION_POLICY.md)
- [Premium and billing QA](../game/QA_PREMIUM_BILLING.md)
- [Launch checklist](./LAUNCH_CHECKLIST.md)

## Current target and test rules

| Item | Current QA target |
|---|---|
| Production | <https://supasnake.com> |
| Production commit | `f86f8ae` — FTUE v2 player-flow release |
| Vercel deployment | `dpl_76p6GsNbsrp7S6qgVH3RFxm68GLc` |
| Rollback deployment | `dpl_ADggGtqUnAkWJ5j3rYZdg7bdQHZ4` — pre-FTUE production |
| Hosted Supabase | `supasnake`, `eu-central-1`; migrations 001–037 deployed; migration 037 backfill and runtime bootstrap verified |
| FTUE rollout flag | `NEXT_PUBLIC_FTUE_V2=true` in Vercel Production |
| Payments | Stripe sandbox/test mode only |
| Support/legal contact | `support@supasnake.com` |
| Release branch | `release/ftue-v2`; runtime release commit `f86f8ae` |

Migration 037 and FTUE v2 are live. The frozen HUD/Pause visual candidate is
preserved for regression reference and was not deployed unchanged. The release
keeps the established HUD/Ready/Pause visual language, reserves board geometry
in CSS from first paint, and includes only the interaction fixes required for a
safe, deliberate first movement.

Do not use live Stripe keys, products, prices, cards, or webhooks. Do not reset
the hosted Supabase project or delete its test data. Final legal review and
mailbox monitoring are commercial-launch gates, not blockers for this
operator-only deployment.

### Post-production manual rechecks

The automated production acceptance run is green. These tactile and
state-heavy cases still require real-device or exploratory verification:

- Real-device safe areas, mobile browser chrome, touch feel, and camera motion
  while live HUD content changes.
- The full Genome HUD at 844×390 using the released visual treatment, including
  first-food, BANK/combo/anomaly, and one-to-six gene states.
- Real mutation, portal, surge, BANK, and choice-overlay focus journeys.
- The frozen visual candidate's compact HUD and Pause treatment still require a
  product-design rework before they can become a future release candidate.

### Frozen HUD/input candidate evidence (reference only)

The uncommitted candidate was revalidated on 2026-07-23, then frozen because
its HUD/Pause visual design is scheduled for rework. Its evidence is useful for
regression reference, but its compact grid and status-rail presentation are not
the production FTUE design.

- Playwright passed the real game/canvas HUD journey at 320×568, 375×667,
  390×844, 844×390, 768×1024, 1280×720, 1440×900, and 2560×1080. At every
  size the visible Ready surface and all five strain meters stayed inside the
  reserved board/HUD geometry with no horizontal overflow.
- The 844×390 playable viewport is now 236.5 CSS px high (up from the 162px
  production recheck). Short-landscape Ready and planning prompts collapse to
  status rails instead of concealing the board.
- Separate 320×568, 390×844, and 844×390 planning-state screenshots prove the
  “Choose Your Line” rail starts within 24px of the board top, is at most 84px
  high, and leaves at least 180px of visible board.
- The same journey passed deliberate Flick, keyboard, Space, Escape/P, and
  D-pad release; reversal rejection; duplicate-direction release; a 700ms
  frozen hold; the 600ms pause-rearm guard; and return-to-menu behavior.
- Engine regressions cover synchronous PASS, INFUSE → gene, INFUSE → Strain
  Surge, reversal, duplicate direction, queue cleanup, and atomic resume.
  Flick/D-pad component regressions cover accepted and rejected input paths.
- Current candidate gates: TypeScript passed; ESLint passed; Jest passed 224
  suites / 2,855 tests; production build passed; focused Playwright passed.
- Hosted migration history is aligned through 037. Migration 037 was applied
  after an isolated clone, repeated/concurrent bootstrap checks, and a
  restricted logical recovery snapshot; the post-backfill invariant check
  found zero inconsistent players and zero changed progression rows.
  Hosted database lint exits successfully with pre-existing cast/unused-
  parameter warnings in `settle_and_pair_duels`, `reroll_trait`,
  `grant_purchase_rewards`, and `compute_effective_stats`.
- The added/modified/untracked-file credential-pattern scan passed.
- The focused HUD journey uses deterministic authenticated player/collection/
  session responses. Separately, the selective FTUE release artifact passed
  14/14 protected-canary and 14/14 production Playwright checks against hosted
  migration 037, including genuinely new anonymous PRIMAL bootstraps.
- Still manual: real-device safe areas and touch feel, camera motion during
  live HUD changes, first-food/bank/combo/anomaly states, one-to-six live genes,
  real overlay focus, and mutation/portal/surge/BANK UI journeys.

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
- [ ] The fresh FTUE board is completely frozen until a safe arrow/WASD, D-pad,
      or flick direction. Space does not start the first run; later non-FTUE
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

- [ ] A gene pickup appears roughly every 20±5 foods, is distinct from food,
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
- [ ] Digest email is opt-in, guests are prompted to save progress, one message
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
- [ ] FERAL: Thick Hide survives one self-hit by losing tail; Molt periodically
      resets/sheds value with its body floor; Ouroboros rewards only tail-tip
      bites and discounts normal food.
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
- [ ] The first board shows exactly the minimal movement prompt. Safe keyboard,
      touch-flick, and D-pad directions start; unsafe reversal/Space do not.
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

- [ ] 320×568 mobile portrait.
- [ ] 375×667 mobile portrait.
- [ ] 390×844 mobile portrait.
- [ ] 844×390 mobile landscape. **RECHECK**
- [ ] 768×1024 tablet portrait.
- [ ] 1280×720 desktop.
- [ ] 1440×900 desktop.
- [ ] 2560×1080 ultrawide desktop.

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

- [ ] HUD, ticker, pause/reset controls, desktop hints, D-pad, and browser safe
      areas never intersect the playable board surface or hide a boundary.
- [ ] Score, DNA, and energy use consistent telemetry cells and typography;
      dynamic run information uses stable rows instead of reflowing the board.
- [ ] The canvas starts at the measured HUD boundary on first authenticated
      paint and after every HUD resize; no 200ms-style transient overlap is
      visible. **RECHECK**
- [ ] The board remains centered, fully framed, and large enough for reliable
      play. Reduced-height landscape retains at least the current 180 CSS px
      engineering floor and usable controls. **RECHECK**
- [ ] Eating the first food, adding/removing a ticker item, taking a gene,
      activating a tier, rotating the phone, and browser chrome expanding do
      not cause a disruptive camera jump, clipping, or input loss.
- [ ] Notch, Dynamic Island, rounded corners, status bar, address bar, and home
      indicator are respected in portrait and landscape.
- [ ] Touch capture covers the intended play region but never steals HUD,
      overlay, pause, reset, or D-pad button presses.
- [ ] Layout remains premium and internally consistent without changing the
      established visual identity.

## Focused regression — pause and deliberate resume input

Test keyboard, Flick, and D-pad separately.

### Initial Ready and manual pause

- [ ] On initial Ready, no engine tick occurs and the pause control is hidden;
      only a legal start input begins movement. **RECHECK**
- [ ] Escape/P during active play opens Pause exactly once and freezes head,
      score, timers, pickups, portal windows, and animations tied to ticks.
- [ ] “Plan Next Move” closes the menu into “Choose Your Line”; the board stays
      frozen indefinitely until deliberate input.
- [ ] Space releases the desktop gate while preserving current heading.
- [ ] A legal direction atomically sets/queues the direction and releases the
      gate; there is no tick between those operations.
- [ ] A duplicate/current direction may release the gate safely.
- [ ] An opposite/reversal direction is rejected and leaves the gate and board
      frozen until a safe input arrives. **RECHECK**
- [ ] A legal flick and a legal D-pad direction release the gate; a rejected
      gesture gives feedback without releasing it.
- [ ] Escape/P while “Choose Your Line” returns to the Pause menu; Escape/P
      from Pause arms the next move without starting movement.
- [ ] The pause button and Escape/P cannot reopen Pause during the 600ms rearm
      period, then work normally afterward.
- [ ] Rapid directions at the gate preserve the accepted input and normal
      two-entry queue rules; there is no double loop, skipped cell, or stale
      direction from before the pause.

### Choice overlays

- [ ] Gene pick and gene decline both end at the deliberate input gate.
- [ ] Portal PASS ends at the deliberate input gate.
- [ ] Portal INFUSE followed by a gene choice remains frozen across both
      overlays and gates only after the gene resolves.
- [ ] Portal INFUSE at six genes remains frozen through Strain Surge selection
      and gates only after the surge resolves.
- [ ] BANK ends the run and never flashes or enters a resume gate.
- [ ] Only advertised overlay shortcuts resolve a choice: Escape declines a
      gene, and P is the portal PASS shortcut. Space, direction keys, flicks,
      D-pad input, and every unrelated key cannot leak through or advance the
      engine before resolution.
- [ ] Overlay focus is trapped, controls have visible focus, 1/2/3 shortcuts
      match labels, and closing restores a logical input target.

### Pause-abuse and state cleanup

- [ ] Pause is useful for planning but cannot be toggled every adjacent tick by
      holding/repeating P or Escape.
- [ ] Quit and Play Again cancel rearm timers and clear all gate/queue state.
- [ ] Backgrounding/foregrounding, visibility changes, resize/orientation, and
      brief network delay do not silently release the board.
- [ ] Long pauses do not change server payout facts or produce impossible event
      timestamps.

## Mobile control pass

- [ ] Chamber, pre-run, board, overlays, result, and bottom navigation fit in
      portrait and landscape without page scroll or bounce.
- [ ] Flick threshold and direction feel deliberate; cyan accepted and rose
      rejected feedback agree with the engine.
- [ ] Chained flicks preserve legal buffered S-turns without accidental U-turns.
- [ ] Flick/D-pad mode persists as intended and does not change mid-run after
      orientation or refresh.
- [ ] D-pad Up/Left/Right/Down are visible, at least 44×44 CSS px, clear browser
      chrome/home indicators, and remain reachable with the full HUD.
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

- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run lint` passes without automated fixes.
- [ ] `npm test -- --runInBand` passes.
- [ ] Focused SnakeGameLogic, Genome, lineage, breeding, collection, Codex,
      migration, HUD, and input-gate regression tests pass.
- [ ] `npm run build` passes with the intended environment validation.
- [ ] Playwright passes the real-game viewport matrix and keyboard/Flick/D-pad
      input matrix without relying only on mocked UI state.
- [ ] A disposable local Supabase reset applies migrations 001–037 from zero;
      database lint and migration tests pass without modifying hosted data.
- [ ] Linked migration dry-run/list shows local and hosted histories aligned;
      migrations 029, 030, and 037 remain forward-safe and idempotent where promised.
- [ ] Hosted RLS/security checks cover collection, breeding history, lineage,
      Codex rewards, contact records, deletion workflow, and service-role-only
      operations.
- [ ] No committed generated Supabase `Database` type artifact currently exists;
      manual schema mirrors (`snake-data-model.ts`, API row mappers, and SQL/TS
      lineage logic) are checked together. If generated types are introduced,
      regenerate them after migration 036 and review the diff.
- [ ] Secret scan finds no credentials, `.env` material, tokens, webhook
      secrets, customer data, or exported hosted rows in the diff/history.
- [ ] Final `git diff`, untracked-file review, production environment check,
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
