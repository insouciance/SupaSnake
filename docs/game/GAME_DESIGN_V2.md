# SupaSnake — Game Design v2
## Core Loop, Progression & Metagame Overhaul

**Version:** 2.0
**Date:** 2026-07-18
**Status:** APPROVED — implementation phased (see §12); supersedes the stat-bonus and generation-scaling portions of `systems/DYNASTY_SYSTEM_specification_v1.0.md`
**Companion docs:** `systems/CLAN_DUELS_spec.md` (v1 duels — the base the Gauntlet builds on), approved plan + Phase-1 implementation mapping (plan archive)
**Buildcraft note (2026-07-20):** `BUILDCRAFT_GENOME_DESIGN.md` evolves §5 (Mutation Food) and §6 (Traits) into the Genome system — strains, expressions, splices, infusion, lineage. All mechanics, ids and validation proofs in §5/§6 remain valid; the Genome doc layers on top and is authoritative where the two overlap (held cap, Compound Interest tuning, outcome clamps, offer algorithm).

---

## 1. First-Principles Critique of v1

Five structural weaknesses, each of which caps depth or retention. These are not
bugs; they are design decisions that were right for shipping v0.1 and wrong for
a game meant to be played for years.

**1.1 Generation stat inflation (+5%/gen) invalidates skill.**
Every generation adds +5% to base stats. Verified in code: the engine never
reads these stats — they are display-only today — but the *promise* of the
system is linear power growth, and the moment it becomes real, time-invested
beats skill-expressed. A Gen 12 snake piloted badly outscoring a Gen 1 snake
piloted brilliantly is the death of competitive integrity, and players smell it
long before the math bites. This is the single biggest flaw. It gets deleted,
not tuned.

**1.2 Skill expression is one-dimensional.**
The only skill axis is "survive longer while speed creeps up." Every run is
structurally identical: same speed curve, same flat 10-DNA food, same failure
mode. There are no decisions inside a run — only execution of one motor skill.
That gives the game a hard replayability ceiling: once your survival plateau
stabilizes, every run is a rerun.

**1.3 Dynasties are cosmetics wearing stat costumes.**
CYBER +5% speed, PRIMAL +5% DNA, COSMIC +5% size. None of these change how you
*play*. A dynasty should be a reason to come back — "tonight I feel like
PRIMAL" should mean something about the next ten minutes of your hands, not
about a multiplier tooltip. Passive percentages create the illusion of choice
while making every choice feel the same.

**1.4 Clan Duels compare numbers.**
The v1 duel (see `CLAN_DUELS_spec.md`) is well-built plumbing — capped scoring,
ELO, lazy settlement — but strategically it is two clans grinding in parallel
and comparing totals on Sunday. No preparation, no counterplay, no reading the
opponent, no rivalry texture. Clan games retain when Wednesday-night planning
matters; ours has nothing to plan.

**1.5 Energy hard-gates practice.**
Energy (5 cap, 20-min regen) gates *all* play. A skill game that charges you to
practice is fighting its own thesis: the players most likely to love the game —
the ones who want one more attempt at their line — are the ones the wall hits
hardest. Energy should meter *earning*, never *playing*.

---

## 2. Design Pillars

1. **Skill is the multiplier; strategy is the base.** Nothing you own makes
   the snake stronger. What you own changes which game you are playing;
   how well you play it decides everything else.
2. **Dynasty = ruleset.** A dynasty is a different set of physics with its own
   mastery curve, not an art theme with a percentage.
3. **Runs contain decisions.** Mutation offers and extraction banking put
   meaningful, non-obvious choices inside every run (Hades/Balatro build
   variance; push-or-bank tension).
4. **Progression = access and options, never raw power.** Traits are
   sidegrades, mastery is horizontal, seasons add and never wipe, rarity is
   slot potential and cosmetics.
5. **Practice is free.** Energy gates earning runs only. Free Play is
   unlimited and rewardless.
6. **No artificial grind.** No chest timers, no power creep, no energy-walled
   practice, no daily-login DNA faucet — objectives (Contracts) replace
   attendance.

---

## 3. Dynasty Rulesets

A ruleset is a pure, deterministic module (`src/shared/game/rulesets.ts`,
shared client + server) defining `speedForFood(n)`, `foodDnaValue(n)`,
`scoreMultiplier(n)`, extraction cadence, and validation bounds. Integer math
at every observation point; no RNG anywhere in scoring (RNG affects spawn
*timing/placement* only). The server recomputes every payout from
`(dynasty, foodCount, outcome, mutations)` — claims can flag, never inflate.

