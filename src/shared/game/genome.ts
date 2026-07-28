/**
 * Genome run math - Buildcraft: The Genome (BUILDCRAFT_GENOME_DESIGN.md)
 *
 * The building blocks computeGenomeRunTotals (rulesets.ts) folds over:
 * strain activations, the deterministic length model, the fused-view
 * per-food [E] math, the genome-aware outcome multipliers, and the
 * bounded-trust claim caps. Everything here is a pure function of the
 * accepted inputs - the client engine and the server validator both call
 * these, which is what keeps genome validation exact.
 *
 * Determinism contract:
 * - Deterministic [E] effects are pure in (picks with atFood, heirloom,
 *   surges, infuses, revive, lossEvents, foodCount).
 * - Bounded-trust [BT] claims are NEVER computed here - only their CAPS
 *   are; the validator clamps client claims against them.
 * - Reported events (revive, losses) are payout-non-increasing or capped
 *   (see strains.ts header + design doc section 15).
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  GENE_ECONOMICS,
  GENE_PHYSICS,
  geneFoodValueFlatBonus,
  geneFoodValueModifier,
  geneStrains,
  type GeneId,
  type GenePick,
} from '@/shared/game/genes';
import {
  SPLICE_ECONOMICS,
  SPLICE_PHYSICS,
  fusePicks,
  type FusedView,
  type SpliceId,
} from '@/shared/game/splices';
import {
  STRAIN_ECONOMICS,
  STRAIN_IDS,
  STRAIN_PHYSICS,
  STRAIN_THRESHOLDS,
  capSpawnPoints,
  moltResetLengthFor,
  strainTier,
  type StrainId,
  type StrainPoints,
  type StrainTier,
} from '@/shared/game/strains';
import { traitOutcomeDeltas, type TraitId } from '@/shared/game/traits';
import {
  ANOMALY_ECONOMICS,
  ANOMALY_PHYSICS,
  anomalyBankOverride,
  type AnomalyId,
} from '@/shared/game/anomalies';
import { MUTATION_ECONOMICS, MUTATION_PHYSICS } from '@/shared/game/mutations';
import { carryScaled } from '@/shared/game/portals';
import {
  baseGrowthForFood,
  resolveGrowthProfile,
  type GrowthProfileId,
} from '@/shared/game/growth';
import {
  conditionBankDelta,
  conditionStrainThresholdDelta,
  normalizeCondition,
  strainTierUnderCondition,
  type ConditionInput,
} from '@/shared/game/worldCondition';

// =============================================================================
// INPUT TYPES - the cross-workstream contract (engine payload, validator,
// game_sessions.genome JSONB all speak this shape)
// =============================================================================

/** How the run's one revive (if any) fired. */
export type ReviveKind = 'phoenix' | 'styx' | 'molted' | 'second_sun';

export interface GenomeRevive {
  kind: ReviveKind;
  atFood: number;
}

/** An infuse strain surge (+1 point, granted when infusing at gene cap). */
export interface StrainSurge {
  strain: StrainId;
  atFood: number;
}

/** A reported length loss (Thick Hide, Ouroboros bites, revive resets). */
export interface LengthLossEvent {
  atFood: number;
  segments: number;
}

/**
 * The deterministic genome inputs for a run. heirloom points are
 * SERVER-DERIVED (equipped traits + lineage) - never taken from the
 * client claim; the engine receives them at session start.
 */
export interface GenomeRunInput {
  picks: GenePick[];
  heirloom: StrainPoints;
  surges: StrainSurge[];
  infuses: { atFood: number }[];
  revive: GenomeRevive | null;
  /** Server-derived: previous earned run ended in death (Grave Robber). */
  prevRunDied?: boolean;
  /** Reported, payout-non-increasing (they only shrink the length model). */
  lossEvents?: LengthLossEvent[];
  /**
   * FTUE tier ceiling (server-derived from banked-run count): 1 caps at
   * minors, 2 at expressions, 3 = everything. Binds the ECONOMY, not
   * just the visuals - client and server must use the same cap or the
   * recompute drifts. Default 3.
   */
  tierCap?: StrainTier;
  /** Server-derived Gauntlet strain suppression; minors remain active. */
  suppressedStrains?: readonly StrainId[];
  /** FTUE gate: false keeps parent genes loose and disables Splice effects. */
  splicesEnabled?: boolean;
  /**
   * The run's growth profile (WP-3.02), server-stamped into `run_context` at
   * start and replayed here at settlement.
   *
   * It lives on the INPUT rather than as an optional parameter deliberately:
   * every caller already threads this object, so the profile cannot be
   * forgotten at one call site and silently default at another - which is how
   * client and server drift apart. Absent or unrecognised resolves to
   * `baseline`, the shipped curve, so historical blobs recompute unchanged.
   */
  growthProfileId?: GrowthProfileId;
  /**
   * Portals this run DECLINED — the carry's only input (WP-3.10).
   *
   * SERVER-DERIVED, NEVER CLAIMED. It is computed from the seeded, food-indexed
   * portal schedule in `portals.ts` together with the infuses and the extraction
   * flag the settlement already knows, via the identity
   * `passed = encountered - infuses - (extracted ? 1 : 0)`. It sits on the input
   * for the same reason `growthProfileId` does: every caller threads this
   * object, so a call site cannot forget it and silently default while another
   * supplies it. ABSENT MEANS NO CARRY AT ALL — not zero passed doors. The
   * distinction is load-bearing: zero passed doors is a live carry sitting at
   * salvage 1.0, whereas absence is a run with no seeded schedule behind it
   * (a legacy blob, a pre-WP-3.10 settlement, the workbench's empty genome)
   * and must recompute on the flat 1.25/0.6 it was authored against. Collapsing
   * the two would silently rewrite every historical outcome.
   */
  portalsPassed?: number;
}

