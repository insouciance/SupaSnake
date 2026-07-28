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
   * shows: 90 ticks is 18.0s at PRIMAL's 200ms and 4.5s at CYBER's floor, so
   * the extraction window silently lost three quarters of its real duration
   * as the dynasty accelerated. Food has no deadline, which is why eating
   * stayed possible exactly as banking became impossible - the owner's
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
 * real duration. 18 seconds matches PRIMAL's, which is the point - the
 * decision should cost the same wherever it is made.
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

/** CYBER score/DNA multiplier: 1 + 0.5 * tier, so x1 -> x3 by food 20. */
function cyberMultiplier(n: number): number {
  return 1 + 0.5 * cyberTier(n);
}

/**
 * PRIMAL - Steady Growth: fixed speed, compounding food value.
 * Every food is worth round(10 * (1 + 0.02 * (n - 1))) DNA - the n-th food
 * is always worth at least as much as the one before it.
 */
const PRIMAL: DynastyRuleset = {
  id: 'PRIMAL',
  speedForFood: () => GAME_CONFIG.snake.initialSpeed,
  foodDnaValue: (n) => Math.round(FOOD_BASE_DNA * (1 + 0.02 * (n - 1))),
  scoreMultiplier: () => 1,
  extraction: EXTRACTION_DEFAULTS,
  validation: { maxFoodPerSecond: 1.0 },
};

/**
 * CYBER - Overclock: speed ramps with every food (the migration of the old
 * log curve, driven by food count instead of score) while a speed-tier
 * multiplier scales both score and DNA: tier = floor(n/5) capped at 4,
 * multiplier = 1 + 0.5 * tier (x1 -> x3 from food 20 onward).
 */
const CYBER: DynastyRuleset = {
  id: 'CYBER',
  speedForFood: (foodEaten) =>
    Math.max(
      CYBER_TICK_FLOOR_MS,
      Math.floor(GAME_CONFIG.snake.initialSpeed / (1 + 0.03 * foodEaten))
    ),
  foodDnaValue: (n) => Math.round(FOOD_BASE_DNA * cyberMultiplier(n)),
  scoreMultiplier: (n) => cyberMultiplier(n),
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

/** COSMIC fixed tick speed - between PRIMAL (200) and CYBER tier 1 (150). */
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
 * thrill factor." Three defects sat under that verdict, two provable from the
 * code: the x2.4 cap needed a chain of 8 that a wave of 3 could not produce,
 * `scoreMultiplier: () => 1` meant the combo never touched the ranked number
 * at all, and `groupRadius: 4` made the "chain" a pile eaten in the order it
 * happened to lie in - Meier's OBVIOUS, the default path with a bonus on it.
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
  speedForFood: () => COSMIC_SPEED_MS,
  foodDnaValue: () => FOOD_BASE_DNA,
  scoreMultiplier: () => 1,
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
 * Normalize an arbitrary dynasty string (session row TEXT, API payloads)
 * to a DynastyName. Unknown values fall back to COSMIC - a flat base food
 * value and a flat score multiplier, which is the conservative payout floor
 * of the three. Since WP-3.13 deleted the combo, COSMIC carries no claimed
 * payout component at all, so the fallback is now the floor unconditionally.
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
  const span = 2 * extraction.intervalJitter + 1;
  return extraction.intervalBase - extraction.intervalJitter + Math.floor(rng() * span);
}
