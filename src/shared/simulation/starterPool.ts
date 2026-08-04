/**
 * Player Evolution & Onboarding — starter-pool and eligibility-prefix harness.
 *
 * WHY THIS EXISTS
 *
 * `docs/game/PLAYER_EVOLUTION_ONBOARDING.md` §4.3 and §4.5 refuse to let prose
 * choose the three Dynasty starter pools: they must be selected by deterministic
 * catalog simulation, and every eligibility prefix must be proved not to starve
 * the offer algorithm or to beat the complete roster. Constitution §17 items
 * 33-35 repeat that as a decision gate.
 *
 * WHAT IT IS NOT
 *
 * This module is not part of the game. Nothing in `src/app`, `src/components`
 * or `src/lib` imports it, and it introduces no state, flag, or route. It is
 * evidence-production tooling that lives under `src/` for exactly one reason:
 * `tsconfig.json` excludes `scripts/`, so a harness placed there could not be
 * held to `npx tsc --noEmit`, and the repository carries no TypeScript runner
 * (`tsx`/`ts-node`) that could execute one. Adding a toolchain dependency to a
 * contracts package is a worse trade than one non-imported pure module.
 *
 * WHAT IT MEASURES
 *
 * It drives the SHIPPED engine — `createGenomeV2State`, `rollGenomeV2Offer`,
 * `reduceGenomeV2Event` — over candidate pools. Nothing about the weighting,
 * legality filter, category rule, or bounded surprise is reimplemented here; if
 * the engine changes, these numbers change with it, which is the point.
 *
 * MODELLING THE OWNER RULING OF 4 AUGUST 2026
 *
 * Ruling 1 puts the Dynasty Signature in the run-one starter pool and deletes
 * the `apexesUnlocked` signature lock from the offer filter. WP-B SHIPPED THAT
 * DELETION, so the post-ruling filter is simply the filter now: `apexesUnlocked`
 * no longer appears in it, and every cohort measures the live engine directly.
 *
 * The pre-ruling behaviour is still measured, under `signatureLocked: true`,
 * because the size of that gap is the evidence for the ruling. It can no longer
 * be modelled by clearing an FTUE gate the filter does not read, so the harness
 * reproduces it structurally instead: the lock's entire effect was to withhold
 * the Signature from `legal`, which is exactly what removing the Signature from
 * that cohort's pool does. Offer weighting reads the pool, not the gate, so the
 * substitution is exact for everything measured here — and it stays exact
 * whatever a later build does with `apexesUnlocked`.
 */

