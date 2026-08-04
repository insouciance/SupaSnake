/**
 * Dynasty Rulesets - Design v2 Phase 1 keystone
 *
 * Shared by the client engine (SnakeGameLogic) AND the server validator
 * (gameValidator) so the server can recompute a run's payout exactly from
 * the raw food count. This is what makes server-authoritative scoring
 * possible: the client never has to be trusted about DNA totals.
 *
 * Determinism rules (enforced by tests):
 * - Integer math at every observation point: foodDnaValue returns integers,
 *   computeRunTotals is a pure fold over n = 1..foodCount.
 * - No RNG anywhere in scoring. Extraction spawn cadence randomness only
 *   affects WHEN the exit portal appears, never the payout.
 * - The only float->int boundary is the single Math.floor in applyOutcome.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import type { TerrainSchedule } from '@/shared/game/terrain';
import {
  MUTATION_ECONOMICS,
  foodValueFlatBonus,
  foodValueModifier,
  type MutationPick,
} from '@/shared/game/mutations';
import {
  traitFoodValueModifier,
  traitOutcomeDeltas,
  type TraitId,
} from '@/shared/game/traits';
import {
  anomalyBankOverride,
  anomalyFoodValueModifier,
  type AnomalyId,
} from '@/shared/game/anomalies';
// The clause math lives in `worldCondition.ts` and is imported here beside
// `anomalyFoodValueModifier` - the fold composes conditions, it never defines
// them (WP-2.10b).
import {
  conditionStrainThresholdDelta,
  normalizeCondition,
  type ConditionInput,
} from '@/shared/game/worldCondition';
import {
  computeLengthTrace,
  fusePicks,
  genomeClaimCaps,
  genomeFoodValueFlatBonus,
  genomeFoodValueModifier,
  genomeOutcomeMultipliers,
  strainActivations,
  tithePerFoodFloor,
  type GenomeCapsBasis,
  type GenomeClaimCaps,
  type GenomeRunInput,
  type LengthTrace,
  type StrainActivations,
} from '@/shared/game/genome';
import { rollExitInterval as rollPortalInterval } from '@/shared/game/portals';

export type DynastyName = 'PRIMAL' | 'CYBER' | 'COSMIC';

/** Exit-portal spawn cadence + lifetime (identical across dynasties for Phase 1). */
export interface ExtractionConfig {
  /** Foods eaten before the first exit portal spawns. */
  firstExitAtFood: number;
  /** After a despawn, the next portal spawns intervalBase +/- intervalJitter foods later. */
  intervalBase: number;
  intervalJitter: number;
  /** Ticks the portal stays on the board before despawning. */
  despawnTicks: number;
  /**
   * The portal window in SECONDS, overriding `despawnTicks` where present.
   *
   * `despawnTicks` is denominated in the wrong unit, and CYBER is where it
   * shows: 90 ticks was 18.0s at PRIMAL's then-200ms tick and 4.5s at CYBER's
   * floor, so the extraction window silently lost three quarters of its real
   * duration as the dynasty accelerated. Food has no deadline, which is why
   * eating stayed possible exactly as banking became impossible - the owner's
   * report was 'it's pretty impossible to bank past a certain speed... I was
   * able to eat food though'.
   *
   * Authored in seconds and converted by the live tick, so the window cannot
   * rot again when a speed curve is retuned.
   */
  despawnSeconds?: number;
}

export interface DynastyRuleset {
  id: DynastyName;
  /**
   * What a player is shown. Deliberately a SEPARATE field from `id`.
   *
   * The id is load-bearing in Postgres — `CHECK (dynasty IN
   * ('PRIMAL','CYBER','COSMIC'))` appears in five shipped migrations — and in
   * every replay contract and `SIGNATURE_GENES` key. Rendering the id as the
   * label made a Dynasty the one string in this product that could not be
   * rewritten without a data migration. It initialises to the id, so this
   * change renders byte-identically; it exists so the next rename is a copy
   * edit rather than a migration.
   */
  displayName: string;
  /** ms per tick as a pure function of foods eaten (0-based). PRIMAL: constant. */
  speedForFood(foodEaten: number): number;
  /** DNA value of the n-th food (1-based). Integer. */
  foodDnaValue(n: number): number;
  /** Score multiplier in effect when eating the n-th food (1-based). */
  scoreMultiplier(n: number): number;
  extraction: ExtractionConfig;
  /**
   * The arena schedule (WP-3.03): terrain that closes the board from the
   * outside in. Absent on dynasties whose difficulty comes from elsewhere.
   */
  arena?: TerrainSchedule;
  validation: {
    /** Per-dynasty food-rate sanity bound (foods per second of run duration). */
    maxFoodPerSecond: number;
  };
  /**
   * COSMIC only: the constellation wave + its calcification window.
   * Presence of this field is what switches the engine into scattered-star
   * spawning and into calcifying whatever the window closes on.
   */
  constellation?: typeof COSMIC_CONSTELLATION;
  /**
   * The board wraps at every edge, permanently (DYNASTY_COSMIC §2.1).
   *
   * Not a phase, not a pickup, not a window: a property of the dynasty's
   * board. It replaced `flux`, a 75-tick open / 50-tick closed wall cycle,
   * on the owner's ruling that "the wall cycle is pretty useless - I never
   * really use it, and for what?". The specific culprit was INTERMITTENCY:
   * players absorb a wrap-around board easily when wrapping is constant,
   * because it becomes part of the spatial model, and cannot absorb a rule
   * that toggles every 8-12 seconds. Consistent rules produce skill.
   */
  torus?: boolean;
}