export const EMPTY_GENOME: GenomeRunInput = {
  picks: [],
  heirloom: {},
  surges: [],
  infuses: [],
  revive: null,
};

/** Bounded-trust claims - clamped by genomeClaimCaps, never recomputed. */
export interface GenomeClaims {
  /** AURUM Gilded Wake: flat DNA from gilded-cell re-traversals. */
  aurumWakeDna?: number;
  /** AURUM Midas Vein: bonus DNA from golden chain-eats. */
  midasDna?: number;
  /** FERAL Molt: flat DNA from molt-foods eaten. */
  moltFoodDna?: number;
  /** FERAL Ouroboros: flat DNA from tail-tip bites. */
  ouroborosDna?: number;
  /** Static Charge: bonus DNA from fasting eats. */
  staticChargeDna?: number;
  /** Ricochet: bonus DNA from slide-eats. */
  ricochetDna?: number;
  /** Heartwood: flat DNA from golden shed-drops eaten. */
  heartwoodDna?: number;
  /** UMBRA Second Sun: the one-time trigger payment was earned. */
  secondSunTriggered?: boolean;
}

/** The stored/validated record shape (game_sessions.genome JSONB). */
export interface GenomeRunRecord {
  v: 1;
  picks: GenePick[];
  /** Derived, for analytics/codex - never trusted as input. */
  splices: { id: SpliceId; atFood: number }[];
  surges: StrainSurge[];
  infuses: { atFood: number }[];
  revive: GenomeRevive | null;
  /** Accepted (clamped) claims. */
  claims: GenomeClaims;
  /** Final strain points at run end. */
  strainCounts: StrainPoints;
  /** Strains whose Expression (tier >=2) activated, with food index. */
  expressions: Partial<Record<StrainId, number>>;
  /** Strains whose Apex (tier 3) activated, with food index. */
  apexes: Partial<Record<StrainId, number>>;
}

// =============================================================================
// STRAIN ACTIVATIONS
// =============================================================================

export interface StrainActivation {
  /** Total points at run end (spawn + genes + surges). */
  points: number;
  /** In-run genes of this strain (splices count their parents). */
  genes: number;
  /** Food index where each tier activated (effects apply to n > this). */
  minorAt: number | null;
  expressionAt: number | null;
  apexAt: number | null;
}

export type StrainActivations = Record<StrainId, StrainActivation>;

/**
 * Walk the run's point events in food order and record where each strain
 * tier activated. Spawn points (heirloom+lineage, pre-capped at 2/strain)
 * are present from food 0; gene picks grant points AND in-run gene count;
 * surges grant points only. The Expression/Apex gene gates are applied
 * here - points can never overflow past an unmet gate.
 */
export function strainActivations(
  picks: GenePick[],
  heirloom: StrainPoints,
  surges: StrainSurge[] = [],
  /** FTUE ceiling: tiers above the cap never activate (economy-binding). */
  tierCap: StrainTier = 3,
  suppressedStrains: readonly StrainId[] = [],
  /**
   * The world condition's per-strain THRESHOLD shift, in points (WP-2.10b).
   * Empty under no condition, which is every run the game had before it.
   *
   * A plain map rather than the condition object, because this is the one
   * signature the ENGINE calls directly and it must not have to know what a
   * `WorldCondition` is. Both sides derive the map from the same condition
   * through `conditionStrainThresholdDelta`, so the activations the engine
   * displays and the activations the payout recomputes are one calculation.
   */
  strainThresholdDelta: Readonly<Partial<Record<StrainId, number>>> = {}
): StrainActivations {
  const spawn = capSpawnPoints(heirloom);
  const result = {} as StrainActivations;
  for (const strain of STRAIN_IDS) {
    const points = spawn[strain] ?? 0;
    const delta = strainThresholdDelta[strain] ?? 0;
    result[strain] = {
      points,
      genes: 0,
      minorAt: points - delta >= STRAIN_THRESHOLDS.minor ? 0 : null,
      expressionAt: null,
      apexAt: null,
    };
  }
  type PointEvent = { atFood: number; strains: readonly StrainId[]; isGene: boolean; order: number };
  const events: PointEvent[] = [];
  picks.forEach((pick, i) =>
    events.push({ atFood: pick.atFood, strains: geneStrains(pick.id), isGene: true, order: i })
  );
  surges.forEach((surge, i) =>
    events.push({ atFood: surge.atFood, strains: [surge.strain], isGene: false, order: picks.length + i })
  );
  events.sort((a, b) => a.atFood - b.atFood || a.order - b.order);
  for (const event of events) {
    for (const strain of event.strains) {
      const s = result[strain];
      s.points += 1;
      if (event.isGene) s.genes += 1;
      const strainCap = suppressedStrains.includes(strain) ? 1 : tierCap;
      const tier = Math.min(
        strainCap,
        strainTierUnderCondition(
          s.points,
          s.genes,
          strainThresholdDelta[strain] ?? 0
        )
      );
      if (tier >= 1 && s.minorAt === null) s.minorAt = event.atFood;
      if (tier >= 2 && s.expressionAt === null) s.expressionAt = event.atFood;
      if (tier >= 3 && s.apexAt === null) s.apexAt = event.atFood;
    }
  }
  return result;
}

