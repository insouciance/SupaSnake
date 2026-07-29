# SupaSnake — Buildcraft: The Genome
## Strains, Expressions, Splices, Infusion & Lineage

**Version:** 1.1
**Date:** 2026-07-28
**Status:** APPROVED — updated for Product Constitution v1.4 Rule 15 and the
Redesign Wave implementation. It supersedes the *vocabulary* of
`GAME_DESIGN_V2.md` §5 (Mutation Food) and §6 (Traits). Historical wire ids and
folds remain readable, but retired effects are not reachable in a new run.
Dynasty spec remains LOCKED (CYBER/PRIMAL/COSMIC). Anti-P2W remains absolute:
nothing in this document is purchasable for power.
**Companion docs:** `GAME_DESIGN_V2.md`, `MONETIZATION_DESIGN.md` (economy guardrails), `PLAYER_IDENTITY_V1.md` (card surfaces the Genome Card extends)

---

## 0. One-paragraph summary

Mutations become **GENES** carrying **STRAIN** tags across five families. Stacking a strain triggers **Expressions** (3 points) and **Apexes** (4 points) — spectacular, board-level rule bends. Specific gene pairs fuse into **Splices**. Offers gravitate toward your run's strains (seeded, server-verifiable). Portals gain a third option — **INFUSE** — converting economy into build power. Variants gain **Lineage** (strain affinity from breeding), traits become **Heirloom genes**, anomalies become strain-tilted weeks. The build is painted onto the snake's body; extraction becomes a visible payout cascade on a shareable **Genome Card**.

## 0.1 Why (first-principles critique of the v2 mutation layer)

The v2 mutation system produced *choices* but not *builds*. Four structural ceilings:

1. **Genes don't interact.** Four held mutations are four independent multipliers. There is no reason to pick Gold Trail *because* you hold Compound Interest beyond adding numbers. No synergy → no discovery → no theorycrafting → replayability plateaus once all 10 tooltips are memorized.
2. **The collection is disconnected from the run.** Variants are dynasty-pickers wearing cosmetics. Breeding crafts traits, but a Gen 8 legendary and a starter play the same run. The meta-game's biggest loop (collect → breed) never touches the game's biggest loop (run → bank).
3. **Runs have no identity.** Offers are uniform draws; the third pick has no relationship to the first. Nothing early shapes anything late, so runs don't develop a personality worth narrating or sharing.
4. **The portal decision is binary.** Bank-or-pass is a great spine, but it's the *only* strategic verb at the only strategic moment. Every roguelike that retains for hundreds of hours gives the player a way to spend winnings on power mid-run.

The Genome fixes all four with one vocabulary, deletes nothing that works (banking psychology, sidegrade discipline, server-recompute economics), and keeps every existing mutation/trait id valid on the wire.

---

## 1. Strains

Five cross-dynasty tag families. Every gene carries 1 tag (9 launch genes carry 2).

| Strain | Identity | Body tint | Dynasty signature |
|---|---|---|---|
| **AURUM** | Greed — DNA value manipulation | Gold | — |
| **VOLT** | Tempo — tick speed, cadence, windows | Cyan | CYBER |
| **FERAL** | Body — length as resource, growth, endurance | Green | PRIMAL |
| **FLUX** | Space — walls, wrap, portals, pull, position | Violet | COSMIC |
| **UMBRA** | Risk — death-defiance, salvage, wagers | Black-red | — |

**Strain points.** Each held gene grants 1 point per tag (dual-tag genes grant 1 to each strain). Additional point sources: Heirloom genes (§8), Lineage (§7), Infuse surge (§6). Splices retain all parent tags (§4) — fusing never loses points.

**Thresholds** (per strain, evaluated live during the run):

| Points | Tier | Gate |
|---|---|---|
| 2 | **Minor passive** (auto) | none — any point sources count |
| 3 | **EXPRESSION** | requires ≥2 genes of that strain picked **this run** |
| 4 | **APEX** | requires ≥3 genes of that strain picked **this run** |

The in-run gene gates are the load-bearing balance rule: spawn momentum (heirlooms + lineage, capped at **2 points per strain**, §8) can save you exactly one pick toward an Expression, never two, and can never substitute for Apex commitment. Expressions/Apexes activate at the food index where the threshold was crossed (`atFood` semantics identical to `MutationPick`), and their [E] effects apply to foods after that index — same discipline as `foodValueModifier`.

