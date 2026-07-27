# The SupaSnake Product Constitution

**Version:** 1.4 · 27 July 2026
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
**v1.3 changelog (owner ruling):** **Energy, redefined** (§8.6) — the daily-economy
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
lineage, and a small clan's weekly hunt that notices when you get better.

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
and **Depth**, which measures the whole dynasty and resolves every week in a
cooperative hunt against the World Serpent, witnessed by a clan small enough that
every member is load-bearing.

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
     daily: WORLD SIGNAL (§7.2) · weekly: WORLD SERPENT (§7.3)
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
   path write a player-owned row downward?*

7. **Commerce stays in its district.** The store is reached by navigation, never by
   interruption. Zero commercial surfaces during runs and on Results. At most one
   commercial surface per screen elsewhere, never the primary action. No notification,
   email, or badge is ever commercial. *Reviewer: count the commercial surfaces on
   every screen; check the notification feed.*

8. **Clans never grade and never bill.** Participation pays proportionally — no reward
   thresholds, no pass/fail bars, no intra-clan reward mathematics, no officer lever
   keyed to a member's output, and no purchasable clan number. *Reviewer: can any
   member's reward change because of another member's number? Can money change any
   clan number? Does any UI give an officer a mechanical reason to evaluate a member?*

9. **Three pillars, two numbers, one calendar.** New work lands inside Mastery, Lineage,
   or Discovery; surfaces on Score or Depth; and schedules on the Signal (including its
   monthly Ascension cycle), the Serpent, or the season. A proposal that fits none of
   these is rejected or triggers a formal amendment. *Reviewer: name the pillar, the
   number, and the beat.*

10. **The Caps are law** (§12.2): one currency, zero premium currencies, one daily and
    one weekly surface, ≤16 active genes, three dynasties, four SKU archetypes, three
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
  setup surface — dynasty and snake, mode context, aim system, control scheme — with
  the primary START action always pre-configured from the player's last choices.
  First-time players see it fully preset: START is the only emphasized action, zero
  required configuration. Everything adjustable, nothing demanded. The law: open →
  LAUNCH → START → board, **≤3 taps**, and the setup page adds exactly one of them.
  From Results, REPLAY re-enters the run with the same configuration instantly
  (skipping setup); SETUP reopens the page.
- **The in-run presentation as shipped** (owner ruling, 25 July 2026): the board, the
  cockpit HUD, the control schemes, and the decision overlays are declared correct as
  built. They change only where a surrounding-system change forces it — an energy
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
Layer 2, the two numbers — Score, and Yield with its Depth contribution during Serpent
weeks. Layer 3, one collapsed progression digest, with exactly **one** recommended
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

**Depth** is Yield accumulated against the World Serpent (§7.3): the sum of a player's
best three Serpent runs in a week is their **weekly Depth**; a clan's weekly Depth is
the sum of its members'; **lifetime Depth** is monotonic and never decreases. Depth is
denominated in **segments** — how far into the Serpent's endless body the hunt
reached. "Depth 2,315" is this game's version of the number the owner improved every
week for two years, and it is built from everything the account has become: the bred
snake's lineage, the traits chosen at breeding, the genes known and picked well, the
mastery that unlocked them, and the piloting to bank it all.

**Depth answers: what is my dynasty worth when it is tested?**

Rules that keep the two numbers honest:

- Yield never appears on the Score ladder; Score never appears on Serpent surfaces.
  Different names, different units (points vs segments), different screens.
- Depth is compared to **your own history first** (weekly Depth vs your best week),
  the clan's history second (clan Depth vs clan best), and rivals third, only when a
  symmetric rival exists (§9.4).
- Money cannot reach Depth. This is load-bearing and is *only* true because §10 bans
  selling DNA, variants, genes, and anything else build-adjacent. The convergence
  metric and the monetization ruling are one decision wearing two hats — reverse
  either and the other collapses. This dependency is stated here so nobody "just adds
  a small DNA pack" in 2028.