import {
  GENOME_V2_GENES,
  genomeV2ActivePool,
  type GenomeV2ActiveGeneId,
  type GenomeV2GeneCategory,
} from '@/shared/game/genes';
import {
  GENOME_V2_SPLICES,
  GENOME_V2_SPLICE_IDS,
  GENOME_V2_STRAIN_THRESHOLDS,
  createGenomeV2State,
  genomeV2EventId,
  genomeV2SpliceForPair,
  genomeV2StrainPoints,
  reduceGenomeV2Event,
  rollGenomeV2Offer,
  type GenomeV2Event,
  type GenomeV2Ftue,
  type GenomeV2SlotIndex,
  type GenomeV2SpliceId,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import type { DynastyName } from '@/shared/game/rulesets';
import { STRAIN_IDS, type StrainId } from '@/shared/game/strains';

// ---------------------------------------------------------------------------
// Proposed contracts under test
// ---------------------------------------------------------------------------

/** The six loci a v2 Genome can hold; the pool must be able to fill them. */
export const GENOME_LOCI = 6;

/**
 * Candidate starter pools. Each is a named hypothesis measured by this file,
 * not a decision. `*-6` are the doc's §4.3 six-Gene hypothesis; `*-7` add the
 * missing terrain category and the seventh entry the exhaustion arithmetic
 * requires. `*-6-alt` are competing six-Gene shapes kept so the recommendation
 * is a comparison rather than an assertion.
 */
export const STARTER_POOL_CANDIDATES: Readonly<
  Record<DynastyName, Readonly<Record<string, readonly GenomeV2ActiveGeneId[]>>>
> = {
  CYBER: {
    'cyber-6': [
      'zenith_protocol',
      'live_wire',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'overgrowth',
    ],
    'cyber-6-alt-terrain': [
      'zenith_protocol',
      'live_wire',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'phase_gate',
    ],
    'cyber-7': [
      'zenith_protocol',
      'live_wire',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'overgrowth',
      'phase_gate',
    ],
  },
  PRIMAL: {
    'primal-6': [
      'heartwood',
      'live_wire',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'overgrowth',
    ],
    'primal-6-alt-terrain': [
      'heartwood',
      'live_wire',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'phase_gate',
    ],
    'primal-7': [
      'heartwood',
      'live_wire',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'overgrowth',
      'phase_gate',
    ],
  },
  COSMIC: {
    'cosmic-6': [
      'constellation_crown',
      'circuit_run',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'overgrowth',
    ],
    'cosmic-6-alt-live-wire': [
      'constellation_crown',
      'live_wire',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'overgrowth',
    ],
    'cosmic-7': [
      'constellation_crown',
      'circuit_run',
      'gold_trail',
      'compound_interest',
      'phoenix',
      'overgrowth',
      'phase_gate',
    ],
  },
};

/** The recommended pool per Dynasty once the arithmetic below is applied. */
export const RECOMMENDED_STARTER_POOL_KEY: Readonly<
  Record<DynastyName, string>
> = {
  CYBER: 'cyber-7',
  PRIMAL: 'primal-7',
  COSMIC: 'cosmic-7',
};

/**
 * Recommended curriculum order after the starter pool: the sequence in which
 * remaining roster Genes become offer-eligible. Ordering rationale is in the
 * results document; the harness only proves that no prefix of it starves.
 */
export const CURRICULUM_ORDER: Readonly<
  Record<DynastyName, readonly GenomeV2ActiveGeneId[]>
> = {
  CYBER: [
    'circuit_run',
    'loom_anchor',
    'coilkeeper',
    'mirror_wager',
    'wall_rush',
    'loan_shark',
  ],
  PRIMAL: [
    'circuit_run',
    'loom_anchor',
    'coilkeeper',
    'mirror_wager',
    'wall_rush',
    'time_dilation',
    'loan_shark',
  ],
  COSMIC: [
    'live_wire',
    'loom_anchor',
    'coilkeeper',
    'mirror_wager',
    'wall_rush',
    'time_dilation',
    'loan_shark',
  ],
};

// ---------------------------------------------------------------------------
// Deterministic traversal
// ---------------------------------------------------------------------------

/**
 * Deterministic THREAD/DECLINE policies. Together they span the choice space
 * the doc means by "every legal early-run state": greedy-first, greedy-second,
 * strain concentration, category spread, and a declining player who mints
 * Bonds and therefore moves the active-liability weight.
 */
export type OfferPolicy =
  | 'first'
  | 'second'
  | 'strain-focus'
  | 'category-spread'
  | 'decline-alternate';

export const OFFER_POLICIES: readonly OfferPolicy[] = [
  'first',
  'second',
  'strain-focus',
  'category-spread',
  'decline-alternate',
];

export interface CohortDefinition {
  /** Label used in the results document. */
  id: string;
  /** Validated banks the cohort stands for. */
  bankedRuns: number;
  ftue: GenomeV2Ftue;
  /** World Condition tilt, exercised so legality is proved under one. */
  offerTiltStrain: StrainId | null;
  /**
   * `true` reproduces the PRE-RULING filter, which withheld the Signature from
   * offers until Apex, by removing the Signature from the cohort's pool.
   * `false` is the shipped filter.
   */
  signatureLocked: boolean;
}

function ftueAt(bankedRuns: number): GenomeV2Ftue {
  return {
    strainTagsUnlocked: true,
    minorUnlocked: true,
    continueUnlocked: bankedRuns >= 1,
    expressionsUnlocked: bankedRuns >= 2,
    portalGenomeUnlocked: bankedRuns >= 4,
    spawnPointsUnlocked: bankedRuns >= 6,
    splicesUnlocked: bankedRuns >= 6,
    // The offer filter no longer reads this gate at all; it is the Apex tier
    // ramp and nothing else, and the signature-lock cohort models the deleted
    // filter through its pool instead. See the module header.
    apexesUnlocked: bankedRuns >= 10,
  };
}

/** The cohorts every pool and prefix is measured across. */
export const COHORTS: readonly CohortDefinition[] = [
  {
    id: 'bank0',
    bankedRuns: 0,
    ftue: ftueAt(0),
    offerTiltStrain: null,
    signatureLocked: false,
  },
  {
    id: 'bank2',
    bankedRuns: 2,
    ftue: ftueAt(2),
    offerTiltStrain: null,
    signatureLocked: false,
  },
  {
    id: 'bank6-splices',
    bankedRuns: 6,
    ftue: ftueAt(6),
    offerTiltStrain: null,
    signatureLocked: false,
  },
  {
    id: 'bank10-tilt',
    bankedRuns: 10,
    ftue: ftueAt(10),
    offerTiltStrain: 'AURUM',
    signatureLocked: false,
  },
  {
    id: 'bank0-signature-locked',
    bankedRuns: 0,
    ftue: ftueAt(0),
    offerTiltStrain: null,
    signatureLocked: true,
  },
];

/** Deterministic seeds; `runSeed` must be 8-256 characters. */
export function simulationSeeds(count: number): readonly string[] {
  const seeds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    seeds.push(`player-evolution-sim-${String(index).padStart(4, '0')}`);
  }
  return seeds;
}

