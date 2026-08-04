# SupaSnake — Player Evolution & Onboarding

**Version:** 1.1

**Date:** 4 August 2026 (approved 3 August 2026; owner rulings extended 4 August 2026)

**Status:** Product Owner approved · implementation contract for the first
post-Genome-v2 progression release

**Authority:** `docs/PRODUCT_CONSTITUTION.md` v1.14 remains design law. This
contract defines how a new player is taught the existing game, how the live
Genome vocabulary expands, how feature unlocks are introduced, and how personal
mastery grows into clan responsibility. It does not change Genome arithmetic,
Score, Yield, Energy, Lineage, Clan Energy Battle settlement, or the protected
run. Those remain governed by their existing contracts.

**Companion documents.**
`PLAYER_EVOLUTION_STARTER_POOL_SIMULATION.md` carries the measured evidence for
§4.3 and §4.5. `PLAYER_EVOLUTION_LEARNING_EVENTS.md` carries the per-Gene
learning-event catalog required by §4.4.
`PLAYER_EVOLUTION_SERVER_CONTRACT.md` carries the server state, RPC, RLS,
stamping, migration, and rollout boundary required by §8. Where a number appears
in more than one of them, this document is the decision and the others are the
derivation.

**What changed in 1.1.** Three owner rulings and the Package A simulation are
folded in as decided values rather than hypotheses. The starter pool is **seven**
Genes, not six — six cannot fill a six-locus Genome. The Dynasty Signature is in
the run-one pool and the shipped `apexesUnlocked` offer lock is scheduled for
deletion. The clan reveal is the Results *recommended action*, not a new prompt.
Every value the architect set on 4 August 2026 is marked **[H] set 2026-08-04**
and listed for line-by-line owner ratification in §13.

## 1. Outcome and product thesis

SupaSnake's endgame already has a purpose: improve a snake, master a Dynasty,
raise Yield, replace one of five clan contributions, and become someone a small
clan notices. The missing product is the path that makes a first-run player
capable of understanding and wanting that endgame.

The player journey changes motivation in this order:

```text
immediate control
      -> first successful BANK
      -> curiosity about one new rule
      -> deliberate Genome construction
      -> repeatable mastery under pressure
      -> responsibility to named clanmates
      -> lineage, record, and clan legacy
```

The governing sentence is:

> Show the whole future; teach only the next useful decision.

Locked depth is therefore visible and truthful. Live complexity is staged. A
player learns each mechanic by using it in the ordinary game, receives timely
feedback, and can revisit the complete explanation in the Workbench. Unlocking
the vocabulary is onboarding; executing it well is mastery; making that mastery
matter to other people is the long game.

## 2. Binding boundaries

1. **Play remains the teacher and the destination.** No compulsory course,
   tutorial mode, quest checklist, or metagame hub may sit between the player
   and ordinary Snake.
2. **Future depth is transparent.** Every active-ruleset Gene, Strain rung,
   Splice, portal verb, and major system may be inspected before it is usable.
   Locked means "not yet in your live choices," never "secret."
3. **Only live eligibility is staged.** The ruleset roster remains the bounded
   12–16 catalog. Each account has a server-authoritative offer-eligible subset
   that grows through Discovery. Constitution §12.2's floor of 12 binds the
   Dynasty-legal roster, not that per-account subset.
4. **Unlocks teach horizontal options, never power tiers.** A later Gene is
   more demanding or different, not categorically stronger. No rarity color,
   payment, Energy commitment, or generation accelerates eligibility.
5. **One major lesson at a time.** A settlement may recognize several earned
   facts under the Career Spine, but it recommends at most one newly unlocked
   system or Gene lesson. Major system reveals should not share the same beat
   when their thresholds can be separated safely.
6. **Guidance is invited, skippable, replayable, and contextual.** A player may
   choose **Show me** or **Not now**. Accepting guidance may focus one destination
   or rule; declining it never delays the underlying unlock.
7. **Failure can teach.** Once a trial Gene's defining event resolves, success
   or failure completes its live lesson. Crashing while learning never revokes
   eligibility or forces a successful grind.
8. **No account level, tutorial XP, research currency, new daily, or new mode.**
   Durable movement belongs to Discovery, Mastery, or Lineage. Clan remains the
   witness and shared stake, not a fourth progression tree.
9. **The browser is not the curriculum ledger.** Eligibility, selected trial,
   tutorial state, seen state, resolution, and migration provenance are held
   server-side. Device-local storage may not infer player progress.
10. **Social belonging is suggested strongly, never assigned silently.** The
    clan unlock may recommend real clans, founding, or a clan of one. It may not
    auto-enrol the player, fabricate activity, or punish **Not now**.