/** Live tier of a strain at (or after) food n, from its activations. */
export function strainTierAtFood(
  activation: StrainActivation,
  n: number
): StrainTier {
  if (activation.apexAt !== null && n > activation.apexAt) return 3;
  if (activation.expressionAt !== null && n > activation.expressionAt) return 2;
  if (activation.minorAt !== null && n > activation.minorAt) return 1;
  return 0;
}

// =============================================================================
// DETERMINISTIC LENGTH MODEL
// =============================================================================

export interface ShedEvent {
  atFood: number;
  segmentsShed: number;
  source: 'shed' | 'molt' | 'regenesis' | 'molted_rebirth';
}

export interface LengthTrace {
  /** lengthAtEat[n] = body length at the moment food n is eaten (1-based). */
  lengthAtEat: number[];
  shedEvents: ShedEvent[];
}

function activeAt(pick: GenePick | undefined, n: number): boolean {
  return pick !== undefined && n > pick.atFood;
}

/**
 * The deterministic length model: length is a pure function of the food
 * index given picks (growth), shed cycles (fused view), the Molt
 * expression, and reported losses. Reported losses only ever SHRINK the
 * model, so under-reporting them is the only vector - bounded by the
 * global raw clamp and flagged (design doc section 15.2).
 */
export function computeLengthTrace(
  view: FusedView,
  foodCount: number,
  activations: StrainActivations,
  input: Pick<
    GenomeRunInput,
    'infuses' | 'lossEvents' | 'revive' | 'growthProfileId'
  >,
  condition: ConditionInput = null
): LengthTrace {
  const anomaly = normalizeCondition(condition).anomaly;
  const growthProfile = resolveGrowthProfile(input.growthProfileId);
  const lengthAtEat: number[] = [0];
  const shedEvents: ShedEvent[] = [];
  const loosePick = (id: GeneId) => view.loose.find((p) => p.id === id);
  const fused = (id: SpliceId) => view.splices.find((s) => s.spliceId === id);
  const parentPick = (id: GeneId): GenePick | undefined => {
    for (const s of view.splices) {
      const p = s.parents.find((x) => x.id === id);
      if (p) return p;
    }
    return undefined;
  };
  const overgrowth = loosePick('overgrowth') ?? parentPick('overgrowth');
  const bulkUp = loosePick('bulk_up') ?? parentPick('bulk_up');
  const shed = loosePick('shed');
  const regenesis = fused('splice_regenesis');
  const moltedRebirth = fused('splice_molted_rebirth');
  const molt = activations.FERAL.expressionAt;
  // Rule 15 (v1.4): INFUSE is GROWTH, not a loss. Legacy blobs settled before
  // the inversion still carry `lossEvents` from Thick Hide and Ouroboros and
  // are still honoured below, so historical runs recompute exactly as they
  // did - but no new run produces one, and infuses never appear here again.
  const losses = [...(input.lossEvents ?? [])];
  const infuseGrowthAt = new Map<number, number>();
  for (const infuse of input.infuses) {
    infuseGrowthAt.set(
      infuse.atFood,
      (infuseGrowthAt.get(infuse.atFood) ?? 0) + STRAIN_PHYSICS.infuseGrowth
    );
  }
  const reviveAt = input.revive?.atFood ?? null;

  let len: number = growthProfile.initialLength;
  for (let n = 1; n <= foodCount; n++) {
    lengthAtEat[n] = len;
    // The profile's base growth - the ONE function the engine also calls
    // (growth.ts). Gene and anomaly extras layer on top, exactly as before.
    let growth = baseGrowthForFood(growthProfile, n);
    if (anomaly === 'overgrown') growth += ANOMALY_PHYSICS.overgrownExtraSegments;
    if (activeAt(overgrowth, n)) growth += MUTATION_PHYSICS.overgrowthExtraSegments;
    if (activeAt(bulkUp, n)) growth += GENE_PHYSICS.bulkUpExtraSegments;
    len += growth;
    // Shed cycles (fused view replaces the loose Shed cycle post-fusion).
    // `resetFor` takes the length the body has RIGHT NOW because Molt's
    // shed is proportional; the absolute cycles simply ignore the argument.
    const cycles: {
      every: number;
      anchor: number;
      resetFor: (current: number) => number;
      source: ShedEvent['source'];
    }[] = [];
    if (shed) {
      cycles.push({
        every: MUTATION_PHYSICS.shedEveryFoods,
        anchor: shed.atFood,
        resetFor: () => MUTATION_PHYSICS.shedResetLength,
        source: 'shed',
      });
    }
    if (regenesis) {
      cycles.push({
        every: SPLICE_ECONOMICS.regenesisShedEveryFoods,
        anchor: regenesis.atFood,
        resetFor: () => SPLICE_ECONOMICS.regenesisResetLength,
        source: 'regenesis',
      });
    }
    if (moltedRebirth) {
      cycles.push({
        every: SPLICE_PHYSICS.moltedRebirthShedEveryFoods,
        anchor: moltedRebirth.atFood,
        resetFor: () => SPLICE_PHYSICS.moltedRebirthResetLength,
        source: 'molted_rebirth',
      });
    }
    if (molt !== null) {
      cycles.push({
        every: STRAIN_PHYSICS.moltEveryFoods,
        anchor: molt,
        resetFor: moltResetLengthFor,
        source: 'molt',
      });
    }
    for (const cycle of cycles) {
      const since = n - cycle.anchor;
      if (since <= 0 || since % cycle.every !== 0) continue;
      const reset = cycle.resetFor(len);
      if (len > reset) {
        shedEvents.push({ atFood: n, segmentsShed: len - reset, source: cycle.source });
        len = reset;
      }
    }
    // Molt's growth floor is part of resolving this food, before any
    // later portal/collision/revive event stamped with the same food count.
    if (molt !== null && n > molt) {
      len = Math.max(STRAIN_PHYSICS.moltMinLength, len);
    }
    // Reported losses at this food happen after the food resolves (Thick
    // Hide, Ouroboros, infuse cost), so they can take the body below the
    // Molt growth floor until another food is eaten.
    for (const loss of losses) {
      if (loss.atFood === n) {
        len = Math.max(GAME_CONFIG.snake.initialLength, len - Math.max(0, loss.segments));
      }
    }
    // Rule 15: INFUSE grows the body, at the same point in the food's
    // resolution where its cost used to be subtracted. Keeping the position
    // identical is what preserves parity with the engine, which appends its
    // segments when the portal resolves - i.e. after this food is done.
    const grown = infuseGrowthAt.get(n);
    if (grown !== undefined) len += grown;
    // Rule 15: a revive no longer truncates. The engine keeps its 3-cell
    // head rewind (a positional mercy, not a length change), so there is
    // nothing for the length model to do here. Historical runs are unaffected
    // because their traces were computed under the old code and stored.
  }
  return { lengthAtEat, shedEvents };
}