Score and DNA both flow from the ruleset: `score` is the leaderboard/prestige
number, `foodDnaValue` is the economy number. For CYBER the speed-tier
multiplier applies to **both** — otherwise short explosive runs would be
economically strictly worse than PRIMAL and nobody would main the dynasty
(resolved tension; see §9).

### 3.1 PRIMAL — Steady Growth

> **Player-facing:** *"Fixed speed, forever — but every food is worth more
> the longer you last."*

- **Speed:** constant 200 ms/tick (current `initialSpeed`; tunable 180–200 —
  the classic Snake feel). Speed never changes. Death comes from your own
  body, not the clock.
- **Food value:** `round(10 × (1 + 0.02 × (n − 1)))` for the n-th food —
  compounding patience.
- **Score:** equals cumulative DNA (multiplier ×1 throughout).
- **Identity:** endurance and patience. **Target run:** ~10-minute mastery
  runs approaching the 600 s session cap.

| Food n | Value | Cumulative DNA |
|-------:|------:|---------------:|
| 1      | 10    | 10  |
| 25     | 15    | 310 |
| 50     | 20    | 745 |
| 75     | 25    | 1,305 |
| 100    | 30    | 1,990 |

**How a master plays it differently:** a master treats their own body as the
level. They lay deliberate lane structures ("farming lines"), keep an escape
corridor reserved, and hold greed past exit portals because they know food 80+
pays triple food 1 — then bank on the last plausible portal before the board
chokes. Novices die to panic; masters die to arithmetic, and rarely.

### 3.2 CYBER — Overclock

> **Player-facing:** *"Every 5 foods the world gets faster — and everything
> is worth more. Survive the redline."*

- **Speed tier:** `t = min(floor(n / 5), 4)` — the tier drives both speed and
  multiplier, so *your multiplier IS your speed*. Endpoints anchored to the
  current config (`initialSpeed` 200 → `minSpeed` 50):

| Tier | Foods | ms/tick | Multiplier | Food value |
|-----:|------:|--------:|-----------:|-----------:|
| 0 | 1–4   | 200 | ×1.0 | 10 |
| 1 | 5–9   | 150 | ×1.5 | 15 |
| 2 | 10–14 | 110 | ×2.0 | 20 |
| 3 | 15–19 | 75  | ×2.5 | 25 |
| 4 | 20+   | 50  | ×3.0 | 30 |

- **Multiplier:** `1 + 0.5 × min(t, 4)`, capped ×3.0. Applies to score and
  food DNA: `foodDnaValue(n) = round(10 × multiplier(n))`.
- **Identity:** execution intensity. **Target run:** 2–4-minute explosive
  runs; tier 4 (50 ms/tick) is the hardest sustained state in the game.
- Cumulative DNA: 20 foods = 370; 40 = 970; 60 = 1,570; 80 = 2,170.

**How a master plays it differently:** a master doesn't survive the ramp,
they *pre-plan for it* — tight spiral patterns rehearsed at tier 4 speed,
minimal-input lines, and ruthless banking discipline: they know exactly how
many tier-4 foods their hands can cash before variance kills them, and they
hit the portal one food before that number. Novices bank at 15; masters bank
at 45 and make it look calm.

### 3.3 COSMIC — Flux *(Phase 2)*

> **Player-facing:** *"Chain matching constellations for combos while the
> walls themselves phase open and shut."*

- **Constellation food groups:** every food spawns tagged with one of 3
  constellation glyphs. Eating a food of the *same* constellation within
  **8 ticks** of the previous eat extends the chain: combo multiplier ×1.2 at
  chain 2, +0.2 per chained food, capped **×2.4** at chain 8+. Breaking the
  chain (wrong glyph or >8 ticks) resets to ×1.0. Combo applies to food DNA
  and score. Base food value: flat 10.
- **Wrap phases:** walls cycle **12 s open** (snake wraps to the opposite
  edge) / **8 s closed** (walls kill), with a **2 s telegraph** (edge shimmer
  + audio cue) before every transition. Wrapping mid-chain is the signature
  master move.
- **Speed:** fixed 160 ms/tick (between PRIMAL and CYBER tier 1; tunable).
- **Identity:** adaptation — reading a board state that keeps changing.
- **Validation note:** combos depend on tick timing, which food count alone
  cannot reconstruct. COSMIC payloads therefore report per-food chain state;
  the server applies *bounded trust*: chain length ≤ foods eaten, combo ≤
  ×2.4, total combo-DNA ≤ a per-dynasty ceiling ratio, everything beyond
  caps → clamp + `validated:false`. COSMIC is deliberately the one ruleset
  with statistical rather than exact validation; PRIMAL/CYBER stay exact.

