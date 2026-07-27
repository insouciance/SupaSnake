/**
 * THE WORKBENCH — planning a hunt against a week you can read (WP-2.08).
 *
 * WHAT THIS IS FOR
 *
 * Every deep loadout game grows a community calculator, because optimising a
 * build against a changing boss by trial and error is endless and nobody has
 * the runs to spare. SupaSnake now has all four ingredients natively: a
 * varying context (the week's Serpent condition and its clause, the day's
 * Signal), an account-bound inventory, a computable interaction, and stakes.
 * So the calculator is built in, where it has two advantages no external one
 * can have — it reads the player's REAL inventory, and it sits inside the
 * ritual, one link from the Monday briefing.
 *
 * EVERY NUMBER HERE COMES FROM THE MODULE THAT OWNS IT
 *
 * This file computes nothing itself. Strain tiers come from
 * `strainActivations` — the resolver that honours `tierCap` and suppressions —
 * never from a hand-rolled threshold comparison, because four ordinary cases
 * make a hand-rolled one wrong (see `workbench.parity.test.ts`). DNA comes
 * from `computeGenomeRunTotals`; Yield comes from `applyGenomeOutcome`; offer
 * weight comes from `geneWeightBreakdown`. The Workbench arranges those
 * answers. It never restates them.
 *
 * ── THE FOUR HONESTY CONSTRAINTS ─────────────────────────────────────────
 *
 * 1. YIELD IS NOT rawDna. `applyGenomeOutcome` stands between them, and the
 *    two of them differ by more than a third on an ordinary build. Every
 *    projection therefore carries rawDna, banked, salvaged AND both
 *    multipliers, so a player can see which of the three numbers moved.
 *
 * 2. A PROJECTION IS A FLOOR, NOT A FORECAST. The bounded-trust claims —
 *    Gilded Wake cells, Molt foods, Ouroboros bites, the Second Sun trigger
 *    and the rest — are *claimed* by a run that plays them, not derived from
 *    a build. A pre-run calculator cannot know how many gilded cells you will
 *    re-cross. So they are excluded, the reading is labelled a floor, and the
 *    excluded ceiling is reported separately from the engine's own
 *    `genomeClaimCaps` rather than guessed at or quietly folded in.
 *
 * 3. THREE BASES, NOT ONE AVERAGE. A single projected number is a promise the
 *    first undershooting run breaks, after which the tool is never trusted
 *    again. Every plan is therefore read at three labelled run lengths taken
 *    from the player's own history — the plan's own floor, their median run
 *    and their best run — each carrying the sample size it was drawn from.
 *
 * 4. NO SLOT-2 PROBABILITY, EVER. Slot 1 of an offer is a weighted draw whose
 *    share is exactly computable, so it is shown — labelled "before
 *    overrides", because the lineage guarantee and the pity rule replace the
 *    RESULT of that draw and a pre-run calculator cannot know `recentOffers`.
 *    Slot 2 branches on a 25% wildcard that redraws uniformly over off-build
 *    genes, so no single share describes it. THIS MODULE QUOTES NO SLOT-2
 *    FIGURE AND MUST NOT GROW ONE. A wrong probability in a calculator is
 *    worse than a missing one: the missing one sends a player to the Codex,
 *    the wrong one sends them to a build that does not work and they blame
 *    the game.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────
 *
 * SCORE. `WorkbenchReading` has no score field, this module imports no score
 * constant, and `workbench.constitution.test.ts` greps this source to keep it
 * that way. Score is independent of genes, traits and anomalies by Rule 2 —
 * the leaderboard measures play, not build — and a build calculator that
 * projected Score would be asserting the opposite in the one place a player
 * would believe it.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  GENES,
  GENE_POOL,
  GENOME_SPAWN,
  SIGNATURE_GENES,
  geneStrains,
  type GeneId,
  type GenePick,
} from '@/shared/game/genes';
import { composeGenePool, deriveFtue, deriveHeirloom, ftueTierCap, type GenomeFtue } from '@/shared/game/genePool';
import type { GauntletBanLike } from '@/shared/game/gauntlet';
import { parseGauntletBan } from '@/shared/game/gauntlet';
import {
  genePoolBlockedByTraits,
  strainActivations,
  type GenomeClaimCaps,
  type GenomeRunInput,
  type StrainActivations,
} from '@/shared/game/genome';
import { describe as lexiconDescribe, strainTierLabel } from '@/shared/game/lexicon';
import type { Lineage } from '@/shared/game/lineage';
import {
  MASTERY_MUTATIONS,
  MASTERY_MUTATION_LEVELS,
} from '@/shared/game/mastery';
import {
  OFFER_GRAVITY,
  geneWeightBreakdown,
  type GeneWeightBreakdown,
  type LineageBias,
  type OfferContext,
} from '@/shared/game/offerGravity';
import {
  applyGenomeOutcome,
  computeGenomeRunTotals,
  type DynastyName,
} from '@/shared/game/rulesets';
import {
  SPLICES,
  SPLICE_IDS,
  fusePicks,
  fusedSlotCount,
  spliceForPair,
  type SpliceId,
} from '@/shared/game/splices';
import {
  STRAIN_IDS,
  STRAIN_PHYSICS,
  STRAIN_THRESHOLDS,
  capSpawnPoints,
  type StrainId,
  type StrainPoints,
  type StrainTier,
} from '@/shared/game/strains';
import type { TraitId } from '@/shared/game/traits';
import {
  NEUTRAL_CONDITION,
  conditionBankDelta,
  conditionOfferTilt,
  conditionStrainThresholdDelta,
  conditionSuppressedStrains,
  worldConditionName,
  worldConditionSummary,
  type ConditionInput,
  type WorldCondition,
} from '@/shared/game/worldCondition';
import { genomeOutcomeMultipliers } from '@/shared/game/genome';

// ===========================================================================
// THE CADENCE — why a loadout is an ordered plan and not a set
// ===========================================================================

/**
 * The food interval a plan assumes between gene pickups.
 *
 * This is the single most consequential shape decision in the Workbench, and
 * it is forced by the engine rather than chosen: `strainActivations` walks
 * point events in `atFood` ORDER, so the same six genes taken in two different
 * orders reach their Expression at two different foods — and under a tight
 * `tierCap` or a threshold clause, sometimes one order reaches it and the
 * other never does. A set of genes is therefore not enough information to
 * compute a tier from, which is why the Workbench takes an ORDERED plan.
 *
 * The interval itself is `GENOME_SPAWN.intervalBase`, the cadence the engine
 * spawns gene foods on. The real spawn carries `intervalJitter` on top; a plan
 * uses the base and SAYS SO on screen (`PLAN_ASSUMPTIONS`), because a planning
 * tool that silently modelled the jitter would be presenting one roll of it as
 * the answer.
 */