11. **The infinite horizon contains finite goals.** Endgame surfaces point to a
    next fifth-best threshold, rung, Mastery level, generation, evolution beat,
    rival delta, or honor. "Raise the number forever" is not sufficient copy or
    product structure.
12. **Absence creates no curriculum debt.** Nothing in the teaching journey
    expires, decays, or accumulates. A returning player resumes their next
    lesson and receives at most one relevant refresher.
13. **The curriculum never starves a run.** No eligible pool may be small enough
    that the offer stream stops producing two legal candidates while the Genome
    still has an empty locus. This is a hard gate, not a preference; §4.5 states
    the arithmetic and the simulation proves it.

## 3. The evolving player journey

These stages describe player understanding, not a new account-level UI. A
player may move faster or slower, revisit the Workbench, ignore social play, or
stay on rung zero indefinitely. Bank counts below retain the Constitution's
current activation spine; bracketed ranges are hypotheses to validate before
rollout.

| Stage | Expected horizon | Player question | New responsibility | Product proof |
|---|---|---|---|---|
| **First Coil** | first session, 0 banks | Can I steer, survive, and leave safely? | Move, eat, read danger, BANK | First deliberate input and first BANK |
| **First Genome** | banks 1–3 | What changed my run? | Read one Gene, one Strain reaction, and CONTINUE | Can explain one gain and one cost |
| **Weaving** | banks 4–7 | How do choices combine? | MUTATE, Energy context, first Splice, inheritance | Predicts one Gene → Strain → Splice chain |
| **Belonging** | bank 8 onward | Why does my run matter to others? | Join/found/defer a clan; understand best-five | First eligible contribution is understood |
| **Full Vocabulary** | banks 18–25 [H] | Which tools fit this run? | Resolve remaining Gene trials; reach Apex | Complete offer-eligible roster |
| **Mastery** | complete roster; weeks onward | Can I execute this reliably? | Ladder, M1–M10, Dynasty-specific builds | Better Yield at comparable Score/risk |
| **Legacy** | long term | What have I built and who noticed? | Ascendance, lineage, records, clan rivalry | Finite next target inside an endless history |

The Full Vocabulary horizon is **18–25 validated banks [H]**, matching §4.4.
The earlier "banks 10–25" row was a drafting inconsistency and is retired.

### 3.1 First Coil

- Arrival reaches deliberate movement before a menu tour.
- The first run teaches movement, food, danger, a portal, and BANK.
- The first Genome opportunity is the ordinary **physical relic**: deterministic
  at 6 ± 2 foods, present for 40 resolved movement ticks, and opening the
  Tactical Loom only when the snake deliberately collects it. Ignoring or
  outlasting a relic reveals nothing, consumes no candidate, and mints no Bond.
  Guidance may not convert it into a pushed prompt.
- The run remains real: the board, collision, result, and BANK are ordinary
  authoritative play. Guidance changes presentation and offer eligibility, not
  physics or reward authority.
- The first BANK remains the primary activation hypothesis. A completed crash
  receives honest feedback and Replay, not a consolation unlock cascade.

### 3.2 First Genome

- The first focused Gene read names its gain, meaningful cost, trigger, written
  Strain badge, and affected 2/3/4 route.
- The Dynasty Signature is part of the starter vocabulary; Dynasty identity is
  not withheld as advanced content. **Owner ruling 1, 4 August 2026.**
- The Workbench opens as a reference and plaything, not a mandatory detour. It
  shows the full catalog and the next available experiment. The subordinate
  Research Record holds personal discovery history; it is not a second product.
- CONTINUE, Expressions, and World Signal retain their existing semantic gates.
  Each receives its own contextual explanation when first relevant.

### 3.3 Weaving

- The curriculum introduces liability and spatial mechanics only after the
  player has seen direct target/body consequences.
- A first Splice trial is arranged only after both parents are visible and the
  player has practical experience with at least one parent.
- The Workbench may preview any visible Gene or legal reaction safely. Preview
  does not itself alter live eligibility; ordinary play supplies the proof.
- The implementation must audit the current bank-4 and bank-6 clusters. Energy
  plus MUTATE, and inheritance plus Splices, may be separately revealed even
  when their mechanical gates remain equal.

### 3.4 Belonging

Clan unlock happens before complete Genome mastery. The clan is where developing
competence becomes witnessed, not a lobby reserved for veterans. A new member's
first improvement can matter even when it is not the clan's strongest result.
Results therefore emphasizes entry/replacement and clan-total delta before raw
rank.

### 3.5 Full Vocabulary, Mastery, and Legacy

Completing the active Gene vocabulary is a bounded Discovery milestone. It pays
recognition and understanding, not a permanent multiplier. From that point the
game stops adding routine mechanical verbs and deepens existing ones through:

- per-Dynasty Mastery and the fixed cumulative ladder;
- coherent Genome construction and high-risk execution;
- deterministic breeding, Lineage, and Ascendance;
- personal and clan best-five replacement;
- World Signal, Clan Energy Battle, Ascension, Records, and Chronicle;
- earned visual evolution and credible social proof.

The social layer grows in salience, not mathematical privilege. Clan contribution
remains full-strength Yield and never Score or purchased power.

## 4. Genome Discovery curriculum

### 4.1 Three distinct truths

The product must not use "unlocked" to mean three different things:

1. **Ruleset roster:** all Genes permitted by the active Genome version and
   Dynasty. This remains the bounded catalog used by parity, replay, and history.
2. **Offer eligibility:** the subset the server may place in this account's new
   live offers. This is the staged onboarding state.
3. **Codex history:** factual viewed, offered, threaded, triggered, banked,
   crashed, and Spliced records. History never grants authority by client claim.

The run-start manifest stamps the intersection of ruleset roster, Dynasty
legality, rotation, World Condition, and account eligibility. An in-flight run
never changes when an account unlocks another Gene.

### 4.2 Eligibility states

Each current-ruleset Gene has one server-held eligibility state:

- **VISIBLE_LOCKED** — completely inspectable in the Workbench, excluded from
  ordinary random offers, with a truthful next-step explanation;
- **TRIAL** — selected for introduction and guaranteed as one candidate under
  the bounded trial contract below;
- **OFFER_ELIGIBLE** — available to the ordinary deterministic offer algorithm.

Codex discovery facts remain separate and monotonic. Shelving or rotation may
remove a Gene from a current ruleset roster without deleting eligibility or
history; if it returns under a compatible rule identity, the account does not
repeat onboarding.

### 4.3 Starter pool — seven Genes per Dynasty

The initial offer-eligible pool is **seven Genes per Dynasty**
(**[H] set 2026-08-04**, raised from the drafted six). The size is settled by
arithmetic rather than taste; §4.5 gives the derivation and
`PLAYER_EVOLUTION_STARTER_POOL_SIMULATION.md` gives the measurement.

Each list fills these roles:

- that Dynasty's **Signature**;
- a **partner in the Signature's Strain**, so the Dynasty's own identity reaches
  its Minor rung in two acquisitions;
- one **direct target/execution** Gene;
- one **body/space** Gene;
- one **BANK/contract** Gene;
- one **control/insurance** Gene;
- one **terrain** Gene, which also supplies the seventh legal entry.

The three lists (**[H] set 2026-08-04**):

| Dynasty | Starter pool (7) |
|---|---|
| **CYBER** | `zenith_protocol` · `live_wire` · `gold_trail` · `compound_interest` · `phoenix` · `overgrowth` · `phase_gate` |
| **PRIMAL** | `heartwood` · `live_wire` · `gold_trail` · `compound_interest` · `phoenix` · `overgrowth` · `phase_gate` |
| **COSMIC** | `constellation_crown` · `circuit_run` · `gold_trail` · `compound_interest` · `phoenix` · `overgrowth` · `phase_gate` |

The three differ by exactly one entry — the Signature — plus the one execution
Gene that partners it (`live_wire` for VOLT-signed CYBER, `circuit_run` for
FLUX-signed COSMIC, while PRIMAL's FERAL Signature is partnered by the shared
`overgrowth`). That symmetry is deliberate: it is the mechanical proof that no
Dynasty is presented as the neutral tutorial.

Each list satisfies the six required constraints, verified in code:

- **at least two coherent build directions** — three Strains reach Minor for
  CYBER and COSMIC, two for PRIMAL;
- **at least one reachable Minor without relying on spawn inheritance** — every
  reachable Minor needs exactly two acquisitions;
- **no candidate whose rule depends on a still-locked verb** — `loan_shark` and
  `mirror_wager` both read "portal CONTINUE," which activates at one validated
  bank, so both are excluded from run one;
- **no Dynasty presented as the neutral tutorial and no signature withheld** —
  identical category, Splice, and Strain shape across the three;
- **viable two-choice offers under every legal early-run state** — 0 % starvation
  across 1,600 traversals per Dynasty per cohort;
- **one rule per Gene observable inside a typical early run** — `coilkeeper`
  (eight charging foods) and `wall_rush` (a deliberate charged wall impact) are
  held back to the curriculum for exactly this reason.

Novice comprehension testing (§9.1) still gates rollout. The simulation settles
viability; it does not settle legibility.

### 4.4 Choosing and resolving a trial

After the first BANK, the Workbench may present up to **two [H]** legal next
trials from different decision categories. The player chooses which experiment
the Loom should introduce next and may switch before threading it. No progress,
currency, or prior result is lost by switching.

The selected trial:

- occupies one candidate position in ordinary relic offers until it has appeared
  in **three collected offers** or resolved (**[H] set 2026-08-04**). The
  guarantee is consumed by *collected offers that contained the trial*, never by
  runs: Ascetic runs, Patient's stretched cadence, uncollected or expired relics,
  Free Play, and runs that never produce a relic consume nothing;
- preserves one ordinary candidate plus DECLINE, so guidance never forces a
  build;
- is excluded when its defining action is currently illegal or unteachable;
- remains available after DECLINE, abandonment, disconnect, or an unresolved
  run;
- becomes OFFER_ELIGIBLE when its catalog-authored learning event resolves in
  authoritative play, whether the outcome is success or failure.

**Free Play uses the complete Dynasty roster** (**[H] set 2026-08-04**), matching
the v1 precedent: a showroom is not a curriculum, and Free Play consumes no
trial guarantee and grants no eligibility.

Every Gene definition therefore needs one versioned `learning_event`: target
resolved, portal contract resolved, terrain action attempted, second life
consumed, offer-control effect used, or another deterministic event already
present in the journal. Merely opening a tooltip or previewing in the Workbench
is not proof. The learning event may not require BANK when the Gene itself
teaches crash exposure. The complete catalog, including the two Genes that have
no such event today, is `PLAYER_EVOLUTION_LEARNING_EVENTS.md`.

Only one Gene may complete eligibility per run. The next trial is offered after
the Results explanation is secured, not during the same ceremony. Shared Genes
unlock account-wide; a Dynasty Signature is available with that Dynasty and
does not require three repeated shared-Gene curricula.

The target for complete current-roster eligibility is **18–25 validated banks
[H]** for an engaged new account. This is long enough to space learning and
short enough that vocabulary acquisition does not become the endgame grind. It
is bounded below by §4.5's nine-by-six-banks rule.

### 4.5 Splice dependency and pool health

The curriculum orders compatible parents deliberately. A newly introduced Gene
may reveal future Splice branches immediately, but its partner trial should
arrive only when the player can understand the relationship. The first live
Splice remains gated by the existing six-bank capability.

Two hard arithmetic constraints, both read out of the shipped engine:

1. **Seven is the floor.** `rollGenomeV2Offer`
   (`src/shared/game/genomeV2.ts:3947-3954`) refuses to serve an offer once
   fewer than two unseen legal pool entries remain, and every acquisition *and
   every Recode* permanently consumes one entry because `seen` is built from all
   instances including `replaced` and `ash`. An eligible pool of *n* therefore
   supports at most *n − 1* acquisitions. Six Genes reach five loci; seven reach
   six. A starved run is not cosmetic: `GenomeV2Runtime.openCadenceOffer`
   (`src/lib/game/genomeV2Runtime.ts:750-755`) responds to a null roll by parking
   `nextCadenceOfferAtFood` at `Number.MAX_SAFE_INTEGER`, so relics stop for the
   rest of the run and portals open with no MUTATE.
2. **Nine before Splices.** A Splice fuses two instances into one occupant and
   frees a locus (`genomeV2.ts:1735-1740`), so a splicing run consumes more than
   six Genes — the complete roster averages 7.9–8.3 acquisitions at the six-bank
   cohort. The curriculum must therefore make **at least nine Genes eligible by
   six validated banks** (**[H] set 2026-08-04**), i.e. the starter seven plus
   two resolved trials.

Unlocking more Genes must never make an account strategically worse. Before a
curriculum ships, deterministic simulation must compare every eligibility
prefix by Dynasty and verify:

- offer category diversity and legal two-choice rate;
- reachable 2/3/4 Strain paths;
- reachable Splices after their gate;
- no prefix with a persistent probability advantage over the complete roster;
- no incentive for an expert to avoid a trial to protect a smaller pool;
- no newly eligible Gene that crowds out its own required partner or a whole
  decision category.

That simulation exists: `src/shared/simulation/starterPool.ts`, run by
`npm run simulate:starter-pools`, with its results and headline numbers in
`PLAYER_EVOLUTION_STARTER_POOL_SIMULATION.md`. It is a permanent operating cost:
every roster, weighting, cadence, or catalog change re-runs it, and the pinned
assertions fail loudly when a change invalidates a ratified decision.

Offer gravity may preserve viability and surface lineage/pity influence; it may
not secretly rank a build, guarantee an optimum, or punish full eligibility.

## 5. Guided reveal protocol

Every major feature and Gene introduction uses the same small grammar:

```text
REVEAL -> INVITATION -> CONTEXTUAL PRACTICE -> PROOF -> REFERENCE
```

### Reveal

The authoritative settlement or server projection records the unlock. Results
may present one grouped milestone beat naming what changed and why it matters.
No reveal grants the value it celebrates.

### Invitation