Gene cap: **6 held** (up from 4). Offer cadence unchanged: 20±5 foods, 40-tick despawn. A 100-food run sees ~4-5 cadence offers plus up to 3 infuse offers; the cap of 6 plus splice fusion (2 slots → 1) makes slot pressure a real decision.

---

## 2. Strain tier effects

Validation classes: **[E]** exact server recompute (pure function of food index + picks), **[P]** physical/engine only, **[BT]** bounded-trust (client-claimed, server-clamped by hard cap — the COSMIC-combo model). All [E] effects fold into the existing single per-food round in `computeRunTotals`.

### AURUM
- **Minor — Gilt** [E]: food +5% DNA from activation food onward.
- **Expression — Gilded Wake** [BT + P]: every eaten food leaves a gilded cell (60-tick lifetime) at its position; traversing one with your head pays **+2 flat DNA** and consumes it. Validation: claimed gilded pickups ≤ foods eaten since activation; total flat bonus ≤ **25% of the deterministic recompute** since activation. Counterweight: exit portals despawn **15 ticks sooner** while active.
- **Apex — Midas Vein** [BT]: a food eaten within **3 ticks** of the previous food is golden ×2. Validation: claimed golden count ≤ floor(foods since apex ÷ 2); total apex bonus ≤ **60% of deterministic recompute** since apex. Counterweight: salvage **−0.10**.

### VOLT
- **Minor — Tempo** [P]: world −10 ms/tick slower (CYBER: speed as if 3 foods earlier; floor at `minSpeed`).
- **Expression — Arc Lightning** [P + E]: eating a food fires an arc consuming up to 2 other foods within 3 cells at **full value** (+1 segment each); while the expression is active, ALL food pays **×0.85** — the deterministic price of the reach. (Rationale: a per-arc 50% discount would be a client-reported *reduction*, and under-reporting arcs would inflate payouts. The aggregate cost is a pure function of the activation index — zero claim surface.) Arced foods increment `foodEaten`, so the server recomputes them exactly; the food-*rate* bound widens when VOLT expression is reachable (§10). Counterweight: the ×0.85 plus the growth itself (board pressure).
- **Apex — Overclocked Reality** [E + P]: tick interval ×0.75 (faster world) and food **+30% DNA** from apex food onward. Counterweight: the speed, plus portal windows **−20 ticks**.

### FERAL
- **Minor — Thick Hide** [BT + P]: survive one self-collision per run and gain
  **8 permanent segments**. The client reports only `{source, atFood}`; the
  server proves that FERAL Minor was active, permits one trigger, and derives
  the +8 amount from shared configuration. The blocked move is cancelled.
- **Expression — Fortress** [E + P]: every 20th food after activation, the
  oldest **6 segments petrify**. They stop following but remain part of logical
  length, and their distinct cells become forming terrain before hardening.
  The event pays 5 flat DNA per petrified segment in the deterministic fold.
  Counterweight: live-body floor 12; an event that would cross it is skipped.
- **Apex — Ouroboros** [BT + P]: head touching the currently deployed **tail
  tip** is legal and pays **30 flat DNA** per bite; touching any other segment
  still kills. Every successful bite adds **2 permanent segments** rather than
  consuming the tail. Validation bounds bites to floor(foods since apex ÷ 5),
  derives +2/30 from shared configuration, and retains food **−10%** [E] while
  active.

### FLUX
- **Minor — Warp Skin** [P]: one free edge-wrap per 30 foods (wall hit wraps instead of kills, then recharges).
- **Expression — Rift Aura** [P + E]: all four walls wrap permanently (COSMIC: closed phases no longer kill at edges — flux cycle becomes telegraph-only). Counterweight: food **−10%** [E] and portal interval **+2 foods** while active.
- **Apex — Singularity** [E + P]: every 25th food after apex, all board food is pulled to within 4 cells of your head, and the pull pays **+10 flat DNA** (deterministic: floor((n − atApex)/25) × 10). Counterweight: portal interval **+3 foods**.