export const DEFAULT_SEED_COUNT = 64;

function nextFreeSlot(state: GenomeV2State): GenomeV2SlotIndex | null {
  const free = state.slots.find((slot) => slot.occupant === null);
  return free ? free.index : null;
}

function heldGeneIds(state: GenomeV2State): GenomeV2ActiveGeneId[] {
  return Object.values(state.instances)
    .filter((instance) => instance.status === 'active')
    .map((instance) => instance.geneId);
}

function completesSplice(
  state: GenomeV2State,
  candidate: GenomeV2ActiveGeneId
): boolean {
  return heldGeneIds(state).some(
    (held) => genomeV2SpliceForPair(held, candidate) !== null
  );
}

function advancesLeadingStrain(
  state: GenomeV2State,
  candidate: GenomeV2ActiveGeneId
): boolean {
  const points = genomeV2StrainPoints(state);
  const leading = STRAIN_IDS.filter((strain) => (points[strain] ?? 0) > 0);
  if (leading.length === 0) return false;
  const best = Math.max(...leading.map((strain) => points[strain] ?? 0));
  const top = leading.filter((strain) => (points[strain] ?? 0) === best);
  return GENOME_V2_GENES[candidate].strains.some((strain) =>
    top.includes(strain)
  );
}

function choose(
  policy: OfferPolicy,
  state: GenomeV2State,
  candidates: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId],
  offerOrdinal: number
): GenomeV2ActiveGeneId | 'decline' {
  switch (policy) {
    case 'first':
      return candidates[0];
    case 'second':
      return candidates[1];
    case 'strain-focus': {
      const advancing = candidates.filter((candidate) =>
        advancesLeadingStrain(state, candidate)
      );
      return advancing[0] ?? candidates[0];
    }
    case 'category-spread': {
      const held = new Set(
        heldGeneIds(state).map((geneId) => GENOME_V2_GENES[geneId].category)
      );
      const fresh = candidates.filter(
        (candidate) => !held.has(GENOME_V2_GENES[candidate].category)
      );
      return fresh[0] ?? candidates[0];
    }
    case 'decline-alternate':
      return offerOrdinal % 2 === 0 ? candidates[0] : 'decline';
  }
}

export interface TraversalResult {
  /** Offers the engine actually served before the pool stopped producing two. */
  offersServed: number;
  acquisitions: number;
  /**
   * Acquisitions held when `rollGenomeV2Offer` first returned null with a free
   * locus still open. `null` means the traversal never went dry.
   *
   * This is not a cosmetic threshold. `GenomeV2Runtime.openCadenceOffer`
   * (`src/lib/game/genomeV2Runtime.ts:751-755`) responds to a null roll by
   * setting `nextCadenceOfferAtFood = Number.MAX_SAFE_INTEGER`: relics stop
   * spawning for the remainder of the run, permanently, and portals open with
   * `genomeOffer: null` so MUTATE has nothing to show. Exhaustion is silent,
   * total, and irreversible within the run.
   */
  exhaustedAtAcquisitions: number | null;
  offersWithDistinctCategories: number;
  offersCompletingASplice: number;
  offersAdvancingLeadingStrain: number;
  categoriesOffered: readonly GenomeV2GeneCategory[];
  genesOffered: readonly GenomeV2ActiveGeneId[];
  finalStrainPoints: Readonly<Partial<Record<StrainId, number>>>;
}