/** Extraction banking outcomes: leave through the portal or die trying. */
export const BANK = {
  /** Banked payout multiplier when the run ends through the exit portal. */
  extractMultiplier: 1.25,
  /** Salvage payout multiplier when the run ends in death. */
  deathMultiplier: 0.6,
} as const;

/** PRIMAL base DNA per food - single source of truth in GAME_CONFIG. */
export const FOOD_BASE_DNA = GAME_CONFIG.economy.dna.foodValue; // 10

/** Base display-score points per food (multiplied by scoreMultiplier). */
export const FOOD_BASE_SCORE = 10;

/** Shared Phase 1 extraction cadence: first portal at 15 foods, then every 12 +/- 4. */
const EXTRACTION_DEFAULTS: ExtractionConfig = {
  firstExitAtFood: 15,
  intervalBase: 12,
  intervalJitter: 4,
  despawnTicks: 90,
};

/**
 * CYBER's arena (WP-3.03, DYNASTY_CYBER §2.2).
 *
 * CYBER is the one dynasty the board has never threatened: its all-time
 * occupancy ceiling is 21.8% against PRIMAL's 45.8%, and a good banked run
 * ended at 13.5% - a board 86% empty. Its difficulty was entirely tempo, and
 * tempo runs out at the reaction floor.
 *
 * So the arena hardens instead: six blocks every five foods, outermost ring
 * first. The outer ring of a 20x20 holds 76 cells, so it completes around food
 * 65 - which lands on the terminus rather than before it. A second ring is a
 * ladder rung, not base content.
 *
 * It is also the cure for the defect that ended the owner's CYBER run: ticks
 * per food climbed 18 -> 113 because at speed you cannot take the short line.
 * A closing board caps how far the short line can be, so the schedule is
 * simultaneously the difficulty source and the fix for the dead time.
 */
/**
 * CYBER's own extraction config: the same cadence, a window that holds its
 * real duration. 18 seconds was authored to match PRIMAL's, which is the point
 * - the decision should cost roughly the same wherever it is made. WP-3.08's
 * tempo change moved PRIMAL's to 15.75s (see PRIMAL_SPEED_MS); the two are
 * still the same decision, which is what the ruling was about, rather than the
 * 4x gap it repaired.
 */
export const CYBER_EXTRACTION: ExtractionConfig = {
  ...EXTRACTION_DEFAULTS,
  despawnSeconds: 18,
};

export const CYBER_ARENA: TerrainSchedule = {
  source: 'cyber',
  blocksPerInterval: 6,
  intervalFoods: 5,
  formingSeconds: 2,
};

/**
 * CYBER's tick floor (DYNASTY_CYBER §2.2), raised from the global 50ms.
 *
 * The first redesign floor of 100ms produced a x2 terminal tempo that the
 * owner found reaction-dominated. The ruled precision band is x1.6-x1.7, with
 * 120ms (x1.67) preserving a thrilling terminal speed while leaving route
 * planning and precise input responsible for the outcome.
 */
export const CYBER_TICK_FLOOR_MS = 120;

/**
 * CYBER's per-food hyperbolic decay.
 *
 * Slowing the decay from 0.03 to 0.02 keeps acceleration alive through roughly
 * the same pressure horizon: food 30 reaches 125ms (x1.6) and food 33 reaches
 * the 120ms floor. Raising the floor alone would have ended the speed story
 * around food 23 and handed too much of the late run to arena pressure alone.
 */
export const CYBER_SPEED_DECAY_PER_FOOD = 0.02;

/** CYBER speed tier for the n-th food (1-based): floor(n/5), capped at 4. */
function cyberTier(n: number): number {
  return Math.min(4, Math.floor(n / 5));
}

/** CYBER DNA multiplier: 1 + 0.5 * tier, so x1 -> x3 by food 20. */
function cyberMultiplier(n: number): number {
  return 1 + 0.5 * cyberTier(n);
}

// =============================================================================
// SCORE CURVES (WP-3.08 / D3 - Constitution §6.1, "Per-dynasty curves (v1.4)")
// =============================================================================

/**
 * The food count the three score curves are balanced at.
 *
 * D1's candidate median run is ~48 foods (REDESIGN_WAVE §1.3), and every
 * food-indexed dial in the catalog is being re-based against it, so it is the
 * only honest place to compare curves. §6.1 asks for "comparable integrals at
 * the terminus" and §17 item 30 sets the tolerance at ±10%; `rulesets.test.ts`
 * sums all three here and holds them inside it.
 *
 * Past the terminus the shapes diverge on purpose - that is the dynasty's
 * character, not a balance claim. This depends on the run ending at an
 * occupancy rather than at a clock (Rule 15): when the terminus is geometric,
 * eating faster finishes the run sooner instead of scoring more, which is what
 * collapses the measured ~10x Score-per-minute gap to the multiplier alone.
 */
export const SCORE_TERMINUS_FOODS = 48;

/**
 * PRIMAL's score shape: BACK-LOADED (§6.1; DYNASTY_PRIMAL §2.6).
 *
 * x0.5 on the first food, +0.1 every two foods, capped at x2.0 from food 30 on.
 * PRIMAL earns by depth - two thirds of a terminus run's Score sits past food
 * 20 - so the dynasty whose entire identity is "stay in longer" finally scores
 * like it.
 *
 * It shipped `() => 1`, which was half of why the ladder measured dynasty
 * choice rather than skill: CYBER carried a x3 curve while PRIMAL and COSMIC
 * carried none, and Score per minute differed by roughly an order of magnitude
 * (Constitution §15, overturn 19).
 *
 * Written as a division by ten rather than `0.5 + 0.1 * steps` so each value is
 * the exact double of its decimal literal - the tests pin x1.2, not
 * x1.2000000000000002.
 */