**How a master plays it differently:** masters route by glyph, not proximity —
they will cross the whole board (through a wrap, during the telegraph) to keep
a ×2.2 chain alive, and they time greedy sprawling routes to open-phase
windows while coiling defensively before walls close. Novices play Snake with
extra colors; masters play a rhythm game.

---

## 4. Extraction Banking

The push-or-bank engine. Every run becomes a sequence of escalating decisions
instead of a single slow-motion failure.

### 4.1 Mechanics

- **Exit portal spawn:** first portal spawns when `foodEaten == 15`;
  subsequent portals at previous-spawn-food `+ 12 ± 4` (uniform 8–16,
  injectable RNG). **RNG affects timing only, never payout.**
- **Despawn:** portal lives **90 ticks**, then despawns and the next spawn
  count is rolled. (Ticks, not seconds — so at CYBER tier 4 the real-time
  window is ~4.5 s vs PRIMAL's 18 s. Intentional: banking under Overclock is
  itself an execution test.)
- **Placement:** rejection-sampled like food; never on snake, food, or
  mutation food.
- **Outcomes:** enter the portal → run ends **extracted**, payout
  `floor(raw × 1.25)`. Die → payout `floor(raw × 0.60)` (salvage).
- **HUD preview:** a persistent bank chip shows both live numbers —
  `BANK: 931` / `crash: 447` — and pulses while a portal is on the board.
  The player is never doing mental math; they are feeling the gap widen.

### 4.2 Psychology

Every portal is a loss-framing moment: the ×0.60 salvage line makes the cost
of greed concrete *before* death, and the ×1.25 banked line makes discipline
feel like winning rather than quitting. Passing a portal is an affirmative
bet, not a default — which converts the classic Snake death (frustration) into
a known, chosen risk (regret → "one more run"). The first portal at 15 foods
arrives early enough that novices learn banking before they learn dying.

### 4.3 Multiplier stacking

Account multipliers apply *after* the outcome multiplier, single floor at the
end: `payout = floor(raw × outcome × streak × set × clanDuel)`.

| Layer | Values | Notes |
|-------|--------|-------|
| Outcome | ×1.25 banked / ×0.60 died | per run, from ruleset |
| Streak | ×1.05 / ×1.10 / ×1.20 / ×1.35 (days 3/7/14/30) | **retuned — see below** |
| Set bonus | +10% per completed dynasty, max ×1.30 | unchanged |
| Clan duel win | ×1.05 (following week) | unchanged |
| **Max stack (banked)** | **×2.303** | vs v1 max ×2.867 |

### 4.4 Max-multiplier economy analysis

v1 ceiling (elite 100-food run, flat 10 DNA/food ≈ 1,010 raw; stack streak
×2.0 × PRIMAL passive ×1.05 × set ×1.3 × duel ×1.05 = ×2.867): **≈ 2,900
DNA/run, ≈ 8,700–9,100 DNA/hour** at 3 energy-gated runs/hour.

If v2 kept the current streak tiers (max ×2.0), the banked stack would be
1.25 × 2.0 × 1.3 × 1.05 = **×3.41** on a raw base that itself grew (PRIMAL
100-food raw = 1,990): ≈ 6,790/run ≈ 20,400/hour = **2.24× today's ceiling**.
Unacceptable inflation.

**Therefore streak tiers are retuned to 1.05 / 1.10 / 1.20 / 1.35** (energy
bonuses per tier unchanged). Banked max stack becomes ×2.303 → elite PRIMAL
≈ 4,470/run ≈ **13,400/hour = 1.47× today's ceiling** — inside the ~1.5×
budget. The narrative also improves: the streak system stops being the
dominant multiplier (it dwarfed everything in v1) and becomes a topping,
while the in-run *banked* multiplier — earned by skill every run — carries
the weight. Streak = showing up; bank = playing well. v2 pays the second one
more.

Interaction rule: extraction ×1.25 always stacks with account multipliers;
mutation economic effects (§5) modify **raw** DNA and the outcome multiplier
only (Mirror Wager, Compound Interest), never the account stack — so the
account stack ceiling is a hard, auditable constant.

---

## 5. Mutation Food *(Phase 2)*

> **Genome (2026-07-20):** mutations are now **genes** with strain tags — see
> `BUILDCRAFT_GENOME_DESIGN.md` §1–§5 for the authoritative held cap (6),
> Compound Interest retune (+0.05/held, cap +0.30), seeded offer gravity and
> splice fusion. Everything below remains valid as the base layer.

Run-lasting build variance: rare timed spawns offering a choice of 2
mutations, ~10 in the launch pool. Every mutation is an offer **with a cost**
— sidegrades that bend the run, never straight upgrades.

### 5.1 Spawn & choice rules