- Depth has **no thresholds anywhere** — no reward bars, no minimum contributions, no
  completion state. Every segment counts, from every member, always (Rule 8). The
  Raid: Shadow Legends failure — hard damage floors below which effort pays nothing,
  which convert clans into performance reviews — is the single documented way this
  design dies, and it is prohibited at the rule level, not the tuning level.

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
| Daily | **World Signal** + the Daily Take | One seeded condition-set + choice of objective; first run pays the Take; Energy refills to 6 (§8.6) | The day's Take, its charges, and one streak tier — never anything owned; the day archives as practice |
| Weekly | **World Serpent** | One seeded hunt; Depth resolves Sunday 24:00 UTC | Nothing; best-3 means a 3-run week is full participation |
| Monthly | **Ascension** (§6.1) | League cycle on best-10 Signal scores; promotion-only | Nothing mechanical; fewer scoring days remain — the sports consequence, not a penalty |
| Quarterly | **Season** | Theme, curated modifier rotation, cosmetic track | Nothing; tracks never expire (§10.4) |

Ascension is the Signal's monthly aggregation view, not a new play surface — the cap
of one daily and one weekly play surface stands.

Day boundary: **00:00 UTC**, globally, displayed in local time with a countdown. Week:
Monday 00:00 UTC. One clock for the whole world; shared state beats local comfort
(decision 8).

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

### 7.3 The World Serpent — the weekly hunt and the home of Depth

The convergence mechanic. The strongest known home for an investment number is an
asynchronous cooperative boss; SupaSnake's boss is native to snake:

**The fiction.** Each week a World Serpent surfaces — an endless serpent, never
killed, only measured against. Clans hunt it by running under its conditions; every
segment of Yield feeds the hunt deeper into its coils. Sunday midnight UTC it
submerges, the hunt settles, and Monday's Signal carries the result. The name and
fiction may be art-directed freely; the mechanics below may not.

**Clan surfaces show totals, not per-member attempt counts (v1.4).** Rule 8 already
forbids thresholds, pass/fail bars and intra-clan reward mathematics, and the
Serpent honours all of it: best-of-three, no Energy cost, no DNA, no officer lever.
The pressure a member feels is nevertheless real, and it comes from one place — the
roster shipping every member's `depth` and `attempts`, so **a zero is visible to
teammates**. That converts a personal choice into a social debt, and the cost lands
on someone who did not choose it.

The owner's ruling on the daily (§8.6) is that withholding a reward from someone
who did not play is natural rather than punitive — and that argument holds for the
*individual* reward. It does not extend to the social one. So the clan card shows
the **clan total**, the viewer's **own** contribution, and nothing per-member.
Churn is contagious in guild data (Kawale et al., IEEE SocialCom 2009, on
EverQuest II: the probability of churn rises with the number of departed
neighbours), and a clan whose visible scoreboard pushes two members out becomes
likelier to lose the rest. *Reviewer for Rule 8 additionally asks: can a member see
another member's attempt count or absence?*

**The mechanics.**

- One seeded condition-set per week, same for all clans, drawn from the curated
  modifier pool (reusing the shipped weekly-Anomaly machinery — GT §5 — which the
  Serpent absorbs and retires).
- Any dynasty, the player's own equipped snake, full build active. Unlimited
  attempts — Serpent runs consume no Energy, and Depth always counts full-strength
  Yield regardless of charge state (§8.6); the DNA a Serpent run pays follows normal
  charge rules, so the hunt is never rationed and never farmable. **Best three runs
  count** — improvement, not volume, is the lever. A player with twenty minutes a
  week participates fully; the WoW "second job" failure mode is structurally
  excluded [H, §17.4].
- Personal weekly Depth = sum of best three Yields. Clan weekly Depth = sum of member
  Depths. Lifetime Depth = monotonic accumulation.
- Settlement is automatic (weekly cron — infrastructure pattern already exists). The
  Monday briefing leads with **you vs your best week**, then the clan vs its best
  week, then the rival comparison if one was paired (§9.4).
- Pays: the runs themselves already paid DNA; settlement adds cosmetic milestone
  progress on lifetime Depth, a Chronicle entry for records (personal best week, clan
  best week), and heraldic laurels for paired-week outcomes. **No DNA settlement
  bonus** — Depth is measured, not farmed; the daily bonus lane is the Take (§7.2),
  and doubling it here would re-inflate the economy.
- No thresholds, no minimums, no floors (Rule 8, §6.2).
- Surfaces at 8 banked runs — the ramp beat where builds become real (GT §6.2) —
  bundled with the clan-founding prompt (§9.2).

