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
   * COSMIC only: constellation food groups + combo chaining. Presence of
   * this field is what switches the engine into glyph-group spawning.
   */
  constellation?: typeof COSMIC_CONSTELLATION;
  /**
   * COSMIC only: wrap-phase wall cycling. Presence of this field is what
   * switches the engine into flux wall behavior.
   */
  flux?: typeof COSMIC_FLUX;
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
  blocksPerInterval: 6,
  intervalFoods: 5,
  formingSeconds: 2,
};

/**
 * CYBER's tick floor (DYNASTY_CYBER §2.2), raised from the global 50ms.
 *
 * Three in-run calls from the owner bracket it: at 94ms 'approaching what is a
 * sensible terminal speed', at 97ms 'speed ends being fun', at 84ms 'way too
 * fast'. That agrees with the bound derived independently from reaction time -
 * visible runway >= 3x simple reaction (~190ms) puts a grid game's floor near
 * 100-120ms.
 *
 * Under the shipped curve 100ms arrived at food 33 and the run kept
 * accelerating to food 98, so roughly two thirds of the speed curve sat below
 * playable. The curve is unchanged; it simply stops where hands do. Past the
 * floor the difficulty comes from the arena, which is the board finally
 * mattering on the one dynasty it never has.
 */
export const CYBER_TICK_FLOOR_MS = 100;

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
 * of a terminus run - tapering to x0.5 at both ends. COSMIC's skill is the
 * chain, and a chain needs a run already in progress to exist at all, so the
 * shape pays where the dynasty's own mechanic can actually be played.
 *
 * Every value is a multiple of 0.5, which is load-bearing rather than tidy. It
 * makes each per-food base Score a multiple of 5, and the combo multipliers
 * step by 0.2, so `round(base * combo)` never actually rounds. That is what
 * keeps a claimed combo bonus inside `floor(baseScore *
 * COSMIC_TRUST_MAX_BONUS_RATIO)`, the server clamp: on a curve with, say, x0.9
 * on it, round(9 * 2.4) = 22 is a bonus of 13 against a ceiling of 12.6, and an
 * honest run would round its way past its own limit and be clamped down for it.
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
  speedForFood: (foodEaten) =>
    Math.max(
      CYBER_TICK_FLOOR_MS,
      Math.floor(GAME_CONFIG.snake.initialSpeed / (1 + 0.03 * foodEaten))
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
 * COSMIC constellation food + combo chain tuning (section 3.3).
 * Foods spawn as glyph-tagged groups of groupSize, clustered within
 * groupRadius cells of the group anchor so chaining inside the 8-tick
 * window is physically possible. Eating a food of the same glyph as the
 * previous eat within chainWindowTicks extends the chain; combo multiplier
 * is x1.2 at chain 2, +0.2 per chained food, capped x2.4 at chain 8+.
 */
export const COSMIC_CONSTELLATION = {
  glyphCount: 3,
  groupSize: 3,
  groupRadius: 4,
  chainWindowTicks: 8,
  comboStep: 0.2,
  comboCap: 2.4,
} as const;

/**
 * COSMIC wrap-phase tuning (section 3.3), in ticks at 160 ms/tick:
 * 12 s open (edges wrap) = 75 ticks, 8 s closed (walls kill) = 50 ticks,
 * ~2 s telegraph = 12 ticks before every transition. Tick-based (not
 * wall-clock) so pauses and the mutation choice hold stay deterministic.
 */
export const COSMIC_FLUX = {
  openTicks: 75,
  closedTicks: 50,
  telegraphTicks: 12,
} as const;

/**
 * Combo multiplier for a chain of the given length: x1.0 solo, x1.2 at
 * chain 2, +0.2 per chained food, capped at x2.4 (chain 8+).
 */
export function cosmicComboMultiplier(chainLength: number): number {
  if (!Number.isFinite(chainLength) || chainLength < 2) return 1;
  return Math.min(
    COSMIC_CONSTELLATION.comboCap,
    1 + COSMIC_CONSTELLATION.comboStep * (chainLength - 1)
  );
}

/**
 * Bounded-trust ceiling for COSMIC combo claims: the combo bonus above the
 * no-combo recompute can never exceed base x (comboCap - 1), because every
 * food's combo multiplier is capped at comboCap.
 */
export const COSMIC_TRUST_MAX_BONUS_RATIO = COSMIC_CONSTELLATION.comboCap - 1;

/**
 * COSMIC - Flux: fixed 160 ms/tick, flat base food value; the skill layers
 * are the constellation combo chain (client-computed, server-clamped via
 * bounded trust - see section 3.3's validation note) and the wrap-phase
 * wall cycle (physical, never in the payout formula). Score rides the
 * mid-weighted shape above (WP-3.08) - the base food VALUE stays flat, because
 * the combo is the dynasty's Yield story and does not need a second one.
 */
const COSMIC: DynastyRuleset = {
  id: 'COSMIC',
  speedForFood: () => COSMIC_SPEED_MS,
  foodDnaValue: () => FOOD_BASE_DNA,
  scoreMultiplier: (n) => cosmicScoreShape(n),
  extraction: EXTRACTION_DEFAULTS,
  // 160 ms/tick + clustered constellation groups sustain a faster eat rate
  // than PRIMAL's single scattered food at 175 ms/tick.
  validation: { maxFoodPerSecond: 1.5 },
  constellation: COSMIC_CONSTELLATION,
  flux: COSMIC_FLUX,
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
 * Normalize an arbitrary dynasty string (session row TEXT, API payloads)
 * to a DynastyName. Unknown values fall back to COSMIC (flat base food
 * value - the conservative payout floor; its combo layer only pays when
 * the client explicitly claims it, and then only clamped).
 */
export function normalizeDynastyName(value: unknown): DynastyName {
  const name = typeof value === 'string' ? value.toUpperCase() : '';
  if (name === 'PRIMAL' || name === 'CYBER' || name === 'COSMIC') {
    return name;
  }
  return 'COSMIC';
}

/**
 * One-line ruleset identity text - the UI's replacement for the retired
 * "+5% stat" copy (starter cards, variant details, pre-game overlay).
 */
export const rulesetExplainer: Record<DynastyName, string> = {
  PRIMAL: 'Steady speed — every food worth more than the last',
  CYBER: 'Speed rises — survive the overclock for up to ×3',
  COSMIC: 'Chain constellations for combos while the walls phase open and shut',
};

/**
 * Deterministic run totals - THE scoring authority for client and server.
 * A pure fold over n = 1..foodCount with one Math.round per food.
 *
 * Mutations (Design v2 Phase 2): held [E] mutations modify each food's DNA
 * from their pick point onward via the shared foodValueModifier - the same
 * function the client engine applies per eat, so PRIMAL/CYBER recompute
 * stays exact under mutations. Score is deliberately mutation-free
 * (mutations shape the economy, not the leaderboard number); the COSMIC
 * combo - which does hit score - is layered on top by the engine and
 * clamped by the server (bounded trust), never recomputed here.
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
  const lengthTrace = computeLengthTrace(view, count, activations, genome, world);
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