The single recommended next action may say **Show me** or name the destination.
**Not now** dismisses the invitation without hiding the unlocked feature — the
shipped copy idiom, replacing the drafted "Later" everywhere
(**[H] set 2026-08-04**). Results, Replay, Setup, and Launch never wait for a
tour. Every reveal string states an action and its consequence, never a feature
name alone.

### Contextual practice

After **Show me**, the destination may focus one real control or reaction. It
does not disable unrelated navigation, fabricate a fake account state, or demand
clicks that have no gameplay meaning. In-run instruction appears only in the
existing cockpit callout slots, only when the taught trigger is actually
present, and remains subordinate to the protected board. Nothing new renders
between first input and run end.

### Proof

The player performs or attempts the mechanic in ordinary authoritative play.
The server records the existing deterministic event; the client does not infer
completion from a tooltip, animation, or route visit.

### Reference

The **Genome Workbench** and its subordinate Research Record retain the
explanation and can replay the presentation. There is no separate Help
destination and none is added. A returning player receives a quiet refresher only
when their next action requires it.

### Results priority

When several recognitions land on one settlement, the single recommended action
resolves in this order (**[H] set 2026-08-04**, expressed against the shipped
fold in `src/lib/game/resultsNextAction.ts:93-141`):

1. `save-progress` — an anonymous account is one lost device from losing
   everything; nothing outranks it.
2. `claim-handle` — unchanged position.
3. **curriculum / system reveal** — new; inserted above `visit-lab`.
4. `visit-lab` — first completed run.
5. `run-impact` milestone.
6. `open-codex`.
7. `chronicle`.

When a Gene unlock and the eight-bank clan reveal land on the same settlement,
**the clan reveal wins and the Gene reveal defers to the next settlement**. One
major lesson per Results (boundary 5).

### Presentation constraints

- No automatic Home modal or tour over a live run.
- No more than one new-system recommendation per Results.
- No pulsing global badge for optional learning; one destination dot is enough.
- Touch targets, focus order, reduced motion, screen-reader announcements, and
  phone-height containment follow the existing accessibility contracts.
- Guidance copy states an action and consequence, not a feature name alone.
- Telemetry records invitation, Not now, guide start, guide completion, mechanic
  attempt, and reference reopen only with consent.

## 6. Clan handoff

The Serpent unlock remains **8 validated banks**
(`src/lib/serpent/config.ts:45`). The guided handoff is:

1. At the first settlement at or past eight validated banks, the **single
   recommended Results action becomes the clan reveal**: *Your Yield can now
   strengthen a Clan.* No additional prompt is added to Results and the three-layer
   Results cap is untouched. **Owner ruling 2, 4 August 2026.**
2. That action routes to **`/clan`**, where the existing founding flow already
   lives. It is not routed to Compete: the Compete nav item points at
   `/leaderboard` (`src/components/ui/Navigation.tsx:66`), and sending a first
   clan reveal to a leaderboard would teach the wrong thing.
3. One compact explanation shows that positive-Energy normal runs contribute
   automatically, the player's best five count, and BANK secures the result.
4. The player may inspect real suitable clans, found one with preset heraldry,
   begin as a clan of one, or choose **Not now**.
5. The first eligible settlement explains whether the run entered or replaced
   the player's five and the exact clan-total delta.
6. The clan surface then shows the next finite target: fill an empty slot or
   beat the player's own fifth-best result before emphasizing roster rank.

The in-code argument at `src/components/clan/ClanFoundingPrompt.tsx:23-30` —
that a clan prompt may not sit on Results because §12.2 spends all three layers
on one recommended action — is superseded **only** for the fold-chosen action.
That comment is updated to record the ruling rather than deleted, and the
prompt component itself stays where it is.

Suggestions contain only real directory facts: membership policy, available
space, current size, and recent eligible activity. There is no auto-enrolment,
fake population, synthetic chat, forced message, officer quota, or reward for
joining a particular clan. A player who chooses **Not now** keeps a quiet clan
destination marker and may proceed indefinitely without reduced personal play.

Clan recognition should make improvement visible without spamming members.
Eligible first contribution, personal best-five replacement, battle-changing
delivery, Glory assignment, and major Record/Mastery milestones are bounded
server-authored witness events. Routine play is not broadcast.

**Anonymous accounts may not found or own a clan.** No `is_anonymous` guard
exists in any clan route or RPC today, so a guest can currently found and own an
institution they cannot recover. The Belonging package adds the guard using the
established pattern at `src/app/api/checkout/route.ts:70-78`.

## 7. Day-to-day evolution

SupaSnake retains one daily surface and one recurring clan surface. Onboarding
does not add chores.