// =============================================================================
// PER-FOOD [E] MATH (fused view + strain tiers)
// =============================================================================

/** Does this revive kind void gene/strain economic benefits? */
export function reviveVoidsBenefits(revive: GenomeRevive | null): boolean {
  return revive !== null && revive.kind === 'phoenix';
}

function spliceFoodModifier(
  splice: { spliceId: SpliceId; atFood: number; parents: readonly [GenePick, GenePick] },
  n: number,
  benefitsVoided: boolean
): number {
  let mod = 1;
  switch (splice.spliceId) {
    case 'splice_dragon_hoard': {
      const goldTrail = splice.parents.find((p) => p.id === 'gold_trail');
      if (
        !benefitsVoided &&
        goldTrail &&
        (n - goldTrail.atFood) % MUTATION_ECONOMICS.goldTrailEveryNth === 0
      ) {
        mod *= MUTATION_ECONOMICS.goldTrailMultiplier;
      }
      break;
    }
    case 'splice_regenesis':
      if (!benefitsVoided) mod *= MUTATION_ECONOMICS.overgrowthFoodBonus;
      mod *= MUTATION_ECONOMICS.shedFoodPenalty;
      break;
    case 'splice_gravity_bubble':
      mod *= SPLICE_ECONOMICS.gravityBubbleFoodPenalty;
      break;
    case 'splice_ricochet':
      mod *= SPLICE_ECONOMICS.ricochetFoodPenalty;
      break;
    case 'splice_comet_tail': {
      const since = n - splice.atFood;
      if (!benefitsVoided) {
        if (since % SPLICE_ECONOMICS.cometTailFifth === 0) {
          mod *= SPLICE_ECONOMICS.cometTailFifthMultiplier;
        }
        if (since % SPLICE_ECONOMICS.cometTailTenth === 0) {
          mod *= SPLICE_ECONOMICS.cometTailTenthMultiplier;
        }
      }
      break;
    }
    case 'splice_old_growth': {
      const glacial = splice.parents.find((p) => p.id === 'glacial_reserve');
      if (!benefitsVoided && glacial) {
        mod *= 1 + Math.min(
          SPLICE_ECONOMICS.oldGrowthRampCap,
          SPLICE_ECONOMICS.oldGrowthRampPerFood * (n - glacial.atFood)
        );
      }
      break;
    }
    case 'splice_black_magnet':
      mod *= SPLICE_ECONOMICS.blackMagnetFoodPenalty;
      break;
    case 'splice_molted_rebirth':
      mod *= SPLICE_ECONOMICS.moltedRebirthFoodPenalty;
      break;
    // splice_styx_contract / splice_all_in: outcome-only
  }
  return mod;
}

function strainFoodModifier(
  activations: StrainActivations,
  n: number,
  benefitsVoided: boolean
): number {
  let mod = 1;
  // AURUM minor "Gilt" (benefit)
  const aurum = activations.AURUM;
  if (!benefitsVoided && aurum.minorAt !== null && n > aurum.minorAt) {
    mod *= STRAIN_ECONOMICS.giltFoodBonus;
  }
  // VOLT expression "Arc Lightning" aggregate cost / apex benefit
  const volt = activations.VOLT;
  if (volt.expressionAt !== null && n > volt.expressionAt) {
    mod *= STRAIN_ECONOMICS.arcLightningFoodPenalty;
  }
  if (!benefitsVoided && volt.apexAt !== null && n > volt.apexAt) {
    mod *= STRAIN_ECONOMICS.overclockedRealityFoodBonus;
  }
  // FERAL apex "Ouroboros" cost
  const feral = activations.FERAL;
  if (feral.apexAt !== null && n > feral.apexAt) {
    mod *= STRAIN_ECONOMICS.ouroborosFoodPenalty;
  }
  // FLUX expression "Rift Aura" cost
  const flux = activations.FLUX;
  if (flux.expressionAt !== null && n > flux.expressionAt) {
    mod *= STRAIN_ECONOMICS.riftAuraFoodPenalty;
  }
  return mod;
}

