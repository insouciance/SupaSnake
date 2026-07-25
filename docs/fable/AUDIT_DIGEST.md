# Game Director's Audit — Digest

**Source:** `docs/game/SUPASNAKE_PRODUCT_GAMEPLAY_METAGAME_AUDIT.md` (3,874 lines,
25 July 2026). Every factual claim in it was independently verified against code on
25 July 2026; three corrections are noted inline below.

**What was cut:** the "current behavior — confirmed" evidence blocks and system
inventories, which now live in `GROUND_TRUTH.md` with citations. **What was kept in
full:** every judgment, the daily-cycle research, the three daily-world models, the
removal candidates, the roadmap, and the ten open decisions.

---

## Executive conclusion

SupaSnake has the foundations of an excellent precision score-attack roguelite. Its
greatest risk is not insufficient content; it is **an oversized, fragmented metagame
obscuring an unusually strong core game**.

Recommended product identity:

> A premium precision roguelite built around survival, extraction, score mastery, and a
> personally meaningful snake lineage.

A solo-developed game cannot outproduce large live-service teams. It can outperform
them in clarity, craftsmanship, trust, and the way a small number of systems compound.

Highest-leverage direction:

1. Protect the immediate, premium core run.
2. Make **Mastery, Lineage, and Discovery** the three visible progression pillars.
3. Remove or merge reward surfaces that primarily create obligation.
4. Repair economy, analytics, and competitive integrity before adding content.
5. Consolidate daily engagement into one optional, gameplay-centered **World Signal**.

**Greatest long-term retention risk:** players become *administrators of their SupaSnake
account* instead of *masters of SupaSnake*. There are enough reward surfaces to generate
obligation, but not enough hierarchy to tell players what matters.

---

## Structural weaknesses

1. Too many systems compete for attention after a run.
2. Genome complexity exceeds what one developer can teach, balance, test, and maintain.
3. Breeding creates random outcomes and escalating generation numbers without
   proportional decision depth.
4. Energy, streaks, offline accumulation, contracts, seasons, achievements, Records and
   daily rewards produce overlapping return incentives.
5. Monetization claims do not precisely match implementation.
6. Competitive surfaces do not enforce a credible definition of fairness.
7. Production data is contaminated by QA and incomplete sessions.
8. Historical documents and unused configuration create competing versions of product
   truth. *(Addressed 25 July 2026: 20 documents archived; see `GROUND_TRUTH.md`.)*

## Resource assessment

| Resource | Role | Verdict |
|---|---|---|
| Score | Run performance, leaderboard | Essential |
| DNA | Currency for variants, breeding, rerolls | **Overloaded** |
| Energy | Gates reward-bearing runs; regenerates and is sold | **Conflicts with gameplay-first positioning** |
| Mastery XP | Dynasty-specific long-term progression | Strong foundation |
| Season XP | Parallel progression lane | Redundant lane |
| Reroll tokens | Random trait adjustment | Reinforces RNG management |
| Owned snakes | Collection, breeding stock, identity, passive economy | **Too many jobs** |
| Generation | Pedigree to Gen50 | Mostly status after Gen3 |
| Records tiers | Long-term achievement, identity | Strong, but duplicated |
| Legacy achievements | One-time goals with claims | **Redundant with Records** |
| Streak days | Return behavior, DNA multiplier | **FOMO-heavy** |
| In-run genes | Buildcraft, run variation | Valuable but overexpanded |
| Strain points | In-run build threshold | Valuable, hard to communicate |
| Body length | Survival resource and INFUSE cost | **Excellent tactical resource** |

**No new currency is required.** The product needs fewer reward surfaces, not another
abstraction.

---

# Core gameplay findings

### F1 — The core control loop is strong · Protect · High confidence
Movement is clear, responsive, immediately understandable, with a high skill ceiling.
This is the primary reason to return. Protect input semantics, board visibility, frame
pacing, latency. **Do not add run-start menus or mandatory loadout steps.**

### F2 — The three dynasties create real playstyle differences · Protect · High
Each changes how the player reads space and risk — more valuable than a larger roster of
statistically different characters. Polish and balance these three before adding a
fourth. Future variety should come from curated challenge conditions and mastery trials.