export const PLAN_FOOD_STEP: number = GENOME_SPAWN.intervalBase;

/** A plan can hold no more genes than a run can. */
export const MAX_PLAN_GENES: number = GENOME_SPAWN.maxHeld;

/** A plan can hold no more infuses than a run allows. */
export const MAX_PLAN_INFUSES: number = STRAIN_PHYSICS.infuseMaxPerRun;

/**
 * The assumptions a reading rests on, in the words the screen shows. They are
 * listed rather than buried because every one of them is a place where a real
 * run can differ from the plan, and a player who knows that reads the numbers
 * correctly the first time instead of after a disappointment.
 */
export const PLAN_ASSUMPTIONS: readonly string[] = [
  `Genes are planned one every ${PLAN_FOOD_STEP} foods — the base spawn cadence. A real run jitters by ±${GENOME_SPAWN.intervalJitter} foods, so a pick can land a little either side.`,
  'Infuses are planned after the last gene, at the same cadence. Each one costs tail segments, so it also shortens the body the length model pays from.',
  'An infuse taken at the gene cap grants a Strain Surge worth a point. Which strain is your choice in the moment, so no surge is modelled here — a surge can only make the real run better than this reading.',
  'Order matters. The same genes in a different order reach their Expression at a different food, and under a tight ceiling sometimes not at all.',
];

/** The food index each gene of a plan is assumed to be picked at. */
export function planPickFoods(geneCount: number): number[] {
  const count = Math.max(0, Math.min(Math.floor(geneCount) || 0, MAX_PLAN_GENES));
  return Array.from({ length: count }, (_, i) => (i + 1) * PLAN_FOOD_STEP);
}

/** The food index each planned infuse is assumed to be spent at. */
export function planInfuseFoods(geneCount: number, infuses: number): number[] {
  const genes = Math.max(0, Math.min(Math.floor(geneCount) || 0, MAX_PLAN_GENES));
  const count = Math.max(0, Math.min(Math.floor(infuses) || 0, MAX_PLAN_INFUSES));
  return Array.from({ length: count }, (_, i) => (genes + i + 1) * PLAN_FOOD_STEP);
}

// ===========================================================================
// INPUTS
// ===========================================================================

/** One of the player's snakes, as the Workbench reads it. */
export interface WorkbenchSnake {
  /** Opaque row id — the Workbench never dereferences it. */
  id: string;
  name: string;
  dynasty: DynastyName;
  generation: number;
  traits: TraitId[];
  lineage: Lineage | null;
  /** The player's mastery level on THIS snake's dynasty. */
  masteryLevel: number;
}

/** The account facts a reading needs, all server-derived. */
export interface WorkbenchAccount {
  /** Banked runs — drives the FTUE ramp and therefore the tier ceiling. */
  bankedRuns: number;
  /** Distinct owned variants — the second half of the spawn-point gate. */
  ownedVariants: number;
  /** Seasonal gene ids currently in the offer pool. */
  seasonalGeneIds: readonly GeneId[];
  /** The Gauntlet ban in force, if the player is in one. */
  gauntletBan?: GauntletBanLike | null;
  /**
   * Foods eaten in the player's completed earned runs. The ONLY source of the
   * median and best projection bases: a calculator that projected against a
   * number the player has never reached would be selling a fantasy.
   */
  runFoods: readonly number[];
}