/**
 * The full deterministic per-food [E] multiplier under the genome:
 * loose picks (legacy delegation), fused parents pre-fusion, splice math
 * post-fusion, and strain-tier effects. Pure in its inputs.
 */
export function genomeFoodValueModifier(
  view: FusedView,
  activations: StrainActivations,
  n: number,
  revive: GenomeRevive | null,
  options: { lengthAt?: (n: number) => number; prevRunDied?: boolean } = {}
): number {
  const voidAt = reviveVoidsBenefits(revive) ? revive!.atFood : null;
  const benefitsVoided = voidAt !== null && n > voidAt;
  let mod = geneFoodValueModifier(view.loose, n, voidAt, options);
  for (const splice of view.splices) {
    if (n <= splice.atFood) {
      // Pre-fusion: parents act individually.
      mod *= geneFoodValueModifier([...splice.parents], n, voidAt, options);
    } else {
      mod *= spliceFoodModifier(splice, n, benefitsVoided);
    }
  }
  mod *= strainFoodModifier(activations, n, benefitsVoided);
  return mod;
}

/**
 * The full deterministic per-food FLAT bonus under the genome: loose
 * picks (legacy delegation), fused parents pre-fusion, splice flats
 * post-fusion (Dragon Hoard golden flats, Regenesis shed pay, Old Growth
 * cadence), and the FLUX Singularity pull pay.
 */
export function genomeFoodValueFlatBonus(
  view: FusedView,
  activations: StrainActivations,
  n: number,
  revive: GenomeRevive | null,
  lengthTrace: LengthTrace,
  options: { lengthAt?: (n: number) => number } = {}
): number {
  const voidAt = reviveVoidsBenefits(revive) ? revive!.atFood : null;
  const benefitsVoided = voidAt !== null && n > voidAt;
  let flat = geneFoodValueFlatBonus(view.loose, n, voidAt, options);
  for (const splice of view.splices) {
    if (n <= splice.atFood) {
      flat += geneFoodValueFlatBonus([...splice.parents], n, voidAt, options);
      continue;
    }
    if (benefitsVoided) continue;
    switch (splice.spliceId) {
      case 'splice_dragon_hoard': {
        const goldTrail = splice.parents.find((p) => p.id === 'gold_trail');
        if (
          goldTrail &&
          (n - goldTrail.atFood) % MUTATION_ECONOMICS.goldTrailEveryNth === 0
        ) {
          flat += SPLICE_ECONOMICS.dragonHoardGoldenFlat;
        }
        break;
      }
      case 'splice_regenesis': {
        for (const event of lengthTrace.shedEvents) {
          if (event.atFood === n && event.source === 'regenesis') {
            flat += SPLICE_ECONOMICS.regenesisFlatPerSegment * event.segmentsShed;
          }
        }
        break;
      }
      case 'splice_old_growth': {
        const since = n - splice.atFood;
        if (since > 0 && since % SPLICE_ECONOMICS.oldGrowthFlatEveryFoods === 0) {
          flat += 1;
        }
        break;
      }
    }
  }
  // FLUX apex "Singularity": +10 flat per pull event (deterministic).
  const flux = activations.FLUX;
  if (!benefitsVoided && flux.apexAt !== null && n > flux.apexAt) {
    const since = n - flux.apexAt;
    if (since % STRAIN_ECONOMICS.singularityEveryFoods === 0) {
      flat += STRAIN_ECONOMICS.singularityFlat;
    }
  }
  return flat;
}

// =============================================================================
// OUTCOME MULTIPLIERS (genome-aware, fused view)
// =============================================================================

function round4(value: number): number {
  return Math.round(Math.max(0, value) * 10000) / 10000;
}

/**
 * The genome outcome multipliers: fused-view wager/interest shaping,
 * infuse deltas, strain-tier deltas, trait deltas, then the hard clamps
 * (bank <= 1.75, salvage <= 0.90). Benefits void under a classic Phoenix
 * revive; Styx Contract / Molted Rebirth / Second Sun revives keep them
 * (that is their headline). All costs always persist.
 */