| Player phase | A normal return looks like |
|---|---|
| Early | Play a run, collect one relic, meet one new idea, BANK, inspect what changed. |
| Developing | Open the World Signal, test one Genome hypothesis, study the result. |
| Clan member | Read the battle state, target an empty/weak best-five slot, commit Energy, choose when to BANK. |
| Veteran | Improve a fifth-best Yield, clear a rung, advance a lineage, or deliver against a rival. |

The Career Pulse may pin one existing pursuit. It does not grant another reward,
timer, streak, or task list. The daily ritual remains ordinary Snake under one
shared condition; the clan battle remains an aggregation of ordinary runs.

## 8. Compatibility and cutover

The curriculum is introduced after the current Genome v2 production release. It
requires a versioned server eligibility contract and a reviewed forward migration.
The exact table, RPC, RLS, stamp, and rollback shapes are specified in
`PLAYER_EVOLUTION_SERVER_CONTRACT.md`.

- Active sessions retain the exact Gene pool stamped at start.
- No historical v1 or v2 run, payout, Codex fact, or Splice discovery is rewritten.
- Every Gene previously threaded, triggered, banked, crashed, or used in a Splice
  under the same rules identity becomes OFFER_ELIGIBLE at migration.
- **Graduation threshold (**[H] set 2026-08-04**):** an account with **≥10 banked
  runs or Mastery ≥3 in any Dynasty** receives the complete legal current roster.
  Those are the existing Apex thresholds
  (`GENOME_V2_CONFIG.ftue.apexAtBankedRuns` / `apexAtMastery`); reusing them means
  the curriculum introduces no new progression number. A veteran is never pushed
  backward into onboarding.
- Other accounts receive credit from authoritative history, then resume at the
  first unresolved curriculum step.
- Missing or malformed eligibility state fails closed to the reviewed legacy
  full-pool behavior during rollback, never to an empty or client-selected pool.
- The run-start response exposes the eligibility-version and stamped pool needed
  for continuity and replay. Flag-off may stop new curriculum assignment but may
  not make an existing run unreadable or erase account eligibility.
- The migration allocates its real number only under `AGENTS.md` merge-time
  coordination; this document reserves no number.

No production mutation, hosted migration, or flag change is authorized by this
contract alone.

## 9. Research and validation plan

### 9.1 Prototype comparison

Before locking the hypotheses, compare three cohorts:

1. complete live pool, current behavior;
2. visible catalog plus staged live eligibility;
3. staged eligibility plus player choice between two next trials.

Use novice Snake players, experienced action-game players, and experienced
buildcraft/roguelike players. Conduct think-aloud reviews after banks 1, 3, 6,
10, and first clan contribution. Do not infer comprehension from clicks alone.

### 9.2 Comprehension questions

A player at the relevant stage should be able to answer, without memorized
terminology:

- What immediate thing did this Gene change?
- What did it cost or put at risk?
- Which Strain route moved?
- What other Gene could react with it?
- Why would BANK or CONTINUE change the outcome?
- After the clan reveal, what makes a run contribute?

### 9.3 Funnel and health metrics

Measure:

- arrival → first input → first terminal result → first BANK;
- first unprompted Replay and Results-to-board time;
- trial invitation Show me/Not now, selection, THREAD, learning-event resolution,
  and later voluntary pick rate;
- correct gain/risk and Strain/Splice comprehension;
- offer diversity and complete-pool graduation time;
- Workbench open and return-to-play rate;
- D1, D7, W4, and voluntary session-exit sentiment;
- clan reveal open, join/found/solo/Not now, first eligible contribution, and
  D30 retention by clan status;
- concentration of clan credit, fifth-best replacement, and whether new members
  feel useful before they rank highly.

All of it is consent-gated, and all of it filters the QA/dev cohort out before
any conclusion is drawn. No metric may be collected from a player who has not
consented, and no veteran (`total_games_played > 0` at migration) is re-onboarded
in order to produce a comparison.

Do not optimize session length, notification opens, or tutorial completion in
isolation. The success signal is voluntary repeat play with better understanding,
not maximum time captured.

### 9.4 Decision thresholds [H]

- If staged eligibility does not materially improve comprehension or D7 over the
  complete pool, keep transparency and remove unnecessary gating.
- If more than 20% of tested players believe a locked Gene is stronger rather
  than merely later, revise language and ordering before launch.
- If a trial is declined repeatedly, test category mismatch and teaching quality
  before adding urgency or reward.
- If full-pool accounts have measurably worse viable-offer rates than curriculum
  prefixes, the catalog or offer algorithm blocks rollout.
- If the clan reveal produces joins without first-contribution understanding,
  fix the handoff before increasing its prominence.
- If **Not now** correlates with healthier retention for a cohort, preserve that
  autonomy; never turn the tour into a gate.

## 10. Implementation packages