function primalScoreShape(n: number): number {
  return (5 + Math.min(15, Math.floor(n / 2))) / 10;
}

/**
 * CYBER's score shape: FRONT-LOADED with a decaying tail (§6.1).
 *
 * A tent on the four-food tier: x1 climbing to x3 across foods 16-19, then back
 * down the same steps to a x0.5 floor from food 36. Two thirds of a terminus
 * run's Score is earned in its first half.
 *
 * The decay is the Score half of the ruling that raised the tick floor
 * (WP-3.04): past the floor, speed stopped being difficulty and became
 * inefficiency - ticks per food climbed 18 -> 113 in the owner's banked run.
 * Paying less for those foods prices that honestly, and it gives the extraction
 * portal something to argue with, because the peak is where BANK is worth most.
 *
 * This is NOT the DNA multiplier. `cyberMultiplier` still shapes `foodDnaValue`
 * on its own five-food tier: Yield (§6.2) and Score (§6.1) answer different
 * questions, and one shared function was what conflated them.
 */
function cyberScoreShape(n: number): number {
  return Math.max(0.5, 3 - 0.5 * Math.abs(Math.floor(n / 4) - 4));
}

/**
 * COSMIC's score shape: MID-WEIGHTED (§6.1).
 *
 * A tent on the six-food tier peaking at x2.5 across foods 24-29 - the middle
 * of a terminus run - tapering to x0.5 at both ends. WP-3.08 authored it for
 * the combo ("a chain needs a run already in progress to exist at all"), and
 * WP-3.13 deleted the combo three days later. THE CURVE IS DELIBERATELY
 * UNCHANGED, because its actual justification survives the mechanic it was
 * written for: a mid-weighted shape pays where COSMIC's skill is expressed,
 * and the constellation is even more mid-run than the chain was. Early, a
 * short snake routes a perfect wave and abandons nothing, so there is nothing
 * to be good at; late, the board is debris and the route is forced. The middle
 * is where the abandonment decision is both live and winnable.
 *
 * Its integral is comparable to PRIMAL's and CYBER's at the terminus, which is
 * D3's whole point and is what `score.curves.test.ts` pins.
 *
 * Every value is a multiple of 0.5, and that USED to be load-bearing: it made
 * each per-food base Score a multiple of 5, and the combo stepped by 0.2, so
 * `round(base * combo)` never actually rounded and an honest max-combo run
 * could not round its way past `floor(baseScore * COSMIC_TRUST_MAX_BONUS_RATIO)`
 * and be clamped down for it. With no combo there is no product to round and no
 * ceiling to breach, so the constraint has dissolved. The granularity is kept
 * anyway - it costs nothing, and a curve whose values are exact is one fewer
 * thing to reason about if a per-food multiplier ever returns.
 */
function cosmicScoreShape(n: number): number {
  return Math.max(0.5, 2.5 - 0.5 * Math.abs(Math.floor(n / 6) - 4));
}

/**
 * PRIMAL's tick (DYNASTY_PRIMAL §2.5), its own constant as of WP-3.08.
 *
 * 175 ms, the midpoint of the doc's 170-180 band, down from the 200 it used to
 * borrow from `GAME_CONFIG.snake.initialSpeed`. It attacks the dead walk, not
 * the difficulty: the owner's record run measured seconds-per-food rising 3.0
 * -> 6.9 as occupancy grew (`s/food ~= 3.5 + 14.0 x occupancy`), and the
 * verdict on it was that the run was "eight minutes of setup to earn two
 * minutes of game". Every traverse gets 12.5% shorter in wall-clock while no
 * individual turn gets harder. Speed is CYBER's axis and must not be borrowed
 * further than this.
 *
 * It is a constant here, the way COSMIC_SPEED_MS is, because `initialSpeed` is
 * ALSO the numerator of CYBER's speed curve below. Retuning PRIMAL in `game.ts`
 * would have silently retuned CYBER with it.
 *
 * The shared `despawnTicks: 90` portal window rides this number: 15.75s at 175
 * ms, down from 18.0s. That is deliberate, not the unit rot `despawnSeconds`
 * exists to prevent - PRIMAL's tick is constant, so 90 ticks is a knowable 90
 * moves of runway whatever the tempo is, and a window that shortens with every
 * other traverse in the dynasty is the tempo change doing its job. CYBER needed
 * seconds because its tick halves *within* a single run.
 */
export const PRIMAL_SPEED_MS = 175;

/**
 * PRIMAL - Steady Growth: fixed speed, compounding food value.
 * Every food is worth round(10 * (1 + 0.02 * (n - 1))) DNA - the n-th food
 * is always worth at least as much as the one before it. Score is back-loaded
 * on its own curve (WP-3.08), which is the same statement made in the number
 * the leaderboard ranks.
 */
const PRIMAL: DynastyRuleset = {
  id: 'PRIMAL',
  displayName: 'PRIMAL',
  speedForFood: () => PRIMAL_SPEED_MS,
  foodDnaValue: (n) => Math.round(FOOD_BASE_DNA * (1 + 0.02 * (n - 1))),
  scoreMultiplier: (n) => primalScoreShape(n),
  extraction: EXTRACTION_DEFAULTS,
  validation: { maxFoodPerSecond: 1.0 },
};