- **Spawn:** once per `20 ± 5` foods (first eligible at food 15–25), never
  while another mutation food is on the board. **Despawn: 40 ticks.**
  Distinct visual: a slow-pulsing violet double-helix voxel, unmistakable
  from food or portals.
- **Choice-of-2 UI:** eating it opens a **brief full-pause overlay** — two
  cards, name + one-line effect + one-line cost, readable at a glance; input
  locked for 300 ms to prevent accidental picks; tap to choose, game resumes
  instantly. Deliberately **not** slow-mo (rejected: non-deterministic under
  frame variance, hostile on mobile). Deterministic pause keeps replay and
  recompute clean.
- **Offers:** drawn from the player's unlocked pool (base 10 + mastery
  unlocks §7.1 + seasonal §7.2, minus Gauntlet bans §8.2). Offer RNG affects
  *options*, never payout math.
- **Stacking:** max **4** mutations held per run; no duplicates; economic
  modifiers multiply in pick order; declining is allowed (close overlay =
  take neither).

### 5.2 The Launch Ten

Effects are one of two kinds — **[E]conomic** (a pure function of food
index/mutation set → server recomputes exactly) or **[P]hysical** (changes
survival rules, never the payout formula). This taxonomy is what keeps exact
server validation possible.

| # | Mutation | Effect | Cost |
|---|----------|--------|------|
| 1 | **Gold Trail** [E] | Every 5th food after pickup is golden: ×3 value | Exit portals despawn 30 ticks sooner (60-tick windows) |
| 2 | **Overgrowth** [E/P] | Food +20% DNA | Snake grows +2 segments per food — the board chokes twice as fast |
| 3 | **Wall Rush** [P] | Hitting a wall no longer kills: you slide along it | Food −10% DNA for the rest of the run |
| 4 | **Shed** [E/P] | Every 25 foods, tail resets to length 8 | Food −10% DNA for the rest of the run |
| 5 | **Mirror Wager** [E] | Banked multiplier ×1.25 → **×1.50** | Death salvage ×0.60 → **×0.30** |
| 6 | **Magnet Pulse** [P] | Food within 2 cells is pulled 1 cell/tick toward you | Exit portal interval +4 foods (bank less often) |
| 7 | **Time Dilation** [E/P] | Speed −1 tier (CYBER: tier clamps one lower; PRIMAL/COSMIC: +40 ms/tick) | Food −20% DNA |
| 8 | **Splitter** [E/P] | Food spawns in pairs — collect faster, board more crowded | Each food worth 70% |
| 9 | **Phoenix** [P] | Survive one death (rewind 3 cells at full length, then phase through body and board edges for 12 moves) | On trigger, lose **all** mutation economic multipliers for the rest of the run |
| 10 | **Compound Interest** [E] | Banked bonus +10% per mutation held at extraction (incl. itself; 4 held → ×1.65) | None beyond the opportunity cost of a pick slot — the greed engine |

### 5.3 Server validation

End-of-run payload gains `mutations: [{ id, atFood }]` (pick order + the food
index at pickup). The server:

1. **Legality:** each `id` ∈ player's unlocked pool, not Gauntlet-banned for
   counted runs, no duplicates, count ≤ 4.
2. **Count bound:** picks ≤ `floor(foodCount / 15)` (cadence 20±5 means the
   k-th mutation food cannot exist before food 15k); each `atFood` ≥ 15 ×
   pick-index and ≤ foodCount.
3. **Exact recompute:** applies each [E] effect from its `atFood` onward
   inside `computeRunTotals`, then outcome/Wager/Compound math. **The server
   pays its own recomputed number regardless of the claim** — mismatch flags
   `validated:false`, never inflates.
4. Phoenix note: its economic effect is strictly payout-*reducing*, so
   under-reporting a trigger has no inflation vector; the honest client
   reports `phoenixTriggeredAtFood` for analytics.

---

## 6. Traits & Breeding Rework *(Phase 3)*

> **Genome (2026-07-20):** traits are now **Heirloom genes** (strain-tagged,
> grant starting strain points) and variants carry **Lineage** — see
> `BUILDCRAFT_GENOME_DESIGN.md` §7–§8. Effects, slots and inheritance below
> remain valid as the base layer.

Traits replace generation stats: permanent, snake-bound **sidegrades** that
tilt *how* a snake earns, never *how much* on net. Breeding becomes trait
crafting.

### 6.1 Slots

- **Common variants: 1 trait slot. Rare and above: 2 slots.** Hard cap 2 —
  rarity is slot *potential* + cosmetics, never stats.
- **Generation = prestige.** `collected_snakes.generation` survives as a
  badge ("Prestige Gen N") **plus one unlock: at Gen 3 a lineage gains its
  2nd trait slot regardless of rarity.** A lovingly-bred Gen 3 common equals
  a fresh legendary in capability — identity, not power.