/** An ordered plan. The order is the plan. */
export interface WorkbenchPlan {
  /** Gene ids in PICK ORDER. */
  genes: readonly GeneId[];
  /** How many portals are spent on INFUSE rather than BANK or PASS. */
  infuses: number;
}

export const EMPTY_PLAN: WorkbenchPlan = { genes: [], infuses: 0 };

// ===========================================================================
// OUTPUTS
// ===========================================================================

/** Which of the three labelled run lengths a projection was read at. */
export type WorkbenchBasis = 'floor' | 'median' | 'best';

export interface WorkbenchProjection {
  basis: WorkbenchBasis;
  /** What the label says on screen, including where the number came from. */
  label: string;
  /** The run length this projection assumes. */
  foods: number;
  /**
   * How many of the player's runs the base was drawn from. 0 for the plan's
   * own floor, which is derived from the plan and not from history.
   */
  sampleSize: number;
  /** Deterministic DNA before the outcome multiplier. NOT the Yield. */
  rawDna: number;
  /** `applyGenomeOutcome(rawDna, true, …)` — the Yield if the run banks. */
  banked: number;
  /** `applyGenomeOutcome(rawDna, false, …)` — the Yield if the run dies. */
  salvaged: number;
  bankMultiplier: number;
  salvageMultiplier: number;
  /** Genes actually held by this food count (a short run holds fewer). */
  genesLanded: number;
  /** Infuses actually spent by this food count. */
  infusesSpent: number;
}

/** A bounded-trust upside a projection deliberately leaves out. */
export interface WorkbenchExclusion {
  /** The claim field it maps to in `GenomeClaimCaps`. */
  id: string;
  name: string;
  /** The engine's own cap on this claim for this plan, at the best basis. */
  ceiling: number;
  why: string;
}

/** One strain's standing under the plan and the condition. */
export interface WorkbenchStrainReading {
  strain: StrainId;
  name: string;
  color: string;
  /** Points at the end of the plan: spawn (capped) + gene picks. */
  points: number;
  /** In-run genes of this strain — the gate spawn points can never satisfy. */
  genes: number;
  tier: StrainTier;
  tierLabel: string;
  minorAt: number | null;
  expressionAt: number | null;
  apexAt: number | null;
  /** The condition suppresses this strain: tier 1 is its ceiling. */
  suppressed: boolean;
  /** The condition's shift of all three thresholds, in points. */
  thresholdDelta: number;
  /** What stands between this strain and its next tier, or null at the top. */
  blockedBy: 'points' | 'genes' | 'suppressed' | 'tierCap' | null;
  /** Points still needed for the next tier (0 when points are not the block). */
  pointsNeeded: number;
  /** In-run genes still needed for the next tier. */
  genesNeeded: number;
}

/** A gene's slot-1 share of one offer. Never a slot-2 share. */
export interface WorkbenchOfferShare {
  gene: GeneId;
  name: string;
  /** Share of the slot-1 weighted draw, 0..1, BEFORE the two overrides. */
  share: number;
  breakdown: GeneWeightBreakdown;
}

/** The likelihood the plan's own next gene is offered when the plan wants it. */
export interface WorkbenchPlannedOffer {
  gene: GeneId;
  name: string;
  /** Offer index the plan expects this gene at (0-based). */
  offerIndex: number;
  atFood: number;
  /** Slot-1 share at that offer, given the picks the plan has made by then. */
  share: number;
  /** Rank among that offer's candidates by weight — 1 is the heaviest. */
  rank: number;
  candidates: number;
  breakdown: GeneWeightBreakdown;
}

export interface WorkbenchOfferReading {
  /** Slot-1 shares at offer 0, the only offer a pre-run tool knows exactly. */
  firstOffer: WorkbenchOfferShare[];
  /** Each planned gene's slot-1 share at the offer the plan wants it. */
  planned: WorkbenchPlannedOffer[];
  /** The two things that replace a slot-1 result, stated conditionally. */
  overrides: string[];
  /**
   * Always null, always will be. See honesty constraint 4 in the module
   * header — the 25% wildcard branch means no single figure describes slot 2.
   */
  slot2: null;
  /** The sentence the screen shows where a slot-2 number would have gone. */
  slot2Refusal: string;
}

/** A gene the player cannot be offered on this snake, and what would change it. */
export interface WorkbenchGeneLock {
  gene: GeneId;
  name: string;
  unlock: string;
}

/** A splice the plan cannot form from this snake's pool, and why. */
export interface WorkbenchSpliceLock {
  splice: SpliceId;
  name: string;
  formable: boolean;
  missing: WorkbenchGeneLock[];
}

export interface WorkbenchReachability {
  genes: WorkbenchGeneLock[];
  splices: WorkbenchSpliceLock[];
}

/** A splice the plan forms, and where. */
export interface WorkbenchPlanSplice {
  splice: SpliceId;
  name: string;
  atFood: number;
  parents: [GeneId, GeneId];
}