/**
 * CYBER - Overclock: speed ramps with every food (the migration of the old
 * log curve, driven by food count instead of score) while a speed-tier
 * multiplier scales DNA: tier = floor(n/5) capped at 4, multiplier =
 * 1 + 0.5 * tier (x1 -> x3 from food 20 onward). Score is no longer that same
 * function - it is the front-loaded shape above (WP-3.08), which peaks with the
 * overclock and then decays.
 */
const CYBER: DynastyRuleset = {
  id: 'CYBER',
  displayName: 'CYBER',
  speedForFood: (foodEaten) =>
    Math.max(
      CYBER_TICK_FLOOR_MS,
      Math.floor(
        GAME_CONFIG.snake.initialSpeed / (1 + CYBER_SPEED_DECAY_PER_FOOD * foodEaten)
      )
    ),
  foodDnaValue: (n) => Math.round(FOOD_BASE_DNA * cyberMultiplier(n)),
  scoreMultiplier: (n) => cyberScoreShape(n),
  extraction: CYBER_EXTRACTION,
  // ARMED ONLY BECAUSE TERRAIN IS NOW DRAWN (WP-3.05).
  //
  // This line previously shipped six INVISIBLE instant-death blocks onto the
  // outer ring every five foods. Terrain was complete as physics — scheduled by
  // `placeDueTerrain`, solidified by `tickTerrain`, lethal in the collision
  // chain — and no component in the codebase rendered it. The player hit an
  // empty tile and died with no explanation.
  //
  // A full green suite could not see it: every terrain test asserts the MODEL,
  // and the model was never wrong. `terrain.visible.test.ts` now asserts the
  // connection instead, including this exact rule — a dynasty that schedules
  // terrain must have the renderer mounted.
  //
  // The forming phase is why arming it is fair at all: `terrain.ts` calls it
  // "not a courtesy - it is what makes terrain a positioning problem rather
  // than a random death". Invisible, it was only the random death; drawn as a
  // filling decal, it is the two seconds of warning it was always meant to be.
  arena: CYBER_ARENA,
  validation: { maxFoodPerSecond: 2.5 },
};

/**
 * COSMIC fixed tick speed - between PRIMAL (175 since WP-3.08) and CYBER's
 * 100ms floor. It was authored as "between PRIMAL's 200 and CYBER tier 1's
 * 150"; PRIMAL closing to 175 narrows that gap to 15ms but does not invert it,
 * and COSMIC stays the faster of the two fixed-tempo dynasties.
 */
export const COSMIC_SPEED_MS = 160;

/**
 * COSMIC's constellation wave (WP-3.13, DYNASTY_COSMIC §2.2).
 *
 * A constellation of `size` stars appears SCATTERED across the board with a
 * window. Every star not collected before the window closes CALCIFIES on its
 * own cell - one terrain block, permanent, lethal.
 *
 * That single mechanic is the dynasty. PRIMAL's pressure comes from success
 * (you eat, you grow, the board closes) and CYBER's from time (the arena
 * hardens on a schedule); COSMIC's comes from FAILURE - what you fail to
 * collect is what closes the board on you. The question stops being "how fast
 * can I eat" and becomes "which do I abandon, and where will its corpse sit
 * for the rest of my run?".
 *
 * It replaced the glyph-matching combo chain, which the owner ruled out
 * flatly: "it's not really fun to get the combos, it's just boring, has no
 * thrill factor." Three defects sat under that verdict, all provable from the
 * code: the x2.4 cap needed a chain of 8 that a wave of 3 could not produce;
 * `groupRadius: 4` made the "chain" a pile eaten in the order it happened to
 * lie in - Meier's OBVIOUS, the default path with a bonus on it; and the combo
 * was the one payout component the SERVER COULD NOT DERIVE, because it
 * depended on tick timing, so it arrived as a client claim and was clamped
 * rather than recomputed.
 *
 * That third defect is worth stating carefully, because the case for it
 * inverted a few days before this landed. While `scoreMultiplier` was
 * `() => 1` the combo touched Score not at all, and the complaint was that
 * COSMIC's only skill layer moved a number nobody ranks. WP-3.08 then gave
 * COSMIC a real score curve, so the combo began multiplying the RANKED number
 * - by way of a clamped client claim. That makes the argument for deleting it
 * stronger rather than weaker: a claim reaching Score is precisely what
 * Inviolable Rule 2 exists to prevent, and deleting the combo closed the only
 * such path in the codebase.
 *
 * WHY THE RATIO IS NOT A DIAL (§2.5). The window is fixed and the achievable
 * count degrades on its own: early, while the snake is short, a perfect route
 * collects all five; as it grows, the snake's own body blocks the optimal
 * path and the reachable count falls 5 -> 4 -> 3 -> 2. So COSMIC gets a
 * self-accelerating terminus for free - the longer the run, the more stars are
 * abandoned per wave, so debris arrives faster and faster - with no schedule
 * anywhere in it. Tune `windowSeconds`, never "how many they should get".
 *
 * `glyphCount` survives the combo it used to serve. Glyphs are now what they
 * always visually were: the hue of the constellation being traced (§2.3).
 */