export function genomeOutcomeMultipliers(
  input: GenomeRunInput,
  traits: TraitId[] = [],
  condition: ConditionInput = null
): { bank: number; death: number } {
  const world = normalizeCondition(condition);
  const anomaly = world.anomaly;
  const view = input.splicesEnabled === false
    ? { loose: [...input.picks], splices: [] }
    : fusePicks(input.picks);
  const activations = strainActivations(
    input.picks,
    input.heirloom,
    input.surges,
    input.tierCap ?? 3,
    input.suppressedStrains ?? [],
    conditionStrainThresholdDelta(world)
  );
  const benefitsVoided = reviveVoidsBenefits(input.revive);
  const heldGenes = input.picks.length;
  const looseIds = new Set(view.loose.map((p) => p.id));
  const spliceIds = new Set(view.splices.map((s) => s.spliceId));

  let bank: number = anomalyBankOverride(anomaly) ?? 1.25;
  let death = 0.6;

  // Wager-class SETs (fused view).
  if (spliceIds.has('splice_styx_contract')) {
    death = SPLICE_ECONOMICS.styxSalvage;
    bank = SPLICE_ECONOMICS.styxBank; // never voided - Styx keeps benefits
  } else if (looseIds.has('mirror_wager')) {
    death = MUTATION_ECONOMICS.mirrorWagerDeath;
    if (!benefitsVoided) bank = MUTATION_ECONOMICS.mirrorWagerBank;
  }
  if (spliceIds.has('splice_all_in')) {
    death = SPLICE_ECONOMICS.allInSalvage; // SET, like the Wager it consumed
    if (!benefitsVoided) {
      bank = round4(bank + SPLICE_ECONOMICS.allInBankPerHeld * heldGenes);
    }
  }
  // Interest-class additive bank (genome retune: +0.05/held, cap +0.30).
  const interestSources =
    (looseIds.has('compound_interest') ? 1 : 0) +
    (spliceIds.has('splice_dragon_hoard') ? 1 : 0);
  if (interestSources > 0 && !benefitsVoided) {
    bank = round4(
      bank +
        Math.min(
          STRAIN_ECONOMICS.compoundInterestCap,
          STRAIN_ECONOMICS.compoundInterestPerHeld * heldGenes
        ) * interestSources
    );
  }
  // Overclock Harvest (legacy semantics preserved).
  if (looseIds.has('overclock_harvest')) {
    death = round4(death + MUTATION_ECONOMICS.overclockHarvestDeathDelta);
    if (!benefitsVoided) {
      bank = round4(bank + MUTATION_ECONOMICS.overclockHarvestBankDelta);
    }
  }
  // Infuse deltas: structural (paid in segments), never voided.
  const infuses = input.infuses.length;
  if (infuses > 0) {
    bank = round4(bank + STRAIN_ECONOMICS.infuseBankDelta * infuses);
    death = round4(death + STRAIN_ECONOMICS.infuseSalvageDelta * infuses);
  }
  // Strain-tier deltas.
  const umbra = activations.UMBRA;
  if (umbra.minorAt !== null && !benefitsVoided) {
    death = round4(death + STRAIN_ECONOMICS.shadowSkinSalvageDelta);
  }
  if (umbra.apexAt !== null) {
    bank = round4(bank + STRAIN_ECONOMICS.secondSunBankDelta); // cost
    if (!benefitsVoided) {
      death = round4(death + STRAIN_ECONOMICS.secondSunSalvageDelta);
    }
  }
  if (activations.AURUM.apexAt !== null) {
    death = round4(death + STRAIN_ECONOMICS.midasSalvageDelta); // cost
  }
  // Trait deltas (never voided - snake identity).
  if (traits.length > 0) {
    const deltas = traitOutcomeDeltas(traits);
    bank = round4(bank + deltas.bank);
    death = round4(death + deltas.death);
  }
  // The world condition's bank clause (WP-2.10b). Additive on the base the
  // anomaly may already have replaced, exactly as the infuse and trait deltas
  // are, and NEVER voided by a revive: a clause is a fact about the week the
  // run was played in, not a benefit the run earned - the same reasoning that
  // keeps trait deltas alive through a Phoenix. The §10 clamps below still
  // bind, so no clause can lift the bank past 1.75.
  const bankClause = conditionBankDelta(world);
  if (bankClause !== 0) bank = round4(bank + bankClause);
  // Hard clamps (section 10). These bound what BUILD may do to an outcome,
  // and every delta above was authored against them, so they still run on the
  // historical base — the carry is applied afterwards, as a ratio.
  bank = Math.min(STRAIN_ECONOMICS.bankClamp, bank);
  death = Math.min(STRAIN_ECONOMICS.salvageClamp, death);
  // THE CARRY (WP-3.10). Undefined means no seeded schedule stood behind this
  // run — a legacy blob or the workbench's empty genome — and it keeps the flat
  // multipliers it was authored against. Zero is a live carry at its first
  // door, which is a different thing entirely. See `GenomeRunInput`.
  if (input.portalsPassed !== undefined) {
    return carryScaled({ bank, death }, input.portalsPassed);
  }
  return { bank, death };
}

// =============================================================================
// BOUNDED-TRUST CLAIM CAPS
// =============================================================================

export interface GenomeClaimCaps {
  aurumWakeDna: number;
  midasDna: number;
  moltFoodDna: number;
  ouroborosDna: number;
  staticChargeDna: number;
  ricochetDna: number;
  heartwoodDna: number;
  secondSunFlat: number;
  /** Aggregate claims backstop: sum of claims <= deterministic x 0.35. */
  globalClaimsCap: number;
}

/**
 * Per-run capsBasis: the deterministic sums the claim caps derive from.
 * Produced by the computeGenomeRunTotals fold (rulesets.ts) so the caps
 * use exactly the per-food DNA the recompute paid.
 */
export interface GenomeCapsBasis {
  /** Cumulative deterministic DNA after each food (index 0 = 0). */
  cumulativeDna: number[];
  /** Gene-less (traits+anomaly only) raw total for the same food count. */
  genelessRaw: number;
  foodCount: number;
}