### F3 — Portal decisions are the clearest strategic differentiator · Protect · High
The portal converts a familiar survival game into an extraction decision, linking skill,
confidence, greed, build strength and account progression. Keep the decision centered
over the board with the simulation frozen. Improve consequence preview. **Never demote
it to a notification.**

### F4 — Gene decisions are core gameplay, not administration · P0 · High
They deserve to interrupt, because the player is still playing. Keep them as focused,
centered overlays with the simulation frozen. **Reduce the active pool** so each option
becomes recognizable and emotionally distinct.

### F5 — Tactical pause is valid; a conventional pause menu is not · P1 · High
Players pause because their snake is long or the position is dangerous; a large menu
obscuring that state defeats the purpose. Retain board-visible hold, clear resume
guidance, a subtle abandon control, and an explicit destructive confirmation.

### F6 — Buildcraft breadth has exceeded readable depth · P0 · High
34 genes at 6 held produce >1.3 million unordered six-gene combinations before dynasty,
pick order, strain thresholds, splices, heirlooms, INFUSE, surge, anomalies and seasonal
interactions. Progressive discovery delays exposure but does not solve mental-model
overload, balance-space growth, QA cost, or unpredictable interactions.

**Recommendation:** curate an active pool of ~12–16 genes. Preserve catalog records;
hide or rotate unproven genes; start with minor and expression thresholds; postpone most
apex and splice interactions until comprehension data exists. Add a permanent gene only
when it introduces a genuinely new *decision category*.

*A curated pool of 16 gives 8,008 six-gene sets — still deep, orders of magnitude easier
to teach, observe and balance.*

### F7 — Aim systems create competitive ambiguity · P0 · High
Players on the same leaderboard do not receive equivalent planning information, and one
unlock is gated on breeding (a DNA purchase). Accessibility options have become power
rewards. **Make all aim systems universal settings**, with one explicitly documented
ranked configuration.

### F8 — Results are overloaded · P0 · High
The emotional outcome of the run is diluted by administrative reporting, and nothing
signals which rewards matter.

**Recommendation — three layers:** (1) outcome and personal best; (2) score and secured
DNA; (3) one expandable progression digest. Show exactly **one** recommended next
action. Route secondary updates to the Chronicle or notification center.

### F9 — Long-term variety should come from mastery challenges, not gene additions · P1 · Medium
Permanent content accumulation makes the game harder to learn, balance, communicate and
support every season. Build veteran variety from curated modifiers, standardized
Signals, advanced Training exercises, mastery trials, personal-best conditions and
dynasty challenges. **Use existing mechanics in new combinations before creating
permanent ones.**

### F10 — Competitive integrity is incomplete · P0 · High
Require: `ended_at` present, `validated = true`, non-Free-Play, compatible content
version, standardized assist configuration, and one qualifying result per player.
Replace generation-based "skill brackets" with score percentile, mastery trials, or no
brackets until population supports them.

*Verification correction: Free Play is already excluded from the boards. The other four
gaps are confirmed.*

**Core gameplay verdict:** the core does not need reinvention. It needs protection,
clearer consequence communication, curated buildcraft, better result hierarchy, and
credible competition. The highest-value core feature is not a new mode — it is making
every existing run more understandable and every high score more trustworthy.

---

# Progression findings

**Structural diagnosis: early avalanche, late plateau.** Systems become visible over a
short period, then long-term movement collapses into large XP totals, collection
completion, higher generation numbers and repeated seasonal tracks. Breadth arrives
before the player has a stable reason to care about any lane.

**Recommended spine — only three concepts stay prominent:**

1. **Mastery** — how skilled am I with this dynasty?
2. **Lineage** — what is special about my snake and its history?
3. **Discovery** — what new run decisions have I learned to use?

Daily play should reinforce those three, not become a fourth tree.

### P1 — DNA has too many meanings · P0 · High
Keep DNA as the only spend currency but reduce its jobs: remove passive attendance and
collection multipliers, price deterministic choices instead of random rerolls, stop
adding faucets, and make payout primarily reflect successful play.

### P2 — Energy sells relief from friction · P0 · High
The product promises immediate play, then makes meaningful progression depend on waiting
or paying. Free Play becomes a second-class version of the core game.