Package A (contracts and evidence) is complete: this document, the simulation
harness and its results, the learning-event catalog, the server contract, and
the §13 decision table. The remaining packages are decomposed as work-package
entries in `docs/IMPLEMENTATION_HANDOFF.md` §6c. One package = one branch = one
PR; B precedes C because both touch `session/route.ts` and `genomeV2.ts`.

- **Package B — server curriculum core** (Track A, migration-bearing). The
  eligibility table and RPCs, the vocabulary composer that replaces
  `genomeV2ActivePool(startDynasty)` at run start, the manifest/run-context stamp
  extension, learning-event resolution at settlement, backfill and history credit,
  deletion of the `apexesUnlocked` signature offer lock, and the flag-off legacy
  full-pool fallback.
- **Package C — offer and trial mechanics** (engine/shared). The trial guarantee
  inside the deterministic roll, pool-health guards, eligibility semantics, and
  parity tests.
- **Package D — reveal and guidance surfaces** (Track B). Results fold entries,
  the Victory Lap beat, server-side attention wiring, the guidance primitives,
  Workbench annotation and trial selection, and the first-BANK recognition beat.
- **Package E — clan handoff** (Track B + server). The eight-bank fold pointer,
  first-contribution explanation, `/clan` routing, the anonymous-clan guard, and
  the OAuth identity-linking fix.
- **Package F — telemetry and rollout** (Track B). Consent-gated instrumentation,
  cohort filtering, the new flag plus manifest and env-validation entries, the
  e2e flag matrix, and the rollout/rollback record.

## 11. Acceptance criteria

- A new player reaches deliberate Snake play without a tour or metagame detour.
- The full catalog is inspectable before live eligibility.
- A new account receives only the server-authored starter pool; the client cannot
  add a locked Gene.
- No eligible pool, at any curriculum step, starves the offer stream before the
  Genome's six loci are fillable.
- Every trial preserves an ordinary alternative plus DECLINE and survives Not now,
  crash, reconnect, and response loss.
- Success or failure of the defining learning event unlocks exactly once.
- Active runs retain their stamped pool across unlocks, deployments, and flag-off.
- Existing players retain every historically used Gene and are never regressed.
- Full eligibility cannot be strategically worse than an earlier prefix under
  the approved offer-health simulations.
- Results presents at most one new-system recommendation while Replay and Setup
  remain immediately available.
- Clan onboarding never auto-enrols, clearly explains automatic contribution,
  makes the first personal delta visible, and is closed to anonymous accounts.
- No new currency, account level, daily, mode, paid acceleration, browser progress,
  Score multiplier, or hidden rules are introduced.
- The complete quality and Constitution gates pass before any rollout proposal.

## 12. Research basis

The contract applies, rather than copies, these patterns:

- short tutorials delivered at relevant moments, active demonstration, skip,
  replay, and delayed non-essential systems:
  <https://developer.apple.com/app-store/onboarding-for-games/>;
- timely feedback, practice, just-in-time help, and implicit/gamified instruction:
  <https://doi.org/10.1016/j.heliyon.2022.e11482>;
- competence, autonomy, and relatedness as predictors of enjoyment and future
  play:
  <https://www.selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf>;
- transparent collection unlock conditions followed by Stakes/Challenges mastery:
  <https://www.playbalatro.com/faq>;
- inspectable/choosable unlocks and social milestone witness:
  <https://support.supercell.com/brawl-stars/en/articles/unlocking-brawlers.html>
  and <https://support.supercell.com/brawl-stars/en/articles/records.html>.

SupaSnake deliberately rejects paid unlock shortcuts, automatic clan assignment,
claim debt, opaque rarity power, expiring lessons, and endless checklist growth.

## 13. Owner decision table

Every value the architect set on 4 August 2026, with its rationale and the
evidence behind it. **Ratify or veto per line.** A veto on any row returns that
row to `[H]` and blocks the package that depends on it, named in the last column.
Rows marked *ruling* were decided by the owner and are recorded here for
traceability, not for re-decision.

