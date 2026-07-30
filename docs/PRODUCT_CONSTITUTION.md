# The SupaSnake Product Constitution

**Version:** 1.5 · amended 29 July 2026
**v1.5 amendment (explicit owner ruling, 29 July 2026):** **Energy Commitment**
replaces the fixed daily envelope (§8.6). Energy is stored to a cap of **6 [H]**,
recovers on authoritative server time at **1/hour [H]** including offline partial
progress, and may be committed **1–6** to one ordinary run. The full commitment is
consumed at start and never refunded for a crash, abandonment, poor result, revive,
or reconnect. Credited run DNA receives the configurable nonlinear curve
**×1 / ×2.2 / ×3.6 / ×5.2 / ×7.2 / ×10 [H]**; Score, full-strength Yield, Mastery,
fixed rewards, unlocks, and clan score do not. Zero-Energy lean runs remain playable
at ×0.25 harvest. Higher commitment changes stakes, never physics or hidden
difficulty. The previous prohibition on timed/offline Energy recovery is expressly
overturned.

The World Serpent becomes an **automatic Clan Energy Battle layered over normal
play** (§7.3, §9): 3 days active + 1 day intermission [H], positive-Energy runs
assigned immutably at start, and each member's five strongest valid Yields summed
into clan Depth. There is no battle queue, second Energy pool, special physics, or
progression lock. Only the viewer's own five and replacement threshold are exposed;
teammates remain aggregate-only. Energy multiplies personal harvest, never the clan
contribution, so a brilliant 1-Energy run can beat a cautious 6-Energy run. Both
sides earn permanent non-power participation history; victory earns the stronger
honor, never DNA or future scoring power. This owner order amends Rules 8–10 and the
§12.2 rhythm/mode caps where the retired separate Serpent mode previously bound.
The required cooling period is waived by the owner order for this greenlit
implementation; the cost is recorded in §15.
**v1.4 D3 playtest finding (owner, 29 July 2026):** PRIMAL's central spatial
loop is **“Coil safely. Get tempted. Break formation. Recover—or die.”** Fast
body growth makes a tight wall-following coil the player's constructed safety;
exit portals and timed gene opportunities tempt them to spend that structure by
leaving it, then ask whether they can recover. Placement fairness means a target
is physically valid, reachable, and legible — never that it is nearby, cheap, or
safe to pursue. CYBER's terminal tempo is **×1.67** (120 ms), reached through a
0.02 per-food decay; this keeps its acceleration identity without making ×2
reaction load the deciding mechanic. See §5 and §17.32.
**v1.4 D2 amendment (owner ruling, 29 July 2026):** touch play is
**flick-only**; the inferior D-pad and its stored preference are retired. A flick
may queue at most **two unresolved directions** — enough to express an L-turn,
without admitting the accidental third direction observed during tight, fast
coiling. Keyboard keeps its three-turn buffer. Ascendance's economic effect must
be inspectable: the Snake Lab and Run Setup state the equipped snake's exact
Yield multiplier beside its generation, and Results reports the server-settled
base Yield, generation multiplier, and added Yield. The main Snake Lab presents
only the highest owned generation of each variant as active; equal-generation
top builds remain distinct choices, while lower generations remain immutable
pedigree/history and valid breeding records rather than playable roster clutter.
A highest active bred generation may be voluntarily unwound one leaf at a time:
the exact DNA on that breeding receipt returns in full, the next-highest build
becomes active, and an immutable snapshot preserves the refunded pedigree. This
is an owner-directed exchange of earned value, not system confiscation under
Rule 6; active descendants and open runs block it.
**v1.4 D1 amendment (owner ruling, 29 July 2026):** normal CYBER and COSMIC
runs grow **+1 per food throughout**; their pressure remains speed and spatial
restriction, respectively. PRIMAL owns the body-pressure profile: **+4 while
modelled length is below 75, +3 below 96, +2 below 120, then +1**. Gene offers
are a separate clock at **6 ± 2 foods (4–8)**, doubled by Patient. Growth is
event information, not permanent telemetry: announce it non-interactively at
run opening and whenever it changes; CYBER speed changes use the same grammar.
The Growth Lab selector and its rollout flag no longer govern new runs.
**v1.4 changelog (owner rulings, 27 July 2026 — the Redesign Wave):**
**Rule 15, monotonic length** (§4) — *length only ever increases; free space only
ever shrinks; anything that costs the player costs growth.* The wave's founding
finding is that Snake's difficulty curve is its own body (free space is `n² − L`),
that this is a structural gift no comparable roguelite has, and that the shipped
catalog spent it: across 144 production runs the median reached **8%** board
occupancy and the best run ever recorded reached **~43%** — the board has never
been filled, so the native curve has never engaged. The corollary the owner
derived, which generalises: *once length is the difficulty clock, removing length
is a reward, so any effect priced in "segments removed" is a bonus paid for with a
bonus.* **INFUSE therefore inverts to +8 [H] segments**; `shed`, `splice_regenesis`
and `splice_molted_rebirth` are killed (§13); revives grant survival, never
shrinkage. **Per-dynasty Score curves** (§6.1) — *shapes* with comparable
integrals, Rule 2's mechanism untouched. **The difficulty ladder** (§8.6a) — fixed,
ordered, cumulative; unlock globally, record per-dynasty. **Clan surfaces show
totals, not per-member attempt counts** (§7.3). Evidence and full derivation:
`docs/game/GAMEPLAY_PROPOSAL.md`; implementation: `docs/ops/REDESIGN_WAVE.md`.
**Rule 15's seven-day cooling period was waived by the owner on 27 July 2026**;
the waiver and its reasoning are recorded in §15, row 18. Rule 15 is in force.
**v1.3 changelog (owner ruling; superseded by v1.5):** **Energy, redefined** (§8.6) — the daily-economy
grammar returns without the paywall: 6 charges/day make runs rich, lean runs floor at
25%, rituals (Signal objective, Serpent attempts) always full, nothing sold, nothing
gated, no timers. The post-energy pacing question (§17.2) is closed by mechanism, its
numbers demoted to tuning dials.
**v1.2 changelog (owner rulings):** the Run Setup page (§5 — mandatory, preset,
one-tap START); Ascendance — generations uncapped into a per-snake Yield curve
(§8.2); the Daily Take with a forgiving streak (§7.2, Rule 5 rewritten from "never
punished" to "never destructive"); positioning shifted from "anti-obligation" to
"fair pull" (§11.1); Rule 13 reframed from solo-forever to capacity-honest. Score
remains build-independent (Rule 2) — the endless-upgrade payoff routes through
Yield/Depth, not the ladder.
**Status:** The single design authority for SupaSnake. Implementation specs, the launch
plan, the roadmap, and every future feature decision are derived from this document and
checked against it.
**v1.1 changelog:** Amendment Package A1 (A1–A8, `docs/CONSTITUTION_AMENDMENTS_PROPOSED.md`)
ratified by owner direction on 25 July 2026 and folded in: Ascension Leagues (§6.1),
Patron Packs (§10.2), commercial tempo and gifting (§10.5), The Company (§10.8),
the spectacle layer and the Acquisition Engine (§11), the World Report (§7.5),
rivalry memory (§9.4). The trust core — Rules 1–8, 11–14 — is unchanged.
**Sources:** `docs/GROUND_TRUTH.md` (verified state of the game, 25 July 2026),
the Game Director's audit and its digest, audit §12 (monetization), and the owner's
stated design philosophy. Facts cited as (GT §n) are code-verified there.
**Supersedes:** `docs/game/MONETIZATION_DESIGN.md` v1.0 (overturned in §15), and every
design intention not restated here.

**How to amend:** changes to the Inviolable Rules (§4) or the Caps (§12.2) require a
written proposal naming the rule, the reason, and what is being given up; a seven-day
cooling period; and the owner's recorded sign-off appended to the Overturn Record (§15).
Everything else amends by normal revision with a changelog entry.

**Numbers are hypotheses.** Every price, threshold, cap-size, and rate in this document
marked [H] is reasoning, not observation — the production dataset is 15 real players.
Each [H] has a named test in §17. The *structures* are law; the [H] numbers inside them
are starting values.

---

## 1. Identity

**One sentence.** SupaSnake is a three-minute precision snake game — instant in any
browser, on any phone — where greed is a decision: bank your run, push your luck, or
feed your build — and everything you keep compounds into a mastery record, a bred
lineage, and a small clan battle that notices when you get better.

**Platform.** Browser-first is the strategy, not the identity: SupaSnake is a snake
game for browser *and* mobile — today one responsive instant-play web game (touch is
a first-class control scheme, §5; PWA install in Phase 2), with **native apps as a
deliberate post-release phase** (§14, Phase 5). The §10 rules are platform-invariant:
no store's economics ever reintroduce what §10.4 forbids.

**One paragraph.** The core of SupaSnake is a precision run that ends, when it ends
well, with a chosen gamble: a portal appears and the player banks, passes, or pays body
length for power. Three dynasties — CYBER, PRIMAL, COSMIC — are genuinely different
rulesets, not palette swaps. Around that run sit exactly three things a player builds
over years: **Mastery** (proof of skill, per dynasty), **Lineage** (a bred snake that
is theirs), and **Discovery** (knowledge of how the genome plays). Two numbers make
the building legible: **Score**, which measures the pilot and never reads the build,
and **Depth**, which measures the whole dynasty in recurring World Serpent clan
battles, witnessed by a clan small enough that every member is load-bearing.

**What SupaSnake refuses to be:**

- **A casino.** No loot boxes, no gacha, no paid randomness, no odds — directly or
  through any intermediate currency. Ever.
- **A mall.** Commerce lives in one district the player walks to. It never knocks.

The existing mission line — *Where Skill Creates Legacy* — is correct and stays.

---

## 2. The architecture in one view

```
                        THE RUN  (protected core, §5)
                   navigate · eat · read space · extract
                          │                │
                     SCORE (§6.1)     YIELD → DEPTH (§6.2)
                   the skill number   the investment number
                   measures the       measures the dynasty:
                   pilot; build-      build, lineage, mastery,
                   independent        knowledge — all cash out here
                          │                │
              ┌───────────┴────┬───────────┴──────────┐
           MASTERY         DISCOVERY               LINEAGE
        (per-dynasty     (genome knowledge      (the bred snake
         skill proof)     you can use)           that is yours)
              └────────────────┼──────────────────────┘
                        THE CLAN WITNESSES (§9)
              1–12 people; everyone load-bearing; no grading
                               │
     daily: WORLD SIGNAL (§7.2) · recurring: WORLD SERPENT BATTLE (§7.3)
   monthly: ASCENSION (§6.1) · quarterly: SEASON THEME (§7.4)
```

**Three pillars. Two numbers. Two play rhythms on a four-beat calendar. One witness.** Every system that survives
this document serves one of those; every system that serves none of them is on the
kill list (§13). This schema is the test a 2029 feature proposal is checked against.

---

## 3. The player's contract

Published in-product, on the purchase surface, and in marketing. Both sides of it.

**Paying players get:** appearance, continuity, and recognition — nothing that changes
a number the game computes.

**The test:** a free player and a paying player run the same board under the same
rules for the same rewards and appear on the same leaderboards under the same
conditions. They look different. If a proposed perk fails that sentence, it is not a
perk; it is a fee.

---

## 4. The Inviolable Rules

Fourteen laws. Each carries the question a reviewer asks to check compliance. These
replace the deleted constraint lattice; amending any of them follows the procedure in
the preamble.

1. **Nothing interrupts a live run except the run's own decisions** — gene offers,
   portal choices, surge choices, tactical hold, destructive-abandon confirmation, and
   legally required consent. *Reviewer: does anything else render, fire, or sound
   between first input and run end?*

2. **Score measures the pilot.** The leaderboard score formula never reads genes,
   traits, anomalies, account state, or anything money could ever have touched
   (GT §2.2). *Reviewer: does the score fold read anything but the run's food events
   and the dynasty ruleset?*

3. **Depth measures the dynasty, and no euro can move it.** Money touches no computed
   number: not Score, not Yield, not Depth, not DNA, not XP, not odds, not timers.
   *Reviewer: trace any purchase to any numeric output; the trace must terminate in
   appearance or continuity.*

4. **SupaSnake sells identity and continuity only.** Everything sold is permanent,
   non-random, fully known before payment, and is never gameplay, currency, progress,
   time, information, or odds. Nothing sold is consumable. *Reviewer: is the SKU
   permanent, cosmetic-or-continuity, and completely specified pre-payment?*

5. **Absence is never destructive.** The daily pull is real — the Take, its streak,
   the league, the hunt — but a missed day costs only that day's opportunities and
   one streak tier (never a reset to zero), and nothing owned — records, cosmetics,
   tracks, lineage, history — ever decays, expires, or is confiscated. No backlog,
   no debt. *Reviewer: diff a 30-day absence against daily play — beyond missed
   opportunities and a cooled streak, is anything owned lost?*

6. **Everything earned is permanent.** Records, cosmetics, tracks, tenure, lineage,
   history — no code path may reduce, expire, or confiscate them. *Reviewer: does any
   path write a player-owned row downward?* A voluntary one-step lineage refund is
   the narrow exchange case: it returns the exact recorded DNA input in full and
   preserves the breeding event as immutable pedigree history. It may never be
   triggered by absence, loss, expiry, balance pressure, or another player. A
   player-directed spend is not confiscation: DNA deliberately spent on a purchase
   and Energy deliberately committed to start a run may move downward only through
   their named authoritative transaction, with the amount and consequence shown
   before confirmation.

7. **Commerce stays in its district.** The store is reached by navigation, never by
   interruption. Zero commercial surfaces during runs and on Results. At most one
   commercial surface per screen elsewhere, never the primary action. No notification,
   email, or badge is ever commercial. *Reviewer: count the commercial surfaces on
   every screen; check the notification feed.*

8. **Clans create responsibility, never payroll.** The player may see their own five
   contributing results and the personal score needed to replace their fifth; other
   members' attempts, absences, thresholds, and ranks stay private. Clan outcomes
   grant the same bounded non-power honor to every eligible participant on a side,
   with a stronger victory honor; there are no intra-clan reward tiers, minimums,
   officer levers keyed to output, DNA rewards, or purchasable clan numbers.
   *Reviewer: can a member inspect or economically punish another member's output?
   Can money change any clan number? Is the fifth-best threshold clearly the viewer's
   private replacement line rather than a participation demand?*

9. **Three pillars, two numbers, one calendar.** New work lands inside Mastery, Lineage,
   or Discovery; surfaces on Score or Depth; and schedules on the Signal (including its
   monthly Ascension cycle), the Serpent battle cycle, or the season. A proposal that fits none of
   these is rejected or triggers a formal amendment. *Reviewer: name the pillar, the
   number, and the beat.*

10. **The Caps are law** (§12.2): one currency, zero premium currencies, one daily and
    one recurring clan surface, ≤16 active genes, three dynasties, four SKU archetypes, three
    Results layers, ≤3 taps from open to board through the Run Setup page. *Reviewer:
    does the proposal increment any capped count?*

11. **Server authority is absolute.** All economy and progress mutations go through
    API routes and RPCs; the client never writes balances; every settlement is an
    exact server recompute; every Supabase error is checked and reported (GT §2.8).
    *Reviewer: existing project rule; audit the mutation path.*

12. **Additions pass the dilution test** (§12.3) **and default to subtraction.** Every
    proposal names the existing system that could not do the job. *Reviewer: which
    existing system was tried first, and why did it fail?*

13. **Operating cost is stated at current capacity.** Every proposal ships with its
    permanent operating cost — content cadence, balance surface, moderation exposure,
    support burden — priced against today's headcount, which §10.8's milestone bands
    grow deliberately: the solo constraint is a phase, not the identity. *Reviewer:
    what does this cost per month, forever, and who pays it at current staffing?*

14. **If it matters, it has a URL.** Every meaningful artifact — a run, a snake, a
    clan, a Signal day, a Serpent week, a profile — is linkable, and the link carries
    an image and a way in. *Reviewer: where is the URL, and what does a stranger see
    when they open it?*

15. **Length only ever increases; free space only ever shrinks.** Nothing shortens
    the snake. Anything that costs the player costs **growth**. No gene, tier,
    splice, trait, revive, purchase, or content of any kind may rewind board
    pressure. *Reviewer: does this effect ever reduce length or increase free
    space? If it prices itself in "segments removed," it is pricing a reward with a
    reward — reject it.*

    *Why this is a rule and not a balance note:* the board is the difficulty clock
    (free space is `n² − L`, falling hyperbolically on a fixed tick), and it is the
    only escalation SupaSnake gets for free — every comparable roguelite bolts one
    on (Hades' Pact, Slay the Spire's Ascension, Vampire Survivors' Curse, Risk of
    Rain's time coefficient, Dead Cells' Malaise). A length-reducing effect does not
    merely help the player; it turns the clock backwards, and it simultaneously
    de-prices INFUSE — the one mechanic denominated in body — because a currency
    that can be safely discarded is not a cost. One mechanic breaking two systems is
    a constitutional problem, not a tuning problem.

---

## 5. The core run — what is protected, and why

The run is the reason everything else exists. It is the best-built part of the product
(GT §2, §12) and the part a future contributor is most likely to erode by accident,
one small convenience at a time. Protected, permanently:

- **Input semantics:** buffered turns, reversal rejection, deliberate first movement,
  tactical hold with the board fully visible.
- **The Run Setup page** (owner ruling, 25 July 2026): Launch opens one consolidated
  setup surface — dynasty and snake, mode context, and aim system — with
  the primary START action always pre-configured from the player's last choices.
  First-time players see it fully preset: START is the only emphasized action, zero
  required configuration. Everything adjustable, nothing demanded. The law: open →
  LAUNCH → START → board, **≤3 taps**, and the setup page adds exactly one of them.
  From Results, REPLAY re-enters the run with the same configuration instantly
  (skipping setup); SETUP reopens the page. Energy Commitment is part of this
  setup surface: default 1, current stock/recovery/next tick and multiplier visible,
  no required adjustment, and a deliberate two-step selection before all six can be
  exposed. REPLAY never silently repeats a multi-Energy commitment: it uses 1 Energy
  when available, otherwise lean.
- **The in-run presentation as shipped** (owner ruling, 25 July 2026; touch amended
  by D2): the board, cockpit HUD, keyboard/flick controls, and decision overlays are
  declared correct as built. They change only where a surrounding-system change forces
  it — an energy
  indicator disappears with Energy, a killed system stops reporting, the mode toggle
  becomes the four entry cards — never as redesign for its own sake. The one screen
  that changes substantially is Results (below), and that is a post-run surface, not
  the game.
- **The portal trichotomy.** BANK / PASS / INFUSE is the game's signature. It is made
  with the simulation frozen and the board visible, centered over the play space. It
  is never demoted to a notification, a corner widget, or a timed choice. Consequence
  *preview* (what BANK pays, what INFUSE costs) may be improved; the decision's weight
  may not be reduced.
- **Gene offers are gameplay, not administration.** They interrupt because the player
  is still playing. Focused, centered, simulation frozen.
- **Three rulesets that stay genuinely different.** PRIMAL's compounding greed,
  CYBER's accelerating tempo, COSMIC's spatial routing (GT §2.1). Balance within a
  dynasty is tunable; homogenizing across dynasties is not. No fourth dynasty without
  a constitutional amendment (§12.2).
- **PRIMAL's constructed-safety loop** (owner playtest, 29 July 2026). Tight
  wall-following coils are not an exploit to disrupt; they are the safe formation the
  player earns through spatial precision. Portals and timed gene opportunities must
  remain attractive enough to pull them away from it, and may be expensive or dangerous
  to route through. The fairness floor is narrower: never overlap occupied terrain or
  another objective, never place in a permanently sealed region, and leave enough free
  region for a viable continuation. It does **not** guarantee a short path, preserve the
  coil, or promise recovery. The mastery is evaluating the detour, keeping a return lane,
  and rebuilding formation after taking it.
- **Build-independent Score** (Rule 2).
- **Server settlement** — exact recompute, bounded-trust clamps, idempotency (GT §2.8).
  This is stronger than the product looks; it never gets weaker.
- **≤3 taps from opening the site to a live board** (through Run Setup), and ≤2 from
  Results to the next run via REPLAY. The FTUE v2 spirit — nothing between the player
  and playing but their own choices — made law with the setup page inside it.
- **The Training Lab's rewardless contract.** Deliberate practice that refuses to
  become a currency farm. It stays rewardless.

**The Results screen is constitutionally three layers** (currently up to 14 sections,
6 toasts, and 3 notifications — GT §6.3, the single worst surface in the product):
Layer 1, outcome — what happened, personal-best status, and the share artifact.
Layer 2, the two numbers — Score, and Yield with its Depth contribution during an
active Serpent battle. Layer 3, one collapsed progression digest, with exactly **one** recommended
next action. Everything else routes to the Chronicle. No commerce (Rule 7). The share
prompt is Layer 1, because the share artifact is product, not marketing (§11.3).

---

## 6. The two numbers

The game's deepest structural gap was that nowhere did a player's accumulated
investment become one number that visibly rises over weeks. The resolution is not to
compromise the skill leaderboard — it is two numbers with two jobs, deliberately
impossible to confuse. Clash Royale ships this split (Trophy Road beside the ranked
ladder); it works but is essentially untheorized in public design writing, so §17.1
tests the one real risk: conflation.

### 6.1 Score — the skill number

Per-run. Build-independent (Rule 2). Ranked on leaderboards whose eligibility is
finally credible: run ended, validation passed, one best entry per player, compatible
content version (fixes GT §9.3). Aim systems are universal settings available to
everyone from the first run (§15, overturn 10), so information parity holds and no
assist annotation is needed. Generation-based "skill brackets" are deleted — bracketing
returns only if population ever justifies score-percentile brackets, and never by
anything purchasable. Default leaderboard view is you-centered — your position ±5 and
the top 3 — because a global top-100 is an insult at small population and wallpaper at
large (§17 [H]).

**Score answers: how well do I fly?**

**Per-dynasty curves (v1.4).** `scoreMultiplier(n)` is a per-ruleset function of
food count, so it is the one place asymmetry is *already* legal under Rule 2 —
and the shipped curves are the reason the ladder does not currently measure what
it claims. PRIMAL and COSMIC both ship `() => 1` while CYBER carries a ×3 curve
*and* eats four times faster at its floor, so Score per minute differs by roughly
an order of magnitude and two of three dynasties cannot post a competitive number
under any circumstances. Rule 2 passed mechanically the whole time; its *purpose*
did not.

Each dynasty therefore gets a **shape** — CYBER front-loaded, PRIMAL back-loaded,
COSMIC mid-weighted [H, §17] — with **comparable integrals at the terminus**, so
the dynasty is a choice of *how* you earn rather than *how much*. Two constraints
bind: the fold's mechanism is untouched and `verify:constitution` stays green by
construction; and comparable integrals are what keep **one** public board honest,
so per-dynasty leaderboards remain unnecessary and §12.2's cap on public numbers
is not approached. If the integrals cannot be brought within tolerance, that is a
finding to escalate, not a licence to mint a second board.

*This depends on the run ending at an occupancy rather than at a clock (Rule 15).
When the terminus is geometric, eating faster finishes the run sooner instead of
scoring more — which is what collapses the measured ~10× gap to the multiplier
alone.*

**Ascension** gives Score its monthly meaning — the individual climb the owner's own
retention anatomy (a monthly promotion league) named as a primary login driver.
League points are the sum of your best **ten [H]** daily Signal scores in the
calendar month, so attendance helps up to ten days and after that only *quality*
helps — training is rewarded, attendance is not farmable. Tiers are **absolute
published thresholds** at launch (they work at a population of one), converting to
percentile bands only when population justifies it [H, §17]. Promotion-only within a
cycle — you can never fall mid-month; cycles archive to the Chronicle as seasonal
standings (standings reset, possessions never). Rewards are earned-only tier marks,
frames, and an Apex-tier cosmetic per cycle — never sold, never economy. Ascension
is presented everywhere as "Score, this month" — an aggregation view of the skill
number, not a third number — and ignoring it costs nothing: Signals play identically
whether or not you ever look at the league.

### 6.2 Yield and Depth — the investment number

**Yield** is what a run's harvest was actually worth: the server-settled economic
total of the run — the same fold the economy already computes, *including* genes
picked, strain tiers reached, heirloom traits, lineage strength, and the extraction
outcome (GT §2.2, §2.8). Yield is where the build is *supposed* to matter. It already
exists mechanically; this document promotes it from bookkeeping to meaning. Yield is
**charge-independent**: it is always the full-strength fold, regardless of Energy
state — the DNA a run actually pays is Yield × the charge factor (§8.6), but Depth,
Mastery, and every record read the full number.

**Depth** is Yield accumulated against the World Serpent (§7.3): during each active
three-day battle, a player's **battle Depth** is the sum of their five strongest valid
Energy-funded Yields; clan battle Depth is the sum of its members' battle Depths.
Additional attempts can only replace a weaker result. **Lifetime Depth** is monotonic
and never decreases. Depth is denominated in **segments** — how far into the
Serpent's endless body the clan drove the hunt. "Depth 2,315" is this game's version
of the number the owner improved for two years, and it is built from everything the
account has become: the bred snake's lineage, the traits chosen at breeding, the
genes known and picked well, the mastery that unlocked them, and the piloting to bank
it all.

**Depth answers: what is my dynasty worth when it is tested?**

Rules that keep the two numbers honest:

- Yield never appears on the Score ladder; Score never appears on Serpent surfaces.
  Different names, different units (points vs segments), different screens.
- Depth is compared to **your own five first**, the clan total second, and the paired
  rival total third. Other members' individual attempts remain private (§9.4).
- Money cannot reach Depth. This is load-bearing and is *only* true because §10 bans
  selling DNA, variants, genes, and anything else build-adjacent. The convergence
  metric and the monetization ruling are one decision wearing two hats — reverse
  either and the other collapses. This dependency is stated here so nobody "just adds
  a small DNA pack" in 2028.
- Depth has **one private replacement threshold and no participation threshold**.
  Until five slots are filled, every valid attempt contributes. After that, the
  viewer sees the Yield needed to replace their own fifth result; it never changes
  eligibility, rewards, or another member's treatment. No minimum contribution,
  officer bar, or per-member public ranking may be derived from it (Rule 8).

---

## 7. The rhythms — how SupaSnake becomes a daily habit without becoming a duty

The web-game constraint is real: no install by default, no push by default. Wordle is
the proof the constraint is survivable — ritual scarcity plus a share loop beat
operating-system hooks. SupaSnake's version: one daily artifact, one weekly
resolution, one quarterly theme. Nothing resets punitively, nothing expires, nothing
accumulates as debt.

### 7.1 The cadence stack

| Rhythm | Surface | What changes | What it costs to miss |
|---|---|---|---|
| Continuous | **Energy recovery** | +1 stored Energy/hour [H], offline, to cap 6 | Recovery opportunities beyond the cap; no owned value decays |
| Daily | **World Signal** + the Daily Take | One seeded condition-set + choice of objective; first run pays the Take | The day's Take and one streak tier — never anything owned; the day archives as practice |
| 4-day cycle | **World Serpent Clan Energy Battle** | 3 days active, 1 day intermission; ordinary Energy runs feed Depth automatically | Nothing owned; unused recovery beyond cap and fewer attempts remain |
| Monthly | **Ascension** (§6.1) | League cycle on best-10 Signal scores; promotion-only | Nothing mechanical; fewer scoring days remain — the sports consequence, not a penalty |
| Quarterly | **Season** | Theme, curated modifier rotation, cosmetic track | Nothing; tracks never expire (§10.4) |

Ascension is the Signal's monthly aggregation view, and the Serpent battle is an
aggregation of ordinary runs, not a separate gameplay mode. The cap of one daily
ritual and one recurring clan surface stands.

Day boundary: **00:00 UTC** for Signal/Take, globally, displayed in local time with a
countdown. Serpent cycle zero begins Monday 27 July 2026 00:00 UTC [H], with fixed
72-hour active and 24-hour intermission phases. Energy recovery itself is elapsed
server time, not a calendar reset. Shared authoritative clocks beat client locale.

### 7.2 The World Signal — the daily ritual

Adopted from the audit's Model B, minimally, with contracts merged in at birth:

- One Signal per day, everywhere: a seeded condition-set built from existing mechanics
  (modifier, featured glyph behavior, gene-pool tilt — content from §12.1 slot 1, so
  the daily costs the developer nothing per day).
- Home shows **one line** (`WORLD SIGNAL: AURUM RESONANCE — new conditions detected`).
  It never auto-opens (GT §6.4's single-overlay policy generalizes: nothing auto-opens,
  ever). Launch stays primary.
- Opening the Signal offers **one choice from up to three objectives** — survival,
  extraction, or build execution — equal reward value, so every playstyle has a door
  in (research: objectives respect playstyle choice) [H, §17.5].
- Rewards settle automatically — no claim *cascades*, ever. The single sanctioned
  collect moment in the game is the Daily Take (below). The Signal reports what
  happened; the notification clears when *viewed*.
- Pays: normal run rewards, a modest flat first-completion bonus (150 DNA [H]), and
  progress on **cumulative, non-consecutive** cosmetic milestones (30 Signals, 100,
  365 — a "365 Signals" mark means devotion, and *never* requires them consecutive).
  The Signal objective run consumes no Energy and always harvests full (§8.6) — the
  daily ritual is never lean.
- Completion offers the share grid (§11.3) — same conditions worldwide is what makes
  the share comparable, which is what makes it worth posting (the Wordle property).
- Hidden until 3 banked runs. Introduced as a test of skill, not a new system.

**The Daily Take — the goodies, honestly** (owner ruling, v1.2). The first run of
each UTC day pays a bonus, collected with **one satisfying tap** on that run's
Results — attached to playing, never to logging in. Base 100 DNA [H], multiplied by
the **Take streak**: consecutive days grow it through tiers — 3 / 7 / 14 / 30 days →
×1.25 / ×1.5 / ×2 / ×3 [H]. A missed day cools the streak by **one tier**; it never
resets to zero. The streak multiplies the Take only — never run payouts, never
Yield, never anything else — so the pull is real and the economy stays sane. This
adopts the owner's Survivor.io lesson deliberately: coming back for something small
and certain every day is part of why a daily game stays a daily game. The
forgiveness curve is the refinement that keeps the same mechanism from churning the
player who finally misses a day — the chain matters, and it bends instead of
breaking.

The Signal **replaces Contracts** (two-of-three picks, premium third slot, claim
ceremony — all retired, §13) and absorbs the daily-leaderboard surface. It is the
*only* daily surface, by cap, and the Take lives inside it.

### 7.3 The World Serpent — Clan Energy Battle and the home of Depth

The convergence mechanic now sits directly on the normal run. The World Serpent is
the fiction and the clan-versus-clan comparison is the social consequence; neither
creates a second physics ruleset or asks the player to enter a queue.

**The central moment.** A player has six recovered Energy, commits all of it, and
builds a run already strong enough to enter their five. Banking protects a meaningful
personal harvest and a clan contribution. Continuing could deliver the battle, or a
crash could consume the full commitment and contribute nothing. That pressure is the
mechanic. High commitment therefore receives no speed increase, control penalty,
banking reduction, collision change, or arbitrary debuff.

**The mechanics.**

- One cycle is **3 active days + 1 intermission day [H]**. A run that starts before
  the active deadline may complete within **3 hours [H]**; longer-delayed completion
  does not count. A separate **3-hour maximum clan-eligible run duration [H]**
  prevents an attempt from being held open across the cycle; it does not invalidate
  or reduce the personal payout of a longer run. Settlement waits through the grace.
- Any valid normal run with a positive Energy commitment, begun while its player is
  an eligible member of a clan during an active cycle, is assigned automatically and
  immutably at start. There is no opt-in per attempt, battle run screen, second Energy
  pool, or separate battle mode. Signal's objective run and zero-Energy lean/training
  runs are not eligible.
- Start-time assignment fixes battle, side, clan, generation context, and the
  player's then-current fifth-best threshold. Leaving later does not redirect the
  run. A player is locked to one clan per cycle; switching clans cannot double-score,
  and the new clan becomes eligible next cycle. Joining during a cycle may score from
  the first positive-Energy run, provided no earlier cycle lock exists.
- Every valid completed attempt is retained for audit. The player's strongest
  **five [H]** full-strength Yields count; a sixth result replaces only a weaker one.
  Clan Depth is the sum of every member's current five. Insertion, replacement, and
  the clan-total delta are atomic and idempotent.
- **Energy commitment does not multiply clan score.** It multiplies credited DNA
  after Yield is fixed. Clan contribution is the stored full-strength `yield_dna`,
  so commitment raises economic exposure and emotional pressure without making six
  Energy mathematically mandatory. Score never enters this surface.
- The viewer sees their five, Energy committed and generation on each, whether the
  new result entered, what it replaced, the clan-total increase, and—only once all
  five slots are filled—the fifth-best Yield to beat. Teammates' individual attempts,
  absences, and thresholds are not exposed.
- Ordinary progression stays live throughout: earn/spend DNA, breed, and use a later
  generation in later attempts. There is no hidden battle snapshot at launch; any
  last-day generation concentration is measured before restrictions are considered.
- Settlement grants no DNA. Every player with a valid contribution receives a
  permanent participant (or stalemate) honor; the winning side receives the distinct
  victor honor. Honors are identity/history, cannot improve later scoring, and never
  expire. Each side's achieved battle Depth is banked once into existing monotonic
  personal/clan Depth history regardless of outcome. An unmatched side receives
  participation history, not an economic walkover.

**The privacy boundary.** Social responsibility is deliberate; public performance
management is not. The clan card shows both clan totals and the viewer's own five.
No roster row carries another member's attempt count, zero, fifth-best line, Energy
commitment, or ranking. Officers receive no stat-gated kick/recruitment control.

**Operating cost.** Pairing is lazy and deterministic at start, contribution
reconciliation and settlement are one hourly idempotent job, and the system authors
no bespoke battle content. The historical separate World Serpent weeks, artifacts,
and honors remain immutable history; no new explicit Serpent attempt is required or
created by the player-facing flow.

### 7.4 Seasons — the quarterly theme

Seasons are themes, not treadmills (decision 9): a palette, a Serpent re-skin, a
curated modifier rotation for Signals, a cosmetic track, and a Chronicle chapter.

- **Tracks never expire.** A purchased season track is completable years later, at the
  player's pace, with retroactive credit for play already done (Deep Rock Galactic
  model). Buying late is never punished.