/**
 * One traversal: open offers from the real stream and resolve each by policy
 * until the loci fill or the pool can no longer produce two legal candidates.
 */
export function traverseOffers(
  dynasty: DynastyName,
  pool: readonly GenomeV2ActiveGeneId[],
  cohort: CohortDefinition,
  policy: OfferPolicy,
  runSeed: string
): TraversalResult {
  // The deleted signature lock withheld the Signature from `legal` and nothing
  // else, so a cohort that models it simply hands the engine a pool without it.
  const signature = signatureFor(dynasty);
  const traversalPool = cohort.signatureLocked
    ? pool.filter((geneId) => geneId !== signature)
    : pool;
  let state = createGenomeV2State(dynasty, {
    runSeed,
    genePool: traversalPool,
    ftue: cohort.ftue,
    offerTiltStrain: cohort.offerTiltStrain,
  });

  let journalIndex = 0;
  let tick = 0;
  const emit = (event: GenomeV2Event): void => {
    state = reduceGenomeV2Event(state, event);
  };
  const envelope = (): { index: number; tick: number; eventId: string } => {
    journalIndex += 1;
    tick += 1;
    return {
      index: journalIndex,
      tick,
      eventId: genomeV2EventId(runSeed, journalIndex),
    };
  };

  const categories = new Set<GenomeV2GeneCategory>();
  const genes = new Set<GenomeV2ActiveGeneId>();
  let offersServed = 0;
  let acquisitions = 0;
  let distinctCategoryOffers = 0;
  let spliceOffers = 0;
  let strainOffers = 0;
  let exhaustedAtAcquisitions: number | null = null;

  for (;;) {
    const slot = nextFreeSlot(state);
    if (slot === null) break;
    const roll = rollGenomeV2Offer(state);
    if (!roll) {
      exhaustedAtAcquisitions = acquisitions;
      break;
    }
    const [left, right] = roll.candidates;
    offersServed += 1;
    genes.add(left);
    genes.add(right);
    categories.add(GENOME_V2_GENES[left].category);
    categories.add(GENOME_V2_GENES[right].category);
    if (GENOME_V2_GENES[left].category !== GENOME_V2_GENES[right].category) {
      distinctCategoryOffers += 1;
    }
    if (completesSplice(state, left) || completesSplice(state, right)) {
      spliceOffers += 1;
    }
    if (
      advancesLeadingStrain(state, left) ||
      advancesLeadingStrain(state, right)
    ) {
      strainOffers += 1;
    }

    const offerId = `sim-offer-${offersServed}`;
    emit({
      ...envelope(),
      type: 'offer_opened',
      offerId,
      source: 'cadence',
      candidates: roll.candidates,
    });

    const decision = choose(policy, state, roll.candidates, offersServed - 1);
    if (decision === 'decline') {
      emit({ ...envelope(), type: 'offer_declined', offerId });
      continue;
    }
    emit({
      ...envelope(),
      type: 'gene_acquired',
      offerId,
      instanceId: `sim-instance-${offersServed}`,
      geneId: decision,
      slot,
      source: 'offer',
    });
    acquisitions += 1;
  }

  return {
    offersServed,
    acquisitions,
    exhaustedAtAcquisitions,
    offersWithDistinctCategories: distinctCategoryOffers,
    offersCompletingASplice: spliceOffers,
    offersAdvancingLeadingStrain: strainOffers,
    categoriesOffered: Array.from(categories).sort(),
    genesOffered: Array.from(genes).sort(),
    finalStrainPoints: genomeV2StrainPoints(state),
  };
}

// ---------------------------------------------------------------------------
// Aggregate pool health
// ---------------------------------------------------------------------------