export interface WorkbenchConditionReading {
  name: string;
  summary: string;
  clauses: { id: string; name: string; effect: string; polarity: 'benefit' | 'cost' }[];
  /** The one strain the offer stream tilts toward, resolved as the run will. */
  tilt: StrainId | null;
  suppressed: StrainId[];
  thresholdDelta: Readonly<Partial<Record<StrainId, number>>>;
  bankDelta: number;
}

/** Everything the Workbench can honestly say about one (snake, plan, week). */
export interface WorkbenchReading {
  snake: WorkbenchSnake;
  condition: WorkbenchConditionReading;
  ftue: GenomeFtue;
  /** The economy-binding tier ceiling this account plays under. */
  tierCap: Extract<StrainTier, 1 | 2 | 3>;
  /** The gene pool this snake draws from, composed exactly as the run will. */
  pool: GeneId[];
  /** Ascetic: no gene foods spawn at all, so no plan can be assembled. */
  poolBlocked: boolean;
  /** Spawn points from lineage and Heirloom traits, already capped. */
  heirloom: StrainPoints;
  /** The offer bias this snake's lineage carries, or null when it has none. */
  lineageBias: LineageBias | null;
  /** Planned genes with the food each is assumed to land at. */
  picks: GenePick[];
  /** Planned genes that are not in this snake's pool. */
  unreachableGenes: WorkbenchGeneLock[];
  /** Slots the plan occupies once fusions are counted. A splice takes one. */
  slotsUsed: number;
  planSplices: WorkbenchPlanSplice[];
  infuseFoods: number[];
  strains: WorkbenchStrainReading[];
  projections: WorkbenchProjection[];
  /** Why every projection above is a floor. */
  excluded: WorkbenchExclusion[];
  offers: WorkbenchOfferReading;
  reachability: WorkbenchReachability;
  assumptions: readonly string[];
}

// ===========================================================================
// COPY THAT MUST NOT DRIFT
// ===========================================================================

/**
 * The sentence that stands where a slot-2 probability would go. Exported so
 * the screen and the test read the same words: a refusal that is only in a
 * comment is a refusal the next person deletes.
 */
export const SLOT_2_REFUSAL =
  `Slot 2 is not quoted. ${Math.round(OFFER_GRAVITY.wildcardChance * 100)}% of the time it ignores gravity entirely and draws evenly from genes your build has no points in, so no single number describes it. The Codex has the rule; this tool will not guess at it.`;

/** The label every projection carries. A floor is not a forecast. */
export const FLOOR_LABEL =
  'A floor, not a forecast — deterministic DNA only, with every claimed bonus left out.';

const EXCLUSION_SOURCES: readonly {
  field: keyof GenomeClaimCaps;
  kind: 'strainTier' | 'gene' | 'splice';
  id: string;
  why: string;
}[] = [
  {
    field: 'aurumWakeDna',
    kind: 'strainTier',
    id: 'AURUM:2',
    why: 'Pays for gilded cells you re-cross. How many depends on how you drive.',
  },
  {
    field: 'midasDna',
    kind: 'strainTier',
    id: 'AURUM:3',
    why: 'Pays for foods chained inside the golden window. That is reflex, not build.',
  },
  {
    field: 'moltFoodDna',
    kind: 'strainTier',
    id: 'FERAL:2',
    why: 'Pays for molt foods eaten. The molt drops them; eating them is on you.',
  },
  {
    field: 'ouroborosDna',
    kind: 'strainTier',
    id: 'FERAL:3',
    why: 'Pays per tail-tip bite, and a bite is a decision taken mid-run.',
  },
  {
    field: 'staticChargeDna',
    kind: 'gene',
    id: 'static_charge',
    why: 'Pays for fasting eats — a rhythm you choose, not a number the build fixes.',
  },
  {
    field: 'ricochetDna',
    kind: 'splice',
    id: 'splice_ricochet',
    why: 'Pays for foods eaten while wall-sliding.',
  },
  {
    field: 'heartwoodDna',
    kind: 'gene',
    id: 'heartwood',
    why: 'Pays for golden shed-drops eaten before they expire.',
  },
  {
    field: 'secondSunFlat',
    kind: 'strainTier',
    id: 'UMBRA:3',
    why: 'Pays once, and only if the trigger fires. It may not.',
  },
];

// ===========================================================================
// SMALL PURE HELPERS
// ===========================================================================

/**
 * The runSeed a pre-run reading uses. Offer WEIGHTS never read the seed — only
 * the draw does, and the Workbench never draws. Named so that is obvious.
 */
const WEIGHTS_ONLY_SEED = '';

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function sanitizeFoods(values: readonly number[]): number[] {
  return values
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .map((v) => Math.floor(v));
}

function geneName(id: GeneId): string {
  return GENES[id]?.name ?? id;
}

// ===========================================================================
// REACHABILITY — naming the unlock is where the tool earns its keep
// ===========================================================================

/**
 * Why a gene is absent from this snake's pool, in the words that tell a player
 * what to do about it. Derived from the same tables `composeGenePool` reads,
 * so a retune of the mastery track cannot leave this copy behind.
 */