### UMBRA
- **Minor — Shadow Skin** [E]: salvage **+0.05** (additive delta, same pipeline as trait outcome deltas).
- **Expression — Phantom Coil** [P]: for 3 ticks after every eat, your head passes through your own tail. Counterweight: portal windows **−10 ticks** while active.
- **Apex — Second Sun** [E + P]: survive one death with every segment and
  terrain consequence intact. The head rewinds 3 body cells, then gains a
  **12-move body/board-edge phase** so the overlap is playable; solid terrain
  remains solid. The survived death pays **+150 flat DNA** (once, bounded on a
  reported trigger); salvage **+0.10**. **Hard rule: one revive per run total**
  — Second Sun absorbs a held Phoenix charge. Counterweight: bank **−0.10**
  while apex is active. Unlike Phoenix, Second Sun does not void other benefits.

Expression/Apex [E] *costs* persist through a Phoenix trigger; *benefits* void — identical to the `GAME_DESIGN_V2.md` §5.3 discipline.

### Rule 15 pressure contract

New runs never append length losses. Their genome envelope may contain the
bounded facts `pressureEvents: [{ source: 'thick_hide' | 'ouroboros', atFood }]`;
there is no claimable segment amount. Settlement filters those facts against
accepted FERAL activation, once-per-run/cadence bounds, and food count, then the
shared fold derives +8 or +2. Historical `lossEvents` remain readable solely so
already-settled v1 records recompute as they did; they are not produced by the
current engine.

The board uses three explicit pressure measures. **Logical segments** include
following and petrified length. **Physical occupied cells** are unique live
cells plus solid terrain. **Committed occupied cells** also include forming and
pending terrain; this is the free-space clock used by placement. Duplicate tail
segments each count toward logical pressure, while their shared occupied cell is
rendered and spatially counted once.

---

## 3. Gene catalog

Kinds: E (exact recompute), P (engine-only), EP (both), BT (bounded-trust component). Existing effects/costs/tuning unchanged unless a **RETUNED** note appears. Wire ids never change.

### 3.1 Existing Launch Ten (retagged)

| Gene | Strain | Kind | Effect | Cost |
|---|---|---|---|---|
| Gold Trail | AURUM | E | Every 5th food after pickup ×3 | Portals despawn 30 ticks sooner |
| Overgrowth | FERAL | EP | Food +20% | +2 segments per food |
| Wall Rush | FLUX | P | Slide along walls | Food −10% |
| Shed *(retired; legacy wire only)* | FERAL | EP | Not offered in new runs | Historical folds still recompute |
| Mirror Wager | UMBRA | E | Bank ×1.50 | Salvage ×0.30 |
| Magnet Pulse | FLUX | P | Pull radius 2 | Portal interval +4 |
| Time Dilation | VOLT | EP | Speed −1 tier | Food −20% |
| Splitter | VOLT | EP | Food spawns in pairs | Each food worth 70% |
| Phoenix | UMBRA | P | Survive one death | Trigger voids economic benefits |
| Compound Interest | AURUM | E | **RETUNED: bank +0.05 per gene held (cap +0.30)** | Slot only |

### 3.2 Mastery genes (retagged; unlock track unchanged M3/M6/M9)

| Gene | Dynasty | Strain | Kind |
|---|---|---|---|
| Deep Roots | PRIMAL M3 | FERAL | EP |
| Ancient Grove | PRIMAL M6 | AURUM+FERAL | E |
| Tectonic Patience | PRIMAL M9 | FLUX | EP |
| Redline Dividend | CYBER M3 | VOLT | E |
| Afterburner | CYBER M6 | VOLT+AURUM | EP |
| Overclock Harvest | CYBER M9 | UMBRA | E |
| Starweaver | COSMIC M3 | VOLT | P |
| Gravity Well | COSMIC M6 | FLUX | EP |
| Event Horizon | COSMIC M9 | FLUX | P |

### 3.3 Seasonal (retagged)

| Gene | Strain | Kind |
|---|---|---|
| Solstice Engine | AURUM+VOLT | EP |
| Glacial Reserve | FERAL | EP |
| Midnight Oil | AURUM | E |

### 3.4 New base genes (9 — enter the base offer pool)