export const COSMIC_CONSTELLATION = {
  /** Constellation hues. Cosmetic since WP-3.13 - never a chaining rule. */
  glyphCount: 3,
  /**
   * Stars per constellation. Must exceed what the window allows, or nothing
   * is ever abandoned and the whole mechanic is inert.
   */
  size: 5,
  /**
   * How long the constellation lives, in SECONDS.
   *
   * The tuning dial if calcification feels punishing - and the ONLY one. The
   * invariant to hold while tuning: abandonment must be common but not total.
   * If a competent player collects everything there is no decision; if they
   * collect almost nothing it is a death spiral rather than a route.
   *
   * Authored in seconds and converted by the live tick, for the reason
   * `terrain.ts` gives: three bounds in this wave were found denominated in
   * the wrong unit, and the extraction window silently lost three quarters of
   * its duration as CYBER accelerated. 8 s is 50 ticks at COSMIC's 160 ms.
   */
  windowSeconds: 8,
  /**
   * Minimum toroidal MANHATTAN separation between stars.
   *
   * Manhattan because the snake moves orthogonally, so it is literally the
   * travel cost. Toroidal because the board has no edges any more - and this
   * is what makes crossing the seam a real route rather than a disorientation
   * tax: a star that is 16 cells away the long way is 4 the short way.
   *
   * Replaces `groupRadius: 4`, which CLUSTERED the wave. A pile is not a
   * routing problem.
   */
  scatterMinCells: 5,
  /**
   * How long a missed star spends as a harmless floor decal before it turns
   * solid, in SECONDS. Matches CYBER's arena: the forming phase is what makes
   * terrain a positioning problem rather than a random death, and it is also
   * the moment the player reads "that one is gone".
   */
  calcifySeconds: 2,
} as const;

/**
 * COSMIC's YIELD curve (§6.2), re-based in WP-3.13. [H] both numbers.
 *
 * `foodDnaValue` was a flat 10 and had been since Phase 1, because the combo
 * WAS COSMIC's Yield story - the flat base was deliberate, with the chain
 * multiplying it. Deleting the combo removed the multiplier and left the base
 * standing alone, which is a 2.4x hole rather than a design.
 *
 * WHY RE-BASING IS LESS OF AN INVENTION THAN IT LOOKS. The x2.4 the balance
 * harness credited COSMIC with was FICTION: the cap needed a chain of 8 and a
 * wave of 3 could not produce one, so the target was never actually being met
 * and the combo was hiding that rather than delivering it. This does not
 * author a new intent; it makes COSMIC's Yield mean what the other two
 * dynasties' Yield already means.
 *
 * WHAT IT IS MATCHED AGAINST, and why not "the integral". Score integrals are
 * comparable by construction (WP-3.08, +/-10% at the terminus); YIELD
 * integrals never were, and are not now - at 48 foods CYBER pays 1210 and
 * PRIMAL 705, a 1.72x spread that predates this package and is deliberate,
 * because run LENGTH compensates (CYBER runs are short and PRIMAL's are long).
 * So the honest target is the one the project already uses for DNA: the five
 * archetypes' expected value in `genome.balance.test.ts`, within +/-15%. This
 * curve lands COSMIC's at -2.4%, and its integral falls between the other two
 * (931 at 48, against PRIMAL's 705 and CYBER's 1210) rather than on top of
 * either.
 *
 * THE SHAPE SAYS SOMETHING, which is the point of having three of them:
 *
 *   - PRIMAL compounds gently (+0.02/food, uncapped) - paid for surviving
 *     your own length.
 *   - CYBER steps in five-food tiers to x3 by food 20 - paid for surviving
 *     speed.
 *   - COSMIC compounds at DOUBLE PRIMAL'S RATE to the same x3 ceiling CYBER
 *     reaches, but by food 51 rather than food 20 - paid for surviving the
 *     board you built. The board closes on you faster than it closes on
 *     PRIMAL, because on COSMIC you are the one closing it.
 *
 * Same ceiling as CYBER, a different journey to it: "a choice of HOW you earn
 * rather than HOW MUCH" (Constitution §6.1, stated there about Score and true
 * of Yield for the same reason).
 *
 * NO DELIBERATE DISCOUNT was applied for the torus. It is tempting to argue
 * that a board with no walls is easier and should pay less, but DYNASTY_COSMIC
 * §2.1 argues the opposite and the production data agrees: a torus has no
 * corners to trap you and no edges to organise around, so managing your own
 * body is HARDER, and COSMIC is already the most self-collision-skewed
 * dynasty (self 11 / wall 6). The six wall deaths the torus removes are
 * replaced by debris. Parity is the honest starting point; the owner moves it
 * by playing.
 *
 * REJECTED, and worth recording: paying per food in proportion to the debris
 * on the board. Thematically perfect - you are paid for routing through what
 * you built - and fatal, because the server cannot know the debris count
 * without replaying the run. It would reintroduce exactly the bounded-trust
 * claim this package deleted.
 */
export const COSMIC_YIELD_STEP = 0.04;
export const COSMIC_YIELD_CAP = 3;

/** COSMIC's per-food DNA multiplier: 1 + 0.04(n-1), capped at x3 (food 51). */
function cosmicYieldMultiplier(n: number): number {
  return Math.min(COSMIC_YIELD_CAP, 1 + COSMIC_YIELD_STEP * (n - 1));
}

/**
 * COSMIC - Terraforming: a permanent torus, a fixed 160 ms/tick, and stars
 * that calcify where you left them.
 *
 * On a borderless board debris is the only structure that exists, so the
 * player is not choosing what to lose - they are choosing where to build.
 * Scatter your corpses and you fragment your own space into pockets you
 * cannot use; leave them in a line, wave after wave, and you have built the
 * scaffolding the torus denied you, exactly where you wanted it. Same
 * mechanic either way; the difference is entirely intent, which is the
 * definition of a skill.
 *
 * The tick stays slow deliberately (§2.6): it is not a difficulty setting
 * here, it is the thinking time the routing problem requires. Speed is
 * CYBER's axis and must not be borrowed.
 */