export interface PoolHealth {
  dynasty: DynastyName;
  poolSize: number;
  cohortId: string;
  traversals: number;
  /** Traversals in which the offer stream never went dry. */
  neverStarvedRate: number;
  /**
   * THE GATE. Traversals whose offer stream died while the Genome still had an
   * empty locus — the player is left with a partial Genome and no further
   * relics for the rest of the run.
   */
  starvedBeforeFullGenomeRate: number;
  /** Traversals that reached six occupied loci at least once. */
  filledAllLociRate: number;
  /** Mean acquisitions reached. */
  meanAcquisitions: number;
  /** Worst-case acquisitions at which the stream stopped serving two. */
  minExhaustionAcquisitions: number | null;
  /** Share of served offers whose two candidates sit in different categories. */
  distinctCategoryOfferRate: number;
  /** Share of served offers containing an immediate Splice completion. */
  spliceCompletionOfferRate: number;
  /** Share of served offers advancing the traversal's leading Strain. */
  leadingStrainOfferRate: number;
  /** Distinct decision categories the pool can ever put in front of a player. */
  categoriesReachable: readonly GenomeV2GeneCategory[];
}

export function measurePool(
  dynasty: DynastyName,
  pool: readonly GenomeV2ActiveGeneId[],
  cohort: CohortDefinition,
  seeds: readonly string[] = simulationSeeds(DEFAULT_SEED_COUNT)
): PoolHealth {
  let traversals = 0;
  let neverStarved = 0;
  let starvedEarly = 0;
  let filledAllLoci = 0;
  let acquisitionTotal = 0;
  let offerTotal = 0;
  let distinctCategoryTotal = 0;
  let spliceTotal = 0;
  let strainTotal = 0;
  let minExhaustion: number | null = null;
  const categories = new Set<GenomeV2GeneCategory>();

  for (const policy of OFFER_POLICIES) {
    for (const seed of seeds) {
      const result = traverseOffers(dynasty, pool, cohort, policy, seed);
      traversals += 1;
      acquisitionTotal += result.acquisitions;
      offerTotal += result.offersServed;
      distinctCategoryTotal += result.offersWithDistinctCategories;
      spliceTotal += result.offersCompletingASplice;
      strainTotal += result.offersAdvancingLeadingStrain;
      result.categoriesOffered.forEach((category) => categories.add(category));
      if (result.acquisitions >= GENOME_LOCI) filledAllLoci += 1;
      if (result.exhaustedAtAcquisitions === null) {
        neverStarved += 1;
      } else {
        if (result.exhaustedAtAcquisitions < GENOME_LOCI) starvedEarly += 1;
        if (
          minExhaustion === null ||
          result.exhaustedAtAcquisitions < minExhaustion
        ) {
          minExhaustion = result.exhaustedAtAcquisitions;
        }
      }
    }
  }

  const rate = (value: number): number =>
    offerTotal === 0 ? 0 : Math.round((value / offerTotal) * 1_000) / 1_000;
  const share = (value: number): number =>
    Math.round((value / traversals) * 1_000) / 1_000;

  return {
    dynasty,
    poolSize: pool.length,
    cohortId: cohort.id,
    traversals,
    neverStarvedRate: share(neverStarved),
    starvedBeforeFullGenomeRate: share(starvedEarly),
    filledAllLociRate: share(filledAllLoci),
    meanAcquisitions: Math.round((acquisitionTotal / traversals) * 100) / 100,
    minExhaustionAcquisitions: minExhaustion,
    distinctCategoryOfferRate: rate(distinctCategoryTotal),
    spliceCompletionOfferRate: rate(spliceTotal),
    leadingStrainOfferRate: rate(strainTotal),
    categoriesReachable: Array.from(categories).sort(),
  };
}

// ---------------------------------------------------------------------------
// Structural properties that do not need a traversal
// ---------------------------------------------------------------------------

export interface StrainReachability {
  strain: StrainId;
  /** Points obtainable if the player took every Gene of that Strain. */
  maximumPoints: number;
  minorReachable: boolean;
  expressionReachable: boolean;
  apexReachable: boolean;
  /** Fewest acquisitions that reach Minor without spawn inheritance. */
  acquisitionsToMinor: number | null;
}

