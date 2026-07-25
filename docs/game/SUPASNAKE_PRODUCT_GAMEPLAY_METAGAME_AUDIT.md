# SupaSnake Product, Gameplay, Progression & Metagame Audit

**Audit date:** 25 July 2026  
**Repository baseline:** main at fd22c0c96e0e521e197b0b534cc1bd8c7420ce9e  
**Production runtime:** 645578ed83483d350e99fff201e984a6f8c25e4e  
**Production tag:** production-2026-07-24-training-ux  
**Production migrations:** 001–038  
**Status:** Research and strategic design audit. No major gameplay or metagame systems were implemented as part of this audit.

---

## Executive conclusion

SupaSnake already has the foundations of an excellent precision score-attack roguelite. Its greatest risk is not insufficient content; it is an oversized, fragmented metagame obscuring the unusually strong core game.

SupaSnake should become a game about skill, calculated risk, expressive snake builds, and personal lineage—not a collection of timers, claims, currencies, and partially overlapping progression tracks.

The recommended product identity is:

> A premium precision roguelite built around survival, extraction, score mastery, and a personally meaningful snake lineage.

A solo-developed game cannot sustainably outproduce large live-service teams. SupaSnake can outperform them in clarity, craftsmanship, trust, and the way a small number of systems compound together.

The highest-leverage direction is:

1. Protect the immediate, premium core run.
2. Make Mastery, Lineage, and Discovery the three visible progression pillars.
3. Remove or merge reward surfaces that primarily create obligation.
4. Repair economy, analytics, and competitive integrity before adding content.
5. Consolidate daily engagement into one optional, gameplay-centered World Signal.

---

## Deployment status at audit

- Production runtime: 645578ed83483d350e99fff201e984a6f8c25e4e
- Release tag: production-2026-07-24-training-ux
- Current main: fd22c0c96e0e521e197b0b534cc1bd8c7420ce9e
  - This adds the release documentation after the deployed runtime commit.
- Production migrations: 001–038
- Migration 038 is deployed.
- Repository was clean at audit completion.
- Stripe remained in test/sandbox mode.

---

## Method and evidence standard

This audit was based on:

- Current repository code and tests.
- Authoritative game and UX design documents.
- Database migrations 001–038.
- Current navigation, Home, game, Results, Lab, Chronicle, Leaderboard, Training, Shop, Clan, and related UI.
- Gameplay rules, settlement, validation, progression, economy, Genome, breeding, mastery, Records, season, contract, clan, and Analyst logic.
- Desktop and mobile visual inspection of the current game screen.
- Read-only aggregate production checks.
- External research into durable daily rituals, player motivation, collection, progression, and live-service failure modes.

### Confidence labels

- **High:** Directly confirmed in code, migrations, tests, or current UI.
- **Medium:** Confirmed behavior plus a design inference.
- **Low:** Directional production aggregate or hypothesis requiring clean player testing.

### Important production-data caveat

The live database includes developer, QA, fixture, bootstrap, and possibly abandoned-account activity. It is not a clean consumer cohort. Production aggregates are therefore treated as directional smoke, not retention proof.

### Confirmed versus inferred

Throughout this report:

- **Confirmed behavior** refers to directly inspected implementation.
- **Likely intent** refers to current authoritative design documentation where implementation and intent may not fully match.
- **Inference** explains probable player or production consequences.
- **Recommendation** is the proposed direction.
- **Speculation** is explicitly labeled and should be tested.

---

# 1. Executive assessment

## Strongest foundations

### Immediate player flow

The one-click guest journey now correctly protects the first meaningful experience:

- Home.
- One Launch.
- Anonymous authentication.
- Idempotent profile bootstrap.
- PRIMAL granted and equipped.
- Board ready.
- Deliberate first movement.