| Gene | Strain | Kind | Effect | Cost | Validation |
|---|---|---|---|---|---|
| **Loan Shark** | AURUM | E | First 10 foods after pickup +100% | Foods 11–30 after pickup −20% | Exact (window of atFood) |
| **Tithe** | AURUM | E | Every 10th food after pickup +20 flat | Every food −1 flat (floor 1) | Exact |
| **Static Charge** | VOLT | EP+BT | A food eaten after ≥8 ticks of not eating pays ×2 | Portal windows −10 ticks | BT: claims ≤ floor(foods since pickup ÷ 3); bonus ≤ 35% of recompute |
| **Slipstream** | VOLT | P | Input grace: turns buffer 1 tick earlier | Food −5% | Exact (cost) |
| **Bulk Up** | FERAL | EP | +3 segments per food; +2 flat DNA per 10 segments of current length | The length itself | Exact — length is deterministic from the food-indexed growth/shed model |
| **Serpentine** | FERAL | P | Last 5 tail segments don't kill on contact | Food −5% | Exact (cost) |
| **Pocket Rift** | FLUX | P | Once per 20 foods, a wall hit teleports you to the opposite wall | Portal interval +2 | Engine |
| **Grave Robber** | UMBRA | E | If your previous run ended in death, food +10% this run | None (slot + the death you already paid) | Exact — server reads previous session row |
| **Last Gasp** | UMBRA | E | Foods eaten at logical length ≥30 pay +15% | Foods at logical length <30 pay −5% | Deterministic fold plus bounded Rule-15 pressure events; event amounts are server-derived |

### 3.5 Dynasty signature genes (new M10 capstones)

| Gene | Dynasty | Strain | Kind | Effect | Cost |
|---|---|---|---|---|---|
| **Heartwood** | PRIMAL M10 | FERAL | EP | Each Fortress petrification pays +30 flat DNA | Food −5% |
| **Zenith Protocol** | CYBER M10 | VOLT | E | Foods at max overclock +4 flat DNA | Foods below max tier −5% |
| **Constellation Crown** | COSMIC M10 | FLUX | BT | Combo cap ×2.4 → ×2.8 | Chain window −1 tick. Server raises the COSMIC trust ratio only when the mastery row shows M10 |

### 3.6 Heirloom genes (the 8 traits — see §8)

Scavenger AURUM, Ascetic AURUM, Sprinter VOLT, Magnetism FLUX, Gambler UMBRA, Iron Scales UMBRA, Patient UMBRA, Hoarder UMBRA. Effects, slots and validation unchanged from `traits.ts`.

Pool totals: 22 existing + 9 new base + 3 signature = **34 offerable genes** at full unlock (+3 seasonal in-season = 37), plus 8 heirlooms = 45 catalog entries.

---

## 4. Splices (10 at launch)

Fusion trigger: pick gene B while holding gene A (order-free). The two genes are replaced by the splice in **one slot**; the splice carries **both parents' strain tags** (points preserved) and keeps counting as **2 in-run genes** for threshold gates. First-time discovery: Codex entry + **250 DNA** (one-time, account-wide, server-granted at run end).

| # | Recipe | Splice | Strains | Kind | Effect | Cost |
|---|---|---|---|---|---|---|
| 1 | Gold Trail + Compound Interest | **Dragon Hoard** | AURUM×2 | E | Every 5th food ×3 **+5 flat**; bank +0.05/gene held | Portals −30 ticks |
| 2 | Overgrowth + Shed | **Regenesis** *(legacy-only)* | FERAL×2 | EP | Historical recompute only; Shed is not offerable | — |
| 3 | Mirror Wager + Phoenix | **Styx Contract** | UMBRA×2 | EP | Bank ×1.50, salvage ×0.30, survive one death; trigger does NOT void benefits | Salvage locked ×0.30 post-trigger |
| 4 | Time Dilation + Magnet Pulse | **Gravity Bubble** | VOLT+FLUX | EP | Speed −1 tier AND pull radius 3 | Food −25% |
| 5 | Wall Rush + Splitter | **Ricochet** | FLUX+VOLT | EP+BT | Wall-slide; food in pairs; foods eaten while sliding +50% | Each food worth 80%. BT: slide-eat claims ≤ 40% of foods since fusion |
| 6 | Gold Trail + Afterburner | **Comet Tail** | AURUM+VOLT | E | Every 5th ×3, every 10th ×2 (aligned 10th = ×6) | Portals −40 ticks |
| 7 | Deep Roots + Glacial Reserve | **Old Growth** | FERAL×2 | EP | Ramp cap +50% (vs +30%); +1 flat per 20 foods | Portals −25 ticks |
| 8 | Compound Interest + Mirror Wager | **All In** | AURUM+UMBRA | E | Bank +0.15 per gene held | Salvage ×0.20; global bank clamp 1.75 applies |
| 9 | Magnet Pulse + Gravity Well | **Black Magnet** | FLUX×2 | EP | Pull radius 4 | Food −15%; portal interval +4 |
| 10 | Shed + Phoenix | **Molted Rebirth** *(legacy-only)* | FERAL+UMBRA | EP | Historical recompute only; Shed is not offerable | — |