export function geneUnlock(
  gene: GeneId,
  dynasty: DynastyName,
  gauntletBan: GauntletBanLike | null | undefined
): string {
  const parsedBan = parseGauntletBan(gauntletBan ?? null);
  if (parsedBan?.kind === 'gene' && parsedBan.id === gene) {
    return 'Banned for this Gauntlet.';
  }
  if (parsedBan?.kind === 'strain' && geneStrains(gene).includes(parsedBan.id)) {
    return `Banned for this Gauntlet — its ${parsedBan.id} tag is barred.`;
  }
  for (const owner of ['PRIMAL', 'CYBER', 'COSMIC'] as const) {
    if (SIGNATURE_GENES[owner] === gene) {
      return owner === dynasty
        ? `Reach ${owner} M10 — the dynasty's signature gene.`
        : `${owner} only, at M10. This snake is ${dynasty}.`;
    }
    for (const level of MASTERY_MUTATION_LEVELS) {
      if (MASTERY_MUTATIONS[owner][level] === gene) {
        return owner === dynasty
          ? `Reach ${owner} M${level}.`
          : `${owner} only, from M${level}. This snake is ${dynasty}.`;
      }
    }
  }
  if (GENE_POOL.includes(gene)) {
    return 'In the base pool — it should already be offered.';
  }
  return 'Seasonal: in the pool only while its season runs.';
}

function geneLock(
  gene: GeneId,
  dynasty: DynastyName,
  ban: GauntletBanLike | null | undefined
): WorkbenchGeneLock {
  return { gene, name: geneName(gene), unlock: geneUnlock(gene, dynasty, ban) };
}

/**
 * Which splices this pool can and cannot form. The three unformable from a
 * base pool fall out of the data rather than being listed: Comet Tail wants
 * Afterburner (CYBER M6), Black Magnet wants Gravity Well (COSMIC M6), and Old
 * Growth wants both Deep Roots (PRIMAL M3) and a seasonal Glacial Reserve.
 */
export function spliceReachability(
  pool: readonly GeneId[],
  dynasty: DynastyName,
  ban: GauntletBanLike | null | undefined
): WorkbenchSpliceLock[] {
  const held = new Set(pool);
  return SPLICE_IDS.map((id) => {
    const missing = SPLICES[id].parents
      .filter((parent) => !held.has(parent))
      .map((parent) => geneLock(parent, dynasty, ban));
    return {
      splice: id,
      name: SPLICES[id].name,
      formable: missing.length === 0,
      missing,
    };
  });
}

// ===========================================================================
// STRAINS
// ===========================================================================

function tierOf(activation: StrainActivations[StrainId]): StrainTier {
  if (activation.apexAt !== null) return 3;
  if (activation.expressionAt !== null) return 2;
  if (activation.minorAt !== null) return 1;
  return 0;
}

function strainReading(
  strain: StrainId,
  activations: StrainActivations,
  tierCap: StrainTier,
  suppressed: readonly StrainId[],
  thresholdDelta: Readonly<Partial<Record<StrainId, number>>>
): WorkbenchStrainReading {
  const activation = activations[strain];
  const tier = tierOf(activation);
  const isSuppressed = suppressed.includes(strain);
  const delta = thresholdDelta[strain] ?? 0;
  const cap: StrainTier = isSuppressed ? 1 : tierCap;
  const entry = lexiconDescribe('strain', strain);

  let blockedBy: WorkbenchStrainReading['blockedBy'] = null;
  let pointsNeeded = 0;
  let genesNeeded = 0;
  if (tier < 3) {
    if (tier >= cap) {
      blockedBy = isSuppressed ? 'suppressed' : 'tierCap';
    } else {
      const next = (tier + 1) as 1 | 2 | 3;
      const needPoints =
        (next === 1
          ? STRAIN_THRESHOLDS.minor
          : next === 2
            ? STRAIN_THRESHOLDS.expression
            : STRAIN_THRESHOLDS.apex) + delta;
      const needGenes =
        next === 2
          ? STRAIN_THRESHOLDS.expressionMinGenes
          : next === 3
            ? STRAIN_THRESHOLDS.apexMinGenes
            : 0;
      pointsNeeded = Math.max(0, needPoints - activation.points);
      genesNeeded = Math.max(0, needGenes - activation.genes);
      blockedBy = pointsNeeded > 0 ? 'points' : genesNeeded > 0 ? 'genes' : null;
    }
  }

  return {
    strain,
    name: entry?.name ?? strain,
    color: entry?.color ?? '#ffffff',
    points: activation.points,
    genes: activation.genes,
    tier,
    tierLabel: strainTierLabel(strain, tier),
    minorAt: activation.minorAt,
    expressionAt: activation.expressionAt,
    apexAt: activation.apexAt,
    suppressed: isSuppressed,
    thresholdDelta: delta,
    blockedBy,
    pointsNeeded,
    genesNeeded,
  };
}

// ===========================================================================
// OFFERS
// ===========================================================================