**Preferred:** remove Energy; let every valid run progress; monetize identity and
cosmetics. **Interim:** rename to Ranked Charges, use it only for an additional reward
bonus or official competition, and never let it prevent ordinary play or mastery.
Run a controlled no-Energy test **before commerce launches**.

### P3 — Energy restoration has competing authorities · P0 · High
Establish one authoritative regeneration timestamp; remove Energy from offline claims;
make all clients display server-returned state.

### P4 — Collection quantity is economically rewarded · P0 · High
Accumulation improves future acquisition independently of play quality, and paid
collection accelerates collection-derived bonuses. Remove DNA-per-owned-snake and
complete-set multipliers. Collection rewards should be visual, historical, expressive,
optional play variety, and profile prestige.

### P5 — Variants lack sufficient identity · P1 · High
Thirty variants create breadth but not thirty emotional identities; repeated naming
patterns and generic rarity tiers replace memorable identity. Curate ~9–12 visibly
distinctive front-facing variants, preserve all ownership, hide generic filler from
primary discovery until it earns a visual, lineage or narrative identity.
**Make the player's selected snake feel like a character, not a catalog row.**

### P6 — Breeding is more random than strategic · P0 · High
Players manage odds rather than make lineage decisions, and because paid bundles contain
DNA, randomized outcomes are indirectly monetized. Replace random inheritance with
visible parent contribution, a bounded trait draft, a clear sacrifice or trade-off, and
a **deterministic preview before payment**. No material post-payment outcome should be
hidden.

### P7 — Generation 4–50 is fake depth · P1 · High
Gen3 unlocks a second trait slot and a lineage benefit; 4–50 add cost and pedigree
without proportional decisions. Cap mechanical lineage progression at Gen3; preserve all
higher generations as pedigree and history; use them for Chronicle prestige, visual
marks, or ancestry depth.

### P8 — Mastery is the strongest long-term lane · P1 · High
It links account progression to competent play and gives players an identity. Make it
the visible account spine. Replace some permanent gene unlocks with mastery trials,
cosmetic snake evolution, titles, Chronicle chapters, profile frames, training
challenges.

### P9 — Seasonal progression adds permanent complexity · P1 · High
A season simultaneously creates time pressure and permanently expands the balance
surface. Seasons should provide a visual theme, curated existing modifiers, cosmetics,
archived challenges and Chronicle history. **Do not add permanent power or permanent
mechanical content every season.** Preserve purchased tracks for later completion.

### P10 — Streak rewards create obligation · P0 · High
Missing a day becomes an economic loss rather than a missed opportunity. End economic
streak multipliers; preserve longest streak as a Legacy Record; replace cadence
recognition with **cumulative, non-consecutive** participation.

---

# Metagame findings

**Account identity — Protect.** Chronicle, Player Card, public profile, badges, favorite
snake, collection display, personal-best timeline and Records are the strongest
account-retention foundations. They answer: who am I, what have I mastered, which snake
is mine, what memorable runs have I completed, what history have I built. **Make
Chronicle the authoritative home of long-term identity**; avoid parallel profile and
achievement languages.

**Breeding and lineage — P0 design direction.** The fantasy is strong; the decision model
is weak. "This snake descends from my best snakes" creates investment. "I paid DNA and
the system randomly picked" creates reroll management. Keep parents, ancestry, pedigree,
inherited visual identity, and a small number of meaningful traits. Redesign random
inheritance, random lineage rerolls, and meaningless generation escalation.

**Collection — P1.** Serves unlock progression, breeding stock, passive DNA, set bonuses,
profile completion and cosmetic ownership. Too many jobs. It should provide identity,
visual aspiration, discoverable history and optional playstyle expression — and should
**not** increase passive or competitive economy power.

**Records vs legacy achievements — P0.** 21 Records × 5 tiers plus Legacy Score, and
separately 18 Early Career achievements, represent the same behaviors in two systems with
different labels and reward surfaces. Convert earned achievements to permanent Legacy
Record entries, settle outstanding rewards through one atomic migration, remove separate
claims and post-run toasts, and use **Records as the only long-term accomplishment
language**.

**Contracts — P0.** Understandable in isolation, but one of several daily layers, and the
premium difference increases progression velocity. Merge into the World Signal: one
selected objective, equal reward opportunity, compatible with preferred play, no backlog,
no separate claim step.