Recipe overlap (Gold Trail, Compound Interest, Mirror Wager, Shed, Phoenix, Magnet Pulse each appear in 2 recipes) is resolved deterministically: `fusePicks` fuses with the **earliest-held** eligible partner. Splices are **derived, never claimed**: the client reports raw parent picks; engine and server both run the same fusion function. A directly-claimed splice id is dropped and flagged.

Offer cards that would complete a recipe with a held gene show a fusion glyph: "?" if undiscovered, the splice name if discovered (Codex knowledge is player knowledge).

---

## 5. Offer gravity (deterministic, server-verifiable)

**Seed.** At session start the server issues `runSeed` (stored on the session row). All offer randomness derives from a counter-based stream: `fnv1a(runSeed + ':' + offerIndex) → mulberry32`, where `offerIndex` increments per offer (cadence and infuse offers share one counter). The server re-derives every offer exactly from `(runSeed, pool, picks with atFood, infuse events)` — offer legality becomes **exact-validated** via trace replay (advisory flag at launch; hard enforcement behind a config knob once telemetry confirms no false positives). Spawn-timing RNG stays local and payout-irrelevant, unchanged.

**Algorithm** (per offer, two slots):
1. Candidate pool = unlocked pool minus held/spliced-away genes.
2. Weight per candidate = 100 + 60 × (your points in each of its tagged strains, all sources, capped at +180 per gene) + 40 if it completes a splice recipe with a held gene (+80 lineage first-two-offers bias, §7).
3. **Slot 1**: weighted draw. Pity override: if the previous 2 offers contained zero genes of your highest-point strain, slot 1 is forced to the highest-weight gene of that strain (deterministic tie-break: catalog order).
4. **Slot 2 (wildcard)**: roll `u`; if `u < 0.25`, draw uniformly from candidates whose tags all have 0 points ("off-build"); otherwise weighted draw excluding slot 1. Fallback to weighted if no off-build candidate exists.
5. Declining is allowed (existing behavior); declined offers still consume `offerIndex`.