const COSMIC: DynastyRuleset = {
  id: 'COSMIC',
  displayName: 'COSMIC',
  speedForFood: () => COSMIC_SPEED_MS,
  foodDnaValue: (n) => Math.round(FOOD_BASE_DNA * cosmicYieldMultiplier(n)),
  // Yield and Score are DIFFERENT AXES and stay on different shapes: this
  // rises to a x3 ceiling while `cosmicScoreShape` is a tent that decays back
  // to x0.5. One shared function is what conflated them on CYBER (§6.1 vs
  // §6.2), and the two answer different questions - what the run is worth to
  // your economy, and what it is worth on the board.
  scoreMultiplier: (n) => cosmicScoreShape(n),
  extraction: EXTRACTION_DEFAULTS,
  // RE-DERIVED for the scattered wave (WP-3.13, §6 "rate bound"), not
  // inherited: the old 1.5 was denominated against CLUSTERED groups of 3,
  // an assumption this package deleted.
  //
  // Stars sit at least `scatterMinCells` apart in toroidal Manhattan terms,
  // and that distance is exactly the tick cost of travelling between them.
  // Clearing a wave of 5 therefore costs at least 4 x 5 = 20 ticks inside the
  // wave, plus at least one more to reach the first star of the next one:
  // 5 foods / (21 ticks x 0.16 s) = 1.49 foods/s. Starweaver's sixth star
  // only lowers it (6 / (26 x 0.16) = 1.44), because the extra star pays its
  // own separation.
  validation: { maxFoodPerSecond: 1.5 },
  constellation: COSMIC_CONSTELLATION,
  torus: true,
};

export const RULESETS: Record<DynastyName, DynastyRuleset> = {
  PRIMAL,
  CYBER,
  COSMIC,
};

export function getRuleset(dynasty: DynastyName): DynastyRuleset {
  return RULESETS[dynasty];
}

/**
 * Normalize an arbitrary dynasty string (session row TEXT, API payloads) to a
 * DynastyName.
 *
 * Unknown values fall back to PRIMAL. The fallback was COSMIC, chosen and
 * documented as "the conservative payout floor" because COSMIC's food value
 * was a flat 10 - and WP-3.13's Yield re-base made that false. PRIMAL is the
 * floor now, at every horizon a run actually reaches (below food 172 its
 * cumulative DNA is the lowest of the three, the single exception being food
 * 4, where CYBER is one DNA lower).
 *
 * The fallback is defensive only: every write path stamps one of the three
 * names, so it fires on malformed or legacy rows (the deprecated
 * EMBER/CRYSTAL/VOID trio) and nothing else. It should therefore keep doing
 * what it was chosen to do rather than keep the name it was chosen under.
 */
export function normalizeDynastyName(value: unknown): DynastyName {
  const name = typeof value === 'string' ? value.toUpperCase() : '';
  if (name === 'PRIMAL' || name === 'CYBER' || name === 'COSMIC') {
    return name;
  }
  return 'PRIMAL';
}

/**
 * One-line ruleset identity text - the UI's replacement for the retired
 * "+5% stat" copy (starter cards, variant details, pre-game overlay).
 */
export const rulesetExplainer: Record<DynastyName, string> = {
  PRIMAL: 'Steady speed — every food worth more than the last',
  CYBER: 'Speed rises — survive the overclock for up to ×3',
  COSMIC: 'No walls — the stars you leave behind turn solid where they sat',
};

/**
 * Deterministic run totals - THE scoring authority for client and server.
 * A pure fold over n = 1..foodCount with one Math.round per food.
 *
 * Mutations (Design v2 Phase 2): held [E] mutations modify each food's DNA
 * from their pick point onward via the shared foodValueModifier - the same
 * function the client engine applies per eat, so PRIMAL/CYBER recompute
 * stays exact under mutations. Score is deliberately mutation-free
 * (mutations shape the economy, not the leaderboard number).
 *
 * WP-3.13: this fold is now the WHOLE score on every dynasty. COSMIC's combo
 * was the one component that reached Score without being recomputed here -
 * it arrived as a client claim and was clamped rather than derived - and
 * deleting the combo closed that route entirely.
 *
 * Traits (Design v2 Phase 3A): the equipped snake's [E] traits modify each
 * food's DNA from food 1 via the shared traitFoodValueModifier, folded
 * into the SAME single per-food round as the mutation modifier - exactly
 * what the engine does per eat. Like mutations, traits never touch score.
 * The server reads traits from the snake row, never the client payload.
 *
 * Anomalies (Design v2 Phase 4B, section 7.2): the weekly anomaly's [E]
 * food modifier (Gold Rush x1.5) folds into the same single per-food
 * round. Like mutations and traits, anomalies never touch score - every
 * player on a week's board is ranked under identical scoring math. The
 * server reads the anomaly from the session row, never the claim.
 */