function dnaSince(basis: GenomeCapsBasis, atFood: number | null): number {
  if (atFood === null) return 0;
  const total = basis.cumulativeDna[basis.foodCount] ?? 0;
  const before = basis.cumulativeDna[Math.min(atFood, basis.foodCount)] ?? 0;
  return Math.max(0, total - before);
}

export function genomeClaimCaps(
  input: GenomeRunInput,
  basis: GenomeCapsBasis,
  lengthTrace: LengthTrace,
  condition: ConditionInput = null
): GenomeClaimCaps {
  const world = normalizeCondition(condition);
  const anomaly = world.anomaly;
  const view = input.splicesEnabled === false
    ? { loose: [...input.picks], splices: [] }
    : fusePicks(input.picks);
  const activations = strainActivations(
    input.picks,
    input.heirloom,
    input.surges,
    input.tierCap ?? 3,
    input.suppressedStrains ?? [],
    conditionStrainThresholdDelta(world)
  );
  const find = (id: GeneId) => view.loose.find((p) => p.id === id);
  const fusedRicochet = view.splices.find((s) => s.spliceId === 'splice_ricochet');
  const aurum = activations.AURUM;
  const feral = activations.FERAL;
  const staticCharge = find('static_charge');
  const heartwood = find('heartwood');

  const moltEvents = lengthTrace.shedEvents.filter(
    (e) => e.source === 'molt'
  ).length;
  const heartwoodEvents = heartwood
    ? lengthTrace.shedEvents.filter((e) => e.atFood > heartwood.atFood).length
    : 0;
  const foodsSinceFeralApex =
    feral.apexAt !== null ? Math.max(0, basis.foodCount - feral.apexAt) : 0;

  return {
    aurumWakeDna:
      aurum.expressionAt !== null
        ? Math.floor(
            dnaSince(basis, aurum.expressionAt) *
              STRAIN_ECONOMICS.aurumWakeMaxBonusRatio
          )
        : 0,
    midasDna:
      aurum.apexAt !== null
        ? Math.floor(
            dnaSince(basis, aurum.apexAt) * STRAIN_ECONOMICS.midasMaxBonusRatio
          )
        : 0,
    moltFoodDna:
      moltEvents *
      STRAIN_ECONOMICS.moltFoodsPerEvent *
      (anomaly === 'overgrown'
        ? ANOMALY_ECONOMICS.overgrownMoltFoodFlat
        : STRAIN_ECONOMICS.moltFoodFlat),
    ouroborosDna:
      feral.apexAt !== null
        ? Math.floor(foodsSinceFeralApex / STRAIN_ECONOMICS.ouroborosFoodsPerBite) *
          STRAIN_ECONOMICS.ouroborosBiteFlat
        : 0,
    staticChargeDna: staticCharge
      ? Math.floor(
          dnaSince(basis, staticCharge.atFood) *
            GENE_ECONOMICS.staticChargeMaxBonusRatio
        )
      : 0,
    ricochetDna: fusedRicochet
      ? Math.floor(
          dnaSince(basis, fusedRicochet.atFood) *
            SPLICE_ECONOMICS.ricochetMaxBonusRatio
        )
      : 0,
    heartwoodDna: heartwoodEvents * GENE_ECONOMICS.heartwoodGoldenFlat,
    secondSunFlat:
      activations.UMBRA.apexAt !== null
        ? STRAIN_ECONOMICS.secondSunTriggerFlat
        : 0,
    globalClaimsCap: Math.floor(
      (basis.cumulativeDna[basis.foodCount] ?? 0) *
        STRAIN_ECONOMICS.genomeClaimsCapRatio
    ),
  };
}

/** The DNA-bearing claim fields, in report order. */
export const GENOME_CLAIM_DNA_FIELDS = [
  'aurumWakeDna',
  'midasDna',
  'moltFoodDna',
  'ouroborosDna',
  'staticChargeDna',
  'ricochetDna',
  'heartwoodDna',
] as const;

export type GenomeClaimDnaField = (typeof GENOME_CLAIM_DNA_FIELDS)[number];

/** One clamp the server applied, with the DNA it cost the claim. */
export interface GenomeClaimClamp {
  /** The claim field, or 'total' for the aggregate backstop. */
  field: GenomeClaimDnaField | 'secondSunTriggered' | 'total';
  /** What the client claimed, normalized to a non-negative integer. */
  claimed: number;
  /** The server-computed ceiling. */
  cap: number;
  /** `claimed - accepted`: exactly the DNA this clamp removed. */
  delta: number;
}

export interface GenomeClaimClampResult {
  accepted: GenomeClaims;
  bonusDna: number;
  /** True when the aggregate backstop bound while every individual cap passed. */
  globalClampHit: boolean;
  /**
   * Every clamp applied, individually. WP-2.05: this is what makes a
   * `DNA_MISMATCH` explainable — the invariant the validator's tests pin is
   * that `claimed - recomputed` is fully accounted for by these deltas, so
   * no divergence is ever unattributed again.
   */
  clamps: GenomeClaimClamp[];
}

/**
 * Clamp untrusted claims against the caps. Returns the accepted claims,
 * the total accepted bonus DNA, whether the GLOBAL clamp bound while
 * individual caps passed (the cheat signal - flag, never hide), and the
 * individual clamps that were applied.
 */
