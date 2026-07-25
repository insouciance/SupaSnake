# SupaSnake — Ground Truth

**Generated:** 25 July 2026
**Repository baseline:** `main` @ fd22c0c
**Production migrations:** 001–038
**Method:** every claim below was read from executing code, SQL migration bodies, or
seed data — never from a design document. Each carries a `file:line` or
`migration:line` citation so it can be re-checked.

---

## How to use this document

This is **what SupaSnake is**, not what it was meant to be. Where a design document
and the code disagree, this file records the code and names the disagreement.

Three labels are used throughout:

- **BUILT** — implemented, reachable by a player, verified.
- **BUILT BUT UNREACHABLE** — implemented and callable, but no UI path leads to it.
- **DECLARED, NOT BUILT** — present in config, schema, or a design doc, with no code
  path that reads it. Dead weight that reads as truth.

> Twenty stale design documents were deleted on 2026-07-25 (recoverable via
> `git log --diff-filter=D`). They described an earlier, abandoned design —
> Lab-centric, ad-supported, EMBER/CRYSTAL/MECHA dynasties, Tower Mode, 500+ variants,
> generation stat scaling. This file replaces them.

### The one-paragraph summary

SupaSnake is a 3D precision snake game whose central decision is *extraction*: a
portal appears, and the player chooses to BANK what they have, PASS for more, or
INFUSE — paying body length for build power. Three dynasties are genuinely different
rulesets, not stat variants. A run-scoped buildcraft system (genes, strains, splices)
layers strategic choice on top of motor skill, and a server-authoritative economy
converts banked runs into a collection and breeding metagame. **The core run is
excellent and the metagame around it is fragmented across roughly a dozen competing
reward surfaces.** Almost everything is already built; very little has been cut.

---

# 1. The actual player loop

```
Open supasnake.vercel.app
    │
    ▼
Specimen Chamber (src/app/page.tsx) ── 3D snake, wordmark, one mission line, LAUNCH
    │                                   A guest sees no DNA, no energy, no menus.
    ▼
LAUNCH → signInAnonymously() → POST /api/player/bootstrap → RPC bootstrap_player
    │      (migration 037) grants + equips the active PRIMAL starter, idempotently
    ▼
Board ready → deliberate first input begins the run
    │
    ▼
Navigate · eat · grow · read space
    ├── gene offer every ~20±5 foods → pick 1 of 2 (cap 6 held)
    ├── strain points accumulate → minor / expression / apex thresholds fire
    └── portal spawns at food 15, then every ~12±4
            ├── BANK    → ×1.25 payout, run ends
            ├── PASS    → portal clears, run continues, next portal rerolled
            └── INFUSE  → pay ≤4 tail segments; +0.05 bank, −0.05 salvage,
                          +2 food portal delay; grants a gene, or a Strain
                          Surge if already at the gene cap (max 3 per run)
    │
    ▼
Crash (×0.60 salvage) or Extraction (×1.25 bank)
    │
    ▼
Results — up to 14 conditional sections, 2 nested sub-panels, 6 toast variants
    │        and 3 persistent notifications, then pivots straight into 6 next-run
    │        setup controls with no visual break (see §6.3)
    ▼
Replay · Lab · Home · Chronicle · Leaderboard · Clan · Shop · Training
```

**The beginning of this loop is clean. The end is not.** That asymmetry is the single
most important product fact in this document.

---

# 2. The core run

This section is the crown jewels. Everything here works, is server-verified, and
should be treated as protected unless there is overwhelming reason otherwise.

## 2.1 The three dynasty rulesets

All three share `EXTRACTION_DEFAULTS` (`src/shared/game/rulesets.ts:103-108`): first
portal at food 15, subsequent interval `12 ± 4` foods, portal lifetime 90 ticks before
modifiers.

### PRIMAL — compounding greed
`rulesets.ts:125-132`
- Speed: constant 200 ms/tick (`GAME_CONFIG.snake.initialSpeed`, `game.ts:35`).
- Food *n* DNA: `round(10 × (1 + 0.02×(n−1)))` — monotonically increasing, **no cap**.
- Score multiplier: always 1 → flat 10 score/food.
- Validation bound: `maxFoodPerSecond: 1.0`.

The fantasy: every additional food is worth more than the last, so the longer you
survive the more painful it is to lose the run. Pure risk accumulation.

### CYBER — accelerating tempo
`rulesets.ts:110-151`
- Tier = `min(4, floor(n/5))`; multiplier = `1 + 0.5 × tier` → ×1 rising to ×3, capped
  at food 20.
- The multiplier drives **both** DNA and score: `round(10 × mult)`.
- Speed: `max(50, floor(200 / (1 + 0.03 × foodEaten)))` — ramps every single food, not
  per tier, so the pressure is continuous while the reward is stepped.
- `maxFoodPerSecond: 2.5`.

The fantasy: the game speeds up faster than your reward does. The tension is between
a multiplier that stops growing at food 20 and a speed curve that never stops.

### COSMIC — spatial routing
`rulesets.ts:153-221`
- Fixed 160 ms/tick. **Flat 10 DNA/food and score multiplier 1** — the
  payout-authority math is deliberately flat.
- **Constellation** (`rulesets.ts:164-171`): foods spawn in glyph-tagged groups of 3,
  clustered within Chebyshev radius 4 of a group anchor (`SnakeGameLogic.ts:2198-2209`),
  glyph rerolled per wave. Eating a same-glyph food within `chainWindowTicks: 8` of the
  last eat extends the chain; combo = `min(2.4, 1 + 0.2×(chainLength−1))` — ×1.2 at
  chain 2, capped ×2.4 at chain 8+.
- **Flux walls** (`rulesets.ts:179-183`): 75 ticks open (edges wrap), 50 ticks closed
  (edges kill), ~12-tick telegraph before each transition. Physical only — never
  touches payout (`rulesets.ts:207-208`).