**Offline rewards — P0.** Notification-first presentation is good; the reward design is
not. It rewards owning more catalog entries, waiting, and premium time capacity — not
skill, mastery or strategy. Retire offline DNA and remove offline Energy restoration. A
"while away" summary may report world changes without generating a claimable pile.

**Clans — P0 simplification.** A large live-service product inside a game with no
validated clan population. **Empty social spaces are worse than absent social spaces —
they communicate that the game is inactive.** Launch scope should be name, heraldry,
roster, member roles, one simple asynchronous weekly best-run goal, and Chronicle
recognition. Hide advanced competition until defined population thresholds are reached.

**Analyst — Defer.** Deterministic analysis is valuable. Continuous LLM generation, email
delivery, moderation, model changes, token cost, retry behavior and support are excessive
operational burden before retention is proven. Keep deterministic local summaries and
templated fallback; defer routine LLM generation and email; reintroduce narrative only
when players repeatedly engage with the deterministic insight.

**The current daily experience is timer fragmentation, not a world day:** daily
contracts, daily leaderboard, streak day, offline progress, legacy daily reward API,
premium monthly stipend, season progression, weekly Anomaly, weekly clan systems, and
Analyst cron outputs all run on unrelated clocks.

---

# Player journey — risks by stage

| Stage | Risk |
|---|---|
| **First 5 min** | Low after FTUE v2, provided consent never obstructs Launch, bootstrap failures stay recoverable, and no optional meta system appears. Keep contracts, seasons, breeding, clans, collection completion, Analyst, Signal and account creation hidden. |
| **First session** | The Results screen implies Genome, Codex, streak, mastery, achievements and Analyst are all equally important. Show only score, personal best, DNA, replay, and one optional Lab CTA. |
| **First day** | Player concludes account administration is the real game. Focus on BANK/PASS, one preferred dynasty, understanding DNA, and Mastery as the long-term path. |
| **Days 2–7** | Too many concepts before stable understanding. Expose each only after demonstrated use of the prior one: gene icon → two matching strain points → expression → INFUSE → limited lineage influence → advanced combinations. |
| **Weeks 2–4** | No progression lane feels authoritative. Hierarchy must be Mastery → Lineage → Discovery → optional Signal. |
| **Months 2–3** | Checklist fatigue; no sovereign mastery goal; repetition disguised by more meters; operational systems with too few participants. |
| **Veteran** | Many completion surfaces but only three core rulesets — more meters without more mastery. Focus on standardized challenge conditions, personal-best history, verified ranking, mastery trials, cosmetic prestige, shareable lineage, optional async competition. |

**Missing bridges:** Results → one clear next action. Mastery → a visible skill
challenge. Collection → emotional identity rather than quantity. Lineage → meaningful
inheritance decisions. Daily return → one coherent ritual. Competitive aspiration →
demonstrably fair ranking.

---

# Daily-cycle research

Durable return behavior comes from **anticipation, autonomy, competence and meaningful
change** — not punishment for absence. Self-determination research found perceived
autonomy, competence and relatedness independently predict enjoyment and future play
intention, favoring optional challenges, visible mastery and player choice over
compulsory checklists.
([Ryan, Rigby & Przybylski](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf))

**Warframe** — Daily Tribute is cumulative; missing days delays the next milestone rather
than resetting; milestones offer reward *choice*; Nightwave later added recovery of
unfinished weekly acts.
→ *Missing a day should delay progress, not destroy accumulated value. Choice improves
ownership.*
→ *Do not copy:* the many simultaneous currencies, vendors and progression tracks.

**Deep Rock Galactic** — active challenges are capped; one added daily up to the cap;
challenges can be replaced; ordinary play advances them; **previous seasons can be
selected and their progress preserved**.
→ *Cap active goals, align them with ordinary play, archive paid progression.*
→ *Do not copy:* stacked assignments before content density supports them.

**Animal Crossing: New Horizons** — the world advances in real time; seasons and
discoveries change; returning communicates that the world continued; the routine stays
player-paced.
→ *A new day should change the world, not merely refresh a reward button.*
→ *Do not copy:* real-time appointment pressure or maintenance chores.