export function computeRunTotals(
  dynasty: DynastyName,
  foodCount: number,
  mutations: MutationPick[] = [],
  phoenixTriggeredAtFood: number | null = null,
  traits: TraitId[] = [],
  anomaly: AnomalyId | null = null
): { rawDna: number; score: number } {
  const ruleset = RULESETS[dynasty];
  const count = Number.isFinite(foodCount) ? Math.max(0, Math.floor(foodCount)) : 0;

  let rawDna = 0;
  let score = 0;
  for (let n = 1; n <= count; n++) {
    let mod =
      mutations.length > 0
        ? foodValueModifier(mutations, n, phoenixTriggeredAtFood)
        : 1;
    if (traits.length > 0) {
      mod *= traitFoodValueModifier(traits, n);
    }
    if (anomaly !== null) {
      mod *= anomalyFoodValueModifier(anomaly, n);
    }
    // Flat [E] bonus (Deep Roots, section 7.1): integer DNA added after
    // the single per-food round - the engine's eat path does the same.
    const flat =
      mutations.length > 0
        ? foodValueFlatBonus(mutations, n, phoenixTriggeredAtFood)
        : 0;
    rawDna += Math.round(ruleset.foodDnaValue(n) * mod) + flat;
    score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n));
  }
  return { rawDna, score };
}

/**
 * Apply the run outcome to the raw DNA total: banked (+25%) when the run
 * ended through the exit portal, salvage (60%) on death. The single
 * float->int boundary of the whole scoring pipeline.
 */
export function applyOutcome(rawDna: number, extracted: boolean): number {
  const raw = Number.isFinite(rawDna) ? Math.max(0, rawDna) : 0;
  return Math.floor(raw * (extracted ? BANK.extractMultiplier : BANK.deathMultiplier));
}

/**
 * Outcome multipliers under held mutations (section 5.2):
 * - Mirror Wager: bank x1.25 -> x1.50, salvage x0.60 -> x0.30.
 * - Compound Interest: bank +0.10 per mutation held (incl. itself).
 * - A Phoenix trigger voids the economic BENEFITS (Wager's x1.50 reverts
 *   to x1.25, Compound Interest is lost) while the Wager's x0.30 salvage
 *   cost persists - so reporting a trigger never raises a payout.
 * Mutation effects modify the outcome multiplier only. There is no account
 * stack left to reach: WP-0.02 deleted the streak / collection-set /
 * clan-duel multipliers, so a settled payout is the raw fold times this
 * outcome multiplier and nothing else (Constitution §8.5).
 *
 * Trait outcome effects (section 6.2: Gambler / Patient / Hoarder) stack
 * ADDITIVELY on top of the mutation-shaped multipliers - Gambler+Patient
 * bank = 1.25 + 0.10 + 0.10 = 1.45 as specced. Phoenix never voids trait
 * deltas (traits are snake identity, not run pickups). Both multipliers
 * are floored at 0 so pathological stacks can never pay negative.
 *
 * Anomaly outcome effects (section 7.2): Twin Exits replaces the BASE
 * bank (x1.25 -> x1.15) before mutation/trait shaping - so Mirror
 * Wager's absolute x1.50 and every additive delta behave identically on
 * and off the board. Salvage is never anomaly-shaped.
 */
export function outcomeMultipliers(
  mutations: MutationPick[],
  phoenixTriggered = false,
  traits: TraitId[] = [],
  anomaly: AnomalyId | null = null
): { bank: number; death: number } {
  let bank: number =
    anomalyBankOverride(anomaly) ?? BANK.extractMultiplier;
  let death: number = BANK.deathMultiplier;
  const ids = new Set(mutations.map((m) => m.id));
  if (ids.has('mirror_wager')) {
    death = MUTATION_ECONOMICS.mirrorWagerDeath;
    if (!phoenixTriggered) bank = MUTATION_ECONOMICS.mirrorWagerBank;
  }
  if (ids.has('compound_interest') && !phoenixTriggered) {
    bank += MUTATION_ECONOMICS.compoundInterestPerHeld * mutations.length;
  }
  // Overclock Harvest (CYBER M9, section 7.1): bank +0.15 is a benefit
  // (voided post-Phoenix), the 0.45 salvage is a cost (persists). Rounded
  // to 4 decimals like the trait deltas so 1.25 + 0.15 IS 1.40 exactly.
  if (ids.has('overclock_harvest')) {
    death = Math.round(
      Math.max(0, death + MUTATION_ECONOMICS.overclockHarvestDeathDelta) * 10000
    ) / 10000;
    if (!phoenixTriggered) {
      bank = Math.round(
        (bank + MUTATION_ECONOMICS.overclockHarvestBankDelta) * 10000
      ) / 10000;
    }
  }
  if (traits.length > 0) {
    const deltas = traitOutcomeDeltas(traits);
    // Round to 4 decimals: additive float deltas must land exactly on the
    // specced multipliers (0.60 - 0.15 must BE 0.45, not 0.4499999...),
    // or the single floor at the end pays one DNA short of the spec.
    bank = Math.round(Math.max(0, bank + deltas.bank) * 10000) / 10000;
    death = Math.round(Math.max(0, death + deltas.death) * 10000) / 10000;
  }
  return { bank, death };
}

/**
 * Mutation- and trait-aware applyOutcome: same single float->int boundary,
 * with the outcome multiplier shaped by held mutations and the equipped
 * snake's traits. With neither held this is exactly applyOutcome.
 */
export function applyOutcomeWithMutations(
  rawDna: number,
  extracted: boolean,
  mutations: MutationPick[] = [],
  phoenixTriggered = false,
  traits: TraitId[] = [],
  anomaly: AnomalyId | null = null
): number {
  const raw = Number.isFinite(rawDna) ? Math.max(0, rawDna) : 0;
  const { bank, death } = outcomeMultipliers(
    mutations,
    phoenixTriggered,
    traits,
    anomaly
  );
  return Math.floor(raw * (extracted ? bank : death));
}