- `maxFoodPerSecond: 1.5`.

The fantasy: the board itself is the puzzle. Notably, the combo bonus is **not** part
of `computeRunTotals` — it is layered per-eat in the engine and clamped server-side to
`COSMIC_TRUST_MAX_BONUS_RATIO = 1.4` (`rulesets.ts:198-202`). COSMIC is the only
dynasty whose skill ceiling lives partly in bounded-trust territory.

`normalizeDynastyName` defaults any unrecognized string to `'COSMIC'`
(`rulesets.ts:239-245`) — the conservative payout floor.

## 2.2 Scoring and payout

`FOOD_BASE_SCORE = 10` (`rulesets.ts:100`), `FOOD_BASE_DNA = 10` (`game.ts:45`).

`computeRunTotals` (`rulesets.ts:281-315`) folds `n = 1..foodCount`:

```
rawDna += round(ruleset.foodDnaValue(n) × mod) + flat
score  += round(FOOD_BASE_SCORE × ruleset.scoreMultiplier(n))
```

where `mod` = mutation × trait × anomaly modifiers and `flat` = mutation flat bonuses.

**Score is deliberately gene-, trait-, and anomaly-free** (`rulesets.ts:261-267`). Only
CYBER's built-in multiplier and COSMIC's client-layered combo affect it. This is a
strong, deliberate design decision: *the leaderboard measures play, not build*. It
should be protected.

Under genome rules, `computeGenomeRunTotals` (`rulesets.ts:441-504`) applies the same
fold with a per-food floor for the Tithe gene, and leaves the score formula identical.

## 2.3 The extraction system

**Spawn** — `spawnExit()` fires when `!exitTile && foodEaten >= nextExitAtFood`
(`SnakeGameLogic.ts:1371-1373`), initialized to food 15 (`:685`). After a portal is
consumed or despawns, the next interval is `12 ± 4` plus additive penalties
(`:2564-2598`): magnet_pulse +4, magnetism trait +2, gold_rush anomaly +6, FLUX
expression +2, FLUX apex +3, pocket_rift +2, black_magnet +4, **and +2 per infuse
already taken**.

**The trichotomy** — stepping onto the portal opens `pendingPortalChoice`
(`SnakeGameLogic.ts:1188-1210`) rather than banking immediately.
`resolvePortalChoice()` (`:1673-1687`):

| Action | Effect |
|---|---|
| **BANK** | `finalizeRun('extracted')`. Payout × `BANK.extractMultiplier = 1.25` (`rulesets.ts:89-94`), hard-clamped at 1.75 under genome (`strains.ts:217`). |
| **PASS** | `consumePassedPortal()` (`:1690-1698`) clears the portal, rerolls the next interval, run continues. |
| **INFUSE** | `performInfuse()` (`:1701-1732`). See below. |

**INFUSE** requires infuses-used < 3 and snake length ≥ 8 (`strains.ts:288-290`). It
costs `min(4, length − initialLength)` tail segments (`infuseSegmentCost = 4`) and grants:

- bank +0.05, salvage −0.05 per infuse (`strains.ts:209-210`)
- next portal interval +2 foods (`strains.ts:292`)
- a gene offer — **or**, if already at the 6-gene cap, a **Strain Surge**: +1 point to
  a chosen strain, counting toward tier thresholds but never toward the in-run gene
  gate (`SnakeGameLogic.ts:1734-1739`).

**Death salvage** = `BANK.deathMultiplier = 0.6` (`rulesets.ts:93`), clamped at 0.9.

This is the game's best mechanic. It links motor skill, greed, build state, and account
progression into a single legible decision, made with the simulation frozen and the
board fully visible.

## 2.4 Gene offers

Cadence `GENOME_SPAWN` (`genes.ts:289-295`): interval `20 ± 5` foods, despawn 40 ticks,
**max 6 held** (legacy mutation-only mode caps at 4, `mutations.ts:274`). Always **2**
genes offered per choice.

Pool: `GENE_POOL` = 22 legacy mutations + 12 genome-era genes = **34 total**
(`genes.ts:268-279`; the 12 are 9 base + 3 dynasty signatures). Mastery, seasonal and
lineage-signature genes are added server-side.

Selection is a deterministic per-offer stream, `mulberry32(fnv1a(runSeed:offerIndex))`
(`offerGravity.ts:25-53`), weighted (`:115-142`):

| Modifier | Weight |
|---|---|
| Base | 100 |
| Per held strain point in the gene's strain(s) | +60, capped +180 |
| Would complete a splice with a held gene | +40 |
| Lineage-strain bias, first 2 offers | +80 |
| Matches the week's anomaly strain | +100 |

Slot 1 has two overrides: lineage strength 2 guarantees a lineage-strain gene at offer
0; and a **pity rule** — if the run's top-point strain got no genes in the last 2
offers, slot 1 is forced to that strain's best gene. Slot 2 is a 25% wildcard drawn
uniformly from zero-point strains, else weighted, excluding slot 1.

This is a genuinely sophisticated offer system. It is also invisible to the player.

## 2.5 Strains

Five (`strains.ts:20-62`): **AURUM** (greed), **VOLT** (tempo), **FERAL** (body),
**FLUX** (space), **UMBRA** (risk).

Thresholds (`strains.ts:99-136`):

| Tier | Requirement |
|---|---|
| Minor | 2 points |
| Expression | 3 points **and** ≥2 in-run genes of that strain |
| Apex | 4 points **and** ≥3 in-run genes of that strain |

Spawn-source points (lineage + heirloom) are capped at 2/strain (`maxSpawnPoints`) — a
player can begin with a minor active but never within reach of Expression without
playing for it. That is a well-judged anti-pay-to-win boundary.