export function clampGenomeClaims(
  raw: GenomeClaims,
  caps: GenomeClaimCaps
): GenomeClaimClampResult {
  const clamps: GenomeClaimClamp[] = [];
  const normalize = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
  };
  const clampInt = (field: GenomeClaimDnaField, cap: number): number => {
    const claimed = normalize(raw[field]);
    const acceptedValue = Math.min(cap, claimed);
    if (claimed > acceptedValue) {
      clamps.push({ field, claimed, cap, delta: claimed - acceptedValue });
    }
    return acceptedValue;
  };
  const secondSunClaimed = raw.secondSunTriggered === true;
  const secondSunAccepted = secondSunClaimed && caps.secondSunFlat > 0;
  if (secondSunClaimed && !secondSunAccepted) {
    clamps.push({
      field: 'secondSunTriggered',
      claimed: 1,
      cap: 0,
      delta: 1,
    });
  }
  const accepted: GenomeClaims = {
    aurumWakeDna: clampInt('aurumWakeDna', caps.aurumWakeDna),
    midasDna: clampInt('midasDna', caps.midasDna),
    moltFoodDna: clampInt('moltFoodDna', caps.moltFoodDna),
    ouroborosDna: clampInt('ouroborosDna', caps.ouroborosDna),
    staticChargeDna: clampInt('staticChargeDna', caps.staticChargeDna),
    ricochetDna: clampInt('ricochetDna', caps.ricochetDna),
    heartwoodDna: clampInt('heartwoodDna', caps.heartwoodDna),
    secondSunTriggered: secondSunAccepted,
  };
  let bonusDna =
    (accepted.aurumWakeDna ?? 0) +
    (accepted.midasDna ?? 0) +
    (accepted.moltFoodDna ?? 0) +
    (accepted.ouroborosDna ?? 0) +
    (accepted.staticChargeDna ?? 0) +
    (accepted.ricochetDna ?? 0) +
    (accepted.heartwoodDna ?? 0) +
    (accepted.secondSunTriggered ? caps.secondSunFlat : 0);
  let globalClampHit = false;
  if (bonusDna > caps.globalClaimsCap) {
    globalClampHit = true;
    clamps.push({
      field: 'total',
      claimed: bonusDna,
      cap: caps.globalClaimsCap,
      delta: bonusDna - caps.globalClaimsCap,
    });
    bonusDna = caps.globalClaimsCap;
  }
  return { accepted, bonusDna, globalClampHit, clamps };
}

// =============================================================================
// SANITIZERS (shared client/server shape guards)
// =============================================================================

export function sanitizeSurges(raw: unknown): StrainSurge[] {
  if (!Array.isArray(raw)) return [];
  const surges: StrainSurge[] = [];
  for (const entry of raw) {
    if (surges.length >= STRAIN_PHYSICS.infuseMaxPerRun) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { strain, atFood } = entry as { strain?: unknown; atFood?: unknown };
    if (
      typeof strain === 'string' &&
      (STRAIN_IDS as readonly string[]).includes(strain) &&
      typeof atFood === 'number' &&
      Number.isInteger(atFood) &&
      atFood >= 0
    ) {
      surges.push({ strain: strain as StrainId, atFood });
    }
  }
  return surges;
}

export function sanitizeInfuses(raw: unknown, foodCount: number): { atFood: number }[] {
  if (!Array.isArray(raw)) return [];
  const infuses: { atFood: number }[] = [];
  let last = -1;
  for (const entry of raw) {
    if (infuses.length >= STRAIN_PHYSICS.infuseMaxPerRun) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { atFood } = entry as { atFood?: unknown };
    if (
      typeof atFood === 'number' &&
      Number.isInteger(atFood) &&
      atFood > last &&
      atFood <= foodCount
    ) {
      infuses.push({ atFood });
      last = atFood;
    }
  }
  return infuses;
}

const REVIVE_KINDS: readonly ReviveKind[] = [
  'phoenix',
  'styx',
  'molted',
  'second_sun',
] as const;

export function sanitizeRevive(raw: unknown, foodCount: number): GenomeRevive | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kind, atFood } = raw as { kind?: unknown; atFood?: unknown };
  if (
    typeof kind === 'string' &&
    (REVIVE_KINDS as readonly string[]).includes(kind) &&
    typeof atFood === 'number' &&
    Number.isInteger(atFood) &&
    atFood >= 0 &&
    atFood <= foodCount
  ) {
    return { kind: kind as ReviveKind, atFood };
  }
  return null;
}

export function sanitizeLossEvents(raw: unknown): LengthLossEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: LengthLossEvent[] = [];
  for (const entry of raw) {
    if (events.length >= 64) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { atFood, segments } = entry as { atFood?: unknown; segments?: unknown };
    if (
      typeof atFood === 'number' &&
      Number.isInteger(atFood) &&
      atFood >= 0 &&
      typeof segments === 'number' &&
      Number.isInteger(segments) &&
      segments > 0 &&
      segments <= 64
    ) {
      events.push({ atFood, segments });
    }
  }
  return events;
}

/** Ascetic check under genome rules: no gene foods ever spawn. */
export function genePoolBlockedByTraits(traits: TraitId[]): boolean {
  return traits.includes('ascetic');
}

/** Tithe per-food floor - exported for the rulesets fold + engine. */
export function tithePerFoodFloor(view: FusedView, n: number): number {
  const tithe = view.loose.find((p) => p.id === 'tithe');
  return tithe !== undefined && n > tithe.atFood ? 1 : 0;
}

export { fusePicks };
export type { FusedView };