**Helldivers 2** — shared orders and an evolving war connect individual sessions to a
broader state; a human-directed layer provides context and surprise; **Warbonds do not
expire**.
→ *Context makes repeated play meaningful; paid progression should remain accessible.*
→ *Do not copy:* continuously authored world operations — an unsustainable solo burden.

**Destiny 2** — Bungie's Orders redesign explicitly moved away from objectives that
forced particular activities or loadouts, toward automatic, context-compatible progress.
→ *Objectives should follow preferred play rather than pull players away from it.*
→ *Do not copy:* a dense web of ritual resets and vendor checklists.

**Hearthstone** — unpopular quests removed or changed; difficult quests made easier;
players retained the ability to reroll undesirable objectives; progression centralized
into a coherent journal.
→ *Allow choice and rejection. Do not demand disliked behavior.*
→ *Do not copy:* overlapping daily, weekly, event and track progressions.

**Slay the Spire** — Daily Climbs create one recognizable rotating ruleset with worldwide
comparison.
→ *One daily gameplay artifact can create variety and comparison with almost no metagame
overhead.*
→ *Do not copy:* rank pressure tied to exclusive progression rewards.

**Old School RuneScape** — the Collection Log emphasizes searchable discovery, completion
visibility, account history, and prestige **without** conferring combat power.
→ *Collection can create identity and status without increasing power or earnings.*
→ *Do not copy:* raw checklist scale without strong individual item meaning.

**Apple** recommends avoiding premature rating and notification-permission interruptions
during game onboarding — FTUE v2 is aligned.

