# The Gear System — SupaSnake's years-long progression spine

**Status:** DESIGN PROPOSAL, 8 August 2026. No implementation. No migration.
**Authority:** derived from `docs/PRODUCT_CONSTITUTION.md` v1.16 and checked against
its fifteen Inviolable Rules, the §12.2 caps, and the §12.3 dilution test.
**Requires:** the amendment package drafted in
`docs/game/GEAR_CONSTITUTION_AMENDMENT_DRAFT.md`. That file is a proposal; the
Constitution itself is untouched by this work.
**Commissioned by:** the owner's directive of 8 August 2026 (quoted in §1.1).
**Doctrine:** `docs/ENGINEERING_DOCTRINE.md` §3 prior-art gate — executed in §0.

---

## 0. The prior-art gate

Doctrine §3: *any work package that builds or reshapes an infrastructure system
opens with a prior-art brief, before implementation.* Gear is persistence,
settlement, and validation at once. Five references, verified August 2026, with
what each got right, what players hate about it, and what we reject.

### 0.1 Survivor.io — the owner's named reference

**What it does.** Equipment climbs Grey → Green → Blue → Purple → Yellow → Red,
with numbered sub-tiers inside Purple, Yellow and Red. Rarity promotion is a
**merge**: you consume duplicate copies of the item, and "the requirement for this
will increase as your merge to a higher and higher level of rarity." *Levels* are
a separate axis paid in **Equipment Designs + Gold**, where "the higher the level,
the greater the cost will be of both these resources." At Red, the **Astral Forge**
opens and consumes four distinct stone types — Basic, Eternity, Chaos, Destroyer —
obtained by salvaging other gear. The SS/Relic tier is quoted at **50 Eternal Cores
+ 50 Voidwaker Cores + 2,000 Cubes** for one cast. Cores themselves come from the
weekly **Clan Expedition** and from repeatable challenges; the guides rank Relic
Cores as the **#2 purchase priority** in the Clan Store. Acquisition of the base
items is gacha: S-Grade Supplies costs 300 gems for one open or 2,680 for ten, with
an **Excellent piece guaranteed after ten opens** — a pity floor.
([OneChilledGamer equipment guide](https://onechilledgamer.com/survivor-io-equipment-guide/),
[mTurboGamer clan expedition guide](https://mturbogamer.com/2026/07/survivor-io-clan-expedition-guide/),
[SurvivorIO Wiki, SS equipment](https://survivorio.fandom.com/wiki/SS_equipment))

**What it got right.** Three separable axes (rarity / level / forge) let one item
be a years-long project instead of a checkbox. Scarce material gated behind a
**weekly clan activity** turns the social surface into the progression surface —
the mechanism the owner names as why they stayed two years. And the material is
*hard-capped by calendar*, not by wallet or skill, so the grind has a floor a
working adult can hold.

**What players hate.** Equipment "doesn't offer benefits until it reaches a grade
of Better or higher" — the item you just earned does nothing, for weeks. Merge-by-
duplicate makes acquisition a gacha, so progression is bought randomness wearing a
crafting costume. Four stone types plus Designs plus Gold plus Cubes plus two Core
species is a currency thicket whose only function is to make the wall un-estimable.

**What transfers.** The weekly-capped scarce material; the two-axis split where one
axis unlocks and the other fills; clan activity as a material source.
**What does not.** Every random step, every duplicate requirement, and the entire
currency thicket. SupaSnake has a hard cap of one currency (§12.2) and a
constitutional ban on paid or laundered randomness (§1, Rule 4).

### 0.2 Idle/incremental math — the years-long curve

**What it says.** "The main idea behind math in idle games is exponentiality" —
**costs grow exponentially while production grows linearly or polynomially**, and
"exponential growth will eventually catch and far exceed any polynomial growth."
The consequence the genre exploits deliberately: because cost is exponential in
level, *effective power is logarithmic in spend*. Prestige exists precisely because
the log curve flattens and needs a reset to stay interesting.
([Kongregate/Game Developer, *The Math of Idle Games*](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i),
[Medvešček Murovec, *Math — the backbone of Idle Games*](https://medvescekmurovec.medium.com/math-the-backbone-of-idle-games-part-1-f46b54706cf1))

**What transfers, and it is the single most important import in this document.**
A leaderboard that reads a build-inclusive number can only survive if investment
power is **logarithmic in investment**. Exponential cost with linear power is not a
monetization trick here; it is the *fairness mechanism*. It converts a 1.94×
advantage in accumulated material into a 12% advantage in output (§3.7). SupaSnake
already
ships this shape once — Ascendance pays ×1.02 per generation while breeding cost
compounds ×1.25 (`supabase/migrations/047_deterministic_lineage_draft.sql:132`).
Gear copies it deliberately.

**What we reject.** Prestige. A reset that trades accumulated power for a
multiplier is confiscation under Rule 6, and Rule 15's grammar — nothing that costs
the player may be paid in something the player gets back — points the same way. Our
answer to a flattening curve is new *horizontal* gear, not a wiped vertical one.

### 0.3 MMO weekly lockouts — why a cap retains instead of exhausting

**What it says.** Weekly lockouts "prevent hardcore raiders from grinding the best
gear in a single session" and "stop players from hitting the newest item level cap
in one day," described as the developer's way "of keeping things fair for both
casual and hardcore players." The observed player effect is the interesting half:
once the weekly cap is hit, players "can stop chasing tomestones and play what they
actually want."
([Massively OP on FFXIV 6.57 tomestone caps](https://massivelyop.com/2024/02/13/final-fantasy-xiv-increases-weekly-tomestone-limits-with-patch-6-57/),
[MMOs.com](https://mmos.com/news/final-fantasy-xiv-patch-6-57),
[FFXIV lockout explainer](https://www.fandomspot.com/ffxiv-what-is-lockout/))

**What it got right, restated as a finding this design leans on.** A cap is not a
brake on the committed player; it is **permission to stop**. It also has a property
nobody sells it on: *a hard monthly conversion cap is an anti-bot system*, because a
script that plays four hundred runs a day earns exactly what a diligent human earns.
That is §5's central answer to the cheating-vector shift.

**What players hate.** Caps that arrive as *obligation* — the weekly chore you must
clear before the cap resets or lose it forever. FFXIV's own patch history is a
record of raising caps and removing restrictions in response.
**What we reject.** Loss on expiry. Under Rule 5 a missed week costs that week's
opportunity and nothing else; there is no backlog, no debt, and no catch-up task.

### 0.4 Pity and catch-up — the year-two newcomer

**What it says.** Soft pity lifts odds after a drought (≈75 pulls), hard pity
guarantees at a ceiling (≈90); together they exist because "player sentiment tracks
streaks rather than just averages." The catch-up literature names the failure
plainly: the concern is "if someone doesn't have hundreds of dollars to spend, how
long does it take to catch up," and the "rich getting richer" effect can make it
"nearly impossible for free or light spenders to catch up, regardless of skill."
([Gashapoint, pity systems](https://gashapoint.com/gacha-games/pity-systems-explained/),
[MWM glossary, pity](https://mwm.ai/glossary/pity-system),
[Mailvaltar, *NTE — progression and gacha mechanics*](https://mailvaltar.wordpress.com/2026/05/28/nte-progression-and-gacha-mechanics/))

**What transfers.** The *diagnosis*, not the cure. "Regardless of skill" is the
sentence this design must never earn. It produces two hard requirements: a
deterministic curve with **no variance at all** (so pity has nothing to protect
against), and an explicit, bounded catch-up ramp (§3.8) plus a rising public floor
(§3.9).
**What we reject.** Pity itself, and the randomness that makes it necessary. A
guaranteed-after-ten mechanic is a confession that the first nine were a tax.

### 0.5 Battle-pass lane design — "finish all the lanes we offer"

**What it says.** The loop works: passes "incentivise players to return daily or
weekly to complete tasks." The cost is documented just as clearly: "when every game
you play asks for weekly chores, gaming stops feeling like a hobby… you log in not
because you want to, but because you feel like you have to," and FOMO from
limited-time seasons is "by design." The stated healthy alternative is that "some
games allow you to make good progress by simply playing the game."
([Machinations, *Battle passes and how to balance them*](https://machinations.io/articles/battle-passes-and-how-to-balance-them),
[Kidelight, *Battle Pass Fatigue*](https://www.kidelight.com/2026/02/battle-pass-fatigue-is-live-service.html),
[HowToGeek, *How battle passes are ruining multiplayer games*](https://www.howtogeek.com/how-battle-passes-are-ruining-multiplayer-games/))

**What transfers.** The lane *portfolio* — several parallel ways to earn, so no
single one is compulsory.
**What we reject, and this is the design's sharpest constraint.** New lanes as new
surfaces. §12.2 caps daily ritual surfaces at **1** and recurring clan surfaces at
**1**, and §12.4 lists "a new daily surface" as a *forbidden* response to a bad
month. So every effort lane in §3.6 is a **reading of a surface that already
exists** — the Signal, the Take, the Serpent battle, Ascension, the ladder. Gear
adds zero screens a player must visit and zero tasks a player must clear. "Finish
all the lanes we offer" is satisfied by *playing the game the game already asks for*
— which is the healthy alternative the prior art names and almost nobody ships.

### 0.6 Mapping onto the doctrine's invariants

| Reference | Principles served | Catalog entries prevented |
|---|---|---|
| Weekly cap as anti-bot (0.3) | 1 (play always available), 3 (checks never destroy honest value) | FM-7 — a skill-scaled farm meeting a fixed cap degrades to "capped", never to "rejected" |
| Deterministic curve, zero variance (0.4) | 4 (one source of truth per fact) | FM-1 — no client-side preview can disagree with server settlement if there is nothing to roll |
| Log power / exp cost (0.2) | A0 — no ceiling invalidates a legitimate run | FM-7, FM-12 — power is bounded by construction, so no clamp is ever needed at the top |
| Deferred, reconciling grants (0.3, 0.5) | 2 (server completes without the client), 7 (every state has an exit) | FM-11 — grants settle after validation, never before |
| Frozen run stamp (0.1) | 4, and Constitution v1.13's "a rolling deploy may never reinterpret an Energy-funded run" | FM-12 — the run carries its own version |

---

## 1. The fairness thesis

### 1.1 The directive

> "we will make gear, that powers the snake, essentially improves the multiplier in
> addition to the Ascendance… the head can wear multiple items, like the shades, the
> braids, and who knows what we can make fit, and the segments, maybe the first 3-4
> are slots for additional equipment/gear. all of them power the snake, and can be
> upgraded, and will be a major factor in Ascendance and the endless Progression."
>
> "first upgrades will work with DNA, then we will use Cores… of which players will
> only have the opportunity to get a few a month, maybe 1 a week, with upside for
> those who grind the most (effort must be rewarded). and effort is worth more than
> skill… best is of course if you have both. but players who log in every day and
> finish all the lanes we offer will get ahead, and that essentially means we can
> drop score and work only on yield and depth, because our fair measure is combined
> from skill and effort."
>
> — owner, 8 August 2026

### 1.2 The stance

**SupaSnake's fair measure is skill × effort, and it refuses to rank either one
alone.** A player who shows up every day and finishes every lane will out-earn a
better pilot who shows up occasionally. A better pilot will out-earn an equally
diligent one. Neither can substitute entirely for the other, and money can reach
neither.

This is not a softening of the skill position. It is a correction of a measurement
error the Constitution already half-admits: Score is build-independent by Rule 2,
which means the entire product — genes, strains, splices, lineage, Ascendance, and
now gear — is invisible on the only ladder the game ranks. The game's deepest
systems have never been measurable. §6.2 says Yield "is where the build is
*supposed* to matter"; today it matters nowhere a stranger can see.

### 1.3 The thesis is arithmetic, not sentiment

The claim "effort is worth more than skill" and the claim "skill is the bigger
lever" are both true, and they are not in tension, because they are measured over
different windows. Numbers, from the shipped curves:

**Within one run, skill is the larger lever.** CYBER's `foodDnaValue` is
`round(10 × (1 + 0.5 × min(4, floor(n/5))))` (`src/shared/game/rulesets.ts:397`,
`:240`). Summed exactly: **490 DNA at 24 foods, 1,210 at 48** — the 1,210 matching
the figure the file's own docstring quotes. Doubling your food count is therefore
worth **×2.47**, and quadrupling it (12 → 48 foods) is worth ×6.91. A complete,
fully-maxed three-year gear kit is worth **×2.19** (§3.5). *Full gear is worth
slightly less than doubling a single run, and far less than piloting one well.*

**Across one month, effort is the larger lever.** Depth is the sum of a member's
five strongest Yields per 3-day battle cycle (§7.3), and there are roughly ten
cycles a month. A player who fills all five slots in all ten cycles contributes
fifty results; a player who appears twice a month contributes ten. That is a **≈5×**
effort lever on the clan number, which no build multiplier approaches.

**So the two public numbers answer two questions honestly.** *Yield* asks how good
one run was, and skill dominates it. *Depth* asks what a dynasty is worth when it is
tested repeatedly, and effort dominates it. Gear is the bridge that lets effort
raise Yield too — bounded, so it never overturns the run.

### 1.4 The consequences, owned

1. **The per-run ladder stops being pure.** A well-geared average pilot can outrank
   an ungeared strong one on a single run. Accepted deliberately: the alternative is
   a ladder that measures nothing the player builds. The bound is §1.3's arithmetic —
   the gear lever is smaller than the skill lever inside one run, so a *large* skill
   gap still wins.
2. **The fairness law loses its mechanical proof and must be rebuilt.** Rule 2 is
   enforced today by `npm run verify:constitution` against two locked folds. Ranking
   Yield means the ranked number reads the build. The replacement is §4.3: the
   build-independent fold survives as a **private** integrity instrument, not a
   public ladder, and the verifier keeps its job.
3. **Money must never touch gear, in any form, at any distance.** With Score
   retired as the ranked number, Rule 3 is no longer one of two fairness guarantees;
   it is the only one. §6 states the boundary bluntly and §4 proposes strengthening
   Rule 3 and §10.4 in the same package.
4. **The attack surface moves from build-buying to time-farming.** If effort is the
   measure, the way to cheat is to manufacture effort: bots, alts, AFK. §5 is the
   answer, and its core is structural rather than forensic.
5. **A year-two arrival must be able to compete.** A build-inclusive ladder with an
   uncapped accumulation curve is the "rich get richer" failure the prior art names
   (§0.4). §3.7–§3.9 bound it three ways: logarithmic power, a catch-up ramp, and a
   rising public floor.

---

## 2. Slots — the Kit

### 2.1 The one decision everything else rests on: rigs and skins are different things

The owner's examples are "the shades, the braids." Migration 069 already ships
`face` (shades) and `crown` (braids) as **cosmetics** — free, catalogued in
`cosmetic_definitions`, equipped through `player_loadout`, and governed by §10.2's
Atelier, which is allowed to sell them. If gear *is* those items and gear has power,
then §10.4 collapses on day one.

The resolution is a split, and it is load-bearing:

- **A RIG is the powered thing in a slot.** Earned only. Never sold, never gifted,
  never randomised. It has a rank, a level, and one condition. It is invisible on
  its own.
- **A SKIN is how the rig looks.** Zero power. Earnable, granted, or sold. Lives on
  the existing 069 substrate, in the existing slots, under the existing rules.

So "shades" is not one object. **VISOR** is a rig in the EYES slot; *Neon Shades*
and *Chrome Aviators* are skins that render it. A player who owns no skins still
sees a default rig on their snake; a player who buys every skin has exactly the
power of a player who buys none.

This is what makes the IP frame safe. The owner's north star is characters as real
collectibles and merch — visible wearables as the brand. **The entire merch and SKU
surface lives in the skin layer**, which is precisely where §10 already permits
money. The power layer is a number in a table that no euro can reach.

**The skin layer is deferred (owner ruling, 8 August 2026: "we'll do the skins
later").** The visual/wearable work is shelved and the *system* is the standing
focus. This is a clean cut precisely because of the split above: rigs carry every
number in this document and render as a default appearance; skins add nothing the
economy reads. Consequences, made explicit so the deferral does not quietly become a
gap:

- **§8's WP order already puts G-8 (skins) last**, off the critical path, depending
  only on G-3. No earlier package waits on an asset.
- **A rig with no skin is not a placeholder.** Every slot ships one default
  appearance, which is what the run renders. An empty catalog renders as an empty
  category, never as a promise — migration 069's own rule for `food_skin`.
- **The renderer is not the blocker, and is further along than the deferral
  suggests.** The segment-anchor mechanics — attaching a wearable to a moving body
  segment and keeping it oriented — are built on `feat/armor-wearable` (`4b73e2a`
  "ARMOR, designed as a wearable"; `db82b6a` "the plate becomes a BAND, and the
  harness that found it"). That is ready infrastructure to inherit when the skin
  phase opens, not work to redo.
- **Nothing in §3, §5, §6, or §7 depends on a single asset existing.** The economy,
  the integrity posture, the monetization boundary and the schema are all complete
  against rigs alone. That is the test of whether the split was real, and it passes.

### 2.2 The slot taxonomy — seven slots

| # | Slot | Worn where | Launch content | Opens at |
|---|---|---|---|---|
| 1 | **EYES** | head | VISOR (shades) | first run |
| 2 | **CREST** | head, top | MANE (braids) | 4 banked runs |
| 3 | **JAW** | head, lower | RIG-JAW (breather/fangs) | 12 banked runs |
| 4 | **PLATE I** | segment 1 | armour — art lane in progress | 1 banked run |
| 5 | **PLATE II** | segment 2 | armour | 20 banked runs |
| 6 | **PLATE III** | segment 3 | armour | 40 banked runs |
| 7 | **PLATE IV** | segment 4 | armour | Mastery M3, any dynasty |

Three head slots and four plates. The head is the identity surface — it is what a
share card, a lineage portrait and a plush toy show — so it gets the expressive
slots. The plates are the armour lane, and they read as a set: four pieces of one
suit, which is the natural SKU family and the natural merch family.

**Slots open by play, never by payment and never by time.** The gate is banked runs
and Mastery, both of which are Rule 3-clean and already server-authoritative. A
slot that opens is permanently open (Rule 6).

**Why seven and not more.** Seven is the number at which the additive power model
(§3.4) still lets one piece be legible — each maxed rig is 14% of the kit. It is
also the number the art lane can carry: at one new rig per quarter (§8, operating
cost) a seven-slot kit takes years to fill horizontally, which is the point. An
eighth slot is an amendment, argued from live data, exactly as a fourth dynasty is.

### 2.3 Acquisition — nothing is random, ever

A rig enters a player's possession four ways, all deterministic and all announced
in advance:

1. **Milestone grant.** The slot's opening also grants its starter rig. Every player
   who reaches 12 banked runs gets the same JAW rig.
2. **The DNA shelf.** Additional rigs for an open slot are bought outright for a
   fixed, published DNA price (§3.3). This is §10.3's earned-shelf grammar extended
   from cosmetics to rigs: **DNA-priced items are never euro-priced, and no item is
   ever purchasable both ways.**
3. **Season free lane.** Each season track's free lane carries one rig (§7.4 —
   tracks never expire, and late purchase is retroactive, so a 2029 arrival can
   still earn Season 1's rig).
4. **Ladder and Mastery-trial first clears.** The skill lane: a strong new player
   can hold rigs a diligent veteran has not earned. This is deliberate — it is where
   "best is both" is visible in the other direction.

**No loot box, no chest, no merge-by-duplicate, no reroll, no pity.** There is
nothing to be pitied against, because there is nothing to roll. Duplicate rigs do
not exist; a rig is owned or it is not.

### 2.4 Equip rules — server-held, Lab-managed, frozen at start

- **One loadout per account**, not per snake. Reasons: (a) the snake carries
  Ascendance already, and a per-snake kit would mean every newly bred Gen-21 child
  arrives naked, punishing the exact act Lineage exists to encourage; (b) Rule 6 —
  gear must never be stranded on a specimen the player retires or refunds under
  §8.2's one-step unwind; (c) §8.4's emotional centre is "the one equipped snake,"
  and the kit renders on whichever snake is equipped, so it reads as *my snake's
  kit* without multiplying the Lab's combinatorics.
- **Equipping happens in the Snake Lab**, following the atomic per-dynasty favourite
  pattern migration 064 established: one server transaction, one authoritative row
  per slot, no client-held selection.
- **The loadout is stamped into the session at run start**, beside the Ascendance
  curve version and multiplier, and settlement recomputes from the stamp. Mid-run
  swapping is not prevented by UI; it is *impossible*, because the run's gear power
  was fixed before the first input. A rolling deploy can never reinterpret a run in
  flight (v1.13's rule, generalised).
- **Run Setup adds zero taps.** Gear appears as one preset line beside the snake and
  the Energy commitment, exactly as §5 requires. The ≤3-tap law is untouched.
- **Gear changes what a run is worth; it never changes how a run plays.** No speed,
  no extra hold, no collision grace, no shield, no length effect (Rule 15), no
  portal timing, no gene odds. §4 proposes adding this sentence to §5's protected
  list. The argument is the camera argument from v1.16: two players on one ladder
  must read the same geometry — and must play the same physics. If gear bought
  difficulty reduction, effort would be buying an easier game, which is the
  Survivor.io failure mode the owner left.

### 2.5 Conditions — what makes a rig a decision instead of a number

A flat multiplier is not a build. Each rig carries **exactly one condition**, drawn
from a bounded catalog of **≤12** conditions, fixed at authoring time — never
rolled, never rerolled (the deterministic-breeding precedent, §8.2).

A condition modulates the rig's own bonus and nothing else. Examples in the ratified
register:

| Condition | Reads | Pays |
|---|---|---|
| BANKER | you BANK at the third portal or later | full bonus, else half |
| DEEP | foods eaten past food 30 | full bonus on those foods only |
| CLEAN | no wall contact death in the prior run | full bonus |
| WOVEN | per Strain rung reached this run | +1/6 of bonus per rung, to full |
| PATIENT | foods eaten while a Gene relic is live | full bonus on those foods |

Conditions change *what you aim for*, not what the board does. They are the reason a
player owns three EYES rigs and swaps between them, and they are the reason a rig
that is worse for you is still worth owning — which is what keeps §2.3's DNA shelf
alive after the milestone rigs are all granted.

**Bound, so this does not become a second Genome:** ≤12 conditions total across the
whole catalog, one per rig, visible in the Lab, stated in one line, and computed by
the same settlement fold that already computes Yield. No new in-run surface, no new
decision beat, no interruption. Rule 1 is untouched.

---

## 3. The upgrade economy

> **Every table in this section is generated.** The model is
> `scripts/sim/gear-economy.mjs` — deterministic, no `Math.random`, no
> `Date.now`, no I/O, so two runs on two machines produce identical output.
> Regenerate with `node scripts/sim/gear-economy.mjs`, and check this document
> against the model with `node scripts/sim/gear-economy.mjs --validate`
> (**22/22 figures passing** as of `a53b81d`). If the doc and the model
> disagree, the model is right.
>
> What the model deliberately omits — bank/crash variance, skill improvement
> over time, clan-battle outcomes beyond a fixed win rate, and churn — all push
> the reported gap between cohorts *up*. Every fairness number below is
> therefore a **ceiling on the gap, not an expectation of it**.

### 3.1 Two axes that interlock instead of competing

- **LEVEL** is the DNA axis. Levels 1…60, bought one at a time, always available.
- **RANK** is the Scale axis. Ranks I…VI. **Rank R caps level at 10R.**

A Scale never buys power directly; it raises the ceiling that DNA fills. A DNA spend
is never blocked by scarcity; it is blocked by a ceiling you can see and a date you
can count to. This is the single structural decision that makes the two currencies
non-substitutable, and it is what keeps DNA a sink **forever** rather than for four
months: every rank promotion re-opens ten levels on that rig, at the exponential
prices those levels sit at.

### 3.2 Naming — SCALES

The owner asked for a better name than "Cores." This document uses **SCALES**
throughout as a working name; the decision is D1 in §9 and a rename is one
find-and-replace.

Why Scales: it is a *thing a snake actually has*, so it is kid-clear at first sight
and needs no fiction to explain; it is armour material, which is exactly what the
plate lane is made of; it is a physical collectible shape, which the merch frame
wants; and it already exists as a colour token in the codebase (`scale-blue`), so
the visual language is half-built. It sits in the ratified GOLD/PULSE/COILS/WARP/RISK
register — one syllable, concrete, cool without being clever.

**There is no second noun for fractions.** Scales are stored server-side in
hundredths, exactly as Ascendance multipliers are stored in basis points, and the
player sees one number and a progress line: `SCALES 12 · next in 2 days`. This is
not a currency-avoidance trick — it is the same fixed-point representation the
economy already uses, and it means the §12.2 cap is asked to admit **one material,
not two**.

### 3.3 The DNA curve — the sink the economy has been missing

**Level *n* costs `60 × 1.12^(n−1)` DNA**, rounded.

| Level | Cost of that level | Cumulative, one rig | Cumulative, all 7 |
|---:|---:|---:|---:|
| 1 | 60 | 60 | 420 |
| 10 | 166 | 1,052 | 7,364 |
| 20 | 517 | 4,322 | 30,254 |
| 30 | 1,605 | 14,478 | 101,346 |
| 40 | 4,985 | 46,024 | 322,168 |
| 50 | 15,482 | 143,998 | 1,007,986 |
| 60 | 48,086 | 448,296 | 3,138,072 |

**Why exponential at 1.12.** It is the gentlest base that still produces a
five-order-of-magnitude spread across sixty levels, which is what makes power
logarithmic in spend (§0.2) and therefore what makes a Yield ladder survivable. It
is deliberately shallower than breeding's 1.25 (migration 047) because gear is the
*wide* investment — seven parallel curves — while Ascendance is the deep one.

**Sized against the real faucet.** A once-daily player who commits six Energy to one
good run credits ≈1,000 base Yield × 10 (commitment) ≈ **10,000 DNA/day**. A heavy
player recovering the theoretical 24 Energy/day credits ≈**40,000/day**. Against
that:

- The **first full kit at Rank I** — all seven rigs to level 10 — costs **7,364 DNA**
  and is a day of play. A new player sees +14% Yield in their first session or two.
  This is the direct rejection of Survivor.io's "no benefit until Better grade."
- The **complete level-60 kit** costs **3.14M DNA**, which no amount of daily play
  reaches before the Scale curve gates it anyway (§3.5).
- Together with breeding — Gen 30 alone costs ≈1.28M DNA for a single step under
  migration 047's `base × 1.25^(gen−3)` — the endgame DNA sink is in the tens of
  millions. DNA's weak-sink problem is closed.

**Power per level: +0.20 percentage points of Yield.** Sixty levels = +12.0 pp per
rig.

### 3.4 The Scale curve, and the shape of power

| Rank | Scales for this promotion | Cumulative Scales | Level cap | Rank base | Rig total at cap |
|---|---:|---:|---:|---:|---:|
| I | — (granted with the rig) | 0 | 10 | +0.0 pp | **2.0 pp** |
| II | 1 | 1 | 20 | +1.0 pp | **5.0 pp** |
| III | 2 | 3 | 30 | +2.0 pp | **8.0 pp** |
| IV | 4 | 7 | 40 | +3.0 pp | **11.0 pp** |
| V | 7 | 14 | 50 | +4.0 pp | **14.0 pp** |
| VI | 11 | 25 | 60 | +5.0 pp | **17.0 pp** |

**A complete kit is 7 × 17.0 pp = 119 pp of gear power, and costs 175 Scales +
3.14M DNA.**

The aggregation rules, and why:

- **Additive across rigs.** `P = Σ rig bonuses`, in percentage points. Additive keeps
  each piece's contribution legible — "this plate is 14% of my kit" — and prevents a
  seven-way multiplicative stack from going exponential in slot count.
- **Gear multiplier `G = 1 + P/100`.** At a complete kit, **G = ×2.19**.
- **Multiplicative against Ascendance.** `Yield = base × A × G`, where `A` is the
  frozen Ascendance multiplier. Multiplicative because they are independent
  investments in different pillars-of-one-pillar, and because v1.4's D2 ruling
  requires each to be *separately inspectable* in the Lab, Run Setup, and Results —
  "your snake is ×1.40, your kit is ×1.98, together ×2.77" is only a true sentence if
  they compose by multiplication.
- **Both are frozen at run start**, in basis points, on the session row.
- **Gear multiplies Yield itself, not credited DNA.** Yield is charge-independent
  (§6.2), so gear reaches **Depth**. That is the owner's intent — gear is meant to
  matter in the clan battle — and it is precisely why §6's monetization boundary is
  absolute rather than merely strict.

Verify the cost/benefit shape is logarithmic. Cumulative Scales `c` against rig
power: 0→2.0, 1→5.0, 3→8.0, 7→11.0, 14→14.0, 25→17.0 pp. That fits
`power ≈ 2 + 4.7·ln(1+c)` to within 0.8 pp across the whole range. **Power is
logarithmic in Scales by construction.** Everything in §3.7 follows from this line.

### 3.5 Where the total lands, and why it lands there

| Lever | Multiplier | Source |
|---|---:|---|
| Doubling a run, 24 → 48 foods (CYBER) | **×2.47** | shipped Yield curve |
| Complete gear kit, ~2–3 years | **×2.19** | this design |
| Ascendance at Gen 30 | ×1.71 | `1.02^27` |
| Ascendance at Gen 50 | ×2.54 | `1.02^47` |

The gear ceiling is set at ×2.19 **because it must be smaller than ×2.47**. The
design target, stated as a law for future tuning: *the complete kit must never be
worth more than doubling a single run's food count.* Effort is a large lever; skill
is a larger one, inside the unit the leaderboard measures. That sentence is the
fairness thesis reduced to a number a reviewer can check, and it is the constraint
any future rig, rank, or slot must be balanced against.

### 3.6 The effort lanes — where Scales come from

**Zero new surfaces.** Every lane is a reading of a surface the Constitution already
sanctions. §12.2's caps on daily and clan surfaces are not approached.

| Lane | Surface (existing) | Cadence | Scales ×100 | Notes |
|---|---|---|---:|---|
| **SIGNAL** | World Signal objective (§7.2) | daily | 10 | The daily ritual; consumes no Energy |
| **TAKE** | Daily Take, first banked run (§7.2) | daily | 4 | Flat — the Take streak multiplies DNA only |
| **HUNT** | fill all five best-five slots (§7.3) | per 3-day cycle | 25 | The effort lane proper |
| **VICTORY** | winning side of a battle (§7.3) | per cycle | 10 | Capped, see §5 |
| **ASCENSION** | monthly league tier held (§6.1) | monthly | 60 / 100 / 150 | By tier band |
| **LADDER / TRIALS** | ladder rung, Mastery trial first clears (§8.6a, §8.1) | one-time | 100 each | The skill lane — not part of cadence |

**The monthly arithmetic:**

| Player | Lanes finished | Scales ×100 / month | **Scales / month** |
|---|---|---:|---:|
| **Floor** — plays daily, nothing else | Signal + Take | 300 + 120 = 420 | **4.2** |
| **Full** — finishes everything | + Hunt ×7, Victory ×7, Ascension top band | 420 + 175 + 70 + 150 = 815 | **8.2** |

That is the directive satisfied literally: **a baseline of about one a week; a few a
month; and the player who finishes every lane earns 1.94× the player who only shows
up.** The grinder upside is real, visible, and bounded.

The one-time lane is the counterweight the thesis needs: a strong new player
clearing eight ladder rungs and three Mastery trials banks **11 Scales** on ability
alone — nearly three months of a diligent player's cadence, earned in a fortnight of
excellence. Best is both, in both directions.

**Rule 5 holds exactly.** A missed day costs that day's Signal and Take Scales and
nothing else. Nothing expires, nothing banks as debt, no lane must be "cleared," and
a thirty-day absence costs thirty days of opportunity and zero owned Scales.

### 3.7 The years-long curve, and the spread it produces

A complete kit is **175 Scales**.

| Player | Scales/month | Months to a complete kit | Years |
|---|---:|---:|---:|
| Floor (daily ritual only) | 4.20 | 42 | **3.5** |
| Full (every lane) | 8.15 | 22 by cadence; **21** with the one-time ladder grants | **1.8** |

Now the tables the whole design exists to produce. `node scripts/sim/gear-economy.mjs`,
24 months, six cohorts:

#### Cohort trajectory — kit power and Yield multiplier

| Month | login_only | casual | full_lane | max_grinder | bot |
| --- | --- | --- | --- | --- | --- |
| **1** | 26 pp · ×1.26 | 26 pp · ×1.26 | 38 pp · ×1.38 | 41 pp · ×1.41 | 41 pp · ×1.41 |
| **3** | 47 pp · ×1.47 | 44 pp · ×1.44 | 62 pp · ×1.62 | 65 pp · ×1.65 | 65 pp · ×1.65 |
| **6** | 62 pp · ×1.62 | 62 pp · ×1.62 | 77 pp · ×1.77 | 80 pp · ×1.80 | 80 pp · ×1.80 |
| **12** | 77 pp · ×1.77 | 77 pp · ×1.77 | 98 pp · ×1.98 | 98 pp · ×1.98 | 98 pp · ×1.98 |
| **18** | 89 pp · ×1.89 | 89 pp · ×1.89 | 110 pp · ×2.10 | 113 pp · ×2.13 | 113 pp · ×2.13 |
| **24** | 98 pp · ×1.98 | 98 pp · ×1.98 | 119 pp · ×2.19 | 119 pp · ×2.19 | 119 pp · ×2.19 |

#### Scales earned (lifetime, monthly ceiling enforced)

| Month | login_only | casual | full_lane | max_grinder | bot |
| --- | --- | --- | --- | --- | --- |
| **1** | 4.2 | 4.8 | 10.2 | 12.2 | 12.2 |
| **6** | 29.4 | 32.6 | 54.9 | 59.9 | 59.9 |
| **12** | 54.6 | 55.6 | 103.8 | 108.8 | 108.8 |
| **24** | 105.0 | 105.4 | 201.6 | 206.6 | 206.6 |

#### The gaps that matter

| Month | login-only gear | full-lane gear | **GEAR gap** | bot gear | **bot vs full-lane** | bot DNA ÷ login-only DNA | **TOTAL gap (gear × Ascendance)** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **6** | ×1.620 | ×1.770 | **+9.3%** | ×1.800 | **+1.7%** | 19.0× | **+40.9%** |
| **12** | ×1.770 | ×1.980 | **+11.9%** | ×1.980 | **+0.0%** | 19.2× | **+41.9%** |
| **18** | ×1.890 | ×2.100 | **+11.1%** | ×2.130 | **+1.4%** | 19.4× | **+42.9%** |
| **24** | ×1.980 | ×2.190 | **+10.6%** | ×2.190 | **+0.0%** | 19.0× | **+40.3%** |

**A 1.94× advantage in accumulated material becomes a 10.6–11.9% advantage in
output**, stable across the whole two years. The grinder is unmistakably ahead — a
full rank on every rig, twenty-one percentage points of visible kit power, and a
complete kit nearly two years sooner — while the competitive spread stays inside a
band that a single better-piloted run erases. That is "effort must be rewarded" and
"the ladder still means something" holding hands, and the only reason it works is
that cost is exponential while power is not (§0.2).

**The anti-bot claim, proven rather than asserted.** The bot earns **19× the DNA** of
a login-only player — 10.5M DNA in month 24 alone — and converts it to **+0.0% gear
advantage** over the diligent human at months 12 and 24. Past month 1 the rank
ceiling is the binding constraint for *every* cohort, so unlimited DNA buys literally
nothing once levels sit at their cap. §3.1's interlock is not a nice property; it is
the entire defence, and it holds numerically.

**And the finding that costs this design something — see §5.6.** The *total*
multiplier gap is +40%, not +11%, because the remaining +26.5% is **Ascendance**,
which the bot buys with the DNA gear refuses. That is a pre-existing property of
uncapped lean runs (§8.6) meeting uncapped Ascendance (§8.2), and ranking Yield is
what makes it competitively load-bearing for the first time. It is filed as **D11**
and it is not something gear can fix by itself.

**The curve terminates, on purpose.** Everyone reaches a complete kit; the grinder
reaches it first. When they do, progression continues two ways: **horizontally**,
through new rigs with different conditions that enter at Rank I and must be climbed
again (the season lane, §2.3), and **vertically**, through Ascendance, which has no
ceiling at all. Gear is the bounded years-long climb with a visible summit;
Ascendance is the unbounded one behind it. Two different psychological jobs, and
neither needs a prestige wipe.

### 3.8 Catch-up — the Slipstream

A player who starts in 2028 must be able to compete in 2028.

**The rule.** Any account whose **owned** gear power sits below the 50th percentile
of active accounts earns Scales at **up to ×2** from the same lanes, until it
reaches the 60th percentile. Never above ×2, never past the 60th percentile, never a
grant of Scales it did not earn a lane for.

Design notes, each answering an attack:

- **Measured on owned, not equipped, power** — so a veteran cannot unequip to farm
  the ramp.
- **A rate, not a total.** The Slipstream never gives anyone more Scales than the
  system's ceiling; it gives them *sooner*. The 175-Scale summit is identical for
  everyone.
- **Self-correcting against sandbagging.** Holding your power down to keep the ramp
  costs you the Yield the Scales exist to buy. The incentive points the right way
  without a single enforcement action.
- **Percentiles are computed server-side on a daily cron over accounts with a valid
  run in the trailing 28 days**, and the resulting rate is a stored per-account fact,
  not a client computation.
- **Never framed as a handicap.** The Lab says "the field is ahead — you're earning
  double until you catch it." Nobody is told they are behind by a system that also
  refuses to help.

Effect: a 2028 arrival playing every lane earns ≈16.4 Scales/month and reaches the
active median in roughly ten to twelve weeks, then continues at normal rate.

### 3.9 The rising floor — and what it costs the veterans

The Slipstream alone is not enough at year three, because the median itself keeps
climbing. So the floor rises too.

**Each quarter, one rank becomes Standard Issue**: every account, new or old,
receives that rank on every rig it owns, free. Season 1 standardises Rank I (already
the grant rank); Season 5 standardises Rank II; Season 9, Rank III; and so on, always
lagging the median by a wide margin.

This is the WoW catch-up-gear pattern — this patch's entry gear is last patch's raid
gear — and it is the single most proven answer to the year-two problem.

**What it costs, stated plainly:** the veteran who spent seven Scales getting every
rig to Rank III watches that become free for a stranger. That stings, and pretending
otherwise would be dishonest.

**What is not taken:** nothing. No rank is removed, no Scale refunded downward, no
row written down (Rule 6). The veteran keeps every rank above the floor, keeps the
Scales they spent as *ranks they still hold*, and gains a permanent, unbuyable,
retroactively-unobtainable provenance mark — **"Rank III since Season 2"** — in
exactly the grammar §10.2 already blesses for Keeper tenure. Effort keeps its receipt
even when its power becomes standard. The prestige of having been early is the thing
that cannot be caught up to, and it is the right thing to make permanent.

### 3.10 The complete worked example

A player at month 14 of full-lane play, Gen 22 snake:

```
Scales earned          8.2 × 14              = 115
Kit                    7 rigs, ~16 Scales ea = Rank V, levels ~48
Gear power             7 × (4.0 + 9.6)       = 95.2 pp      G = ×1.952
Ascendance  Gen 22     1.02^19               =              A = ×1.457
Base Yield, 44-food CYBER bank                  ≈ 1,090 DNA
Yield (what Depth reads)   1,090 × 1.457 × 1.952        = 3,100
Credited DNA at 6 Energy   3,100 × 10                   = 31,000
```

Their next rank promotion on one rig costs 11 Scales — about six weeks of every
lane — and buys 1.0 pp plus ten levels worth 2.0 pp, ≈ +3 pp on a 95 pp kit: **a
3.2% Yield gain for six weeks of effort.** That is what a late-game step is supposed
to feel like, and it is why the early steps must be as fast as §3.3 makes them.

---

### 3.11 Sensitivity — the three dials the owner must set

`node scripts/sim/gear-economy.mjs --d2 --d4 --slipstream`. Each table is one
decision from §9, run at three settings so the choice is informed rather than
guessed.

#### D2 · the grinder dial

| Target ratio | Lane scale k | full-lane Scales/mo | Y1 gear gap | Y2 gear gap | full-lane kit @24mo | months to full kit |
| --- | --- | --- | --- | --- | --- | --- |
| **1.50×** | 0.532 | 6.3 | **+6.8%** | **+7.6%** | 113 pp | — |
| **1.94×** *(doc)* | 0.999 | 8.1 | **+11.9%** | **+10.6%** | 119 pp | 21 |
| **3.00×** | 2.127 | 12.6 | **+14.5%** | **+4.3%** | 119 pp | 14 |

**Reading — and it inverts the intuition.** A *steeper* grinder dial produces a
*smaller* long-run gap. At 3× the year-one gap is the widest of the three (+14.5%),
but by year two it has collapsed to **+4.3%**, because the grinder hits the
175-Scale terminal ceiling at month 14 and the rest of the field walks up behind
them. At 1.5× the gap is still *widening* at year two (+6.8% → +7.6%) because nobody
caps out inside the window. So the ceiling bounds the gap, not the dial; the dial
only chooses **when the grinder cashes out**. Picking 3× is therefore not the
"more unfair" option it looks like — it front-loads the reward for effort and brings
the whole population to parity sooner. The genuinely divergent option is the timid
one. My recommendation shifts accordingly: **1.94× or 3×, not 1.5×.**

#### D4 · the gear ceiling, against piloting

| Ceiling | pp scale | Full kit | Skill lever 24→48 foods | Gear overtakes piloting? | Food gap that erases full gear | Y1 gear gap |
| --- | --- | --- | --- | --- | --- | --- |
| **×1.80** | 0.672 | 80 pp | ×2.47 | no | 24 → 38 foods (+14) | +9.3% |
| **×2.19** *(doc)* | 1.000 | 119 pp | ×2.47 | no | 24 → 44 foods (+20) | +11.9% |
| **×2.60** | 1.345 | 160 pp | ×2.47 | **YES — gear wins** | 24 → 51 foods (+27) | +13.9% |

**Reading.** The ×2.47 skill lever is the wall. At ×1.80, an ungeared pilot erases a
maxed kit by eating **14 more foods** — gear is a nudge and three years of it is
worth less than a good afternoon's improvement, which under-rewards effort. At
×2.19, the price is **20 more foods**: a real, respectable gap that a genuinely
better pilot still clears. At ×2.60 the full kit exceeds the skill lever outright,
and the honest description of the per-run board becomes *a gear board with a skill
tiebreak*. **×2.19 is recommended and ×2.60 is the line I would not cross** — but
§9's D4 stands, because the directive can be read as wanting exactly that crossing.

#### Slipstream · a month-13 arrival, measured at month 18

| Mode | Rate | Joiner kit @18 | Median @18 | Veteran (full-lane) @18 | Joiner vs median | Joiner vs veteran | Months to reach median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **off** | ×1.0 | 77 pp · ×1.77 | 86 pp | 110 pp · ×2.10 | −4.8% | −15.7% | 11 |
| **mild** | ×1.5 | 89 pp · ×1.89 | 89 pp | 110 pp · ×2.10 | 0.0% | −10.0% | 5 |
| **strong** *(doc)* | ×2.0 | 95 pp · ×1.95 | 89 pp | 110 pp · ×2.10 | **+3.2%** | −7.1% | 4 |

**Reading.** The terminal ceiling is already doing most of the catch-up work: even
with the Slipstream **off**, a month-13 arrival reaches the population median in
eleven months and sits only 4.8% below it at month 18. The ramp buys *time*, not
outcome — eleven months becomes five (mild) or four (strong). Two things are worth
noting: strong overshoots the median slightly (+3.2%), which is the ramp working as
designed since it exits at the 60th percentile, not the 50th; and no setting lets a
newcomer pass a dedicated veteran, who stays 7.1% ahead even against the strongest
ramp. That is the correct shape — catch up to the *field*, never to the person who
earned it. **Strong is recommended; mild is defensible; off is survivable**, which
is itself evidence the design does not depend on the mechanism it added.

---

## 4. The amendment package — summary

The full proposal is `docs/game/GEAR_CONSTITUTION_AMENDMENT_DRAFT.md`. The
Constitution itself is not edited by this work. What follows is the summary and the
three arguments that carry it.

### 4.1 What changes

Nine amendments, one package: retire the Score ladder in favour of Yield (Rule 2,
§6.1, §6.2); strengthen Rule 3 and §10.4 to name gear, rigs, ranks, levels, Scales
and upgrade acceleration; admit **one earned material** and **one growth slot** to
§12.2/§12.1; widen the Lineage pillar to "the snake that is yours — bred and
outfitted" so no fourth pillar is created; add "gear changes what a run is worth,
never how a run plays" to §5's protected list; re-anchor Ascension to Yield; set the
ranked epoch to **seasonal**; and add §8.8 The Kit plus five new §17 open questions.

### 4.2 Dropping Score — what actually moves

- **The leaderboard reads Yield.** Rule 2's sentence "Score measures the pilot" is
  replaced by "the ranked number measures the run — skill and build together."
- **The epoch decision resolves, and gear is what resolves it.** A build-inclusive
  all-time board is unwinnable by a newcomer by construction. The ranked Yield board
  therefore becomes **seasonal (quarterly)**, and lifetime bests move to the
  Chronicle as permanent records (Rule 6 satisfied: standings reset, possessions
  never — §9.3's existing formula). This closes an open owner decision that has been
  outstanding since the Redesign Wave.
- **Ascension re-anchors** from "best ten daily Signal Scores" to "best ten daily
  Signal Yields." The monthly league becomes the skill×effort league, which is the
  owner's thesis expressed on the calendar, and it becomes a natural Scale lane.
- **Results loses its Score headline.** `src/components/game/RunResults.tsx:6`
  currently rules the order `Score → Victory Lap → payout facts → actions`. It
  becomes `Yield → Victory Lap → payout facts → actions`, with the gear and
  Ascendance multipliers named in the payout facts, as v1.4's D2 inspectability
  ruling requires.
- **The language system re-points.** Score's vocabulary retires from public copy;
  YIELD is already ratified language and already carries GOLD as its unit. No new
  words are minted, which is itself an argument for the change.
- **Ranked bands, if population ever justifies them, band on Yield percentile** —
  never on gear power, generation, or any account state. That path is already closed
  by kill-list #21 (generation-based skill brackets, deleted) and stays closed.

### 4.3 What must survive, strengthened

**1. Power is never sold. This is now the load-bearing fairness law.** While Score
existed, the product had two guarantees: a build-blind ladder *and* a no-paid-power
rule. Retiring the first means the second carries the whole contract alone. §6 states
it; §10.4 must name gear explicitly; and the §3 player contract — "a free player and
a paying player run the same board under the same rules for the same rewards" — is
unchanged and now more consequential than it has ever been.

**2. Energy is never sold.** Untouched, and reinforced: gear multiplies Yield while
Energy multiplies credited DNA, so the two never blur. No SKU may accelerate a rank,
a level, or a Scale.

**3. Server authority is absolute.** Every gear fact — ownership, rank, level,
loadout, Scale balance, Slipstream rate — is server-held and server-mutated. The
run's gear power is frozen into the session at start and settlement recomputes from
the stamp. Nothing gear-related may persist in browser storage of any kind (Rule 11).

**4. The build-independent fold survives as an instrument, not a ladder.** This is
the recommendation, and §9's D3 gives the owner the alternative.

`npm run verify:constitution` mechanically enforces that both score folds
(`computeRunTotals` at `src/shared/game/rulesets.ts:713`, `computeGenomeRunTotals` at
`:875`, accumulating at `:744` and `:948` — verified 8 August 2026; note that
`CLAUDE.md` still cites the pre-drift line numbers 312/499) do nothing but
`score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n))`.
That verifier is the only *mechanical* fairness proof the product owns. Deleting it
because the number it guards stopped being public would be trading a machine-checked
invariant for a policy.

Recommendation: **keep the fold, rename the output PILOT, and demote it from public
to private.** PILOT is shown on your own Results and your own Chronicle, feeds
Mastery, and is never ranked, never compared publicly, never on a board. The §12.2
public-numbers cap therefore stays at **2 — Yield and Depth**; PILOT is a private
number like Mastery XP.

The verifier keeps its exact job, guarding a fold that is now an *integrity
instrument*: **Yield ÷ PILOT is precisely the build's contribution to a run**. That
ratio is how gear inflation is audited forever, how the §3.5 ceiling law is checked
against live data rather than against this document, and — see §5.3 — it is the
primary automated signal that distinguishes a human from a farm. The cost of keeping
it is one fold and one CI job. It has never been worth more than it is now.

**5. Rule 15 is untouched.** No rig, rank, level, or condition may reduce length or
increase free space. §2.4's "worth, never physics" rule makes this true by
construction rather than by review.

### 4.4 The dilution test (§12.3), run explicitly

| | Requirement | Answer |
|---|---|---|
| A | Serves Mastery, Lineage, or Discovery | **Lineage**, widened to "the snake that is yours — bred and outfitted." No fourth pillar. |
| B | Lands in a §12.1 slot | **Slot 8, Gear lines** — the package opens it, and pays for it in C. |
| C | Increments no §12.2 cap | Public numbers stay **2** (Yield, Depth; PILOT is private). Currencies stay **1** (DNA) plus **one earned material** (Scales) — a cap change the package argues and prices. Modes, dynasties, pillars, SKU archetypes, Results layers, daily surfaces, clan surfaces: all unchanged. |
| D | Zero mandatory taps before a run or after Results | Run Setup gains one preset **line**, no tap. The Lab is opt-in. Results gains no layer. |
| E | Survives Rule 5 — ignorable without destruction | A missed day costs that day's Scales. Nothing decays, expires, or is confiscated. A player who never opens the Lab plays an identical game at a lower multiplier — as they already do by never breeding. |
| F | No euro reaches any number it computes | §6. Rigs, ranks, levels, Scales, slots and acceleration join §10.4's never-sold list. Skins are the only commercial surface. |
| G | States its permanent operating cost | ≈1 new rig per quarter (one catalog row, one mesh, one condition from the existing ≤12), one shared balance curve rather than per-item tuning, one Lab screen, one quarterly Standard-Issue flip, and one telemetry review of the §3.5 ceiling law. No per-day content. Priced at current headcount: low, bounded, and the same shape as the cosmetic line already committed to in slot 4. |
| H | Names the existing system that could not do the job | **Ascendance.** See §4.5. |

### 4.5 Rule 12 — why Ascendance could not do this

Ascendance is already an uncapped, compounding, permanent Yield multiplier. The
honest question is why the product needs a second one. Four reasons, each of which
Ascendance cannot fix by tuning:

1. **It is one verb.** The only decision is "breed again." There is no portfolio, no
   allocation, no trade-off — nothing to be *good at* in the metagame.
2. **It is invisible.** Ascendance is a decimal on a card. Nothing on the board, the
   share artifact, or a plush toy shows it. The owner's north star is characters as
   collectibles, and a multiplier cannot be worn.
3. **It has one sink with a binary gate.** You can afford the next generation or you
   cannot. Gear gives DNA seven parallel sinks at seven different price points, which
   is what turns a balance into a decision.
4. **It cannot carry effort.** Ascendance is paid entirely in DNA, and DNA is paid
   by *good runs* — so Ascendance rewards skill, not attendance. There is no lane in
   it for the player who shows up daily and plays adequately. Scales are that lane,
   and they are the mechanism the directive actually asks for.

Gear does not replace Ascendance; it is the wide, visible, effort-fed half of a
progression whose deep, invisible, skill-fed half already shipped.

---

## 5. Abuse and integrity

### 5.1 The vector shift, stated

While Score was the ranked number and Rule 2 held it build-blind, the attack on
SupaSnake's fairness was **build-buying** — and it was closed by construction, since
the fold could not read anything money touched. With effort as a measure, the attack
becomes **manufacturing effort**: bots, alternate accounts, AFK sessions, and
collusion. This is a harder problem than build-buying, and it deserves to be said
plainly rather than assumed away.

### 5.2 The structural answer, which is most of the answer

**The monthly Scale ceiling is the anti-bot system.**

A perfect bot that plays four hundred runs a day, banks every one, and finishes every
lane earns **8.2 Scales a month** — exactly what a diligent human earns. Every
lane's grant is capped per period and idempotent on `(player, lane, period)`, so
volume beyond the cap converts to nothing. There is no marginal return on
automation in the progression spine at all.

This is the weekly-lockout lesson (§0.3) used as a security primitive rather than a
pacing one, and it is worth more than any detector: the cheapest attack surface is
the one nobody bothers to attack.

What remains attackable is **a single run's Yield placing on the seasonal board**,
and that is a much smaller target: it requires a bot that plays snake *well* under
the shipped validator, on the canonical camera, within the food-rate bound — and a
seasonal board with a reviewable top N is a tractable manual surface at any
population this game will have for years.

### 5.3 The enumerated attacks

| # | Attack | Server-side answer | Status |
|---|---|---|---|
| A1 | **Scripted farming** — automate runs to finish every lane forever | Monthly Scale ceiling (§5.2). Volume past the cap converts to zero. | Structural |
| A2 | **AFK runs** — start a run, survive without playing, claim duration | A run with no food has no Yield and completes no objective. `validateGameResult` already clamps claimed duration to server elapsed and bounds food count by `durationSeconds × maxFoodPerSecond × foodsOnBoard`. | **Shipped** (`src/lib/server/gameValidator.ts`) |
| A3 | **Clock manipulation** — inflate claimed duration | Duration is `min(claim, serverElapsed)` with a 10s skew tolerance; `INVALID_DURATION` is FATAL because the food-rate bound derives from it. `CLAIM_EPSILON` / `claimDriftIsAlertable` already emit drift telemetry. | **Shipped** |
| A4 | **Multi-accounting** to pool Scales | Scales are **account-bound, untradeable, ungiftable, and non-transferable** — added to §10.4 by the amendment. Gifting (§10.5) is cosmetic-only and stays that way. An alt farms Scales it can never move. | New rule, zero mechanism |
| A5 | **Clan win-trading** — pair with a friendly clan and alternate victories | Three locks: pairing is deterministic and lazy (§9.4), so the opponent is not chosen; the VICTORY lane is **capped at 70 Scale-hundredths a month** regardless of wins; and the victory grant requires the clan's battle Depth to exceed that account's own trailing-median contribution, so a thrown battle pays nothing. | New, config-only |
| A6 | **Sandbagging the Slipstream** — suppress power to farm the ×2 ramp | Percentile is computed on **owned** power, so unequipping does nothing; the ramp is a rate not a total, so nothing is gained but timing; and suppressing power costs the Yield the Scales buy. Self-correcting. | Design (§3.8) |
| A7 | **UTC boundary double-dip** — play at 23:59 and 00:01 | Every daily lane is idempotent on `(player, lane, utc_day)`, sharing the Daily Take's existing boundary. Two runs either side of midnight are two days, which is correct, not exploitable. | Shipped pattern |
| A8 | **Duplicate settlement / replayed grants** | Grants are one idempotent RPC keyed on `(player, lane, period)`; upgrades take a `request_id`. Settlement idempotency already exists (§8.7 impact receipts). | Shipped pattern |
| A9 | **Mid-run gear swap** to game a condition | Impossible: the loadout and its computed power are stamped into the session at start and settlement recomputes from the stamp, not from current state. | Design (§2.4) |
| A10 | **Client-claimed gear power** | The client never sends gear power. Settlement reads the session stamp. Rule 11. | Design |

### 5.4 The posture — what we will and will not do

Three commitments, each derived from the doctrine rather than invented:

- **We cap, we do not ban.** Doctrine Principle 3: *checks never destroy honest
  value*, and A0: *no ceiling may ever invalidate a legitimate run.* An effort
  pattern is not forgery-proof evidence of anything — the most dedicated human
  player and a bot look similar by design, because that is what "effort is rewarded"
  means. So suspicion **holds a grant for review**, it never denies one, and every
  hold has a named transition out (Principle 7).
- **We measure, and we publish nothing we cannot defend.** Two signals are worth
  collecting from day one: the **Yield ÷ PILOT ratio distribution** per account
  (§4.3 — a farm optimises Yield with an uncharacteristic skill reading), and the
  **coefficient of variation of inter-run intervals** (humans are irregular; cron is
  not). Both are advisory-severity inputs to a review queue. Neither is ever a
  fatal validation code, and neither is ever shown to the player as an accusation.
- **Everything emits telemetry before it decides what the player sees** (Principle
  6). If the only detector is a player report, the subsystem is uninstrumented.

### 5.5 What this design deliberately does not rely on

Deterministic replay is a **Phase 3** item (§11.3) and does not exist yet. This
design must not assume it. What exists today is the run-event record with monotonic
tick ordering, `verifyOfferTrace`, the duration clamp, and the food-rate bound —
which is enough, because §5.2 means integrity is not carrying the progression
system's weight in the first place. When replay ships, it strengthens A1's residual
leaderboard case; nothing here waits on it.

---

### 5.6 What the simulator found that this design cannot fix alone

The anti-bot argument in §5.2 is correct and the model proves it: **the bot's gear
advantage over a diligent human is +0.0%**. But the model also measured the thing the
argument did not look at, and the result is uncomfortable enough to belong here
rather than in a footnote.

| Cohort, month 24 | DNA earned that month | Gear | Ascendance | **Total multiplier** |
|---|---:|---:|---:|---:|
| login-only | 551,259 | ×1.98 | Gen 34 → ×1.85 | **×3.66** |
| perfect bot | 10,498,867 | ×2.19 | Gen 46 → ×2.34 | **×5.13** |
| **Ratio** | **19.0×** | **+10.6%** | **+26.5%** | **+40.3%** |

**Two thirds of the bot's residual advantage is Ascendance, not gear.** The
mechanism is entirely pre-existing: §8.6 lets a player start unlimited lean runs at
×0.25 harvest with no daily cap (correctly — "Energy never gates playing" is a
constitutional promise and A0 forbids a ceiling that invalidates honest play), and
§8.2's Ascendance is uncapped and DNA-fed. Unbounded runs therefore buy unbounded
DNA, which buys generations forever.

**This is not a defect gear introduced — it is a defect gear's amendment
*reveals*.** While Score was the ranked number, an unbounded DNA faucet feeding an
unbounded Yield multiplier had no competitive consequence, because the ladder could
not read it. A1 makes Yield the ranked number and the faucet becomes load-bearing on
the same day.

Three things are true at once and all three should be said:

1. **The ×1.25 breeding curve is already compressing hard.** 19× the DNA buys +26.5%
   of output — the same logarithm doing the same job gear relies on, which is why the
   number is 26% and not 1,900%.
2. **Gear is the well-behaved half.** It is the only progression axis in the product
   with a hard material ceiling and therefore the only one that is structurally
   bot-proof. That is an argument for the design, not against it.
3. **The gap is still real, and it is the owner's to price.** Filed as **D11** in §9.
   The candidate answers, none of which I am authorised to pick: cap the Scale-lane
   equivalent for breeding; make the ranked board read a best-of-N per season so a
   volume advantage cannot place; accept it as the honest price of an uncapped
   Ascendance the Constitution deliberately chose in v1.9 (§15 row 29 already
   records "accepts a wider earned progression spread"); or leave it and rely on
   §5.4's review queue, since a bot playing 400 well-piloted runs a day is a hard AI
   problem before it is an economic one.

**What must not happen is that this stays undiscussed because gear passed its own
test.** The design's own model is what found it.

---

## 6. The monetization boundary

### 6.1 The sentence

> **You can buy how your snake looks. You cannot buy what it is worth.**

### 6.2 Sellable

Everything in the **skin layer**, under §10's existing four SKU archetypes, with no
new archetype and no new commercial surface:

- **Rig skins** — the appearance of a rig in any slot. *Neon Shades* for the VISOR,
  *Obsidian* plating for the PLATE set. Permanent, non-random, fully specified before
  payment, never rotating out (§10.5). Every slot must also carry strong **earned**
  skins beside the bought ones (§10.2 decision 13): no slot is money-exclusive in
  kind.
- **Plate sets as an Atelier line and a Patron Pack theme** — the four plates are a
  natural named set and the natural merch family.
- **Loadout presentation** — Keeper's extra cosmetic loadouts (§10.2) extend to gear
  skin presets. Power is per-account and identical, so a preset saves taps, never
  power.
- **Chronicle and lineage-card presentation of the kit** — Keeper depth of
  presentation, never existence of history.
- **Physical merchandise**, entirely outside the product.

### 6.3 Never sold — the additions to §10.4

Rigs · gear slots · slot unlocks · ranks · rank promotions · levels · level-ups ·
**Scales in any form or amount** · Scale acceleration, conversion, doubling, or
"instant finish" · the Slipstream rate · Standard-Issue rank timing · conditions or
any influence over them · any bundle, pack, or subscription perk containing any of
the above · and any item whose material effect is a gear number.

Also never: **gifting or trading Scales, rigs, ranks, or levels** between accounts,
which is A4's whole defence.

### 6.4 The temptation, named in advance

The single most lucrative SKU this design makes available is a **gear XP boost** — a
€4.99 "×2 Scale progress this month," or a DNA-discount subscription on upgrade
costs. It would sell. It is also, exactly, "selling relief from friction the game
itself created," which §10.1 ground 3 already overturned an entire monetization
document over, and it would end the §3 player contract on the day it shipped.

It is named here so that a future proposal cannot present it as a new idea. It is
forbidden by Rule 3, Rule 4, §10.4 as amended, and §10.6's coercion clause
("manufactured friction sold back as convenience — if a wait exists only because its
removal is sellable, delete the wait"). The wait exists because the years-long grind
*is the product*. That is the only reason a wait is ever allowed to exist here.

### 6.5 The five-year test (§10.7)

*If a player who spent €300 over five years read our full internal reasoning for the
gear system, would they feel it was designed for them or against them?* They would
read that their money bought them the look of a kit they earned entirely themselves,
that a free player standing beside them has exactly their multiplier, and that the
document said so before the first rig shipped.

---

## 7. Schema sketch

Forward-only, server-authoritative, no migration files written by this work.
Deliberately built on the substrates that exist (doctrine FM-1: one authority per
fact).

### 7.1 Tables

```sql
-- The catalog. Mirrors cosmetic_definitions (022) in shape and governance.
gear_definitions (
  id                  UUID PK,
  gear_key            TEXT UNIQUE NOT NULL,   -- 'visor_mk1'
  slot                TEXT NOT NULL,          -- CHECK against the 7-slot list
  display_name        TEXT NOT NULL,
  condition_key       TEXT NOT NULL,          -- CHECK against the <=12 condition list
  rank_bonus_bps      INTEGER[] NOT NULL,     -- per-rank base, 6 entries
  level_bonus_bps     INTEGER NOT NULL,       -- 20 bps = 0.20 pp per level
  max_rank            SMALLINT NOT NULL DEFAULT 6,
  acquisition_kind    TEXT NOT NULL,          -- milestone | dna_shelf | season | ladder
  dna_price           INTEGER,                -- NULL unless dna_shelf
  content_version     TEXT NOT NULL,
  active              BOOLEAN NOT NULL DEFAULT TRUE
)
-- NOTE: no price_eur, no stripe_price_id column. The absence is the enforcement:
-- a rig has no representation for a euro price. Skins live in cosmetic_definitions,
-- which has both.

-- Ownership and state. One row per owned rig, never deleted (Rule 6).
player_gear (
  player_id  UUID NOT NULL REFERENCES players,
  gear_id    UUID NOT NULL REFERENCES gear_definitions,
  rank       SMALLINT NOT NULL DEFAULT 1 CHECK (rank BETWEEN 1 AND 6),
  level      SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 60),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, gear_id),
  CHECK (level <= rank * 10)              -- the interlock, declared not assumed
)

-- The equipped set. Mirrors player_loadout (022/069): one row per slot.
player_gear_loadout (
  player_id   UUID NOT NULL,
  slot        TEXT NOT NULL,
  gear_id     UUID NOT NULL,
  equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, slot),
  FOREIGN KEY (player_id, gear_id) REFERENCES player_gear
)

-- Slot unlocks. Server-authored, monotonic, never written downward.
player_gear_slots (
  player_id UUID NOT NULL,
  slot      TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, slot)
)

-- Lane grants. The idempotency key IS the anti-abuse mechanism (A7, A8).
gear_scale_grants (
  player_id   UUID NOT NULL,
  lane_key    TEXT NOT NULL,   -- signal | take | hunt | victory | ascension | ladder
  period_key  TEXT NOT NULL,   -- '2026-08-08' | 'cycle-142' | '2026-08' | 'rung-5:CYBER'
  centiscales INTEGER NOT NULL CHECK (centiscales > 0),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, lane_key, period_key)
)

-- The Slipstream rate. A stored server fact, recomputed daily, never client-derived.
player_gear_catchup (
  player_id       UUID PRIMARY KEY,
  rate_bps        INTEGER NOT NULL DEFAULT 10000,  -- 20000 = x2
  owned_power_bps INTEGER NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL
)
```

**No new ledger.** The Scale balance lives on `players` beside `dna`, in
**centiscales** (integer), and every movement writes the existing transaction ledger
with `currency = 'scale'` and reasons `gear_rank_promotion` / `lane_grant`. Migration
009 established that the ledger already carries a currency-type column; adding a
second one would be FM-1, the failure this project has paid for three times.

### 7.2 Run stamping

The session row gains, alongside the existing Ascendance freeze:

```
gear_power_bps        INTEGER NOT NULL DEFAULT 0    -- 11900 = +119.00 pp
gear_loadout_snapshot JSONB   NOT NULL DEFAULT '[]' -- [{slot, gear_key, rank, level, condition}]
gear_content_version  TEXT    NOT NULL
```

The snapshot exists so settlement can evaluate **conditions** without re-reading
live state, and so a run remains explicable years later. `gear_power_bps` is the
unconditional part; conditional parts resolve at settlement from run facts. Both are
bounded payloads under migration 066's settlement payload bounds — the snapshot is at
most 7 entries by construction.

### 7.3 RPCs

| RPC | Contract |
|---|---|
| `read_gear_state(player_id)` | The one authority for "what does this player own, what is equipped, what is the Scale balance, what is the catch-up rate." Single round trip, like `read_snake_loadout` (069). |
| `equip_gear(player_id, slot, gear_id)` | Atomic per-slot write, migration 064's ordered-write pattern. Rejects an unopened slot and unowned gear. |
| `upgrade_gear_level(player_id, gear_id, target_level, request_id)` | Buys levels 1..n in one transaction; recomputes the exact price server-side (never a client quote); checks the rank ceiling; debits DNA; writes the ledger. Idempotent on `request_id`. |
| `promote_gear_rank(player_id, gear_id, request_id)` | Debits centiscales, increments rank, writes the ledger, records the provenance mark. Idempotent. |
| `grant_gear_scales(player_id, lane_key, period_key, base_centiscales)` | Applies the catch-up rate, inserts `ON CONFLICT DO NOTHING`. The conflict clause is the whole abuse defence. Called by the settlement path and the hourly cron, never by the client. |
| `recompute_gear_catchup()` | Daily cron. Percentiles over accounts with a valid run in 28 days. |
| `standard_issue_rank(rank, season)` | Quarterly. Raises every owned rig below `rank` to `rank`. Monotonic, idempotent, never writes downward. |

### 7.4 Parity discipline

The seven-slot list and the ≤12-condition list are each written in SQL CHECK
constraints, an RPC guard, and a TypeScript constant. Migration 069 established the
answer: **one authored list in `src/shared/game/gearSlots.ts`, and a migration parity
test that reads the SQL text and fails the build on drift.** Reuse it verbatim.

---

## 8. Work-package decomposition

Ordered, gated, each sized. Nothing here is authorised to start: the package opens
only after the owner ratifies §9's decisions and the amendment.

| WP | Name | Depends on | Size | Gate to proceed |
|---|---|---|---|---|
| **G-0** | **Amendment ratification.** Owner rules §9's D1–D9 line by line; the amendment draft folds into the Constitution as v1.17; §15 records the overturns. | — | Owner | No code begins before this. The precedent is `PLAYER_EVOLUTION_ONBOARDING.md` §13. |
| **G-1** | **Catalog + ownership migration.** `gear_definitions`, `player_gear`, `player_gear_slots`, `player_gear_loadout`, the centiscale balance column, the seven-slot and condition vocabularies with the 069 parity test. Seven starter rigs seeded. No UI. | G-0 | M | Migration replays clean on an isolated local stack; parity test green; app degrades to "no gear" when the RPCs are absent (069's deploy-first contract). |
| **G-2** | **Yield fold integration.** Gear power computed server-side, stamped into the session at start, read by settlement, composed multiplicatively with Ascendance. Conditions evaluated at settlement. Results shows the two multipliers separately. | G-1 | M | An in-flight run's value cannot change across a deploy; a 0-gear account settles bit-identically to today; the §3.5 ceiling law asserted as a test. |
| **G-3** | **Lab equip + upgrade UI.** The Kit screen: seven slots, own/equip, the DNA level purchase, the rank ceiling shown, the exact multiplier stated. Run Setup gains one preset line and zero taps. | G-2 | M | ≤3-tap law verified by e2e; the multiplier stated in Lab, Run Setup, and Results agrees to the basis point. |
| **G-4** | **Effort lanes + Scale grants.** `grant_gear_scales`, the six lane hooks on existing surfaces, the idempotency keys, the cron. No new screen. | G-2 | M | Every lane idempotent under replay; a 400-run day earns the cap and not one centiscale more; Rule 5 audit — 30-day absence loses nothing owned. |
| **G-5** | **Rank promotion.** `promote_gear_rank`, the provenance mark, the Scale spend ledger. | G-4 | S | Ledger balances; promotion is idempotent; no row written downward. |
| **G-6** | **Slipstream + Standard Issue.** `recompute_gear_catchup`, `standard_issue_rank`, the honest Lab framing. | G-5 | S | Sandbag simulation shows no advantage; Standard Issue is monotonic and idempotent; veteran provenance marks survive. |
| **G-7** | **Leaderboard cutover.** Ranked board reads Yield, seasonal epoch; PILOT demoted to private; `verify:constitution` repointed to the integrity instrument; Ascension re-anchored; Results headline moved. | G-2, G-0 | **L** | Old Score records preserved in the Chronicle (Rule 6); no public surface shows two ranked numbers at once during cutover; conflation telemetry (§17.1) instrumented before, not after. |
| **G-8** | **Skins.** Rig skins on the 069 substrate; earned skins ship before any bought skin exists. | G-3 | M | Every slot has a strong earned entry before the Atelier lists one. |
| **G-9** | **Integrity telemetry.** Yield÷PILOT distribution, inter-run interval CV, the review queue with a named exit. | G-4, G-7 | M | Advisory severity only; no fatal code added; every hold has a transition out (Principle 7). |

**Critical path:** G-0 → G-1 → G-2 → G-4 → G-5. G-7 is the largest and riskiest and
is deliberately *not* on the critical path — gear can ship and be enjoyed for months
while Score is still the ranked number, and cutting over later means cutting over
with live gear data rather than with this document's estimates. **That is the
recommended sequencing** and it is the answer to the riskiest thing in this
proposal.

---

## 9. Open decisions for the owner

Every number in §3 is [H] in the Constitution's sense — reasoning, not observation,
against a production dataset of fifteen real players. These are the calls that are
not mine to make.

**D1 · The name.** "Cores" is the placeholder. Candidates, in the ratified kid-clear
+ cool register (GOLD / PULSE / COILS / WARP / RISK):

| Candidate | For | Against |
|---|---|---|
| **SCALES** *(recommended)* | A thing a snake actually has. Armour material — the plate lane's own substance. Physically collectible, so it is merch-shaped. Already a colour token (`scale-blue`). Kid-clear with zero explanation. | Mildly overloaded in English ("scales" as in weighing, as in scaling). |
| **SPARK** | Register-perfect beside PULSE and WARP. One syllable, energetic, "one Spark a week" reads well. | Not snake-native; generic across the genre. |
| **FANG** | Snake-native, cool, unmistakably a *thing*, excellent merch shape. | Reads as a weapon, not a material; may imply combat the game does not have. |
| **COIL** | Snake-native and already ratified vocabulary. | **Already in use** for another meaning — reusing it would be a collision, not a reuse. |
| **SEED** | Perfect for a genetics game; pairs with DNA, lineage, breeding. | **Direct engineering collision** with RNG seeds and Signal seeds throughout the codebase. Flagged, not recommended. |

**D2 · The cadence, and whether 1.94× is the right grinder upside.** §3.6 gives
4.20/month floor and 8.15/month full. **§3.11's sensitivity run inverted my prior
here and the owner should read it before choosing:** a steeper dial produces a
*smaller* long-run gap, because the terminal 175-Scale ceiling — not the dial —
bounds the spread. At 3× the year-one gap is +14.5% and the year-two gap is
**+4.3%**; at 1.5× the gap is still widening at year two. The dial chooses *when*
the grinder cashes out, not how far ahead they finish. **Recommendation: 1.94× or
3×. Not 1.5×**, which is the only setting that is still diverging at 24 months.

**D3 · Does the build-independent fold survive as PILOT?** §4.3 recommends keeping
it as a private integrity instrument. The alternative is a clean deletion: retire
both folds, the three per-dynasty score curves, `verify:constitution`, and §17.30's
integral tolerance. That is a genuinely large subtraction and Rule 12 says default to
subtraction. **My recommendation is keep** — it is the only mechanical fairness proof
the product owns and it becomes the primary anti-farm signal — but the owner should
rule, because the maintenance argument on the other side is real.

**D4 · The gear ceiling: is ×2.19 right?** §3.5 sets it below the ×2.47 a pilot gains
by doubling a run, and proposes that relationship as a permanent law. §3.11 prices
all three options in the unit that matters — **how many extra foods an ungeared pilot
must eat to erase a maxed kit**: 14 at ×1.80, 20 at ×2.19, 27 at ×2.60. At ×2.60 the
kit exceeds the skill lever and the per-run board becomes, honestly described, a gear
board with a skill tiebreak. I recommend ×2.19 and would not cross ×2.60 — but the
directive can be read as wanting exactly that crossing, and the call is the owner's.

**D5 · The seasonal epoch.** §4.2 resolves the long-outstanding leaderboard-epoch
question by making the ranked Yield board quarterly. Confirm — this also decides
whether existing all-time Score records become Chronicle entries (recommended) or
are preserved as a separate historical board (not recommended: two ranked surfaces).

**D6 · Standard Issue's quarterly cadence.** §3.9 rises one rank every four seasons.
Faster helps newcomers and stings veterans more; slower does the reverse. This is the
decision with the loudest social consequence in the document.

**D7 · Slot count and opening gates.** Seven slots (3 head, 4 plates), opening at
1/4/12/20/40 banked runs and M3. The plate art lane is being designed in parallel and
may argue for a different count.

**D8 · Account-level loadout, or per-dynasty?** §2.4 argues account-level for
simplicity and for not punishing breeding. Per-dynasty loadouts would let CYBER and
PRIMAL kits diverge — more depth, more taps, more Lab surface, and a new
combinatorial balance problem. Recommended: account-level now, revisit on telemetry.

**D9 · The condition catalog.** §2.5 bounds it at ≤12 and lists five. The remaining
seven, and whether conditions should exist at all in v1 rather than shipping flat
multipliers first, is an owner call about how much decision surface the Lab should
carry on day one.

**D10 · Sequencing.** §8 recommends shipping gear *before* the Score cutover (G-7 off
the critical path), so the leaderboard change is made against live gear data instead
of against this document's estimates. Confirm, or rule that the two must ship
together.

**D11 · The uncapped DNA faucet meeting uncapped Ascendance — the one the simulator
found.** §5.6 in full. Gear is bot-proof (+0.0%); Ascendance is not (+26.5% for 19×
the DNA), and A1's Yield ranking is what makes that competitively load-bearing for
the first time. This is the only open decision in this document that is **not about
gear** and it is the one I would put first, because it is a consequence of the
amendment rather than of the system. Candidate answers, in my order of preference:

1. **Rank the seasonal board on a best-of-N per player per season** (the pattern
   Depth and Ascension already use — best-five, best-ten). Volume then cannot place,
   only quality can, and no cap is added to anything a player owns. Cheapest, most
   constitutional, no new rule.
2. **Accept it, on the record.** §15 row 29 already says v1.9 "accepts a wider earned
   progression spread"; this is that decision's bill arriving. Requires no change and
   one honest sentence in §6.2.
3. **Cap Ascendance's contribution to the *ranked* number only**, leaving Depth and
   personal history uncapped. Preserves the pillar, bounds the ladder — but adds a
   second definition of Yield, which is a dual-source-of-truth smell (FM-1).
4. **Cap lean-run harvest per day.** Rejected in my view: it collides with "Energy
   never gates playing" (§8.6) and with A0. Listed only so the option is visibly
   considered and visibly declined.

---

*Written 8 August 2026 against Constitution v1.16. Every number marked in §3 is a
hypothesis with a named test in the amendment draft's §17 additions. Where this
document is wrong, it should be amended honestly: name the rule, pay the cost,
record the overturn.*