Selected grants (`strains.ts:154-228`, applied `genome.ts:433-463, 543-552, 632-645`):

- **AURUM** minor food ×1.05 → expression "Gilded Wake" (+2/gilded-cell re-traversal,
  capped ≤25% of recompute) → apex "Midas Vein" (≤60% of post-apex recompute, salvage −0.10).
- **VOLT** expression "Arc Lightning" (auto-collect ≤2 foods within radius 3, aggregate
  food ×0.85) → apex "Overclocked Reality" (food ×1.30, tick ×0.75, portal −20 ticks).
- **FERAL** minor absorbs one self-collision (−5 segments) → expression "Molt" (tail
  resets to 12 every 20 foods) → apex "Ouroboros" (biting your own tail tip is a meal).
- **FLUX** minor one free edge-wrap per 30 foods → expression "Rift Aura" (food ×0.9,
  portal +2) → apex "Singularity" (pull radius 4, +10 flat/25 foods, portal +3).
- **UMBRA** minor salvage +0.05 → expression "Phantom Coil" (3 ticks tail-phase per eat)
  → apex "Second Sun" (bank −0.10, salvage +0.10, one-time +150, enables revive).

## 2.6 Splices

A splice fuses a specific pair of held genes into one slot when the second parent is
picked (`splices.ts:167-194`). It is **derived only** — a directly claimed splice id is
dropped and flagged. It counts as **two** in-run genes for threshold gates.

Ten exist (`splices.ts:43-114`): Dragon Hoard, Regenesis, Styx Contract, Gravity Bubble,
Ricochet, Comet Tail, Old Growth, All In, Black Magnet, Molted Rebirth. Each carries a
real cost alongside its benefit (e.g. Styx Contract: bank ×1.50 but salvage locked to
×0.30).

## 2.7 Heirlooms and lineage

Eight traits (`traits.ts:46-103, 246-268`), each tagged to one strain: scavenger→AURUM,
ascetic→AURUM, sprinter→VOLT, magnetism→FLUX, gambler→UMBRA, iron_scales→UMBRA,
patient→UMBRA, hoarder→UMBRA. Max 2 trait slots per snake (`traits.ts:126`).

`startingStrainPoints` (`lineage.ts:115-138`): 1 point from lineage (strength ≥ 1) +
1 point per equipped heirloom trait's strain, capped at 2 per strain.

Lineage strength (0/1/2) is capped by variant rarity (`lineage.ts:46-52`): common and
uncommon → 0, rare → 1, epic and legendary → 2, plus +1 for Gen3+ (`:61-70`).
Default unbred lineage: PRIMAL→FERAL, CYBER→VOLT, COSMIC→FLUX (`:26-30`).

## 2.8 Death, revive, and settlement

A run ends on wall collision, self-collision, or BANK. Before death finalizes, the
engine checks in order (`SnakeGameLogic.ts:2096-2125`): Iron Scales trait save →
FERAL minor Thick Hide → the run's single revive (priority Styx > Molted Rebirth >
classic Phoenix > Second Sun) → else `startDeathSequence` → `finalizeRun('died')` after
800 ms. A classic Phoenix revive **voids economic benefits** from that point
(`genome.ts:368-370`); the others do not.

**Server settlement** (`src/lib/server/gameValidator.ts`) is genuinely robust:

- Duration bounds: claimed ≤ server elapsed + 10 s, ≤ 600 s.
- Rejects `extracted && died`.
- Clamps `food_count` to `ceil(duration × maxFoodPerSecond)` (`:379-413`).
- Sanitizes gene picks for legality, count, and cadence spacing.
- Bounds infuse count against `maxPortalsSpawnable(foodCount) = 1 + floor((foodCount−15)/8)`
  (`:559-561`).
- Clamps all bounded-trust claims via `clampGenomeClaims`.
- **Runs an exact recompute and pays that, never the client's claim** (`:348-527`).
  Mismatches beyond `CLAIM_EPSILON = 1` only raise a validation flag.

This is stronger than the product's visible maturity suggests and should be protected
without qualification.

---

# 3. The economy ledger

## 3.1 DNA faucets

| Source | Amount | Citation |
|---|---|---|
| Run settlement | raw fold × outcome multiplier (bank 1.25 / salvage 0.60) | `rulesets.ts:91-93, 322-324` |
| Victory bonus | +50 flat | `game.ts:47`, `session/route.ts:503, 919` |
| Streak tier | ×1.05 / ×1.10 / ×1.20 / ×1.35 at 3 / 7 / 14 / 30 days | `013:55-58`, mirrored `engagement.ts:42-47` |
| Collection set bonus | ×1.10 per fully-owned dynasty | `dnaMultipliers.ts:39, 62-67` |
| Clan duel win | ×1.05 clan-wide for the following week | `011:399-432` |
| Contracts | 350–600 each; 2/day free, 3/day premium | `015:71-118` |
| Legacy 28-day calendar | 50–150/day, milestones 200/300/500/1000 | `003:15-28`, RPC `009:380-450` |
| Offline passive | `collectionSize × 1 DNA/snake/hour`, cap 24 h (48 h premium) | `offlineProgress.ts:41-55` |
| Achievements | 100–3000 across 18 tiers | `003:78-102` |

The multiplier stack (`dnaMultipliers.ts:119-145`) is `streak × setBonus × clanDuel`,
applied to the settled payout and floored. **Three of the four ways to increase DNA
income have nothing to do with playing well**: showing up daily, owning more variants,
and being in a clan that won.

**Not DNA faucets, despite appearances:** Mastery XP grants no DNA. Codex discoveries
grant no DNA. The Season 1 battle-pass track pays **zero DNA and zero energy** — all 13
tiers are cosmetics, reroll tokens, and a title (`021:113-132`).

## 3.2 DNA sinks