The relevant invariants are documented in [Player Flow & Interruption Policy](./PLAYER_FLOW_INTERRUPTION_POLICY.md#authoritative-primal-bootstrap) and the explicit launch state machine is defined in the same document.

This is unusually important. It gives SupaSnake a clean product promise: wanting to play leads directly to play.

### Three genuinely different dynasty rulesets

The three dynasties are not merely statistical variants:

- PRIMAL builds value through compounding food.
- CYBER increases speed and score/DNA pressure.
- COSMIC asks the player to route through constellation sequences and periodic wall states.

Their current rules are documented in [Game Design V2](./GAME_DESIGN_V2.md).

This is real depth because each dynasty changes how the player reads space, evaluates danger, and times extraction.

### Bank-versus-risk tension

The portal system creates SupaSnake’s most distinctive strategic decision:

- BANK secures value.
- PASS continues the run for a larger opportunity.
- INFUSE sacrifices current body safety for build and extraction benefits.

This connects tactical survival, buildcraft, economy, and player psychology in one decision. It should be treated as a central pillar.

### Tactical control

The current control system supports:

- Touch flicks.
- Keyboard input.
- Buffered turns.
- Reversal rejection.
- Duplicate-direction rejection.
- Deliberate first movement.
- Tactical hold.
- D-pad input.

This supports mastery without requiring complex button combinations.

### Voluntary Training Lab

The Training Lab is rewardless, deterministic, and focused on skill:

- Trace.
- Route.
- Tempo.
- Escape.
- Circuit.
- Sandbox.
- Server-verified replays and personal bests.

Its rewardless contract is documented in [Training Lab Design](./TRAINING_LAB_DESIGN.md#training-is-not-a-progression-shortcut).

This is an excellent long-term foundation because it supports competence without forcing training or turning it into another currency farm.

### Server authority

The current run-end architecture includes:

- Server-authoritative settlement.
- Idempotent session-end handling.
- Score and food recomputation.
- Validation flags.
- Atomic unlock-and-equip paths.
- Replay verification for Training.

This is more robust than the visible product maturity might suggest and should be protected.

### Identity foundations

The Chronicle, Records, Player Card, handles, badges, snake avatar, public profile, lineage, and cosmetics can make an account emotionally meaningful.

This is the right kind of long-term progression: it records who the player became rather than only how much currency they accumulated.

## Largest structural weaknesses

1. Too many systems compete for attention after a run.
2. Genome complexity exceeds what one developer can reliably teach, balance, test, and maintain.
3. Breeding creates random outcomes and escalating generation numbers without proportional decision depth.
4. Energy, streaks, offline accumulation, contracts, seasons, achievements, Records, and daily rewards produce overlapping return incentives.
5. Monetization claims do not precisely match implementation.
6. Competitive surfaces do not yet enforce a sufficiently credible definition of fairness.
7. Production data is contaminated by QA and incomplete sessions, making retention and balance conclusions unreliable.
8. Historical documents and unused configuration create competing versions of product truth.

## Biggest opportunity

Consolidate daily engagement into one optional, gameplay-centered event: the **World Signal**.

It should replace multiple claims, contracts, streak pressure, and passive return rewards with:

- One changed world condition.
- One meaningful choice.
- One optional run.
- One automatically delivered outcome.
- One cumulative, non-consecutive record of participation.

## Greatest long-term retention risk

The main risk is that players become administrators of their SupaSnake account instead of masters of SupaSnake.

The current metagame contains enough reward surfaces to generate obligation, but not yet enough hierarchy to tell players what truly matters. That can drive short-term activity while weakening long-term affection.

---

# 2. Current system map

## Current player loop

~~~text
Open SupaSnake
    ↓
Home
    ↓
Launch
    ↓
Anonymous auth → profile bootstrap → PRIMAL equipped
    ↓
Board ready → deliberate first movement
    ↓
Navigate → eat → grow → score
    ↓
Gene offer / strain development
    ↓
Portal decision
    ├─ BANK   → secure score and DNA
    ├─ PASS   → continue for a larger run
    └─ INFUSE → sacrifice body for gene/surge and improved extraction
    ↓
Crash or extraction
    ↓
Results
    ├─ score / DNA / personal best
    ├─ genes / Genome Card / Codex
    ├─ mastery
    ├─ streak
    ├─ achievements / Records
    ├─ contracts / season progress
    └─ Analyst insight
    ↓
Replay / Home / Lab / Chronicle / Leaderboard / Clan / Shop
    ↓
Unlock, equip, breed, reroll, collect, master
    ↓
Next run
~~~

The beginning of this loop is now clean. The end is not.

## Before, during, and after a run

### Before a run

The player can interact with:

- Home Launch.
- Equipped snake.
- Energy state.
- Free Play.
- Weekly Anomaly.
- Training.
- Notifications.
- Contract indicators.
- Season indicators.
- Lab.
- Leaderboard.
- Clan.
- Shop.
- Chronicle.
- Settings and account.

### During a run

The player manages:

- Snake direction.
- Board position and escape routes.
- Food collection.
- Growth and body length.
- Dynasty-specific rules.
- Score and DNA telemetry.
- Gene offers.
- Held genes.
- Strain thresholds.
- Splices.
- Heirloom starting points.
- Portal timing.
- BANK, PASS, or INFUSE.
- Tactical pause.
- Death risk.

### After a run

The current result pipeline can surface or update:

- Final score.
- DNA.
- Personal best.
- Held genes.
- Streak and multiplier.
- Mastery XP and mastery level.
- First-result Lab recommendation.
- Genome Card.
- Codex discoveries.
- Analyst insight.
- Legacy achievements.
- Records.
- Contracts.
- Season XP.
- Collection progress.
- Player identity.
- Clan contribution.
- Discord event synchronization.

This is too much for one emotionally coherent result moment.

## Account resources and progression counters

| Resource | Current role | Assessment |
|---|---|---|
| Score | Core run performance and leaderboard measure | Essential |
| DNA | Earned and purchasable currency for variants, breeding, rerolls, and related progression | Overloaded |
| Energy | Gates reward-bearing runs; regenerates and is sold | Conflicts with gameplay-first positioning |
| Mastery XP | Dynasty-specific long-term progression | Strong foundation |
| Season XP | Advances the seasonal reward track | Creates a parallel progression lane |
| Reroll tokens | Random trait adjustment | Reinforces RNG management |
| Owned snakes | Collection, breeding stock, identity, and passive economy input | Too many jobs |
| Generation | Breeding pedigree up to Gen50 | Mostly status after Gen3 |
| Records tiers | Long-term achievements and account identity | Strong, but duplicated |
| Legacy achievements | One-time goals with claims and rewards | Redundant |
| Streak days | Return behavior and DNA multiplier | FOMO-heavy |
| In-run genes | Buildcraft and run variation | Valuable but overexpanded |
| Strain points | In-run build threshold | Valuable but difficult to communicate |
| Body length | Survival resource and INFUSE cost | Excellent tactical resource |

No new currency is required. The existing product needs fewer reward surfaces, not another abstraction.

## Existing gameplay and metagame inventory

Confirmed systems include:

- Three playable dynasties.
- 30 snake variants.
- Unlock and equip.
- Instant breeding.
- Generation and lineage.
- Random wild traits.
- Trait and lineage rerolls.
- Eight Heirloom traits.
- 34 offerable genes.
- 10 splices.
- Five strains with multiple thresholds.
- Portal INFUSE and surge.
- Dynasty mastery.
- Codex discovery.
- Contracts.
- Seasons.
- Weekly Anomaly.
- Streaks.
- Offline rewards.
- Legacy daily rewards still present server-side.
- Legacy achievements.
- Records and Chronicle.
- Player Card and public profile.
- Global, daily, and weekly leaderboards.
- Aim-system unlocks.
- Training exercises, Circuit, and Sandbox.
- Clans.
- Clan duels.
- Clan Gauntlet.
- Clan research.
- Clan playoffs.
- Discord integration.
- Analyst run summaries.
- Analyst archetypes.
- Analyst digests.
- Season Recall.
- Premium subscription.
- Energy products.
- Paid bundles.

## Complexity observation

The Genome specification exposes 34 offerable genes and 10 splices in [Buildcraft Genome Design](./BUILDCRAFT_GENOME_DESIGN.md#current-catalog-accounting).

At six genes, 34 genes produce more than 1.3 million unordered six-gene combinations before accounting for:

- Dynasty.
- Pick order.
- Strain thresholds.
- Splices.
- Heirloom spawn points.
- Portal INFUSE.
- Surge.
- Anomaly modifiers.
- Seasonal interactions.

This does not mean every combination needs individual balancing. It does mean the active possibility space is too large for players to learn and for one developer to confidently reason about.

A curated pool of 16 produces 8,008 six-gene sets before the same modifiers. That is still deep while being orders of magnitude easier to teach, observe, and balance.

---

# 3. Core gameplay audit

## Finding 1: The core control loop is strong

**Current behavior — confirmed**

- Deliberate first input begins the run.
- Buffered direction changes support fast play.
- Reversals and duplicate directions are rejected.
- Touch, keyboard, and D-pad controls are supported.
- Tactical hold allows deliberate planning.
- The board remains the visual center.

**Why it matters**

Movement is clear, responsive, and immediately understandable while retaining a high skill ceiling. This is the primary reason to return.

**Player impact**

- Fast comprehension.
- Low input friction.
- High potential mastery.
- Strong “one more run” behavior grounded in play rather than rewards.

**Recommendation**

Protect input semantics, board visibility, frame pacing, and low latency. Do not add run-start menus or mandatory loadout steps.

**Priority:** Protect  
**Confidence:** High

## Finding 2: The three dynasties create real playstyle differences

**Current behavior — confirmed**

- PRIMAL uses compounding food value.
- CYBER accelerates and increases its multiplier.
- COSMIC uses constellation sequences and periodic wall traversal.

See [Game Design V2](./GAME_DESIGN_V2.md).

**Why it matters**

Each dynasty changes how the player reads space and risk. This is more valuable than a larger roster of statistically different characters.

**Player impact**

- Genuine replay variation.
- Distinct mastery identities.
- Natural preference and self-expression.

**Recommendation**

Prioritize polishing and balancing these three rulesets before adding another dynasty. Future variety should initially come from curated challenge conditions and mastery trials.

**Priority:** Protect  
**Confidence:** High

## Finding 3: Portal decisions are SupaSnake’s clearest strategic differentiator

**Current behavior — confirmed**

- BANK secures value.
- PASS accepts greater danger for a larger outcome.
- INFUSE trades body length for build or extraction power.

Baseline bank and salvage logic is documented in [Game Design V2](./GAME_DESIGN_V2.md#extraction-system).

**Why it matters**

The portal converts a familiar survival game into an extraction decision. It links player skill, confidence, greed, build strength, and account progression.

**Player impact**

- Strong tension.
- Self-authored risk.
- Memorable regret and triumph.
- Meaningful tactical pauses.

**Recommendation**

Keep portal decisions centered over the board with the simulation frozen. Improve consequence preview. Do not demote them to notifications.

**Priority:** Protect  
**Confidence:** High

## Finding 4: Gene decisions are also core gameplay

**Current behavior — confirmed**

Gene choices materially modify the current run, feed strain thresholds, trigger expressions and splices, and interact with portal choices.

**Why it matters**

These are strategic decisions rather than account administration. They deserve to interrupt navigation because the player is still playing the game.

**Player impact**

- Build ownership.
- Run-to-run variety.
- Strategic planning.

**Recommendation**

Keep gene choices as focused, centered overlays with the simulation frozen. Reduce the active pool so each option becomes recognizable, legible, and emotionally distinct.

**Priority:** P0  
**Confidence:** High

## Finding 5: Tactical pause is valid, but a conventional pause menu is unnecessary

**Current behavior — confirmed**

The player can hold the run and resume through directional input. Abandoning the run is destructive.

**Why it matters**

Players may pause because their snake is long or the board position is tactically dangerous. A large menu obscuring that state undermines the reason they paused.

**Player impact**

- Tactical planning.
- Reduced accidental failure.
- Better mobile interruption handling.

**Recommendation**

Retain:

- Board-visible tactical hold.
- Clear resume guidance.
- A subtle abandon control.
- An explicit destructive confirmation before abandoning.

Do not introduce a conventional settings-heavy pause screen unless a real need emerges.

**Priority:** P1  
**Confidence:** High

## Finding 6: Buildcraft breadth has exceeded readable depth

**Current behavior — confirmed**

The system includes:

- 34 offerable genes.
- Five strains.
- Minor, expression, and apex thresholds.
- 10 splices.
- Eight Heirloom traits.
- Lineage spawn points.
- INFUSE gene and surge outcomes.
- Seasonal and mastery unlocks.

**Why it matters**

Progressive discovery delays exposure but does not solve:

- Mental-model overload.
- Balance-space growth.
- QA cost.
- Copy and icon burden.
- Interactions players cannot predict.

**Player impact**

- Fake choices when consequences are unclear.
- Reliance on external guides.
- Reduced emotional attachment to individual genes.
- Difficulty understanding why a run succeeded.

**Recommendation**

Establish a curated active pool of approximately 12–16 genes.

- Preserve existing catalog records.
- Hide or rotate unproven genes.
- Retain five clear strain identities only if players can recognize them visually.
- Start with minor and expression thresholds.
- Postpone most apex and splice interactions until comprehension and balance data exist.
- Add a permanent gene only when it introduces a genuinely new decision category.

**Priority:** P0  
**Confidence:** High

## Finding 7: Aim systems create competitive ambiguity

**Current behavior — confirmed**

- Deadeye is the default.
- Pathline projects upcoming cells and displays danger.
- Gridlock and Firefly unlock through progression conditions.
- These systems can materially change available planning information.

See [aimSystems.ts](../../src/lib/game/aimSystems.ts).

**Why it matters**

Players on the same leaderboard do not necessarily receive equivalent information. Progression unlocks therefore influence competitive conditions.

**Player impact**

- Perceived unfairness.
- Accessibility options become power rewards.
- Rankings become harder to explain.

**Recommendation**

Make all aim systems universal settings. For ranked play, define one standardized assist policy or clearly separate boards by configuration.

The preferred direction is universal access with one explicitly documented ranked configuration.

**Priority:** P0  
**Confidence:** High

## Finding 8: Results are overloaded

**Current behavior — confirmed**

The result flow can display:

- Score.
- DNA.
- Held genes.
- Streak.
- Mastery.
- First-result Lab CTA.
- Genome Card.
- Codex.
- Analyst insight.
- Legacy achievements.
- Other progression effects.

The sequence is visible in [game/page.tsx](../../src/app/game/page.tsx).

**Why it matters**

The emotional outcome of the run is diluted by administrative reporting. Players cannot tell which rewards are important.

**Player impact**

- Lower clarity.
- Longer time to replay.
- Reduced emotional weight of a personal best.
- Early exposure to systems without context.

**Recommendation**

Use three result layers:

1. Outcome and personal best.
2. Score and secured DNA.
3. One expandable progression digest.

Show exactly one recommended next action:

- Replay.
- Try the Lab after the first meaningful need.
- Inspect one new discovery.

Route secondary updates to the Chronicle or notification center.

**Priority:** P0  
**Confidence:** High

## Finding 9: Long-term variety should come from mastery challenges, not constant gene additions

**Current behavior — confirmed**

Most future run variation is currently expected from:

- Genome expansion.
- Seasonal genes.
- Anomaly modifiers.
- New snake variants.

**Why it matters**

Permanent content accumulation makes the game harder to learn, balance, communicate, and support every season.

**Player impact**

- Short-lived novelty.
- Increasing confusion.
- Reduced importance of skill.

**Recommendation**

Build veteran variety from:

- Curated modifiers.
- Standardized World Signals.
- Advanced Training exercises.
- Mastery trials.
- Personal-best conditions.
- Dynasty-specific challenges.

Use existing mechanics in new combinations before creating permanent mechanics.

**Priority:** P1  
**Confidence:** Medium

## Finding 10: Competitive integrity is incomplete

**Current behavior — confirmed**

Daily and weekly leaderboard queries do not consistently:

- Require ended sessions.
- Require validated sessions.
- Deduplicate the best result per player.
- Enforce content-version compatibility.

Global high score can be updated from safely recomputed values even when the session is validation-flagged. “Skill brackets” are based on bred generation rather than demonstrated skill. Player-rank comparison also uses an identity field that does not match the player table’s separate user ID.

**Why it matters**

Even the appearance of unfair ranking undermines mastery, account status, and competitive aspiration.

**Player impact**

- Lower leaderboard trust.
- Reduced motivation to improve.
- Confusing personal rank.

**Recommendation**

Require:

- ended_at present,
- validated=true,
- non-Free-Play,
- compatible content version,
- standardized assist configuration,
- and one qualifying result per player for the board rule.

Replace generation-based “skill brackets” with:

- score percentile,
- mastery trials,
- or no brackets until population supports them.

**Priority:** P0  
**Confidence:** High

## Core gameplay verdict

The core does not need reinvention. It needs:

- Protection.
- Clearer consequence communication.
- Curated buildcraft.
- Better result hierarchy.
- Credible competition.

The current board, cockpit, strategic overlays, and Training Lab point in the right direction. The highest-value core feature is not a new mode; it is making every existing run more understandable and every high score more trustworthy.

---

# 4. Progression audit

## Structural diagnosis

Progression currently has an **early avalanche and late plateau**.

### Early avalanche

- The first variants are relatively inexpensive.
- Contract payouts are comparable to early variant costs.
- Genome concepts unlock between approximately four and twenty banked runs.
- Aim systems, breeding, collection, seasons, streaks, and offline rewards become visible over a relatively short period.

### Late plateau

Once most systems are exposed, long-term movement becomes:

- Large Mastery XP totals.
- Collection completion.
- Higher generation numbers.
- Repeated seasonal tracks.
- Records tiers.
- Clan competition.

This front-loads breadth before players have established a stable reason to care about any particular progression lane.

## Recommended progression spine

Only three progression concepts should remain prominent:

1. **Mastery:** How skilled am I with this dynasty?
2. **Lineage:** What is special about my snake and its history?
3. **Discovery:** What new run decisions have I learned to use?

Daily play should reinforce those three. It should not become a fourth independent progression tree.

## Progression finding 1: DNA has too many meanings

**Current behavior — confirmed**

DNA pays for:

- Snake variants.
- Breeding.
- Trait rerolls.
- Lineage rerolls.
- Other collection progression.

It is also:

- Earned through runs.
- Granted through contracts and legacy systems.
- Granted through offline progress.
- Modified by collection, clan, and streak bonuses.
- Included in paid bundles.

**Why it matters**

Economy tuning affects nearly every system. Players cannot easily distinguish skill reward, collection reward, passive reward, and paid acceleration.

**Recommendation**

Keep DNA as the only spend currency, but reduce its jobs:

- Remove passive attendance and collection multipliers.
- Price deterministic choices instead of random rerolls.
- Stop adding new DNA faucets.
- Make payout primarily reflect successful play.

**Priority:** P0  
**Confidence:** High

## Progression finding 2: Energy sells relief from friction

**Current behavior — confirmed**

Reward-bearing runs consume Energy. Free Play is unlimited but does not award normal progression. Energy regenerates, is included in Premium, and is sold.

**Why it matters**

The product promises immediate play, then makes meaningful progression depend on waiting or paying. Free Play becomes a second-class version of the core game.

**Player impact**

- Progression friction.
- Reduced “one more run” flow.
- Confusing distinction between meaningful and non-meaningful play.
- Incentive to monetize frustration.

**Recommendation**

Run a controlled no-Energy progression test before commerce launches.

Preferred direction:

- Remove Energy.
- Let every valid run progress.
- Monetize identity and cosmetics.

Interim alternative:

- Rename the resource to Ranked Charges.
- Use it only for an additional reward bonus or official competition.
- Never prevent ordinary play or ordinary mastery progress.

**Priority:** P0  
**Confidence:** High

## Progression finding 3: Energy restoration has competing authorities

**Current behavior — confirmed**

- The player API performs timestamp-based regeneration.
- Offline progress independently calculates restored Energy from last-login time.
- The offline claim endpoint adds that restoration again up to cap.

**Why it matters**

This can double-restore Energy and makes economy telemetry unreliable.

**Recommendation**

- Establish one authoritative regeneration timestamp.
- Remove Energy from offline claims.
- Make all clients display server-returned Energy state.

**Priority:** P0  
**Confidence:** High

## Progression finding 4: Collection quantity is economically rewarded

**Current behavior — confirmed**

- Offline DNA scales with owned snake count.
- Complete dynasty sets add permanent DNA multipliers.
- Paid bundles include variants.

**Why it matters**

Accumulation improves future acquisition independently of play quality. Paid collection can accelerate collection-derived bonuses.

**Recommendation**

Remove:

- DNA-per-owned-snake.
- Complete-set DNA multipliers.

Collection rewards should be:

- Visual.
- Historical.
- Expressive.
- Optional play variety.
- Profile prestige.

**Priority:** P0  
**Confidence:** High

## Progression finding 5: Variants lack sufficient identity

**Current behavior — confirmed**

There are 30 variants across three dynasties. Current base gameplay statistics are substantially flattened; rarity primarily influences presentation and trait capacity.

**Why it matters**

“More snakes” risks becoming inventory inflation. Repeated naming patterns and generic rarity tiers replace memorable identity.

**Recommendation**

- Curate approximately 9–12 visibly distinctive front-facing variants.
- Preserve all existing ownership.
- Hide generic filler from primary discovery surfaces until it receives a strong visual, lineage, or narrative identity.
- Make a player’s selected snake feel like a character, not a catalog row.

**Priority:** P1  
**Confidence:** High

## Progression finding 6: Breeding is more random than strategic

**Current behavior — confirmed**

- Child generation is based on parent generations.
- Child variant is selected 50/50 from parents.
- Traits are selected randomly.
- Lineage can be generated randomly.
- DNA funds breeding and lineage rerolls.

See [migration 030](../../supabase/migrations/030_genome_lineage.sql).

**Why it matters**

Players manage odds rather than make lineage decisions. Because paid bundles contain DNA, randomized outcomes are indirectly monetized.

**Recommendation**

Replace random inheritance with:

- Visible parent contribution.
- A bounded trait draft.
- A clear sacrifice or trade-off.
- A deterministic preview before payment.

No material post-payment outcome should be hidden.

**Priority:** P0  
**Confidence:** High

## Progression finding 7: Generation 4–50 is fake depth

**Current behavior — confirmed**

- Gen3 unlocks a second trait slot and lineage-strength benefit.
- Later generations increase pedigree and cost.
- Generations 4–50 do not introduce proportional mechanical decisions.

**Why it matters**

The number rises without equivalent mastery or choice. Players may grind because the number exists rather than because the game becomes richer.

**Recommendation**

- Cap mechanical lineage progression at Gen3.
- Preserve all higher generations as pedigree and history.
- Do not escalate power or mandatory cost beyond the meaningful cap.
- Use high-generation snakes for Chronicle prestige, visual marks, or ancestry depth.

**Priority:** P1  
**Confidence:** High

## Progression finding 8: Mastery is the strongest long-term progression lane

**Current behavior — confirmed**

Mastery:

- Is dynasty-specific.
- Is earned through successful banked earning runs.
- Has ten levels.
- Awards mostly cosmetics.
- Unlocks genes at selected levels.

**Why it matters**

It links account progression to competent play and gives players a clear identity.

**Recommendation**

Make Mastery the visible account spine.

Replace some permanent gene unlocks with:

- Mastery trials.
- Cosmetic snake evolution.
- Titles.
- Chronicle chapters.
- Profile frames.
- Training challenges.

**Priority:** P1  
**Confidence:** High

## Progression finding 9: Seasonal progression adds permanent complexity

**Current behavior — confirmed**

- The current season is a finite track.
- Free players can complete fewer daily contracts than Premium players.
- Seasonal genes become permanently available from season start rather than being discovered through the track.
- The track is driven largely through recurring contract engagement.

**Why it matters**

A season simultaneously creates time pressure and permanently expands the balance surface.

**Recommendation**

Seasons should primarily provide:

- A visual theme.
- Curated existing modifiers.
- Cosmetics.
- Archived challenges.
- Chronicle history.

Do not add permanent power or permanent mechanical content every season. Preserve purchased tracks for later completion.

**Priority:** P1  
**Confidence:** High

## Progression finding 10: Streak rewards create obligation

**Current behavior — confirmed**

Consecutive earning days create increasing DNA multipliers. Streaks appear on Home, Results, Records, and legacy achievement surfaces.

**Why it matters**

Missing a day becomes an economic loss rather than simply a missed opportunity.

**Recommendation**

- End economic streak multipliers.
- Preserve existing longest streak as a Legacy Record.
- Replace future cadence recognition with cumulative, non-consecutive participation.

**Priority:** P0  
**Confidence:** High

## Economy trust assessment

The monetization documentation promises “never pay-to-win” and “no paid RNG” in [Monetization Design](./MONETIZATION_DESIGN.md).

Implementation creates a more complicated reality:

- Paid bundles include DNA and variants.
- DNA funds random breeding traits and lineage rerolls.
- Premium players can select three daily contracts rather than two.
- Premium increases offline accumulation and grants additional Energy.
- Owned variants contribute to collection completion and related DNA bonuses.

These benefits do not directly increase board score. They do increase progression velocity and access to randomized collection outcomes.

The accurate description is:

> Paid progression advantage with indirectly monetized randomness.

This may not be classic pay-to-win, but the current marketing language is too absolute and risks player trust.

The cleanest long-term monetization direction is:

- Cosmetics.
- Presentation.
- Chronicle and profile expression.
- Supporter status.
- Archived cosmetic tracks.
- High-quality visual variants.
- Convenience that does not improve resource acquisition, build odds, or competitive information.

This direction is developed in full — offer architecture, free/paying contract,
cadence, dark-pattern prohibitions, and a migration path off the current
SKUs — in [section 12, Monetization strategy](#12-monetization-strategy).

---

# 5. Metagame audit

## Account identity

**Assessment**

The Chronicle, Player Card, public profile, badges, favorite snake, collection display, personal-best timeline, and Records are the strongest account-retention foundations.

They answer:

- Who am I?
- What have I mastered?
- Which snake is mine?
- What memorable runs have I completed?
- What history have I built?

**Recommendation**

Make Chronicle the authoritative home of long-term identity. Avoid parallel profile and achievement languages.

**Priority:** Protect  
**Confidence:** High

## Breeding and lineage

**Assessment**

The fantasy is strong. The current decision model is weak.

“This snake descends from my best snakes” can create emotional investment. “I paid DNA and the system randomly picked outcomes” creates repetition and reroll management.

**Recommendation**

Keep:

- Parents.
- Ancestry.
- Pedigree.
- Inherited visual identity.
- A small number of meaningful traits.

Redesign:

- Random inheritance.
- Random lineage rerolls.
- Meaningless generation escalation.

**Priority:** P0 design direction  
**Confidence:** High

## Collection

**Assessment**

Thirty variants create breadth but not thirty distinct emotional identities.

Collection currently serves:

- Unlock progression.
- Breeding stock.
- Passive DNA.
- Set bonuses.
- Profile completion.
- Cosmetic ownership.

That is too many jobs.

**Recommendation**

Collection should primarily provide:

- Identity.
- Visual aspiration.
- Discoverable history.
- Optional playstyle expression.

It should not increase passive or competitive economy power.

**Priority:** P1  
**Confidence:** High

## Records and legacy achievements

**Current behavior — confirmed**

- Chronicle has 21 Records with five tiers plus Legacy Score.
- Profile separately presents 18 Early Career achievements.
- Legacy achievements can grant DNA and Energy.
- The achievement claim path is not one atomic balance-and-claim operation.

**Why it matters**

The same behaviors are represented in multiple systems with different labels, progress rules, and reward surfaces.

**Recommendation**

- Convert earned achievements to permanent Legacy Record entries.
- Automatically settle outstanding rewards through one atomic migration.
- Remove separate achievement claims and post-run toasts.
- Use Records as the only long-term accomplishment language.

**Priority:** P0  
**Confidence:** High

## Contracts

**Current behavior — confirmed**

- Three contracts are offered daily.
- Free players select two.
- Premium players select three.
- Contracts reward DNA and Season XP.
- Genome contracts appear after related FTUE conditions.

**Assessment**

Contracts are understandable in isolation, but they are one of several daily layers. Their premium difference also increases progression velocity.

**Recommendation**

Merge contracts into the World Signal:

- One selected objective.
- Equal reward opportunity.
- Compatible with preferred play.
- No backlog.
- No separate claim step.

**Priority:** P0  
**Confidence:** High

## Offline rewards

**Current behavior — confirmed**

- Offline DNA accrues per owned snake per hour.
- Free and Premium players have different caps.
- Offline Energy is separately calculated.
- A notification badge surfaces the reward; it does not automatically open.

**Assessment**

Notification-first presentation is good. The reward design is not.

The system rewards:

- Owning more catalog entries.
- Waiting.
- Premium time capacity.

It does not reward:

- Skill.
- Mastery.
- Strategic decisions.

**Recommendation**

Retire offline DNA and remove offline Energy restoration. A future “while away” summary may report world changes without generating a claimable currency pile.

**Priority:** P0  
**Confidence:** High

## Seasons

**Assessment**

Season cosmetics can provide:

- Anticipation.
- Shared visual identity.
- A reason to revisit old goals.

The current structure risks:

- Contract obligation.
- Premium progression advantage.
- Expiration pressure.
- Permanent mechanic accumulation.

**Recommendation**

- Let active seasons rotate.
- Preserve and archive purchased cosmetic tracks.
- Allow later completion.
- Use existing mechanics in curated combinations.
- Do not make permanent genes the default seasonal content.

**Priority:** P1  
**Confidence:** High

## Clans

**Current behavior — confirmed**

The clan product contains:

- Clan identity and heraldry.
- Roster and roles.
- Old weekly and total score.
- An old Energy Bonus surface.
- Duels.
- Gauntlet.
- Weekly picks, locks, and scoring.
- Research branches and nodes.
- DNA contributions.
- Playoffs.
- Discord linking and event delivery.

The visible old Energy claim control has no application action connected to it. Old contribution and bonus RPCs are not used by the current app.

**Assessment**

This is a large live-service product inside a game that does not yet have a validated active clan population.

Empty social spaces are worse than absent social spaces. They communicate that the game is inactive.

**Recommendation**

Launch-scope clans should contain only:

- Name.
- Heraldry.
- Roster.
- Member roles.
- One simple asynchronous weekly best-run goal.
- Chronicle recognition.

Hide advanced competition until defined active-population thresholds are reached.

**Priority:** P0 simplification  
**Confidence:** High

## Analyst

**Current behavior — confirmed**

The Analyst system can generate:

- Run insight.
- Seasonal archetype.
- Weekly digest.
- Season Recall.
- Scout information.

It uses deterministic fact sheets, optional LLM narration, fallback templates, scheduled processing, and optional email.

**Assessment**

The deterministic analysis is potentially valuable. Continuous LLM generation, email delivery, moderation, model changes, token cost, retry behavior, and support are an excessive operational burden before retention is proven.

**Recommendation**

- Keep deterministic local summaries.
- Keep templated fallback.
- Defer routine LLM generation and email.
- Reintroduce generated narrative only when players repeatedly engage with the deterministic insight.

**Priority:** Defer  
**Confidence:** High

## Current daily experience

SupaSnake does not currently have one daily rhythm. It has several unrelated clocks and reward surfaces:

- Daily contracts.
- Daily leaderboard.
- Streak day.
- Offline progress.
- Legacy daily reward API.
- Premium monthly stipend.
- Season progression.
- Weekly Anomaly.
- Weekly clan systems.
- Analyst cron outputs.

This is timer fragmentation rather than a world day.

---

# Player journey analysis

## First five minutes

### Current understanding

The player sees:

- Home.
- Launch.
- PRIMAL.
- Board.
- Minimal movement guidance.
- Immediate control.

### Goal

Move, eat, survive.

### Decisions

- Direction.
- Food path.
- First risk.
- Eventually BANK or continue.

### Motivation

Immediate competence and curiosity.

### Confusion and churn risk

Low after FTUE v2, provided:

- Consent never obstructs Launch.
- Bootstrap failures remain recoverable on Home.
- No optional meta system appears.

### Systems that should remain hidden

- Contracts.
- Seasons.
- Breeding.
- Clans.
- Collection completion.
- Analyst.
- World Signal.
- Account creation.

## First session

### Current understanding

The run is clear. The Results screen can expose many progression systems at once.

### Goal

Understand what happened and immediately try again.

### Decisions

- Replay.
- Home.
- Lab.
- Inspect rewards.

### Motivation

- Beat the previous score.
- Understand DNA.
- Try a better route.

### Confusion and churn risk

The result screen can imply that:

- Genome.
- Codex.
- Streak.
- Mastery.
- Achievements.
- Analyst.

are all equally important.

### Recommended visibility

Only:

- Score.
- Personal best.
- DNA.
- Replay.
- One optional Lab CTA after the first result.

## First day

### Current experience

Lab, variants, contracts, season, Energy, and progression badges can begin competing for attention.

### Risk

The player concludes that account administration is the “real game.”

### Recommended focus

- Learn BANK/PASS.
- Establish one preferred dynasty.
- Understand DNA.
- See Mastery as the main long-term path.

Keep seasons and clans hidden.

## Days 2–7

### Current experience

Genome tags, expression, INFUSE, spawn lineage, splices, Codex, and apex systems unlock across bank-count thresholds.

### Risk

Too many concepts appear before stable understanding.

### Recommendation

Expose a concept only after demonstrated use of the prior concept:

1. Gene icon and immediate effect.
2. Two matching strain points.
3. Expression.
4. INFUSE.
5. Limited lineage starting influence.
6. Advanced combinations only after repeated intentional use.

## Weeks 2–4

### Current experience

Most systems are visible. Collection, breeding, Codex, mastery, contracts, season, and Anomaly compete for the medium-term goal.

### Risk

No progression lane feels authoritative.

### Recommendation

Make the hierarchy:

1. Mastery.
2. Personal snake Lineage.
3. Curated Discovery.
4. Optional World Signal.

## Months 2–3

### Current experience

Season completion, weekly Anomaly, Records, collection completion, higher generations, and clan features are expected to carry engagement.

### Risk

- Checklist fatigue.
- Lack of a sovereign mastery goal.
- Repetition disguised by more meters.
- Operational systems with too few participants.

### Recommendation

Use:

- Mastery trials.
- Standardized Signal challenges.
- Chronicle goals.
- Distinctive lineage evolution.
- Trusted personal and global records.

## Veteran play

### Current experience

Veterans can pursue:

- Three dynasty mastery tracks.
- Gen50.
- Full collection.
- Records.
- Leaderboards.
- Anomaly.
- Clan competition.
- Seasonal progression.

### Risk

There are many completion surfaces, but only three primary core rulesets. The account may have more meters without more meaningful mastery.

### Recommendation

Veteran engagement should focus on:

- Standardized challenge conditions.
- Personal-best history.
- Verified ranking.
- Mastery trials.
- Cosmetic prestige.
- Shareable lineage.
- Optional asynchronous competition.

## Missing bridges

The largest missing bridges are:

- Results → one clear next action.
- Mastery → a visible skill challenge.
- Collection → emotional identity rather than quantity.
- Lineage → meaningful inheritance decisions.
- Daily return → one coherent ritual.
- Competitive aspiration → demonstrably fair ranking.

---

# 6. Daily-cycle research

Research supports a consistent pattern: durable return behavior comes from anticipation, autonomy, competence, and meaningful change—not punishment for absence.

Self-determination research found that perceived autonomy, competence, and relatedness independently predict enjoyment and future play intention. This favors optional challenges, visible mastery, and player choice over compulsory checklists.

Source: [Ryan, Rigby, and Przybylski — The Motivational Pull of Video Games](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf)

## Warframe

### Observed

- Daily Tribute is cumulative.
- Missing days delays the next milestone rather than resetting progress.
- Milestones can offer reward choice.
- Nightwave later added recovery of unfinished weekly acts.

Sources:

- [Warframe cumulative login clarification](https://www.warframe.com/en/news/attention-xbox-tenno-3)
- [Daily Tribute milestone design](https://www.warframe.com/en/patch-notes/pc/23-10-0)
- [Nightwave recovery](https://www.warframe.com/th/patch-notes/pc/35-0-0)

### Transferable principle

Missing a day should delay progress, not destroy accumulated value. Choice improves ownership.

### Do not copy

Warframe’s large number of simultaneous currencies, vendors, and progression tracks.

## Deep Rock Galactic

### Observed

- Active challenges are capped.
- A new challenge is added daily up to the cap.
- Challenges can be replaced.
- Ordinary play advances them.
- Previous seasons can be selected and their progress preserved.

Sources:

- [Season challenges](https://store.steampowered.com/news/posts/?appids=548430&enddate=1637160537&feed=steam_community_announcements)
- [Previous-season selection and preserved progress](https://store.steampowered.com/news/posts/?appids=548430&enddate=1717166690&feed=steam_community_announcements)

### Transferable principle

Cap active goals, align them with ordinary play, and archive paid progression.

### Do not copy

Multiple stacked assignments before SupaSnake has sufficient content density.

## Animal Crossing: New Horizons

### Observed

- The world advances in real time.
- Seasons and available discoveries change.
- Returning communicates that the world continued while the player was away.
- The routine remains player-paced.

Sources:

- [Nintendo game overview](https://animalcrossing.nintendo.com/new-horizons/explore/)
- [Nintendo UK overview](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-games/Animal-Crossing-New-Horizons-1438623.html)

### Transferable principle

A new day should change the world, not merely refresh a reward button.

### Do not copy

Real-time appointment pressure or maintenance chores.

## Helldivers 2

### Observed

- Shared orders and an evolving war connect individual sessions to a broader state.
- A human-directed layer can provide context and surprise.
- Warbonds do not expire.
- Later UI work improved context and history around the war.

Sources:

- [Evolving post-launch story](https://blog.playstation.com/2024/02/06/helldivers-2-story-recap-plus-free-post-launch-story-updates-confirmed/)
- [One-year retrospective](https://blog.playstation.com/2025/02/06/helldivers-2-one-year-later/)
- [Warbond guide](https://www.playstation.com/en-us/editorial/a-beginner-s-guide-to-helldivers-2/)
- [Control Centre update](https://arrowhead.zendesk.com/hc/en-us/articles/28203563503132-Machinery-of-Oppression-6-3-0)

### Transferable principle

Context makes repeated play meaningful, and paid progression should remain accessible.

### Do not copy

Human-directed, continuously authored world operations. That is an unsustainable solo-studio burden.

## Destiny 2

### Observed

Bungie’s newer Orders design explicitly moved away from objectives that forced particular activities or loadouts and toward automatic, context-compatible progress.

Sources:

- [Orders redesign](https://www.bungie.net/7/en/News/Article/twid_10_23_2025)
- [Ritual reset guide](https://help.bungie.net/hc/en-us/articles/360049199911-Destiny-2-Ritual-Reset-Guide)

### Transferable principle

Objectives should follow preferred play rather than pull players away from it.

### Do not copy

A dense web of ritual resets and vendor checklists.

## Hearthstone

### Observed

- Unpopular quests were removed or changed.
- Difficult quests were made easier.
- Players retained the ability to reroll undesirable objectives.
- Progression and rewards were centralized into a more coherent journal.

Sources:

- [Quest changes](https://hearthstone.blizzard.com/en-us/blog/23156370/)
- [Progression revamp](https://hearthstone.blizzard.com/en-us/news/23534414)

### Transferable principle

Allow choice and rejection. Do not demand disliked behavior.

### Do not copy

Multiple overlapping daily, weekly, event, and track progressions.

## Slay the Spire

### Observed

Daily Climbs create one recognizable rotating ruleset with worldwide comparison.

Source:

- [Slay the Spire Steam description](https://store.steampowered.com/app/646570/Slay_the_Spire/?cc=us&l=english)

### Transferable principle

One daily gameplay artifact can create variety and comparison with little metagame overhead.

### Do not copy

Rank pressure tied to exclusive progression rewards.

## Old School RuneScape

### Observed

The Collection Log emphasizes:

- Searchable discovery.
- Completion visibility.
- Account history.
- Prestige without requiring direct combat power.

Source:

- [Collection Log poll](https://oldschool.runescape.com/polls/2021/1616)

### Transferable principle

Collection can create identity and status without increasing power or earnings.

### Do not copy

Raw checklist scale without strong individual item meaning.

## Onboarding and interruption

Apple recommends avoiding premature rating and notification-permission interruptions during game onboarding.

Source:

- [Apple onboarding guidance for games](https://developer.apple.com/app-store/onboarding-for-games/)

SupaSnake’s FTUE v2 direction is aligned with this principle.

## Dark-pattern caution

A recent academic review identifies loss-driven streaks and time-limited progression as mechanisms that can turn return behavior into obligation.

Source:

- [Review of dark patterns in games](https://pmc.ncbi.nlm.nih.gov/articles/PMC13371737/)

## Research synthesis

The strongest principles for SupaSnake are:

1. One recognizable daily event is better than several reset surfaces.
2. The daily event should be gameplay, not a claim ceremony.
3. Missing days should create no debt and destroy no accumulated value.
4. Goals should respect playstyle choice.
5. Outcomes should settle automatically.
6. Daily progress should feed permanent mastery or identity, not a new currency.
7. Past paid progression should remain accessible.
8. Shared-world language must be backed by real state, not decorative fiction.
9. Community systems should scale only after population exists.
10. Daily systems must never obstruct Launch.

---

# 7. SupaSnake daily-world design

## Model A: Daily Run

A single standardized challenge changes every day.

### Transition timing

- 00:00 UTC.
- A run is stamped with its daily version when it begins.
- A reset never changes an active run.

### Login experience

Home shows one unobtrusive Daily Run card. It never auto-opens.

### What changed

- Featured dynasty.
- Seed.
- Modifier.
- Gene sequence or active gene pool.

### Claims

No claim button. Completion rewards settle automatically.

### Decisions

Enter or ignore.

### Goal

Complete or score well under equal conditions.

### Gameplay effect

One rotating ruleset using existing mechanics.

### Progression effect

- Modest DNA and Mastery.
- Cosmetic cumulative milestones.

### Metagame effect

- Personal history.
- Optional daily comparison.

### Missed days

- No penalty.
- Previous runs enter an unranked practice archive.

### Veteran experience

Same-condition skill comparison and personal bests.

### Expected duration

One normal run.

### Checklist avoidance

There is one action and no separate objective list.

### Advantages

- Lowest cost.
- Clearest.
- Gameplay-first.
- Uses existing Anomaly technology.

### Disadvantages

- The broader world does not strongly feel as though it advanced.
- Limited player choice.

## Model B: World Signal — recommended

One coherent daily briefing surrounds a standardized gameplay event.

### Transition timing

- One global server day at 00:00 UTC.
- This matches current daily contract and leaderboard boundaries.
- Every session receives its Signal date and content version at run creation.
- UI shows the reset in local time.

### Login experience

Nothing auto-opens.

Home keeps Launch primary and shows one line:

> WORLD SIGNAL: AURUM RESONANCE  
> New conditions detected.

Opening the Signal is voluntary and should take 30–60 seconds.

### What changed

The Signal contains:

- Yesterday’s automatically settled personal outcome.
- Today’s world condition.
- A standardized loaner snake/build or controlled eligible setup.
- One choice from up to three compatible objectives.
- One optional Signal run.

The objectives should represent different approaches to the same challenge, such as:

- Survival.
- Extraction.
- Build execution.

They should have equivalent reward value.

### Claims

There are no claim buttons.

- Rewards grant automatically.
- The briefing reports what was received.
- Chronicle records notable outcomes.
- The notification clears when the new Signal is viewed, not when a reward is claimed.

### Decisions

- Ignore and Launch an ordinary run.
- View the Signal.
- Choose one objective.
- Enter the standardized run.

### Goals

- Understand the changed world condition.
- Attempt one personally suitable objective.
- Improve a Signal result if desired.

### Gameplay effects

Use existing:

- Dynasty rules.
- Anomaly modifiers.
- Curated Genome subsets.
- Seeded food and decision sequences where appropriate.
- Server validation.

### Progression effects

- Normal DNA.
- Normal Mastery XP.
- A modest first-completion bonus.
- Cumulative, non-consecutive cosmetic milestones.

No:

- Signal currency.
- Consecutive-day multiplier.
- Exclusive power reward.
- Premium extra objective.

### Metagame effects

- Chronicle history.
- Personal Signal records.
- Later standardized rankings.
- A recognizable daily world rhythm.

### Missed days

- No streak loss.
- No backlog of seven objectives.
- One active Signal only.
- Previous Signals can remain as non-reward practice for a limited archive or curated rotation.
- Cumulative cosmetic milestones never expire.

### Returning-player experience

A concise “While you were away” summary:

- Current Signal.
- One or two material account developments.
- No cascade of claims.
- No missed-reward guilt.

### New-player experience

Hide the World Signal until approximately three successful banks.

The player should first understand:

- Movement.
- Survival.
- BANK/PASS.
- One dynasty.

Then introduce the Signal as a new way to test existing skill, not another progression system.

### Veteran experience

Veterans receive:

- Deterministic mastery conditions.
- Clean personal comparison.
- Trusted standardized rankings after leaderboard repair.
- Archived notable runs.
- Periodic cosmetic prestige.

### Expected duration

- Briefing: 30–60 seconds if opened.
- Signal play: one ordinary run.

### Checklist avoidance

- One active objective.
- No backlog.
- No claim step.
- No premium extra task.
- No penalty for ignoring it.
- Ordinary Launch remains primary.

### Advantages

- Creates a world-day feeling.
- Consolidates contracts and Anomaly.
- Supports autonomy.
- Reinforces core play.
- Uses existing technology.
- Scales from new player to veteran.

### Disadvantages

- More UI and content logic than Model A.
- Requires trusted versioning and settlement.
- Shared rankings require leaderboard repair.

### Recommended rollout

1. Build Model A as the minimum viable Signal.
2. Measure voluntary open rate, completion, repeat play, and ordinary-run cannibalization.
3. Add the short World Signal briefing.
4. Merge contracts only after the Signal proves useful.
5. Add aggregate community outcomes only if active population makes them meaningful.

## Model C: Living Dynasty

Each day produces breeding, expedition, Lab, or collection developments followed by a management decision.

### Transition timing

Daily completion of assignments, research, or genetic activity.

### Login experience

Review completed outcomes and select new work.

### What changed

- Breeding outcomes.
- Expedition returns.
- Lab discoveries.
- Collection production.

### Claims

Would naturally create claimable outcomes unless heavily automated.

### Decisions

- Select next assignment.
- Allocate snakes or resources.
- Choose research.

### Goals

Develop the collection and account while away.

### Gameplay effects

Indirect modifiers, resources, or unlocks.

### Progression effects

Strong account attachment but likely additional timers and economy layers.

### Metagame effects

The strongest “world moved while away” impression of the three models.

### Missed days

Requires caps, catch-up, and assignment handling.

### Veteran experience

Deep collection management.

### Expected duration

Several minutes before a run.

### Checklist risk

High.

### Advantages

- Strong lineage fantasy.
- Strong account attachment.
- Meaningful asynchronous developments.

### Disadvantages

- Timers.
- Claims.
- Appointment pressure.
- Balancing complexity.
- Monetization temptation.
- High operational and UX burden.
- Delays gameplay.

### Recommendation

Do not build this now.

It may become appropriate only if future evidence shows that lineage—not score mastery—is the primary reason players remain engaged.

## Recommended model

Build toward **Model B: World Signal**, beginning with Model A as its minimum viable version.

It creates anticipation through changed gameplay while preserving player freedom. It also gives Contracts and Anomaly one shared purpose instead of adding another independent system.

---

# 8. Simplification and removal candidates

## Remove

### Legacy 28-day daily reward API and RPC

**Reason**

The system is described as replaced but remains callable and can grant DNA and Energy.

**Treatment**

- Audit outstanding legitimate claims.
- Preserve historical data if needed.
- Disable new claims.
- Remove the faucet and associated code.

### Streak DNA multipliers

**Reason**

They turn absence into economic loss.

**Treatment**

- Preserve historical longest streak.
- Convert it to a Legacy Record.
- End future reward multiplication.

### Offline DNA per owned snake

**Reason**

It rewards collection quantity and waiting rather than mastery.

**Treatment**

- Remove the accrual.
- Preserve a non-economic “while away” summary if desired.

### Duplicate offline Energy restoration

**Reason**

Energy already has an authoritative timestamp-based regeneration path.

**Treatment**

- Remove Energy from offline claims.
- Use one server clock.

### Complete-dynasty DNA multiplier

**Reason**

Collection ownership should not create economy power, especially when variants can be purchased.

### Dead clan Energy and score surfaces

**Reason**

They expose inactive or disconnected mechanics and reduce trust in the UI.

## Merge

### Contracts and daily Anomaly

Merge into:

- One World Signal.
- One selected objective.
- One automatic outcome.

### Legacy achievements and Records

Records become the sole achievement language.

### Codex and Genome result announcements

Keep only the most meaningful first discovery in Results. Route the rest to Chronicle and notification digest.

### Season challenge and daily return communication

The active seasonal theme can shape the World Signal without creating a separate daily checklist.

## Simplify

### Results

Use:

1. Outcome and personal best.
2. Score and DNA.
3. Expandable progression digest.

### Genome

- Curated active pool.
- Fewer visible tiers.
- Limited splices.
- No automatic permanent seasonal expansion.

### Breeding

- Explicit inheritance.
- Bounded choice.
- Mechanical cap at Gen3.
- Higher generations as pedigree.

### Collection

- Fewer promoted variants.
- Stronger visual identity.
- No passive earnings.

### Clans

- Identity.
- Roster.
- One weekly goal.
- Hide everything else until population justifies it.

## Rename or clarify

### Generation 4–50

Present as pedigree or lineage depth, not increasing mechanical power.

### Skill brackets

Do not call generation-based groups “skill.” Use a true performance metric or remove brackets.

### Monetization promises

Either remove progression advantages and random paid outcomes or replace absolute claims with precise descriptions. Redesigning the system is preferred.

## Universalize

### Aim systems

Make them accessibility and preference settings rather than progression rewards.

## Delay

- Advanced clan Gauntlet.
- Clan research trees.
- Clan playoffs.
- Central Discord automation.
- Routine LLM Analyst narration.
- Analyst email digests.
- New dynasties.
- Permanent seasonal genes.
- Asynchronous Lab production.

## Archive

Historical planning documents should be visibly labeled as historical when they conflict with:

- Game Design V2.
- Player Flow & Interruption Policy.
- Buildcraft Genome Design.
- HUD Cockpit Redesign.
- Training Lab Design.
- Monetization Design.
- Player Identity V1.

## Remove stale configuration

Confirmed examples include:

- Old battle-pass duration and level assumptions.
- Unused DNA score multiplier values.
- Unused first-win bonus configuration.
- Unused combo-contract flag.
- Old base-stat residue.
- Outdated streak multiplier comments.

Dead configuration is not harmless. It creates ambiguity during every future change.

## Interruptions that should remain

The justified interruption set is:

- Legal consent where required.
- Critical blocking failure.
- Destructive run-abandon confirmation.
- Minimal first-movement instruction.
- Gene decision.
- Portal decision.
- Surge decision.
- Tactical hold and resume guidance.

Gene and portal decisions remain justified because they are the run’s strategic center and the simulation is stopped. They are not comparable to account prompts, reward claims, or contract dialogs.

---

# 9. Missing systems

## Essential technical and product foundations

### Clean product telemetry

Required events and timestamps should include:

- Launch click.
- Authentication start and end.
- Bootstrap start and end.
- Board ready.
- First movement.
- Run abandonment before movement.
- Run completion.
- Validation outcome and reason.
- Portal shown.
- BANK, PASS, or INFUSE.
- Gene offered.
- Gene selected or declined.
- Result screen reached.
- Replay, Home, or Lab next action.
- Feature first seen.
- Feature first used.
- World Signal opened.
- Objective selected.
- Signal started.
- Signal completed.

The current event taxonomy is broader than actual instrumentation. DAILY_LOGIN also fires from Home load rather than representing one server day.

### Clean cohorts

Separate:

- Production consumers.
- Internal developers.
- QA automation.
- Fixtures.
- Seeded data.

This could be achieved through:

- Explicit environment/test-account markers.
- Server-side event properties.
- Separate analytics filters.
- Exclusion from live economy and retention dashboards.

### Session lifecycle

Production currently contains a material number of unfinished session rows, and no implemented stale-session cleanup was found.

Add:

- Explicit abandoned state.
- Stale-session expiry.
- End-reason codes.
- Game/content version.
- Analytics exclusion rules.
- Ranked eligibility state.

### Competitive rules contract

Every ranked result should specify:

- Ended.
- Validated.
- Non-Free-Play.
- Content version.
- Assist configuration.
- Seed/mode where applicable.
- One rankable result per player for the board rule.
- Stable player identity mapping.

### Atomic economy settlement

All grants and claims should pass through one:

- Auditable.
- Idempotent.
- Atomic.
- Server-authoritative settlement path.

### Content authority

One living design authority should define:

- Active systems.
- Active currencies.
- Active Gene pool.
- Current season structure.
- Current economy multipliers.
- Feature flags.
- Deprecated systems.
- Player-facing terminology.

## Missing foundations for clarity and enjoyment

- Clear portal consequence preview.
- A three-layer result hierarchy.
- One post-run recommendation.
- Curated Genome content sets.
- Universal accessibility and aim settings.
- A readable in-game glossary linked from context.
- Better explanation of why a run succeeded or failed.

## Missing foundations for progression

- Deterministic breeding inheritance.
- A meaningful Gen3 cap.
- Mastery trials.
- Better variant identity.
- A single achievement system.
- A progression overview showing only Mastery, Lineage, and Discovery.

## Missing foundations for daily engagement

- One server-day definition.
- Automatic reward settlement.
- World Signal content versioning.
- Signal archive rules.
- No-loss returner handling.
- Notification state separate from reward state.

## Missing foundations for collection

- Strong visual differentiation.
- Snake-specific history.
- Ancestry presentation.
- A reason to favorite one snake.
- Collection prestige without economy power.

## Missing foundations for social value

- Population-gated social activation.
- Shareable Chronicle cards.
- Clear clan activity health.
- One simple asynchronous goal.
- Privacy-safe social defaults.

## Missing foundations for veteran engagement

- Trusted standardized challenge rankings.
- Dynasty mastery trials.
- Curated modifier rotations.
- Verified replay or ghost sharing.
- Personal-best comparisons across content versions.
- Cosmetic prestige tied to mastery.

## Optional future expansion

These can wait:

- Asynchronous friend challenges.
- Verified ghost races.
- Themed archived seasons.
- Cosmetic lineage evolution.
- Clan heraldry progression.
- Community Signal outcomes after sufficient population.
- Richer deterministic Analyst summaries.
- Carefully curated new dynasties.

---

# 10. Prioritized roadmap

Complexity estimates assume one developer:

- **S:** Several focused days.
- **M:** Approximately one to three focused weeks.
- **L:** Approximately one to two months.
- **XL:** Ongoing live-operation burden or more than two months.

These are relative estimates, not schedule commitments.

## Critical foundations

### 1. Define clean metrics and cohort separation

- **Player impact:** High indirect.
- **Design risk:** Low.
- **Technical complexity:** M.
- **Maintenance:** Low.
- **Dependencies:** None.
- **Incremental test:** Compare server events with session rows and controlled QA accounts.

### 2. Add stale-session lifecycle and content versioning

- **Player impact:** High indirect.
- **Design risk:** Low.
- **Technical complexity:** S–M.
- **Maintenance:** Low.
- **Dependencies:** Metrics contract.
- **Incremental test:** Verify abandonment, expiry, analytics exclusion, and leaderboard exclusion.

### 3. Fix duplicate Energy restoration

- **Player impact:** High economy integrity.
- **Design risk:** Low.
- **Technical complexity:** S.
- **Maintenance:** Low.
- **Dependencies:** No final Energy decision required.
- **Incremental test:** Time-based integration tests plus production shadow logging.

### 4. Disable orphan daily rewards

- **Player impact:** Medium trust and economy integrity.
- **Design risk:** Low.
- **Technical complexity:** S.
- **Maintenance:** Low.
- **Dependencies:** Audit legitimate outstanding claims.
- **Incremental test:** Confirm no active UI or legitimate current callers.

### 5. Make legacy reward settlement atomic, then migrate achievements

- **Player impact:** Medium.
- **Design risk:** Medium.
- **Technical complexity:** M.
- **Maintenance:** Low.
- **Dependencies:** Achievement-to-Records mapping.
- **Incremental test:** Replay migration in staging and reconcile balances.

### 6. Repair leaderboard eligibility and identity

- **Player impact:** High.
- **Design risk:** Medium.
- **Technical complexity:** M.
- **Maintenance:** Medium.
- **Dependencies:** Session versioning and aim policy.
- **Incremental test:** Seed invalid, duplicate, open, Free Play, and cross-version sessions.

### 7. Freeze new permanent mechanics

Freeze:

- New genes.
- New clan layers.
- New reward currencies.
- New daily surfaces.

- **Player impact:** High indirect.
- **Design risk:** Low.
- **Technical complexity:** S.
- **Maintenance:** Very low.
- **Dependencies:** Product approval.
- **Incremental test:** Release checklist enforcement.

## High-impact improvements

### 8. Simplify Results into three layers

- **Player impact:** High.
- **Design risk:** Low.
- **Technical complexity:** M.
- **Maintenance:** Low.
- **Dependencies:** Event instrumentation.
- **Incremental test:** Result dwell time, replay rate, next-action choice, and comprehension interviews.

### 9. Remove streak economy and offline DNA

- **Player impact:** High trust.
- **Design risk:** Medium.
- **Technical complexity:** M.
- **Maintenance:** Low.
- **Dependencies:** Economy migration and communication.
- **Incremental test:** Return behavior and sentiment without loss framing.

### 10. Run a no-Energy progression experiment

- **Player impact:** Very high.
- **Design risk:** Medium.
- **Technical complexity:** M.
- **Maintenance:** Low.
- **Dependencies:** Clean cohorts.
- **Incremental test:** Banked runs, session frequency, return rate, satisfaction, and purchase intent.

### 11. Curate a 12–16 gene active pool

- **Player impact:** Very high.
- **Design risk:** Medium.
- **Technical complexity:** L.
- **Maintenance:** Medium.
- **Dependencies:** Clean build telemetry.
- **Incremental test:** Gene recognition, pick rate, win rate, build diversity, and post-run explanation.

### 12. Redesign breeding around explicit inheritance

- **Player impact:** High.
- **Design risk:** Medium.
- **Technical complexity:** L.
- **Maintenance:** Medium.
- **Dependencies:** Economy and lineage policy.
- **Incremental test:** Deterministic prototype, choice confidence, repeat breeding intent, and regret.

### 13. Cap meaningful generation at Gen3

- **Player impact:** Medium–high.
- **Design risk:** Medium.
- **Technical complexity:** M.
- **Maintenance:** Low.
- **Dependencies:** Breeding redesign.
- **Incremental test:** Preserve all existing pedigree and test owner understanding.

### 14. Build World Signal MVP

- **Player impact:** High.
- **Design risk:** Medium.
- **Technical complexity:** M–L.
- **Maintenance:** Medium.
- **Dependencies:** Metrics, session versioning, automatic settlement, and leaderboard repair.
- **Incremental test:** Voluntary open rate, completion, ordinary-run cannibalization, replay, and D1/D7 return.

## Medium-term additions

### 15. Refocus Chronicle

Center it on:

- Mastery.
- Lineage.
- Records.
- Personal-best history.
- Signal history.

- **Player impact:** High.
- **Design risk:** Low.
- **Technical complexity:** M–L.
- **Maintenance:** Low.
- **Dependency:** Achievement consolidation.

### 16. Curate front-facing variants

- **Player impact:** Medium–high.
- **Design risk:** Medium.
- **Technical complexity:** L.
- **Maintenance:** Medium.
- **Dependency:** Art and lineage direction.

### 17. Add mastery trials

Use Training and Anomaly technology.

- **Player impact:** High for veterans.
- **Design risk:** Medium.
- **Technical complexity:** L.
- **Maintenance:** Medium.
- **Dependency:** Clean difficulty telemetry.

### 18. Convert seasons to archived cosmetic tracks

- **Player impact:** High trust.
- **Design risk:** Medium.
- **Technical complexity:** M–L.
- **Maintenance:** Medium.
- **Dependency:** Commerce policy.

### 19. Reduce clans to identity and one weekly goal

- **Player impact:** Medium.
- **Design risk:** Medium.
- **Technical complexity:** L.
- **Maintenance:** Medium.
- **Dependency:** Active-population threshold.

### 20. Remove stale configuration and authority conflicts

- **Player impact:** Medium indirect.
- **Design risk:** Low.
- **Technical complexity:** M.
- **Maintenance:** Low.
- **Dependency:** Deprecation inventory.

## Experiments requiring validation

- Energy-free progression versus current Energy.
- Three-layer Results versus current Results.
- One World Signal objective versus current pick-two Contracts.
- Twelve-, sixteen-, and nineteen-gene active pools.
- Deterministic inheritance draft versus random breeding.
- Universal Pathline versus a standardized no-assist ranked mode.
- One official Signal attempt versus unlimited best-score placement.
- Cosmetic-only collection completion versus DNA multiplier.
- Signal archive availability versus daily exclusivity.

## Deferred ideas

- Full community-controlled world state.
- Clan research trees.
- Clan playoffs.
- Automated Discord provisioning as a central product surface.
- Routine LLM-generated weekly emails.
- Seasonal permanent gene expansion.
- More dynasties.
- Asynchronous Lab production.
- Complex expedition timers.

## Things that should never be built

- A lost-day streak that reduces earnings or destroys progress.
- Expiring paid progression that cannot be completed later.
- Paid or indirectly paid randomized progression outcomes.
- More currencies used to disguise existing costs.
- Collection bonuses that create competitive or economic power.
- Mandatory return briefings.
- Claim cascades.
- Human-authored daily world operations requiring continuous solo-developer intervention.
- Permanent gene accumulation as the default seasonal strategy.
- Competitive brackets described as skill brackets when they measure spending or breeding progression.
- Systems whose primary purpose is increasing daily active users rather than making the game better.

---

# 11. Open design decisions

## Decision 1: What is SupaSnake selling?

### Recommendation

Sell:

- Cosmetics.
- Identity.
- Archived tracks.
- Supporter prestige.
- Premium presentation.

### Alternative

Sell:

- Energy.
- Faster progression.
- Additional daily objectives.

### Trade-off

Friction monetization may produce short-term revenue, but it conflicts with immediate-play positioning and creates continuous economy-balancing work.

## Decision 2: Should Energy remain?

### Recommendation

Test full removal before live commerce.

### Alternative

Retain it as a limited ranked-reward bonus while ordinary progression remains available.

### Trade-off

Removing Energy eliminates a monetization surface but simplifies:

- Onboarding.
- Economy.
- Testing.
- Messaging.
- Player trust.

## Decision 3: How large should the active Genome be?

### Recommendation

Use 12–16 active genes curated for distinct decisions.

### Alternative

Retain the full catalog and rely on FTUE gates.

### Trade-off

Gating delays confusion but does not reduce balance complexity. A curated pool sacrifices breadth to gain mastery and legibility.

## Decision 4: What should breeding mean?

### Recommendation

Ancestry plus explicit inheritance choices.

### Alternative

Random child generation and rerolls.

### Trade-off

Random breeding creates surprise and repeat spending. Deterministic breeding creates ownership, planning, and trust.

## Decision 5: Are aim systems progression or accessibility?

### Recommendation

Universal settings with a standardized ranked policy.

### Alternative

Keep them as unlocks.

### Trade-off

Unlocks provide rewards but compromise competitive comparability and accessibility.

## Decision 6: Is collection about completion or identity?

### Recommendation

Fewer distinctive snakes, stronger personal histories, no economic power.

### Alternative

Broad checklist collection.

### Trade-off

Checklist breadth is cheaper per entry but emotionally weaker and more expensive to sustain over time.

## Decision 7: When should clans expand?

### Recommendation

Only after a defined active-population threshold supports multiple real competing clans.

### Alternative

Expose the current complete system immediately.

### Trade-off

Early breadth may look impressive but produces empty social spaces and heavy operational obligations.

## Decision 8: What is the global day boundary?

### Recommendation

00:00 UTC initially.

### Alternative

Local-time reset.

### Trade-off

A global reset makes shared Signals, rankings, operations, and support simpler. Local resets feel more natural individually but fragment shared state and are more exploitable.

Because the recommended design has no streak penalty, the global boundary should be low-friction.

## Decision 9: Do seasons expire?

### Recommendation

The active theme rotates, but purchased tracks and cosmetic progression remain completable.

### Alternative

A conventional expiring pass.

### Trade-off

Expiration increases urgency. Archives build trust and reduce content waste.

## Decision 10: What is the dominant long-term fantasy?

### Recommendation

Master one dynasty, develop a meaningful personal lineage, and prove skill under changing conditions.

### Alternatives

- Complete every collection entry.
- Manage a growing Lab.
- Lead a clan.
- Chase seasonal content.

### Trade-off

The recommended fantasy compounds with the core run. The alternatives require substantially more content and operational support.

---

# Cross-cutting technical and product integrity findings

## Production data is not yet trustworthy for balance

Read-only production aggregate at audit time:

- 415 player rows.
- 15 players with at least one ended run.
- 237 session rows.
- 165 ended sessions.
- 72 open sessions.
- 11 validation-false sessions.
- 161 earning sessions.
- 4 Free Play sessions.

Directional earning-session results:

- Bank rate: approximately 32.9%.
- Median food count: 21.
- Median score: 160.

Directional dynasty observations:

- PRIMAL showed a higher bank rate than CYBER and COSMIC.
- CYBER showed a higher average score but substantially lower bank rate than PRIMAL.
- COSMIC had the smallest player sample.

These figures are not sufficient for balance decisions because:

- The unique-player sample is tiny.
- The data includes QA and developer behavior.
- Open sessions are not expired.
- Session versions are not cleanly separated.
- Some sessions are validation-flagged.

The correct conclusion is:

> SupaSnake does not yet have a trustworthy product dataset.

Do not nerf CYBER or buff COSMIC based on these figures.

## Open sessions

Approximately 30% of session rows were still open at audit time.

Possible explanations include:

- Abandoned tabs.
- Browser termination.
- Failed client settlement.
- Test fixtures.
- In-progress QA sessions.
- Launch drop-off.

No implemented stale-game-session cleanup was found.

This makes:

- Funnel analysis unreliable.
- Session-duration analysis unreliable.
- Active-session reporting unreliable.

## Analytics coverage

A substantial analytics event taxonomy exists, but repository usage is concentrated in a small number of Home, contract, legacy starter, and Training paths.

The current DAILY_LOGIN event can fire on Home load rather than representing a deduplicated server day.

Recommendation:

- Define events from product questions.
- Emit authoritative server events for economic and session outcomes.
- Version event contracts.
- Separate consented behavioral analytics from essential operational aggregates.

## Leaderboards

Confirmed concerns:

- Daily/weekly queries do not consistently require ended sessions.
- Validation is not consistently enforced.
- One player can occupy multiple daily/weekly rows.
- Global high score handling does not cleanly separate validation-flagged runs.
- Generation-based brackets are not skill brackets.
- Own-rank identity comparison uses the wrong identity relationship.

The Anomaly board is a better model because it more clearly filters completed, validated, non-Free-Play results and deduplicates by player.

## Achievement settlement

The legacy achievement claim route performs:

1. Mark claim.
2. Apply player balance.

as separate operations.

A failure between them can permanently consume a claim without granting the reward.

This is both a technical defect and a reason to retire the duplicate achievement system.

## Monetization configuration

Stripe remains in test/sandbox mode. This is an opportunity, not a blocker:

The economy can still be corrected before real purchases entrench:

- Energy sales.
- Progression advantages.
- Paid DNA.
- Randomized DNA-funded outcomes.

## Documentation and configuration debt

Several historical documents describe:

- Forced starter selection.
- Lab-centric onboarding.
- Breeding timers.
- Stat progression.
- More aggressive retention systems.

Those plans conflict with the current authoritative direction.

Recommendation:

- Keep history if valuable.
- Add clear historical/deprecated banners.
- Maintain one current product system index.
- Remove unused live configuration rather than relying on tribal knowledge.

---

# Final summary

## The five highest-priority findings

1. **The core game is strong and should be protected from further metagame intrusion.**
2. **Genome, breeding, and collection contain substantially more complexity than their current player value justifies.**
3. **Energy, streaks, offline rewards, and indirectly monetized randomness conflict with the product’s player-first trust promise.**
4. **Leaderboards, session lifecycle, and analytics require integrity work before retention or competitive conclusions are credible.**
5. **Daily engagement should become one optional gameplay-centered World Signal, replacing several administrative return surfaces.**

## Single recommended daily-cycle direction

Build the **World Signal**:

- Optional.
- Notification-led.
- One changed condition.
- One meaningful objective choice.
- One standardized gameplay event.
- Automatic settlement.
- No new currency.
- No streak loss.
- No backlog.
- Archived practice.
- Cumulative cosmetic recognition.

Start with the Daily Run alone. Expand only if it demonstrably improves voluntary return behavior.

## Systems to simplify, merge, delay, or remove

### Remove

- Legacy daily claims.
- Streak economy multipliers.
- Offline DNA.
- Duplicate Energy restoration.
- Collection DNA multipliers.
- Dead clan surfaces.

### Merge

- Contracts and Anomaly into World Signal.
- Achievements into Records.
- Secondary result unlocks into Chronicle/notification digest.

### Simplify

- Results.
- Genome.
- Breeding.
- Collection.
- Clan launch scope.

### Delay

- Advanced clan competition.
- LLM Analyst operations.
- Permanent seasonal genes.
- New dynasties.
- Asynchronous management systems.

### Preserve

- Existing ownership.
- Earned pedigree.
- Legacy accomplishments.
- Player history.
- Current core gameplay.
- Voluntary Training.
- Notification-first UX.

## First three implementation tasks after review

1. **Establish the measurement contract**
   - Clean cohorts.
   - Server-authoritative funnel events.
   - Stale-session expiry.
   - Content-versioned sessions.

2. **Ship an integrity patch**
   - Duplicate Energy restoration.
   - Orphan daily rewards.
   - Leaderboard eligibility and identity.
   - Atomic legacy reward settlement.

3. **Prototype the simplified Results hierarchy and a minimal Daily Signal behind feature flags**
   - Validate both before restructuring the wider progression system.

---

# 12. Monetization strategy

**Added:** 25 July 2026, as a first-class section of this audit rather than a
separate design pass. Monetization is not a layer applied to a finished game;
it is a set of promises about what the game will and will not do to the player.
Those promises constrain gameplay, progression, and metagame design, so they
belong here.

## 12.0 The governing principle

> Players should feel at home. Spending money should feel like supporting a
> game they enjoy and receiving genuine value in return — not like resisting
> constant pressure or escaping artificial frustration.

Everything below is a mechanical consequence of that sentence.

The operative test for any proposed offer:

> If the player could see the full five-year plan for this system in advance,
> would they feel respected or handled?

If the answer depends on the player *not* knowing something, the system is a
dark pattern regardless of how it is labelled.

## 12.1 The Survivor.io reading

The reference point is useful precisely because the diagnosis is split. Its
strengths are structural; its failures are almost entirely about *density and
framing*, not about the existence of commerce.

| Survivor.io property | Verdict | SupaSnake translation |
|---|---|---|
| Daily reset creates anticipation | Keep | One **World Signal** (section 7) — gameplay changes, not a shop rotation |
| Long-term progression sustains daily return | Keep | **Mastery** and **Lineage** as the visible spine (section 4) |
| Always a medium- and long-term goal | Keep | Mastery trials, Records, Chronicle, personal-best history |
| Spending accelerates, does not replace, gameplay | **Go further** | Spending does not touch progression at all — see 12.4 |
| Offers on almost every screen | Reject | Hard cap: **one commercial surface per screen, zero on game and Results** (12.8) |
| Clan play creates pressure to spend | Reject | No clan mechanic may be improved by money (12.6) |
| The game becomes an obligation | Reject | No streak economy, no expiring paid content, no energy (12.7) |

The distinguishing insight: Survivor.io's monetization is not disliked because
it *exists*. It is disliked because it is **ambient** — it never stops being
addressed to you. The single most valuable design decision SupaSnake can make
is to give commerce a *place* and then keep it there.

## 12.2 Confirmed monetization state — the honest baseline

**Current behavior — confirmed**

Five one-time SKUs plus one subscription, all in Stripe test mode.

| SKU | Price | Contents | Source |
|---|---|---|---|
| Energy Pack | €0.99 | 3 Energy | `src/lib/stripe/products.ts` |
| Energy Bundle | €2.49 | 10 Energy | same |
| Energy Vault | €4.99 | 25 Energy | same |
| Starter Bundle | €2.99 | 20 Energy + 1000 DNA + CYBER VORTEX (rare) | same |
| Dynasty Booster | €9.99 | 50 Energy + 3000 DNA + COSMIC SUPERNOVA (epic) | same |
| SupaSnake Premium | €9.99/mo, €89.99/yr | see below | `src/shared/config/premium.ts` |

Confirmed Premium perks:

- `stipendEnergyPerDay: 3` — +3 Energy every UTC day.
- `contracts.picksPerDayPremium: 3` vs `picksPerDayFree: 2`.
- `passiveProgress.maxOfflineHoursPremium: 48` vs 24.
- `breeding.maxActivePremium: 5` — **inert**; breeding is instant today.
- Monthly cosmetic drop (`premium_cosmetic_drops`, migration 028).

### The trust gap, stated precisely

`src/shared/config/premium.ts` opens with:

> "Never pay-to-win, no paid RNG: every perk is convenience, cosmetic or
> collection progression — never competitive power."

Four of the five live perks are progression velocity, and the paid DNA in both
bundles funds `breed_snakes` (migration 030), whose variant selection
(`030:278`), trait rolls (`030:297`), and lineage reroll (`030:543`) are all
`random()`. The accurate description of the shipped system is the audit's:

> Paid progression advantage with indirectly monetized randomness.

The claim is not a lie told on purpose. It is a promise written before the
implementation drifted. That is exactly how monetization trust is lost — not
through cynicism, but through a marketing sentence and a config file diverging
quietly over eighteen migrations.

**Priority:** P0
**Confidence:** High

### The energy SKUs are also functionally broken

`src/app/api/player/claim-offline/route.ts:107` clamps energy to `max_energy`
whenever it grants offline DNA:

~~~ts
const newEnergy = Math.min(player.energy + progress.energyRestored, player.max_energy || 5);
~~~

Migration `010_payment_hardening.sql:86-89` grants purchased Energy **uncapped**,
by explicit design comment ("purchased energy is not capped"). The premium
stipend (`028:382`) is uncapped too.

Consequence: a player buys the €4.99 Energy Vault (balance 25, cap 5), owns at
least one snake, and is away for one hour. `hasRewards` is true because offline
DNA accrued, the grant branch executes, and their balance is silently rewritten
to 5. **Roughly €4.00 of purchased goods destroyed**, with an
`economy_transactions` row recording only the DNA.

This is currently invisible because Stripe is in sandbox. On day one of live
commerce it becomes a refund and chargeback incident with no audit trail.

It is also, usefully, an argument that costs nothing to accept: the cheapest
correct fix for this defect is to stop selling Energy.

**Priority:** P0 — blocks live commerce
**Confidence:** High

## 12.3 The thesis: sell identity and continuity, never access or advantage

SupaSnake's monetizable asset is not the run. The run is short, repeatable, and
its value collapses the moment access to it is metered. The monetizable asset
is **the account** — the accumulated evidence that a specific person got good
at this game, bred a specific lineage, and was here for a specific era.

That is what the Chronicle, Records, Player Card, handles, badges, mastery
track, and lineage already are. Migration 022 shipped a full cosmetics
substrate — `cosmetic_definitions` (six slots: `title`, `banner`, `badge`,
`trail`, `board_accent`, `emblem`; rarity; dynasty; `season_seq`;
`mastery_rung`; `render` JSONB), a `player_cosmetics` inventory with permanent
ownership by construction (no expiry column), and a server-authoritative equip
flow. Migration 023 wires Records and mastery rungs into it. Migration 028 adds
subscriber drops.

**The infrastructure for the right monetization model is already built and
deployed. What is being sold instead is the game's own friction.**

The strategic reframing:

| Selling | Produces | Long-run |
|---|---|---|
| Access (Energy) | Revenue from players who want to keep playing | Punishes the most engaged players; conflicts with "wanting to play leads directly to play" |
| Advantage (DNA, contracts, offline caps) | Revenue from players who want to progress faster | Requires permanent economy re-balancing; makes every buff a pricing decision |
| **Identity (cosmetics, seasons, supporter status)** | Revenue from players who love the game | Compounds with Mastery/Lineage/Chronicle; costs nothing to balance |

Only the third scales for one developer over five years, because it is the only
one whose content cost does not grow with the balance surface.

**Recommendation**

Adopt as a locked product constraint:

> SupaSnake sells appearance, continuity, and patronage. It does not sell
> gameplay, currency, progress, time, information, or odds.

**Priority:** P0
**Confidence:** High

## 12.4 The offer architecture

Four products. No more. Each has a distinct emotional job.

### A. Keeper — the supporter subscription

*Job: "I want this game to still exist in three years, and I want that to
show."*

Replaces SupaSnake Premium. Rename away from "Premium," which implies a
better tier of play; "Keeper" implies stewardship of a lineage and of the game.

**Recommended price: €3.99/month or €34.99/year.** The current €9.99/month is
a serious error — it is Netflix-tier pricing for a solo-developed web game, and
it forces the perk list to justify itself, which is precisely how progression
advantages got in. A price that does not need justifying can afford to be
purely expressive. Lower price, higher conversion, better perk discipline.

Perks — all expressive or continuity, none touching progression:

- **Monthly cosmetic drop** — already built (`premium_cosmetic_drops`, 028).
  One curated item, permanently owned, never re-vaulted.
- **Keeper mark** on the Player Card and Chronicle, with tenure depth
  ("Keeper since Season 2"). Tenure is the reward; it cannot be bought
  retroactively, which is the one form of exclusivity that harms nobody.
- **Cosmetic loadout expansion** — additional saved loadouts and badge
  positions beyond the free pick-3 (`022` §6.5), for expression only.
- **Chronicle depth** — full personal-best history, run archive retention,
  and data export beyond the free window.
- **Dynasty colorways** — recolors of owned variants. Recolors, never new
  variants: a Keeper never owns a snake a free player cannot own.
- **Deterministic Analyst depth** — richer local run summaries (the
  deterministic path the audit recommends keeping; not LLM narration).

Explicitly **removed** from the current perk set: energy stipend, third
contract, extended offline cap, breeding queue slots.

**Lapse contract, stated on the purchase screen:**

> Everything you receive as a Keeper is yours permanently. If you stop, you
> keep every cosmetic, every drop, your full Chronicle, and your tenure record.
> You stop receiving new drops. Nothing is taken away and nothing is locked.

A subscription that can confiscate is a subscription players reason about
defensively. One that cannot is one they forget about in the good way.

### B. The Atelier — permanent cosmetic storefront

*Job: "I want my snake to look like mine."*

Direct à-la-carte purchase of `cosmetic_definitions` rows. One-time,
permanent, no currency intermediary — **priced in euros, bought once, owned
forever.**

- Price band €1.99–€6.99, keyed to craft rather than rarity theatre.
- **The catalog never rotates out.** Nothing is vaulted, retired, or made
  "unavailable." A player who discovers SupaSnake in 2029 can buy the Season 1
  trail. This forfeits scarcity urgency and buys something worth more: a
  storefront no player ever has to check anxiously.
- **No cosmetic is exclusive to money.** Every slot has strong earned entries
  from Mastery rungs (`mastery_rung`, 022), Records tiers (023), and Signal
  milestones. Bought items sit beside earned ones without outranking them.
- No loot boxes, no gacha, no "chance to receive." Ever. The player sees the
  item, pays for the item, receives the item.

Implementation note: `cosmetic_definitions` currently has no price or SKU
column. The storefront needs a nullable `price_eur` + `stripe_price_id`
(NULL = earned-only, which must remain the default for existing rows) and a
`purchase` source value in `player_cosmetics.source`. Grants continue through
the existing SECURITY DEFINER path.

### C. Chronicle Season — a cosmetic track that never expires

*Job: "I want a set of goals with an ending, and a memento of the era I played
in."*

One-time €4.99 per season. Cosmetic and narrative rewards only.

Following the Deep Rock Galactic model the audit already cites:

- **The active theme rotates. The track does not expire.** A purchased season
  can be selected and completed at any future date, at the player's pace, with
  progress preserved.
- **A free lane exists** on every season and is genuinely worth playing — not
  a teaser. Free players get fewer items, never worse gameplay.
- The track advances through **ordinary play**, in whatever dynasty the player
  prefers. It never demands a playstyle (Destiny 2's Orders correction).
- Seasons deliver **no permanent mechanical content** — no seasonal genes, per
  progression finding 9. Theme, curated existing modifiers, cosmetics,
  Chronicle history.
- Buying late is never punished. Buying a season mid-way grants retroactive
  progress from runs already played.

### D. Founding Keeper — one-time patronage

*Job: "I don't want a subscription, but I want to pay you."*

A single permanent purchase (recommended €24.99) granting: a permanent
Founding Keeper mark, the current season, a distinctive cosmetic set, and
Chronicle recognition of the era. No ongoing perks — this is patronage, not a
lifetime subscription, and should be described as such so nobody buys it
expecting perpetual drops.

Offered once per player, permanently available, never discounted. A
subscription-averse audience is real and currently unserved.

### What is never sold

Locked list. Any future proposal to sell one of these should be treated as a
change to the product's identity, not a pricing experiment.

- Energy, or any other gate on playing.
- DNA, or any other spendable progression currency.
- Snake variants, traits, genes, splices, or heirlooms.
- Reroll tokens or any influence over breeding outcomes.
- Contract slots, objective counts, or Signal attempts.
- Offline accumulation, caps, or rates.
- Mastery XP, Season XP, or any progression rate.
- Leaderboard eligibility, placement, or protection.
- Aim systems or any planning information (per finding 7 these become
  universal settings).
- Randomized outcomes of any kind, directly or through an intermediate
  currency.
- Anything that expires, decays, or can be confiscated.

## 12.5 Permanent versus consumable

**The rule: SupaSnake sells nothing consumable.**

| Category | Permanence | Rationale |
|---|---|---|
| Cosmetics (Atelier, drops, season track) | Permanent, account-bound | Ownership is the product |
| Season track access | Permanent, completable forever | Expiry converts a gift into a deadline |
| Founding Keeper | Permanent | Patronage is not a subscription |
| Keeper subscription | Recurring **access to new drops only** | The only recurring thing is *new* content; nothing already given is rented |
| Everything else | Not sold | — |

The zero-consumable position is deliberate and it costs money. Consumables are
where free-to-play revenue concentrates, and refusing them means SupaSnake's
ARPPU will be materially below a comparable game with energy refills and DNA
packs. That is the trade being made knowingly.

What it buys: **the player never has to audit their own balance.** No stock to
run down, no top-up prompt at the moment of frustration, no mental accounting
during a run. Every purchase is a decision made once, calmly, outside the
gameplay loop. That is the entire difference between "supporting a game" and
"feeding a meter," and it is not achievable while any consumable is on sale.

It also eliminates an entire class of engineering work — balance passes, grant
idempotency for consumables, refund reconciliation against partially-spent
balances, and the exact bug documented in 12.2.

**Priority:** P0 design constraint
**Confidence:** High

## 12.6 Reasons to spend, without pay-to-win

Cosmetic monetization fails when cosmetics are decoration. It succeeds when
they are **evidence**. The design job is to make appearance carry meaning that
the player wants to be true about themselves.

SupaSnake has an unusual advantage here: it already has three earned identity
substrates — Mastery, Lineage, and Records. Purchased items should *compose*
with those rather than compete with them.

Six mechanisms, in rough order of strength:

1. **Bought frames, earned contents.** A purchased Chronicle banner or Player
   Card layout displays *earned* achievements — mastery rungs, Records tiers,
   personal bests, lineage depth. The player pays for a better way to show what
   they did. Nobody can buy the substance, and the frame is worthless without
   it. This is the strongest available mechanism and it is nearly free to build
   on top of 022/023.

2. **Lineage expression.** Colorways, trails, and emblems applied to *a
   specific bred snake*, inherited visually by its descendants. This makes
   cosmetics compound with the lineage fantasy the audit identifies as
   under-served. A snake that looks like yours because you made it look that
   way, three generations ago, is not decoration.

3. **Era markers.** Season and tenure marks that state *when* someone played.
   Unbuyable retroactively — the one exclusivity that harms no future player,
   because a 2029 arrival was never going to be a Season 1 player regardless of
   spending.

4. **Craft.** Some items should simply be beautiful enough to want. Animated
   trails, board accents, dynasty-signature emblems. This is where solo-dev
   craftsmanship outcompetes live-service volume — ten excellent items beat
   two hundred generated ones, and the audit's variant-identity finding
   (progression finding 5) already argues the same thing about snakes.

5. **Patronage as its own reward.** A meaningful minority of players buy
   because they want the game to survive. This works only if it is honest:
   say what the money does, and never dress patronage up as value.

6. **Gifting.** Letting a player buy a cosmetic for a clanmate converts
   affection into revenue without converting pressure into revenue. Defer
   until clans have a validated population (decision 7), then build it.

**What must never be a reason to spend:** relief from a wait, escape from a
penalty, catching up to a friend, or removing an obstacle the game created in
order to sell its removal. Every one of these is currently present in the
shipped build via Energy.

## 12.7 The free/paying balance — a stated contract

Both sides must be able to read the same document and feel it is fair. Publish
this, in-product, on the purchase surface.

### What every free player is guaranteed, permanently

- **Unlimited play.** Every run, forever, no gate, no meter, no wait.
- **Full progression.** Every DNA payout rate, every gene, every splice, every
  strain, every variant, every Mastery level, every Record, every Chronicle
  entry — all reachable by playing.
- **Full competition.** Identical leaderboard eligibility, identical ranked
  conditions, identical assist configuration (per finding 7), identical Signal
  attempts.
- **A worthwhile free season lane** every season.
- **A real cosmetic wardrobe** earned from Mastery rungs, Records tiers, and
  Signal milestones — not a starter set.
- **No advertising**, ever. No rewarded video, no interstitials, no
  sponsorship.
- **Every dark pattern in 12.8 is prohibited against them.**

### What paying gets

- Appearance the free player did not choose to earn.
- Continuity: drops, deeper history, retention, export.
- Recognition of patronage and tenure.
- **Nothing that changes a number the game computes.**

### The test

> A free player and a Keeper play the same run, on the same board, under the
> same rules, for the same rewards, and appear on the same leaderboard under
> the same conditions. They look different.

If a proposed perk fails that sentence, it is not a perk; it is a fee.

**Priority:** P0
**Confidence:** High

## 12.8 Cadence — daily, weekly, seasonal, without chore

The audit's World Signal (section 7) is the daily engagement design.
Monetization's job here is almost entirely negative: **stay out of it.**

### The commercial cadence is slower than the play cadence

| Cadence | Gameplay | Commerce |
|---|---|---|
| Daily | World Signal — one changed condition, one optional run | **Nothing.** No daily deal, no rotating shop, no login offer |
| Weekly | Anomaly / curated modifier | **Nothing.** |
| Monthly | — | One Keeper drop, delivered silently to inventory |
| Seasonal (~quarterly) | Theme rotation, curated modifiers, archived track | One season track offered once, then permanently available |

Four commercial events per year plus twelve silent deliveries. Compare against
Survivor.io's several per session. That contrast *is* the product positioning,
and it should be stated out loud in marketing.

### Hard placement rules

- **Zero commercial surfaces during a run.** No offers on the board, the
  cockpit, the portal decision, the gene offer, or the tactical hold.
- **Zero commercial surfaces on the Results screen.** The audit's
  three-layer result hierarchy (finding 8) contains no store entry point. The
  moment after a personal best is the most monetizable moment in the game and
  it must be left alone — using it is precisely how a game teaches players that
  their achievements are inventory for someone else's funnel.
- **At most one commercial surface per screen elsewhere**, and never the
  primary action.
- **The store is a destination, not an interruption.** It is reached by
  navigating to it. It never opens itself.
- **No push notification, email, or badge is ever commercial.** The
  notification centre carries game state only.

### Chore avoidance

Inherit the audit's rules and add the commercial corollaries:

- No login rewards, no daily claims, no streak economy (progression finding
  10 — remove `dnaMultipliers.streak` entirely).
- Season tracks advance from ordinary play and never expire, so there is no
  end-of-season sprint. **This is the single biggest chore-elimination
  available** — expiring passes are what convert a hobby into a schedule.
- One active Signal objective. No backlog, no catch-up, no debt.
- Returning after a long absence produces a summary, not a claim cascade.

## 12.9 Dark patterns — the prohibition list

Explicit, testable, and enforceable in code review. Grounded in the
dark-pattern review the audit cites, and in the failure modes of the reference
game.

### Prohibited: pressure

- Countdown timers on any offer.
- "Limited time," "last chance," "X remaining," or any scarcity claim.
- Vaulting, retiring, or making previously-sold cosmetics unavailable.
- Sales that punish earlier buyers; strikethrough anchor pricing; fake
  discounts; "was €19.99" for a price never charged.
- Dynamic or personalized pricing. Everyone sees the same price.
- Whale detection, spend-based targeting, or offers keyed to purchase history.
- Any offer triggered by a loss, a death, a failed extraction, or a
  frustration signal.

### Prohibited: obfuscation

- Premium currency. Prices are in euros. **DNA is earned-only and is never
  sold** — this single rule eliminates the entire class of "what did that
  actually cost me" confusion, and reversing it would silently re-monetize the
  randomness in migration 030.
- Bundles that mix earnable and unearnable goods to disguise the real price
  (the current Starter and Dynasty bundles do exactly this).
- Deliberately awkward quantities that strand leftover balance.
- Any purchase whose material outcome is not fully known before payment —
  restating progression finding 6's rule as a commercial one.

### Prohibited: coercion

- Loss framing. Nothing the player has may be reduced, expired, or
  confiscated to motivate a purchase.
- Social pressure as a revenue mechanism. No clan mechanic may be improved by
  money, no clan may be disadvantaged by having free players, and clan
  contribution must never be purchasable. *(Note: `dnaMultipliers.ts` currently
  applies a clan-duel-win DNA multiplier — a small step down this road, and it
  should be removed with the other economy multipliers.)*
- Manufactured friction sold back as convenience. If a wait exists only
  because it can be skipped for money, delete the wait.
- Anything resembling gambling: loot boxes, gacha, rate-up, pity timers,
  "chance to receive." SupaSnake sells named goods at named prices.

### Prohibited: exploitation of minors and vulnerable players

- No mechanic whose profitability depends on impaired judgment.
- Clear pricing, obvious purchase confirmation, no purchase flow reachable in
  under two deliberate taps from gameplay.
- Existing age-verification and legal infrastructure
  (`supabase/migrations/008_legal_compliance.sql`, `src/shared/config/legal.ts`)
  should be treated as a floor, not a ceiling.

## 12.10 Lifetime value through trust

The central strategic point, and the one that most distinguishes this plan from
conventional live-service practice:

> A solo developer cannot win on ARPPU. The available lever is **years**.

A player who spends €4/month for four years is worth far more than one who
spends €60 in three months and leaves feeling used — and costs far less to
support, because they never file a dispute, never need an economy re-balance,
and never write the review that suppresses the next thousand installs.

Every mechanism in this section optimizes duration over extraction.

### Concrete trust practices

- **No-questions refunds**, beyond the statutory EU withdrawal right already
  implemented. A refund costs one transaction; a bad refund story costs a
  reputation.
- **Grandfathering.** Price increases never apply to existing subscribers.
  Announce changes at least 30 days ahead, in-product.
- **Never remove purchased content.** If a cosmetic must change for technical
  reasons, owners keep an equivalent and are told why.
- **Publish the economy.** State plainly what money does and does not do. The
  promise in 12.7 is a marketing asset precisely because competitors cannot
  copy it without dismantling their revenue model.
- **Correct the record when it drifts.** The `premium.ts` header claim (12.2)
  should be either made true or rewritten *before* live commerce, and this
  reconciliation should become a recurring release-checklist item.
- **No engagement-maximizing telemetry.** Instrument to understand whether the
  game is good, not to find the moment a player is most likely to break.

### The five-year test

Apply to any monetization proposal:

> If a player who has spent €300 over five years read our full internal
> reasoning for this system, would they feel it was designed for them or
> against them?

## 12.11 Migration path from the current implementation

Stripe is in test mode and no real purchase has settled. **This is the last
moment this can be done cleanly** — every one of the following becomes a
migration with a refund story attached once real money lands.

### Phase 1 — remove (before any live Stripe key)

1. **Delete `ENERGY_PRODUCTS`** (3 SKUs, `src/lib/stripe/products.ts`). Also
   resolves the purchased-energy destruction bug in 12.2.
2. **Delete `BUNDLE_PRODUCTS`** (2 SKUs). They carry DNA and variants and are
   the mechanism by which randomness is indirectly monetized.
3. **Strip the progression perks from `PREMIUM_CONFIG`**:
   `stipendEnergyPerDay`, `contracts.picksPerDayPremium`,
   `passiveProgress.maxOfflineHoursPremium`, `breeding.maxActivePremium`
   (already inert). Keep `enabled`, plans, `graceDaysPastDue`, and the
   cosmetic drop.
4. **Reprice** to €3.99/month, €34.99/year, and rename to Keeper.
5. **Remove the economy multiplier stack** (`src/lib/server/dnaMultipliers.ts`)
   — streak, set bonus, and clan-duel bonus together, per progression findings
   1, 4, and 10.
6. **Rewrite the `premium.ts` header claim** to describe what is actually
   shipped.

Phases 1.1–1.3 are contingent on the audit's Energy decision (decision 2). The
no-Energy experiment should therefore run *before* commerce launch, not after —
it is now a commercial blocker, not only a design question.

### Phase 2 — build

7. **Extend `cosmetic_definitions`** with `price_eur` and `stripe_price_id`
   (both nullable; NULL = earned-only, the default for all existing rows).
   Add `'purchase'` to the `player_cosmetics.source` vocabulary.
8. **Build the Atelier** on the existing 022 inventory and equip flow. This is
   a storefront over infrastructure that already exists — genuinely small.
9. **Convert the season track to cosmetic-only, non-expiring, retroactive**,
   with a real free lane (per progression finding 9 and decision 9).
10. **Ship Founding Keeper** as a single permanent SKU.

### Phase 3 — deepen

11. **Bought frames / earned contents** — Player Card and Chronicle layouts
    that display Mastery, Records, and lineage. Highest-value cosmetic work.
12. **Lineage expression** — per-snake colorways inherited by descendants.
13. **Gifting**, gated on validated clan population.

### Dependencies

Phase 2 depends on the audit's clean-telemetry work (roadmap item 1) to
distinguish real purchase intent from QA traffic. Phase 3 depends on the
Chronicle refocus (roadmap item 15). Nothing here depends on the World Signal,
and the World Signal must never depend on any of this.

## 12.12 Honest revenue expectations

**Speculation — flagged as such, and requiring validation.**

A cosmetic-and-subscription model with no consumables, no ads, and no urgency
will convert in the low single digits — plausibly 1–3% of retained players to
Keeper, with Atelier and season purchases concentrated in the same cohort. At
€3.99/month this is not a model that produces meaningful revenue from a small
audience.

Two honest consequences that follow, and that the plan should not obscure:

1. **Revenue scales with retained population, not with monetization pressure.**
   Every euro of upside comes from the audit's core recommendations — protect
   the run, repair leaderboard trust, consolidate the daily loop. Monetization
   work is not the growth lever here; it is the thing that must not destroy the
   growth lever.
2. **Below a few thousand retained players, this model funds hosting, not
   salary.** That is a real constraint on the plan, and the correct response is
   to be patient about audience rather than impatient about extraction — but it
   should be a decision made with open eyes, not discovered in month eight.

The alternative — retaining Energy, bundles, and paid progression — plausibly
produces more revenue per player in year one and less in year three, at the
cost of permanent economy-balancing work and the trust position that is
otherwise this game's most defensible asset.

### What to measure

Instrumented per the audit's telemetry contract, with clean cohorts:

- Retention by payer status. **If Keepers retain no better than free players,
  the perks are wrong** — this is the single most diagnostic metric available.
- Store visit rate from *deliberate navigation*, never from an interruption.
- Conversion, but paired with refund and cancellation rates, always read
  together.
- Subscription tenure distribution — the real target variable.
- Sentiment on monetization specifically, tracked as a first-class metric.
- **Explicitly not measured or optimized:** revenue per session, offers
  impressed per session, or anything that improves by showing players more
  commerce.

## 12.13 Open monetization decisions

### Decision 11: Does Energy survive as a monetization surface?

**Recommendation:** No. Remove it, and run the no-Energy experiment (roadmap
item 10) *before* the live Stripe key.
**Trade-off:** Forfeits three SKUs and the most reliable free-to-play revenue
mechanism, in exchange for the immediate-play promise, a far simpler economy,
and the honest version of the "never pay-to-win" claim.

### Decision 12: What is the Keeper price?

**Recommendation:** €3.99/month, €34.99/year.
**Alternative:** Retain €9.99/month.
**Trade-off:** The higher price requires perks substantial enough to justify
it, which is structurally how progression advantages entered the current build.
A price small enough to be an impulse of affection does not need justifying.

### Decision 13: Are any cosmetics money-exclusive?

**Recommendation:** No item is exclusive to money. Tenure and era marks are the
only unbuyable-retroactively items, and those are earned by presence, not
payment.
**Alternative:** A small money-exclusive premium line.
**Trade-off:** Exclusivity raises perceived value and directly contradicts
"free players are respected." Given that trust *is* the positioning, this is
not a close call.

### Decision 14: Does the season track ever expire?

**Recommendation:** Never. Purchased tracks remain completable indefinitely;
themes rotate.
**Alternative:** A conventional expiring pass.
**Trade-off:** Expiry reliably increases in-season engagement and reliably
converts the game into an obligation. This is the exact Survivor.io failure
mode the brief asks to avoid.

### Decision 15: Is DNA ever purchasable?

**Recommendation:** Never, in any form, including inside bundles.
**Trade-off:** This is the load-bearing rule. DNA funds `breed_snakes`, whose
outcomes are `random()`. Selling DNA in any quantity re-creates indirectly
monetized RNG regardless of what the marketing says — which is precisely how
the current build arrived at a false "no paid RNG" claim.

## 12.14 Monetization north star

Alongside the product north star, every commercial proposal must answer:

- Would a player who never spends still feel fully respected after this ships?
- Does this sell something the player *wants*, or relief from something the
  game *did to them*?
- Is the full outcome known before payment?
- Is it permanent?
- Would we be comfortable if a player read our internal reasoning for it?
- Does it appear only where the player went looking for it?
- Does it make the account more meaningful, or only more expensive?
- Would we still ship it if it made 20% less money but the game were 20% more
  loved?

If a monetization system cannot pass those questions, it should not ship — even
if revenue projections say it would work. Especially then.

---

# Product north star

Every future feature should have to answer:

- Does this make the run more enjoyable?
- Does this make the player care more about their snake?
- Does this reinforce skill, risk, or identity?
- Can the player understand it without external explanation?
- Does it create anticipation without punishing absence?
- Can one developer operate it reliably for five years?
- Can an existing system do the same job?
- Would removing something create a stronger game?

If a system cannot justify itself through those questions, it should not ship merely because it has already been designed or implemented.