function offerContext(
  pool: readonly GeneId[],
  picks: GenePick[],
  points: StrainPoints,
  offerIndex: number,
  lineage: LineageBias | null,
  tilt: StrainId | null
): OfferContext {
  return {
    runSeed: WEIGHTS_ONLY_SEED,
    offerIndex,
    picks,
    pool: [...pool],
    points,
    lineage,
    anomalyStrain: tilt,
  };
}

/**
 * Live strain points after the first `n` picks of a plan — what the offer
 * gravity for pick `n` is weighted by. Read from `strainActivations` so the
 * spawn cap and the point arithmetic are the engine's, not a second copy.
 */
function pointsAfter(picks: GenePick[], heirloom: StrainPoints): StrainPoints {
  const activations = strainActivations(picks, heirloom);
  const points: StrainPoints = {};
  for (const strain of STRAIN_IDS) {
    const value = activations[strain].points;
    if (value > 0) points[strain] = value;
  }
  return points;
}

function slot1Shares(ctx: OfferContext): WorkbenchOfferShare[] {
  const held = new Set(ctx.picks.map((p) => p.id));
  const candidates = ctx.pool.filter((id) => !held.has(id) && id in GENES);
  const breakdowns = candidates.map((id) => geneWeightBreakdown(id, ctx));
  const total = breakdowns.reduce((sum, b) => sum + b.total, 0);
  return candidates
    .map((gene, i) => ({
      gene,
      name: geneName(gene),
      share: total > 0 ? breakdowns[i].total / total : 0,
      breakdown: breakdowns[i],
    }))
    .sort((a, b) => b.share - a.share || a.gene.localeCompare(b.gene));
}

function overrideNotes(lineage: LineageBias | null, tilt: StrainId | null): string[] {
  const notes: string[] = [
    `Pity: if your last ${OFFER_GRAVITY.pityOfferWindow} offers hold no gene of your highest-point strain, slot 1 is replaced by that strain's heaviest candidate. A pass counts — the window counts offers, not picks — so this tool cannot know whether it has fired.`,
  ];
  if (lineage?.guaranteeFirstOffer) {
    notes.push(
      'Lineage guarantee: this snake is strength 2, so slot 1 of your FIRST offer is replaced by a lineage-strain gene if the draw did not already produce one.'
    );
  } else if (lineage) {
    notes.push(
      `Lineage bias: this snake's strains carry +${OFFER_GRAVITY.lineageBiasWeight} weight for the first ${OFFER_GRAVITY.lineageBiasOffers} offers. It is already in the shares below.`
    );
  }
  if (tilt !== null) {
    notes.push(
      `This week's tilt is ${tilt}: its genes carry the condition weight shown in each breakdown.`
    );
  }
  return notes;
}

// ===========================================================================
// THE READING
// ===========================================================================

function projectionLabel(basis: WorkbenchBasis, sampleSize: number): string {
  switch (basis) {
    case 'floor':
      return 'Plan floor — the shortest run in which every planned gene has landed.';
    case 'median':
      return `Your median run — the middle of your last ${sampleSize} runs.`;
    case 'best':
      return `Your best run — the longest of your last ${sampleSize}.`;
  }
}

/**
 * Build the genome input for a run of exactly `foods` foods.
 *
 * Only the events that have actually happened by then are included: a plan
 * whose sixth gene lands at food 120 does not hold six genes on a 60-food run,
 * and pretending otherwise is how a calculator ends up promising a Yield that
 * the run it describes could never pay.
 */
function genomeAt(
  foods: number,
  picks: GenePick[],
  infuseFoods: number[],
  heirloom: StrainPoints,
  tierCap: StrainTier,
  suppressed: readonly StrainId[],
  splicesEnabled: boolean
): GenomeRunInput {
  return {
    picks: picks.filter((p) => p.atFood <= foods),
    heirloom,
    surges: [],
    infuses: infuseFoods.filter((atFood) => atFood <= foods).map((atFood) => ({ atFood })),
    revive: null,
    tierCap,
    suppressedStrains: suppressed,
    splicesEnabled,
  };
}

/**
 * Read one (snake, plan, condition).
 *
 * Every figure below is produced by the module that owns it. Nothing here is
 * a second implementation of anything the engine does.
 */