| Sink | Cost | Citation |
|---|---|---|
| Variant unlock | 0 (starters) / 500 common / 1000–1500 uncommon / 2000–2500 rare / **5000 epic** / **10000 legendary** | `006:70-88`, `009:51-131` |
| Breeding | `200 + ((gen1+gen2)/2) × 100` — 300 at Gen1×Gen1, 1200 at Gen10×Gen10 | `018:206`, carried forward `030:262` |
| Lineage reroll | flat 150 | `030:494-587` |
| Trait reroll | 1 reroll token (**not DNA**) | `018:363-450` |

Reroll tokens are minted by migration deploy (+2 one-time, `018:145`) and by five
Season 1 free tiers (`021:119-127`).

## 3.3 Energy

- Cap **5** (`game.ts:51`, per-player overridable via `players.max_energy`).
- Cost **1** per earning run; **Free Play costs 0** (`session/route.ts:156, 174-177, 405-417`).
- Regen **1 per 20 minutes** (`game.ts:53`, `energyRegen.ts:29-80`).
- Grants: streak tiers +0/+1/+2/+3; calendar milestones +2/+3/+5/+10; premium stipend
  +3/day (`028:353-419`); achievements +0–10; purchases (uncapped, `010:86-89`).
- **Only consumer: starting an earning run.** No other consumer exists.

A full bar is 5 runs, then one run per 20 minutes. Free Play is unlimited but grants no
DNA, no mastery, and no leaderboard eligibility.

## 3.4 Mastery XP

`src/shared/game/mastery.ts` — per-dynasty, fed **only by extracted runs**:
`xpGained = floor(rawDna × 1.25)`, taken *before* the account multiplier stack
(`mastery.ts:90-94`, `session/route.ts:990-1000`). Deaths and Free Play grant zero.

Curve (`mastery.ts:32-46`): per-level 1000 / 2000 / 4000 / 7000 / 11000 / 16000 /
22000 / 29000 / 37000 / 46000 → cumulative `[0, 1000, 3000, 7000, 14000, 25000, 41000,
63000, 92000, 129000, 175000]`. **M10 = 175,000 XP per dynasty.**

Rewards (`mastery.ts:147-158`): cosmetics at M1, M2, M4, M5, M7, M8, M10; **+1 mutation
at M3, M6, M9**; Sovereign emblem and title at M10.

Mastery is the healthiest progression lane in the game: it is dynasty-specific, earned
only through successful play, and pays mostly in identity rather than power.

## 3.5 Season XP

Earned **only** via contract claims — 150 XP per contract (`015:483-504`). Season 1
"Solstice" is `max_level 30 × xp_per_level 400` = **12,000 XP**, running 2026-07-20 →
2026-09-07 (49 days) (`021:97-103`). At 2 contracts/day that is 300 XP/day ≈ 40
committed days of a 49-day season.

**This means the season track is functionally a contract-completion meter.** Playing
well contributes nothing to it directly.

## 3.6 Daily income, and the premium ratio

Derived from the formulas above, not observed telemetry. A 60-food PRIMAL extraction is
`Σ round(10 × (1 + 0.02(n−1)))` for n=1..60 ≈ 954 raw → ×1.25 ≈ **1,192 DNA**.

| | Free | Premium |
|---|---|---|
| Runs/day (energy-bound) | 5 base | 8 (+3 stipend) |
| Run DNA | ~5,960 | ~9,536 |
| Contracts | 2 → ~900 | 3 → ~1,400 |
| Calendar (still live) | ~175 | ~175 |
| **Total, before streak** | **~7,000** | **~11,100** |

Ratio ≈ **1.5×**, inside the ~1.7× guardrail `MONETIZATION_DESIGN.md` §3 sets for
itself. The locked design is internally consistent; §7 covers whether it should be.

At ~1,192 DNA/banked run, the 10,000 DNA legendary variant is **≈9 banked runs**, or 7
with a 30-day streak. Collection is not a long grind.

---

# 4. Progression systems

| System | Shape | Status |
|---|---|---|
| **Mastery** | 10 levels × 3 dynasties, 175k XP each, extraction-only | BUILT — the strongest lane |
| **Collection** | 30 variants, DNA-purchased, feeds set bonus | BUILT |
| **Breeding** | 2 parents → 1 child; variant 50/50 `random()` (`030:278`), traits `random()` (`:297`), lineage reroll `random()` (`:543`) | BUILT — fully random |
| **Generation** | Gen3 unlocks a second trait slot and +1 lineage strength; Gen50 cap (`030:274`) | BUILT — Gen4–50 adds cost and pedigree, no new decisions |
| **Genome discovery** | FTUE ramp gates strains → expressions → infuse → spawn points → splices → apexes | BUILT, server-enforced |
| **Records / Chronicle** | 21 Records × 5 tiers + Legacy Score | BUILT |
| **Achievements** | 18 "Early Career" tiers, separate language from Records | BUILT — duplicates Records |
| **Season track** | 30 levels, contract-fed, cosmetics only, expires 2026-09-07 | BUILT |
| **Streaks** | Consecutive earning days → DNA multiplier | BUILT |
| **Aim systems** | 4 tiers unlocked by high score / games / breeds | BUILT — see §9.4 |

---

# 5. Shipped metagame surfaces

Verified reachable today. **This is the central problem: almost nothing has been cut.**