**Why a boss and not clan-vs-clan:** you fight the Serpent, not another clan. There is
no walkover when the population is tiny, no matchmaking symmetry to protect at N=1,
and a clan of one still has a real hunt every single week. Rivalry layers on top when
symmetry exists; it is dressing, never the load-bearing wall (§9.4). This is also the
documented lesson (AFK Arena's proportional guild boss vs the built-in inequality of
guild PvP).

**Solo-operability:** the Serpent's weekly content is a seed and a modifier draw.
Season themes re-skin it quarterly. Zero per-week authoring. One cron, one settlement
function, one panel. The MVP is genuinely small (§14, Phase 1).

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
Serpent weeks settled and how the clan fared, the rival's Depth delta, Ascension
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
  *supposed* to pay — the weekly hunt, where your clan is watching. Your snake gets
  stronger forever, and the place it shows is the place that counts.
- **Reroll tokens and the lineage reroll are retired** (nothing random remains to
  reroll). Held tokens convert to 150 DNA each (their old price) in one migration.
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

### 8.6 Energy, redefined — the daily harvest envelope

v1.0 deleted Energy outright; the owner ruled that the daily-economy grammar it
carried is worth keeping. What returns is the **pacing layer, not the paywall** —
the audit's own interim design ("never let it prevent ordinary play"), matured:

- **Energy never gates playing.** Every run always starts, always Scores, always
  ranks, always counts — Signal, Serpent, Ascension, Mastery, leaderboards. There
  is no second-class run and no Free Play tier.
- **Energy makes runs rich.** The day grants **6 charges [H]**, refilled to full at
  00:00 UTC — no drip timers, no overflow anxiety, no "come back in 20 minutes."
  One clean allotment per day. A charged run harvests **full DNA**; an uncharged
  run still plays and still counts everywhere, but harvests **25% [H]** — lean,
  never zero.
- **The rituals are always full-fat.** The day's Signal objective run and all
  Serpent attempts consume no Energy; Depth always counts full-strength Yield; and
  Mastery XP is computed from the full fold. Scarcity paces the *harvest* — never
  the hunt, the ritual, the ladder, or the record.
- **Energy is never sold, gifted, stipended, or touched by any SKU or perk**
  (§10.4 stands — money still cannot reach DNA, Yield, or Depth through it). It
  never accumulates, never carries over, and is not a currency — §12.2's cap of
  one currency stands.
- **The meter surfaces at 4 banked runs [H]**, with the rest of the ramp — a new
  player never meets scarcity before they have met the game.
- **What this buys:** the day has a shape — wake, Take, Signal, spend your six,
  hunt the Serpent, done for today; tomorrow it refills. Anticipation without a
  paywall, "my dailies are done" without a checklist, runs that are worth spending
  well — and a **bounded daily economy envelope** (~7 full-harvest runs plus a lean
  tail, ≈9–10k DNA on a committed day vs. unbounded before [H]) that makes
  collection, breeding, and Ascendance pacing *tunable*. The open question v1.1
  left (§17.2) is closed by this mechanism; its numbers are tuning dials.

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

What stays dead from the shipped system: the run-start gate, the 20-minute drip
and its dual-clock defects (GT §9.1–9.2 — one refill authority now), energy
purchases and the premium stipend, the €4-destroying claim path, and Free Play as
a second-class mode. What returns is the part the owner actually loved: a daily
allotment worth spending well, and a tomorrow worth waking up for.

---

## 9. The social layer and the cold start

The owner's highest-priority unsolved problem, and this document's headline design.
The owner's two years in Survivor.io names the mechanism precisely: *being part of a
group that is going somewhere, where my improvement matters to people other than me.*
The documented version of that mechanism is **interdependence with consequences for
specific named people** — and it is fully present at N=2. Headcount was never the
variable. Density of noticing is.

### 9.1 What clans are for

A clan is a witness, not an institution. It exists so that when your Depth beats your
best week, someone specific sees it happen and their number moved because yours did.
Everything else — heraldry, banter, rivalry, playoffs — is elaboration on being
noticed.

### 9.2 The clan design