### 6.2 The Launch Eight

| # | Trait | Effect | Tradeoff |
|---|-------|--------|----------|
| 1 | **Scavenger** | First 15 foods +30% DNA | Foods after 50: −10% |
| 2 | **Gambler** | Banked ×1.25 → ×1.35 | Salvage ×0.60 → ×0.45 |
| 3 | **Ascetic** | All food ×1.4 base value | Mutation foods never spawn — no builds, pure snake |
| 4 | **Iron Scales** | Survive one board collision per run (edge or locked cell) | Food −10% DNA |
| 5 | **Magnetism** | Food within 1 cell pulled toward head | Exit portal interval +2 foods |
| 6 | **Sprinter** | First 10 foods ×1.2 (dynasty-agnostic by design) | Foods after 50: ×0.9 |
| 7 | **Patient** | Banked bonus +10% (×1.25 → ×1.35, stacks with Gambler to ×1.45) | Mutation food spawn rate −50% |
| 8 | **Hoarder** | Death salvage 70% (vs 60%) | Bank bonus +15% (vs +25%) — low variance both ways |

All economic trait effects are food-index-deterministic → exact server
recompute, same taxonomy as §5.2. Equipped traits ride the session start
payload and are validated against the equipped snake's server-side record.

### 6.3 Inheritance

- **Breeding roll:** offspring rolls **1 trait from each parent's pool**
  (slot 1 from parent A's traits, slot 2 — if unlocked — from parent B's).
  Same-dynasty rules and DNA costs unchanged from v1.
- **Wild rolls:** newly unlocked variants roll 1 random trait (commons) or 2
  (rare+) at unlock.
- **Reroll tokens** (earned on the free seasonal track, §7.2): redraw one
  inherited trait from the combined parent pool. This is the crafting loop:
  breed toward the pair you want, token the miss.

---

## 7. Mastery, Seasons, Contracts, Free Play

### 7.1 Per-dynasty Mastery