export function readWorkbench(
  snake: WorkbenchSnake,
  plan: WorkbenchPlan,
  account: WorkbenchAccount,
  condition: ConditionInput = null
): WorkbenchReading {
  const world: WorldCondition =
    condition === null || condition === undefined
      ? NEUTRAL_CONDITION
      : typeof condition === 'string'
        ? { ...NEUTRAL_CONDITION, anomaly: condition }
        : condition;
  // The bare-anomaly branch above only carries the id; every consumer below is
  // handed `condition` itself so the shared normaliser composes the real
  // interaction. `world` is used for display only.
  const tilt = conditionOfferTilt(condition);
  const suppressed = conditionSuppressedStrains(condition);
  const thresholdDelta = conditionStrainThresholdDelta(condition);

  const ftue = deriveFtue(
    account.bankedRuns,
    snake.masteryLevel,
    account.ownedVariants
  );
  const tierCap = ftueTierCap(ftue);
  const poolBlocked = genePoolBlockedByTraits(snake.traits);
  const pool = poolBlocked
    ? []
    : composeGenePool(
        snake.dynasty,
        snake.masteryLevel,
        [...account.seasonalGeneIds],
        account.gauntletBan ?? null,
        false
      );
  const { heirloom, lineageBias } = deriveHeirloom(snake.lineage, snake.traits, ftue);

  // --- the plan, as picks -------------------------------------------------
  const planned = plan.genes.slice(0, MAX_PLAN_GENES);
  const pickFoods = planPickFoods(planned.length);
  const picks: GenePick[] = planned.map((id, i) => ({ id, atFood: pickFoods[i] }));
  const infuseFoods = planInfuseFoods(planned.length, plan.infuses);
  const inPool = new Set(pool);
  const unreachableGenes = planned
    .filter((id) => !inPool.has(id))
    .map((id) => geneLock(id, snake.dynasty, account.gauntletBan));

  const view = ftue.splicesUnlocked
    ? fusePicks(picks)
    : { loose: [...picks], splices: [] };
  const planSplices: WorkbenchPlanSplice[] = view.splices.map((s) => ({
    splice: s.spliceId,
    name: SPLICES[s.spliceId].name,
    atFood: s.atFood,
    parents: [s.parents[0].id, s.parents[1].id],
  }));

  // --- strains ------------------------------------------------------------
  const activations = strainActivations(
    picks,
    heirloom,
    [],
    tierCap,
    suppressed,
    thresholdDelta
  );
  const strains = STRAIN_IDS.map((strain) =>
    strainReading(strain, activations, tierCap, suppressed, thresholdDelta)
  );

  // --- the three bases ----------------------------------------------------
  const history = sanitizeFoods(account.runFoods);
  const floorFoods = pickFoods[pickFoods.length - 1] ?? 0;
  const bases: { basis: WorkbenchBasis; foods: number; sampleSize: number }[] = [
    { basis: 'floor', foods: floorFoods, sampleSize: 0 },
  ];
  if (history.length > 0) {
    bases.push({ basis: 'median', foods: median(history), sampleSize: history.length });
    bases.push({
      basis: 'best',
      foods: Math.max(...history),
      sampleSize: history.length,
    });
  }

  const projections: WorkbenchProjection[] = bases.map(({ basis, foods, sampleSize }) => {
    const genome = genomeAt(
      foods,
      picks,
      infuseFoods,
      heirloom,
      tierCap,
      suppressed,
      ftue.splicesUnlocked
    );
    const { rawDna } = computeGenomeRunTotals(
      snake.dynasty,
      foods,
      genome,
      snake.traits,
      condition
    );
    const { bank, death } = genomeOutcomeMultipliers(genome, snake.traits, condition);
    return {
      basis,
      label: projectionLabel(basis, sampleSize),
      foods,
      sampleSize,
      rawDna,
      banked: applyGenomeOutcome(rawDna, true, genome, snake.traits, condition),
      salvaged: applyGenomeOutcome(rawDna, false, genome, snake.traits, condition),
      bankMultiplier: bank,
      salvageMultiplier: death,
      genesLanded: genome.picks.length,
      infusesSpent: genome.infuses.length,
    };
  });

  // --- what the floor leaves out -----------------------------------------
  const widest = bases[bases.length - 1];
  const widestGenome = genomeAt(
    widest.foods,
    picks,
    infuseFoods,
    heirloom,
    tierCap,
    suppressed,
    ftue.splicesUnlocked
  );
  const { caps } = computeGenomeRunTotals(
    snake.dynasty,
    widest.foods,
    widestGenome,
    snake.traits,
    condition
  );
  const excluded: WorkbenchExclusion[] = EXCLUSION_SOURCES.flatMap((source) => {
    const ceiling = caps[source.field];
    if (typeof ceiling !== 'number' || ceiling <= 0) return [];
    const entry = lexiconDescribe(source.kind, source.id);
    return [
      {
        id: source.field,
        name: entry?.name ?? source.id,
        ceiling,
        why: source.why,
      },
    ];
  });

  // --- offers -------------------------------------------------------------
  const firstOffer = slot1Shares(
    offerContext(pool, [], capSpawnPoints(heirloom), 0, lineageBias, tilt)
  );
  const plannedOffers: WorkbenchPlannedOffer[] = picks.map((pick, index) => {
    const before = picks.slice(0, index);
    const ctx = offerContext(
      pool,
      before,
      pointsAfter(before, heirloom),
      index,
      lineageBias,
      tilt
    );
    const shares = slot1Shares(ctx);
    const at = shares.findIndex((s) => s.gene === pick.id);
    const found = at >= 0 ? shares[at] : null;
    return {
      gene: pick.id,
      name: geneName(pick.id),
      offerIndex: index,
      atFood: pick.atFood,
      share: found?.share ?? 0,
      rank: at >= 0 ? at + 1 : 0,
      candidates: shares.length,
      breakdown: found?.breakdown ?? geneWeightBreakdown(pick.id, ctx),
    };
  });

  return {
    snake,
    condition: {
      name: worldConditionName(condition),
      summary: worldConditionSummary(condition),
      clauses: world.clauses.map((clause) => ({
        id: clause.id,
        name: clause.name,
        effect: clause.effect,
        polarity: clause.polarity,
      })),
      tilt,
      suppressed,
      thresholdDelta,
      bankDelta: conditionBankDelta(condition),
    },
    ftue,
    tierCap,
    pool,
    poolBlocked,
    heirloom,
    lineageBias,
    picks,
    unreachableGenes,
    slotsUsed: fusedSlotCount(view),
    planSplices,
    infuseFoods,
    strains,
    projections,
    excluded,
    offers: {
      firstOffer,
      planned: plannedOffers,
      overrides: overrideNotes(lineageBias, tilt),
      slot2: null,
      slot2Refusal: SLOT_2_REFUSAL,
    },
    reachability: {
      genes: (Object.keys(GENES) as GeneId[])
        .filter((id) => !inPool.has(id))
        .map((id) => geneLock(id, snake.dynasty, account.gauntletBan)),
      splices: spliceReachability(pool, snake.dynasty, account.gauntletBan),
    },
    assumptions: PLAN_ASSUMPTIONS,
  };
}