- Track XP comes from **ordinary play** — runs, Signals, Serpent participation — in
  whatever dynasty the player prefers. The shipped Season 1 design (a
  contract-completion meter, GT §3.5) is retired with contracts.
- A free lane exists on every season and is genuinely worth playing.
- Seasons ship **zero permanent mechanical content** — no seasonal genes, no new
  systems. Theme, cosmetics, history.
- Season 1 "Solstice" (live, free-only, 15 real players) runs out on 2026-09-07
  unmodified; the season system rebuilds in Phase 3 (§14).

### 7.5 The World Report — return without debt

When a player comes back after three or more absent days [H], one screen — never
blocking Launch, Rule 1 and the two-tap law intact — reports what moved: which
Serpent battle cycles settled and how the clan fared, the rival's Depth delta, Ascension
movement, today's Signal. It is written as news ("HOLLOW FANG reached Depth 51,000
without you — they left the door open"), never as debt: no claims, no catch-up
tasks, nothing owed. **Binding tone rule: the Report may make a player miss the
world; it may never make them owe it.** This is the owner's "the world continued
moving" made real inside Rule 5 — absence has natural consequences (things happened,
others trained) and no manufactured ones (nothing was taken).

### 7.6 What holds the habit together

The habit is: open the tab, read one line, play the run you were going to play anyway
under today's conditions, share the grid if it went well, and once a week watch the
number that everything you've built adds up to tick past your best. Re-engagement
channels — in order of constitutional preference: the ritual itself; the share loop;
the **deterministic** weekly settlement email (opt-in, game-state only, built on the
shipped Resend path with LLM narration retired — a stated deviation from the audit's
"defer email," because owned email is the only re-engagement channel a web game has
before install, and a deterministic weekly summary is bounded, cheap, and commercial-
free); web push for Serpent settlement and new Signal only — opt-in, offered only
after the habit exists (second week of play [H]), never at first visit, never
commercial (Rule 7); and PWA installability for the retained (§11.4).