// =============================================================================
// GENOME (Buildcraft: The Genome - BUILDCRAFT_GENOME_DESIGN.md)
// =============================================================================

export interface GenomeRunTotals {
  /** Deterministic raw DNA (claims are NOT included - validator adds
   *  clamped claims on top, engine adds live claims for display). */
  rawDna: number;
  /** Display score - genome NEVER touches score (same rule as mutations). */
  score: number;
  /** The claim-cap basis + caps for the bounded-trust validator. */
  capsBasis: GenomeCapsBasis;
  caps: GenomeClaimCaps;
  /** Derived per-run facts (activations, length, sheds) for reuse. */
  activations: StrainActivations;
  lengthTrace: LengthTrace;
}

/**
 * Deterministic genome run totals - the genome-era scoring authority for
 * client and server. Same fold discipline as computeRunTotals: one
 * Math.round per food, flats added after the round, single floor only at
 * the outcome boundary. With an empty genome this pays exactly what
 * computeRunTotals pays (proven by tests), so legacy sessions and the
 * genome-off path share one authority.
 *
 * Tithe's -1/food can push a food negative: the per-food result is
 * clamped at 1 while Tithe is active ("never below 1"), at 0 otherwise.
 */
export function computeGenomeRunTotals(
  dynasty: DynastyName,
  foodCount: number,
  genome: GenomeRunInput,
  traits: TraitId[] = [],
  condition: ConditionInput = null
): GenomeRunTotals {
  // The widened union, normalised once. A bare `AnomalyId` is still a whole
  // condition, so every pre-WP-2.10b call site keeps its exact meaning - and
  // because the parameter WIDENED rather than growing an optional sibling,
  // there is no sixth argument a caller could forget and thereby recompute a
  // run under different rules than the engine played it under.
  const world = normalizeCondition(condition);
  const anomaly = world.anomaly;
  const ruleset = RULESETS[dynasty];
  const count = Number.isFinite(foodCount) ? Math.max(0, Math.floor(foodCount)) : 0;
  const view = genome.splicesEnabled === false
    ? { loose: [...genome.picks], splices: [] }
    : fusePicks(genome.picks);
  const activations = strainActivations(
    genome.picks,
    genome.heirloom,
    genome.surges,
    genome.tierCap ?? 3,
    genome.suppressedStrains ?? [],
    conditionStrainThresholdDelta(world)
  );
  const lengthTrace = computeLengthTrace(
    view,
    count,
    activations,
    genome,
    world,
    dynasty
  );
  const lengthAt = (n: number) => lengthTrace.lengthAtEat[n] ?? 0;

  let rawDna = 0;
  let score = 0;
  let genelessRaw = 0;
  const cumulativeDna: number[] = [0];
  for (let n = 1; n <= count; n++) {
    let mod = genomeFoodValueModifier(view, activations, n, genome.revive, {
      lengthAt,
      prevRunDied: genome.prevRunDied,
    });
    let genelessMod = 1;
    if (traits.length > 0) {
      const traitMod = traitFoodValueModifier(traits, n);
      mod *= traitMod;
      genelessMod *= traitMod;
    }
    if (anomaly !== null) {
      const anomalyMod = anomalyFoodValueModifier(anomaly, n);
      mod *= anomalyMod;
      genelessMod *= anomalyMod;
    }
    const flat = genomeFoodValueFlatBonus(
      view,
      activations,
      n,
      genome.revive,
      lengthTrace,
      { lengthAt }
    );
    const base = ruleset.foodDnaValue(n);
    const dnaForFood = Math.max(
      tithePerFoodFloor(view, n),
      Math.round(base * mod) + flat
    );
    rawDna += dnaForFood;
    genelessRaw += Math.round(base * genelessMod);
    cumulativeDna[n] = rawDna;
    score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n));
  }
  const capsBasis: GenomeCapsBasis = { cumulativeDna, genelessRaw, foodCount: count };
  const caps = genomeClaimCaps(genome, capsBasis, lengthTrace, world);
  return { rawDna, score, capsBasis, caps, activations, lengthTrace };
}

/**
 * Genome-aware applyOutcome: the same single float->int boundary, with
 * the outcome multiplier shaped by the fused genome (wagers, interest,
 * infuses, strain tiers, traits, anomaly base) and hard-clamped
 * (bank <= 1.75, salvage <= 0.90). With an empty genome and no traits
 * this is exactly applyOutcome.
 */
export function applyGenomeOutcome(
  rawDna: number,
  extracted: boolean,
  genome: GenomeRunInput,
  traits: TraitId[] = [],
  condition: ConditionInput = null
): number {
  const raw = Number.isFinite(rawDna) ? Math.max(0, rawDna) : 0;
  const { bank, death } = genomeOutcomeMultipliers(genome, traits, condition);
  return Math.floor(raw * (extracted ? bank : death));
}

/**
 * Roll the food-interval to the next exit portal after a despawn:
 * intervalBase +/- intervalJitter, uniform, inclusive. rng is injectable
 * for deterministic tests; affects spawn timing only, never payout.
 */
export function rollExitInterval(
  extraction: ExtractionConfig,
  rng: () => number = Math.random
): number {
  // Delegated to `portals.ts`, which owns the seeded schedule that has to walk
  // this same recurrence. Re-exported through here so every existing caller is
  // untouched — but there is exactly one implementation, because an engine and
  // a settlement that each keep their own copy of a seeded recurrence stop
  // agreeing the first time one of them is edited.
  return rollPortalInterval(extraction, rng);
}