export function measureStrainReachability(
  pool: readonly GenomeV2ActiveGeneId[]
): readonly StrainReachability[] {
  return STRAIN_IDS.map((strain) => {
    const members = pool.filter((geneId) =>
      GENOME_V2_GENES[geneId].strains.includes(strain)
    );
    const maximumPoints = Math.min(members.length, GENOME_LOCI);
    return {
      strain,
      maximumPoints,
      minorReachable: maximumPoints >= GENOME_V2_STRAIN_THRESHOLDS.minor,
      expressionReachable:
        maximumPoints >= GENOME_V2_STRAIN_THRESHOLDS.expression,
      apexReachable: maximumPoints >= GENOME_V2_STRAIN_THRESHOLDS.apex,
      acquisitionsToMinor:
        maximumPoints >= GENOME_V2_STRAIN_THRESHOLDS.minor
          ? GENOME_V2_STRAIN_THRESHOLDS.minor
          : null,
    };
  });
}

export function reachableSplices(
  pool: readonly GenomeV2ActiveGeneId[]
): readonly GenomeV2SpliceId[] {
  return GENOME_V2_SPLICE_IDS.filter((spliceId) => {
    const [left, right] = GENOME_V2_SPLICES[spliceId].parents;
    return pool.includes(left) && pool.includes(right);
  });
}

export function categoriesIn(
  pool: readonly GenomeV2ActiveGeneId[]
): readonly GenomeV2GeneCategory[] {
  return Array.from(
    new Set(pool.map((geneId) => GENOME_V2_GENES[geneId].category))
  ).sort();
}

/**
 * Closed form of the exhaustion cliff, independent of seed and policy.
 *
 * `rollGenomeV2Offer` returns null when fewer than two pool entries remain
 * unseen and legal. Every acquisition and every Recode permanently consumes one
 * entry, because `seen` is built from ALL instances including `replaced` and
 * `ash`. So the last servable offer is the one taken with `legalSize - 2`
 * entries already consumed, and the deepest reachable Genome is `legalSize - 1`
 * genes — capped at the six loci.
 */
export function offerCliff(
  pool: readonly GenomeV2ActiveGeneId[],
  options: { signatureLocked: boolean; signatureInPool: boolean }
): {
  legalSize: number;
  maximumAcquisitions: number;
  fillsAllLoci: boolean;
  headroomForRecodes: number;
} {
  const legalSize =
    options.signatureLocked && options.signatureInPool
      ? pool.length - 1
      : pool.length;
  const maximumAcquisitions = Math.max(0, Math.min(GENOME_LOCI, legalSize - 1));
  return {
    legalSize,
    maximumAcquisitions,
    fillsAllLoci: maximumAcquisitions >= GENOME_LOCI,
    headroomForRecodes: Math.max(0, legalSize - 1 - GENOME_LOCI),
  };
}

// ---------------------------------------------------------------------------
// Constraint scorecard (PLAYER_EVOLUTION_ONBOARDING.md §4.3, lines 209-214)
// ---------------------------------------------------------------------------

/**
 * Genes whose stated rule cannot fire until a still-locked portal verb exists.
 * Both read "portal CONTINUE" in their own effect text, and CONTINUE activates
 * at one validated bank (`GENOME_V2_CONFIG.ftue.continueAtBankedRuns`), so
 * neither can teach anything in run one.
 */
export const VERB_DEPENDENT_GENES: readonly GenomeV2ActiveGeneId[] = [
  'loan_shark',
  'mirror_wager',
];

/**
 * Rules whose first observable instance needs more than a short early run:
 * Coilkeeper charges for eight foods before a seal pays, and Wall Rush needs a
 * deliberate charged wall impact a novice has no reason to attempt.
 */
export const LATE_LEGIBILITY_GENES: readonly GenomeV2ActiveGeneId[] = [
  'coilkeeper',
  'wall_rush',
];

export interface ConstraintScorecard {
  poolKey: string;
  dynasty: DynastyName;
  size: number;
  /** §4.3: the Dynasty Signature is present. */
  includesSignature: boolean;
  /** §4.3 bullet 1: at least two Strains reach Minor. */
  coherentDirections: number;
  /** §4.3 bullet 2: a Minor is reachable without spawn inheritance. */
  minorWithoutInheritance: boolean;
  /** §4.3 bullet 3: no Gene whose rule needs a still-locked verb. */
  verbDependentGenes: readonly GenomeV2ActiveGeneId[];
  /** §4.3 bullet 5: the pool can serve two legal candidates for all six loci. */
  fillsAllLoci: boolean;
  /** §4.3 bullet 6: every rule observable inside a typical early run. */
  lateLegibilityGenes: readonly GenomeV2ActiveGeneId[];
  /** The Signature's own Strain can reach Minor inside the starter pool. */
  signatureStrainReachesMinor: boolean;
  categories: readonly GenomeV2GeneCategory[];
  splices: readonly GenomeV2SpliceId[];
  strains: readonly StrainReachability[];
  /** Every §4.3 constraint satisfied. */
  passes: boolean;
}