**Dark patterns:** a recent academic review identifies loss-driven streaks and
time-limited progression as mechanisms that turn return behavior into obligation.
([review](https://pmc.ncbi.nlm.nih.gov/articles/PMC13371737/))

### Synthesis — the ten principles

1. One recognizable daily event beats several reset surfaces.
2. The daily event should be **gameplay**, not a claim ceremony.
3. Missing days create no debt and destroy no accumulated value.
4. Goals respect playstyle choice.
5. Outcomes settle automatically.
6. Daily progress feeds permanent mastery or identity, not a new currency.
7. Past paid progression remains accessible.
8. Shared-world language must be backed by real state, not decorative fiction.
9. Community systems scale only after population exists.
10. Daily systems never obstruct Launch.

---

# The three daily-world models

### Model A — Daily Run (minimum viable)
One standardized challenge changes daily at 00:00 UTC; a run is stamped with its daily
version at start; a reset never changes an active run. Home shows one unobtrusive card
that never auto-opens. Changes: featured dynasty, seed, modifier, gene pool. No claim
button — rewards settle automatically. Decision: enter or ignore. Missed days carry no
penalty; previous runs enter an unranked practice archive.
**Advantages:** lowest cost, clearest, gameplay-first, reuses existing Anomaly tech.
**Disadvantages:** the world doesn't strongly feel advanced; limited player choice.

### Model B — World Signal (RECOMMENDED)
One coherent daily briefing around a standardized gameplay event. Nothing auto-opens;
Home keeps Launch primary and shows one line (`WORLD SIGNAL: AURUM RESONANCE — New
conditions detected`). Opening is voluntary and takes 30–60 seconds.

Contains: yesterday's automatically settled outcome; today's world condition; a
standardized loaner build or controlled eligible setup; **one choice from up to three
compatible objectives** representing different approaches to the same challenge
(survival / extraction / build execution) with equivalent reward value; one optional run.

**No claim buttons.** Rewards grant automatically; the briefing reports what was
received; Chronicle records notable outcomes; the notification clears when the new Signal
is *viewed*, not when a reward is claimed.

Progression effects: normal DNA, normal Mastery XP, a modest first-completion bonus, and
cumulative non-consecutive cosmetic milestones. **No** Signal currency, **no**
consecutive-day multiplier, **no** exclusive power reward, **no** premium extra objective.

Missed days: no streak loss, no backlog, one active Signal only, previous Signals remain
as non-reward practice, cumulative milestones never expire.

New players: hide until ~3 successful banks. Introduce it as a way to test existing
skill, not another progression system.

**Advantages:** creates a world-day feeling; consolidates contracts and Anomaly; supports
autonomy; reinforces core play; uses existing technology; scales new player → veteran.
**Disadvantages:** more UI and content logic than A; requires trusted versioning and
settlement; shared rankings require leaderboard repair.

**Rollout:** build A as the minimum viable Signal → measure voluntary open rate,
completion, repeat play and ordinary-run cannibalization → add the briefing → merge
contracts only after the Signal proves useful → add aggregate community outcomes only if
population makes them meaningful.

### Model C — Living Dynasty (DO NOT BUILD NOW)
Daily breeding/expedition/Lab/collection developments followed by management decisions.
Strongest "world moved while away" impression and strongest lineage fantasy, but
naturally creates claimable outcomes, timers, appointment pressure, balancing
complexity, monetization temptation and high operational burden — and it delays gameplay.
Appropriate only if future evidence shows lineage, not score mastery, is why players stay.

---

# Simplification and removal candidates

**Remove:** legacy 28-day daily reward API and RPC (still callable, still grants DNA and
Energy) · streak DNA multipliers (preserve longest streak as a Legacy Record) · offline
DNA per owned snake · duplicate offline Energy restoration · complete-dynasty DNA
multiplier · dead clan Energy and score surfaces.

**Merge:** contracts + daily Anomaly → one World Signal · legacy achievements → Records ·
Codex and Genome result announcements → keep only the most meaningful first discovery in
Results, route the rest to Chronicle · season challenge + daily return communication.

**Simplify:** Results (three layers) · Genome (curated pool, fewer visible tiers, limited
splices, no automatic permanent seasonal expansion) · Breeding (explicit inheritance,
bounded choice, mechanical cap at Gen3) · Collection (fewer promoted variants, stronger
visual identity, no passive earnings) · Clans (identity, roster, one weekly goal).

**Rename or clarify:** Generation 4–50 as pedigree, not power · "skill brackets" must use
a true performance metric or be removed · monetization promises must either drop the
progression advantages and paid randomness or replace absolute claims with precise
descriptions (**redesign preferred**).

**Universalize:** aim systems become accessibility and preference settings.

**Delay:** advanced clan Gauntlet · clan research trees · clan playoffs · central Discord
automation · routine LLM Analyst narration · Analyst email digests · new dynasties ·
permanent seasonal genes · asynchronous Lab production.

**Interruptions that remain justified:** legal consent where required · critical blocking
failure · destructive run-abandon confirmation · minimal first-movement instruction ·
gene decision · portal decision · surge decision · tactical hold guidance. *Gene and
portal decisions are justified because they are the run's strategic center and the
simulation is stopped — they are not comparable to account prompts or reward claims.*

---

# Missing foundations

**Technical/product:** clean product telemetry (a defined funnel event set with server
authority) · clean cohort separation (production consumers vs developers vs QA vs
fixtures) · session lifecycle (explicit abandoned state, stale-session expiry, end-reason
codes, content version, ranked eligibility) · a competitive rules contract · atomic
economy settlement through one auditable idempotent path · one living content authority.

**Clarity:** portal consequence preview · three-layer result hierarchy · one post-run
recommendation · curated Genome sets · universal accessibility settings · a readable
in-context glossary · better explanation of why a run succeeded or failed.

**Progression:** deterministic breeding inheritance · a meaningful Gen3 cap · mastery
trials · better variant identity · a single achievement system · a progression overview
showing only Mastery, Lineage and Discovery.

**Daily:** one server-day definition · automatic reward settlement · Signal content
versioning · archive rules · no-loss returner handling · notification state separate from
reward state.

**Collection:** strong visual differentiation · snake-specific history · ancestry
presentation · a reason to favorite one snake · prestige without economy power.

**Social:** population-gated activation · shareable Chronicle cards · clear clan activity
health · one simple asynchronous goal · privacy-safe defaults.

**Veteran:** trusted standardized challenge rankings · dynasty mastery trials · curated
modifier rotations · verified replay or ghost sharing · personal-best comparison across
content versions · cosmetic prestige tied to mastery.

---

# Prioritized roadmap

Complexity for one developer: **S** several focused days · **M** 1–3 focused weeks ·
**L** 1–2 months · **XL** ongoing live-ops burden or 2+ months.

**Critical foundations:** (1) clean metrics and cohort separation [M] · (2) stale-session
lifecycle and content versioning [S–M] · (3) fix duplicate Energy restoration [S] ·
(4) disable orphan daily rewards [S] · (5) atomic legacy reward settlement, then migrate
achievements [M] · (6) repair leaderboard eligibility and identity [M] · (7) **freeze new
permanent mechanics** — genes, clan layers, currencies, daily surfaces [S].

**High-impact:** (8) simplify Results into three layers [M] · (9) remove streak economy
and offline DNA [M] · (10) run a no-Energy progression experiment [M] · (11) curate a
12–16 gene active pool [L] · (12) redesign breeding around explicit inheritance [L] ·
(13) cap meaningful generation at Gen3 [M] · (14) build World Signal MVP [M–L].

**Medium-term:** (15) refocus Chronicle [M–L] · (16) curate front-facing variants [L] ·
(17) add mastery trials [L] · (18) convert seasons to archived cosmetic tracks [M–L] ·
(19) reduce clans to identity and one weekly goal [L] · (20) remove stale configuration
and authority conflicts [M].

**Experiments requiring validation:** Energy-free vs current · three-layer vs current
Results · one Signal objective vs pick-two Contracts · 12/16/19-gene pools ·
deterministic inheritance vs random breeding · universal Pathline vs standardized
no-assist ranked · one official Signal attempt vs unlimited best-score · cosmetic-only
collection completion vs DNA multiplier · Signal archive vs daily exclusivity.

## Things that should never be built

- A lost-day streak that reduces earnings or destroys progress.
- Expiring paid progression that cannot be completed later.
- Paid or indirectly paid randomized progression outcomes.
- More currencies used to disguise existing costs.
- Collection bonuses that create competitive or economic power.
- Mandatory return briefings; claim cascades.
- Human-authored daily world operations requiring continuous solo intervention.
- Permanent gene accumulation as the default seasonal strategy.
- Competitive brackets described as skill brackets when they measure spending or breeding.
- Systems whose primary purpose is increasing DAU rather than making the game better.

---

# The ten open decisions

| # | Decision | Recommendation | Trade-off |
|---|---|---|---|
| 1 | What is SupaSnake selling? | Cosmetics, identity, archived tracks, supporter prestige, premium presentation | Friction monetization may produce short-term revenue but conflicts with immediate-play positioning and creates continuous economy work |
| 2 | Should Energy remain? | Test full removal before live commerce | Removing it eliminates a monetization surface but simplifies onboarding, economy, testing, messaging and trust |
| 3 | How large should the active Genome be? | 12–16 genes curated for distinct decisions | Gating delays confusion but does not reduce balance complexity; curation trades breadth for legibility |
| 4 | What should breeding mean? | Ancestry plus explicit inheritance choices | Random breeding creates surprise and repeat spending; deterministic creates ownership, planning and trust |
| 5 | Are aim systems progression or accessibility? | Universal settings with a standardized ranked policy | Unlocks provide rewards but compromise comparability and accessibility |
| 6 | Is collection completion or identity? | Fewer distinctive snakes, stronger histories, no economic power | Checklist breadth is cheaper per entry but emotionally weaker and costlier to sustain |
| 7 | When should clans expand? | Only after a defined active-population threshold | Early breadth looks impressive but produces empty social spaces and heavy obligations |
| 8 | What is the global day boundary? | 00:00 UTC | Global simplifies shared Signals, rankings and support; local feels natural but fragments shared state |
| 9 | Do seasons expire? | Theme rotates; purchased tracks stay completable | Expiration increases urgency; archives build trust and reduce content waste |
| 10 | What is the dominant long-term fantasy? | Master one dynasty, develop a meaningful lineage, prove skill under changing conditions | The alternatives (complete every collection entry / manage a Lab / lead a clan / chase seasonal content) require far more content and operational support |

---

# Product north star

Every future feature must answer:

- Does this make the run more enjoyable?
- Does this make the player care more about their snake?
- Does this reinforce skill, risk, or identity?
- Can the player understand it without external explanation?
- Does it create anticipation without punishing absence?
- **Can one developer operate it reliably for five years?**
- Can an existing system do the same job?
- Would removing something create a stronger game?

If a system cannot justify itself through those questions, it should not ship merely
because it has already been designed or implemented.