// ===========================================================================
// THE INVENTORY RANKING — "which of my snakes fits this week"
// ===========================================================================

export interface WorkbenchRankedSnake {
  snake: WorkbenchSnake;
  /** The banked Yield at the widest basis this account has evidence for. */
  banked: number;
  rawDna: number;
  basis: WorkbenchBasis;
  foods: number;
  /** Strains that reach an Apex under this plan on this snake. */
  apexes: StrainId[];
  /** Strains that reach at least an Expression. */
  expressions: StrainId[];
  /** Planned genes this snake's pool cannot offer. */
  unreachableGenes: WorkbenchGeneLock[];
  /** This snake's lineage points at the strain the week tilts toward. */
  ridesTheTilt: boolean;
}

/**
 * Rank the player's inventory for one plan and one week — the question the
 * Workbench exists to answer, and the one no external calculator can answer
 * at all, because it needs the collection.
 *
 * Ranked by banked Yield at the widest basis the account has evidence for,
 * which is the plan's own floor until the player has finished a run. Ties keep
 * catalogue order, so the list never reshuffles between renders.
 */
export function rankInventory(
  snakes: readonly WorkbenchSnake[],
  plan: WorkbenchPlan,
  account: WorkbenchAccount,
  condition: ConditionInput = null
): WorkbenchRankedSnake[] {
  const tilt = conditionOfferTilt(condition);
  return snakes
    .map((snake) => {
      const reading = readWorkbench(snake, plan, account, condition);
      const projection =
        reading.projections[reading.projections.length - 1] ?? reading.projections[0];
      return {
        snake,
        banked: projection?.banked ?? 0,
        rawDna: projection?.rawDna ?? 0,
        basis: projection?.basis ?? 'floor',
        foods: projection?.foods ?? 0,
        apexes: reading.strains.filter((s) => s.tier >= 3).map((s) => s.strain),
        expressions: reading.strains.filter((s) => s.tier >= 2).map((s) => s.strain),
        unreachableGenes: reading.unreachableGenes,
        ridesTheTilt:
          tilt !== null &&
          (snake.lineage?.strains as readonly StrainId[] | undefined)?.includes(tilt) === true,
      };
    })
    .sort((a, b) => b.banked - a.banked);
}

/**
 * The default plan for a snake: its lineage strain's cheapest route to an
 * Expression, in pool order. Not a recommendation — a starting point, so the
 * screen opens with something computed rather than an empty form.
 */
export function suggestPlan(
  pool: readonly GeneId[],
  lineage: Lineage | null,
  tilt: StrainId | null
): WorkbenchPlan {
  const wanted: StrainId[] = [];
  if (tilt) wanted.push(tilt);
  for (const strain of lineage?.strains ?? []) {
    if (!wanted.includes(strain)) wanted.push(strain);
  }
  if (wanted.length === 0) return EMPTY_PLAN;
  const genes: GeneId[] = [];
  for (const strain of wanted) {
    for (const id of pool) {
      if (genes.length >= MAX_PLAN_GENES) break;
      if (!genes.includes(id) && geneStrains(id).includes(strain)) genes.push(id);
    }
  }
  return { genes, infuses: 0 };
}

/** The FTUE dials a reading's ceiling is derived from, for the screen's copy. */
export const WORKBENCH_FTUE = GAME_CONFIG.genome.ftue;

/** Splices the plan WOULD form if two planned genes are a recipe. */
export function planWouldFuse(genes: readonly GeneId[]): SpliceId[] {
  const found: SpliceId[] = [];
  for (let i = 0; i < genes.length; i += 1) {
    for (let j = i + 1; j < genes.length; j += 1) {
      const splice = spliceForPair(genes[i], genes[j]);
      if (splice !== null && !found.includes(splice)) found.push(splice);
    }
  }
  return found;
}