| # | Decision | Value set | Rationale | Evidence | Blocks |
|---|---|---|---|---|---|
| 1 | Dynasty Signature in the run-one pool | Yes; delete the `apexesUnlocked` offer filter | *Owner ruling 1.* Dynasty identity is not advanced content. Apex *tier activation* keeps its ramp, so this is identity, not power | `genomeV2.ts:3950-3951`; simulation shows a 7-pool still starves with the lock on (`starved = 1.000`) | B |
| 2 | Clan reveal placement | The single recommended Results action, routing to `/clan` | *Owner ruling 2.* Reuses the existing fold and the existing `ClanFoundingPrompt` flow; adds no Results layer | `resultsNextAction.ts:93-141`; `ClanFoundingPrompt.tsx:23-30`; `app/clan/page.tsx:457` | E |
| 3 | §12.2 "floor 12" scope | Binds the Dynasty-legal ROSTER, not the per-account eligible subset | *Owner ruling 3.* Without this the curriculum is unconstitutional by construction | Constitution §12.2 as amended in v1.14 | B |
| 4 | **Starter-pool size** | **7**, not 6 | An *n*-Gene pool supports at most *n − 1* acquisitions; six can never fill six loci, and a starved run permanently stops spawning relics | Every 6-pool: `starvedBeforeFullGenome = 1.000` in all five cohorts. Every 7-pool: `0.000`, `filledAllLoci = 1.000` | B, C |
| 5 | **The three starter lists** | CYBER/PRIMAL/COSMIC as tabled in §4.3 | Identical category, Splice, and Strain shape across all three; both verb-dependent Genes excluded; both late-legibility Genes excluded; Signature Strain reaches Minor in two | `scoreStarterPool(...).passes === true` for all three; 6 of 7 categories; 2 reachable Splices | B, C, D |
| 6 | **Curriculum depth by six banks** | ≥9 offer-eligible Genes | A Splice frees a locus, so a splicing run consumes >6 Genes; the complete roster averages 7.9–8.3 acquisitions at that cohort | `genomeV2.ts:1735-1740`; roster `meanAcquisitions` 7.86 / 7.88 / 8.33 | B, C |
| 7 | **Trial-guarantee semantics** | Consumed by *collected offers containing the trial*, not by runs; expires after 3 or on resolution | A run-counted guarantee is silently spent by Ascetic, Patient, Free Play, uncollected relics, and relic-less runs — all player choices that teach nothing | Relic cadence per Constitution v1.13 overturn #34; `genomeV2Runtime.ts:750-770` | C |
| 8 | **Free Play pool** | Complete Dynasty roster; consumes no guarantee, grants no eligibility | A showroom is not a curriculum; matches the v1 precedent | v1 Free Play behavior | B |
| 9 | **Graduation threshold** | ≥10 banked runs **or** Mastery ≥3 | Reuses the existing Apex thresholds rather than inventing a new progression number | `GENOME_V2_CONFIG.ftue.apexAtBankedRuns = 10`, `apexAtMastery = 3` | B |
| 10 | **Backfill credit source** | `player_codex` rows as the floor; `game_sessions.genome` scan where feasible | Codex rows are the durable, already-indexed record of authoritative use; the session scan is a best-effort improvement, never a requirement | `031_codex.sql:12-21` (`discovery_type IN ('gene','splice','expression','apex')`); `PLAYER_EVOLUTION_SERVER_CONTRACT.md` §6 | B |
| 11 | **Results fold priority** | `save-progress` > `claim-handle` > **curriculum reveal** > `visit-lab` > `run-impact` > `open-codex` > `chronicle` | Account safety outranks every lesson; the curriculum reveal outranks `visit-lab` because it is the run's actual news | `resultsNextAction.ts:93-141` (shipped order verified) | D |
| 12 | **Collision rule** | Clan reveal beats a Gene unlock on the same settlement; the Gene defers | Boundary 5: one major lesson per Results. The clan reveal is the rarer, larger event | §5, boundary 5 | D |
| 13 | **Copy idiom** | "Not now" everywhere; "Show me" retained | "Not now" is the shipped idiom; introducing "Later" would fork the vocabulary | Existing product copy | D |
| 14 | **Attention row shape** | `attention_kind = 'action'` with `destination = 'codex'` | A `'recognition'` row cannot be dismissed — `recognition_never_action_terminal` forbids the terminal states a **Not now** needs. `'codex'` is honest: the Workbench lives there | `061_career_spine.sql:294-296, 310-312` | B, D |
| 15 | **Eligibility state home** | New satellite table `player_gene_eligibility`, not a `players` column | `players_update_own` has `USING` with no `WITH CHECK` and no column-level revoke, so every non-ownership column is client-writable | `001_initial_schema.sql:145-146`; precedent `057_player_ladders.sql:134-158` | B |
| 16 | **Resolution detector** | A bounded monotone field on the run state, written by the reducer — never a settlement-time journal scan | The journal compacts to the last 256 events and resolved targets to 96, so a long run can lose the event that proves the lesson | `genomeV2.ts:1606-1641` | B, C |
| 17 | **Rollout flag** | `NEXT_PUBLIC_PLAYER_EVOLUTION_V1`, added to `config/production-public-surface.json` | Adding it to the manifest is sufficient — `production-env-validation.cjs` derives its flag list from that manifest, so no separate edit is needed | `scripts/production-env-validation.cjs:55`; `production-public-surface.cjs` | F |
| 18 | **Full-vocabulary horizon** | 18–25 validated banks | Harmonizes the §3 stage table with §4.4; the old "10–25" row was a drafting inconsistency | This document, §3 and §4.4 | B, F |