function signatureFor(dynasty: DynastyName): GenomeV2ActiveGeneId {
  return dynasty === 'PRIMAL'
    ? 'heartwood'
    : dynasty === 'CYBER'
      ? 'zenith_protocol'
      : 'constellation_crown';
}

export function scoreStarterPool(
  dynasty: DynastyName,
  poolKey: string,
  pool: readonly GenomeV2ActiveGeneId[]
): ConstraintScorecard {
  const signature = signatureFor(dynasty);
  const strains = measureStrainReachability(pool);
  const includesSignature = pool.includes(signature);
  const coherentDirections = strains.filter(
    (entry) => entry.minorReachable
  ).length;
  const verbDependent = VERB_DEPENDENT_GENES.filter((geneId) =>
    pool.includes(geneId)
  );
  const lateLegibility = LATE_LEGIBILITY_GENES.filter((geneId) =>
    pool.includes(geneId)
  );
  const cliff = offerCliff(pool, {
    signatureLocked: false,
    signatureInPool: includesSignature,
  });
  const signatureStrains = GENOME_V2_GENES[signature].strains;
  const signatureStrainReachesMinor = strains.some(
    (entry) => signatureStrains.includes(entry.strain) && entry.minorReachable
  );
  return {
    poolKey,
    dynasty,
    size: pool.length,
    includesSignature,
    coherentDirections,
    minorWithoutInheritance: coherentDirections >= 1,
    verbDependentGenes: verbDependent,
    fillsAllLoci: cliff.fillsAllLoci,
    lateLegibilityGenes: lateLegibility,
    signatureStrainReachesMinor,
    categories: categoriesIn(pool),
    splices: reachableSplices(pool),
    strains,
    passes:
      includesSignature &&
      coherentDirections >= 2 &&
      verbDependent.length === 0 &&
      lateLegibility.length === 0 &&
      cliff.fillsAllLoci &&
      signatureStrainReachesMinor,
  };
}

// ---------------------------------------------------------------------------
// Eligibility prefixes
// ---------------------------------------------------------------------------

export interface PrefixMeasurement {
  dynasty: DynastyName;
  /** Genes eligible at this step: starter pool plus `unlocked` curriculum entries. */
  unlocked: number;
  poolSize: number;
  isCompleteRoster: boolean;
  health: PoolHealth;
  splices: readonly GenomeV2SpliceId[];
  categories: readonly GenomeV2GeneCategory[];
}

export function eligibilityPrefixes(
  dynasty: DynastyName,
  starter: readonly GenomeV2ActiveGeneId[],
  order: readonly GenomeV2ActiveGeneId[] = CURRICULUM_ORDER[dynasty]
): readonly (readonly GenomeV2ActiveGeneId[])[] {
  const roster = genomeV2ActivePool(dynasty);
  const prefixes: GenomeV2ActiveGeneId[][] = [];
  const running = [...starter];
  prefixes.push([...running]);
  for (const geneId of order) {
    if (!roster.includes(geneId) || running.includes(geneId)) continue;
    running.push(geneId);
    prefixes.push([...running]);
  }
  return prefixes;
}

export function measurePrefixes(
  dynasty: DynastyName,
  starter: readonly GenomeV2ActiveGeneId[],
  cohort: CohortDefinition,
  seeds: readonly string[] = simulationSeeds(16),
  order: readonly GenomeV2ActiveGeneId[] = CURRICULUM_ORDER[dynasty]
): readonly PrefixMeasurement[] {
  const roster = genomeV2ActivePool(dynasty);
  return eligibilityPrefixes(dynasty, starter, order).map((pool, step) => ({
    dynasty,
    unlocked: step,
    poolSize: pool.length,
    isCompleteRoster: pool.length === roster.length,
    health: measurePool(dynasty, pool, cohort, seeds),
    splices: reachableSplices(pool),
    categories: categoriesIn(pool),
  }));
}