| System | Status | Evidence |
|---|---|---|
| Contracts | **BUILT** | `page.tsx:880`; RPCs `claim_contract` etc. (015/017) |
| Streaks | **BUILT** | `/api/streaks`, invoked from `session/route.ts`; surfaced `page.tsx:754`, `CareerStats.tsx:138` |
| Offline progress | **BUILT, global** | `OfflineProgressProvider` mounted in root `layout.tsx` |
| Seasons | **BUILT, live now** | Season 1 active 2026-07-20 → 09-07; `SeasonTrack` at `page.tsx:894` |
| Weekly Anomaly | **BUILT** | `/api/anomaly`; mode toggle + `AnomalyPanel` in `game/page.tsx` |
| Clans — identity, roster, duels | **BUILT** | `/api/clan/duel`, `DuelPanel` |
| Clans — Gauntlet, scouting, blind picks, research tree | **BUILT** | `/api/clan/gauntlet` |
| Clans — playoffs | **BUILT** | `PlayoffBracket`, migration 021 RPCs |
| Clans — energy bonus | **BUILT BUT DEAD UI** | `clan/page.tsx:301` — a styled `<button>Claim</button>` with **no `onClick`** |
| Chronicle / Records | **BUILT** | `/api/chronicle` (023) + 7 view components |
| Achievements | **BUILT** | `AchievementBadges` in `profile/page.tsx:279` |
| Notifications | **BUILT** | Client-side Zustand pub/sub, not a server feed |
| Training Lab | **BUILT** | `/api/training`, migration 038 |
| Analyst — deterministic | **BUILT** | `renderFallback.ts` |
| Analyst — LLM narration | **BUILT, env-gated** | `narrate.ts`; self-disables without `OPENAI_API_KEY` |
| Analyst — email digest | **BUILT, env-gated** | `email.ts` via Resend; cron 07:00 UTC in `vercel.json` |
| Legacy 28-day daily rewards | **BUILT BUT UNREACHABLE** | `/api/daily-rewards` fully functional, zero UI callers, still grants DNA + energy |

Eleven distinct systems can address the player between two runs.

---

# 6. What the player sees, and when

## 6.1 First 60 seconds

`NEXT_PUBLIC_FTUE_V2=true` is the production default (`.env.example:69`; gate at
`src/lib/ftue/config.ts:8`).

A brand-new anonymous visitor sees, in order (`src/app/page.tsx`):

1. `ChamberPlaceholder` gradient, then `SpecimenChamber` cross-fading in over 600 ms
   (`:782-791`). Dynasty defaults to PRIMAL (`:118`) — no collection fetch pre-auth.
2. Navigation rail (`:794`).
3. "SUPASNAKE" wordmark (`:910-917`).
4. **No DNA or energy counters** — gated on `isAuthenticated` (`:920-938`).
5. One mission line: `'Where Skill Creates Legacy'` (`:703-705`).
6. LAUNCH (`:971-995`).

That is all. No contracts, no season, no starter picker, no modal. **The FTUE v2 work
is genuinely good and is the product's best-executed flow.**

On Launch (`:601-680`): `signInAnonymously()` → `POST /api/player/bootstrap` → RPC
`bootstrap_player` (037) grants and equips the active PRIMAL starter idempotently,
raising a specific error if the catalog row is missing (surfaced as a 503).

## 6.2 The progressive-disclosure ramp

`GAME_CONFIG.genome.ftue` (`game.ts:110-118`), keyed on **banked runs**, enforced
server-side in `src/lib/server/genome.ts`:

| Unlock | Threshold |
|---|---|
| Strain tags | 4 banked runs |
| Expressions | 8 |
| INFUSE | 10 |
| Spawn points | 12 (also requires ≥2 owned variants, `:62`) |
| Splices + Codex | 15 |
| Apexes | 20 **or** mastery level ≥ 3 (`:65`) |

`deriveFtue` runs at session start (`session/route.ts:278`) and end (`:597`);
`ftueTierCap` (`genome.ts:70-74`) caps the offered gene tier at 1 / 2 / 3. `deriveHeirloom`
(`:124-136`) hard-blocks spawn points before run 12 rather than merely hiding them.

Other gates: Contracts and Season fetches wait for `hasCompletedFirstRun`
(`page.tsx:262-268, 310-316`). Mastery mutations unlock at M3/M6/M9.

**Ungated:** Clans, Leaderboards, Shop, Settings, Chronicle, and Training are all open
from account creation, behind feature flags that are permanently `true`. A player with
one run can enter an empty clan system.

## 6.3 The Results screen

Everything below lives in one overlay panel (`game/page.tsx:2307-2837`) serving **both**
results and next-run setup. In render order when `isGameOver`:

1. Result headline + subtitle — 3-way branch (`:2319-2359`)
2. PlayerCard identity chip (`:2362-2370`)
3. Score + DNA line — itself a 3-way branch (`:2371-2397`)
4. Held mutation chips (`:2399-2415`)
5. Daily streak line (`:2416-2424`)
6. Mastery XP line **+ nested level-up panel** enumerating each unlock (`:2427-2468`)
7. First-result discovery panel with its own Lab CTA (`:2471-2491`)
8. GenomeCard (`:2493`)
9. Codex discoveries, with "WORLD FIRST" tags (`:2495-2511`)
10. RunInsightCard — the Analyst (`:2516-2521`)
11. Unlocked Achievements (`:2523-2539`)

then, with **no visual break**, the same panel becomes next-run setup:

12. ModeToggle — Earn / Anomaly / Free Play (`:2633-2647`)
13. AnomalyPanel — modifier, timer, personal best, top 10 (`:2651-2653`)
14. AimSystemSelector (`:2656-2665`)
15. Control-scheme picker (`:2669-2695`)
16. Primary action row, 4-way branch (`:2704-2777`)
17. Secondary nav: Lab / Home / Menu (`:2798-2821`)
18. Guest "save progress" CTA (`:2826-2834`)

Plus **six toast variants** fired around the same moment (`:950, 967, 988, 1114, 1121,
1152`) and **three persistent notifications** (`:1159-1172, 1183-1207`).

**Up to 14 conditional result sections, 2 nested sub-panels, 6 toasts and 3
notifications, attached to a single game-over event.** The emotional outcome of the run
is diluted by administrative reporting, and nothing tells the player which of these
matters.