- **Clan size: 1–12, soft-full at 6** [H] (overturns the shipped 50-cap and deletes
  the never-enforced minMembers:20 constant — GT §10). At six members, every member
  is visibly load-bearing in the weekly sum; at fifty, forty are wallpaper. Small
  clans also make symmetric pairing tractable at tiny population.
- **The clan of one is a first-class citizen.** A solo player's clan hunts the Serpent
  weekly, holds Depth records, appears in the directory, and gets paired when a
  symmetric rival exists. Mechanically this is already true (duel matchmaking accepts
  `member_count >= 1` — the brief's verified fact); this document makes it the design
  rather than an accident. The owner's "two clans of one person each" instinct is the
  correct foundation, structurally.
- **Founding flow:** at Serpent unlock (8 banks), one skippable prompt: found your
  clan (name it, pick preset heraldry) or join by invite code/link. Founding is one
  tap plus a name. There is no browse-empty-directory dead end: the directory shows
  only clans that hunted this week or last, so it is short and alive rather than long
  and dead. Total-population counts are never displayed anywhere.
- **Roster mechanics:** invite links are the only recruitment surface (§11.3 — the
  invite is the acquisition artifact). Leaving or merging clans carries your personal
  Depth history with you; clan records stay with the clan. Kicking exists as plain
  roster management, but the game never supplies a stat-gated tool, a minimum-Depth
  field, or any officer lever keyed to output (Rule 8).
- **Contribution display:** member contributions are visible — visibility *is* the
  witness mechanism — but never with cut lines, never with required minimums, and
  rewards never depend on intra-clan position. The display is additive ("Sans_Souci
  fed 2,315 segments"), not evaluative.
- **Moderation surface (solo-dev bound):** clan names filtered, heraldry preset-only,
  no free-text descriptions at launch, report path on every clan and handle. UGC
  surface stays this small until there is a population that earns more.

### 9.3 Degradation and scale — one design, three populations

- **N = 1 player:** your clan of one hunts the Serpent; the week resolves against
  your own best. The game is complete and honest — a measurement game, never an empty
  room.
- **N = 20 retained players:** three to six small clans; pairing produces real
  rivalry most weeks; the directory is short and fully alive. This is the complete
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

Twenty players split into one active clan and one lapsed clan would produce a
walkover, which is worse than no competition. So rivalry is never load-bearing:

- The **primary** weekly outcome is always self-referential — clan Depth vs the
  clan's best week. It cannot walkover, cannot embarrass, and works at every N.
- Rival pairing is a **layer**, activated per-week only when a symmetric rival exists:
  matched on size band and trailing-four-week activity band [H]. No symmetric rival
  this week → no pairing, no shame, the hunt still resolves.
- Paired outcomes pay heraldic laurels and Chronicle entries — never economy (the
  shipped clan-duel ×1.05 DNA multiplier is deleted, §13, closing the "clan
  contribution as economic pressure" door from the reward side too).
- **Rivalry has memory.** Pairing prefers the standing rival while both clans remain
  in-band [H]: head-to-head records (W–L, streaks, closest week, all-time margin)
  live in both clans' Chronicles, and a season-end **Rivalry Ledger** memorializes
  the year's duels. Sports leagues run on derbies — the *same* opponent, with
  history — and this is that, at zero content cost. Either clan may decline
  continuation at a season boundary, silently, no forfeit recorded; sustained band
  divergence dissolves a mismatch automatically (walkover protection stays primary).

### 9.5 Why the Hunt can never become the pressure to spend

The Survivor.io failure the owner named, closed at every link of the chain: money
cannot buy DNA, variants, genes, traits, or anything else that feeds Yield (§10);
therefore money cannot move Depth (Rule 3); therefore a clanmate's spending cannot
change the clan's number, and a member's wallet is invisible in the hunt. Best-3
bounds the time a member can be expected to give; proportional payment with no
thresholds means no member can cost anyone a reward; and the absence of officer
levers means nobody can be measured against a bar that doesn't exist. A clan can
pressure you to *play well*, which is the game, and to *show up three times a week*,
which is friendship. It cannot pressure you to pay, because there is nothing to pay
for that it could see.

### 9.6 SupaSnake's Harvard — the smallest population we can saturate

Facebook did not survive being empty; it scoped itself to one campus, saturated it,
and expanded campus by campus. The acquisition thesis and the first clans are the
same problem, solved by the same act:

- **Campus 1 — the owner's reach (~20–40 people).** Friends, colleagues, and — the
  richest vein — the owner's own Survivor.io clanmates of two years: people who
  already share the exact reference frame this game answers, with a real relationship
  to the founder. Formed into **4–6 founding clans, each with a captain who recruited
  their own members** — so the first stranger to arrive sees a short directory of
  genuinely alive clans with real weekly Depths, never an empty room. This is also
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
of any kind · objective counts, Signal or Serpent attempts · offline anything ·
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
| 2. Serpent weeks & season re-skins | New modifier draws, themed hunts | Near zero |
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
| Weekly surfaces | **1** (Serpent) | |
| Progression pillars | **3** | Mastery, Lineage, Discovery |
| Public numbers | **2** | Score, Depth |
| Dynasties | **3** | A fourth is an amendment, argued from a year of live data |
| Active gene pool | **≤16**, floor 12 | Additions swap, never stack |
| Game modes | **4** | Run, Signal, Serpent, Training |
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
| 1 | **Energy as shipped** — start-gate, 20-min drip regen, stipend, purchases, Free-Play split (GT §3.3) | **Redefine (§8.6, v1.3):** gate, timers, and commerce deleted; 6 daily charges pace harvest richness; every run is a real run | Columns and meter reused with new semantics; §9.1/§9.2 defects die (no purchases, single refill authority) |
| 2 | Energy SKUs ×3 + Starter/Dynasty bundles ×2 | Delete before any live key | Nothing to preserve (test mode) |
| 3 | Premium as shipped (false Season-Pass claim, inert queue perk) | Replace with Keeper (§10.2); truth-pass `premium.ts` | No real subscribers exist |
| 4 | Streak DNA multipliers (global income stack) | Delete the global multiplier; the streak concept returns bonus-scoped as the Daily Take streak (§7.2, v1.2) | Longest streak → permanent Legacy Record; streak history seeds the Take streak |
| 5 | Collection set-bonus multiplier | Delete | None needed (no owned thing removed) |
| 6 | Clan-duel DNA multiplier | Delete | Duel history → Chronicle; rewards become heraldic |
| 7 | Offline passive DNA + offline energy restore (root provider) | Delete | Replaced by the **World Report** (§7.5), Phase 2 — motion as news, never debt, no claims |
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
| 26 | FERAL tier 2 "Molt" as shed-based — v1.4 | **Replace the effect** (its shed *is* the effect, so it cannot be re-priced). `heartwood`, which triggers on shed events, re-targets with it | The proportional-shed identity WP-2.09 built |

Defect fixes riding the same phases (not kills): leaderboard eligibility + myRank
identity (GT §9.3), stale-session lifecycle (GT §9.6), QA-cohort separation
(GT §13).

---

## 14. Sequencing

Dependency-ordered. "Launch" means the first campus seeding — not a press moment.

**Phase 0 — Truth and subtraction** *(before anything else)*
Kill-list items 1–9, 13, 16, 18, 21 (one large subtraction-and-redefinition release;
item 1 is the §8.6 Energy semantic migration; items 19–20 move to Phase 1 with the
lineage rework so breeding is never left random-without-rerolls) · atomic
achievements→Records migration (item 11) · leaderboard eligibility + identity fixes ·
stale-session lifecycle · QA/dev cohort flagging out of all public surfaces · web
hygiene: landing meaning, icons, OG images, robots/sitemap, **share-card URL fix**,
UTM/referrer + funnel-stage instrumentation (§11.5) · **Dispatch waitlist** on the
landing page · Snake Query Engine base (/play intent page, structured data). *Gate to
proceed: economy paths audited post-subtraction; boards show only real, ended,
validated runs.*

**Phase 1 — The two numbers** *(the product becomes this document)*
Results → three layers with one next action · **World Serpent MVP**: weekly seed,
Yield→Depth, clan-of-one, founding flow, settlement cron, settlement card ·
**World Signal MVP**: daily seed, objective choice, auto-settle, share grid +
**minimal challenge links** (seed + target score); contracts retire at cutover
(item 10) · **the Daily Take** (§7.2) · **the Run Setup page** (§5) · clan cap 12 +
directory-shows-alive-only + Anomaly absorbed (items 14–15) · **lineage rework**
(items 19–20): deterministic draft, reroll retirement/conversion, **Ascendance**
(§8.2) · share URLs for all artifact classes · settlement auto-post tooling
(§11.6). *Gate: a clan of one completes a full Signal→Serpent→settlement→share week
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
2. **Energy envelope calibration** (v1.3 — the pacing *mechanism* is decided in
   §8.6 and is not open; these dials tune it). Charges 6/day, lean factor 25%,
   meter at 4 banks. *Test:* daily DNA distribution by cohort; collection,
   breeding, and Ascendance completion curves against churn; and whether the
   session-end feels like "done for today" (interviews) rather than "cut off."
   Adjust cap and lean factor first; the always-full rituals are never touched.
3. **Keeper price (€3.99/€34.99).** *Test:* post-Phase-3, measure conversion ×
   tenure × refund against the revenue-per-subscriber cut; revisit only with ≥3
   months of payer-status retention data.
4. **Best-3 Serpent cap.** *Test:* participation distribution; if p75 of active
   hunters play <3 Serpent runs/week, drop to best-2; if grinding clusters at
   exactly 3 with fatigue signals, consider best-2 as well.
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
26. **Time-to-first-pressure** (v1.4 — the one open ruling of the Redesign Wave).
    The measured defect is that pressure begins around minute eight, so the median
    run (8% board occupancy) never reaches the game. *Test:* the Growth Lab
    (`docs/ops/REDESIGN_WAVE.md` WP-3.02) ships three server-stamped growth
    profiles; the owner plays two runs of each per dynasty and rules. Candidate
    target: pressure at ~1:06, run ending near 3:12, from starting length 3 with
    growth +6 for foods 1–11, +2 through 31, then +1 per 6 to a cap of 8 [H].
    *This is decided by hands, not by the model* — the model is calibrated to one
    expert run on one dynasty and reproduces it to within 5%, which ranks
    candidates well and picks between them badly.
27. **The Rule 15 dials** (v1.4). INFUSE growth **+8**; Thick Hide **+8** on
    trigger; Ouroboros **+2** per bite; revive phase window **~12 ticks**. *Test:*
    lab telemetry — infuse-taken rate against run stage (if late-run infusion
    collapses to zero, the price is too steep); revive survival rate (if a revived
    run ends within ~5 foods, the window is too short to matter and the revive is
    decorative).
28. **The re-basing table** (v1.4). Every food-indexed dial in the catalog was
    authored for 150–180-food runs and now lives in ~48-food runs: offer cadence
    (`intervalBase` 20 → ~10), the validator's `MIN_FOODS_PER_PICK` (15 → ~8),
    hold bonus lengths (25/40 → ~35%/60% of terminus length), and the window genes
    (`deep_roots`, `ancient_grove`, `midnight_oil`, `loan_shark`). *Test:* offers
    per run should exceed the six-slot held cap — that is what makes PASS and
    BANISH real decisions rather than formalities — and `verifyOfferTrace` must
    stay clean at the new cadence.
29. **Ladder shape** (v1.4). Rung count [H: 6–8] and the rung list. *Test:*
    distribution of best rung per dynasty after four weeks; if >60% of active
    players sit at rung 0, the first rung is too expensive or too dull; if >40%
    reach the top, add rungs rather than re-tuning the existing ones.
30. **Score-curve integrals** (v1.4, §6.1). *Test:* simulate the three curves at
    the ruled terminus and hold total Score within ±10% across dynasties. If they
    cannot be brought into tolerance, escalate — do not mint a second board.
31. **Charge carryover** (v1.4, deferred from the D5 ruling). §8.6 says charges
    never carry over; the evidence on comparable systems suggests **bankability**,
    not purchasability, is what makes a cap read as generous — three franchises
    independently converged on an overflow bank and all read positive, while the
    one with no bank draws "disrespecting player time." *Test:* A/B a one-day
    carryover (ceiling 12) against the current rule on return rate after a missed
    day. The 25% lean tail may already be doing this work, which is precisely why
    it is a test and not a change.

---

*Ratified 25 July 2026. The owner should be able to read this and recognize their own
game — better organized, with the avoided decisions made and priced. Where it is
wrong, amend it honestly: name the rule, pay the cost, record the overturn. What it
must never become is a document that is merely agreed with.*