Properties: run identity solidifies (a 2-point strain roughly doubles its genes' appearance rate), lock-in is impossible (25% wildcard + pity), and everything is replayable server-side.

---

## 6. Portal trichotomy: BANK / PASS / INFUSE

At every exit portal:

- **BANK** — end the run, banked multiplier applies (unchanged flow).
- **PASS** — ignore it; next portal in 12±4 foods (unchanged).
- **INFUSE** — consume the portal for build power. Requirements: length ≥ 8. Cap: **3 infuses per run**. Effects, per infuse:
  - Gain **8 permanent segments** immediately. INFUSE buys build power with
    future board pressure; it never pays a reward by deleting another reward.
  - Immediate **gene offer** (gravity algorithm, shared offerIndex). If already at 6 genes: **Strain Surge** instead — +1 strain point to a chosen held strain (counts toward thresholds, does NOT count as an in-run gene for gates).
  - Bank multiplier **+0.05** (additive), salvage **−0.05**.
  - Next portal interval **+2 foods**.

**Updated outcome pipeline** (extends the existing order): anomaly base override → Mirror Wager set → Overclock Harvest delta → Compound Interest → **infuse deltas** → strain minor/apex deltas (Shadow Skin, Second Sun, Midas) → trait deltas → **hard clamps: bank ∈ [0, 1.75], salvage ∈ [0, 0.90]** → round to 4 decimals → single floor at payout.

**Anti-degenerate analysis.**
- *"Always infuse" fails*: each infuse adds 8 segments now (immediate and
  permanent pressure on a 20×20 board), lowers the crash floor, and pushes the
  next exit 2 foods deeper into a run whose death probability compounds per
  food. Genes acquired are sidegrades with costs.
- *"Never infuse" stays viable*: consistency lines bank early portals and avoid
  the infuse growth bill.
- *PASS retains a distinct niche*: raw growth with zero added cost — correct at 6 genes when a surge point wouldn't cross a threshold, or when protecting a streak.
- *Infuse-then-instant-bank is impossible*: infusing consumes the portal; you must survive 12±4 (+2/infuse) more foods to see another exit. Build power is always bought with exposure.

---

## 7. Lineage (variants + breeding)

Every variant gains `lineage_strain` + `affinity_strength`.

**Assignment.** Existing and newly-unlocked non-bred variants get their dynasty's signature strain (PRIMAL→FERAL, CYBER→VOLT, COSMIC→FLUX) at strength by rarity: common/uncommon **0**, rare **1**, epic/legendary **2**.

**Strength effects** (run start, equipped snake; server reads the snake row — never the client):
- Strength 0: offer bias only — first 2 offers give lineage-strain genes +80 weight.
- Strength 1: bias + **1 strain point** in the lineage strain.
- Strength 2: bias + 1 point + first offer **guarantees** one lineage-strain option in slot 1.

**Breeding inheritance** (extends the existing breed roll; 50/100 DNA costs unchanged):
- Same-dynasty, different strains: child inherits one parent's strain (50/50, breed RNG), strength = max(parents), capped by the child's rolled rarity (common/uncommon cap 0 — bias-only tag persists; rare cap 1; epic+ cap 2).
- Same-strain parents (**Purebred**): child strength = max(parents) + 1, same rarity cap.
- **Cross-dynasty**: child is **dual-lineage** — both strains, each at bias level; if child is rare+, the owner picks pre-run which of the two strains receives the strength point(s). Cross-dynasty breeding finally has a mechanical identity: it crafts two-strain run-start seeds.
- Gen3+ prestige: +1 strength (existing Gen3 rule family), still capped at 2.
- Lineage reroll: **150 DNA** (new sink) — rerolls strain within the dynasty-legal set, keeps strength.
- Rolls audited in `breeding_history.trait_rolls.lineage`.

Points from lineage obey the §1 gates (never count as in-run genes).

---

## 8. Heirloom genes (traits)

The 8 traits keep their exact `traits.ts` effects, slots (1-2, rarity/Gen3 rule), reroll tokens, and server-side trust model. New: each equipped heirloom grants **1 strain point** in its tag at run start.

**Balance gates:**
1. Spawn-source points (heirloom + lineage + surge) count toward thresholds but never toward the "in-run genes" gates (≥2 for Expression, ≥3 for Apex).
2. Max **2 spawn-source points per strain** (a Gambler+Patient UMBRA snake with UMBRA lineage still starts at 2, not 3) — spawning with a Minor passive active is allowed and is the payoff of dedicated breeding; spawning closer than one pick from an Expression is not possible.
3. Ascetic (no gene foods ever) remains legal: with a second AURUM point it spawns with Gilt permanently and can never express — the deliberate "pure snake" archetype, now +5% stronger and self-limiting.

---

## 9. Meta integration

**Anomalies → strain weeks** (rotation becomes mod-**5**; same ISO-week epoch formula; TS and SQL `anomaly_for_week` updated in lockstep):

| Week | Anomaly (kept mechanics) | Strain tilt (additions) |
|---|---|---|
| Gold Rush | food ×1.5, portal +6 | AURUM week: AURUM genes +100 offer weight; Gilded Wake cells last 90 ticks |
| Meteor Shower | food despawns 60 ticks | VOLT week: VOLT +100 weight; Arc Lightning range 4 |
| Blackout | visibility 6 | UMBRA week: UMBRA +100 weight; base salvage +0.05 |
| Twin Exits | 2 portals, bank ×1.15 | FLUX week: FLUX +100 weight; Warp Skin recharge 20 foods |
| **Overgrown (new)** | all snakes +1 extra segment per food | FERAL week: FERAL +100 weight; Fortress pays 10 flat per petrified segment (vs 5) |

**Contracts** (same 400–600 daily band; seeded inactive, flipped when genome facts are live): Showtime — trigger a [strain] Expression (500); Full Helix — bank a run holding 6 genes (550); Geneticist — fuse any splice (600); Apex Predator — reach any Apex (650, weekly bonus 800); Purebred — bank with 3+ same-strain genes (500); All In — bank a run with 2+ infuses (600).

**Gauntlet**: weekly ban becomes 1 **gene** ban (as today) + 1 **suppressed strain**: suppressed-strain Expressions/Apexes are disabled for both clans that week (minor passives still work). Picking the opponent's favored strain to suppress is the new draft skill.

**Mastery**: M3/M6/M9 unlocks unchanged (retagged); M10 adds the signature gene (§3.5). Mastery XP stays `floor(raw × 1.25)` on banked runs, but `raw` is the **deterministic recompute only** — bounded-trust claims never feed mastery, so claim-cap pressure can't accelerate progression.

**Codex** (new meta page, free for every player — never premium-gated): per-gene pick/bank stats, splice discoveries (+250 DNA first), first Expression per strain (+150), first Apex per strain (+400). Total one-time discovery well: 10×250 + 5×150 + 5×400 = **5,250 DNA** (~2 elite hours; acceptable). Codex 100% grants the "Genome Weaver" cosmetic skin.

---

## 10. Economy retune

Two global server clamps backstop everything:
- **Aggregate claims clamp**: the SUM of all bounded-trust claims ≤ **35% of the deterministic recompute**. (Implementation note, corrected from the earlier "×1.45 of gene-less" formulation: deterministic gene effects are exact and unforgeable — Loan Shark windows legitimately exceed ×1.45 of a gene-less run, so only the *claim* surface carries the aggregate backstop.) Individual BT caps (25/35/40/60%) bind first in practice; the aggregate clamp binding while they pass is *flagged*, never silently hidden (cheat signal).
- **Outcome clamps**: bank ≤ **1.75**, salvage ∈ [0, **0.90**].

**Food-rate bound**: Arc Lightning raises the honest eat rate; the per-dynasty
`maxFoodPerSecond` bound widens by a fixed allowance only when the accepted
picks make the VOLT expression reachable. Fortress changes space and length,
not food collection rate.

**Ceiling analysis** (account stack streak 1.35 × set 1.30 × duel 1.05 = ×1.843, unchanged):

| | Current (v2) | Genome |
|---|---|---|
| Elite gene-less raw (PRIMAL 100 foods) | 1,990 | 1,990 |
| Max in-run economic inflation | ~×1.0 (sidegrades net-neutral) | ×1.45 hard clamp |
| Max bank | ≈2.10 (uncapped corner) | **1.75 (capped)** |
| Theoretical hard ceiling/run | ≈ 7,700 | ≈ **9,300** (+21%) |
| Expected elite/run (counterweights paid) | ≈ 4,470 | ≈ **6,000** |
| Expected elite DNA/hour | ≈ 13,400 | ≈ **18,000** (×1.34) |

Justification: (1) infuse converts payout into risk — extra earnings are bought with genuinely higher crash exposure and longer runs, not free stacking; (2) new sinks (lineage reroll 150, purebred/dual-line breeding demand) absorb supply; (3) Compound Interest nerf and the bank clamp remove the old uncapped corner; (4) mastery pacing is insulated (deterministic-raw XP). Mid-tier expectation rises from ~3,100 to ~3,600/hour, preserving the elite:mid ratio ≈ 5:1. Premium/free ratio untouched (premium grants zero genome power).

---

## 11. Archived launch-model EV check

This table is retained as the v1.0 design's balance hypothesis, not a current
gate. It predates Fortress, the carry, the new dynasty curves, and Rule 15's
growth pricing; current balance is enforced by `genome.balance.test.ts` and must
be measured from the current fold before any tuning decision.

Rough per-run EV, elite skill, account stack 1.843, p(bank) shown:

| Archetype | Line | Foods | Raw × genome | Outcome | p(bank) | EV/run |
|---|---|---|---|---|---|---|
| **Gilded Pilgrim** (AURUM, PRIMAL) | Gold Trail → Gilt → Gilded Wake, 1 infuse | 100 | ≈ 2,590 | 1.35 | 0.80 | ≈ **5,850** |
| **Storm Runner** (VOLT, CYBER) | Redline → Arc Lightning → Overclocked Reality | 80 | ≈ 2,780 | 1.30 | 0.70 | ≈ **5,600** |
| **Molt Farmer** (FERAL, PRIMAL) | Regenesis → Molt, 0 infuse | 110 | ≈ 2,575 | 1.25 | 0.88 | ≈ **5,700** |
| **Void Dancer** (UMBRA, any) | Mirror Wager → Phantom Coil → Second Sun, 2 infuses | 115 | ≈ 2,460 | 1.60 / 0.45 | 0.62 | ≈ **5,500** |
| **Rift Sailor** (FLUX, COSMIC) | Gravity Well → Rift Aura, combos ×1.6 avg | 110 | ≈ 2,600 | 1.30 | 0.78 | ≈ **5,400** |

Spread ≈ 5,400–5,850 (< 9%), with distinct variance profiles (Molt Farmer lowest, Void Dancer highest). No line dominates; the Gilded Pilgrim's small edge is intentional (most readable line for new players) and inside tuning noise. Beta telemetry gate: any archetype exceeding +15% of the median pick-weighted EV gets its Expression counterweight raised one step.

---

## 12. FTUE ramp (gated by server-side banked-run count; systems invisible pre-unlock)

| Banked runs | Unlocked |
|---|---|
| 0–3 | Current tutorial; genes offered without strain tags shown |
| 4 | Strain tags + body tinting visible; Minor passives active |
| 8 | **Expressions** unlock (first-time cinematic + contract) |
| 10 | **INFUSE** appears at portals |
| 12 | Heirloom/lineage points activate (also requires owning 2+ variants) |
| 15 | **Splices** discoverable; Codex opens |
| 20 (or any M3) | **Apexes** unlock |

Pre-unlock, the systems are invisible (not greyed out) — day-1 remains "snake, food, portal, choice-of-2."

---

## 13. Removed / replaced

- Uniform mutation offer draw → seeded gravity algorithm (offers become exact-validated).
- "Mutation" naming in UI copy → "Gene" (wire ids/DB values unchanged for migration safety).
- Held cap 4 → **6**.
- Compound Interest +0.10/held → +0.05/held, cap +0.30.
- Uncapped outcome multiplier → bank clamp 1.75 / salvage clamp 0.90.
- 4-week anomaly rotation → 5-week (adds Overgrown; `anomaly_for_week` migrated in lockstep).
- Variants as cosmetics-only → Lineage carriers (the biggest disconnect, closed).
- Two simultaneous revives (Phoenix + anything) → hard one-revive-per-run rule.
- Nothing else is deleted: all 22 existing mutation ids, 8 trait ids, 4 anomaly ids, mastery curve, streak/set/duel stack, extraction cadence, and the Phoenix voiding proof survive verbatim.

## 14. Shareability inventory

1. **Genome Card** (run summary): body render with strain-tinted segment bands (each gene claims a band; splices braid two colors; Expression = full-body pulse; Apex = crown aura), gene-sequence barcode strip, and the payout cascade `raw → ×genome → ×bank(+infuses) → ×streak → ×set → ×duel → TOTAL` animating line by line. Export: PNG + share/download.
2. Expression trigger flash (screen-wide strain-color wash + named banner; ≤2.5 Hz photosensitivity budget; `prefers-reduced-motion` swaps to static card).
3. Splice fusion animation (two body bands braiding) + "FIRST DISCOVERY" variant.
4. Ouroboros bite, Midas chains, Arc Lightning chains, Singularity feast, Second Sun revive — signature spectacle moments.
5. Clutch stamp: banking within 5 foods of a 3rd infuse stamps the card "ALL IN".

## 15. Risks

1. **Bounded-trust surface grows** (Gilded Wake, Midas, Static Charge,
   Ricochet, Ouroboros, and the bounded Rule-15 trigger facts). Individual and
   aggregate caps remain mandatory. Fortress removed the old molt-pickup claim
   rather than repointing it.
2. **The pressure model is load-bearing infrastructure** (Bulk Up, Last Gasp,
   infuse eligibility, food placement, rendering). Logical segments, physically
   occupied cells, and committed cells are distinct quantities. New effects may
   add length or transform it into permanent terrain; they may never truncate
   it or make a committed cell free again.
3. **UMBRA heirloom concentration** (4 of 8 traits) plus salvage buffs could enable salvage-farming. EV says banked lines dominate at ≥0.62 p(bank); mitigation ready: salvage clamp 0.90 → 0.80.
4. **Mono-strain consistency** could collapse diversity. Dial: wildcard 25% → 35% if mono-strain exceeds 40% of elite runs.
5. **Comet Tail / All In** are the likeliest clamp-breakers; pre-tuned nerfs ready (Comet Tail portals −50 ticks; All In +0.12/held).
6. **Scope**: engine, validator, offers, breeding, anomalies, gauntlet, 4 migrations. Build order: strains/thresholds → gravity offers → infuse → splices → lineage/heirloom points → anomaly/gauntlet/codex.