---

## 8. Progression — the three pillars

Only three concepts are allowed to feel like "my progress." Daily play feeds them; it
never becomes a fourth tree (audit spine, adopted).

### 8.1 Mastery — *how good am I with this dynasty?*

The strongest shipped lane (GT §3.4) and the account's spine. Per-dynasty, fed only by
extracted runs, paying mostly identity: cosmetics at most rungs, +1 mutation slot at
M3/M6/M9, the Sovereign emblem at M10. Unchanged mechanically; promoted visually —
Mastery is the number on the Player Card, the profile, and the Chronicle's front page.
With no energy gate on runs and Mastery XP computed charge-independent (§8.6), the
M10 grind (~150 banked runs per dynasty) is honest volume: weeks of real play, no
wall, no toll. **Mastery trials** — per-dynasty skill
challenges with cosmetic rungs — are the sanctioned veteran-variety slot (§12.1) and
the designated Phase 4 growth lane, replacing any temptation to add genes (F9).

### 8.2 Lineage — *what is special about my snake?*

The fantasy is "this snake descends from my best snakes," and the shipped
implementation contradicts it three times with `random()` (GT §4). Rulings:

- **Breeding becomes a deterministic draft** (decision 4, overturning the shipped
  system): parents' contributions are shown; the player *chooses* the child's variant
  line from the parents' lines, *drafts* inherited traits into the child's bounded
  slots (the draft's forced choices are the sacrifice — taking the scavenger line
  means not taking the sprinter line), and *chooses* the lineage strain from the
  parents' strains. Full preview before payment; nothing material hidden post-payment
  (P6; also §10's "outcome fully known" made mechanical). Breeding stays a DNA sink
  with the shipped cost curve.
- **Generations are uncapped: Gen4+ is Ascendance** (owner ruling, v1.2, reversing
  the Gen3 cap). Gen1–3 keep their unlocks (second trait slot, lineage strength).
  From Gen4, every generation permanently raises that snake's **Yield** — increments
  start near +2% and shrink toward an asymptote of roughly +30% total [H], so
  upgrading never stops paying but a veteran's snake stays ~1.3× a newcomer's, never
  10× — a clanmate fresh to the hunt is never dead weight (Rule 8's spirit). Every
  fifth generation the snake **visibly evolves** (pattern and aura stages), and
  pedigree compounds in the Chronicle. The breeding cost curve steepens through
  Ascendance so the lane spans months, not day one [H] — the previous economy's
  honest error was that Gen3 fell on day one. Score remains untouched by all of it
  (Rule 2): the ladder measures the pilot; Ascendance pays where investment is
  *supposed* to pay — the Serpent battle, where your clan is watching. Your snake gets
  stronger forever, and the place it shows is the place that counts.
- **Reroll tokens and the lineage reroll are retired** (nothing random remains to
  reroll). Held tokens convert to 150 DNA each (their old price) in one migration.
- **Ascendance can be unwound from the leaves inward.** The main Lab offers the
  highest active bred build a one-step downgrade for the exact `dna_cost` stored
  on its breeding receipt. No estimate or current-price recalculation is allowed.
  A snake with an active descendant or open run cannot be unwound. The active
  child leaves the collection, the next-highest generation becomes available,
  and the breeding event retains immutable parent/child snapshots. Repeating the
  action can return a branch further, one explicit confirmation at a time.
- Lineage strength rules (rarity- and generation-derived, spawn points capped at
  2/strain) stay exactly as shipped — that cap is a well-judged anti-pay-to-win
  boundary (GT §2.5) and now also protects Depth.

Lineage is where Depth gets its teeth: the snake you bred is the snake you hunt with.

### 8.3 Discovery — *what do I know how to use?*

The genome is the strategic vocabulary, and it has outgrown its readers: 34 active
genes produce over a million six-gene combinations (F6). Rulings:

- **Active pool: 14 genes** [H], hard cap 16, floor 12 (decision 3). Curation
  criteria, which are binding on the implementation spec: every active gene represents
  a distinct *decision category*; every strain retains ≥2 active genes so thresholds
  stay reachable; the three dynasty signatures stay. The catalog is preserved —
  inactive genes are shelved, not deleted, and may rotate in via seasons *within the
  cap*.
- The FTUE ramp (GT §6.2) stays server-enforced and unchanged: it is the
  best-in-class part of teaching. Splices stay late (15 banks); apexes stay gated.
- The offer-gravity algorithm (GT §2.4) is a strength — keep it, and *surface* it:
  the pity rule and lineage bias should be felt ("your lineage called this gene"), not
  hidden.
- A permanent gene addition requires an amendment: it must introduce a genuinely new
  decision category and retire or shelve a gene to stay inside the cap.

### 8.4 Collection — identity, not economy

Collection is the pillar's supporting cast, not a fourth pillar (decision 6): variants
are bodies for Lineage and expression for identity. The set-bonus DNA multiplier and
per-snake offline income are deleted (§13) — owning more snakes never again pays.
Completion is allowed to be fast (~9 banked runs to a legendary is fine, GT §3.6):
the long game is breeding the *right* snake, not affording the last one. Curate 9–12
showcase variants with real visual identity [H]; the rest remain owned and reachable
but stop pretending to be content. The emotional center is **the one equipped snake**
— named, bred, visually yours, tested weekly against the Serpent.

### 8.5 DNA — one currency, three jobs

DNA remains the only currency (cap: 1). Its jobs after this document: **variants**
(collection), **breeding** (lineage), and — Phase 4 — **the earned cosmetic shelf**
(§10.3), converting veteran surplus into identity. Deleted jobs: passive attendance
income, set bonuses, global streak multipliers, clan-duel multipliers (§13). DNA is
never sold, never gifted by systems, and never a proxy for anything money can reach
(Rule 3). Payout now primarily reflects successful play, which is what P1 asked for.

### 8.6 Energy Commitment — recovered stakes, chosen at run start (v1.5)

Energy is the player's deliberate exposure decision, not a fixed count of ordinary
full-reward runs. It is a recoverable run charge, not the spendable economy currency:
DNA remains the only currency, and Energy remains unbuyable.

- **Stored recovery.** Capacity **6 [H]**; recovery **1 Energy per 3,600 server
  seconds [H]**, including offline. Whole elapsed ticks are applied lazily under a
  player-row lock and partial progress remains in the recovery anchor. Time above cap
  is discarded; spending from full begins a fresh tick. The UI shows stock, partial
  progress, and the next tick using a server timestamp plus monotonic display clock.
  Device time and timezone never grant recovery.
- **The commitment.** Before a normal earning run, choose zero or a whole number from
  1 to `min(stored, 6)`. Default **1**; selecting all six requires a deliberate
  confirmation. The chosen amount is consumed in the same authoritative transaction
  that immutably stamps the session. A crash, abandonment, failed result, revive,
  disconnect, reconnect, duplicate request, or decision to bank early never refunds
  it. This is a voluntary spend of a resource, not system confiscation under Rule 6.
- **The initial harvest curve [H]:** 1 → ×1.0; 2 → ×2.2; 3 → ×3.6; 4 → ×5.2;
  5 → ×7.2; 6 → ×10.0. The premium above linearity pays for exposing several
  recovered units to one failure event. It is stored in integer basis points on the
  session so client preview and server settlement round identically.
- **What receives it.** First settle the run's full-strength Yield, including build,
  generation, and extraction/crash outcome; then multiply only the credited normal
  run DNA. Score, Yield itself, Depth/clan contribution, Mastery, achievements,
  fixed unlocks, Signal/Take bonuses, rare fixed drops, quest progress, and
  leaderboard values never receive the commitment multiplier.
- **No hidden counterweight.** High commitment does not change speed, controls,
  collision, board pressure, banking ratios, portal timing, gene odds, or validation.
  Its counterweight is concentrated loss exposure and the player's resulting banking
  judgment. Low/aggressive, high/conservative, and high/aggressive-for-experts are all
  valid strategies.
- **Energy never gates playing.** At zero stock—or by choice—the same normal run can
  start lean at **×0.25 [H]** credited harvest, with a minimum of 1 DNA for a positive
  Yield. Free/Training remains rewardless; the daily Signal objective run remains
  exempt/full-strength. Only a positive-Energy normal run can feed a Clan Energy
  Battle (§7.3).
- **Energy is never sold, gifted, stipended, granted by a pass, accelerated, or
  touched by a SKU or perk.** Recovery is its only source (§10.4). It carries over
  only inside the six-unit cap; there is no overflow bank or daily recovery claim.
- **The meter surfaces at 4 banked runs [H]**. Energy Commitment lives in Run Setup,
  not as a mid-run interruption. Results state committed Energy, multiplier,
  full-strength Yield, and exact credited DNA.

**Economy compromise.** The owner-set hourly rhythm can supply up to 24 Energy/day
to a player who returns repeatedly, versus the prior six full charges. The cap leaves
once-daily stock at six, but the nonlinear curve also makes a successful six-Energy
return worth 10 one-Energy harvests. The release therefore makes no hidden base-rate
cut and does not casually rebalance the whole economy; all dials stay centralized and
the explicit telemetry in §17.2 governs the first retune. This accepts a measurable
inflation risk in exchange for honest stakes and frequent recovery.

### 8.6a The ladder — the difficulty climb (v1.4)

Mastery answers *how good am I with this dynasty*, and until now it had no ceiling
to be measured against. A build system needs something to defeat; a skill number
needs a wall. The ladder is that wall, and it is the retention structure this
audience actually responds to — competition interest declines faster with age than
any other motivation measured, while **Strategy is the most age-stable**
(Quantic Foundry, n > 140,000), so the climb belongs on the build and the
execution rather than on ranking players against each other.

**Fixed, ordered, cumulative.** Rung *n* adds one **named rule** and means the same
thing for every player. Not a pick-your-own modifier budget: a summed handicap is
incomparable between two players, which is why Slay the Spire's A20 became a
community identity and Hades' Heat 20 never did — *"if you're Heat 20, there's no
telling what modifiers compose that."*

- **6–8 rungs [H]**, deliberately shallow. Ladder-completion data scales inversely
  with depth (Slay the Spire, long runs, 20 rungs: ~7% reach the top; Brotato,
  ~20-minute runs, 6 rungs: ~36%; Peglin, 20 rungs: ~2%). At a three-minute run,
  a shallow ladder converts a real fraction of players into "top of the ladder";
  a twenty-rung one converts almost nobody.
- **Unlock globally, record per-dynasty.** Clearing rung 5 anywhere lets you
  *attempt* rung 5 everywhere; the *record* stays per dynasty. The loudest
  complaint in Slay the Spire's decade is the per-character re-climb, and players
  route around it with save editors — a designed system should not require that.
- **Rungs are built from substrates that already exist** — starting length, hold
  count, portal window, INFUSE growth, PASS reward, banish count, salvage, a
  hostile weekly clause. A rung introduces no new system; that is what keeps it
  inside Rule 12.
- **Never purchasable, never gifted, never accelerated by any SKU** (Rules 3, 4).
  Rung marks are earned-only cosmetic identity, like Ascension tiers.
- **The rung is server-stamped into the run** and settlement validates under its
  parameters — never a client claim, never a build-time flag (Rule 11).

Ignoring the ladder costs nothing: rung 0 is the game, and every surface plays
identically for a player who never opens it.

What stays dead from the shipped system: the run-start gate, client-controlled or
dual-clock recovery, Energy purchases and the premium stipend, and the
€4-destroying claim path. What returns by owner order is server-authoritative timed
recovery itself, with a storage cap and a commitment decision rather than a refill
claim.

---

## 9. The social layer and the cold start

The owner's highest-priority unsolved problem, and this document's headline design.
The owner's two years in Survivor.io names the mechanism precisely: *being part of a
group that is going somewhere, where my improvement matters to people other than me.*
The documented version of that mechanism is **interdependence with consequences for
specific named people** — and it is fully present at N=2. Headcount was never the
variable. Density of noticing is.

### 9.1 What clans are for

A clan is a witness under shared stakes, not an institution. It exists so an ordinary
run can become a moment where someone specific needs you to execute, bank well, and
improve a shared Depth. Everything else — heraldry, banter, rivalry, playoffs — is
elaboration on being noticed.

### 9.2 The clan design

- **Clan size: 1–12, soft-full at 6** [H] (overturns the shipped 50-cap and deletes
  the never-enforced minMembers:20 constant — GT §10). At six members, every member
  can be load-bearing in the battle sum; at fifty, forty are wallpaper. Small
  clans also make symmetric pairing tractable at tiny population.
- **The clan of one is a first-class citizen.** A solo clan builds battle and lifetime
  Depth, appears in the directory, and pairs when a rival enters the same cycle. If no
  rival forms, its run history remains real and settlement records participation rather
  than fabricating a win.
- **Founding flow:** at Serpent unlock (8 banks), one skippable prompt: found your
  clan (name it, pick preset heraldry) or join by invite code/link. Founding is one
  tap plus a name. There is no browse-empty-directory dead end: the directory shows
  only recently active clans, so it is short and alive rather than long
  and dead. Total-population counts are never displayed anywhere.
- **Roster mechanics:** invite links are the only recruitment surface (§11.3 — the
  invite is the acquisition artifact). A run stays attached to the clan snapshot at
  start; one cycle lock prevents switching for double credit. Personal historical
  honors stay with the player; clan records stay with the clan. Kicking remains plain
  roster management with no stat-gated tool, minimum-Depth field, or officer output
  lever (Rule 8).
- **Contribution display:** the player sees their own strongest five and the two clan
  aggregates. Nobody sees another member's attempt list, zero, Energy amount,
  generation, fifth-best line, or intra-clan rank. The witness is the shared number
  and the run-result celebration, not a manager dashboard.
- **Moderation surface (solo-dev bound):** clan names filtered, heraldry preset-only,
  no free-text descriptions at launch, report path on every clan and handle. UGC
  surface stays this small until there is a population that earns more.

### 9.3 Degradation and scale — one design, three populations

- **N = 1 player:** a clan of one accumulates its own battle Depth and participation
  honor. The opponent reads “forming”; no phantom rival or free victory is invented.
- **N = 20 retained players:** three to six small clans; pairing produces real
  rivalry in most cycles; the directory is short and fully alive. This is the complete
  competitive MVP, and it needs *twenty people* — a marketing problem with a known
  solution, not a structural barrier.
- **N = 20,000:** pairing bands become promotion-tiered clan leagues (seasonal
  standings, framed as seasons — Chronicle records past finishes; standings reset
  with the season, possessions never). The pre-built Gauntlet (scouting, blind picks,
  research tree) and playoffs open behind population gates: **Gauntlet at ≥25 clans
  with ≥3 weekly-active members sustained four weeks; playoffs at ≥16 gate-open
  clans** [H]. The criteria are public; the developer flips the flag when they are
  met. All four subsystems are already built (GT §5) — hiding them costs a flag, and
  their state is preserved for the day the gates open.

### 9.4 Symmetry — the honest complication, solved structurally

At launch, pairing is deterministic and lazy: the first unpaired clan in the cycle is
matched by the next eligible clan. This is deliberately simpler than pretending the
current population supports a rating algorithm. It creates three safeguards:

- A side is created only by a real positive-Energy attempt; inactive clans do not
  populate a matchmaking queue or create scheduled obligations.
- No opponent by settlement means participation, not victory. Winner prestige cannot
  be farmed from an empty population.
- Pairing quality, size/activity bands, and standing-rival preference are later-stage
  refinements opened only when observed clan count supports them [H]. They may change
  opponents, never scoring, Energy, or rewards.

Paired outcomes grant victor/participant/stalemate honors and Chronicle history—never
DNA, multipliers, Energy, or future battle power. The shipped clan-duel ×1.05 DNA
multiplier remains deleted (§13).

### 9.5 Why the Hunt can never become the pressure to spend

The Survivor.io failure the owner named is closed at every commercial link: money
cannot buy DNA, Energy, recovery, variants, genes, traits, analysis unavailable to
free players, or anything else that feeds Yield (§10); therefore money cannot move
Depth (Rule 3), and a member's wallet is invisible in the battle. Best-five bounds
what can contribute while allowing practice/replacement. The private replacement
line creates self-pressure without handing officers a quota. A clan can pressure you
to *play well* and the game deliberately allows that social responsibility; it cannot
pressure you to pay, because payment has no route to the shared number.

### 9.6 SupaSnake's Harvard — the smallest population we can saturate

Facebook did not survive being empty; it scoped itself to one campus, saturated it,
and expanded campus by campus. The acquisition thesis and the first clans are the
same problem, solved by the same act:

- **Campus 1 — the owner's reach (~20–40 people).** Friends, colleagues, and — the
  richest vein — the owner's own Survivor.io clanmates of two years: people who
  already share the exact reference frame this game answers, with a real relationship
  to the founder. Formed into **4–6 founding clans, each with a captain who recruited
  their own members** — so the first stranger to arrive sees a short directory of
  genuinely alive clans with real battle Depths, never an empty room. This is also
  the symmetry seed: several small clans of comparable activity, by construction.
- **Campus 2+ — one bounded niche community at a time**, chosen by criteria (has a
  hub; browser-game tolerant; skill-culture; small enough to notice a newcomer
  product): candidates include the Google Snake records/modding community, r/WebGames,
  and one roguelite Discord [tactical choices, owner's discretion — the campus
  *strategy* is constitutional, the campus *list* is operations]. Each campus is
  entered with a result artifact (a Signal grid, a Serpent settlement card), not an
  ad, and lands into the same mechanic: someone's clan invite. Broadcast surfaces
  (Show HN, a launch post) are recruiting spikes *for* campuses, not campuses.
- **Expansion discipline:** do not enter campus N+1 until campus N produced at least
  one self-sustaining clan (four weeks of settled hunts without founder prompting)
  [H]. Saturation before breadth — the entire Facebook lesson.

No bots, no fake players, no fabricated activity, ever — the research found zero
successful precedent and this document forbids it (Rule 8's spirit; a witness that
turns out to be cardboard poisons the only asset this design has).

---

## 10. Monetization

### 10.1 The ruling on the locked document

`MONETIZATION_DESIGN.md` v1.0 (LOCKED, 2026-07-19) deliberately sold progression
acceleration — +3 energy/day, a third contract, 48h offline accumulation — defining
"never pay-to-win" as "never competitive power," with a ~1.7× premium/free DNA
guardrail, honestly implemented at ~1.5× (GT §3.6, §7.3). It is internally consistent
and was not drift. **It is overturned**, on four grounds:

1. **The convergence metric changes what "competitive power" means.** The locked
   definition was defensible when the only competitive number was build-independent
   Score. This document creates Depth — a build-inclusive number that is the weekly
   social centerpiece — because the owner's own two-year testimony says that number
   is why people stay. The moment Depth exists, "collection acceleration" *is*
   competitive power, and the locked document's central distinction dissolves. Keeping
   both was impossible; the convergence metric mattered more.
2. **Paid DNA reaches `random()` through one step** (breeding), against the game's own
   "no paid RNG, ever" — and post-OGH 6 Ob 228/24h, indirectly-paid randomness is
   legal exposure in this jurisdiction, with the Digital Fairness Act incoming
   (GT §11).
3. **Energy monetization sells relief from friction the game itself created** — the
   exact opposite of the owner's stated principle — and its implementation currently
   *destroys* about €4 of a €4.99 purchase via a live code path (GT §9.1). The
   cheapest correct fix is also the right product: stop selling Energy.
4. **Trust is the only defensible solo-dev asset.** RuneScape's subscription revenue
   rose 9.5% while its loot-box revenue fell — evidence that the trust position can
   outperform on revenue *trend*, not just sentiment.

**What overturning costs, stated plainly:** the most reliable free-to-play revenue
class (consumables and progression) is forfeited — Diablo Immortal demonstrates the
rejected model makes real money; ARPPU will be materially lower; five SKUs and a
designed, implemented perk system are discarded; the €9.99→€3.99 reprice cuts
per-subscriber revenue ~60% on an untested conversion/tenure bet [H, §17.3]; and
revenue now scales **only** with retained population, which demands patience. Below a
few thousand retained players this model funds hosting, not salary. That trade is
accepted with open eyes: the plan optimizes years, not quarters.

### 10.2 What SupaSnake sells — four products, forever

> SupaSnake sells appearance, continuity, and patronage. It does not sell gameplay,
> currency, progress, time, information, or odds. Nothing sold is consumable.

1. **Keeper** — the supporter subscription. €3.99/month or €34.99/year [H]. Replaces
   and renames Premium ("premium" implies a better tier of play; "Keeper" implies
   stewardship). Perks, all expressive or continuity: the monthly cosmetic drop
   (shipped infra), the Keeper mark with tenure depth ("Keeper since Season 2" —
   unbuyable retroactively, the one harmless exclusivity), extra cosmetic loadouts,
   richer Chronicle *presentation* and full run-archive retention, and dynasty
   colorways of owned variants. **Free identity is never truncated:** every Record,
   personal best, and lineage entry is permanent for everyone; Keeper buys depth of
   presentation, not existence of history (a deliberate tightening of audit §12.4).
   The lapse contract, printed on the purchase screen: everything received is kept
   forever; stopping stops new drops and nothing else.
2. **The Atelier** — the permanent cosmetic storefront. Direct euro purchase of
   cosmetics, €1.99–€6.99 [H], one-time, permanent, no currency intermediary. **The
   catalog never rotates out** — a 2029 arrival can buy the Season 1 trail. No item
   is money-exclusive in kind: every slot has strong earned entries beside the bought
   ones (decision 13).
3. **Chronicle Season** — €4.99 [H] per season track, cosmetic and narrative only,
   never expires, retroactive on late purchase, real free lane (§7.4).
4. **Patronage** — one-time purchases for the people who love the game most.
   **Founding Keeper**, €24.99 [H]: permanent founding mark, a distinctive cosmetic
   set, the first Chronicle Season when it ships, Chronicle recognition of the era —
   available from launch day because "founding" means being there. From Phase 3,
   **Patron Packs**: up to three per season — e.g. €19.99 / €49.99 / €99.99 [H] —
   each a named, fully-specified, permanent cosmetic set plus patron tenure marks
   ("Patron of the Serpent's Year"). This is the Path of Exile lesson the v1.0 text
   cited and then declined to use: the trust-compatible cosmetic model earns its
   keep through the *top* of its price ladder, not its floor. Binding rules: pack
   contents are pack-specific in kind — never earnable items repackaged, never
   power-adjacent, never randomized; packs never retire (back-catalog forever);
   tenure marks are unbuyable retroactively; no pack is ever discounted. No ongoing
   perks — patronage honestly labeled, in both directions.

The false advertised perk ("Season Pass included," which has no content behind it —
GT §7.2) and the two inert perks die with the old Premium before any live key.

### 10.3 The earned shelf

From Phase 4, some cosmetics are priced in DNA — the earned wardrobe lane, disjoint
from the Atelier: **no item is ever purchasable both ways**, DNA prices never appear
beside euro prices, and DNA remains unbuyable, so the two-currencies dark pattern
cannot operate. This gives veteran surplus DNA a permanent identity-aligned sink
(§8.5) and free players a wardrobe path beyond milestone rungs.

### 10.4 What is never sold — the locked list

Energy in any form or amount — it no longer gates play and is never sold (§8.6) ·
DNA or any spendable currency · variants, traits, genes, splices, heirlooms · breeding influence
of any kind · objective counts, Signal attempts, or battle eligibility · offline
recovery, recovery rate, capacity, or overflow ·
XP or progression rates · leaderboard eligibility, placement, or protection · aim
systems or any planning information · randomized outcomes, direct or laundered
through any intermediary · anything that expires, decays, or can be confiscated.
Proposing to sell any of these is a change to the product's identity and requires a
constitutional amendment, not a pricing experiment.

### 10.5 The commercial calendar

**In-product restraint, company tempo.** The Atelier grows **monthly** — additions,
never rotations: prices never move, nothing leaves, and "new this month" is the
anti-FOMO version of shop cadence — a reason to look, never a reason to hurry. Four
commercial *reveals* per year (season track + patron packs, one per season) plus
twelve silent Keeper deliveries and twelve quiet Atelier additions. No daily deals,
no login offers, nothing time-limited, ever. The marketing sentence improves from
"four events a year" to the stronger one: **"nothing in our shop ever leaves, and
something new arrives every month."**

**Gifting ships with commerce (Phase 3):** any owned-catalog cosmetic, giftable by
handle — or, the acquisition case, by invite link to a non-player, who receives it
on signup. Affection into revenue, and an invitation with a bow on it. No gifting
prompt ever appears inside clan surfaces (Rule 8 adjacency).

**Rule 7 clarification (owned media):** Rule 7 governs the product. Owned media —
Discord, socials, the opt-in Dispatch — may carry commercial news loudly. The game
never knocks; the community channel may shout. That division is how the reference
trust-model studios do it, and it is what makes monthly tempo compatible with
in-product silence.

Placement rules are Rule 7 and are absolute — including: the moment after a personal
best is the most monetizable moment in the game, and it is left alone, permanently.
That moment belongs to the share prompt (§11.3), which is how it compounds instead.

### 10.6 The prohibition list — dark patterns forbidden by name

**Pressure:** countdown timers on offers · scarcity claims ("limited," "last chance,"
"X remaining") · vaulting or retiring sold items · anchor pricing, fake discounts ·
personalized or dynamic pricing · whale detection or spend-targeted offers · any offer
triggered by loss, death, failed extraction, or any frustration signal.
**Obfuscation:** premium currency of any kind · bundles mixing earnable and unearnable
goods · quantities designed to strand balance · any purchase whose material outcome is
not fully known pre-payment.
**Coercion:** loss framing of any purchase · any clan mechanic improvable by money ·
manufactured friction sold back as convenience (if a wait exists only because its
removal is sellable, delete the wait) · anything resembling gambling.
**Exploitation:** no mechanic profitable through impaired judgment · purchase flows
≥2 deliberate taps from gameplay · the shipped age/legal infrastructure is a floor.
**Telemetry:** no instrumentation whose purpose is finding the moment a player is
likeliest to break. Measured instead: retention by payer status (if Keepers don't
retain better, the perks are wrong — the single most diagnostic number), deliberate
store-visit rate, conversion read *only* alongside refunds and cancellations,
subscription tenure, and monetization sentiment as a first-class metric.

### 10.7 Honest expectations

[H] A no-consumable, no-urgency model plausibly converts 1–3% of *retained* players to
Keeper, with Atelier, season, and patronage purchases concentrated in the same cohort.
Revenue therefore scales with retained population times the depth of the offer to
those who love the game most (§10.2) — and never with pressure. Every euro of upside
lives in §§5–9 and §11 — the run, the numbers, the rhythms, the witness, the growth
loop. Monetization's job is to be worthy of the game and never to be the reason a
player left. The five-year test for any commercial proposal: *if a player who spent
€300 over five years read our full internal reasoning for this system, would they feel
it was designed for them or against them?*

### 10.8 The Company

SupaSnake is also a company, and revenue is one of its goals — with rules. The
challenge is generating it while *increasing* trust, and the mechanism is this
section plus everything §10 already forbids.

**Business KPIs**, reviewed quarterly beside the product north star, in this fixed
order — trust metrics first, revenue second, every time: monetization sentiment and
refund/cancel rates; retention by payer status; then MRR, ARPPU, conversion,
subscription tenure, LTV by cohort. **Never measured:** per-session revenue, offer
impressions, or anything that improves by showing players more commerce (§10.6
stands verbatim).

**Milestone bands** [H, owner-set]: hosting covered → part-time sustainable →
full-time sustainable → second hire → paid-acquisition budget. Success has a defined
shape beyond survival, and each band names what it unlocks.

**The paid-UA gate.** Paid acquisition is a scaling tool, not a discovery tool:
sanctioned when W4 retention meets target [H], LTV is measured on ≥2 real cohorts,
and blended payback is ≤6 months [H]; capped at a fixed percentage of trailing
revenue; **forbidden before retention-proof** — buying traffic to find out whether
the game retains is prohibited (the soft-launch doctrine of the very studios this
posture is borrowed from). SupaSnake's structural UA edge, when the gate opens: the
ad *is* the game — click to live board in seconds, no platform tax on conversion.

**The team-scaling clause** (owner-confirmed: growing the company is a goal, not an
exception). Every cap in §12 is classified as either **capacity-bound** — it exists
because one person runs the game today, and relaxes by amendment as headcount grows:
content cadence, authored world events, cosmetic production volume, moderation
surface, support depth, LLM features — or **identity-bound** — it exists because of
what SupaSnake is and holds at any team size: one currency, two numbers, three
pillars, no consumables, no manufactured loss, no paid power, commerce in its
district. The solo constraint is a phase, not the game's identity; the milestone
bands are the ladder out of it. A 2030 team of five inherits the identity-bound caps
exactly as written — headcount buys cadence, never a license for mode sprawl.

---

## 11. Marketing, growth, and the Acquisition Engine

Marketing is co-equal with product. The growth surface is currently almost empty
(GT §8) — no landing pitch, no icons, no OG images, no PWA, no push, no referral, and
a share card with no URL in it. Those absences make the daily-habit goal unreachable
regardless of the game's quality. They are also all small. This section is the plan;
§14 sequences it.

### 11.1 Positioning

**To a stranger:** *"You know Snake. Now every run ends with a deal: bank it, push
your luck, or feed the snake — and breed a bloodline that hunts better than the last
one."*

**To the genre-literate:** Three-minute precision runs
in your browser — no install, no ads, no energy paywall, no loot boxes, nothing
expires, nothing you own can be taken, and nothing you can buy moves a number. A real daily
pull without the punishment: streaks cool, they never shatter. The player contract
(§3) is published as a marketing asset, because competitors cannot copy it without
dismantling their revenue.

**Who it is for:** people who have three minutes at a desk and a snake-shaped decade
of muscle memory; roguelite-literate players who hear "extraction decision" and lean
in; lapsed Survivor.io-class players who loved the clan number and hated the mall.
14+, browser-first, fairness-sensitive. **Who it is not for:** whale-hunting F2P
economics, idle-game administrators, anyone wanting the game to play itself.

**The niche-vs-mass question, answered:** this plan does not need to decide whether
SupaSnake's ceiling is five thousand devoted players or five million, because with one
developer, no ad spend, and a no-ads lock, the first two years are identical either
way — saturate small communities, compound the share loop, keep the retained. The
fork becomes real only when there is retention data to argue with, and it is listed in
§17 with its test rather than guessed at here.

### 11.2 The acquisition thesis

Zero paid acquisition. Three organic loops, each attached to a moment the game already
makes, plus campus seeding (§9.6):

1. **The daily Signal grid** — the Wordle loop. Same conditions worldwide, one compact
   spoiler-free artifact, posted because it says something about *you* (§11.3).
2. **The clan invite** — the Serpent needs hunters. Recruiting a friend and growing
   the game are the same act (§9.2). The invite link is the single most important URL
   in the product.
3. **The lineage card** — a bred snake's portrait: name, pedigree, colorway, best
   Yield. Posted as identity, reads as an ad.

Falsifiability [H, §17.8]: if, across the first two campuses, share-grid CTR and
invite conversion cannot produce a measurable share→visit→launch funnel, organic
broadcast growth fails, and the sanctioned fallback is deeper community embedding
(become a fixture of three niches), not engagement mechanics. Paid UA remains gated
behind §10.8's unit-economics gate and is never the remedy for a funnel that doesn't
retain — it is the amplifier for one that does.

### 11.3 The shareable artifact

The share moment is the personal best and the daily result, and the artifact leads
with SupaSnake's signature — the extraction story. The portal-decision string *is* the
run's dramatic arc, in five characters:

```
SUPASNAKE · Signal #214 · CYBER
⚡▶▶💰  infuse · pass · pass · BANKED ×1.25
Score 1,240 · best ↑ · Yield 2,315
supasnake.com/s/214
```

One tap from Results Layer 1, image + text + **URL** (fixing the shipped share card
that omits it — the highest-leverage one-line defect in the repository, GT §8). Every
artifact class gets a URL and an OG image: runs, snakes, clans, Signal days, Serpent
settlements, profiles (Rule 14). Serpent settlement cards are the clan-scale share:
"HOLLOW FANG reached Depth 48,210 — best week yet."

**Challenge links make every share playable.** A Signal share URL drops the visitor
onto the *same seed* with the sharer's score as the target — "beat my 1,240 on
Signal #214" is a dare, not a screenshot, and the visitor lands in a live game five
seconds after clicking. Minimal form (seed + target score) ships with the Signal
itself; ghost racing follows.

**The spectacle layer** (staged, Phases 3–4): the portal decision under pressure is
the most watchable thing SupaSnake produces, and it becomes marketing that scales
itself. (1) **Deterministic replays** — input-log + seed + content version; the
engine is already seeded and server-recomputed, so this is formalization, not
rewrite [M–L, honestly]. Notable runs (PBs, world-firsts, Serpent bests) keep their
logs. (2) **Ghost racing** — run today's Signal against the translucent ghost of a
clanmate's or rival's attempt; the clan witness deepens from numbers to watching.
Privacy: opt-out, clan-scoped by default. (3) **Clip export** — one-tap
replay-to-video of the run's final seconds at detected highlight moments
(world-firsts already exist in the code). (4) **Creator seeds** — named custom
Signal conditions a creator can issue to their community: a campus-seeding tool that
costs the operator a config row. A streamer's community is a campus with
distribution built in.

### 11.4 The web platform, treated as an advantage

- **Instant play is the demo.** One click from any link to a live board (≤2 taps,
  Rule 10) — no store page, no 200MB download. Every shared URL is a playable ad.
- **Hygiene shipped in Phase 0** (each hours, not weeks): landing meaning at the root
  for logged-out visitors (the Chamber stays; add one pitch line, one clip, and
  below-the-fold "what is this" for scrollers and crawlers), favicon/app icons, OG
  and Twitter card images, `robots.ts`/`sitemap.ts`, UTM and referrer capture at
  signup (attribution before the first campus, or campus results can't be read).
- **PWA manifest + icons in Phase 2:** installability offered *after* the habit shows
  (a returning player's third day [H]), never at first visit.
- **Web push** (supported on installed PWAs, including iOS): Serpent settlement and
  new-Signal only, opt-in, offered in week two [H], never commercial. The habit
  design must work at zero push — push is amplification, not architecture (the Wordle
  proof).
- **Email:** the deterministic weekly settlement digest (§7.5), opt-in, registered
  players only.
- **Guest conversion stays respectful** (no nags — GT §6.5) but finally gets its
  reason: "your lineage and your Depth live on this account" is an argument the
  current build never makes. Conversion messaging leads with continuity, not backup.

### 11.5 The Acquisition Engine — the funnel as a designed product surface

Acquisition is not a launch activity; it is a machine built into the product,
instrumented from Phase 0 (UTM/referrer capture plus stage events), reviewed weekly
(§11.8). Eight stages, each with its mechanism and its metric:

| Stage | Mechanism | Metric |
|---|---|---|
| **Reach** | The channel portfolio (§11.6) | Arrivals by channel |
| **Arrive** | Every URL lands playing; click → live board in seconds | Arrival → first input |
| **Activate** | The aha: **first BANKED extraction** [H, §17] — onboarding optimizes toward the game's thesis landing, not generic completion | Arrival → activation |
| **Identify** | Claiming a handle (§11.7) | Activation → identity; email attach rate |
| **Habituate** | Signal ritual, World Report, settlement Dispatch | D1 / D7 / W4 |
| **Belong** | Clan founding and joining (§9) | D30 by clan status |
| **Advocate** | Share grids, challenge links, Broodmarks, gifts, clips | K-factor; share CTR; invite conversion |
| **Patronize** | §10 | Conversion × tenure (§10.8) |

**Broodmarks — the designed referral loop.** Inviter and invitee both earn a
permanent linked cosmetic mark and a Chronicle **brood-kin** record when the invitee
*activates* [H] — never currency, never power (Rule 3-clean), and inert to
self-referral farming because unactivated invites grant nothing. The invite is
thematic ("hatch a broodmate"), two-sided, and permanent — affection infrastructure
that happens to be growth infrastructure.

### 11.6 The channel portfolio

**Owned.** (1) **The Snake Query Engine:** "snake game" is one of the largest
evergreen casual-game search families on the web, and SupaSnake is structurally the
best-converting destination such a query can land on — click to live board in
seconds, no install, no store page. Build the honest intent surface: fast logged-out
landing, a /play intent page, VideoGame structured data, sitemap — plus the Rule 14
artifact-URL long tail (every shared profile, clan, and Signal day is an indexed
door). Expectations honest: entrenched competition, years-long compounding;
measured quarterly, near-zero marginal cost, never spam. (2) **The Dispatch** — the
opt-in news and settlement list. On the landing page as a one-field waitlist from
Phase 0, so spike traffic is captured before the habit surfaces exist; in-product
via the optional email at handle claim. (3) **The official Discord** —
population-gated like the clan layers: until the gate, the community's homes are
the campuses' own spaces, which is where credibility lives anyway.

**Product-generated — the game writes its own marketing.** Weekly Serpent
settlements auto-compose into a shareable post: top clans, record Depths,
world-firsts, the week's named conditions. The operator's job is to press publish.
This is the solo-sustainable content engine — the world generates news because the
world actually moves.

**Earned.** The campuses (§9.6) and their expansion discipline; creators via
creator seeds (§11.3); spike surfaces — Show HN, Product Hunt, r/WebGames — aimed
to land into campuses, with the **player contract published at a linkable URL as
the manifesto**: "the fair live game — real pull, no predation" is the one story
competitors cannot run without dismantling their revenue model. Niche press
(web-game and roguelite newsletters) over general press.

**Paid.** Gated by §10.8. When the gate opens, the click-to-play funnel is the
edge: the ad is the game.

### 11.7 The lead ladder — public identity as the conversion mechanism

Anonymous play is never gated — that promise is load-bearing (§3). The conversion
mechanism is **public existence**: leaderboards show unclaimed provisional entries
("Unclaimed Specimen #7f3a — is this you? Claim your handle"), and claiming the
free handle is what enrolls a player in Ascension, founds or joins a clan, and
signs shared artifacts. Registration is not a toll; it is claiming your name — and
it is the lead event: visitor → player (instant, anonymous) → **named** (handle
claimed) → **reachable** (optional email, the Dispatch) → belonging (clan) →
advocate (Broodmarks, shares) → patron (§10). Every rung voluntary, every reason
real, every transition instrumented. Guests lose nothing by staying guests except
being *seen* — which is precisely the honest thing to charge for free.

### 11.8 The operating rhythm — marketing sized for one person

Marketing is a first-class ritual with a floor and a ceiling: never zero, never
the job. **Weekly, ≤1 hour:** publish the auto-composed settlement post; one
community touch in the current campus; read the funnel dashboard (§10.8's fixed
agenda: trust first, then growth, then revenue). **Monthly, ~half a day:** the
Atelier addition post and a short build-in-public devlog entry. **Quarterly:** the
season reveal, patron packs, a press ping, and the channel review (including the
Snake Query Engine's compounding check). Ceiling ≈ 15% of operator time [H];
everything beyond the rituals is structural (SEO, artifact URLs, challenge links,
Broodmarks, auto-posts) and works while the developer sleeps — which is the design
requirement, because operator hours are the company's scarcest resource.

---

## 12. The expansion architecture

The owner watched Survivor.io accrete modes for years because nothing told its
developer where content was allowed to go. This section is that answer, written before
the pressure arrives. It is a first-class deliverable of this Constitution.

### 12.1 The growth slots — where new content goes

Seven slots. New content must land in one. A proposal that fits none is rejected, or
forces a deliberate, recorded amendment opening an eighth.

| Slot | Grows by | Marginal cost |
|---|---|---|
| 1. Signal conditions | New seeded condition-sets from existing mechanics | Near zero |
| 2. Serpent battles & season re-skins | New presentation treatments; run rules stay ordinary | Near zero |
| 3. Mastery trials | Authored per-dynasty skill challenges, cosmetic rungs | Low, bounded |
| 4. Cosmetic lines | Items in the six shipped slots (Atelier, seasons, earned shelf, drops) | Low |
| 5. Chronicle & lineage presentation | History, pedigree, records surfaces | Low |
| 6. Training exercises | New drills in the rewardless Lab | Low |
| 7. Population-gated social layers | Pre-built: Gauntlet, playoffs, gifting — opened, not built | Flag flip |

Content that varies *within* an existing mechanic is nearly free; content that adds a
mechanic is permanently expensive for one person. The slots are all of the first kind.

### 12.2 The caps — what never grows

| Quantity | Cap | Notes |
|---|---|---|
| Currencies | **1** (DNA) | Premium currencies: **0**, forever |
| Daily ritual surfaces | **1** (Signal) | Ascension is its monthly aggregation view, not a surface |
| Recurring clan surfaces | **1** (Serpent Battle) | Aggregates normal runs; never a queue |
| Progression pillars | **3** | Mastery, Lineage, Discovery |
| Public numbers | **2** | Score, Depth |
| Dynasties | **3** | A fourth is an amendment, argued from a year of live data |
| Active gene pool | **≤16**, floor 12 | Additions swap, never stack |
| Game modes | **3** | Run, Signal, Training; battle is an automatic overlay |
| Commercial SKU archetypes | **4** | Keeper, Atelier, Season, Patronage (Founding + Patron Packs) |
| Results layers | **3** | With exactly 1 recommended next action |
| Taps: open→board / results→rerun | **≤3** / **≤2** | Run Setup included; REPLAY skips setup |
| Commercial surfaces per screen | **≤1**; 0 in-run, 0 on Results | Rule 7 |

A cap that is written down is a cap that survives a bad retention month.

### 12.3 The dilution test — binding on every proposal

All eight must hold:

A. Serves Mastery, Lineage, or Discovery — named.
B. Lands in a §12.1 slot — named.
C. Increments no §12.2 cap.
D. Adds zero mandatory taps before a run or after Results (Run Setup is the one
   sanctioned exception, §5).
E. Survives Rule 5: ignorable without destruction — it may pull, it may never punish.
F. No euro can reach any number it computes (survives Rule 3).
G. States its permanent operating cost at current capacity (Rule 13).
H. Names the existing system that could not do the job (Rule 12).

### 12.4 The pressure valve — the sanctioned response to a bad month

The moment will come when retention dips and a new mode looks like the answer. The
answer is written down now, in order:

1. **Vary within slots 1–2:** a run of sharper Signal conditions, a special Serpent
   week (themed hunt, flavor event — content, not mechanics).
2. **Ship a mastery-trial batch** (slot 3) — veteran variety without permanence cost.
3. **Fix the top legibility complaint** — the audit's evidence says confusion, not
   scarcity of systems, is this product's retention risk.
4. **Seed a new campus** (§9.6) — a marketing sprint, because a retention dip at
   small N is usually an acquisition problem wearing a retention costume.
5. **Only then** convene an amendment review.

**Forbidden as retention responses, always:** a new mode, a new currency, a new daily
surface, punitive streak resets or any second streak layer beyond the Daily Take,
urgency commerce, push volume. This list exists because the panic will feel like an
exception. It is not an exception; it is the failure the owner watched happen to a
game they loved.

---

## 13. The kill list

The game is over-built, not under-built. Each entry names the system, the action, and
the preservation path for player data, ownership, and history. Pre-launch and
Stripe-in-test-mode means no purchases to honor — this is the last cheap moment.

| # | System (state) | Action | Preservation path |
|---|---|---|---|
| 1 | **Energy as shipped** — start-gate, 20-min client-influenced drip, stipend, purchases, Free-Play split (GT §3.3) | **Redefine (§8.6, v1.5):** no gate or commerce; server-time hourly recovery to cap 6; deliberate 0–6 commitment; every normal run remains playable | Historical charge columns retained for audit; new balance and session snapshot are authoritative |
| 2 | Energy SKUs ×3 + Starter/Dynasty bundles ×2 | Delete before any live key | Nothing to preserve (test mode) |
| 3 | Premium as shipped (false Season-Pass claim, inert queue perk) | Replace with Keeper (§10.2); truth-pass `premium.ts` | No real subscribers exist |
| 4 | Streak DNA multipliers (global income stack) | Delete the global multiplier; the streak concept returns bonus-scoped as the Daily Take streak (§7.2, v1.2) | Longest streak → permanent Legacy Record; streak history seeds the Take streak |
| 5 | Collection set-bonus multiplier | Delete | None needed (no owned thing removed) |
| 6 | Clan-duel DNA multiplier | Delete | Duel history → Chronicle; rewards become heraldic |
| 7 | Offline passive DNA + client/root-provider Energy restore | Delete passive DNA and the client authority; **v1.5 restores only server-time Energy recovery** (§8.6) | World Report remains return news; recovery is automatic, capped, and claimless |
| 8 | Legacy 28-day calendar API (unreachable, still live — GT §9.8) | Delete route + RPC | Grant history stays in transactions |
| 9 | Dead config (GT §10: firstWinBonus, battlePass block, inactive contracts, stale docstrings, minMembers…) | Delete/correct in one sweep | Git history |
| 10 | Contracts (2/day, premium 3rd, claim ceremony) | Merge into Signal at its ship; retire RPCs | Contract history stays in transactions; Season 1 unaffected (lapses 09-07) |
| 11 | Achievements (18 tiers, duplicate language, non-atomic claim — GT §9.5) | Merge into Records via **one atomic migration**, settling all outstanding rewards in the same transaction | Earned achievements become permanent Legacy Record entries |
| 12 | Season 1 model (contract-fed XP meter) | Let Season 1 lapse as shipped; rebuild seasons per §7.4 in Phase 3 | Free-tier claims already granted; cosmetics permanent |
| 13 | Free Play mode | Delete — distinction dissolves with Energy | Training Lab is the practice surface |
| 14 | Weekly Anomaly mode | Absorb into the Serpent (its tech is the Serpent's substrate) | Anomaly personal bests → Chronicle |
| 15 | Clan Gauntlet + research tree + playoffs (built, reachable) | **Hide behind §9.3 population gates** | All state preserved; criteria public |
| 16 | Clan energy-bonus dead UI (button with no onClick) | Delete | — |
| 17 | Analyst: LLM narration + email | Retire LLM path; repurpose email to deterministic weekly settlement digest (§7.5) | Deterministic Analyst stays in Results L3 |
| 18 | Aim-system unlocks (score/games/breeding-gated) | Universalize as settings, day one | Unlock records → Chronicle trivia; no owned thing removed |
| 19 | Reroll tokens + lineage reroll RPC | Retire with deterministic breeding | Tokens convert 1 → 150 DNA in migration |
| 20 | Generation 4–50 as shipped (cost + pedigree, no decisions) | Reforged as **Ascendance** (§8.2, v1.2): uncapped, asymptotic Yield curve, visual evolution stages | Existing Gen>3 snakes keep their generation and enter the Ascendance curve at it |
| 21 | Generation-based "skill brackets" | Delete | — |
| 22 | Victory bonus, welcome-back modal, notifications, Discord OAuth plumbing, Chronicle, Records, cosmetics substrate, Training, offer-gravity | **Keep** | The spine survives |
| 23 | `shed` (every 25 foods, tail resets to length 8) — v1.4, Rule 15 | **Delete.** Its Launch-Ten slot goes to `static_charge` [H] | The catalog's strongest safety valve — and the reason INFUSE was never a real cost |
| 24 | `splice_regenesis` and `splice_molted_rebirth` — v1.4 | **Delete** (both are `shed`'s children by parentage; splice catalog 10 → 8) | Two recipes; the only two that carried an absolute reset forward |
| 25 | Length-resetting revives — Phoenix, Styx, Molted Rebirth, Second Sun (all truncate to 8 through one engine funnel) — v1.4 | **Convert:** keep the 3-cell rewind, delete the truncation, add a short phase window so a full-length snake can escape the jam that killed it | The clean-slate second chance; revives stop being a difficulty rollback |

**Note on row 25, recorded because it will be re-raised.** During the 27 July
playtest the owner found the length-8 revive *fair on CYBER*, on the grounds that
"speed isn't decreased" — i.e. it did not rewind the thing that was actually
killing them. That observation was correct **for CYBER as it shipped**, where the
board is irrelevant: a good banked run ended at 13.5% occupancy and the all-time
ceiling is 21.8%. It stops being correct once CYBER's arena closes
(`docs/game/TERRAIN_AND_CYBER.md`), because free space then becomes CYBER's clock
too, and a length reset rewinds it exactly as it does on PRIMAL. Rule 15 therefore
holds on all three dynasties — but only *after* the redesign, which is why it read
as wrong in the game the owner was playing at the time.
| 26 | FERAL tier 2 "Molt" as shed-based — v1.4 | **Replace the effect** (its shed *is* the effect, so it cannot be re-priced). `heartwood`, which triggers on shed events, re-targets with it | The proportional-shed identity WP-2.09 built |

Defect fixes riding the same phases (not kills): leaderboard eligibility + myRank
identity (GT §9.3), stale-session lifecycle (GT §9.6), QA-cohort separation
(GT §13).

---

## 14. Sequencing

Dependency-ordered. "Launch" means the first campus seeding — not a press moment.

**Phase 0 — Truth and subtraction** *(before anything else)*
Kill-list items 1–9, 13, 16, 18, 21 (one large subtraction-and-redefinition release;
item 1 is the §8.6 Energy semantic migration (now superseded by v1.5 commitment);
items 19–20 move to Phase 1 with the
lineage rework so breeding is never left random-without-rerolls) · atomic
achievements→Records migration (item 11) · leaderboard eligibility + identity fixes ·
stale-session lifecycle · QA/dev cohort flagging out of all public surfaces · web
hygiene: landing meaning, icons, OG images, robots/sitemap, **share-card URL fix**,
UTM/referrer + funnel-stage instrumentation (§11.5) · **Dispatch waitlist** on the
landing page · Snake Query Engine base (/play intent page, structured data). *Gate to
proceed: economy paths audited post-subtraction; boards show only real, ended,
validated runs.*

**Phase 1 — The two numbers** *(the product becomes this document)*
Results → three layers with one next action · **World Serpent Clan Energy Battle**:
ordinary positive-Energy runs → best-five Depth, clan-of-one, founding flow,
settlement cron, settlement card ·
**World Signal MVP**: daily seed, objective choice, auto-settle, share grid +
**minimal challenge links** (seed + target score); contracts retire at cutover
(item 10) · **the Daily Take** (§7.2) · **the Run Setup page** (§5) · clan cap 12 +
directory-shows-alive-only + Anomaly absorbed (items 14–15) · **lineage rework**
(items 19–20): deterministic draft, reroll retirement/conversion, **Ascendance**
(§8.2) · share URLs for all artifact classes · settlement auto-post tooling
(§11.6). *Gate: a clan of one completes a full Signal→Energy Battle→settlement→share cycle
untouched by the developer.*

**Phase 2 — First campus (launch)**
Seed 4–6 founding clans from the owner's reach (§9.6) · **Ascension live** (absolute
thresholds — campus 1 gets the monthly arc from day one) · **World Report** (§7.5) ·
the contract/manifesto page · handle-claim lead ladder live (§11.7) · Founding
Keeper as the only live SKU (its meaning requires launch-day availability; §12.11
removals all landed in Phase 0, so the pre-live-Stripe checklist below is already
green) · the weekly operating rhythm begins (§11.8) · PWA manifest + install prompt
after habit · push opt-in, week two. *Gate to Phase 3: one campus with ≥1
self-sustaining clan and readable W4 retention.*

**Phase 3 — Commerce**
Keeper (repriced, renamed, truthful perks) · Atelier on the shipped 022 substrate
(`price_eur` + `stripe_price_id`, NULL = earned-only default) with **monthly
additions** (§10.5) · Season system v2 (non-expiring, play-fed; first Chronicle
Season ships here and fulfills Founding Keeper's inclusion) · **Patron Packs**
(§10.2) · **gifting + Broodmarks** (§10.5, §11.5) · deterministic replays + ghost
racing (§11.3) · campus 2, entered with spike surfaces aimed at it. *Gate:
retention by payer status readable.*

**Phase 4 — Depth of field**
Earned shelf (§10.3) · mastery trials (slot 3) · bought-frames/earned-contents
cosmetic line · lineage expression (per-snake colorways inherited by descendants) ·
clip export + **creator seeds** (§11.3) · population gates evaluated for
Gauntlet/playoffs · official Discord at its population gate (§11.6) · campus N, per
§9.6 discipline · paid UA if and when §10.8's gate opens.

**Phase 5 — The pocket (post-release)**
Native apps (iOS/Android), gated on proven retention and the §10.8 milestone bands
[H]. The payoff: store discovery, true push, home-screen permanence. The cost, faced
in advance: store commissions and IAP rules change the commerce math and get their
own amendment-level plan *before* submission — the §10 rules are platform-invariant,
and if a store's rules would force violating them, the answer is the hybrid
web-purchase route, not the violation. The web version remains canonical: one
account, one server authority, everywhere. The gameplay ships identical — the app is
a better door to the same game, never a different game.

**Before any live Stripe key, invariantly:** energy commerce deleted · bundles
deleted · premium claims true · prices gross-EUR with FAGG §10 consent and §16
withdrawal honored · the §10.6 list audited against every purchase surface.

---

## 15. The Overturn Record

Locked or shipped decisions this document reverses, each with what is given up.

| # | Reversed decision | Ruling | What is given up |
|---|---|---|---|
| 1 | `MONETIZATION_DESIGN.md` v1.0 (LOCKED): progression perks, ~1.7× guardrail, €9.99 Premium | Overturned in full (§10.1); document retired, header to point here | The most reliable F2P revenue class; 5 SKUs; a designed, implemented, internally consistent system; ~60% per-subscriber price cut on an untested bet |
| 2 | Energy as economy spine (shipped) | Deleted, no interim rename, no A/B | The scarcity return-driver and pacing lever; the audit's own "test first" caution (the honest launch *is* the test) |
| 3 | Streak multipliers (shipped) | Deleted | Consecutive-day pull |
| 4 | Collection set-bonus (shipped) | Deleted | Completion's economic pull |
| 5 | Clan-duel DNA bonus (shipped) | Deleted | The only extrinsic clan reward (replaced heraldically) |
| 6 | Offline passive DNA + 48h premium perk (shipped) | Deleted | "Welcome back" claim dopamine; a Premium differentiator |
| 7 | Random breeding: variant coin-flip, trait rolls, lineage reroll (shipped) | Deterministic draft (§8.2) | Slot-machine surprise; reroll-token sink; repeat-roll engagement |
| 8 | Generation 4–50 as progression (shipped) | Mechanical cap at Gen3; pedigree beyond | The infinite implicit grind |
| 9 | Season 1 model: contract-fed, expiring (live) | Non-expiring, play-fed seasons (§7.4) | In-season urgency |
| 10 | Aim unlocks as rewards (shipped) | Universal settings | Unlock-moment rewards; a "progression" surface |
| 11 | Contracts incl. premium 3rd slot (shipped) | Merged into Signal | Pick-ritual agency; a Premium perk |
| 12 | Achievements as parallel system (shipped) | Merged into Records | A separate reward surface (and its non-atomic claim bug) |
| 13 | 28-day calendar (shipped, unreachable) | Deleted | Nothing — it was an unreachable faucet |
| 14 | Free Play as second-class mode (shipped) | Deleted | Nothing — every run is now first-class |
| 15 | Weekly Anomaly as separate mode (shipped) | Absorbed by the Serpent | A standalone surface |
| 16 | Clan scope: 50-cap, all layers open (shipped) | 12-cap, clan-of-one first-class, layers population-gated | Visible feature breadth at launch |
| 17 | Analyst LLM + email digest (shipped, env-gated) | LLM retired; email deterministic-only | Narrative flourish; LLM differentiation |
| 18 | **Length as a spendable cost** — INFUSE −4 segments, Ouroboros −3/bite, Thick Hide −5, `shed`, every revive (all shipped) | **v1.4, Rule 15: inverted.** INFUSE costs **+8 [H] growth**; the shed family is killed; survival never shrinks. **Owner ruling 27 July 2026. The seven-day cooling period required by §4 was WAIVED by the owner the same day** — recorded here because §4 requires the sign-off to live in this record, and because a self-waiver of a self-imposed brake should be visible rather than silent. *Grounds:* the amendment is pre-launch with no audience, nothing built on it has shipped, and it rests on a day of the owner's own playtesting rather than on argument — 144 production runs showing a median of 8% board occupancy, plus a 26-minute PRIMAL run and a banked CYBER run generating the evidence directly. *What the waiver gives up:* the deliberate delay that exists precisely to catch same-day enthusiasm. If Rule 15 proves wrong in the lab, it is reversed by the same procedure and recorded here again | The whole "spend your body" grammar as originally written, and the emergency valve a shrinking snake gave a player in trouble. Kept in substance: body is still the price of power — it is now paid by *growing* rather than by shrinking, which is the only version that costs anything |
| 19 | **Per-dynasty Score parity by identical curves** (shipped: PRIMAL and COSMIC both `() => 1`) | **v1.4: differentiated shapes with comparable integrals** (§6.1). The measured consequence of "identical" was a ~10× Score-per-minute gap in CYBER's favour, so parity of *formula* was producing gross disparity of *outcome* | The simplicity of one curve for everyone; a small ongoing balance surface (three integrals to keep in tolerance) |
| 20 | **"PASS pays body length"** (proposed in the redesign analysis, never shipped) | **Withdrawn before implementation.** It was derived when INFUSE *paid* length; once Rule 15 inverted the sign, a PASS that granted length would be a reward denominated in the currency Rule 15 outlaws. PASS instead pays quoted DNA plus a better next offer | An elegant single-axis portal (spend body ↔ gain body). Recorded because the idea is attractive and will be re-proposed by someone who has not read this row |
| 21 | **Fixed six-charge UTC-daily envelope; no timed recovery or carryover** (v1.3) | **v1.5 Energy Commitment:** server-time +1/hour to cap 6, partial/offline recovery, deliberate 0–6 start commitment, nonlinear harvest curve (§8.6). Explicit owner ruling, 29 July 2026; the seven-day cooling period is waived by that greenlit implementation order | The clean bounded-daily economy and “no timers” simplicity; active players can recover materially more than six/day; a visible timer returns. The waiver gives up a deliberate pause before changing a constitutional pacing rule, so economy telemetry and a reversible config curve are mandatory |
| 22 | **World Serpent as a separate weekly, no-Energy, cooperative best-three mode** (v1.3–1.4) | **v1.5:** Serpent is a 3-day Clan Energy Battle automatically fed by positive-Energy normal runs; best five per member; 1-day intermission; historical weeks remain immutable | The universal cooperative boss, a calendar-week artifact, unlimited unrationed attempts, and full participation in three runs. Gained: one coherent normal-run loop where personal economic stakes and clan responsibility are the same decision |
| 23 | **Rule 8 forbids all thresholds and clan-vs-clan reward mathematics** | **v1.5 narrow amendment:** a player may privately see their own fifth-best replacement line; paired aggregate outcomes grant victor vs participant/stalemate honors. No teammate detail, officer lever, economy reward, minimum, or paid route is introduced | The absolute “no thresholds anywhere” sentence and purely self-referential clan outcome; accepted to create the owner-directed mastery pressure while preserving privacy and non-power rewards |

**v1.1 amendments — v1.0 positions reversed by ratified Package A1** (25 July 2026;
full record in `docs/CONSTITUTION_AMENDMENTS_PROPOSED.md`):

| # | v1.0 position | v1.1 ruling | What is given up |
|---|---|---|---|
| A1 | No individual league (Duolingo-coercion caution) | Ascension: monthly, promotion-only, threshold-based (§6.1) | The "two rhythms" purity; some players will feel tier pressure |
| A2 | Price ladder tops at €24.99 once | Seasonal Patron Packs to €99.99 [H] (§10.2) | The €6.99-ceiling simplicity story; three-digit-SKU criticism accepted |
| A3 | Four commercial events/year; gifting post-gates | Monthly Atelier additions; gifting Phase 3; owned-media clarification (§10.5) | The quarterly-silence purity; gift fraud/refund surface |
| A4 | Revenue as byproduct; "not paid UA"; solo-forever framing | §10.8 The Company: KPIs, bands, UA gate, capacity/identity-bound caps | The byproduct framing's moral simplicity |
| A5 | Sharing = static artifacts | Challenge links, replays, ghosts, clips, creator seeds (§11.3) | The package's largest engineering line-item |
| A6 | Return summary deferred | World Report at launch, tone-bound (§7.5) | Phase-2 effort spent on presentation |
| A7 | Memoryless rival pairing | Rivalry memory + Ledger (§9.4) | Slightly less optimal weekly symmetry |
| A8 | Acquisition as thesis | The Acquisition Engine: funnel, channels, lead ladder, rhythm (§11.5–11.8) | §11 becomes a machine to maintain, not a statement |

**v1.2 owner rulings — v1.1 positions reversed (25 July 2026):**

| # | v1.1 position | v1.2 ruling | What is given up |
|---|---|---|---|
| B1 | No run-start menus; ≤2 taps to board | Mandatory Run Setup page, preset, one-tap START; ≤3 taps (§5) | The purest cold-start funnel; the activation cost is measured (§17.22) with first-run auto-skip as the fallback |
| B2 | Gen3 mechanical cap; Gen4+ pedigree only | Ascendance: uncapped generations → asymptotic per-snake Yield curve, visual evolution (§8.2) | The audit's P7 "fake depth" caution; the newcomer gap is bounded (~1.3×) instead of eliminated |
| B3 | No streak economies; auto-settle purity, zero collect moments | Daily Take + tier-cooling streak, bonus-scoped; one collect tap (§7.2) | The no-loss purity; a bounded streak-churn risk accepted, with tier-cooling as the mitigation |
| B4 | "Anti-obligation" positioning; enumerated free guarantees in §3 | "Fair pull, no predation" positioning; §3 slimmed to the test sentence (owner edit) | The loudest differentiation claim; the test sentence now carries the free promise alone (§17.25) |

**v1.3 owner ruling (25 July 2026):**

| # | Prior position | v1.3 ruling | What is given up |
|---|---|---|---|
| C1 | Energy deleted outright (v1.0, kill #1); economy pacing left open (§17.2) | **Energy redefined** (§8.6): never gates play, never sold; 6 daily charges make runs rich, lean runs floor at 25%; rituals always full-fat; the pacing question closed by mechanism | The unlimited-full-yield simplicity; a meter returns to the game's surfaces; "no energy" leaves the marketing line ("no energy paywall" replaces it) |

**v1.5 owner rulings (29 July 2026):** rows 21–23 above are the complete
amendment record for Energy Commitment and automatic Clan Energy Battles. They
supersede C1's refill cadence and the separate best-three Serpent mechanics while
preserving its never-gates and never-sold constraints.

**Where this document rules against the audit** (recorded for honesty): energy is
deleted outright rather than A/B-tested first (§15.2); clans launch as clan-of-one
Serpent hunters rather than identity-plus-hidden-everything — the "empty social
spaces" claim is folklore [F] and the design makes emptiness structurally impossible
instead of hiding from it (§9); the deterministic weekly email is kept rather than
deferred (§7.5); the Signal ships as minimal Model B with contracts merged at birth
rather than A-then-B (§7.2); fast collection completion is accepted rather than
re-paced (§8.4); and Keeper's Chronicle perk is narrowed so free identity is never
truncated (§10.2).

---

## 16. What this document asks of its readers

A 2029 proposal is checked in order: does it serve a pillar (§2)? Does it break a
rule (§4)? Does it fit a slot under the caps (§12)? Does it pass the dilution test
(§12.3)? What does it cost one person forever (Rule 13)? And one evaluation lens
that is deliberately *not* a gate: what moment of it is worth sharing — and if none,
say so plainly (features are allowed to be quietly excellent; a mandatory share
angle breeds gimmicks). If it survives all five, it
was probably worth proposing — and if it dies at one of them, this document has done
its job: the answer existed before the question was asked, which is the only way
SupaSnake stays *one game* while the company around it grows.

---

## 17. Open questions — with the tests that settle them

Everything here is below the escalation bar and above the guess bar. Each is
deliberately undecided pending data.

1. **Score/Depth conflation.** *Risk:* the two-numbers pattern is shipped-but-
   untheorized; players may read Depth as "the real ranking." *Test:* week-2
   comprehension interviews + mis-navigation telemetry between the two surfaces;
   act if >20% conflate. *Mitigation already in design:* distinct names, units,
   screens.
2. **Energy Commitment economy calibration** (v1.5 — recovery and commitment are
   decided; these numbers are dials). Cap 6, 3,600-second recovery, curve
   1/2.2/3.6/5.2/7.2/10, lean 25%, meter at 4 banks. *Test:* DNA/day and
   effective DNA/Energy across once-daily, 2–3-session, and highly active cohorts;
   commitment distribution; bank timing and crash rate by commitment; collection,
   breeding, and Ascendance completion; stock time-at-cap and session return cadence.
   First retune recovery interval or curve—not hidden base payouts—and publish the
   change. Specifically test whether successful 6-Energy runs inflate progression
   before considering ×12.
3. **Keeper price (€3.99/€34.99).** *Test:* post-Phase-3, measure conversion ×
   tenure × refund against the revenue-per-subscriber cut; revisit only with ≥3
   months of payer-status retention data.
4. **Best-five Clan Energy cap.** *Test:* eligible attempts/player/cycle,
   replacement rate, whether effort clusters exactly at five, and whether the fifth
   threshold creates mastery pressure or obligation. If most players cannot fill five
   despite recovered stock, test best-four; do not increase the cap to reward volume.
5. **Signal objective count (1 vs 3).** *Test:* A/B open-rate, completion, and
   next-day return across the first two campuses.
6. **Clan size 12 / soft-full 6.** *Test:* pairing symmetry quality and intra-clan
   contribution spread at campus scale; the cap moves before the structure does.
7. **Population gate numbers (25 clans / 16 clans).** *Test:* when approached,
   simulate pairing viability from real activity data; criteria publish before the
   flag flips.
8. **Organic-loop viability.** *Test:* share CTR and invite conversion across two
   campuses (§11.2); failure triggers the embedding fallback, not paid UA.
9. **Serpent presentation depth.** *Question:* does the hunt need a rendered serpent,
   or does a strong settlement card carry it? *Test:* share-rate and week-2 Serpent
   participation before investing 3D budget.
10. **Push/email incremental value.** *Test:* opt-in rates and W4 delta with a
    holdback cohort; kill either channel if the delta doesn't justify its support
    cost.
11. **Devoted-niche vs mass-market ceiling.** Deliberately unresolved (§11.1): the
    first two years are identical under both ambitions. *Test:* campus-3-era
    retention and K-factor decide whether the expansion cadence chases breadth or
    depth — with data, not taste.
12. **Which 14 genes.** The criteria are binding (§8.3); the roster is an
    implementation-spec decision requiring per-gene comprehension and pick-rate
    reads that the three source documents do not contain.
13. **The activation event.** First BANKED extraction vs first completed run as the
    optimized-for aha [H]. *Test:* which early event best predicts D7 across the
    first two campuses; onboarding tunes to the winner.
14. **Ascension calibration.** K = 10 and the absolute tier thresholds. *Test:*
    scoring-day distribution (if p75 of enrolled players log <10 Signal days,
    lower K); threshold retune each cycle until promotion rates stabilize;
    conflation check folded into §17.1.
15. **Patron Pack tiers.** €19.99/49.99/99.99 and per-season cadence. *Test:*
    tier take-rates and monetization sentiment read together; any sentiment drop
    attributable to pack presentation triggers a presentation fix before a price
    fix.
16. **Broodmark conversion.** Activation-gated grant timing and abuse rate.
    *Test:* invite→activation conversion, self-referral attempts caught, mark
    visibility's effect on invite volume.
17. **Challenge links vs static grids.** *Test:* click→play→signup conversion by
    share type; if links don't outperform grids, the ghost-racing investment
    re-prioritizes.
18. **World Report lift.** *Test:* reactivation rate of ≥7-day-lapsed players with
    a no-Report holdback; tone audit quarterly against the binding rule.
19. **Snake Query Engine compounding.** *Test:* quarterly impressions/clicks on
    the intent surface; investment stays flat unless the curve bends.
20. **The operating rhythm's honesty.** *Test:* the operator logs actual weekly
    marketing hours for one quarter; if the ritual consistently exceeds the
    ceiling, cut scope in §11.8 before cutting dev time.
21. **Native-app timing and economics** (Phase 5). *Test:* opened only after
    retention is proven and a §10.8 band funds it; the go/no-go weighs store
    commission impact against measured discovery and push lift, and the commerce
    reconciliation plan (store rules vs §10) must exist before any submission.
22. **Run Setup funnel cost** (v1.2). *Test:* arrival→first-input and
    results→rerun deltas after the setup page ships; presets must keep the added
    cost near zero for returning players. If first-visit activation drops
    materially, the very first run auto-skips setup entirely [H].
23. **Daily Take and streak calibration** (v1.2). Base 100 DNA; tiers 3/7/14/30 →
    ×1.25/×1.5/×2/×3; one-tier cooling. *Test:* D7/D30 lift versus the
    streak-break churn signature (players who miss a day and never return); if the
    cliff appears despite cooling, add a two-day grace before the first tier drop.
24. **Ascendance curve** (v1.2). +2% decaying toward ~+30%; cost steepening.
    *Test:* months-to-asymptote distribution and intra-clan Yield spread; retune
    so the p90/p10 member gap stays under ~1.4× [H] and the lane still feels
    endless (every gen visibly adds something).
25. **§3 contract presentation** (v1.2). The enumerated free guarantees were
    removed by owner edit; the test sentence carries the promise. *Test:* if trust
    sentiment or press framing weakens measurably, restore an abbreviated
    guarantee list on the public /contract page only, leaving §3 as edited.
26. **Time-to-first-pressure** (v1.4, **ruled 29 July 2026**). The Growth Lab
    answered the shape question but exposed that a shared growth curve erased
    dynasty identity. Normal CYBER and COSMIC runs therefore grow **+1 per food**;
    speed and spatial restriction are their pressure clocks. PRIMAL owns fast
    early body pressure and then converges to classic Snake growth, indexed by
    modelled length rather than food count: **+4 below length 75, +3 below 96,
    +2 below 120, +1 thereafter**. Those thresholds are 18.75%, 24%, and 30% of
    the 20×20 board. Optional growth genes and INFUSE advance the downshift; they
    do not prolong a high-growth stage. *Test:* compare PRIMAL pressure onset,
    control at each threshold, and death occupancy against CYBER/COSMIC. Retune
    thresholds, not the dynasty ownership of the clocks, if the first stage is
    still too short or the +1 handoff arrives too late.
27. **The Rule 15 dials** (v1.4). INFUSE growth **+8**; Thick Hide **+8** on
    trigger; Ouroboros **+2** per bite; revive phase window **~12 ticks**. *Test:*
    lab telemetry — infuse-taken rate against run stage (if late-run infusion
    collapses to zero, the price is too steep); revive survival rate (if a revived
    run ends within ~5 foods, the window is too short to matter and the revive is
    decorative).
28. **The re-basing table** (v1.4; cadence ruled 29 July 2026). Gene offers use
    a dynasty-independent **6 ± 2-food interval, minimum 4**; Patient doubles the
    sampled interval. This clock is deliberately independent of body growth so a
    +1 dynasty can still form a significant build before pressure ends the run.
    The validator derives its honest-pick bound from the same cadence. Hold bonus
    lengths and window genes (`deep_roots`, `ancient_grove`, `midnight_oil`,
    `loan_shark`) remain governed by the wave's separate rebasing tests, not by
    offer cadence. *Test:* a
    representative 42-food run should see about seven cadence offers, enough to
    skip imperfect genes and still reach Expression/Apex or a setup; the six-slot
    cap must still make PASS meaningful, and `verifyOfferTrace` must stay clean.
29. **Ladder shape** (v1.4). Rung count [H: 6–8] and the rung list. *Test:*
    distribution of best rung per dynasty after four weeks; if >60% of active
    players sit at rung 0, the first rung is too expensive or too dull; if >40%
    reach the top, add rungs rather than re-tuning the existing ones.
30. **Score-curve integrals** (v1.4, §6.1). *Test:* simulate the three curves at
    the ruled terminus and hold total Score within ±10% across dynasties. If they
    cannot be brought into tolerance, escalate — do not mint a second board.
31. **Clan Energy Battle balance** (v1.5). *Test:* commitment mix among counted
    results; whether 6-Energy attempts become socially mandatory; share of top-five
    slots held by 1-Energy runs; attempt timing across all three days; final-day
    clustering; repeat-winner rate; victor/participant progression sentiment; and
    generation changes within a cycle. Progression remains unlocked unless real data
    shows unacceptable last-day dominance. Pairing bands open only after population
    supports them; do not normalize score or multiply it by Energy to cure a social
    perception problem.
32. **CYBER precision ceiling** (v1.4 D3, ruled 29 July 2026). The 200ms curve
    now decays by 0.02 per food and stops at 120ms (×1.67): food 30 reaches 125ms
    (×1.6), and food 33 reaches the floor. This replaces the prior 0.03/100ms
    curve whose ×2 terminal tempo felt reaction-dominated, while preserving
    acceleration across the same pressure horizon. *Regression test:* compare
    late-run steering errors, intentional portal/gene detours, deaths the player
    calls “my mistake,” and enjoyment. Do not tune from the HUD number alone.

---

*Ratified 25 July 2026; amended through v1.5 on 29 July 2026. The owner should be able to read this and recognize their own
game — better organized, with the avoided decisions made and priced. Where it is
wrong, amend it honestly: name the rule, pay the cost, record the overturn. What it
must never become is a document that is merely agreed with.*