## 6.4 Home surfaces

Modals and panels that can appear on `src/app/page.tsx`: welcome-back modal
(`:798-835`), progress-loss notice (`:838-873`), legacy StarterSelection (`:876`,
never under v2), ContractsBoard (`:879-889`), SeasonTrack (`:894-907`, mutually
exclusive with contracts by an explicit single-overlay policy at `:891-893`), ambient
counters (`:919-938`), rotating mission line cycling 5 sources every 6 s (`:940-969`),
LAUNCH (`:971-995`).

Under FTUE v2 the contracts board **never auto-opens** (`:284-295`) — a good decision.

## 6.5 Guest conversion

Four surfaces, all opening the same `AccountUpgradeModal`: the always-present
AccountChip (`AccountChip.tsx:165-199`), a one-time `'save-progress'` notification
published after the first completed run for anonymous users (`game/page.tsx:1197-1207`),
the Results-screen CTA (`:2826-2834`), and three Shop trigger sites.

There is **no time-based or session-count nag**. After the one-time notification,
conversion is entirely player-initiated. This is unusually respectful, and it is also
why conversion will be low without a deliberate reason to sign up.

---

# 7. Monetization as built

## 7.1 The catalog

| SKU | Price | Contents | Citation |
|---|---|---|---|
| Energy Pack | €0.99 | 3 energy | `products.ts` |
| Energy Bundle | €2.49 | 10 energy | " |
| Energy Vault | €4.99 | 25 energy | " |
| Starter Bundle | €2.99 | 20 energy + 1000 DNA + CYBER VORTEX (rare) | " |
| Dynasty Booster | €9.99 | 50 energy + 3000 DNA + COSMIC SUPERNOVA (epic) | " |
| SupaSnake Premium | €9.99/mo, €89.99/yr | see below | `premium.ts` |

**Stripe is in test/sandbox mode.** No real purchase has settled. Everything here can
still be changed without a migration or a refund story.

## 7.2 Premium perks, as implemented

`src/shared/config/premium.ts`:

1. **Season Pass included** — **DOES NOT EXIST.** Season 1 seeds no premium tiers
   (`021:112`: *"No premium tiers - the track is free"*), and `claim_battle_pass_level`
   filters `is_premium = false` (`021:426`). A subscriber pays for a perk with no
   content behind it. **This is the most serious monetization defect found.**
2. Daily Lab Stipend — +3 energy/UTC day (`028:353-419`). BUILT.
3. Triple Contracts — 3 picks vs 2 (`028`). BUILT.
4. Extended Lab Uptime — 48 h vs 24 h offline DNA. BUILT.
5. Monthly exclusive cosmetic — `premium_cosmetic_drops` (`028:142`). BUILT.
6. Supporter prestige — badge, frame, flair. BUILT.
7. Lab Analytics — `/stats`. BUILT.
8. Breeding queue 5 slots — **DECLARED, NOT BUILT.** Breeding is instant; the field is
   documented as inert in its own comment (`premium.ts:43-45`).

So of eight advertised perks, **one does not exist and one is inert**.

## 7.3 The trust position

`MONETIZATION_DESIGN.md` is **LOCKED (v1.0, 2026-07-19)** and deliberately designed
perks 2–4 as progression acceleration. It defines "never pay-to-win" as "never
competitive power" while explicitly permitting collection-progression acceleration
under a ~1.7× DNA-ratio guardrail. **The implementation matches the document.** This is
a deliberate, internally consistent position, not drift.

`src/shared/config/premium.ts:5-7` compresses that position into: *"every perk is
convenience, cosmetic or collection progression — never competitive power."* The
compression is what misleads: +3 energy/day is not convenience, it is 60% more
reward-bearing runs per day.

The audit's §12 argues against this locked decision. **That disagreement is a
judgement call for a decision-maker, not a bug to be quietly fixed.**

Two mechanical facts bear on it:

- Paid bundles contain DNA; DNA funds `breed_snakes`, whose variant selection
  (`030:278`), trait rolls (`:297`) and lineage reroll (`:543`) are all `random()`.
  Money therefore reaches randomized outcomes through one intermediate step, against a
  stated "no paid RNG, ever" principle.
- Purchased energy is granted uncapped by design (`010:86-89`) and then destroyed by
  `claim-offline` (see §9.1).

## 7.4 What the identity substrate already supports

Migration 022 shipped a complete cosmetics system that is currently under-used:
`cosmetic_definitions` with six slots (`title`, `banner`, `badge`, `trail`,
`board_accent`, `emblem`), rarity, dynasty, `season_seq`, `mastery_rung`, and a `render`
JSONB; `player_cosmetics` with permanent ownership by construction (no expiry column);
a server-authoritative equip flow; a badge pick-3 curation cap. Migration 023 wires
Records and mastery rungs into it. Migration 028 adds subscriber drops.

There is **no price or SKU column** on `cosmetic_definitions` — a cosmetic storefront
would need `price_eur` + `stripe_price_id` (nullable, NULL = earned-only) and a
`'purchase'` value in `player_cosmetics.source`. Grants would continue through the
existing SECURITY DEFINER path and `grant_purchase_rewards` (`010`).

**The infrastructure for a cosmetics-led model is already built and deployed.**

---

# 8. The marketing and growth surface

The most important section for a pre-launch product, and almost entirely empty.