Horizontal, permanent, per-dynasty tracks **fed exclusively by banked DNA**:
extracted runs grant mastery XP equal to `floor(raw × 1.25)` (pre-account-
multiplier, so streaks don't inflate mastery); deaths grant nothing. Mastery
is proof of discipline in that ruleset.

**Level costs (XP to next level):** M1 1,000 / M2 2,000 / M3 4,000 / M4
7,000 / M5 11,000 / M6 16,000 / M7 22,000 / M8 29,000 / M9 37,000 / M10
46,000 — cumulative 175,000. Target: M10 ≈ 70 elite banked runs (~12 h elite
play) or ~60 h mid-skill play per dynasty; tune against live telemetry.

| Level | Unlock |
|------:|--------|
| M1 | Dynasty emblem I |
| M2 | Body trail cosmetic I |
| M3 | **+1 mutation into this dynasty's offer pool** |
| M4 | Board-accent skin |
| M5 | Trail II |
| M6 | **+1 mutation** |
| M7 | Emblem II |
| M8 | Trail III (animated) |
| M9 | **+1 mutation** |
| M10 | Animated "Sovereign" emblem + title |

Mastery mutations are dynasty-flavored sidegrades (e.g., PRIMAL M3
"Deep Roots": +1 food value per 25 foods survived, portals −10 ticks) —
authored per dynasty at Phase 2/3, same [E]/[P] taxonomy and costs discipline.

### 7.2 Seasons

- **Cadence:** 6–8 weeks. **Seasons add and never wipe** — nothing earned is
  ever removed or reset.
- **Content per season:** 2–3 seasonal mutations (in the offer pool all
  season, then join the permanent pool), 1 cosmetic line, the Gauntlet
  playoff (§8.5).
- **Weekly Anomaly board:** one rotating modifier ruleset with its own
  leaderboard, normal DNA rules. Launch examples (×4): **Meteor Shower**
  (food despawns after 60 ticks), **Gold Rush** (all food ×1.5, portal
  interval +6), **Blackout** (visibility radius 6 cells around the head),
  **Twin Exits** (two portals live at once, bank ×1.15 only).
- **Free track** (no premium requirement): cosmetics + **trait reroll
  tokens** at milestones, fed by contract completion XP. The existing battle
  pass structure carries this; its XP sources gain contract completion.

### 7.3 Contracts (dailies rework)

Flat daily-login DNA is deleted. Each day the player is offered **3 contracts
drawn from a pool, picks 2** — objectives about *how* you play, not *that*
you showed up. Rewards: DNA + season-track XP (~150 XP each).

Launch pool (×12): **Banker** (bank 3 extractions — 400 DNA), **Deep Run**
(reach 60 foods in one PRIMAL run — 500), **Redline** (bank a CYBER run from
tier 4 — 500), **Chain Reaction** (hit ×1.8+ combo in COSMIC — 500),
**Mutant** (finish a run holding 3 mutations — 450), **Purist** (bank a
30-food run with zero mutations — 450), **Collector** (eat 120 foods total —
350), **Tither** (contribute 200 DNA to clan research — 300), **Gauntlet
Duty** (post 2 counted Gauntlet runs — 500, scored-window days only),
**Sprinter** (bank within 4 minutes of run start — 400), **Nerve** (pass 3
portals, bank the 4th, one run — 600), **Anomaly Tourist** (complete 1
anomaly run — 400).

Expected daily grant (~800–1,000 DNA for two contracts) ≈ today's daily
login + first-win faucet — economically neutral, behaviorally superior. The
28-day login-cycle *milestones* survive as cosmetic/reroll-token gifts;
login streak (the multiplier) is unchanged apart from the §4.4 retune.

### 7.4 Free Play

- **Unlimited. No energy. No rewards** — no DNA, no XP, no contracts, no
  mastery, no leaderboards (local personal bests only).
- **Everything unlocked:** all three rulesets and the *entire* mutation pool
  (including mutations the player hasn't earned into their earning-run pool)
  — practice is also a showroom.
- Energy meters **earning runs** only; the shop sells earning capacity and
  cosmetics, never power.

---

## 8. Clan Gauntlet *(Phase 4)*

Evolves Clan Duels (`CLAN_DUELS_spec.md` stays the scoring/settlement spine:
capped best-runs scoring, ELO, lazy settlement) into a prepared, counter-
playable weekly rivalry.

### 8.1 Weekly protocol

| When (UTC) | What |
|------------|------|
| **Mon 00:00** | Pairing (rating-adjacent, per duels v1) + **scouting opens**: opponent roster, dynasty mastery levels, last 3 weeks' picks visible |
| Mon–Wed | Both clans deliberate; officers submit picks |
| **Wed 00:00** | **Blind picks lock**, then reveal to both sides |
| **Thu 00:00 – Sun 24:00** | Scored window — counted runs only inside it |
| Mon 00:00 | Settlement (scores frozen, ELO transfer, rivalry record updated), next pairing |

**Roster lock:** the counted roster locks at Monday pairing; joins/leaves
during the week don't affect scoring (anti-mercenary).

### 8.2 Ban & Pick (blind, per clan, per week)

1. **Dynasty ruleset pick:** the clan's counted runs must be in the picked
   dynasty. Reading which ruleset the opponent's roster masters — and
   whether they'll play comfort or counter — is the mind game.
2. **1 clan-tech modifier** (scoring lens for your own clan's week):
   - **Vanguard** — top 8 members count (vs 10); their runs weigh ×1.10.
   - **Deep Bench** — 12 members count; best 25 runs each (vs 30).
   - **Extraction Doctrine** — only banked runs count; weigh ×1.15.
   - *(research-unlocked options: §8.3)*
3. **1 mutation ban vs opponents:** the banned mutation is removed from the
   opponents' offer pools in their counted runs.

Modifiers and bans change scoring weights and option pools only — **zero
effect on DNA payouts**. The pure-skill individual ladder remains traitless,
mutation-default, fixed-rules.

### 8.3 Clan Research tree v1

Funded by **tithes, capped at 500 DNA/member/week** (a 50-member clan banks
at most 25,000/week — no whale can buy the tree). 3 branches × 4 nodes;
per-branch node costs **6,000 / 14,000 / 24,000 / 40,000** (full tree
252,000 ≈ a season of a full clan's capped tithing). Unlocks are **pick
options, cosmetics, and exactly one extra counted-run slot — never stat
power.**

| Node | Protocols (options) | Logistics (structure) | Heraldry (cosmetics) |
|-----:|--------------------|----------------------|---------------------|
| 1 | Modifier: **Anomaly Doctrine** (anomaly-board runs count, ×1.20) | Scouting detail: opponents' mastery deltas | Clan banner frame |
| 2 | Modifier: **Sudden Death** (best 10 runs only, ×1.40 — high variance) | 1 roster substitution/week (injury rule) | Victory fanfare FX |
| 3 | 2nd ban option *choices* (pick your ban from 2 slots' worth of intel — still bans 1) | Early scouting (Sun 12:00 preview) | Board frame in counted runs |
| 4 | Dynasty *split* pick (score 2 dynasties, best-runs pooled) | **+1 counted run per member (30 → 31) — the only numeric node, capped here** | Animated clan title |

### 8.4 Rivalry & anti-P2W analysis

- **Rivalry record:** persistent head-to-head W/L per clan pair; **revenge
  priority** — when ratings are adjacent-compatible, the pairer prefers a
  rematch against a clan you're 1–1 or trailing against within the season.
- **Season playoffs:** final 2 weeks, top 8 by rating, single-elimination
  bracket using the same weekly protocol; champion gets cosmetics + banner
  history, never economy rewards.
- **Anti-P2W:** money can buy energy (earning capacity) but (a) counted
  scoring is best-N-per-member + top-N-members (inherited from duels v1) so
  volume saturates fast, (b) tithes are hard-capped per member per week,
  (c) research grants options/cosmetics and one +1-run slot, (d) all payout
  math is server-recomputed. The richest clan can be *prepared*, never
  *stronger*.

---

## 9. Economy Compatibility

Assumptions: 3 energy-gated earning runs/hour sustained (20-min regen,
unchanged); "elite" = top-percentile execution at that dynasty's target run
length; account stack as noted.

**DNA/hour, v1 vs v2** (per-run payout × 3):

| Skill tier | v1 (any dynasty) | v2 PRIMAL | v2 CYBER | v2 COSMIC (est.) |
|------------|-----------------:|----------:|---------:|-----------------:|
| Novice (~20 foods, mostly dies, no stack) | ~630 | ~570 (salvage ×0.60 stings; banking at portal 1 taught in FTUE) | ~500 | ~550 |
| Mid (banks reliably, streak tier 1–2) | ~2,000 | ~3,100 | ~2,800 | ~2,900 |
| Elite (full stack, banked) | ~8,700–9,100 | **~13,400** (100 foods) | ~10,600 (60 foods); theoretical ~14,600 at 80 foods, bounded by `maxFoodPerSecond` + tier-4 difficulty | ~12,000 (90 foods, avg combo ×1.6) |

**Why inflation stays bounded:**
1. The streak retune (§4.4) is the load-bearing change: worst case lands at
   **≈1.47×** today's ceiling instead of 2.24×.
2. Every number above raw food value is deterministic and server-recomputed —
   there is no client-side inflation vector; cheating flags, never pays.
3. Mutations are sidegrades whose economic effects net near ×1.0 by
   construction (every [E] bonus carries an [E] or [P] cost); Compound
   Interest's ceiling (×1.65 banked) requires 4 held mutations' opportunity
   costs.
4. Novice income slightly *drops* (death salvage) until banking is learned —
   the FTUE teaches the first bank at portal 1, food 15.

**Unlock costs:** 26,000 DNA per dynasty — **unchanged**. Mid-skill
completion time shifts from ~13 h to ~9 h of earning play per dynasty: an
acceptable acceleration, because v2 adds long-tail structures beyond
collection completion (mastery to M10, trait crafting, seasonal pools,
Gauntlet research) that v1 lacked. Contracts replace the flat daily faucet at
approximately equal daily value (§7.3), so day-over-day income is flat for
the median player; only the *skill ceiling* pays more, which is the pillar.

---

## 10. Reference Rationale

**Balatro** — mutation choice-of-2 with costs and the Compound
Interest/Mirror Wager greed engines are Balatro's joker economics: builds
emerge from constrained offers, and the best players evaluate offers against
the run they're *in*, not a tier list. Deliberately not copied: run-ending
RNG walls — our RNG affects offers and timing, never payout.

**Hades** — the boon-choice cadence (play is interrupted briefly, choose
between two gods, resume) maps directly to the mutation pause overlay, and
mastery-gated pool expansion (M3/M6/M9) is the Mirror of Night as horizontal
access. Not copied: incremental stat power from meta-progression.

**Vampire Survivors** — CYBER's escalating-intensity fantasy and the
mid-run build snowball (Splitter + Magnet Pulse + Overgrowth stacking) are
VS's compounding chaos. Not copied: the near-guaranteed power fantasy; our
snowballs carry costs and the board pushes back.

**Clash Royale** — season cadence with a free reward track and clan-level
weekly competition rhythm. Deliberately not copied: **chest timers** and
card-level stat power — the two purest artificial-grind patterns in mobile;
v2 has zero timed reward gates and zero purchasable power.

**Brawl Stars** — contracts are its quest system: pick-based, play-shaped
objectives replacing login checkboxes; the free track's cosmetic/utility
(reroll token) rewards follow its pass philosophy. Not copied: brawler power
levels.

**League of Legends** — the Gauntlet's blind Ban & Pick is draft phase for
clans: scouting, comfort-vs-counter picks, and the mutation ban as target
ban. Rivalry records + playoffs import the *narrative* infrastructure of
competitive seasons. Not copied: rune/mastery stat systems.

**Old School RuneScape** — per-dynasty mastery is OSRS skilling: horizontal,
permanent, prestige-signaling, never power. "Seasons add and never wipe" is
OSRS's update covenant. Generation-as-prestige is the untradeable cape. Not
copied: time-gated training for its own sake — mastery XP is banked skill,
not hours.

**Path of Exile** — seasonal mutations entering the permanent pool at
season-end is PoE's league-into-core pipeline: seasons as content trials,
not treadmills. Not copied: character wipes into league starts — nothing
resets.

**Helldivers 2** — extraction banking *is* the Helldivers extract: rewards
are provisional until you leave alive, and the best stories are greedy
almost-extractions. The despawning portal is the Pelican timer. Not copied:
squad-scaling — SupaSnake runs stay solo-authored.

**Diablo IV** — contracts' pick-2-of-3 structure echoes Whispers' rotating
objective boards, and the season-journey→free-track mapping follows its
seasonal chapter rewards. Deliberately not copied: item-power inflation and
level scaling — the exact failure mode §1.1 deletes.

---

## 11. Deletions & Migration

| Deleted | Replacement | Migration / UX notes |
|---------|-------------|----------------------|
| **Generation stat scaling** (+5%/gen, `compute_effective_stats` gen multiplier) | Generation = prestige badge + Gen-3 2nd-trait-slot unlock (§6.1) | Migration 013: `compute_effective_stats` returns base stats (same signature, callers unbroken); `collected_snakes.generation` untouched — zero data loss. UI keeps "Gen N" as "Prestige Gen N"; stat tiles in `VariantDetailModal` become ruleset-explainer text. |
| **Rarity base-stat differences** | Rarity = trait-slot potential (§6.1) + card cosmetics | Flatten in code/display only; leave `snake_variants.base_stats` seed data intact (non-destructive; slot-potential reuses the column family later). |
| **Dynasty stat passives** incl. **PRIMAL +5% DNA** | Dynasty = ruleset (§3) | `dnaMultipliers.ts` drops `getDynastyDnaMultiplier`; stack = streak × set × clanDuel. `dynasties.stat_bonus_*` columns stay (API shape stable) but stop being consumed; comment as deprecated. Starter/detail UI swaps "+5% Speed" for the one-line ruleset explainer — the FTUE dynasty choice becomes *more* meaningful, not less. |
| **Flat daily-login DNA** | Contracts (§7.3) | Daily modal becomes the contract board. 28-day milestone days keep firing cosmetic/reroll-token gifts. Streak multiplier survives with §4.4 retuned tiers — communicate as "streak now boosts what you earn, banking is where the big multiplier lives." |
| **Energy-gated practice** | Free Play (§7.4) | Energy spend moves to earning-run start; "Free Play" entry sits beside "Ranked Run" on the game screen. |
| **`increaseSpeed()` log curve + dead `speedIncrease` config** | `ruleset.speedForFood(n)` | Engine refactor per Phase-1 mapping; `GAME_CONFIG.snake.speedIncrease` deleted. |

---

## 12. Phasing & Playtest Gates

Execution is fully autonomous across four phases (deploy per milestone,
verification battery + e2e per wave, QA checklist maintained); **user
playtest gates are flagged in the QA checklist** at each boundary rather
than blocking the pipeline.

| Phase | Contents | User playtest gate |
|-------|----------|--------------------|
| **1 — Skeleton** | `rulesets.ts` (PRIMAL + CYBER live, COSMIC placeholder), extraction banking + ExitPortal + HUD bank chip, exact-recompute validator, stat flattening (migration 013), streak retune | **Feel-divergence check:** user plays PRIMAL vs CYBER and confirms they feel like different games before Phase 2 begins |
| **2 — Heart** | Mutation system (spawn/choice UI/effect engine/server validation), the Launch Ten, Contracts, Free Play, COSMIC Flux | **Mutation balance check:** user confirms offers feel like decisions (no auto-picks, no never-picks); COSMIC readability check |
| **3 — Depth** | Traits + breeding rework (inheritance, reroll tokens, slot migration), per-dynasty Mastery, rarity repurposing | **Crafting comprehension check:** user breeds toward a target pair unaided; mastery pacing review |
| **4 — Endgame** | Clan Gauntlet (ban/pick protocol, research schema/tree, roster locks, rivalry memory, playoffs), Seasons, weekly Anomaly boards | **First full Gauntlet week** with the user's clan: picks → reveal → scored window → settlement, end-to-end |

Verification per phase mirrors the Phase-1 mapping: deterministic ruleset
unit tests mirroring server recompute, validator recompute/bounds tests,
extraction e2e, and the 90-suite green bar maintained at every commit.