/**
 * Order-independence sweep. The player chooses trial order, so no single
 * canonical sequence proves the gate. This walks deterministic permutations of
 * the curriculum remainder and reports the worst prefix seen.
 */
export function worstPrefixAcrossOrders(
  dynasty: DynastyName,
  starter: readonly GenomeV2ActiveGeneId[],
  cohort: CohortDefinition,
  orders: number,
  seeds: readonly string[] = simulationSeeds(4)
): {
  ordersTried: number;
  worstStarvedBeforeFullGenomeRate: number;
  worstFilledAllLociRate: number;
  worstDistinctCategoryOfferRate: number;
  worstCategoriesReachable: number;
  minAcquisitions: number;
} {
  const roster = genomeV2ActivePool(dynasty);
  const remainder = roster.filter((geneId) => !starter.includes(geneId));
  let worstStarved = 0;
  let worstFilledAllLoci = 1;
  let worstDistinctCategoryOfferRate = 1;
  let worstCategoriesReachable = Number.POSITIVE_INFINITY;
  let minAcquisitions = Number.POSITIVE_INFINITY;

  for (let order = 0; order < orders; order += 1) {
    const rotated = remainder.map(
      (_, index) => remainder[(index + order) % remainder.length]
    );
    for (const measurement of measurePrefixes(
      dynasty,
      starter,
      cohort,
      seeds,
      rotated
    )) {
      worstStarved = Math.max(
        worstStarved,
        measurement.health.starvedBeforeFullGenomeRate
      );
      worstFilledAllLoci = Math.min(
        worstFilledAllLoci,
        measurement.health.filledAllLociRate
      );
      worstDistinctCategoryOfferRate = Math.min(
        worstDistinctCategoryOfferRate,
        measurement.health.distinctCategoryOfferRate
      );
      worstCategoriesReachable = Math.min(
        worstCategoriesReachable,
        measurement.health.categoriesReachable.length
      );
      minAcquisitions = Math.min(
        minAcquisitions,
        measurement.health.meanAcquisitions
      );
    }
  }

  return {
    ordersTried: orders,
    worstStarvedBeforeFullGenomeRate: worstStarved,
    worstFilledAllLociRate: worstFilledAllLoci,
    worstDistinctCategoryOfferRate,
    worstCategoriesReachable,
    minAcquisitions,
  };
}

// ---------------------------------------------------------------------------
// Full-pool fairness
// ---------------------------------------------------------------------------

export interface FairnessComparison {
  dynasty: DynastyName;
  cohortId: string;
  starterSize: number;
  rosterSize: number;
  starter: PoolHealth;
  roster: PoolHealth;
  /**
   * Positive means the small pool concentrates: an offer is likelier to hand
   * the player a Splice completion than the complete roster does. This is the
   * §4.5 "no prefix with a persistent probability advantage" metric.
   */
  spliceConcentrationAdvantage: number;
  strainConcentrationAdvantage: number;
  /**
   * Negative means the small pool is worse at reaching a complete Genome, which
   * is the intended direction: a prefix must never dominate the roster.
   */
  filledAllLociAdvantage: number;
}

export function compareToFullRoster(
  dynasty: DynastyName,
  starter: readonly GenomeV2ActiveGeneId[],
  cohort: CohortDefinition,
  seeds: readonly string[] = simulationSeeds(DEFAULT_SEED_COUNT)
): FairnessComparison {
  const roster = genomeV2ActivePool(dynasty);
  const starterHealth = measurePool(dynasty, starter, cohort, seeds);
  const rosterHealth = measurePool(dynasty, roster, cohort, seeds);
  const round = (value: number): number => Math.round(value * 1_000) / 1_000;
  return {
    dynasty,
    cohortId: cohort.id,
    starterSize: starter.length,
    rosterSize: roster.length,
    starter: starterHealth,
    roster: rosterHealth,
    spliceConcentrationAdvantage: round(
      starterHealth.spliceCompletionOfferRate -
        rosterHealth.spliceCompletionOfferRate
    ),
    strainConcentrationAdvantage: round(
      starterHealth.leadingStrainOfferRate - rosterHealth.leadingStrainOfferRate
    ),
    filledAllLociAdvantage: round(
      starterHealth.filledAllLociRate - rosterHealth.filledAllLociRate
    ),
  };
}