| Surface | State |
|---|---|
| Domain | **BUILT.** Canonical is `supasnake.com` (`src/middleware.ts:17-19` allows it, `www.`, and the Vercel domain). |
| Landing page | **ABSENT.** `src/app/page.tsx` signs visitors in anonymously and drops them into the game shell. No pitch, no screenshots, no CTA, no explanation of what the game is. |
| Favicon / app icons | **ABSENT.** `public/` holds only `brand/mascot.png`, `brand/mascot-sm.png`, `assets/3D/*.glb`, `textures/`. |
| OG / Twitter card image | **ABSENT.** `layout.tsx:26-29` is title + description only. |
| PWA manifest | **ABSENT.** No `manifest.ts`, no service worker. The game cannot be installed to a home screen. |
| `robots.ts` / `sitemap.ts` | **ABSENT.** |
| Structured data | **ABSENT.** |
| Share card | **PARTIAL — and this is the highest-leverage defect in the repository.** `src/lib/share/genomeCardImage.ts:351` calls `navigator.share({files, title, text})` with **no `url` field**. A player shares a polished 1200×630 PNG containing no way to reach the game. |
| Public profile | **BUILT** — `src/app/p/[handle]/page.tsx`, ISR 60 s, has `generateMetadata`, no OG image. |
| Referral / invite | **ABSENT.** |
| Push notifications | **ABSENT.** No service worker, no `web-push`, no `Notification.requestPermission` anywhere. |
| Email re-engagement | **BUILT** — Analyst weekly digest via Resend (`src/lib/analyst/email.ts`), opt-in, registered users only, cron 07:00 UTC. |
| Analytics | **BUILT** — PostHog, consent-gated, curated taxonomy (`src/lib/analytics/`). |
| Attribution | **ABSENT.** No UTM capture, no referrer capture at signup. |
| Discord | **BUILT**, but it is per-player OAuth clan/identity plumbing — not a public acquisition channel. |

**The structural consequence, stated plainly:** the stated goal is to become a daily
habit. On the web, daily habit is carried by installability and notification. SupaSnake
has neither, and it has no shareable link. Those three absences make the goal
unreachable regardless of how good the game becomes. They are also all small pieces of
work.

---

# 9. Verified integrity defects

Each independently confirmed this session.

## 9.1 Purchased energy is destroyed by offline claims — P0, blocks commerce

`src/app/api/player/claim-offline/route.ts:107`:

```ts
const newEnergy = Math.min(player.energy + progress.energyRestored, player.max_energy || 5);
```

Migration `010:86-89` grants purchased energy **uncapped**, by explicit design comment
(*"Energy overfill past max_energy is allowed by design (purchased energy is not
capped)"*). The premium stipend (`028:382`) is uncapped too.

A player buys the €4.99 Energy Vault (balance 25, cap 5), owns ≥1 snake, and is away
for one hour. Offline DNA accrues, so `hasRewards` is true, the grant branch executes,
and the balance is rewritten to **5**. Roughly €4 of purchased goods destroyed, with an
`economy_transactions` row recording only the DNA.

Invisible today because Stripe is in sandbox. A refund-and-chargeback incident with no
audit trail on day one of live commerce.

## 9.2 Competing energy restoration authorities — P0

`/api/player` regenerates from `players.energy_regen_at` (`energyRegen.ts`).
`claim-offline` independently restores from `last_login_at` and **never advances
`energy_regen_at`**. Both cap at `max_energy`, so the double-grant is bounded — but
economy telemetry is unreliable and the two clocks can disagree indefinitely.

## 9.3 Leaderboard integrity — P0

`src/app/api/leaderboard/route.ts:159-178` — daily and weekly boards filter only
`is_free_play = false` and `started_at >= timeFilter`. They do **not** require:

- `ended_at` present — in-progress runs can rank
- `validated = true` — flagged runs can rank
- one row per player — a single player can occupy the entire top 10
- content-version compatibility

Global board (`:96-108`) reads `players.high_score`, which
`session/route.ts:881` updates via `Math.max(current, validation.adjustedScore)`
**with no `validation.valid` gate**. The score is a server recompute, so it is not
forgeable — but flagged sessions still set a permanent record.

`getSkillBracket(highestGeneration)` (`leaderboard/types.ts:57-62`) buckets players by
**bred generation** and labels the result "skill". Generation is bought with DNA.

**`myRank` is always `undefined`** — `leaderboard/page.tsx:205` compares
`entry.playerId` (which is `players.id`, set at `route.ts:117`) to `user?.id` (which is
`auth.users.id`). These are different UUIDs. The "you" highlight at `:424, 443, 452`
never fires either.

## 9.4 Aim systems are competitive information gated behind progression

`src/lib/game/aimSystems.ts`. Deadeye is always available. **Pathline** — "projected
5-cell path ribbon, queued turns, danger tint" — unlocks at high score ≥ 30 **or** 25
games. Gridlock at high score ≥ 15. Firefly at 1 breed **or** high score ≥ 50.

Players on the same leaderboard do not have equivalent planning information, and one
unlock is gated on *breeding* — a DNA purchase.

## 9.5 Non-atomic achievement claim

`src/app/api/achievements/route.ts:173-192` marks `reward_claimed = true`, then applies
the balance in a **separate** call. A failure between them permanently consumes the
claim without granting the reward. Neither call checks its `error` result, violating
the project rule in `CLAUDE.md`.

## 9.6 No stale-session lifecycle

No sweep exists in any migration. Approximately 30% of production session rows were
open at audit time. Funnel, duration, and active-session analysis are all unreliable.

## 9.7 Dead clan UI

`src/app/clan/page.tsx:301` renders a styled `<button className="btn-go">Claim</button>`
with **no `onClick`**. `CLAN_BONUS_CONFIG` is referenced only for display strings.

## 9.8 Legacy daily rewards remain live

`/api/daily-rewards` has zero UI callers but is fully functional and grants DNA and
energy on the 28-day calendar via `claim_daily_reward` (`009:380-450`). An
undocumented, unreachable faucet that any client can call.

---

# 10. Dead and drifted configuration

Confirmed by grep — no non-test reader exists.

| Item | Location | Reality |
|---|---|---|
| `economy.dna.firstWinBonus: 100` | `game.ts:48` | Never read |
| `economy.dna.scoreMultiplier: 0.1` | `game.ts:46` | Never read (the `scoreMultiplier` in `rulesets.ts` is unrelated) |
| `breeding.baseCost: 50`, `crossDynastyCost: 100` | `game.ts:62-63` | Dead. Live cost is `200 + avg(gen)×100` (`018:206`) |
| `contracts.comboContractsEnabled: false` | `engagement.ts:29` | Never read |
| Entire `battlePass` block (50 levels, 30 days, €4.99, 7 xpSources) | `engagement.ts:65-80` | Never read. Season 1 is 30 levels × 400 XP, contract-fed only |
| `daily_logins` table | `003:45-56` | No writer, no reader |
| 6 inactive contracts | `015:71-118` | Seeded with real rewards, `active = false`, never offered |
| Contract `reward_energy` | `015` | Path executes; every seeded row is 0 |
| `battle_pass_tiers` DNA/energy reward types | `021` | Permitted by CHECK; never used |
| Streak tiers in docstring | `dnaMultipliers.ts:6-8` | Says 1.10/1.25/1.50/2.00; live values are 1.05/1.10/1.20/1.35 (`013:55-58`) |
| `CLAN_LIMITS.minMembers: 20` | `src/lib/clan/types.ts:56` | Never enforced — appears only in two tests asserting the constant. Duel matchmaking accepts `member_count >= 1` (`011:250`), so a one-member clan can duel today. `maxMembers: 50` **is** enforced (`clan/page.tsx:459`). |

Dead configuration is not harmless. Every one of these reads as a fact to the next
person or agent that opens the file.

---

# 11. Hard constraints

**Team:** one developer. Any system proposed must be operable by one person for five
years, including its content cadence, balance, moderation, and support burden.

**Stack:** Next.js App Router + React + TypeScript strict; react-three-fiber + three.js;
Supabase (Postgres, auth, realtime); Stripe on a **dedicated SupaSnake account**;
zustand; Tailwind; Jest (244 test files) + Playwright (11 e2e specs); GitHub Actions → Vercel.

**Architecture:** server authority is absolute — all economy and progress mutations go
through API routes and RPCs; the client never writes balances. Parameterized queries
only. Every Supabase `error` must be checked and reported to Sentry.

**Legal (Austria/EU):** gross EUR pricing incl. VAT (PAngG); FAGG §10 service-start
consent and §16 pro-rata withdrawal; cancel-anytime via Stripe Customer Portal; game
minimum age 14 (Austrian GDPR Art. 8), recurring billing 18+. Loot boxes carry
case-by-case legal risk after OGH 6 Ob 228/24h (Dec 2025), and the EU Digital Fairness
Act is expected to restrict them further. **"No paid RNG" removes the whole category.**

**Naming:** dynasties are CYBER / PRIMAL / COSMIC. EMBER/CRYSTAL/VOID is deprecated and
must never be reintroduced.

**Commerce:** Stripe is in test mode. Nothing is entrenched. This is the last moment
the economy can be changed without a migration and a refund story.

---

# 12. What is genuinely good

Stated explicitly, because a document this long about problems will otherwise mislead.

1. **The run.** Buffered turns, reversal rejection, deliberate first movement, tactical
   hold, touch/keyboard/D-pad. Low latency, high ceiling, immediately legible.
2. **Three real rulesets.** PRIMAL, CYBER, and COSMIC change how you read space and
   time — not a stat sheet.
3. **The portal trichotomy.** BANK / PASS / INFUSE is the best mechanic in the game and
   the clearest differentiator from every other snake game.
4. **Score is build-independent** (`rulesets.ts:261-267`). The leaderboard measures
   play. Protect this.
5. **Server authority.** Exact recompute, bounded-trust clamps, idempotent settlement,
   replay verification for Training. More robust than the product looks.
6. **FTUE v2.** Home → Launch → anonymous auth → idempotent bootstrap → PRIMAL equipped
   → board ready, with nothing else on screen. The best-executed flow in the product.
7. **The Training Lab's rewardless contract.** Deliberate practice that refuses to
   become a currency farm.
8. **The identity substrate.** Chronicle, Records, Player Card, handles, badges,
   cosmetics inventory, public profile. This is what makes an account worth keeping.
9. **The offer-gravity algorithm.** Strain-aware weighting with a pity rule and a
   wildcard slot — genuinely sophisticated.
10. **Progressive disclosure is server-enforced**, not merely UI-hidden.

---

# 13. Production data — not yet trustworthy

Read-only aggregate at audit time:

- 415 player rows; **15 with at least one ended run**
- 237 session rows; 165 ended; **72 open**; 11 validation-flagged
- 161 earning sessions; 4 Free Play
- Bank rate ≈ 32.9%; median food 21; median score 160

The unique-player sample is 15. The data includes developer, QA, fixture and bootstrap
activity. Open sessions are never expired. There is no cohort separation.

**SupaSnake does not yet have a trustworthy product dataset.** Do not tune balance,
retention, or economy from these numbers. Treat the product as pre-launch.

---

# 14. The five facts that matter most

1. **The core run is excellent and the metagame is fragmented.** Eleven systems can
   address the player between two runs; nothing tells them which matters.
2. **The game is over-built, not under-built.** Every engagement system is shipped and
   reachable. The work ahead is subtraction and coherence, not addition.
3. **Monetization sells friction, and one advertised perk does not exist.** Three of
   five SKUs are Energy; Premium perk #1 (Season Pass) has no content behind it; and
   purchased energy is actively destroyed by a live code path.
4. **There is no growth surface at all.** No landing page, no icon, no OG image, no
   PWA, no push, no referral — and the share card has no URL in it.
5. **Nothing is entrenched.** Stripe is in test mode, the audience is not yet real, and
   the identity and cosmetics infrastructure for a different monetization model is
   already built and deployed.
