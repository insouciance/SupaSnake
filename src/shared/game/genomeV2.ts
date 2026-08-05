/**
 * Genome rules v2 — deterministic run state, journal, Loom projection and
 * itemized Yield settlement.
 *
 * V1 remains in `genome.ts`, `splices.ts` and `strains.ts`. This module never
 * changes those definitions: a session chooses one rules version at start and
 * keeps it for its full lifetime. V2 records canonical gameplay facts rather
 * than client-authored reward claims. The live engine emits the facts; replay
 * emits them again; this pure reducer must reach the same state both times.
 *
 * Arithmetic uses integer fixed point (1 DNA = 10,000 units). Every multiply
 * floors at the named rule boundary, never through floating point. A corrupt
 * value that exceeds JavaScript's safe integer range is rejected rather than
 * silently capped; that is a representation guard, not a balance ceiling.
 */

import {
  GENOME_V2_GENE_STRAINS,
  GENOME_V2_GENES,
  genomeV2ActivePool,
  isGenomeV2ActiveGeneId,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import type { DynastyName } from '@/shared/game/rulesets';
import { STRAIN_IDS, type StrainId, type StrainPoints } from '@/shared/game/strains';
import {
  ANOMALY_STRAIN_WEIGHT,
  offerStream,
} from '@/shared/game/offerGravity';
import {
  GENOME_V2_GENE_OFFER_CADENCE,
  rollGeneOfferInterval,
  rollGenomeV2GeneOfferInterval,
} from '@/shared/game/geneCadence';
import { formingTicksForSeconds } from '@/shared/game/terrain';

export const GENOME_RULES_V1 = 1 as const;
export const GENOME_RULES_V2 = 2 as const;
export const CURRENT_GENOME_RULES_VERSION = GENOME_RULES_V2;
export type GenomeRulesVersion = typeof GENOME_RULES_V1 | typeof GENOME_RULES_V2;

/**
 * Rules v2 shipped briefly with cadence offers opening themselves after food.
 * Keep that interaction readable for already-started sessions while new runs
 * stamp the player-pulled relic contract explicitly. This is an interaction
 * sub-version, not new Genome arithmetic: both versions use the same reducer,
 * genes, settlement, and rulesVersion.
 */
export const GENOME_V2_INTERACTION_AUTO_OFFER = 1 as const;
export const GENOME_V2_INTERACTION_PHYSICAL_RELIC = 2 as const;
export const CURRENT_GENOME_V2_INTERACTION_VERSION =
  GENOME_V2_INTERACTION_PHYSICAL_RELIC;
export type GenomeV2InteractionVersion =
  | typeof GENOME_V2_INTERACTION_AUTO_OFFER
  | typeof GENOME_V2_INTERACTION_PHYSICAL_RELIC;

export function isGenomeV2InteractionVersion(
  value: unknown
): value is GenomeV2InteractionVersion {
  return (
    value === GENOME_V2_INTERACTION_AUTO_OFFER ||
    value === GENOME_V2_INTERACTION_PHYSICAL_RELIC
  );
}

export const GENOME_V2_YIELD_SCALE = 10_000;
export const GENOME_V2_MAX_SLOTS = 6;

export const GENOME_V2_CONFIG = {
  yieldScale: GENOME_V2_YIELD_SCALE,
  maxSlots: GENOME_V2_MAX_SLOTS,
  goldTrail: {
    cadence: 5,
    multiplierBps: 30_000,
    realTimeWindowMs: 6_000,
  },
  compoundInterest: {
    bankBonusPerBondBps: 800,
    maxBonds: 3,
  },
  loanShark: {
    foodsPerContract: 6,
    escrowMultiplierBps: 20_000,
  },
  liveWire: {
    cadence: 3,
    successMultiplierBps: 30_000,
    failureMultiplierBps: 0,
    routeSlackMoves: 2,
  },
  circuitRun: {
    cadence: 4,
    successMultiplierBps: 40_000,
    failureMultiplierBps: 0,
    routeSlackMoves: 3,
    totalGrowthUnits: 1,
  },
  timeDilation: {
    speedMultiplierBps: 8_800,
    extraGrowthCadence: 4,
    excludedDynasties: ['CYBER'] as readonly DynastyName[],
  },
  overgrowth: {
    extraGrowthPerFood: 1,
    minYieldMultiplierBps: 14_000,
    maxYieldMultiplierBps: 25_000,
    /** Pressure ratio at which the maximum reward is reached. */
    maxPressureBps: 7_500,
    /**
     * Board pressure at which Overgrowth's own lesson has been taught.
     *
     * GAP-2 of the learning-event catalog: Overgrowth's growth is shared with
     * every other body mechanic and its Yield folds into
     * `ledger.continuousDelta`, a field explicitly covering more than one
     * source — neither is attributable to the Gene. What IS attributable is
     * the trade the Gene exists to teach: a longer body raises pressure, and
     * pressure raises the multiplier off its floor. A quarter of the way from
     * `0` to `maxPressureBps` is the first target whose payout has visibly
     * moved, so that is the threshold. Tuning value, not a rule.
     */
    learningPressureBps: 1_875,
  },
  coilkeeper: {
    // constitution-allow: energy-commerce gameplay-food cadence, never Energy or a commercial benefit
    chargeFoods: 8,
    minimumSealedCells: 4,
    rewardTiers: [
      { minimumCells: 4, multiplierBps: 40_000 },
      { minimumCells: 8, multiplierBps: 50_000 },
      { minimumCells: 12, multiplierBps: 60_000 },
    ],
  },
  wallRush: {
    // constitution-allow: energy-commerce wall ability charge, never Energy or a commercial benefit
    initialCharges: 1,
    // constitution-allow: energy-commerce wall ability cap, never Energy or a commercial benefit
    maximumCharges: 1,
    // constitution-allow: energy-commerce portal ability refresh, never Energy or a commercial benefit
    recharge: 'portal_continue' as const,
    rewardMoveBudget: 6,
    multiplierBps: 25_000,
  },
  phaseGate: {
    cadence: 5,
    multiplierBps: 30_000,
    /**
     * Movement boundaries held on arrival at the exit. Exactly one, exactly
     * once per traversal: not a resource, not stackable, not claimable as a
     * tactical hold. One tick is 160-175 ms, which is the difference between
     * a two-tick reaction budget and a three-tick one.
     */
    arrivalBeatTicks: 1,
    /**
     * Seconds the two Scar cells spend forming before they turn lethal.
     *
     * 2.0 s is COSMIC calcification's and the CYBER arena's number verbatim
     * (`rulesets.ts`), not a bespoke one: one forming duration across the
     * whole game is one rule for the player to learn. The exit cell has the
     * head standing on it at the moment of creation, so a Scar that were
     * solid immediately would be a block the player could not have read -
     * the exact defect `isPositionOnTerrain` already names for food.
     */
    scarFormingSeconds: 2.0,
  },
  mirrorWager: {
    divertedYieldBps: 4_000,
    bankStakeMultiplierBps: 20_000,
  },
  phoenix: {
    rewindSegments: 3,
    phaseTicks: 12,
    growthCost: 10,
  },
  loomAnchor: {
    initialCharges: 1,
    maximumCharges: 1,
  },
  offers: {
    cadence: GENOME_V2_GENE_OFFER_CADENCE,
    baseWeight: 100,
    strainPointWeight: 35,
    strainWeightCap: 140,
    immediateSpliceWeight: 140,
    dynastyAffinityWeight: 60,
    dynastySignatureWeight: 100,
    missingCategoryWeight: 25,
    activeLiabilityWeight: 35,
    /** Slot two remains surprising, but never at the cost of illegality. */
    boundedSurpriseChanceBps: 2_000,
  },
  ladders: {
    aurumMintBonusBps: 2_500,
    aurumDividendPerChainBps: 500,
    aurumDividendMaxChains: 4,
    aurumTreasuryDivertBps: 1_000,
    aurumTreasuryBankBps: 15_000,
    voltRelayBonusBps: 5_000,
    voltOverclockMultiplierBps: 15_000,
    voltOverclockSpeedMultiplierBps: 11_500,
    voltOverclockMoveBudget: 12,
    feralMassMaxBonusBps: 2_500,
    feralTerritoryMultiplierBps: 15_000,
    feralWorldbodyMultiplierBps: 20_000,
    fluxRiftcraftBonusBps: 2_500,
    fluxTopologyBonusBps: 5_000,
    umbraCovenantShieldBps: 2_500,
    umbraAfterlifeExtraPhaseTicks: 6,
  },
  splices: {
    dragonHoardBankBps: 15_000,
    gildedForkMultiplierBps: 40_000,
    gildedForkExtraGrowth: 2,
    perfectCircuitMultiplierBps: 50_000,
    worldcoilMaximumMultiplierBps: 80_000,
    riftlineMultiplierBps: 40_000,
    loomBondBankBonusBps: 1_200,
  },
  signatures: {
    heartwoodMinimumCells: 4,
    heartwoodBaseMultiplierBps: 20_000,
    heartwoodLargeMultiplierBps: 35_000,
    heartwoodLargeCells: 10,
    zenithMultiplierBps: 17_500,
    zenithSpeedMultiplierBps: 12_000,
    zenithMoveBudget: 14,
    crownPerfectClearMultiplierBps: 40_000,
    crownStarMultiplierBps: 20_000,
  },
  persistence: {
    retainedJournalEvents: 256,
    journalCompactionBatch: 64,
    retainedResolvedTargets: 96,
    targetCompactionBatch: 32,
    /** Checkpoint guard for the pure Genome block, below the 1 MiB run cap. */
    maximumSerializedBytes: 384 * 1_024,
  },
  portalGenome: {
    maxActions: 3,
    infuseGrowth: [3, 4, 5] as const,
    recodeGrowth: [8, 10, 10] as const,
  },
  carry: {
    compoundThroughPass: 5,
    bankStepBps: 12_500,
    linearStepAfterPassFiveBps: 4_000,
    salvageFloorBps: 3_500,
    salvageDecayBps: 6_000,
  },
  ftue: {
    strainTagsAtBankedRuns: 0,
    minorAtBankedRuns: 0,
    continueAtBankedRuns: 1,
    expressionsAtBankedRuns: 2,
    portalGenomeAtBankedRuns: 4,
    spawnPointsAtBankedRuns: 6,
    splicesAtBankedRuns: 6,
    apexAtBankedRuns: 10,
    apexAtMastery: 3,
  },
} as const;

export type GenomeV2SlotIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type GenomeV2InstanceStatus = 'active' | 'spliced' | 'replaced' | 'ash';
export type GenomeV2GeneSource = 'offer' | 'infuse' | 'recode' | 'signature';

export interface GenomeV2GeneInstance {
  instanceId: string;
  geneId: GenomeV2ActiveGeneId;
  source: GenomeV2GeneSource;
  acquiredAtFood: number;
  acquiredAtTick: number;
  acquiredAtTargetOrdinal: number;
  acquisitionOrdinal: number;
  slot: GenomeV2SlotIndex;
  status: GenomeV2InstanceStatus;
  retiredAtFood: number | null;
  /** Last acquisition-relative target ordinal queued for a cadence rule. */
  lastCadenceTargetOrdinal: number;
}

export type GenomeV2SpliceId =
  | 'splice_dragon_hoard'
  | 'splice_gilded_fork'
  | 'splice_styx_contract'
  | 'splice_perfect_circuit'
  | 'splice_worldcoil'
  | 'splice_riftline'
  | 'splice_loom_bond'
  | 'splice_ashen_stake';

export interface GenomeV2SpliceDefinition {
  id: GenomeV2SpliceId;
  name: string;
  parents: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
  rule: string;
  strategicCost: string;
}

/**
 * V2 recipes fuse their parents into one new rule. They are versioned IDs so
 * no historical v1 splice is reinterpreted. Loci and unique recipes are the
 * natural constraint; v2 imposes no hidden active-Splice ceiling.
 */
export const GENOME_V2_SPLICES: Readonly<
  Record<GenomeV2SpliceId, GenomeV2SpliceDefinition>
> = {
  splice_dragon_hoard: {
    id: 'splice_dragon_hoard',
    name: 'Dragon Hoard',
    parents: ['gold_trail', 'compound_interest'],
    rule: 'Golden bites pile up treasure that grows at BANK.',
    strategicCost: 'Miss the golden window and that treasure breaks. Skipping still gives up the offer.',
  },
  splice_gilded_fork: {
    id: 'splice_gilded_fork',
    name: 'The Bag',
    parents: ['gold_trail', 'overgrowth'],
    rule: 'Every 5th food: play safe, or take the bag and grow.',
    strategicCost: 'Eating either removes the other; the greedy branch permanently raises body pressure.',
  },
  splice_styx_contract: {
    id: 'splice_styx_contract',
    name: 'Death Deal',
    parents: ['mirror_wager', 'phoenix'],
    rule: 'Your bet can buy back your life — or double.',
    strategicCost: 'Buying back your life spends the bet and burns out that slot for good.',
  },
  splice_perfect_circuit: {
    id: 'splice_perfect_circuit',
    name: 'Round Trip',
    parents: ['live_wire', 'circuit_run'],
    rule: 'Finish a route and the way back pays even more.',
    strategicCost: 'Either failed leg burns the whole trip.',
  },
  splice_worldcoil: {
    id: 'splice_worldcoil',
    name: 'Full Circle',
    parents: ['coilkeeper', 'overgrowth'],
    rule: 'Seal ground while huge and the next food pays ×8.',
    strategicCost: 'The seal is permanent and Feast keeps adding body.',
  },
  splice_riftline: {
    id: 'splice_riftline',
    name: 'The Opening',
    parents: ['wall_rush', 'phase_gate'],
    rule: 'A wall bounce can open a door to the big food.',
    strategicCost: 'The cells you pass through become permanent Scars.',
  },
  splice_loom_bond: {
    id: 'splice_loom_bond',
    name: 'Paid to Wait',
    parents: ['compound_interest', 'loom_anchor'],
    rule: 'Skipping keeps the power AND pays you for it.',
    strategicCost: 'Your save stays empty until you ride a portal.',
  },
  splice_ashen_stake: {
    id: 'splice_ashen_stake',
    name: 'Last Call',
    parents: ['loan_shark', 'phoenix'],
    rule: 'Cash in your deal to survive a death instead.',
    strategicCost: 'The trade pays out nothing on the table and burns out the Phoenix slot.',
  },
};

export const GENOME_V2_SPLICE_IDS = Object.keys(
  GENOME_V2_SPLICES
) as GenomeV2SpliceId[];

function pairKey(a: GenomeV2ActiveGeneId, b: GenomeV2ActiveGeneId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const GENOME_V2_SPLICE_BY_PAIR = new Map<string, GenomeV2SpliceId>(
  GENOME_V2_SPLICE_IDS.map((id) => {
    const [a, b] = GENOME_V2_SPLICES[id].parents;
    return [pairKey(a, b), id];
  })
);

export function genomeV2SpliceForPair(
  a: GenomeV2ActiveGeneId,
  b: GenomeV2ActiveGeneId
): GenomeV2SpliceId | null {
  return GENOME_V2_SPLICE_BY_PAIR.get(pairKey(a, b)) ?? null;
}

export type GenomeV2SlotOccupant =
  | { kind: 'gene'; instanceId: string }
  | {
      kind: 'splice';
      spliceId: GenomeV2SpliceId;
      parentInstanceIds: readonly [string, string];
    }
  | { kind: 'ash'; sourceInstanceId: string };

export interface GenomeV2Slot {
  index: GenomeV2SlotIndex;
  occupant: GenomeV2SlotOccupant | null;
}

export interface GenomeV2RetiredInstance {
  instanceId: string;
  reason: 'splice' | 'recode' | 'phoenix' | 'splice_consumed';
  atFood: number;
  replacementInstanceId?: string;
  spliceId?: GenomeV2SpliceId;
}

export interface GenomeV2OfferState {
  offerId: string;
  source: 'cadence' | 'portal';
  candidateGeneIds: readonly GenomeV2ActiveGeneId[];
  openedAtFood: number;
  openedAtTick: number;
  pinnedGeneId: GenomeV2ActiveGeneId | null;
  offerIndex: number;
}

export interface GenomeV2PortalDecisionState {
  portalId: string;
  openedAtFood: number;
  openedAtTick: number;
  genomeOffer: {
    offerId: string;
    candidates: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
    offerIndex: number;
  } | null;
}

export interface GenomeV2LoanState {
  contractId: string;
  startedAtFood: number;
  foodsRemaining: number;
  escrowYield: number;
}

export interface GenomeV2SecondLifeState {
  kind: 'phoenix';
  phoenixInstanceId: string;
  owner:
    | { kind: 'gene'; instanceId: string }
    | {
        kind: 'splice';
        spliceId: GenomeV2SpliceId;
        parentInstanceIds: readonly [string, string];
        slot: GenomeV2SlotIndex;
      };
  consumed: boolean;
  consumedAtFood: number | null;
}

export interface GenomeV2AnchorState {
  charges: number;
  pinnedGeneId: GenomeV2ActiveGeneId | null;
}

/**
 * The curriculum trial this run was STAMPED with (WP-C; PEO §4.4, server
 * contract §5).
 *
 * IT IS RUN-START AUTHORITY, LIKE `genePool`. It arrives from the immutable
 * start stamp and never from a client event or a request field, which is
 * precisely why `assertGenomeV2OfferMatchesRoll` still holds: the server
 * reproduces the roll from the same frozen state the client rolled from.
 *
 * THE GUARANTEE IS COUNTED IN COLLECTED OFFERS, NEVER IN RUNS (§4.4). The
 * account's spent appearances arrive as `offersRemainingAtStart`; this run's
 * own appearances accumulate in `offersConsumed`, written by the pure reducer
 * when an offer that CONTAINED the trial opens — which happens only when the
 * player deliberately collects the relic. An Ascetic run, Patient's stretched
 * cadence, an ignored or expired relic, Free Play, and a run that produces no
 * relic all consume nothing, because none of them opens such an offer.
 */
export interface GenomeV2TrialState {
  /** The selected trial Gene. Always a member of this run's `genePool`. */
  geneId: GenomeV2ActiveGeneId;
  /**
   * Guaranteed appearances still owed to the account when this run started,
   * `1..GENOME_V2_TRIAL_OFFER_GUARANTEE`. A trial with none left is not
   * stamped at all: it is an ordinary member of the vocabulary.
   */
  offersRemainingAtStart: number;
  /**
   * Collected offers in THIS run whose candidates contained the trial.
   * Monotone, bounded by the guarantee, and the only number settlement needs
   * to consume appearances against the account.
   */
  offersConsumed: number;
}

export type GenomeV2TargetLifecycle =
  | 'active'
  | 'armed'
  | 'completed'
  | 'burnt'
  | 'expired';

export interface GenomeV2Cell {
  x: number;
  z: number;
}

export type GenomeV2ExclusiveTargetKind =
  | 'gold_trail'
  | 'live_wire'
  | 'circuit_run'
  | 'coilkeeper'
  | 'wall_rush'
  | 'phase_gate';

export interface GenomeV2PendingTargetContract {
  contractId: string;
  kind: GenomeV2ExclusiveTargetKind;
  sourceInstanceId: string;
  queuedAtFood: number;
  ordinal: number;
  stage: 1 | 2;
  sealedAreaCells: number;
}

export interface GenomeV2TargetState {
  targetId: string;
  eligibleOrdinal: number | null;
  contractId: string | null;
  kind: 'ordinary' | GenomeV2ExclusiveTargetKind;
  lifecycle: GenomeV2TargetLifecycle;
  cell: GenomeV2Cell;
  /**
   * A mutually exclusive physical Gilded Fork destination. The ordinary
   * branch remains `cell`; eating either branch removes both board objects.
   * Optional for backward-compatible reads of checkpoints created before the
   * two-cell fork existed.
   */
  forkCell?: GenomeV2Cell | null;
  secondaryCell: GenomeV2Cell | null;
  /** Optional route geometry (for example Phase Gate entry and exit). */
  optionalRouteCells: readonly [GenomeV2Cell, GenomeV2Cell] | null;
  spawnTick: number;
  speedAtSpawnMs: number;
  shortestSafeMoves: number;
  sealedAreaCells: number;
  moveBudget: number | null;
  expiresAtTick: number | null;
  circuitLegsRequired: 0 | 2;
  relayBonusBps: number;
  territoryMultiplierBps: number;
  forkChoice: 'ordinary' | 'gilded' | null;
  crownRole: 'current' | 'future' | 'crown' | null;
  edible: boolean;
  collidable: boolean;
  resolvedBaseYield: number;
}

export interface GenomeV2TerrainFact {
  terrainId: string;
  source: 'coilkeeper_seal' | 'phase_gate_scar';
  cells: readonly GenomeV2Cell[];
  createdAtFood: number;
  permanent: true;
  /**
   * Simulation tick the forming phase started on, and how many ticks it
   * lasts. Present on Side Door Scars; absent on Coilkeeper seals, which
   * claim ground the snake has already surrounded and has therefore already
   * read.
   *
   * DERIVED, NEVER MUTATED. Solidity is `tick >= from + total`
   * (`genomeV2TerrainSolidAt`), so the countdown needs no per-tick reducer
   * event, replays exactly from the journal, and survives a checkpoint
   * round-trip without a second copy of the truth. Both fields are optional
   * so a checkpoint written before forming existed still reads - such a fact
   * is solid, which is exactly what it was.
   *
   * `formingTotalTicks` is kept alongside the start tick for the same reason
   * `TerrainBlock` keeps `formingTotal`: a fill cannot be drawn from the
   * remaining count alone, and the fill is the entire fairness argument.
   */
  formingFromTick?: number;
  formingTotalTicks?: number;
}

/**
 * Is this permanent-terrain fact lethal yet, at this simulation tick?
 *
 * THE ONE AUTHORITY (FM-1). The engine's collision test, the board
 * projection and any server replay all ask here; nowhere else compares a
 * forming window to a tick. A fact with no forming window has always been
 * solid and still is.
 */
export function genomeV2TerrainSolidAt(
  fact: GenomeV2TerrainFact,
  tick: number
): boolean {
  const from = fact.formingFromTick;
  const total = fact.formingTotalTicks;
  if (typeof from !== 'number' || typeof total !== 'number') return true;
  return tick >= from + total;
}

export interface GenomeV2TerritoryFact {
  territoryId: string;
  source: 'feral_ladder' | 'heartwood';
  cells: readonly GenomeV2Cell[];
  createdAtFood: number;
  recoveryExitCount: number;
}

export interface GenomeV2OverclockState {
  activationId: string;
  source: 'volt_apex' | 'zenith_protocol';
  startedAtTick: number;
  expiresAtTick: number;
  multiplierBps: number;
  /** Player-chosen world-speed pressure; 11,500 means ×1.15 speed. */
  speedMultiplierBps: number;
}

export interface GenomeV2CrownWaveState {
  waveId: string;
  currentTargetIds: string[];
  futureCells: GenomeV2Cell[];
  crownStarTargetId: string | null;
  completedTargetIds: string[];
}

export interface GenomeV2LoomBondState {
  pinnedGeneId: GenomeV2ActiveGeneId;
  matured: boolean;
}

export interface GenomeV2PhoenixEffect {
  rewindSegments: number;
  phaseTicks: number;
  growth: number;
  consumedMirrorStake: number;
  consumedAshenStake: number;
}

export interface GenomeV2YieldLedger {
  /** Sum of canonical, pre-Genome target Yield. */
  baseYield: number;
  /** Delta created by the one exclusive target transform. */
  exclusiveTargetDelta: number;
  /** Delta from scalable continuous mechanics such as Overgrowth. */
  continuousDelta: number;
  /** Yield currently secure enough to enter outcome settlement. */
  bankableYield: number;
  /** Unfrozen bankable Yield earned since the last portal decision. */
  currentLegYield: number;
  /** Yield withheld at ×2 while a Loan contract is active. */
  loanEscrowDeposited: number;
  loanEscrowReleased: number;
  /** Raw leg Yield removed from ordinary outcome math by Mirror. */
  mirrorRawDiverted: number;
  /** Frozen at the activation portal's Carry before any later escalation. */
  mirrorStake: number;
  /** Never decreases during the run; presentation only, never authority. */
  displayGrossRaw: number;
}

export interface GenomeV2State {
  v: typeof GENOME_RULES_V2;
  dynasty: DynastyName;
  /** Run-start-frozen entropy; never accepted from a later client event. */
  runSeed: string;
  /** Run-start-frozen offer authority. Catalog changes never mutate a live run. */
  genePool: GenomeV2ActiveGeneId[];
  ftue: GenomeV2Ftue;
  /** Server-resolved World Condition tilt; offer gravity only, not points. */
  offerTiltStrain: StrainId | null;
  /** World Condition/Gauntlet ladder suppression frozen for the run. */
  suppressedStrains: StrainId[];
  /** Per-strain shift of the visible 2/3/4 ladder thresholds. */
  strainThresholdDelta: Partial<Record<StrainId, number>>;
  eventIndex: number;
  tick: number;
  foodCount: number;
  eligibleTargetCount: number;
  acquisitionCount: number;
  offerCount: number;
  portalGenomeActions: number;
  infuseCount: number;
  recodeCount: number;
  splicesEnabled: boolean;
  carryPasses: number;
  bonds: number;
  startingStrainPoints: StrainPoints;
  slots: GenomeV2Slot[];
  instances: Record<string, GenomeV2GeneInstance>;
  retired: GenomeV2RetiredInstance[];
  activeSplices: GenomeV2SpliceId[];
  /** Every Splice formed during this run, retained after Recode or consumption. */
  discoveredSplices: GenomeV2SpliceId[];
  /** First food count at which each unlocked Strain expression became active. */
  expressions: Partial<Record<StrainId, number>>;
  /** First food count at which each unlocked Strain apex became active. */
  apexes: Partial<Record<StrainId, number>>;
  offer: GenomeV2OfferState | null;
  portal: GenomeV2PortalDecisionState | null;
  loan: GenomeV2LoanState | null;
  mirrorLeg: { portalId: string; frozenCarryBps: number } | null;
  secondLife: GenomeV2SecondLifeState | null;
  anchor: GenomeV2AnchorState;
  externalSecondLife: 'iron_scales' | 'other' | null;
  targetQueue: GenomeV2PendingTargetContract[];
  targets: Record<string, GenomeV2TargetState>;
  permanentTerrain: GenomeV2TerrainFact[];
  territories: GenomeV2TerritoryFact[];
  overclock: GenomeV2OverclockState | null;
  crownWave: GenomeV2CrownWaveState | null;
  coilCharge: number;
  wallRushCharges: number;
  executionChain: number;
  relayCharges: number;
  treasuryReserve: number;
  covenantShield: number;
  crownBondReserve: number;
  loomBond: GenomeV2LoomBondState | null;
  ashenStakeReserve: number;
  lastPhoenixEffect: GenomeV2PhoenixEffect | null;
  bodyGrowthAdded: number;
  lastBodyGrowthDelta: number;
  compactedJournalEvents: number;
  compactedJournalDigest: string;
  compactedTargets: number;
  compactedTargetDigest: string;
  ledger: GenomeV2YieldLedger;
  journal: GenomeV2Event[];
  /**
   * Curriculum learning events resolved in this run (WP-B, server contract
   * §4; catalog `PLAYER_EVOLUTION_LEARNING_EVENTS.md`).
   *
   * BOUNDED, APPEND-ONLY, NEVER CLEARED — at most one entry per roster Gene,
   * so at most 16 short strings against the 384 KiB persistence bound. Written
   * by the pure reducer, so it is identical under live play and under replay.
   *
   * IT EXISTS BECAUSE THE JOURNAL COMPACTS. Above 256 entries the oldest 64
   * are folded into a digest and discarded, and resolved targets compact the
   * same way above 96 — so a settlement-time scan for "did event X happen"
   * answers false for exactly the long runs an engaged learner produces.
   * Several of the durable facts are non-monotone within a run as well
   * (`wallRushCharges` is restored by a portal CONTINUE, `overclock` clears,
   * `anchor.pinnedGeneId` clears on delivery, `ledger.mirrorStake` is zeroed
   * by Phoenix), so none of them can be read at the end as "this happened".
   *
   * OPTIONAL AND OMITTED WHILE EMPTY. A run in which no learning event fired
   * serializes exactly the bytes it serialized before this field existed,
   * which keeps the flag-off path byte-for-byte identical and keeps a
   * checkpoint written by an adjacent deploy comparable.
   */
  learningEventsResolved?: GenomeV2ActiveGeneId[];
  /**
   * Extra body segments Time Dilation has actually cost this run.
   *
   * GAP-1 of the learning-event catalog: Time Dilation's whole effect is
   * passive (world speed x0.88 and one extra segment on every fourth food), so
   * it emits no journal event and writes no named field — there was nothing in
   * the settled record that said a player had experienced it. The first extra
   * segment is the moment the rule becomes visible (the snake grew when the
   * player did not expect it) and is the Gene's actual cost, so it is the
   * learning event. Counted rather than flagged because the count is the cost.
   *
   * Omitted while zero, for the same reason as the field above.
   */
  timeDilationExtraGrowth?: number;
  /**
   * The stamped curriculum trial and its consumed appearances (WP-C).
   *
   * OMITTED WHENEVER THERE IS NO LIVE GUARANTEE — curriculum off, no trial
   * selected, the three appearances already spent, or a trial the composed
   * vocabulary does not contain. A run without it serializes exactly the bytes
   * it serialized before this field existed, so flag-off is byte-identical
   * rather than merely equivalent.
   */
  trial?: GenomeV2TrialState;
}

interface GenomeV2EventBase {
  /** Strictly next journal index (state.eventIndex + 1). */
  index: number;
  /** Monotonic simulation tick, never wall-clock time. */
  tick: number;
  /** Stable deterministic identity from the run seed/domain/index. */
  eventId: string;
}

export type GenomeV2Event =
  | (GenomeV2EventBase & {
      type: 'offer_opened';
      offerId: string;
      source: GenomeV2OfferState['source'];
      candidates: readonly GenomeV2ActiveGeneId[];
      pinnedGeneId?: GenomeV2ActiveGeneId | null;
    })
  | (GenomeV2EventBase & {
      type: 'offer_declined' | 'offer_expired';
      offerId: string;
      /** Atomic Loom Anchor choice; omitted means an intentional plain decline. */
      pinGeneId?: GenomeV2ActiveGeneId | null;
    })
  | (GenomeV2EventBase & {
      type: 'gene_acquired';
      offerId: string;
      instanceId: string;
      geneId: GenomeV2ActiveGeneId;
      slot: GenomeV2SlotIndex;
      source: 'offer';
    })
  | (GenomeV2EventBase & {
      type: 'portal_opened';
      portalId: string;
      genomeOffer: {
        offerId: string;
        candidates: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
      } | null;
    })
  | (GenomeV2EventBase & {
      type: 'portal_continued';
      portalId: string;
      /** Optional Mirror activation; false is always a valid strategic choice. */
      activateMirror: boolean;
    })
  | (GenomeV2EventBase & {
      /** Reveals and freezes MUTATE choices without consuming the portal. */
      type: 'portal_genome_inspected';
      portalId: string;
      offerId: string;
      candidates: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
    })
  | (GenomeV2EventBase & {
      type: 'portal_expired';
      portalId: string;
    })
  | (GenomeV2EventBase & {
      type: 'portal_bank';
      portalId: string;
    })
  | (GenomeV2EventBase & {
      type: 'portal_infuse';
      portalId: string;
      offerId: string;
      instanceId: string;
      geneId: GenomeV2ActiveGeneId;
      slot: GenomeV2SlotIndex;
      growthCharged: number;
    })
  | (GenomeV2EventBase & {
      /** Atomic commit after a non-mutating Tactical Loom preview. */
      type: 'offer_recoded';
      source: 'loom' | 'portal';
      offerId: string;
      instanceId: string;
      replacementGeneId: GenomeV2ActiveGeneId;
      slot: GenomeV2SlotIndex;
      growthCharged: number;
    })
  | (GenomeV2EventBase & {
      type: 'target_spawned';
      targetId: string;
      cell: GenomeV2Cell;
      /** Missing is the already-issued automatic-offer interaction. */
      interactionVersion?: GenomeV2InteractionVersion;
      forkCell?: GenomeV2Cell | null;
      secondaryCell?: GenomeV2Cell | null;
      optionalRouteCells?: readonly [GenomeV2Cell, GenomeV2Cell] | null;
      speedAtSpawnMs: number;
      shortestSafeMoves: number;
      /** False only for a linked secondary spawned as part of one contract. */
      cadenceEligible: boolean;
      crownRole?: 'current' | 'future' | 'crown' | null;
    })
  | (GenomeV2EventBase & {
      type: 'target_resolved';
      targetId: string;
      resolution: 'collected' | 'missed' | 'expired';
      movesUsed: number;
      /** Canonical pre-Genome value in fixed-point units. */
      baseYield: number;
      /** Board occupancy ratio, 0..10,000, derived from replay. */
      pressureBps: number;
      /** Canonical fact for an optional route (currently Phase Gate). */
      usedOptionalRoute?: boolean;
      /** Circuit pays one growth unit even when its linked execution fails. */
      collectedUnits?: 0 | 1;
      circuitLegsCompleted?: 0 | 1 | 2;
    })
  | (GenomeV2EventBase & {
      type: 'gilded_fork_chosen';
      targetId: string;
      choice: 'ordinary' | 'gilded';
    })
  | (GenomeV2EventBase & {
      /** Gold's premium window ended; the same target remains ordinary. */
      type: 'target_window_expired';
      targetId: string;
    })
  | (GenomeV2EventBase & {
      type: 'coil_sealed';
      terrainId: string;
      cells: readonly GenomeV2Cell[];
    })
  | (GenomeV2EventBase & {
      type: 'phase_gate_used';
      terrainId: string;
      targetId: string;
      cells: readonly GenomeV2Cell[];
    })
  | (GenomeV2EventBase & {
      type: 'wall_redirected';
      sourceInstanceId: string;
    })
  | (GenomeV2EventBase & {
      type: 'territory_claimed';
      territoryId: string;
      cells: readonly GenomeV2Cell[];
      recoveryExitCount: number;
      source: 'feral_ladder' | 'heartwood';
    })
  | (GenomeV2EventBase & {
      type: 'overclock_started';
      activationId: string;
      source: 'volt_apex' | 'zenith_protocol';
    })
  | (GenomeV2EventBase & {
      type: 'overclock_ended';
      activationId: string;
    })
  | (GenomeV2EventBase & {
      type: 'crown_wave_opened';
      waveId: string;
      currentTargetIds: readonly string[];
      futureCells: readonly GenomeV2Cell[];
      crownStarTargetId?: string | null;
    })
  | (GenomeV2EventBase & {
      type: 'crown_target_activated';
      waveId: string;
      targetId: string;
      role: 'current' | 'crown';
    })
  | (GenomeV2EventBase & {
      /** One canonical terminal event for either a perfect clear or failure. */
      type: 'crown_wave_closed';
      waveId: string;
      outcome: 'perfect' | 'failed';
    })
  | (GenomeV2EventBase & {
      type: 'phoenix_triggered';
      sourceInstanceId: string;
    });

export interface GenomeV2Ftue {
  strainTagsUnlocked: true;
  minorUnlocked: true;
  continueUnlocked: boolean;
  expressionsUnlocked: boolean;
  portalGenomeUnlocked: boolean;
  spawnPointsUnlocked: boolean;
  splicesUnlocked: boolean;
  apexesUnlocked: boolean;
}

export type GenomeV2FtueCapabilityId =
  | 'strainTags'
  | 'minor'
  | 'continue'
  | 'expressions'
  | 'portalGenome'
  | 'spawnPoints'
  | 'splices'
  | 'apex';

export interface GenomeV2FtueCapability {
  id: GenomeV2FtueCapabilityId;
  unlocked: boolean;
  reason:
    | 'available_from_first_run'
    | 'banked_runs'
    | 'banked_runs_or_mastery';
  progress: {
    bankedRuns: { current: number; required: number } | null;
    mastery: { current: number; required: number } | null;
  };
}

export interface GenomeV2FtuePresentation {
  v: typeof GENOME_RULES_V2;
  bankedRuns: number;
  masteryLevel: number;
  capabilities: Record<GenomeV2FtueCapabilityId, GenomeV2FtueCapability>;
}

export function deriveGenomeV2Ftue(
  bankedRuns: number,
  masteryLevel: number
): GenomeV2Ftue {
  const banks = Math.max(0, Math.floor(bankedRuns));
  const mastery = Math.max(0, Math.floor(masteryLevel));
  const ftue = GENOME_V2_CONFIG.ftue;
  return {
    strainTagsUnlocked: true,
    minorUnlocked: true,
    continueUnlocked: banks >= ftue.continueAtBankedRuns,
    expressionsUnlocked: banks >= ftue.expressionsAtBankedRuns,
    portalGenomeUnlocked: banks >= ftue.portalGenomeAtBankedRuns,
    spawnPointsUnlocked: banks >= ftue.spawnPointsAtBankedRuns,
    splicesUnlocked: banks >= ftue.splicesAtBankedRuns,
    apexesUnlocked:
      banks >= ftue.apexAtBankedRuns || mastery >= ftue.apexAtMastery,
  };
}

export function deriveGenomeV2FtuePresentation(
  bankedRuns: number,
  masteryLevel: number
): GenomeV2FtuePresentation {
  const banks = Math.max(0, Math.floor(bankedRuns));
  const mastery = Math.max(0, Math.floor(masteryLevel));
  const unlocks = deriveGenomeV2Ftue(banks, mastery);
  const atStart = (
    id: 'strainTags' | 'minor'
  ): GenomeV2FtueCapability => ({
    id,
    unlocked: true,
    reason: 'available_from_first_run',
    progress: { bankedRuns: null, mastery: null },
  });
  const byBanks = (
    id: Exclude<GenomeV2FtueCapabilityId, 'strainTags' | 'minor' | 'apex'>,
    required: number,
    unlocked: boolean
  ): GenomeV2FtueCapability => ({
    id,
    unlocked,
    reason: 'banked_runs',
    progress: {
      bankedRuns: { current: banks, required },
      mastery: null,
    },
  });
  return {
    v: GENOME_RULES_V2,
    bankedRuns: banks,
    masteryLevel: mastery,
    capabilities: {
      strainTags: atStart('strainTags'),
      minor: atStart('minor'),
      continue: byBanks(
        'continue',
        GENOME_V2_CONFIG.ftue.continueAtBankedRuns,
        unlocks.continueUnlocked
      ),
      expressions: byBanks(
        'expressions',
        GENOME_V2_CONFIG.ftue.expressionsAtBankedRuns,
        unlocks.expressionsUnlocked
      ),
      portalGenome: byBanks(
        'portalGenome',
        GENOME_V2_CONFIG.ftue.portalGenomeAtBankedRuns,
        unlocks.portalGenomeUnlocked
      ),
      spawnPoints: byBanks(
        'spawnPoints',
        GENOME_V2_CONFIG.ftue.spawnPointsAtBankedRuns,
        unlocks.spawnPointsUnlocked
      ),
      splices: byBanks(
        'splices',
        GENOME_V2_CONFIG.ftue.splicesAtBankedRuns,
        unlocks.splicesUnlocked
      ),
      apex: {
        id: 'apex',
        unlocked: unlocks.apexesUnlocked,
        reason: 'banked_runs_or_mastery',
        progress: {
          bankedRuns: {
            current: banks,
            required: GENOME_V2_CONFIG.ftue.apexAtBankedRuns,
          },
          mastery: {
            current: mastery,
            required: GENOME_V2_CONFIG.ftue.apexAtMastery,
          },
        },
      },
    },
  };
}

function genomeV2JsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => genomeV2JsonEqual(entry, right[index]));
  }
  if (
    typeof left !== 'object' || left === null ||
    typeof right !== 'object' || right === null
  ) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        genomeV2JsonEqual(leftRecord[key], rightRecord[key])
    );
}

/** Validate the server-authored presentation and map it to reducer gates. */
export function genomeV2FtueFromPresentation(
  value: unknown
): GenomeV2Ftue {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Genome v2 FTUE presentation is malformed.');
  }
  const input = value as Record<string, unknown>;
  if (
    input.v !== GENOME_RULES_V2 ||
    !Number.isSafeInteger(input.bankedRuns) ||
    (input.bankedRuns as number) < 0 ||
    !Number.isSafeInteger(input.masteryLevel) ||
    (input.masteryLevel as number) < 0
  ) {
    throw new Error('Genome v2 FTUE presentation is malformed.');
  }
  const expected = deriveGenomeV2FtuePresentation(
    input.bankedRuns as number,
    input.masteryLevel as number
  );
  if (!genomeV2JsonEqual(value, expected)) {
    throw new Error('Genome v2 FTUE presentation disagrees with its progress.');
  }
  return deriveGenomeV2Ftue(expected.bankedRuns, expected.masteryLevel);
}

export const GENOME_V2_STRAIN_THRESHOLDS = {
  minor: 2,
  expression: 3,
  apex: 4,
} as const;

/** Current World Conditions shift the complete ladder by at most one point. */
export const GENOME_V2_MAX_STRAIN_THRESHOLD_SHIFT = 1;

export type GenomeV2StrainThreshold =
  (typeof GENOME_V2_STRAIN_THRESHOLDS)[keyof typeof GENOME_V2_STRAIN_THRESHOLDS];

export interface GenomeV2StrainLadderTier {
  points: GenomeV2StrainThreshold;
  name: string;
  rule: string;
}

/** Visible from the first run; unlocking controls activation, never discovery. */
export const GENOME_V2_STRAIN_LADDERS: Readonly<
  Record<StrainId, readonly GenomeV2StrainLadderTier[]>
> = {
  AURUM: [
    { points: 2, name: 'Cut', rule: "Finish a power's challenge and take your cut. +25%" },
    { points: 3, name: 'Payday', rule: 'Each clean chain adds +5% at BANK, up to 4.' },
    { points: 4, name: 'Vault', rule: 'Store 10% of food. BANK pays it back ×1.5.' },
  ],
  VOLT: [
    { points: 2, name: 'Clock', rule: 'See exactly how many moves you have left.' },
    { points: 3, name: 'Chain', rule: 'Nail a route and the next one pays +50%.' },
    { points: 4, name: 'Turbo', rule: 'Switch on speed yourself. Food pays ×1.5.' },
  ],
  FERAL: [
    { points: 2, name: 'Bulk', rule: 'The longer you are, the more food pays. +25%' },
    { points: 3, name: 'Claim', rule: 'Circle ground to claim it. Food pays ×1.5.' },
    { points: 4, name: 'Titan', rule: 'Perfect body control doubles the payout.' },
  ],
  FLUX: [
    { points: 2, name: 'Scout', rule: 'See a safe way out before you commit.' },
    { points: 3, name: 'Tunnel', rule: 'Give up board space to open a shortcut. +25%' },
    { points: 4, name: 'Rewrite', rule: 'Chain wall tricks to redraw one route. +50%' },
  ],
  UMBRA: [
    { points: 2, name: 'Bet', rule: 'See exactly how much you could lose.' },
    { points: 3, name: 'Cover', rule: 'Your bets cover each other. 25% covered.' },
    { points: 4, name: 'Second Life', rule: 'Build yourself one more life out of your bets.' },
  ],
};

function emptySlots(): GenomeV2Slot[] {
  return [0, 1, 2, 3, 4, 5].map((index) => ({
    index: index as GenomeV2SlotIndex,
    occupant: null,
  }));
}

export function createGenomeV2State(
  dynasty: DynastyName,
  options: {
    runSeed?: string;
    genePool?: readonly GenomeV2ActiveGeneId[];
    splicesEnabled?: boolean;
    externalSecondLife?: 'iron_scales' | 'other' | null;
    startingStrainPoints?: StrainPoints;
    ftue?: GenomeV2Ftue;
    offerTiltStrain?: StrainId | null;
    suppressedStrains?: readonly StrainId[];
    strainThresholdDelta?: Readonly<Partial<Record<StrainId, number>>>;
    /**
     * The account's selected trial and the appearances still guaranteed to it
     * (WP-C). Server stamp only; there is no request field it can arrive on.
     */
    trial?: { geneId: GenomeV2ActiveGeneId; offersRemaining: number } | null;
  } = {}
): GenomeV2State {
  const runSeed = options.runSeed ?? 'genome-v2-test-seed';
  if (runSeed.length < 8 || runSeed.length > 256) {
    throw new Error('Genome v2 run seed is malformed.');
  }
  const catalogPool = genomeV2ActivePool(dynasty);
  const genePool = [...(options.genePool ?? catalogPool)];
  if (
    genePool.length < 2 ||
    new Set(genePool).size !== genePool.length ||
    genePool.some((geneId) => !catalogPool.includes(geneId))
  ) {
    throw new Error('Genome v2 run-start gene pool is malformed for its Dynasty.');
  }
  for (const [strain, points] of Object.entries(options.startingStrainPoints ?? {})) {
    if (
      !(STRAIN_IDS as readonly string[]).includes(strain) ||
      !Number.isSafeInteger(points) ||
      (points ?? -1) < 0
    ) {
      throw new Error('Genome v2 starting Strain points are malformed.');
    }
  }
  const offerTiltStrain = options.offerTiltStrain ?? null;
  if (
    offerTiltStrain !== null &&
    !(STRAIN_IDS as readonly string[]).includes(offerTiltStrain)
  ) throw new Error('Genome v2 offer tilt is malformed.');
  const suppressedStrains = [...(options.suppressedStrains ?? [])];
  if (
    new Set(suppressedStrains).size !== suppressedStrains.length ||
    suppressedStrains.some(
      (strain) => !(STRAIN_IDS as readonly string[]).includes(strain)
    )
  ) throw new Error('Genome v2 suppressed Strains are malformed.');
  const strainThresholdDelta = {
    ...(options.strainThresholdDelta ?? {}),
  };
  for (const [strain, delta] of Object.entries(strainThresholdDelta)) {
    if (
      !(STRAIN_IDS as readonly string[]).includes(strain) ||
      !Number.isSafeInteger(delta) ||
      Math.abs(delta ?? 0) > GENOME_V2_MAX_STRAIN_THRESHOLD_SHIFT
    ) throw new Error('Genome v2 threshold shift is malformed.');
  }
  // Resolved once, here, so live play and replay stamp the identical trial —
  // and so a trial the composed vocabulary does not contain simply is not one.
  const trial = genomeV2TrialStamp(genePool, options.trial ?? null);
  const state: GenomeV2State = {
    v: GENOME_RULES_V2,
    dynasty,
    runSeed,
    genePool,
    ftue: options.ftue ?? {
      strainTagsUnlocked: true,
      minorUnlocked: true,
      continueUnlocked: true,
      expressionsUnlocked: true,
      portalGenomeUnlocked: true,
      spawnPointsUnlocked: true,
      splicesUnlocked: true,
      apexesUnlocked: true,
    },
    offerTiltStrain,
    suppressedStrains,
    strainThresholdDelta,
    eventIndex: 0,
    tick: 0,
    foodCount: 0,
    eligibleTargetCount: 0,
    acquisitionCount: 0,
    offerCount: 0,
    portalGenomeActions: 0,
    infuseCount: 0,
    recodeCount: 0,
    splicesEnabled:
      options.ftue?.splicesUnlocked ?? options.splicesEnabled ?? true,
    carryPasses: 0,
    bonds: 0,
    startingStrainPoints: { ...(options.startingStrainPoints ?? {}) },
    slots: emptySlots(),
    instances: {},
    retired: [],
    activeSplices: [],
    discoveredSplices: [],
    expressions: {},
    apexes: {},
    offer: null,
    portal: null,
    loan: null,
    mirrorLeg: null,
    secondLife: null,
    anchor: {
      charges: GENOME_V2_CONFIG.loomAnchor.initialCharges,
      pinnedGeneId: null,
    },
    externalSecondLife: options.externalSecondLife ?? null,
    targetQueue: [],
    targets: {},
    permanentTerrain: [],
    territories: [],
    overclock: null,
    crownWave: null,
    coilCharge: 0,
    wallRushCharges: 0,
    executionChain: 0,
    relayCharges: 0,
    treasuryReserve: 0,
    covenantShield: 0,
    crownBondReserve: 0,
    loomBond: null,
    ashenStakeReserve: 0,
    lastPhoenixEffect: null,
    bodyGrowthAdded: 0,
    lastBodyGrowthDelta: 0,
    compactedJournalEvents: 0,
    compactedJournalDigest: '00000000',
    compactedTargets: 0,
    compactedTargetDigest: '00000000',
    ledger: {
      baseYield: 0,
      exclusiveTargetDelta: 0,
      continuousDelta: 0,
      bankableYield: 0,
      currentLegYield: 0,
      loanEscrowDeposited: 0,
      loanEscrowReleased: 0,
      mirrorRawDiverted: 0,
      mirrorStake: 0,
      displayGrossRaw: 0,
    },
    journal: [],
    // Absent, not null, when there is no live guarantee: the serialized run is
    // then byte-identical to a pre-curriculum one.
    ...(trial ? { trial } : {}),
  };
  captureGenomeV2DiscoveryHistory(state);
  return state;
}

function cloneState(state: GenomeV2State): GenomeV2State {
  return {
    ...state,
    genePool: [...state.genePool],
    ftue: { ...state.ftue },
    suppressedStrains: [...state.suppressedStrains],
    strainThresholdDelta: { ...state.strainThresholdDelta },
    slots: state.slots.map((slot) => ({
      ...slot,
      occupant: slot.occupant ? { ...slot.occupant } : null,
    })),
    instances: Object.fromEntries(
      Object.entries(state.instances).map(([id, instance]) => [id, { ...instance }])
    ),
    retired: state.retired.map((entry) => ({ ...entry })),
    activeSplices: [...state.activeSplices],
    discoveredSplices: [
      ...(state.discoveredSplices ?? state.activeSplices),
    ],
    expressions: { ...(state.expressions ?? {}) },
    apexes: { ...(state.apexes ?? {}) },
    offer: state.offer
      ? { ...state.offer, candidateGeneIds: [...state.offer.candidateGeneIds] }
      : null,
    portal: state.portal
      ? {
          ...state.portal,
          genomeOffer: state.portal.genomeOffer
            ? {
                ...state.portal.genomeOffer,
                candidates: [...state.portal.genomeOffer.candidates],
              }
            : null,
        }
      : null,
    loan: state.loan ? { ...state.loan } : null,
    mirrorLeg: state.mirrorLeg ? { ...state.mirrorLeg } : null,
    secondLife: state.secondLife
      ? {
          ...state.secondLife,
          owner: state.secondLife.owner.kind === 'gene'
            ? { ...state.secondLife.owner }
            : {
                ...state.secondLife.owner,
                parentInstanceIds: [...state.secondLife.owner.parentInstanceIds],
              },
        }
      : null,
    anchor: { ...state.anchor },
    targetQueue: state.targetQueue.map((entry) => ({ ...entry })),
    targets: Object.fromEntries(
      Object.entries(state.targets).map(([id, target]) => [
        id,
        {
          ...target,
          cell: { ...target.cell },
          forkCell: target.forkCell ? { ...target.forkCell } : null,
          secondaryCell: target.secondaryCell
            ? { ...target.secondaryCell }
            : null,
          optionalRouteCells: target.optionalRouteCells
            ? [
                { ...target.optionalRouteCells[0] },
                { ...target.optionalRouteCells[1] },
              ]
            : null,
        },
      ])
    ),
    permanentTerrain: state.permanentTerrain.map((fact) => ({
      ...fact,
      cells: fact.cells.map((cell) => ({ ...cell })),
    })),
    territories: state.territories.map((territory) => ({
      ...territory,
      cells: territory.cells.map((cell) => ({ ...cell })),
    })),
    overclock: state.overclock ? { ...state.overclock } : null,
    crownWave: state.crownWave
      ? {
          ...state.crownWave,
          currentTargetIds: [...state.crownWave.currentTargetIds],
          futureCells: state.crownWave.futureCells.map((cell) => ({ ...cell })),
          completedTargetIds: [...state.crownWave.completedTargetIds],
        }
      : null,
    loomBond: state.loomBond ? { ...state.loomBond } : null,
    lastPhoenixEffect: state.lastPhoenixEffect
      ? { ...state.lastPhoenixEffect }
      : null,
    ledger: { ...state.ledger },
    startingStrainPoints: { ...state.startingStrainPoints },
    journal: [...state.journal],
    // Both curriculum fields are written by the reducer AFTER this clone, so
    // both must be copies. Sharing the array with `current` would let a guard
    // that throws later in the same reduction leave a resolution behind on the
    // state the caller kept — "the input state is never mutated" has to be
    // true of the fields added last, too.
    ...(state.learningEventsResolved
      ? { learningEventsResolved: [...state.learningEventsResolved] }
      : {}),
    ...(state.trial ? { trial: { ...state.trial } } : {}),
  };
}

function assertSafeInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`Genome v2 ${label} is outside its safe integer domain.`);
  }
}

function safeAdd(a: number, b: number, label: string): number {
  assertSafeInteger(a, `${label} left`);
  assertSafeInteger(b, `${label} right`, Number.MIN_SAFE_INTEGER);
  const result = a + b;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Genome v2 ${label} overflowed.`);
  }
  return result;
}

function safeSignedAdd(a: number, b: number, label: string): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new Error(`Genome v2 ${label} is outside its safe integer domain.`);
  }
  const result = a + b;
  if (!Number.isSafeInteger(result)) {
    throw new Error(`Genome v2 ${label} overflowed.`);
  }
  return result;
}

function addGenomeBodyGrowth(state: GenomeV2State, amount: number): void {
  assertSafeInteger(amount, 'body growth delta');
  state.bodyGrowthAdded = safeAdd(
    state.bodyGrowthAdded,
    amount,
    'body growth ledger'
  );
  state.lastBodyGrowthDelta = safeAdd(
    state.lastBodyGrowthDelta,
    amount,
    'event body growth'
  );
}

/**
 * Sole integration seam for physical tail growth added by Genome v2. The
 * engine applies its ordinary food growth first, reduces the canonical event,
 * then appends exactly this many additional segments. No renderer or runtime
 * should reimplement individual gene/Splice growth arithmetic.
 */
export function genomeV2BodyGrowthDelta(
  previous: GenomeV2State,
  next: GenomeV2State
): number {
  if (
    previous.v !== GENOME_RULES_V2 ||
    next.v !== GENOME_RULES_V2 ||
    next.eventIndex !== previous.eventIndex + 1
  ) {
    throw new Error('Genome v2 body growth requires adjacent reducer states.');
  }
  const delta = next.bodyGrowthAdded - previous.bodyGrowthAdded;
  if (
    !Number.isSafeInteger(delta) ||
    delta < 0 ||
    delta !== next.lastBodyGrowthDelta
  ) {
    throw new Error('Genome v2 body growth ledger is inconsistent.');
  }
  return delta;
}

export function genomeV2MultiplyBps(value: number, multiplierBps: number): number {
  assertSafeInteger(value, 'Yield');
  assertSafeInteger(multiplierBps, 'multiplier');
  const product = BigInt(value) * BigInt(multiplierBps);
  const result = product / BigInt(GENOME_V2_YIELD_SCALE);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Genome v2 Yield exceeded its representation range.');
  }
  return Number(result);
}

export function genomeV2Yield(value: number): number {
  assertSafeInteger(value, 'base Yield');
  return safeAdd(0, value * GENOME_V2_YIELD_SCALE, 'scaled Yield');
}

export function genomeV2YieldFloor(scaled: number): number {
  assertSafeInteger(scaled, 'scaled Yield');
  return Math.floor(scaled / GENOME_V2_YIELD_SCALE);
}

function activeGeneInstances(state: GenomeV2State): GenomeV2GeneInstance[] {
  return Object.values(state.instances)
    .filter((instance) => instance.status === 'active')
    .sort((a, b) => a.acquisitionOrdinal - b.acquisitionOrdinal);
}

export function genomeV2HasGene(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): boolean {
  return activeGeneInstances(state).some((instance) => instance.geneId === geneId);
}

export function genomeV2HasSplice(
  state: GenomeV2State,
  spliceId: GenomeV2SpliceId
): boolean {
  return state.activeSplices.includes(spliceId);
}

export function genomeV2StrainTier(
  state: GenomeV2State,
  strain: StrainId
): 0 | GenomeV2StrainThreshold {
  const points = genomeV2StrainPoints(state)[strain] ?? 0;
  const minorActive = points >= genomeV2EffectiveStrainThreshold(
    state,
    strain,
    GENOME_V2_STRAIN_THRESHOLDS.minor
  );
  if (!minorActive) return 0;
  // A Dampened World Condition is a semantic Minor ceiling, not a complete
  // shutdown. This mirrors the legacy authority and the player-facing rule:
  // the Strain keeps its Minor identity while Expression and Apex stay off.
  if (state.suppressedStrains.includes(strain)) {
    return GENOME_V2_STRAIN_THRESHOLDS.minor;
  }
  return points >= genomeV2EffectiveStrainThreshold(
    state,
    strain,
    GENOME_V2_STRAIN_THRESHOLDS.apex
  )
    ? GENOME_V2_STRAIN_THRESHOLDS.apex
    : points >= genomeV2EffectiveStrainThreshold(
        state,
        strain,
        GENOME_V2_STRAIN_THRESHOLDS.expression
      )
      ? GENOME_V2_STRAIN_THRESHOLDS.expression
      : GENOME_V2_STRAIN_THRESHOLDS.minor;
}

/** Effective target shown by the Loom after the run-frozen World Condition. */
export function genomeV2EffectiveStrainThreshold(
  state: GenomeV2State,
  strain: StrainId,
  threshold: GenomeV2StrainThreshold
): number {
  const delta = state.strainThresholdDelta[strain] ?? 0;
  return Math.max(1, threshold + delta);
}

export function genomeV2HasLadderTier(
  state: GenomeV2State,
  strain: StrainId,
  minimum: GenomeV2StrainThreshold
): boolean {
  if (
    minimum === GENOME_V2_STRAIN_THRESHOLDS.expression
    && !state.ftue.expressionsUnlocked
  ) return false;
  if (
    minimum === GENOME_V2_STRAIN_THRESHOLDS.apex
    && !state.ftue.apexesUnlocked
  ) return false;
  return genomeV2StrainTier(state, strain) >= minimum;
}

/**
 * Discovery is durable run history, not a projection of the terminal build.
 * Recode, Phoenix and Splice consumption may remove current power, but they
 * never erase what the player actually assembled or activated earlier.
 */
function captureGenomeV2DiscoveryHistory(state: GenomeV2State): void {
  for (const spliceId of state.activeSplices) {
    if (!state.discoveredSplices.includes(spliceId)) {
      state.discoveredSplices.push(spliceId);
    }
  }
  for (const strain of STRAIN_IDS) {
    if (
      state.expressions[strain] === undefined &&
      genomeV2HasLadderTier(state, strain, GENOME_V2_STRAIN_THRESHOLDS.expression)
    ) {
      state.expressions[strain] = state.foodCount;
    }
    if (
      state.apexes[strain] === undefined &&
      genomeV2HasLadderTier(state, strain, GENOME_V2_STRAIN_THRESHOLDS.apex)
    ) {
      state.apexes[strain] = state.foodCount;
    }
  }
}

/**
 * Canonical runtime answer for whether one parent mechanic survives the
 * current Genome. A `spliced` instance alone is not enough: each fused rule
 * explicitly names which parent behavior it retains.
 */
export function genomeV2MechanicEnabled(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): boolean {
  if (genomeV2HasGene(state, geneId)) return true;
  switch (geneId) {
    case 'gold_trail':
      return genomeV2HasSplice(state, 'splice_dragon_hoard') ||
        genomeV2HasSplice(state, 'splice_gilded_fork');
    case 'compound_interest':
      return genomeV2HasSplice(state, 'splice_loom_bond');
    case 'loan_shark':
      return genomeV2HasSplice(state, 'splice_ashen_stake');
    case 'live_wire':
    case 'circuit_run':
      return genomeV2HasSplice(state, 'splice_perfect_circuit');
    case 'overgrowth':
      return genomeV2HasSplice(state, 'splice_gilded_fork') ||
        genomeV2HasSplice(state, 'splice_worldcoil');
    case 'coilkeeper':
      return genomeV2HasSplice(state, 'splice_worldcoil');
    case 'wall_rush':
    case 'phase_gate':
      return genomeV2HasSplice(state, 'splice_riftline');
    case 'mirror_wager':
      return genomeV2HasSplice(state, 'splice_styx_contract');
    case 'phoenix':
      return genomeV2HasSplice(state, 'splice_styx_contract') ||
        genomeV2HasSplice(state, 'splice_ashen_stake');
    case 'loom_anchor':
      return genomeV2HasSplice(state, 'splice_loom_bond');
    default:
      return false;
  }
}

/**
 * The one truth about whether a golden target carries a branch to commit.
 *
 * The Gold Trail Gene spawns golden food on its own cadence, but only the
 * Gilded Fork Splice draws the second cell that makes a choice meaningful —
 * `targetMultiplierBps` likewise reads `forkChoice` only under that Splice.
 * The reducer guards `gilded_fork_chosen` with this predicate and the engine
 * asks it before committing, so board geometry and reducer legality can never
 * disagree about whether a choice is owed.
 */
export function genomeV2GildedForkChoiceAvailable(
  state: GenomeV2State,
  targetId: string
): boolean {
  const target = state.targets[targetId];
  return (
    genomeV2HasSplice(state, 'splice_gilded_fork') &&
    !!target &&
    target.kind === 'gold_trail' &&
    target.lifecycle === 'active' &&
    target.forkChoice === null
  );
}

/**
 * The one truth about whether a Constellation wave may bind its current Stars.
 *
 * Returns the reducer's own refusal message, or null when the binding is
 * legal, so engine, runtime and reducer ask one question and get one answer.
 * The engine needs the answer BEFORE it spawns the preview Star: a wave that
 * cannot bind must degrade to "no wave this cadence" rather than halt the run,
 * and it must not leave a preview object behind on the way out.
 */
export function genomeV2CrownWaveBindingRefusal(
  state: GenomeV2State,
  currentTargetIds: readonly string[]
): string | null {
  if (!genomeV2HasGene(state, 'constellation_crown') || state.crownWave) {
    return 'Genome v2 Crown wave is unavailable.';
  }
  const uniqueIds = new Set(currentTargetIds);
  if (uniqueIds.size < 2 || uniqueIds.size !== currentTargetIds.length) {
    return 'Genome v2 Crown wave requires distinct current targets.';
  }
  for (const targetId of currentTargetIds) {
    const target = state.targets[targetId];
    if (
      !target ||
      !['current', 'crown'].includes(target.crownRole ?? '') ||
      !target.edible ||
      !target.collidable
    ) {
      return 'Genome v2 Crown current target is ambiguous.';
    }
  }
  return null;
}

/**
 * The one truth about whether a previewed Phase Gate may be entered.
 *
 * `genomeV2MechanicEnabled` is satisfied by holding the gene OR a qualifying
 * Splice, and a portal recode changes that set MID-RUN while a gate target is
 * already drawn on the board. Only the reducer used to consult it, so the
 * engine would preview the gate, move the head to the exit, and only then meet
 * a refusal it could not undo. Every layer now asks this before any mutation.
 *
 * `cells` is optional so a caller holding only a target id (the preview) and a
 * caller holding the exact route it is about to commit (the reducer) share one
 * predicate.
 */
export function genomeV2PhaseGateAvailable(
  state: GenomeV2State,
  targetId: string,
  cells?: readonly GenomeV2Cell[]
): boolean {
  const target = state.targets[targetId];
  if (
    !genomeV2MechanicEnabled(state, 'phase_gate') ||
    !target ||
    !['phase_gate', 'wall_rush'].includes(target.kind) ||
    !['active', 'armed'].includes(target.lifecycle) ||
    !target.optionalRouteCells
  ) {
    return false;
  }
  if (cells === undefined) return true;
  return (
    cells.length === 2 &&
    new Set(cells.map((cell) => `${cell.x}:${cell.z}`)).size === 2 &&
    cells.every((cell, index) => {
      const expected = target.optionalRouteCells?.[index];
      return !!expected && cell.x === expected.x && cell.z === expected.z;
    })
  );
}

function geneInstance(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): GenomeV2GeneInstance | null {
  return activeGeneInstances(state).find((instance) => instance.geneId === geneId) ?? null;
}

function mechanicInstance(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): GenomeV2GeneInstance | null {
  return Object.values(state.instances)
    .filter((instance) =>
      (instance.status === 'active' || instance.status === 'spliced') &&
      instance.geneId === geneId
    )
    .sort((a, b) => a.acquisitionOrdinal - b.acquisitionOrdinal)[0] ?? null;
}

function ensureEventEnvelope(state: GenomeV2State, event: GenomeV2Event): void {
  if (event.index !== state.eventIndex + 1) {
    throw new Error('Genome v2 journal index is not contiguous.');
  }
  if (!Number.isSafeInteger(event.tick) || event.tick < state.tick) {
    throw new Error('Genome v2 journal tick rewinds.');
  }
  if (
    event.eventId !== genomeV2EventId(state.runSeed, event.index) ||
    state.journal.some((entry) => entry.eventId === event.eventId)
  ) {
    throw new Error('Genome v2 journal event identity is invalid or duplicated.');
  }
}

function foldDigest(previous: string, value: unknown): string {
  let hash = Number.parseInt(previous, 16);
  if (!Number.isFinite(hash)) hash = 0x811c9dc5;
  const input = JSON.stringify(value);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Exact bounded journal identity. The index binding makes an ID from a
 * compacted event impossible to reuse later without retaining an unbounded
 * set of historical IDs. */
export function genomeV2EventId(runSeed: string, index: number): string {
  if (!runSeed || !Number.isSafeInteger(index) || index < 1) {
    throw new Error('Genome v2 event identity input is malformed.');
  }
  return `g2:${index}:${foldDigest('811c9dc5', `${runSeed}:${index}`)}`;
}

function compactJournal(state: GenomeV2State): void {
  const persistence = GENOME_V2_CONFIG.persistence;
  while (state.journal.length > persistence.retainedJournalEvents) {
    const compacted = state.journal.splice(0, persistence.journalCompactionBatch);
    for (const entry of compacted) {
      state.compactedJournalDigest = foldDigest(
        state.compactedJournalDigest,
        entry
      );
    }
    state.compactedJournalEvents += compacted.length;
  }
}

function compactResolvedTargets(state: GenomeV2State): void {
  const persistence = GENOME_V2_CONFIG.persistence;
  const resolved = Object.values(state.targets)
    .filter((target) => !['active', 'armed'].includes(target.lifecycle))
    .sort(
      (a, b) =>
        a.spawnTick - b.spawnTick || a.targetId.localeCompare(b.targetId)
    );
  if (resolved.length <= persistence.retainedResolvedTargets) return;
  const count = Math.min(
    persistence.targetCompactionBatch,
    resolved.length - persistence.retainedResolvedTargets
  );
  for (const target of resolved.slice(0, count)) {
    state.compactedTargetDigest = foldDigest(
      state.compactedTargetDigest,
      target
    );
    state.compactedTargets += 1;
    delete state.targets[target.targetId];
  }
}

export function genomeV2SerializedBytes(state: GenomeV2State): number {
  return new TextEncoder().encode(JSON.stringify(state)).byteLength;
}

export function assertGenomeV2PersistenceBound(state: GenomeV2State): void {
  if (
    genomeV2SerializedBytes(state) >
    GENOME_V2_CONFIG.persistence.maximumSerializedBytes
  ) {
    throw new Error('Genome v2 state exceeds its checkpoint byte budget.');
  }
}

/**
 * The learning-event catalog this build resolves against
 * (`PLAYER_EVOLUTION_LEARNING_EVENTS.md`). A Gene's event may only change
 * under a new version, and a resolution completed at an older version stays
 * completed — eligibility is monotonic (Constitution §8.3).
 */
export const GENOME_V2_LEARNING_EVENT_VERSION = 1;

/**
 * Target kinds whose terminal lifecycle IS their Gene's learning event.
 * `coilkeeper`, `wall_rush` and `phase_gate` also spawn targets, but the
 * catalog names their terrain action rather than the reward that follows it,
 * so they resolve at `coil_sealed` / `wall_redirected` / `phase_gate_used`.
 */
const GENOME_V2_TARGET_LEARNING_KINDS: readonly GenomeV2ExclusiveTargetKind[] = [
  'gold_trail',
  'live_wire',
  'circuit_run',
];

/**
 * Record that a Gene's catalog learning event happened in this run.
 *
 * Idempotent and monotone: the field is created on first use, an entry is
 * never repeated and never removed. Success and failure both resolve — the
 * lesson is "you now know what this does", not "you executed it well".
 */
function recordGenomeV2LearningEvent(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): void {
  const resolved = state.learningEventsResolved;
  if (!resolved) {
    state.learningEventsResolved = [geneId];
    return;
  }
  if (!resolved.includes(geneId)) resolved.push(geneId);
}

/** The run's resolved learning events, absent and empty being the same thing. */
export function genomeV2LearningEventsResolved(
  state: Pick<GenomeV2State, 'learningEventsResolved'>
): readonly GenomeV2ActiveGeneId[] {
  return state.learningEventsResolved ?? [];
}

// ---------------------------------------------------------------------------
// The trial guarantee (WP-C — PEO §4.4, server contract §5)
// ---------------------------------------------------------------------------

/**
 * Collected offers a selected trial is guaranteed to appear in before it
 * becomes an ordinary candidate (PEO §4.4, **[H] set 2026-08-04**).
 *
 * Mirrored by migration 067's `gene_eligibility_trial_offers_check` and by
 * `record_trial_offer`'s own bound, so the engine and the database cannot
 * disagree about when a guarantee is spent.
 */
export const GENOME_V2_TRIAL_OFFER_GUARANTEE = 3;

/**
 * Genes whose learning event cannot fire until portal CONTINUE exists
 * (learning-event catalog §5). Both read "portal CONTINUE" in their own rule
 * text and CONTINUE activates at one validated bank, so in a run without it
 * the trial is SUPPRESSED — it neither takes a candidate position nor spends
 * an appearance, which is the difference between "not taught yet" and "taught
 * and failed".
 */
export const GENOME_V2_TRIAL_CONTINUE_DEPENDENT: readonly GenomeV2ActiveGeneId[] =
  ['loan_shark', 'mirror_wager'];

/**
 * Can this run still teach that Gene at all?
 *
 * Only the conditions the frozen run state can answer live here. The rest of
 * catalog §5 is already structural and needs no second expression:
 *
 *   - Dynasty legality (`heartwood`, `zenith_protocol`,
 *     `constellation_crown`, `time_dilation` on CYBER) — the composed
 *     vocabulary is a subset of the Dynasty roster, so an illegal trial is
 *     never in `genePool` and never reaches a roll;
 *   - an outside revive suppressing `phoenix` — the shipped `legal` filter
 *     already removes it;
 *   - Free Play — the route composes Free Play from the complete roster and
 *     stamps no trial at all;
 *   - a run that collects no relic — it opens no offer, so nothing is spent.
 */
export function genomeV2TrialTeachable(
  state: Pick<GenomeV2State, 'ftue'>,
  geneId: GenomeV2ActiveGeneId
): boolean {
  if (
    GENOME_V2_TRIAL_CONTINUE_DEPENDENT.includes(geneId) &&
    !state.ftue.continueUnlocked
  ) {
    return false;
  }
  return true;
}

/**
 * Freeze the account's trial into a run, or decide it has none.
 *
 * ONE FUNCTION, THREE CALLERS, SO THEY CANNOT DRIFT: run start stamps with it,
 * the client engine rebuilds with it, and settlement validation re-derives the
 * expected stamp with it. It answers `null` — meaning "this run carries no
 * guarantee, the Gene is simply part of the vocabulary" — when the trial is
 * absent, spent, or not in this run's own pool.
 *
 * A structurally malformed trial throws, exactly as a malformed pool does:
 * it can only come from the server's own stamp, so it is a bug rather than a
 * player-supplied surprise.
 */
export function genomeV2TrialStamp(
  genePool: readonly GenomeV2ActiveGeneId[],
  trial: { geneId: GenomeV2ActiveGeneId; offersRemaining: number } | null
): GenomeV2TrialState | null {
  if (!trial) return null;
  if (
    !isGenomeV2ActiveGeneId(trial.geneId) ||
    !Number.isSafeInteger(trial.offersRemaining) ||
    trial.offersRemaining < 0 ||
    trial.offersRemaining > GENOME_V2_TRIAL_OFFER_GUARANTEE
  ) {
    throw new Error('Genome v2 run-start trial is malformed.');
  }
  if (trial.offersRemaining === 0 || !genePool.includes(trial.geneId)) {
    return null;
  }
  return {
    geneId: trial.geneId,
    offersRemainingAtStart: trial.offersRemaining,
    offersConsumed: 0,
  };
}

/** Guaranteed appearances this run has not spent yet. */
export function genomeV2TrialOffersRemaining(
  state: Pick<GenomeV2State, 'trial'>
): number {
  const trial = state.trial;
  if (!trial) return 0;
  return Math.max(0, trial.offersRemainingAtStart - trial.offersConsumed);
}

/** Collected offers of this run that contained the trial. */
export function genomeV2TrialOffersConsumed(
  state: Pick<GenomeV2State, 'trial'>
): number {
  return state.trial?.offersConsumed ?? 0;
}

function ensureActivePool(state: GenomeV2State, geneId: unknown): asserts geneId is GenomeV2ActiveGeneId {
  if (
    !isGenomeV2ActiveGeneId(geneId) ||
    !state.genePool.includes(geneId)
  ) {
    throw new Error(`Genome v2 gene ${String(geneId)} is not legal for ${state.dynasty}.`);
  }
  // The paired Signature assertion is DELETED with the offer filter above:
  // they were the same rule written twice, and the run-start pool is now the
  // only authority on which Genes an account may acquire.
}

function ensureUnseenDistinctCandidates(
  state: GenomeV2State,
  candidates: readonly GenomeV2ActiveGeneId[]
): void {
  if (new Set(candidates).size !== candidates.length) {
    throw new Error('Genome v2 candidates must be distinct.');
  }
  for (const candidate of candidates) {
    ensureActivePool(state, candidate);
    if (candidate === 'phoenix' && state.externalSecondLife !== null) {
      throw new Error('Genome v2 Phoenix conflicts with the frozen external second life.');
    }
    if (
      Object.values(state.instances).some(
        (instance) => instance.geneId === candidate
      )
    ) {
      throw new Error('Genome v2 offered an already-seen gene.');
    }
  }
}

function expectedInfuseGrowth(actionOrdinal: number): number {
  return GENOME_V2_CONFIG.portalGenome.infuseGrowth[actionOrdinal - 1] ?? 0;
}

function expectedRecodeGrowth(recodeOrdinal: number): number {
  return GENOME_V2_CONFIG.portalGenome.recodeGrowth[
    Math.min(recodeOrdinal - 1, GENOME_V2_CONFIG.portalGenome.recodeGrowth.length - 1)
  ];
}

function spliceParentsInSlot(
  state: GenomeV2State,
  slot: GenomeV2Slot
): GenomeV2GeneInstance[] {
  if (slot.occupant?.kind !== 'splice') return [];
  return slot.occupant.parentInstanceIds
    .map((id) => state.instances[id])
    .filter((instance): instance is GenomeV2GeneInstance => Boolean(instance));
}

function maybeFuseAtSlot(state: GenomeV2State, newInstanceId: string): void {
  if (!state.splicesEnabled) return;
  const added = state.instances[newInstanceId];
  const partners = activeGeneInstances(state).filter(
    (candidate) =>
      candidate.instanceId !== newInstanceId &&
      genomeV2SpliceForPair(candidate.geneId, added.geneId) !== null
  );
  const partner = partners[0];
  if (!partner) return;
  const spliceId = genomeV2SpliceForPair(partner.geneId, added.geneId);
  if (!spliceId) return;
  const partnerSlot = state.slots[partner.slot];
  const addedSlot = state.slots[added.slot];
  partner.status = 'spliced';
  partner.retiredAtFood = state.foodCount;
  added.status = 'spliced';
  added.retiredAtFood = state.foodCount;
  state.retired.push(
    { instanceId: partner.instanceId, reason: 'splice', atFood: state.foodCount, spliceId },
    { instanceId: added.instanceId, reason: 'splice', atFood: state.foodCount, spliceId }
  );
  partnerSlot.occupant = {
    kind: 'splice',
    spliceId,
    parentInstanceIds: [partner.instanceId, added.instanceId],
  };
  addedSlot.occupant = null;
  state.activeSplices.push(spliceId);
  const phoenix = [partner, added].find(
    (instance) => instance.geneId === 'phoenix'
  );
  if (phoenix && state.secondLife?.phoenixInstanceId === phoenix.instanceId) {
    state.secondLife.owner = {
      kind: 'splice',
      spliceId,
      parentInstanceIds: [partner.instanceId, added.instanceId],
      slot: partner.slot,
    };
  }
}

function acquireGene(
  state: GenomeV2State,
  facts: {
    instanceId: string;
    geneId: GenomeV2ActiveGeneId;
    slot: GenomeV2SlotIndex;
    source: GenomeV2GeneSource;
  }
): void {
  ensureActivePool(state, facts.geneId);
  if (state.instances[facts.instanceId]) {
    throw new Error('Genome v2 instance identity was reused.');
  }
  if (
    Object.values(state.instances).some(
      (instance) => instance.geneId === facts.geneId
    )
  ) {
    throw new Error('Genome v2 gene identity cannot recur after acquisition.');
  }
  if (state.slots[facts.slot].occupant !== null) {
    throw new Error('Genome v2 acquisition targeted an occupied slot.');
  }
  state.acquisitionCount += 1;
  const instance: GenomeV2GeneInstance = {
    ...facts,
    acquiredAtFood: state.foodCount,
    acquiredAtTick: state.tick,
    acquiredAtTargetOrdinal: state.eligibleTargetCount,
    acquisitionOrdinal: state.acquisitionCount,
    status: 'active',
    retiredAtFood: null,
    lastCadenceTargetOrdinal: 0,
  };
  state.instances[facts.instanceId] = instance;
  state.slots[facts.slot].occupant = { kind: 'gene', instanceId: facts.instanceId };

  if (facts.geneId === 'phoenix') {
    if (state.secondLife !== null || state.externalSecondLife !== null) {
      throw new Error('Genome v2 permits only one second-life economy.');
    }
    state.secondLife = {
      kind: 'phoenix',
      phoenixInstanceId: facts.instanceId,
      owner: { kind: 'gene', instanceId: facts.instanceId },
      consumed: false,
      consumedAtFood: null,
    };
  }
  if (facts.geneId === 'wall_rush') {
    state.wallRushCharges = GENOME_V2_CONFIG.wallRush.initialCharges;
  }
  maybeFuseAtSlot(state, facts.instanceId);
}

function enqueueContract(
  state: GenomeV2State,
  instance: GenomeV2GeneInstance,
  kind: GenomeV2ExclusiveTargetKind,
  stage: 1 | 2 = 1,
  sealedAreaCells = 0
): void {
  const ordinal = state.targetQueue.length + Object.keys(state.targets).length + 1;
  state.targetQueue.push({
    contractId: `${instance.instanceId}:${kind}:${state.foodCount}:${ordinal}:${stage}`,
    kind,
    sourceInstanceId: instance.instanceId,
    queuedAtFood: state.foodCount,
    ordinal,
    stage,
    sealedAreaCells,
  });
}

/**
 * One target can carry only one exclusive transform. Simultaneous triggers
 * enter this FIFO in acquisition order; later targets consume the remainder.
 */
function enqueueCadenceContractsForTarget(
  state: GenomeV2State,
  targetOrdinal: number
): void {
  const cadenceInstances = Object.values(state.instances)
    .filter((instance) => {
      if (instance.status === 'active') return true;
      if (instance.status !== 'spliced') return false;
      if (instance.geneId === 'gold_trail') {
        return genomeV2HasSplice(state, 'splice_dragon_hoard') ||
          genomeV2HasSplice(state, 'splice_gilded_fork');
      }
      return instance.geneId === 'live_wire' &&
        genomeV2HasSplice(state, 'splice_perfect_circuit');
    })
    .sort((a, b) => a.acquisitionOrdinal - b.acquisitionOrdinal);
  for (const instance of cadenceInstances) {
    const since = targetOrdinal - instance.acquiredAtTargetOrdinal;
    if (since <= 0) continue;
    if (instance.lastCadenceTargetOrdinal === targetOrdinal) continue;
    let queued = false;
    if (instance.geneId === 'gold_trail' && since % GENOME_V2_CONFIG.goldTrail.cadence === 0) {
      enqueueContract(state, instance, 'gold_trail');
      queued = true;
    }
    if (instance.geneId === 'live_wire' && since % GENOME_V2_CONFIG.liveWire.cadence === 0) {
      enqueueContract(
        state,
        instance,
        genomeV2HasSplice(state, 'splice_perfect_circuit')
          ? 'circuit_run'
          : 'live_wire'
      );
      queued = true;
    }
    if (instance.geneId === 'circuit_run' && since % GENOME_V2_CONFIG.circuitRun.cadence === 0) {
      enqueueContract(state, instance, 'circuit_run');
      queued = true;
    }
    if (instance.geneId === 'phase_gate' && since % GENOME_V2_CONFIG.phaseGate.cadence === 0) {
      enqueueContract(state, instance, 'phase_gate');
      queued = true;
    }
    if (queued) instance.lastCadenceTargetOrdinal = targetOrdinal;
  }
}

export interface GenomeV2NextTargetProjection {
  cadenceEligible: boolean;
  eligibleOrdinal: number | null;
  kind: 'ordinary' | GenomeV2ExclusiveTargetKind;
  contract: GenomeV2PendingTargetContract | null;
  requiresForkCell: boolean;
  requiresSecondaryCell: boolean;
  requiresOptionalRouteCells: boolean;
}

/**
 * Pure spawn contract authority. Runtime asks this before choosing geometry;
 * the reducer repeats the same projection before accepting the spawn event.
 */
export function projectGenomeV2NextTarget(
  state: GenomeV2State,
  input: {
    cadenceEligible: boolean;
    /** Missing preserves the already-issued one-cell Gilded Fork. */
    interactionVersion?: GenomeV2InteractionVersion;
  }
): GenomeV2NextTargetProjection {
  if (!input.cadenceEligible) {
    return {
      cadenceEligible: false,
      eligibleOrdinal: null,
      kind: 'ordinary',
      contract: null,
      requiresForkCell: false,
      requiresSecondaryCell: false,
      requiresOptionalRouteCells: false,
    };
  }
  const projected = cloneState(state);
  const eligibleOrdinal = projected.eligibleTargetCount + 1;
  projected.eligibleTargetCount = eligibleOrdinal;
  enqueueCadenceContractsForTarget(projected, eligibleOrdinal);
  const contract = projected.targetQueue[0]
    ? { ...projected.targetQueue[0] }
    : null;
  const kind = contract?.kind ?? 'ordinary';
  return {
    cadenceEligible: true,
    eligibleOrdinal,
    kind,
    contract,
    requiresForkCell:
      input.interactionVersion === GENOME_V2_INTERACTION_PHYSICAL_RELIC &&
      kind === 'gold_trail' &&
      genomeV2HasSplice(state, 'splice_gilded_fork'),
    requiresSecondaryCell: kind === 'circuit_run',
    requiresOptionalRouteCells:
      kind === 'phase_gate' ||
      (kind === 'wall_rush' && genomeV2HasSplice(state, 'splice_riftline')),
  };
}

function contractMoveBudget(
  kind: GenomeV2ExclusiveTargetKind,
  shortestSafeMoves: number,
  speedAtSpawnMs: number
): { moves: number | null; ticks: number | null } {
  switch (kind) {
    case 'gold_trail': {
      const ticks = Math.max(
        1,
        Math.floor(GENOME_V2_CONFIG.goldTrail.realTimeWindowMs / speedAtSpawnMs)
      );
      return { moves: ticks, ticks };
    }
    case 'live_wire':
      return {
        moves: shortestSafeMoves + GENOME_V2_CONFIG.liveWire.routeSlackMoves,
        ticks: null,
      };
    case 'circuit_run':
      return {
        moves: shortestSafeMoves + GENOME_V2_CONFIG.circuitRun.routeSlackMoves,
        ticks: null,
      };
    case 'wall_rush':
      return { moves: GENOME_V2_CONFIG.wallRush.rewardMoveBudget, ticks: null };
    case 'coilkeeper':
    case 'phase_gate':
      return { moves: null, ticks: null };
  }
}

function targetMultiplierBps(
  state: GenomeV2State,
  target: GenomeV2TargetState,
  event: Extract<GenomeV2Event, { type: 'target_resolved' }>
): number {
  const withinBudget =
    target.moveBudget === null || event.movesUsed <= target.moveBudget;
  if (event.resolution !== 'collected') return 0;
  switch (target.kind) {
    case 'ordinary':
      return GENOME_V2_YIELD_SCALE;
    case 'gold_trail':
      if (genomeV2HasSplice(state, 'splice_gilded_fork')) {
        if (target.forkChoice === null) return 0;
        return target.forkChoice === 'gilded'
          ? GENOME_V2_CONFIG.splices.gildedForkMultiplierBps
          : GENOME_V2_YIELD_SCALE;
      }
      return withinBudget
        ? GENOME_V2_CONFIG.goldTrail.multiplierBps
        : GENOME_V2_YIELD_SCALE;
    case 'live_wire':
      return withinBudget
        ? GENOME_V2_CONFIG.liveWire.successMultiplierBps
        : GENOME_V2_CONFIG.liveWire.failureMultiplierBps;
    case 'circuit_run':
      return withinBudget && event.circuitLegsCompleted === 2
        ? genomeV2HasSplice(state, 'splice_perfect_circuit')
          ? GENOME_V2_CONFIG.splices.perfectCircuitMultiplierBps
          : GENOME_V2_CONFIG.circuitRun.successMultiplierBps
        : GENOME_V2_CONFIG.circuitRun.failureMultiplierBps;
    case 'coilkeeper': {
      const tier = [...GENOME_V2_CONFIG.coilkeeper.rewardTiers]
        .reverse()
        .find((entry) => target.sealedAreaCells >= entry.minimumCells);
      const base = tier?.multiplierBps ?? 0;
      return genomeV2HasSplice(state, 'splice_worldcoil')
        ? Math.min(
            GENOME_V2_CONFIG.splices.worldcoilMaximumMultiplierBps,
            base + target.sealedAreaCells * 1_000
          )
        : base;
    }
    case 'wall_rush':
      return withinBudget
        ? genomeV2HasSplice(state, 'splice_riftline')
          ? GENOME_V2_CONFIG.splices.riftlineMultiplierBps
          : GENOME_V2_CONFIG.wallRush.multiplierBps
        : GENOME_V2_YIELD_SCALE;
    case 'phase_gate':
      return event.usedOptionalRoute === true
        ? GENOME_V2_CONFIG.phaseGate.multiplierBps
        : GENOME_V2_YIELD_SCALE;
  }
}

export function genomeV2OvergrowthMultiplierBps(pressureBps: number): number {
  const pressure = Math.min(
    GENOME_V2_CONFIG.overgrowth.maxPressureBps,
    Math.max(0, Math.floor(pressureBps))
  );
  const span =
    GENOME_V2_CONFIG.overgrowth.maxYieldMultiplierBps -
    GENOME_V2_CONFIG.overgrowth.minYieldMultiplierBps;
  return (
    GENOME_V2_CONFIG.overgrowth.minYieldMultiplierBps +
    Math.floor(
      (span * pressure) / GENOME_V2_CONFIG.overgrowth.maxPressureBps
    )
  );
}

function updateDisplayGross(state: GenomeV2State): void {
  const mirrorPotential = genomeV2MultiplyBps(
    state.ledger.mirrorStake,
    GENOME_V2_CONFIG.mirrorWager.bankStakeMultiplierBps
  );
  const treasuryPotential = genomeV2MultiplyBps(
    state.treasuryReserve,
    GENOME_V2_CONFIG.ladders.aurumTreasuryBankBps
  );
  const crownPotential = genomeV2MultiplyBps(
    state.crownBondReserve,
    GENOME_V2_CONFIG.splices.dragonHoardBankBps
  );
  const potential = safeAdd(
    state.ledger.bankableYield,
    safeAdd(
      safeAdd(mirrorPotential, treasuryPotential, 'display reserves'),
      safeAdd(
        crownPotential,
        safeAdd(
          state.loan?.escrowYield ?? 0,
          state.ashenStakeReserve,
          'display deferred contracts'
        ),
        'display contracts'
      ),
      'display liabilities'
    ),
    'display gross'
  );
  state.ledger.displayGrossRaw = Math.max(state.ledger.displayGrossRaw, potential);
}

function applyResolvedTarget(
  state: GenomeV2State,
  target: GenomeV2TargetState,
  event: Extract<GenomeV2Event, { type: 'target_resolved' }>
): void {
  assertSafeInteger(event.baseYield, 'target base Yield');
  assertSafeInteger(event.movesUsed, 'target move count');
  assertSafeInteger(event.pressureBps, 'target pressure');
  if (event.pressureBps > GENOME_V2_YIELD_SCALE) {
    throw new Error('Genome v2 target pressure exceeds 100%.');
  }
  if (event.resolution !== 'collected' && event.baseYield !== 0) {
    throw new Error('Genome v2 unresolved targets cannot carry base Yield.');
  }

  state.ledger.baseYield = safeAdd(
    state.ledger.baseYield,
    event.baseYield,
    'base Yield ledger'
  );
  const exclusiveBps = targetMultiplierBps(state, target, event);
  const exclusiveYield = genomeV2MultiplyBps(event.baseYield, exclusiveBps);
  state.ledger.exclusiveTargetDelta = safeSignedAdd(
    state.ledger.exclusiveTargetDelta,
    exclusiveYield - event.baseYield,
    'exclusive target ledger'
  );

  const overgrowthActive = genomeV2HasGene(state, 'overgrowth') ||
    genomeV2HasSplice(state, 'splice_worldcoil');
  const continuousBps = overgrowthActive
    ? genomeV2OvergrowthMultiplierBps(event.pressureBps)
    : GENOME_V2_YIELD_SCALE;
  let continuousYield = genomeV2MultiplyBps(exclusiveYield, continuousBps);

  const successfulExecution =
    event.resolution === 'collected' &&
    target.kind !== 'ordinary' &&
    exclusiveBps > GENOME_V2_YIELD_SCALE;
  if (
    successfulExecution
    && genomeV2HasLadderTier(state, 'AURUM', GENOME_V2_STRAIN_THRESHOLDS.minor)
  ) {
    const minted = genomeV2MultiplyBps(
      Math.max(0, exclusiveYield - event.baseYield),
      GENOME_V2_CONFIG.ladders.aurumMintBonusBps
    );
    continuousYield = safeAdd(continuousYield, minted, 'AURUM Mint');
  }
  if (target.relayBonusBps > 0 && successfulExecution) {
    continuousYield = genomeV2MultiplyBps(
      continuousYield,
      GENOME_V2_YIELD_SCALE + target.relayBonusBps
    );
  }
  if (target.territoryMultiplierBps > GENOME_V2_YIELD_SCALE) {
    continuousYield = genomeV2MultiplyBps(
      continuousYield,
      target.territoryMultiplierBps
    );
  }
  if (
    successfulExecution &&
    genomeV2HasLadderTier(state, 'FLUX', GENOME_V2_STRAIN_THRESHOLDS.expression) &&
    (event.usedOptionalRoute === true ||
      target.kind === 'wall_rush' ||
      target.kind === 'coilkeeper')
  ) {
    continuousYield = genomeV2MultiplyBps(
      continuousYield,
      GENOME_V2_YIELD_SCALE + GENOME_V2_CONFIG.ladders.fluxRiftcraftBonusBps
    );
  }
  if (
    successfulExecution &&
    genomeV2HasLadderTier(state, 'FLUX', GENOME_V2_STRAIN_THRESHOLDS.apex) &&
    (target.secondaryCell !== null || event.usedOptionalRoute === true)
  ) {
    continuousYield = genomeV2MultiplyBps(
      continuousYield,
      GENOME_V2_YIELD_SCALE + GENOME_V2_CONFIG.ladders.fluxTopologyBonusBps
    );
  }
  if (
    genomeV2HasLadderTier(state, 'FERAL', GENOME_V2_STRAIN_THRESHOLDS.minor)
    && event.pressureBps > 0
  ) {
    const massBonusBps = Math.floor(
      (Math.min(event.pressureBps, GENOME_V2_CONFIG.overgrowth.maxPressureBps) *
        GENOME_V2_CONFIG.ladders.feralMassMaxBonusBps) /
        GENOME_V2_CONFIG.overgrowth.maxPressureBps
    );
    continuousYield = genomeV2MultiplyBps(
      continuousYield,
      GENOME_V2_YIELD_SCALE + massBonusBps
    );
  }
  if (
    state.overclock &&
    event.tick <= state.overclock.expiresAtTick &&
    event.resolution === 'collected'
  ) {
    continuousYield = genomeV2MultiplyBps(
      continuousYield,
      state.overclock.multiplierBps
    );
  }
  if (target.crownRole === 'crown' && event.resolution === 'collected') {
    continuousYield = genomeV2MultiplyBps(
      continuousYield,
      GENOME_V2_CONFIG.signatures.crownStarMultiplierBps
    );
  }
  state.ledger.continuousDelta = safeSignedAdd(
    state.ledger.continuousDelta,
    continuousYield - exclusiveYield,
    'continuous Yield ledger'
  );

  let flowYield = continuousYield;
  if (
    genomeV2HasSplice(state, 'splice_dragon_hoard') &&
    target.kind === 'gold_trail'
  ) {
    if (successfulExecution) {
      const crownBonus = Math.max(0, exclusiveYield - event.baseYield);
      flowYield = Math.max(0, flowYield - crownBonus);
      state.crownBondReserve = safeAdd(
        state.crownBondReserve,
        crownBonus,
        'Dragon Hoard Crown Bond'
      );
    } else {
      state.crownBondReserve = 0;
    }
  }
  if (state.loan && event.resolution === 'collected') {
    const escrowed = genomeV2MultiplyBps(
      flowYield,
      GENOME_V2_CONFIG.loanShark.escrowMultiplierBps
    );
    state.loan.escrowYield = safeAdd(
      state.loan.escrowYield,
      escrowed,
      'Loan escrow'
    );
    state.ledger.loanEscrowDeposited = safeAdd(
      state.ledger.loanEscrowDeposited,
      escrowed,
      'Loan deposits'
    );
    state.loan.foodsRemaining -= 1;
    flowYield = 0;
    if (state.loan.foodsRemaining === 0) {
      flowYield = state.loan.escrowYield;
      state.ledger.loanEscrowReleased = safeAdd(
        state.ledger.loanEscrowReleased,
        flowYield,
        'Loan releases'
      );
      if (genomeV2HasSplice(state, 'splice_ashen_stake')) {
        state.ashenStakeReserve = safeAdd(
          state.ashenStakeReserve,
          flowYield,
          'Ashen Stake reserve'
        );
        flowYield = 0;
      }
      if (
        genomeV2HasLadderTier(
          state,
          'UMBRA',
          GENOME_V2_STRAIN_THRESHOLDS.expression
        )
      ) {
        state.covenantShield = Math.max(
          state.covenantShield,
          genomeV2MultiplyBps(
            state.ledger.loanEscrowReleased,
            GENOME_V2_CONFIG.ladders.umbraCovenantShieldBps
          )
        );
      }
      state.loan = null;
    }
  }

  if (
    genomeV2HasLadderTier(state, 'AURUM', GENOME_V2_STRAIN_THRESHOLDS.apex) &&
    successfulExecution &&
    flowYield > 0
  ) {
    const treasury = genomeV2MultiplyBps(
      flowYield,
      GENOME_V2_CONFIG.ladders.aurumTreasuryDivertBps
    );
    flowYield -= treasury;
    state.treasuryReserve = safeAdd(
      state.treasuryReserve,
      treasury,
      'AURUM Treasury'
    );
  }

  if (state.mirrorLeg && flowYield > 0) {
    const divertedRaw = genomeV2MultiplyBps(
      flowYield,
      GENOME_V2_CONFIG.mirrorWager.divertedYieldBps
    );
    const frozenStake = genomeV2MultiplyBps(
      divertedRaw,
      state.mirrorLeg.frozenCarryBps
    );
    flowYield -= divertedRaw;
    state.ledger.mirrorRawDiverted = safeAdd(
      state.ledger.mirrorRawDiverted,
      divertedRaw,
      'Mirror diverted Yield'
    );
    state.ledger.mirrorStake = safeAdd(
      state.ledger.mirrorStake,
      frozenStake,
      'Mirror frozen Stake'
    );
  }

  state.ledger.bankableYield = safeAdd(
    state.ledger.bankableYield,
    flowYield,
    'bankable Yield'
  );
  state.ledger.currentLegYield = safeAdd(
    state.ledger.currentLegYield,
    flowYield,
    'current leg Yield'
  );

  const collectedUnits = event.collectedUnits ??
    (event.resolution === 'collected' ? 1 : 0);
  if (collectedUnits > 0) {
    state.foodCount += collectedUnits;
    if (genomeV2MechanicEnabled(state, 'coilkeeper')) {
      // constitution-allow: energy-commerce coil technique meter, never Energy or a commercial benefit
      state.coilCharge += collectedUnits;
    }
    let growth = 0;
    if (
      genomeV2HasGene(state, 'overgrowth') ||
      genomeV2HasSplice(state, 'splice_worldcoil')
    ) {
      growth +=
        GENOME_V2_CONFIG.overgrowth.extraGrowthPerFood * collectedUnits;
    }
    if (
      genomeV2HasGene(state, 'time_dilation') &&
      state.foodCount % GENOME_V2_CONFIG.timeDilation.extraGrowthCadence === 0
    ) {
      growth += 1;
      // Time Dilation (catalog GAP-1): its effect is otherwise entirely
      // passive, so the first extra segment — the snake growing when the
      // player did not expect it — is both the Gene's real cost and the moment
      // its rule becomes visible. Counted rather than flagged because the
      // count IS the cost.
      state.timeDilationExtraGrowth = (state.timeDilationExtraGrowth ?? 0) + 1;
      recordGenomeV2LearningEvent(state, 'time_dilation');
    }
    if (
      genomeV2HasSplice(state, 'splice_gilded_fork') &&
      target.kind === 'gold_trail' &&
      target.forkChoice === 'gilded'
    ) {
      growth += GENOME_V2_CONFIG.splices.gildedForkExtraGrowth;
    }
    if (growth > 0) addGenomeBodyGrowth(state, growth);
  }
  if (successfulExecution) {
    state.executionChain += 1;
    if (
      genomeV2HasLadderTier(
        state,
        'VOLT',
        GENOME_V2_STRAIN_THRESHOLDS.expression
      )
    ) {
      state.relayCharges = 1;
    }
  } else if (target.kind !== 'ordinary') {
    state.executionChain = 0;
  }
  if (state.crownWave && event.resolution === 'collected') {
    if (
      state.crownWave.currentTargetIds.includes(target.targetId) &&
      !state.crownWave.completedTargetIds.includes(target.targetId)
    ) {
      state.crownWave.completedTargetIds.push(target.targetId);
    }
  }
  updateDisplayGross(state);
}

function startLoanIfEligible(state: GenomeV2State, portalId: string): void {
  if (!genomeV2MechanicEnabled(state, 'loan_shark') || state.loan !== null) return;
  state.loan = {
    contractId: `loan:${portalId}:${state.foodCount}`,
    startedAtFood: state.foodCount,
    foodsRemaining: GENOME_V2_CONFIG.loanShark.foodsPerContract,
    escrowYield: 0,
  };
}

function armMirrorForNextLeg(
  state: GenomeV2State,
  portalId: string,
  frozenCarryBps: number
): void {
  if (!genomeV2MechanicEnabled(state, 'mirror_wager')) {
    throw new Error('Genome v2 Mirror activation requires Mirror Wager.');
  }
  state.mirrorLeg = {
    portalId,
    frozenCarryBps,
  };
}

function recodeSlot(
  state: GenomeV2State,
  event: {
    instanceId: string;
    replacementGeneId: GenomeV2ActiveGeneId;
    slot: GenomeV2SlotIndex;
    growthCharged: number;
  }
): void {
  const slot = state.slots[event.slot];
  if (!slot?.occupant || slot.occupant.kind === 'ash') {
    throw new Error('Genome v2 Recode requires an occupied non-Ash slot.');
  }
  const expected = expectedRecodeGrowth(state.recodeCount + 1);
  if (event.growthCharged !== expected) {
    throw new Error('Genome v2 Recode growth cost disagrees with its frozen curve.');
  }
  const retiring = slot.occupant.kind === 'gene'
    ? [state.instances[slot.occupant.instanceId]]
    : spliceParentsInSlot(state, slot);
  if (slot.occupant.kind === 'splice') {
    const retiringSpliceId = slot.occupant.spliceId;
    state.activeSplices = state.activeSplices.filter(
      (id) => id !== retiringSpliceId
    );
  }
  for (const instance of retiring) {
    if (!instance) continue;
    instance.status = 'replaced';
    instance.retiredAtFood = state.foodCount;
    state.retired.push({
      instanceId: instance.instanceId,
      reason: 'recode',
      atFood: state.foodCount,
      replacementInstanceId: event.instanceId,
    });
    if (
      state.secondLife?.phoenixInstanceId === instance.instanceId ||
      (state.secondLife?.owner.kind === 'splice' &&
        state.secondLife.owner.parentInstanceIds.includes(instance.instanceId))
    ) {
      state.secondLife = null;
    }
  }
  slot.occupant = null;
  state.recodeCount += 1;
  acquireGene(state, {
    instanceId: event.instanceId,
    geneId: event.replacementGeneId,
    slot: event.slot,
    source: 'recode',
  });
}

/** Apply exactly one canonical event. The input state is never mutated. */
export function reduceGenomeV2Event(
  current: GenomeV2State,
  event: GenomeV2Event
): GenomeV2State {
  if (current.v !== GENOME_RULES_V2) {
    throw new Error('Genome v2 reducer received a non-v2 state.');
  }
  ensureEventEnvelope(current, event);
  const state = cloneState(current);
  state.eventIndex = event.index;
  state.tick = event.tick;
  state.lastBodyGrowthDelta = 0;

  switch (event.type) {
    case 'offer_opened':
      if (state.offer) throw new Error('Genome v2 already has an active offer.');
      if (event.candidates.length !== 2) {
        throw new Error('Genome v2 offer must contain exactly two candidates.');
      }
      ensureUnseenDistinctCandidates(state, event.candidates);
      if (
        event.pinnedGeneId !== undefined &&
        event.pinnedGeneId !== null &&
        (state.anchor.pinnedGeneId !== event.pinnedGeneId ||
          !event.candidates.includes(event.pinnedGeneId))
      ) {
        throw new Error('Genome v2 offer does not honor the anchored candidate.');
      }
      state.offer = {
        offerId: event.offerId,
        source: event.source,
        candidateGeneIds: [...event.candidates],
        openedAtFood: state.foodCount,
        openedAtTick: event.tick,
        pinnedGeneId: event.pinnedGeneId ?? null,
        offerIndex: state.offerCount,
      };
      state.offerCount += 1;
      // Loom Anchor: a pinned candidate DELIVERED into the next offer is the
      // lesson. Pinning is the intent; arrival is the proof.
      if (event.pinnedGeneId) {
        recordGenomeV2LearningEvent(state, 'loom_anchor');
      }
      // The trial guarantee is spent HERE, by a COLLECTED offer that contained
      // it, and never by a run (§4.4). An offer only opens on the player's own
      // relic collection, so an ignored or expired relic reaches this line
      // never. An appearance the ordinary draw produced counts too — the rule
      // is "appeared in three collected offers", not "was forced three times".
      //
      // A run that cannot teach the trial spends nothing even if the ordinary
      // draw shows it, because suppression means the guarantee is not
      // decremented (catalog §5) — the difference between "not taught yet" and
      // "shown three times and never explained".
      if (
        state.trial &&
        event.candidates.includes(state.trial.geneId) &&
        genomeV2TrialTeachable(state, state.trial.geneId)
      ) {
        state.trial.offersConsumed = Math.min(
          GENOME_V2_TRIAL_OFFER_GUARANTEE,
          state.trial.offersConsumed + 1
        );
      }
      break;
    case 'offer_declined':
    case 'offer_expired': {
      if (state.offer?.offerId !== event.offerId) {
        throw new Error('Genome v2 offer resolution does not match the active offer.');
      }
      const resolvedOffer = state.offer;
      let pinnedThisDecline: GenomeV2ActiveGeneId | null = null;
      if (event.type === 'offer_declined' && event.pinGeneId) {
        if (
          resolvedOffer.pinnedGeneId !== null ||
          !resolvedOffer.candidateGeneIds.includes(event.pinGeneId) ||
          !genomeV2MechanicEnabled(state, 'loom_anchor') ||
          state.anchor.charges < 1
        ) {
          throw new Error('Genome v2 atomic Anchor choice is unavailable.');
        }
        state.anchor.charges -= 1;
        state.anchor.pinnedGeneId = event.pinGeneId;
        pinnedThisDecline = event.pinGeneId;
      }
      if (
        event.type === 'offer_declined' &&
        resolvedOffer.pinnedGeneId === null &&
        genomeV2HasGene(state, 'compound_interest')
      ) {
        state.bonds = Math.min(
          GENOME_V2_CONFIG.compoundInterest.maxBonds,
          state.bonds + 1
        );
        // Compound Interest: a deliberate DECLINE minting a Bond. The Bond
        // exists whether the run banks or crashes; a crash simply pays nothing.
        recordGenomeV2LearningEvent(state, 'compound_interest');
      }
      if (
        event.type === 'offer_declined' &&
        pinnedThisDecline &&
        genomeV2HasSplice(state, 'splice_loom_bond')
      ) {
        state.loomBond = { pinnedGeneId: pinnedThisDecline, matured: false };
      }
      if (resolvedOffer.pinnedGeneId !== null) {
        if (state.loomBond?.pinnedGeneId === resolvedOffer.pinnedGeneId) {
          state.loomBond = null;
        }
        state.anchor.pinnedGeneId = null;
      }
      state.offer = null;
      break;
    }
    case 'gene_acquired':
      if (
        state.offer?.offerId !== event.offerId ||
        !state.offer.candidateGeneIds.includes(event.geneId)
      ) {
        throw new Error('Genome v2 acquisition is not one of the immutable candidates.');
      }
      acquireGene(state, event);
      if (state.anchor.pinnedGeneId === event.geneId) {
        state.anchor.pinnedGeneId = null;
        if (state.loomBond?.pinnedGeneId === event.geneId) {
          state.loomBond.matured = true;
        }
      }
      state.offer = null;
      break;
    case 'portal_opened':
      if (state.portal) throw new Error('Genome v2 already has an active portal.');
      if (event.genomeOffer) {
        if (event.genomeOffer.candidates.length !== 2) {
          throw new Error('Genome v2 portal offer must contain exactly two candidates.');
        }
        ensureUnseenDistinctCandidates(state, event.genomeOffer.candidates);
      }
      state.portal = {
        portalId: event.portalId,
        openedAtFood: state.foodCount,
        openedAtTick: event.tick,
        genomeOffer: event.genomeOffer
          ? {
              offerId: event.genomeOffer.offerId,
              candidates: [...event.genomeOffer.candidates],
              offerIndex: state.offerCount,
            }
          : null,
      };
      if (event.genomeOffer) state.offerCount += 1;
      break;
    case 'portal_genome_inspected':
      if (!state.ftue.portalGenomeUnlocked) {
        throw new Error('Genome v2 MUTATE is locked for this run.');
      }
      if (state.portal?.portalId !== event.portalId) {
        throw new Error('Genome v2 MUTATE inspection has no active portal.');
      }
      if (state.portal.genomeOffer !== null) {
        throw new Error('Genome v2 portal already has immutable MUTATE choices.');
      }
      if (event.candidates.length !== 2) {
        throw new Error('Genome v2 MUTATE inspection requires exactly two candidates.');
      }
      ensureUnseenDistinctCandidates(state, event.candidates);
      state.portal.genomeOffer = {
        offerId: event.offerId,
        candidates: [...event.candidates],
        offerIndex: state.offerCount,
      };
      state.offerCount += 1;
      break;
    case 'portal_continued':
    case 'portal_expired':
      if (state.portal?.portalId !== event.portalId) {
        throw new Error('Genome v2 portal outcome does not match the active portal.');
      }
      if (event.type === 'portal_continued' && !state.ftue.continueUnlocked) {
        throw new Error('Genome v2 CONTINUE is locked for this run.');
      }
      state.mirrorLeg = null;
      const mirrorCarryAtDecision = genomeV2CarryBankBps(state.carryPasses);
      state.carryPasses += 1;
      if (event.type === 'portal_continued') {
        if (event.activateMirror) {
          armMirrorForNextLeg(
            state,
            event.portalId,
            mirrorCarryAtDecision
          );
          // Mirror Wager: a CONTINUE freezing a visible Stake. BANK doubles
          // it, a crash loses only the Stake — both outcomes teach the rule.
          recordGenomeV2LearningEvent(state, 'mirror_wager');
        }
        const loanBefore = state.loan;
        startLoanIfEligible(state, event.portalId);
        // Loan Shark: a CONTINUE opening the six-food Escrow contract.
        // Release is success, BANK or a crash before completion is failure,
        // and the catalog resolves on either.
        if (!loanBefore && state.loan) {
          recordGenomeV2LearningEvent(state, 'loan_shark');
        }
        if (genomeV2MechanicEnabled(state, 'loom_anchor')) {
          state.anchor.charges = GENOME_V2_CONFIG.loomAnchor.maximumCharges;
        }
        if (genomeV2MechanicEnabled(state, 'wall_rush')) {
          state.wallRushCharges = GENOME_V2_CONFIG.wallRush.maximumCharges;
        }
      }
      state.ledger.currentLegYield = 0;
      state.portal = null;
      break;
    case 'portal_bank':
      if (state.portal?.portalId !== event.portalId) {
        throw new Error('Genome v2 BANK does not match the active portal.');
      }
      state.mirrorLeg = null;
      state.ledger.currentLegYield = 0;
      state.portal = null;
      break;
    case 'portal_infuse': {
      if (!state.ftue.portalGenomeUnlocked) {
        throw new Error('Genome v2 INFUSE is locked for this run.');
      }
      if (
        state.portal?.portalId !== event.portalId ||
        state.portal.genomeOffer?.offerId !== event.offerId ||
        !state.portal.genomeOffer.candidates.includes(event.geneId)
      ) {
        throw new Error('Genome v2 INFUSE differs from the immutable portal offer.');
      }
      if (state.portalGenomeActions >= GENOME_V2_CONFIG.portalGenome.maxActions) {
        throw new Error('Genome v2 portal Genome action cap exceeded.');
      }
      const ordinal = state.portalGenomeActions + 1;
      if (event.growthCharged !== expectedInfuseGrowth(ordinal)) {
        throw new Error('Genome v2 INFUSE growth cost disagrees with its frozen curve.');
      }
      state.portalGenomeActions = ordinal;
      state.infuseCount += 1;
      addGenomeBodyGrowth(state, event.growthCharged);
      acquireGene(state, {
        instanceId: event.instanceId,
        geneId: event.geneId,
        slot: event.slot,
        source: 'infuse',
      });
      state.mirrorLeg = null;
      state.ledger.currentLegYield = 0;
      state.portal = null;
      break;
    }
    case 'offer_recoded': {
      if (event.source === 'portal' && !state.ftue.portalGenomeUnlocked) {
        throw new Error('Genome v2 portal Recode is locked for this run.');
      }
      const offeredCandidates = event.source === 'loom'
        ? state.offer?.offerId === event.offerId
          ? state.offer.candidateGeneIds
          : null
        : state.portal?.genomeOffer?.offerId === event.offerId
          ? state.portal.genomeOffer.candidates
          : null;
      if (!offeredCandidates?.includes(event.replacementGeneId)) {
        throw new Error('Genome v2 Recode differs from its immutable offer.');
      }
      if (
        event.source === 'loom' &&
        state.slots.some((slot) => slot.occupant === null)
      ) {
        throw new Error('Genome v2 Loom Recode requires all six loci occupied.');
      }
      if (
        event.source === 'portal' &&
        state.portalGenomeActions >= GENOME_V2_CONFIG.portalGenome.maxActions
      ) {
        throw new Error('Genome v2 portal Genome action cap exceeded.');
      }
      recodeSlot(state, event);
      addGenomeBodyGrowth(state, event.growthCharged);
      if (event.source === 'portal') {
        state.portalGenomeActions += 1;
        state.mirrorLeg = null;
        state.ledger.currentLegYield = 0;
        state.portal = null;
      } else {
        state.offer = null;
      }
      break;
    }
    case 'target_spawned': {
      if (state.targets[event.targetId]) {
        throw new Error('Genome v2 target identity was reused.');
      }
      assertSafeInteger(event.speedAtSpawnMs, 'target speed', 1);
      assertSafeInteger(event.shortestSafeMoves, 'target route length');
      const spawnProjection = projectGenomeV2NextTarget(state, {
        cadenceEligible: event.cadenceEligible,
        interactionVersion:
          event.interactionVersion ?? GENOME_V2_INTERACTION_AUTO_OFFER,
      });
      const eligibleOrdinal = spawnProjection.eligibleOrdinal;
      if (eligibleOrdinal !== null) {
        state.eligibleTargetCount = eligibleOrdinal;
        enqueueCadenceContractsForTarget(state, eligibleOrdinal);
      }
      const contract = event.cadenceEligible
        ? state.targetQueue.shift() ?? null
        : null;
      const kind: GenomeV2TargetState['kind'] = spawnProjection.kind;
      if (contract?.contractId !== spawnProjection.contract?.contractId) {
        throw new Error('Genome v2 spawn contract projection diverged.');
      }
      const budget = contract
        ? contractMoveBudget(
            contract.kind,
            event.shortestSafeMoves,
            event.speedAtSpawnMs
          )
        : { moves: null, ticks: null };
      if (
        contract?.kind === 'gold_trail' &&
        genomeV2HasSplice(state, 'splice_gilded_fork')
      ) {
        budget.moves = null;
        budget.ticks = null;
      }
      if (
        contract?.kind === 'circuit_run' &&
        (!event.secondaryCell ||
          (event.secondaryCell.x === event.cell.x &&
            event.secondaryCell.z === event.cell.z))
      ) {
        throw new Error('Genome v2 Circuit requires two distinct visible cells.');
      }
      if (
        contract?.kind !== 'circuit_run' &&
        event.secondaryCell !== undefined &&
        event.secondaryCell !== null
      ) {
        throw new Error('Genome v2 linked target geometry has no Circuit contract.');
      }
      const requiresForkCell = spawnProjection.requiresForkCell;
      if (
        requiresForkCell &&
        (!event.forkCell ||
          (event.forkCell.x === event.cell.x &&
            event.forkCell.z === event.cell.z))
      ) {
        throw new Error(
          'Genome v2 Gilded Fork requires two distinct visible cells.'
        );
      }
      if (
        !requiresForkCell &&
        event.forkCell !== undefined &&
        event.forkCell !== null
      ) {
        throw new Error(
          'Genome v2 fork geometry has no active Gilded Fork contract.'
        );
      }
      const requiresOptionalRoute = spawnProjection.requiresOptionalRouteCells;
      if (
        requiresOptionalRoute &&
        (!event.optionalRouteCells ||
          new Set(
            event.optionalRouteCells.map((cell) => `${cell.x}:${cell.z}`)
          ).size !== 2)
      ) {
        throw new Error('Genome v2 Phase Gate requires distinct entry and exit cells.');
      }
      if (
        !requiresOptionalRoute &&
        event.optionalRouteCells !== undefined &&
        event.optionalRouteCells !== null
      ) {
        throw new Error('Genome v2 optional route geometry has no active Phase Gate contract.');
      }
      const routeKind = contract &&
        ['live_wire', 'circuit_run', 'wall_rush', 'phase_gate'].includes(
          contract.kind
        );
      const relayBonusBps = routeKind && state.relayCharges > 0
        ? GENOME_V2_CONFIG.ladders.voltRelayBonusBps
        : 0;
      if (relayBonusBps > 0) state.relayCharges -= 1;
      let territoryMultiplierBps = GENOME_V2_YIELD_SCALE;
      for (const territory of state.territories) {
        const contains = territory.cells.some(
          (cell) => cell.x === event.cell.x && cell.z === event.cell.z
        );
        if (!contains) continue;
        const candidate = territory.source === 'heartwood'
          ? territory.cells.length >= GENOME_V2_CONFIG.signatures.heartwoodLargeCells
            ? GENOME_V2_CONFIG.signatures.heartwoodLargeMultiplierBps
            : GENOME_V2_CONFIG.signatures.heartwoodBaseMultiplierBps
          : genomeV2HasLadderTier(state, 'FERAL', GENOME_V2_STRAIN_THRESHOLDS.apex)
            ? GENOME_V2_CONFIG.ladders.feralWorldbodyMultiplierBps
            : GENOME_V2_CONFIG.ladders.feralTerritoryMultiplierBps;
        territoryMultiplierBps = Math.max(territoryMultiplierBps, candidate);
      }
      const crownRole = event.crownRole ?? null;
      if (crownRole !== null && !genomeV2HasGene(state, 'constellation_crown')) {
        throw new Error('Genome v2 Crown target role requires the COSMIC signature.');
      }
      state.targets[event.targetId] = {
        targetId: event.targetId,
        eligibleOrdinal,
        contractId: contract?.contractId ?? null,
        kind,
        lifecycle: contract?.stage === 2 ? 'armed' : 'active',
        cell: { ...event.cell },
        forkCell: event.forkCell ? { ...event.forkCell } : null,
        secondaryCell: event.secondaryCell ? { ...event.secondaryCell } : null,
        optionalRouteCells: event.optionalRouteCells
          ? [
              { ...event.optionalRouteCells[0] },
              { ...event.optionalRouteCells[1] },
            ]
          : null,
        spawnTick: event.tick,
        speedAtSpawnMs: event.speedAtSpawnMs,
        shortestSafeMoves: event.shortestSafeMoves,
        sealedAreaCells: contract?.sealedAreaCells ?? 0,
        moveBudget: budget.moves,
        expiresAtTick: budget.ticks === null ? null : event.tick + budget.ticks,
        circuitLegsRequired: contract?.kind === 'circuit_run' ? 2 : 0,
        relayBonusBps,
        territoryMultiplierBps,
        forkChoice: null,
        crownRole,
        edible: crownRole !== 'future',
        collidable: crownRole !== 'future',
        resolvedBaseYield: 0,
      };
      break;
    }
    case 'target_resolved': {
      const target = state.targets[event.targetId];
      if (!target || !['active', 'armed'].includes(target.lifecycle)) {
        throw new Error('Genome v2 target resolution has no active target.');
      }
      if (!target.edible || !target.collidable) {
        throw new Error('Genome v2 future Crown objects cannot be resolved.');
      }
      if (
        target.circuitLegsRequired === 2 &&
        event.circuitLegsCompleted === undefined
      ) {
        throw new Error('Genome v2 Circuit resolution is missing its leg count.');
      }
      if (
        target.circuitLegsRequired === 0 &&
        event.circuitLegsCompleted !== undefined
      ) {
        throw new Error('Genome v2 non-Circuit target cannot claim Circuit legs.');
      }
      if (
        genomeV2HasSplice(state, 'splice_gilded_fork') &&
        target.kind === 'gold_trail' &&
        target.forkChoice === null
      ) {
        throw new Error('Genome v2 Gilded Fork requires an explicit branch.');
      }
      const expectedCollectedUnits = event.resolution === 'collected'
        ? 1
        : target.circuitLegsRequired === 2 &&
            (event.circuitLegsCompleted ?? 0) > 0
          ? 1
          : 0;
      if (
        event.collectedUnits !== undefined &&
        event.collectedUnits !== expectedCollectedUnits
      ) {
        throw new Error('Genome v2 collected-unit fact disagrees with target geometry.');
      }
      const withinBudget =
        target.moveBudget === null || event.movesUsed <= target.moveBudget;
      target.lifecycle = event.resolution === 'expired'
        ? 'expired'
        : event.resolution === 'collected' &&
            withinBudget &&
            (target.circuitLegsRequired === 0 || event.circuitLegsCompleted === 2)
          ? 'completed'
          : 'burnt';
      applyResolvedTarget(state, target, event);
      target.resolvedBaseYield = event.baseYield;
      // Gilded, Live Wire and Circuit targets teach their Gene the moment they
      // reach a terminal lifecycle, in-window or burnt.
      if (
        GENOME_V2_TARGET_LEARNING_KINDS.includes(
          target.kind as GenomeV2ExclusiveTargetKind
        )
      ) {
        recordGenomeV2LearningEvent(
          state,
          target.kind as GenomeV2ActiveGeneId
        );
      }
      // Overgrowth (catalog GAP-2): its growth is shared with every other body
      // mechanic and its Yield folds into a multi-source ledger field, so the
      // attributable moment is the first target collected under enough board
      // pressure that the multiplier has visibly left its floor.
      if (
        genomeV2HasGene(state, 'overgrowth') &&
        event.pressureBps >= GENOME_V2_CONFIG.overgrowth.learningPressureBps
      ) {
        recordGenomeV2LearningEvent(state, 'overgrowth');
      }
      compactResolvedTargets(state);
      break;
    }
    case 'target_window_expired': {
      const target = state.targets[event.targetId];
      if (!target || target.lifecycle !== 'active' || target.kind !== 'gold_trail') {
        throw new Error('Genome v2 Gold window expiry has no active Gilded target.');
      }
      if (genomeV2HasSplice(state, 'splice_gilded_fork')) {
        throw new Error('Genome v2 Gilded Fork has no timer to expire.');
      }
      if (genomeV2HasSplice(state, 'splice_dragon_hoard')) {
        state.crownBondReserve = 0;
      }
      // Gold Trail's premium window expiring unclaimed is the failure half of
      // its lesson, and resolves it exactly as a collection does.
      recordGenomeV2LearningEvent(state, 'gold_trail');
      target.kind = 'ordinary';
      target.contractId = null;
      target.moveBudget = null;
      target.expiresAtTick = null;
      break;
    }
    case 'gilded_fork_chosen': {
      if (!genomeV2GildedForkChoiceAvailable(state, event.targetId)) {
        throw new Error('Genome v2 Gilded Fork choice is unavailable.');
      }
      state.targets[event.targetId].forkChoice = event.choice;
      break;
    }
    case 'coil_sealed':
      if (
        !genomeV2MechanicEnabled(state, 'coilkeeper') ||
        state.coilCharge < GENOME_V2_CONFIG.coilkeeper.chargeFoods ||
        event.cells.length < GENOME_V2_CONFIG.coilkeeper.minimumSealedCells ||
        state.permanentTerrain.some((fact) => fact.terrainId === event.terrainId) ||
        new Set(event.cells.map((cell) => `${cell.x}:${cell.z}`)).size !==
          event.cells.length
      ) {
        throw new Error('Genome v2 Coilkeeper seal is not charged or large enough.');
      }
      state.coilCharge = 0;
      state.permanentTerrain.push({
        terrainId: event.terrainId,
        source: 'coilkeeper_seal',
        cells: event.cells.map((cell) => ({ ...cell })),
        createdAtFood: state.foodCount,
        permanent: true,
      });
      {
        const instance = mechanicInstance(state, 'coilkeeper');
        if (instance) {
          enqueueContract(
            state,
            instance,
            'coilkeeper',
            1,
            event.cells.length
          );
        }
      }
      // Coilkeeper: the seal itself is the lesson; the empowered target that
      // follows it is the payoff.
      recordGenomeV2LearningEvent(state, 'coilkeeper');
      break;
    case 'phase_gate_used':
      if (
        !genomeV2PhaseGateAvailable(state, event.targetId, event.cells) ||
        state.permanentTerrain.some((fact) => fact.terrainId === event.terrainId)
      ) {
        throw new Error('Genome v2 Phase Gate use is invalid.');
      }
      state.permanentTerrain.push({
        terrainId: event.terrainId,
        source: 'phase_gate_scar',
        cells: event.cells.map((cell) => ({ ...cell })),
        createdAtFood: state.foodCount,
        permanent: true,
        // The Scar forms before it bites (E'). Converted at the tick rate the
        // DOOR was priced at - the target's own `speedAtSpawnMs` - because
        // the door and its Scar are one contract, and because a reducer that
        // reached for a live speed would stop being a pure fold over the
        // journal. Permanent as it ever was: forming delays lethality, it
        // never takes a cell back (R15).
        formingFromTick: event.tick,
        formingTotalTicks: formingTicksForSeconds(
          GENOME_V2_CONFIG.phaseGate.scarFormingSeconds,
          state.targets[event.targetId]?.speedAtSpawnMs ?? 0
        ),
      });
      // Phase Gate: taking the shortcut is the lesson; the Scar is its cost.
      recordGenomeV2LearningEvent(state, 'phase_gate');
      break;
    case 'wall_redirected': {
      const instance = state.instances[event.sourceInstanceId];
      if (
        !instance ||
        !['active', 'spliced'].includes(instance.status) ||
        instance.geneId !== 'wall_rush' ||
        !genomeV2MechanicEnabled(state, 'wall_rush') ||
        state.wallRushCharges < 1
      ) {
        throw new Error('Genome v2 wall redirect has no active Wall Rush source.');
      }
      state.wallRushCharges -= 1;
      enqueueContract(state, instance, 'wall_rush');
      // Wall Rush: an armed impact redirecting along its previewed tangent.
      // A missed route still spends the charge and still teaches the rule.
      recordGenomeV2LearningEvent(state, 'wall_rush');
      break;
    }
    case 'territory_claimed': {
      assertSafeInteger(event.recoveryExitCount, 'territory recovery exits', 1);
      const minimumCells = event.source === 'heartwood'
        ? GENOME_V2_CONFIG.signatures.heartwoodMinimumCells
        : GENOME_V2_CONFIG.coilkeeper.minimumSealedCells;
      const uniqueCells = new Set(event.cells.map((cell) => `${cell.x}:${cell.z}`));
      if (
        !event.territoryId ||
        state.territories.some((entry) => entry.territoryId === event.territoryId) ||
        uniqueCells.size !== event.cells.length ||
        event.cells.length < minimumCells ||
        (event.source === 'heartwood'
          ? !genomeV2HasGene(state, 'heartwood')
          : !genomeV2HasLadderTier(
              state,
              'FERAL',
              GENOME_V2_STRAIN_THRESHOLDS.expression
            ))
      ) {
        throw new Error('Genome v2 territory claim is not a legal recovered coil.');
      }
      state.territories.push({
        territoryId: event.territoryId,
        source: event.source,
        cells: event.cells.map((cell) => ({ ...cell })),
        createdAtFood: state.foodCount,
        recoveryExitCount: event.recoveryExitCount,
      });
      // Heartwood: deliberate body geometry claiming territory. The FERAL
      // ladder claims the same shape without teaching the Signature, so only
      // the Heartwood source resolves.
      if (event.source === 'heartwood') {
        recordGenomeV2LearningEvent(state, 'heartwood');
      }
      break;
    }
    case 'overclock_started': {
      if (state.overclock) {
        throw new Error('Genome v2 already has an active Overclock window.');
      }
      const zenith = event.source === 'zenith_protocol';
      if (
        (zenith && !genomeV2HasGene(state, 'zenith_protocol')) ||
        (!zenith && !genomeV2HasLadderTier(
          state,
          'VOLT',
          GENOME_V2_STRAIN_THRESHOLDS.apex
        ))
      ) {
        throw new Error('Genome v2 Overclock source is not unlocked.');
      }
      const budget = zenith
        ? GENOME_V2_CONFIG.signatures.zenithMoveBudget
        : GENOME_V2_CONFIG.ladders.voltOverclockMoveBudget;
      state.overclock = {
        activationId: event.activationId,
        source: event.source,
        startedAtTick: event.tick,
        expiresAtTick: event.tick + budget,
        multiplierBps: zenith
          ? GENOME_V2_CONFIG.signatures.zenithMultiplierBps
          : GENOME_V2_CONFIG.ladders.voltOverclockMultiplierBps,
        speedMultiplierBps: zenith
          ? GENOME_V2_CONFIG.signatures.zenithSpeedMultiplierBps
          : GENOME_V2_CONFIG.ladders.voltOverclockSpeedMultiplierBps,
      };
      // Zenith Protocol: an overclock window opening. A mistimed window still
      // teaches what the Signature does, so opening is the whole event.
      if (zenith) recordGenomeV2LearningEvent(state, 'zenith_protocol');
      break;
    }
    case 'overclock_ended':
      if (state.overclock?.activationId !== event.activationId) {
        throw new Error('Genome v2 Overclock end does not match its active window.');
      }
      state.overclock = null;
      break;
    case 'crown_wave_opened': {
      const refusal = genomeV2CrownWaveBindingRefusal(
        state,
        event.currentTargetIds
      );
      if (refusal) throw new Error(refusal);
      const futureKeys = event.futureCells.map((cell) => `${cell.x}:${cell.z}`);
      if (new Set(futureKeys).size !== futureKeys.length) {
        throw new Error('Genome v2 Crown future stars must occupy distinct cells.');
      }
      for (const cell of event.futureCells) {
        // Only a LIVE preview can be this wave's future Star. Closing a wave
        // expires its previews in place (they keep `crownRole: 'future'`) and
        // they linger until compaction, so counting resolved objects here made
        // a later wave ambiguous - and fatal - merely because the board reused
        // a cell a dead preview once occupied.
        const matches = Object.values(state.targets).filter(
          (target) =>
            target.crownRole === 'future' &&
            ['active', 'armed'].includes(target.lifecycle) &&
            !target.edible &&
            !target.collidable &&
            target.cell.x === cell.x &&
            target.cell.z === cell.z
        );
        if (matches.length !== 1) {
          throw new Error('Genome v2 Crown future star geometry is ambiguous.');
        }
      }
      if (event.crownStarTargetId) {
        const crown = state.targets[event.crownStarTargetId];
        if (
          !crown ||
          crown.crownRole !== 'crown' ||
          !event.currentTargetIds.includes(event.crownStarTargetId)
        ) {
          throw new Error('Genome v2 Crown Star is not an active wave target.');
        }
      }
      state.crownWave = {
        waveId: event.waveId,
        currentTargetIds: [...event.currentTargetIds],
        futureCells: event.futureCells.map((cell) => ({ ...cell })),
        crownStarTargetId: event.crownStarTargetId ?? null,
        completedTargetIds: [],
      };
      break;
    }
    case 'crown_target_activated': {
      if (state.crownWave?.waveId !== event.waveId) {
        throw new Error('Genome v2 Crown activation has no active wave.');
      }
      const target = state.targets[event.targetId];
      if (!target || target.crownRole !== 'future' || target.edible || target.collidable) {
        throw new Error('Genome v2 Crown future target cannot be activated.');
      }
      target.crownRole = event.role;
      target.edible = true;
      target.collidable = true;
      if (!state.crownWave.currentTargetIds.includes(event.targetId)) {
        state.crownWave.currentTargetIds.push(event.targetId);
      }
      if (event.role === 'crown') {
        state.crownWave.crownStarTargetId = event.targetId;
      }
      break;
    }
    case 'crown_wave_closed': {
      const wave = state.crownWave;
      if (!wave || wave.waveId !== event.waveId) {
        throw new Error('Genome v2 Crown wave close has no active wave.');
      }
      const perfect = wave.currentTargetIds.every(
        (targetId) => wave.completedTargetIds.includes(targetId)
      );
      if (event.outcome === 'perfect' && !perfect) {
        throw new Error('Genome v2 Crown wave is not a perfect clear.');
      }
      if (event.outcome === 'failed' && perfect) {
        throw new Error('Genome v2 completed Crown wave cannot be failed.');
      }
      if (event.outcome === 'perfect') {
        const base = wave.currentTargetIds.reduce(
          (sum, targetId) => safeAdd(
            sum,
            state.targets[targetId]?.resolvedBaseYield ?? 0,
            'Crown clear base'
          ),
          0
        );
        const total = genomeV2MultiplyBps(
          base,
          GENOME_V2_CONFIG.signatures.crownPerfectClearMultiplierBps
        );
        const bonus = Math.max(0, total - base);
        state.ledger.bankableYield = safeAdd(
          state.ledger.bankableYield,
          bonus,
          'Crown perfect clear'
        );
        state.ledger.currentLegYield = safeAdd(
          state.ledger.currentLegYield,
          bonus,
          'Crown current leg'
        );
        state.ledger.continuousDelta = safeSignedAdd(
          state.ledger.continuousDelta,
          bonus,
          'Crown ledger'
        );
      }
      for (const target of Object.values(state.targets)) {
        if (
          target.crownRole === 'future' ||
          (wave.currentTargetIds.includes(target.targetId) &&
            ['active', 'armed'].includes(target.lifecycle))
        ) {
          target.lifecycle = 'expired';
          target.edible = false;
          target.collidable = false;
        }
      }
      state.crownWave = null;
      // Constellation Crown: a wave closing. `perfect` and `failed` BOTH
      // resolve — the clearest failure-teaches case in the roster.
      recordGenomeV2LearningEvent(state, 'constellation_crown');
      updateDisplayGross(state);
      break;
    }
    case 'phoenix_triggered': {
      const life = state.secondLife;
      if (
        !life ||
        life.consumed ||
        life.phoenixInstanceId !== event.sourceInstanceId
      ) {
        throw new Error('Genome v2 Phoenix is unavailable or already consumed.');
      }
      life.consumed = true;
      life.consumedAtFood = state.foodCount;
      // Phoenix: the second life being consumed. There is no failure mode —
      // firing is the lesson.
      recordGenomeV2LearningEvent(state, 'phoenix');
      const consumedMirrorStake = genomeV2HasSplice(
        state,
        'splice_styx_contract'
      )
        ? state.ledger.mirrorStake
        : 0;
      const consumedAshenStake = genomeV2HasSplice(
        state,
        'splice_ashen_stake'
      )
        ? state.ashenStakeReserve
        : 0;
      if (consumedMirrorStake > 0) state.ledger.mirrorStake = 0;
      if (consumedAshenStake > 0) state.ashenStakeReserve = 0;
      state.lastPhoenixEffect = {
        rewindSegments: GENOME_V2_CONFIG.phoenix.rewindSegments,
        phaseTicks:
          GENOME_V2_CONFIG.phoenix.phaseTicks +
          (genomeV2HasLadderTier(
            state,
            'UMBRA',
            GENOME_V2_STRAIN_THRESHOLDS.apex
          )
            ? GENOME_V2_CONFIG.ladders.umbraAfterlifeExtraPhaseTicks
            : 0),
        growth: GENOME_V2_CONFIG.phoenix.growthCost,
        consumedMirrorStake,
        consumedAshenStake,
      };
      addGenomeBodyGrowth(state, GENOME_V2_CONFIG.phoenix.growthCost);
      const phoenix = state.instances[life.phoenixInstanceId];
      phoenix.status = 'ash';
      phoenix.retiredAtFood = state.foodCount;
      state.retired.push({
        instanceId: phoenix.instanceId,
        reason: 'phoenix',
        atFood: state.foodCount,
      });
      let ashSlot = phoenix.slot;
      if (life.owner.kind === 'splice') {
        ashSlot = life.owner.slot;
        const consumedSpliceId = life.owner.spliceId;
        state.activeSplices = state.activeSplices.filter(
          (id) => id !== consumedSpliceId
        );
        for (const parentId of life.owner.parentInstanceIds) {
          if (parentId === phoenix.instanceId) continue;
          const partner = state.instances[parentId];
          partner.status = 'replaced';
          partner.retiredAtFood = state.foodCount;
          state.retired.push({
            instanceId: partner.instanceId,
            reason: 'splice_consumed',
            atFood: state.foodCount,
          });
        }
      }
      state.slots[ashSlot].occupant = {
        kind: 'ash',
        sourceInstanceId: phoenix.instanceId,
      };
      break;
    }
    default:
      throw new Error(
        `Genome v2 event type ${String((event as { type?: unknown }).type)} is unknown.`
      );
  }

  captureGenomeV2DiscoveryHistory(state);
  state.journal.push(event);
  compactJournal(state);
  return state;
}

export function reduceGenomeV2Events(
  initial: GenomeV2State,
  events: readonly GenomeV2Event[]
): GenomeV2State {
  return events.reduce(reduceGenomeV2Event, initial);
}

/** Exact v2 BANK Carry: p0..p5 compound; each later pass adds +0.40. */
export function genomeV2CarryBankBps(passes: number): number {
  const p = Math.max(0, Math.floor(passes));
  const compoundPasses = Math.min(
    p,
    GENOME_V2_CONFIG.carry.compoundThroughPass
  );
  let numerator = BigInt(GENOME_V2_YIELD_SCALE);
  let denominator = BigInt(1);
  for (let index = 0; index <= compoundPasses; index += 1) {
    numerator *= BigInt(GENOME_V2_CONFIG.carry.bankStepBps);
    denominator *= BigInt(GENOME_V2_YIELD_SCALE);
  }
  let value = Number(numerator / denominator);
  if (p > GENOME_V2_CONFIG.carry.compoundThroughPass) {
    value = safeAdd(
      value,
      (p - GENOME_V2_CONFIG.carry.compoundThroughPass) *
        GENOME_V2_CONFIG.carry.linearStepAfterPassFiveBps,
      'Carry bank multiplier'
    );
  }
  return value;
}

/** Exact v2 salvage Carry: .35 + .65 × .6^p, represented in BPS. */
export function genomeV2CarrySalvageBps(passes: number): number {
  const p = Math.max(0, Math.floor(passes));
  const floor = GENOME_V2_CONFIG.carry.salvageFloorBps;
  let numerator = BigInt(GENOME_V2_YIELD_SCALE - floor);
  let denominator = BigInt(1);
  for (let index = 0; index < p; index += 1) {
    numerator *= BigInt(GENOME_V2_CONFIG.carry.salvageDecayBps);
    denominator *= BigInt(GENOME_V2_YIELD_SCALE);
  }
  return floor + Number(numerator / denominator);
}

export interface GenomeV2SettlementBreakdown {
  v: typeof GENOME_RULES_V2;
  terminal: 'bank' | 'crash';
  baseYield: number;
  exclusiveTargetDelta: number;
  continuousDelta: number;
  loanEscrowDeposited: number;
  loanEscrowReleased: number;
  loanEscrowForfeited: number;
  bankableBeforeOutcome: number;
  bondCount: number;
  bondBonus: number;
  ladderDividendBonus: number;
  loomBondBonus: number;
  treasuryReserve: number;
  treasuryPaid: number;
  treasuryForfeited: number;
  crownBondReserve: number;
  crownBondPaid: number;
  crownBondForfeited: number;
  ashenStakeReserve: number;
  ashenStakePaid: number;
  ashenStakeForfeited: number;
  covenantShieldPaid: number;
  mirrorRawDiverted: number;
  mirrorStakeFrozen: number;
  mirrorStakePaid: number;
  mirrorStakeForfeited: number;
  carryPasses: number;
  carryMultiplierBps: number;
  carryYield: number;
  genomeYield: number;
  /** Category eligible for later Ascendance and Energy multipliers. */
  harvestEligibleYield: number;
  /** Fixed achievements/unlocks/etc. are intentionally absent. */
  ineligibleFixedRewards: 0;
}

export function settleGenomeV2(
  state: GenomeV2State,
  terminal: 'bank' | 'crash'
): GenomeV2SettlementBreakdown {
  const bankable = state.ledger.bankableYield;
  const loanForfeited = state.loan?.escrowYield ?? 0;
  const mirrorStake = state.ledger.mirrorStake;
  const bondBonus = terminal === 'bank'
    ? genomeV2MultiplyBps(
        bankable,
        state.bonds * GENOME_V2_CONFIG.compoundInterest.bankBonusPerBondBps
      )
    : 0;
  const ladderDividendBonus = terminal === 'bank' &&
    genomeV2HasLadderTier(
      state,
      'AURUM',
      GENOME_V2_STRAIN_THRESHOLDS.expression
    )
    ? genomeV2MultiplyBps(
        bankable,
        Math.min(
          state.executionChain,
          GENOME_V2_CONFIG.ladders.aurumDividendMaxChains
        ) * GENOME_V2_CONFIG.ladders.aurumDividendPerChainBps
      )
    : 0;
  const loomBondBonus = terminal === 'bank' && state.loomBond?.matured
    ? genomeV2MultiplyBps(
        bankable,
        GENOME_V2_CONFIG.splices.loomBondBankBonusBps
      )
    : 0;
  const ashenStakePaid = terminal === 'bank' ? state.ashenStakeReserve : 0;
  const mirrorPaid = terminal === 'bank'
    ? genomeV2MultiplyBps(
        mirrorStake,
        GENOME_V2_CONFIG.mirrorWager.bankStakeMultiplierBps
      )
    : 0;
  const preCarry = terminal === 'bank'
    ? safeAdd(
        safeAdd(
          safeAdd(bankable, bondBonus, 'BANK Bonds'),
          ladderDividendBonus,
          'BANK Dividend'
        ),
        safeAdd(loomBondBonus, ashenStakePaid, 'BANK deferred reserves'),
        'BANK pre-Carry'
      )
    : bankable;
  const carryMultiplierBps = terminal === 'bank'
    ? genomeV2CarryBankBps(state.carryPasses)
    : genomeV2CarrySalvageBps(state.carryPasses);
  const carryAppliedYield = genomeV2MultiplyBps(
    preCarry,
    carryMultiplierBps
  );
  const treasuryPaid = terminal === 'bank'
    ? genomeV2MultiplyBps(
        state.treasuryReserve,
        GENOME_V2_CONFIG.ladders.aurumTreasuryBankBps
      )
    : 0;
  const crownBondPaid = terminal === 'bank'
    ? genomeV2MultiplyBps(
        state.crownBondReserve,
        GENOME_V2_CONFIG.splices.dragonHoardBankBps
      )
    : 0;
  const forfeitableRisk = safeAdd(
    safeAdd(mirrorStake, loanForfeited, 'crash visible risk'),
    safeAdd(
      state.treasuryReserve,
      safeAdd(
        state.crownBondReserve,
        state.ashenStakeReserve,
        'crash deferred risk'
      ),
      'crash reserves'
    ),
    'crash total risk'
  );
  const covenantShieldPaid = terminal === 'crash'
    ? Math.min(state.covenantShield, forfeitableRisk)
    : 0;
  const genomeYield = terminal === 'bank'
    ? safeAdd(
        safeAdd(carryAppliedYield, mirrorPaid, 'BANK frozen Mirror'),
        safeAdd(treasuryPaid, crownBondPaid, 'BANK ladder and Splice reserves'),
        'BANK total Genome Yield'
      )
    : safeAdd(carryAppliedYield, covenantShieldPaid, 'crash Covenant shield');
  return {
    v: GENOME_RULES_V2,
    terminal,
    baseYield: state.ledger.baseYield,
    exclusiveTargetDelta: state.ledger.exclusiveTargetDelta,
    continuousDelta: state.ledger.continuousDelta,
    loanEscrowDeposited: state.ledger.loanEscrowDeposited,
    loanEscrowReleased: state.ledger.loanEscrowReleased,
    loanEscrowForfeited: loanForfeited,
    bankableBeforeOutcome: bankable,
    bondCount: state.bonds,
    bondBonus,
    ladderDividendBonus,
    loomBondBonus,
    treasuryReserve: state.treasuryReserve,
    treasuryPaid,
    treasuryForfeited: terminal === 'crash' ? state.treasuryReserve : 0,
    crownBondReserve: state.crownBondReserve,
    crownBondPaid,
    crownBondForfeited: terminal === 'crash' ? state.crownBondReserve : 0,
    ashenStakeReserve: state.ashenStakeReserve,
    ashenStakePaid,
    ashenStakeForfeited: terminal === 'crash' ? state.ashenStakeReserve : 0,
    covenantShieldPaid,
    mirrorRawDiverted: state.ledger.mirrorRawDiverted,
    mirrorStakeFrozen: mirrorStake,
    mirrorStakePaid: mirrorPaid,
    mirrorStakeForfeited: terminal === 'crash' ? mirrorStake : 0,
    carryPasses: state.carryPasses,
    carryMultiplierBps,
    carryYield: carryAppliedYield - preCarry,
    genomeYield,
    harvestEligibleYield: genomeYield,
    ineligibleFixedRewards: 0,
  };
}

export interface TacticalLoomCandidateDelta {
  geneId: GenomeV2ActiveGeneId;
  category:
    | 'yield'
    | 'banking'
    | 'execution'
    | 'body'
    | 'terrain'
    | 'survival'
    | 'genome';
  strainDelta: StrainPoints;
  resultingStrainPoints: StrainPoints;
  unlockDistance: Partial<Record<StrainId, {
    minor: number;
    expression: number;
    apex: number;
  }>>;
  completesSplice: GenomeV2SpliceId | null;
  occupiesSlot: boolean;
  requiresReplacement: boolean;
  /** Exact THREAD result when an empty locus exists. Null means the player
   * must choose one of the per-locus Recode outcomes below. */
  resultingSlots: TacticalLoomSlotProjection[] | null;
  resultingActiveSplices: GenomeV2SpliceId[] | null;
  projectedPortalActionGrowth: { infuse: number | null; recode: number | null };
  projectedYieldRule: string;
  strategicCost: string;
  availability: {
    legal: boolean;
    blockedReason: 'external_second_life' | null;
  };
  splicePaths: TacticalLoomSplicePath[];
  targetProjection: {
    currentlyQueued: number;
    addedImmediately: 0;
    trigger: 'cadence' | 'event' | 'none';
    cadence: number | null;
    multiplierBps: number | null;
    routeSlackMoves: number | null;
  };
  bodyProjection: {
    growthOnAcquire: 0;
    extraGrowthPerFood: number;
    extraGrowthCadence: number | null;
    growthOnTrigger: number;
  };
  terrainProjection: {
    currentPermanentFacts: number;
    currentPermanentCells: number;
    createsPermanentTerrain: boolean;
    cellsPerUse: number | null;
    minimumCellsPerUse: number | null;
  };
  outcomeProjection: {
    /** Accepting a Loom gene has no retroactive economic effect. */
    immediateBankDelta: 0;
    immediateCrashDelta: 0;
    bankNow: GenomeV2SettlementBreakdown;
    crashNow: GenomeV2SettlementBreakdown;
  };
  dynastyProjection: {
    dynasty: DynastyName;
    relation: 'signature' | 'favored' | 'universal';
    legal: boolean;
  };
  /** Exact per-locus consequence when all six loci are occupied. Ash is shown
   * as a deliberate non-option rather than silently omitted. */
  replacementOptions: TacticalLoomReplacementDelta[];
}

export interface TacticalLoomSplicePath {
  spliceId: GenomeV2SpliceId;
  partnerGeneId: GenomeV2ActiveGeneId;
  state:
    | 'completes_now'
    | 'closed_by_completion'
    | 'one_gene_away'
    | 'depends_on_recode'
    | 'unavailable';
  unlocked: boolean;
  blockedReason: 'splices_locked' | null;
}

export interface TacticalLoomSlotProjection {
  index: GenomeV2SlotIndex;
  occupant:
    | null
    | { kind: 'gene'; geneId: GenomeV2ActiveGeneId }
    | {
        kind: 'splice';
        spliceId: GenomeV2SpliceId;
        parentGeneIds: readonly [
          GenomeV2ActiveGeneId,
          GenomeV2ActiveGeneId,
        ];
      }
    | { kind: 'ash' };
}

export interface TacticalLoomReplacementDelta {
  slot: GenomeV2SlotIndex;
  allowed: boolean;
  blockedReason: 'ash_is_permanent' | null;
  growthCost: number;
  removedGeneIds: GenomeV2ActiveGeneId[];
  removedStrains: StrainId[];
  addedStrains: StrainId[];
  resultingStrainPoints: StrainPoints;
  breaksSplice: GenomeV2SpliceId | null;
  createsSplice: GenomeV2SpliceId | null;
  resultingSlots: TacticalLoomSlotProjection[];
  resultingActiveSplices: GenomeV2SpliceId[];
  losesSecondLife: boolean;
  /** Recode changes the locus, never already-earned economic obligations. */
  retainedLiabilities: {
    bonds: number;
    loanEscrow: number;
    loanFoodsRemaining: number;
    mirrorStake: number;
  };
}

export interface TacticalLoomModel {
  v: typeof GENOME_RULES_V2;
  dynasty: DynastyName;
  slots: GenomeV2Slot[];
  strainPoints: StrainPoints;
  ladder: typeof GENOME_V2_STRAIN_LADDERS;
  ladderState: Readonly<Record<StrainId, GenomeV2LadderProjection>>;
  activeSplices: GenomeV2SpliceId[];
  offer: {
    offerId: string;
    source: GenomeV2OfferState['source'];
    openedAtFood: number;
    openedAtTick: number;
    offerIndex: number;
    candidateGeneIds: GenomeV2ActiveGeneId[];
  } | null;
  decline: {
    available: boolean;
    forfeitedCandidateGeneIds: GenomeV2ActiveGeneId[];
    bondBefore: number;
    bondAfter: number;
    bondDelta: number;
    anchorCanPinBeforeDecline: boolean;
    anchorChargesBefore: number;
    anchorChargesAfterPin: number;
    pinnedGeneId: GenomeV2ActiveGeneId | null;
    options: TacticalLoomDeclineOption[];
  };
  liabilities: {
    carryPasses: number;
    bankMultiplierBps: number;
    salvageMultiplierBps: number;
    bonds: number;
    loanEscrow: number;
    loanFoodsRemaining: number;
    mirrorStake: number;
    mirrorLegFrozenCarryBps: number | null;
    phoenixAvailable: boolean;
    externalSecondLife: GenomeV2State['externalSecondLife'];
    treasuryReserve: number;
    covenantShield: number;
    crownBondReserve: number;
    ashenStakeReserve: number;
  };
  runtime: {
    bodyGrowthAdded: number;
    lastBodyGrowthDelta: number;
    wallRushCharges: number;
    executionChain: number;
    relayCharges: number;
    overclock: GenomeV2OverclockState | null;
    permanentTerrainFacts: number;
    permanentTerrainCells: number;
    territories: number;
    crownWave: GenomeV2CrownWaveState | null;
  };
  candidates: TacticalLoomCandidateDelta[];
}

export interface GenomeV2LadderProjection {
  strain: StrainId;
  points: number;
  suppressed: boolean;
  activeTier: 0 | GenomeV2StrainThreshold;
  tiers: Array<GenomeV2StrainLadderTier & {
    effectivePoints: number;
    active: boolean;
  }>;
}

export function projectGenomeV2Ladders(
  state: GenomeV2State
): Readonly<Record<StrainId, GenomeV2LadderProjection>> {
  const points = genomeV2StrainPoints(state);
  return Object.fromEntries(
    STRAIN_IDS.map((strain) => {
      const value = points[strain] ?? 0;
      const activeTier = genomeV2HasLadderTier(
        state,
        strain,
        GENOME_V2_STRAIN_THRESHOLDS.apex
      )
        ? GENOME_V2_STRAIN_THRESHOLDS.apex
        : genomeV2HasLadderTier(
            state,
            strain,
            GENOME_V2_STRAIN_THRESHOLDS.expression
          )
          ? GENOME_V2_STRAIN_THRESHOLDS.expression
          : genomeV2HasLadderTier(
              state,
              strain,
              GENOME_V2_STRAIN_THRESHOLDS.minor
            )
            ? GENOME_V2_STRAIN_THRESHOLDS.minor
            : 0;
      return [strain, {
        strain,
        points: value,
        suppressed: state.suppressedStrains.includes(strain),
        activeTier,
        tiers: GENOME_V2_STRAIN_LADDERS[strain].map((tier) => ({
          ...tier,
          effectivePoints: genomeV2EffectiveStrainThreshold(
            state,
            strain,
            tier.points
          ),
          active: genomeV2HasLadderTier(state, strain, tier.points),
        })),
      }];
    })
  ) as unknown as Readonly<Record<StrainId, GenomeV2LadderProjection>>;
}

export interface TacticalLoomDeclineOption {
  id: string;
  label: string;
  pinGeneId: GenomeV2ActiveGeneId | null;
  anchorChargesAfter: number;
  bondAfter: number;
  loomBondAfter: GenomeV2LoomBondState | null;
  slotsAfter: GenomeV2Slot[];
  strainPointsAfter: StrainPoints;
  targetQueueAfter: number;
  bodyGrowthAddedAfter: number;
  bankAfter: GenomeV2SettlementBreakdown;
  crashAfter: GenomeV2SettlementBreakdown;
  dynasty: DynastyName;
}

/**
 * The Drop's GAIN and RISK lines, read from the catalog that owns them.
 *
 * These were two hand-maintained tables of prose keyed by gene id, sitting
 * beside a third in the presentation adapter. Nothing held them in agreement
 * and they drifted: one Power could describe itself three ways depending on
 * which surface you were looking at. The rule sentence now has one home.
 */
function geneProjectedRule(geneId: GenomeV2ActiveGeneId): string {
  return GENOME_V2_GENES[geneId].effect;
}

function geneProjectedCost(geneId: GenomeV2ActiveGeneId): string {
  return GENOME_V2_GENES[geneId].cost;
}

export function genomeV2StrainPoints(state: GenomeV2State): StrainPoints {
  const result: StrainPoints = { ...state.startingStrainPoints };
  for (const instance of Object.values(state.instances)) {
    if (instance.status === 'replaced' || instance.status === 'ash') continue;
    for (const strain of GENOME_V2_GENE_STRAINS[instance.geneId]) {
      result[strain] = (result[strain] ?? 0) + 1;
    }
  }
  return result;
}

export interface GenomeV2OfferWeightBreakdown {
  geneId: GenomeV2ActiveGeneId;
  base: number;
  strain: number;
  splice: number;
  dynasty: number;
  condition: number;
  missingCategory: number;
  stateRelevance: number;
  total: number;
}

export interface GenomeV2OfferRoll {
  candidates: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
  weights: readonly [GenomeV2OfferWeightBreakdown, GenomeV2OfferWeightBreakdown];
  secondSlotUsedSurprise: boolean;
}

/** Run-seed-frozen cadence: first two offers at four eligible targets, then
 * deterministic 4–6 intervals with mean five. */
export function genomeV2OfferInterval(
  state: GenomeV2State,
  offerIndex: number = state.offerCount
): number {
  if (!Number.isSafeInteger(offerIndex) || offerIndex < 0) {
    throw new Error('Genome v2 offer cadence index is malformed.');
  }
  return rollGenomeV2GeneOfferInterval(
    offerIndex,
    offerStream(`genome-v2-cadence:${state.runSeed}`, offerIndex)
  );
}

/**
 * Player-pulled relic cadence: deterministic 8 +/- 2 foods (6-10 inclusive).
 * Opportunity identity is deliberately separate from offer identity: an
 * ignored relic reveals and consumes no candidates, but its next appearance
 * still follows a stable run-seed-frozen interval.
 */
export function genomeV2PhysicalRelicInterval(
  state: Pick<GenomeV2State, 'runSeed'>,
  opportunityIndex: number
): number {
  if (!Number.isSafeInteger(opportunityIndex) || opportunityIndex < 0) {
    throw new Error('Genome v2 relic cadence index is malformed.');
  }
  return rollGeneOfferInterval(
    offerStream(
      `genome-v2-relic-cadence:${state.runSeed}`,
      opportunityIndex
    )
  );
}

function genomeV2OfferWeight(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): GenomeV2OfferWeightBreakdown {
  const tuning = GENOME_V2_CONFIG.offers;
  const points = genomeV2StrainPoints(state);
  const definition = GENOME_V2_GENES[geneId];
  const strain = Math.min(
    tuning.strainWeightCap,
    definition.strains.reduce(
      (sum, strainId) =>
        sum + (points[strainId] ?? 0) * tuning.strainPointWeight,
      0
    )
  );
  const splice = spliceCompletionForCandidate(state, geneId)
    ? tuning.immediateSpliceWeight
    : 0;
  const signature = geneId === genomeV2SignatureForDynasty(state.dynasty);
  const dynasty = signature
    ? tuning.dynastySignatureWeight
    : definition.dynasties.includes(state.dynasty)
      ? tuning.dynastyAffinityWeight
      : 0;
  const condition =
    state.offerTiltStrain !== null &&
    GENOME_V2_GENE_STRAINS[geneId].includes(state.offerTiltStrain)
      ? ANOMALY_STRAIN_WEIGHT
      : 0;
  const heldCategories = new Set(
    Object.values(state.instances)
      .filter((instance) => !['replaced', 'ash'].includes(instance.status))
      .map((instance) => GENOME_V2_GENES[instance.geneId].category)
  );
  const missingCategory = heldCategories.has(definition.category)
    ? 0
    : tuning.missingCategoryWeight;
  const activeEconomicLiability = Boolean(
    state.carryPasses > 0 ||
    state.bonds > 0 ||
    state.loan ||
    state.ledger.mirrorStake > 0
  );
  const stateRelevance =
    activeEconomicLiability && definition.category === 'banking'
      ? tuning.activeLiabilityWeight
      : 0;
  return {
    geneId,
    base: tuning.baseWeight,
    strain,
    splice,
    dynasty,
    condition,
    missingCategory,
    stateRelevance,
    total:
      tuning.baseWeight +
      strain +
      splice +
      dynasty +
      condition +
      missingCategory +
      stateRelevance,
  };
}

function drawGenomeV2Candidate(
  candidates: readonly GenomeV2ActiveGeneId[],
  state: GenomeV2State,
  rng: () => number
): GenomeV2ActiveGeneId {
  const weighted = candidates.map((geneId) => genomeV2OfferWeight(state, geneId));
  const total = weighted.reduce((sum, entry) => sum + entry.total, 0);
  let roll = rng() * total;
  for (const entry of weighted) {
    roll -= entry.total;
    if (roll < 0) return entry.geneId;
  }
  return weighted[weighted.length - 1].geneId;
}

/**
 * The trial's guaranteed candidate for THIS offer, or null.
 *
 * Pure and state-only, so client and server reach the same answer from the
 * same frozen state — the parity guard depends on nothing else.
 *
 * Null means "no guaranteed position this offer", for one of four reasons,
 * none of which spends an appearance: no trial is stamped, the guarantee is
 * spent, the Gene is not currently legal (already held, retired, or
 * `phoenix` under an outside revive), or this run cannot teach it at all.
 */
function genomeV2TrialCandidate(
  state: GenomeV2State,
  legal: readonly GenomeV2ActiveGeneId[]
): GenomeV2ActiveGeneId | null {
  const trial = state.trial;
  if (!trial) return null;
  if (genomeV2TrialOffersRemaining(state) <= 0) return null;
  if (!legal.includes(trial.geneId)) return null;
  if (!genomeV2TrialTeachable(state, trial.geneId)) return null;
  return trial.geneId;
}

/**
 * Deterministic build-aware THREAD/FORK offer. Surprise is bounded to the
 * second slot and never bypasses pool legality, seen/retired exclusion, or
 * the different-category rule when a different viable category exists.
 *
 * A stamped curriculum trial takes the first slot exactly as
 * `state.anchor.pinnedGeneId` does, and for the same reason it is safe: the
 * second slot still draws ordinarily from everything else legal, so one
 * ordinary candidate always survives beside it and DECLINE is untouched.
 * Guidance narrows the choice by one; it never forces a build.
 */
export function rollGenomeV2Offer(
  state: GenomeV2State,
  offerIndex: number = state.offerCount
): GenomeV2OfferRoll | null {
  if (!Number.isSafeInteger(offerIndex) || offerIndex < 0) {
    throw new Error('Genome v2 offer stream requires a seed and non-negative index.');
  }
  const seen = new Set(
    Object.values(state.instances).map((instance) => instance.geneId)
  );
  // The `apexesUnlocked` disjunct that used to sit here — withholding the
  // Dynasty Signature from offers until Apex at ten banked runs — is DELETED
  // (Constitution v1.14 overturn #36, owner ruling 1). Dynasty identity is not
  // advanced content, and the arithmetic made the lock load-bearing in the
  // wrong direction: with it, a seven-Gene starter pool behaves like a six and
  // starves before the sixth locus can fill. Apex *tier activation* keeps its
  // ramp — `tierCap` in the session route is untouched.
  const legal = state.genePool.filter(
    (geneId) =>
      !seen.has(geneId) &&
      !(geneId === 'phoenix' && state.externalSecondLife !== null)
  );
  if (legal.length < 2) return null;
  const rng = offerStream(`genome-v2:${state.runSeed}`, offerIndex);
  // Drawn FIRST and unconditionally, before either override is considered, so
  // the stream position is identical whether or not a candidate is forced.
  // That is what makes the trial part of the deterministic roll rather than an
  // overlay on top of it, and why a flag-off run rolls byte-identical offers.
  const rolledFirst = drawGenomeV2Candidate(legal, state, rng);
  const pinned = state.anchor.pinnedGeneId;
  // THE PLAYER'S OWN PIN OUTRANKS THE CURRICULUM. Loom Anchor is a mechanic
  // the player spent a charge on; guidance may not overwrite it, and pinning
  // both would leave the offer with no ordinary candidate at all. A suppressed
  // trial costs nothing: it appears in no offer, so it spends no appearance.
  const trial = genomeV2TrialCandidate(state, legal);
  const first = pinned && legal.includes(pinned)
    ? pinned
    : trial ?? rolledFirst;
  const remaining = legal.filter((geneId) => geneId !== first);
  const differentCategory = remaining.filter(
    (geneId) =>
      GENOME_V2_GENES[geneId].category !== GENOME_V2_GENES[first].category
  );
  const viableSecond = differentCategory.length > 0
    ? differentCategory
    : remaining;
  const useSurprise =
    Math.floor(rng() * GENOME_V2_YIELD_SCALE) <
    GENOME_V2_CONFIG.offers.boundedSurpriseChanceBps;
  const second = useSurprise
    ? viableSecond[Math.min(
        viableSecond.length - 1,
        Math.floor(rng() * viableSecond.length)
      )]
    : drawGenomeV2Candidate(viableSecond, state, rng);
  return {
    candidates: [first, second],
    weights: [
      genomeV2OfferWeight(state, first),
      genomeV2OfferWeight(state, second),
    ],
    secondSlotUsedSurprise: useSurprise,
  };
}

/** Server/runtime parity guard for a client-carried offer event. */
export function assertGenomeV2OfferMatchesRoll(
  state: GenomeV2State,
  offerIndex: number,
  candidates: readonly GenomeV2ActiveGeneId[]
): asserts candidates is readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId] {
  const expected = rollGenomeV2Offer(state, offerIndex);
  if (
    !expected ||
    candidates.length !== 2 ||
    expected.candidates[0] !== candidates[0] ||
    expected.candidates[1] !== candidates[1]
  ) {
    throw new Error('Genome v2 offer differs from its deterministic run stream.');
  }
}

function spliceCompletionForCandidate(
  state: GenomeV2State,
  candidate: GenomeV2ActiveGeneId,
  excludedInstanceIds: ReadonlySet<string> = new Set()
): GenomeV2SpliceId | null {
  if (!state.splicesEnabled) return null;
  for (const instance of activeGeneInstances(state)) {
    if (excludedInstanceIds.has(instance.instanceId)) continue;
    const splice = genomeV2SpliceForPair(instance.geneId, candidate);
    if (splice && !state.activeSplices.includes(splice)) return splice;
  }
  return null;
}

function splicePathsForCandidate(
  state: GenomeV2State,
  candidate: GenomeV2ActiveGeneId,
  requiresReplacement: boolean
): TacticalLoomSplicePath[] {
  const activeIds = new Set(
    activeGeneInstances(state).map((instance) => instance.geneId)
  );
  const threadCompletion = requiresReplacement
    ? null
    : spliceCompletionForCandidate(state, candidate);
  return GENOME_V2_SPLICE_IDS.flatMap((spliceId) => {
    const definition = GENOME_V2_SPLICES[spliceId];
    const [first, second] = definition.parents;
    if (candidate !== first && candidate !== second) return [];
    const partnerGeneId = candidate === first ? second : first;
    const partnerHeld = activeIds.has(partnerGeneId);
    const pathState: TacticalLoomSplicePath['state'] = !state.splicesEnabled
      ? 'unavailable'
      : requiresReplacement && partnerHeld
        ? 'depends_on_recode'
        : threadCompletion !== null
          ? spliceId === threadCompletion
            ? 'completes_now'
            : 'closed_by_completion'
          : 'one_gene_away';
    return [{
      spliceId,
      partnerGeneId,
      state: pathState,
      unlocked: state.splicesEnabled,
      blockedReason: state.splicesEnabled ? null : 'splices_locked' as const,
    }];
  });
}

function targetProjectionForGene(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): TacticalLoomCandidateDelta['targetProjection'] {
  const base = {
    currentlyQueued: state.targetQueue.length,
    addedImmediately: 0 as const,
    trigger: 'none' as 'none' | 'cadence' | 'event',
    cadence: null as number | null,
    multiplierBps: null as number | null,
    routeSlackMoves: null as number | null,
  };
  switch (geneId) {
    case 'gold_trail':
      return { ...base, trigger: 'cadence', cadence: 5, multiplierBps: 30_000 };
    case 'live_wire':
      return {
        ...base,
        trigger: 'cadence',
        cadence: 3,
        multiplierBps: 30_000,
        routeSlackMoves: GENOME_V2_CONFIG.liveWire.routeSlackMoves,
      };
    case 'circuit_run':
      return {
        ...base,
        trigger: 'cadence',
        cadence: 4,
        multiplierBps: 40_000,
        routeSlackMoves: GENOME_V2_CONFIG.circuitRun.routeSlackMoves,
      };
    case 'phase_gate':
      return { ...base, trigger: 'cadence', cadence: 5, multiplierBps: 30_000 };
    case 'coilkeeper':
      return { ...base, trigger: 'event', multiplierBps: 40_000 };
    case 'wall_rush':
      return { ...base, trigger: 'event', multiplierBps: 25_000 };
    default:
      return base;
  }
}

function bodyProjectionForGene(
  geneId: GenomeV2ActiveGeneId
): TacticalLoomCandidateDelta['bodyProjection'] {
  if (geneId === 'overgrowth') {
    return {
      growthOnAcquire: 0,
      extraGrowthPerFood: GENOME_V2_CONFIG.overgrowth.extraGrowthPerFood,
      extraGrowthCadence: 1,
      growthOnTrigger: 0,
    };
  }
  if (geneId === 'time_dilation') {
    return {
      growthOnAcquire: 0,
      extraGrowthPerFood: 1,
      extraGrowthCadence: GENOME_V2_CONFIG.timeDilation.extraGrowthCadence,
      growthOnTrigger: 0,
    };
  }
  if (geneId === 'phoenix') {
    return {
      growthOnAcquire: 0,
      extraGrowthPerFood: 0,
      extraGrowthCadence: null,
      growthOnTrigger: GENOME_V2_CONFIG.phoenix.growthCost,
    };
  }
  return {
    growthOnAcquire: 0,
    extraGrowthPerFood: 0,
    extraGrowthCadence: null,
    growthOnTrigger: 0,
  };
}

function terrainProjectionForGene(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): TacticalLoomCandidateDelta['terrainProjection'] {
  const common = {
    currentPermanentFacts: state.permanentTerrain.length,
    currentPermanentCells: state.permanentTerrain.reduce(
      (sum, fact) => sum + fact.cells.length,
      0
    ),
  };
  if (geneId === 'coilkeeper') {
    return {
      ...common,
      createsPermanentTerrain: true,
      cellsPerUse: null,
      minimumCellsPerUse: GENOME_V2_CONFIG.coilkeeper.minimumSealedCells,
    };
  }
  if (geneId === 'phase_gate') {
    return {
      ...common,
      createsPermanentTerrain: true,
      cellsPerUse: 2,
      minimumCellsPerUse: 2,
    };
  }
  return {
    ...common,
    createsPermanentTerrain: false,
    cellsPerUse: null,
    minimumCellsPerUse: null,
  };
}

function dynastyProjectionForGene(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): TacticalLoomCandidateDelta['dynastyProjection'] {
  const definition = GENOME_V2_GENES[geneId];
  const relation = geneId === genomeV2SignatureForDynasty(state.dynasty)
    ? 'signature'
    : definition.dynasties.includes(state.dynasty)
      ? 'favored'
      : 'universal';
  return {
    dynasty: state.dynasty,
    relation,
    legal: !(geneId === 'phoenix' && state.externalSecondLife !== null),
  };
}

function tacticalSlotProjection(
  state: GenomeV2State
): TacticalLoomSlotProjection[] {
  return state.slots.map((slot) => {
    const occupant = slot.occupant;
    if (!occupant) return { index: slot.index, occupant: null };
    if (occupant.kind === 'ash') {
      return { index: slot.index, occupant: { kind: 'ash' as const } };
    }
    if (occupant.kind === 'gene') {
      const instance = state.instances[occupant.instanceId];
      if (!instance) throw new Error('Genome v2 slot references a missing gene.');
      return {
        index: slot.index,
        occupant: { kind: 'gene' as const, geneId: instance.geneId },
      };
    }
    const parents = occupant.parentInstanceIds.map(
      (instanceId) => state.instances[instanceId]?.geneId
    );
    if (!parents[0] || !parents[1]) {
      throw new Error('Genome v2 Splice references a missing parent.');
    }
    return {
      index: slot.index,
      occupant: {
        kind: 'splice' as const,
        spliceId: occupant.spliceId,
        parentGeneIds: [parents[0], parents[1]],
      },
    };
  });
}

function threadProjection(
  state: GenomeV2State,
  candidate: GenomeV2ActiveGeneId
): {
  formedSplice: GenomeV2SpliceId | null;
  resultingSlots: TacticalLoomSlotProjection[];
  resultingActiveSplices: GenomeV2SpliceId[];
} | null {
  const empty = state.slots.find((slot) => slot.occupant === null);
  if (!empty) return null;
  const after = cloneState(state);
  acquireGene(after, {
    instanceId: `projection:thread:${state.eventIndex + 1}:${candidate}`,
    geneId: candidate,
    slot: empty.index,
    source: 'offer',
  });
  return {
    formedSplice:
      after.activeSplices.find((id) => !state.activeSplices.includes(id)) ?? null,
    resultingSlots: tacticalSlotProjection(after),
    resultingActiveSplices: [...after.activeSplices],
  };
}

function replacementProjection(
  state: GenomeV2State,
  candidate: GenomeV2ActiveGeneId,
  points: StrainPoints,
  slot: GenomeV2Slot,
  growthCost: number
): TacticalLoomReplacementDelta | null {
  if (!slot.occupant) return null;
  const retainedLiabilities = {
    bonds: state.bonds,
    loanEscrow: state.loan?.escrowYield ?? 0,
    loanFoodsRemaining: state.loan?.foodsRemaining ?? 0,
    mirrorStake: state.ledger.mirrorStake,
  };
  if (slot.occupant.kind === 'ash') {
    return {
      slot: slot.index,
      allowed: false,
      blockedReason: 'ash_is_permanent',
      growthCost,
      removedGeneIds: [],
      removedStrains: [],
      addedStrains: [...GENOME_V2_GENE_STRAINS[candidate]],
      resultingStrainPoints: { ...points },
      breaksSplice: null,
      createsSplice: null,
      resultingSlots: tacticalSlotProjection(state),
      resultingActiveSplices: [...state.activeSplices],
      losesSecondLife: false,
      retainedLiabilities,
    };
  }

  const retiring = slot.occupant.kind === 'gene'
    ? [state.instances[slot.occupant.instanceId]].filter(
        (instance): instance is GenomeV2GeneInstance => Boolean(instance)
      )
    : spliceParentsInSlot(state, slot);
  const removedInstanceIds = new Set(
    retiring.map((instance) => instance.instanceId)
  );
  const removedGeneIds = retiring.map((instance) => instance.geneId);
  const removedStrains = retiring.flatMap(
    (instance) => [...GENOME_V2_GENE_STRAINS[instance.geneId]]
  );
  const life = state.secondLife;
  const losesSecondLife = Boolean(
    life && (
      removedInstanceIds.has(life.phoenixInstanceId) ||
      (life.owner.kind === 'splice' &&
        life.owner.parentInstanceIds.some((id) => removedInstanceIds.has(id)))
    )
  );
  const after = cloneState(state);
  recodeSlot(after, {
    instanceId: `projection:recode:${state.eventIndex + 1}:${candidate}:${slot.index}`,
    replacementGeneId: candidate,
    slot: slot.index,
    growthCharged: growthCost,
  });
  return {
    slot: slot.index,
    allowed: true,
    blockedReason: null,
    growthCost,
    removedGeneIds,
    removedStrains,
    addedStrains: [...GENOME_V2_GENE_STRAINS[candidate]],
    resultingStrainPoints: genomeV2StrainPoints(after),
    breaksSplice:
      slot.occupant.kind === 'splice' ? slot.occupant.spliceId : null,
    createsSplice: spliceCompletionForCandidate(
      state,
      candidate,
      removedInstanceIds
    ),
    resultingSlots: tacticalSlotProjection(after),
    resultingActiveSplices: [...after.activeSplices],
    losesSecondLife,
    retainedLiabilities,
  };
}

export interface GenomeV2RecodePreview {
  source: 'loom' | 'portal';
  offerId: string;
  replacementGeneId: GenomeV2ActiveGeneId;
  slot: GenomeV2SlotIndex;
  growthCharged: number;
  consequence: TacticalLoomReplacementDelta;
}

/** Non-mutating authority for the two-step Recode UI. The returned facts can
 * be copied into one `offer_recoded` event only after player confirmation. */
export function previewGenomeV2Recode(
  state: GenomeV2State,
  input: {
    source: 'loom' | 'portal';
    offerId: string;
    replacementGeneId: GenomeV2ActiveGeneId;
    slot: GenomeV2SlotIndex;
  }
): GenomeV2RecodePreview {
  const candidates = input.source === 'loom'
    ? state.offer?.offerId === input.offerId
      ? state.offer.candidateGeneIds
      : null
    : state.portal?.genomeOffer?.offerId === input.offerId
      ? state.portal.genomeOffer.candidates
      : null;
  if (!candidates?.includes(input.replacementGeneId)) {
    throw new Error('Genome v2 Recode preview differs from its immutable offer.');
  }
  if (
    input.source === 'loom' &&
    state.slots.some((slot) => slot.occupant === null)
  ) {
    throw new Error('Genome v2 Loom Recode preview requires six occupied loci.');
  }
  const growthCharged = expectedRecodeGrowth(state.recodeCount + 1);
  const consequence = replacementProjection(
    state,
    input.replacementGeneId,
    genomeV2StrainPoints(state),
    state.slots[input.slot],
    growthCharged
  );
  if (!consequence || !consequence.allowed) {
    throw new Error('Genome v2 Recode preview requires an occupied non-Ash locus.');
  }
  return { ...input, growthCharged, consequence };
}

function projectDeclineOptions(
  state: GenomeV2State
): TacticalLoomDeclineOption[] {
  if (!state.offer) return [];
  const pins: (GenomeV2ActiveGeneId | null)[] = [null];
  if (
    state.offer.pinnedGeneId === null &&
    genomeV2MechanicEnabled(state, 'loom_anchor') &&
    state.anchor.charges > 0
  ) {
    pins.push(...state.offer.candidateGeneIds);
  }
  return pins.map((pinGeneId) => {
    const after = cloneState(state);
    if (pinGeneId) {
      after.anchor.charges -= 1;
      after.anchor.pinnedGeneId = pinGeneId;
      if (genomeV2HasSplice(after, 'splice_loom_bond')) {
        after.loomBond = { pinnedGeneId: pinGeneId, matured: false };
      }
    } else if (
      after.offer?.pinnedGeneId === null &&
      genomeV2HasGene(after, 'compound_interest')
    ) {
      after.bonds = Math.min(
        GENOME_V2_CONFIG.compoundInterest.maxBonds,
        after.bonds + 1
      );
    }
    if (after.offer?.pinnedGeneId !== null) {
      after.anchor.pinnedGeneId = null;
      after.loomBond = null;
    }
    after.offer = null;
    return {
      id: pinGeneId ? `pin:${pinGeneId}` : 'decline',
      label: pinGeneId
        ? `PIN ${GENOME_V2_GENES[pinGeneId].name}`
        : 'DECLINE',
      pinGeneId,
      anchorChargesAfter: after.anchor.charges,
      bondAfter: after.bonds,
      loomBondAfter: after.loomBond ? { ...after.loomBond } : null,
      slotsAfter: after.slots.map((slot) => ({
        ...slot,
        occupant: slot.occupant ? { ...slot.occupant } : null,
      })),
      strainPointsAfter: genomeV2StrainPoints(after),
      targetQueueAfter: after.targetQueue.length,
      bodyGrowthAddedAfter: after.bodyGrowthAdded,
      bankAfter: settleGenomeV2(after, 'bank'),
      crashAfter: settleGenomeV2(after, 'crash'),
      dynasty: after.dynasty,
    };
  });
}

export function projectGenomeV2(
  state: GenomeV2State,
  candidates: readonly GenomeV2ActiveGeneId[] = state.offer?.candidateGeneIds ?? []
): TacticalLoomModel {
  const points = genomeV2StrainPoints(state);
  const nextAction = state.portalGenomeActions + 1;
  const nextRecode = state.recodeCount + 1;
  const bankNow = settleGenomeV2(state, 'bank');
  const crashNow = settleGenomeV2(state, 'crash');
  const declineCandidates = state.offer?.candidateGeneIds ?? [];
  const canCreateBond = Boolean(
    state.offer &&
    state.offer.pinnedGeneId === null &&
    genomeV2HasGene(state, 'compound_interest') &&
    state.bonds < GENOME_V2_CONFIG.compoundInterest.maxBonds
  );
  return {
    v: GENOME_RULES_V2,
    dynasty: state.dynasty,
    slots: state.slots.map((slot) => ({
      ...slot,
      occupant: slot.occupant ? { ...slot.occupant } : null,
    })),
    strainPoints: points,
    ladder: GENOME_V2_STRAIN_LADDERS,
    ladderState: projectGenomeV2Ladders(state),
    activeSplices: [...state.activeSplices],
    offer: state.offer
      ? {
          offerId: state.offer.offerId,
          source: state.offer.source,
          openedAtFood: state.offer.openedAtFood,
          openedAtTick: state.offer.openedAtTick,
          offerIndex: state.offer.offerIndex,
          candidateGeneIds: [...state.offer.candidateGeneIds],
        }
      : null,
    decline: {
      available: state.offer !== null,
      forfeitedCandidateGeneIds: [...declineCandidates],
      bondBefore: state.bonds,
      bondAfter: state.bonds + (canCreateBond ? 1 : 0),
      bondDelta: canCreateBond ? 1 : 0,
      anchorCanPinBeforeDecline: Boolean(
        state.offer &&
        genomeV2HasGene(state, 'loom_anchor') &&
        state.anchor.charges > 0
      ),
      anchorChargesBefore: state.anchor.charges,
      anchorChargesAfterPin: Math.max(0, state.anchor.charges - 1),
      pinnedGeneId: state.anchor.pinnedGeneId,
      options: projectDeclineOptions(state),
    },
    liabilities: {
      carryPasses: state.carryPasses,
      bankMultiplierBps: genomeV2CarryBankBps(state.carryPasses),
      salvageMultiplierBps: genomeV2CarrySalvageBps(state.carryPasses),
      bonds: state.bonds,
      loanEscrow: state.loan?.escrowYield ?? 0,
      loanFoodsRemaining: state.loan?.foodsRemaining ?? 0,
      mirrorStake: state.ledger.mirrorStake,
      mirrorLegFrozenCarryBps: state.mirrorLeg?.frozenCarryBps ?? null,
      phoenixAvailable: state.secondLife !== null && !state.secondLife.consumed,
      externalSecondLife: state.externalSecondLife,
      treasuryReserve: state.treasuryReserve,
      covenantShield: state.covenantShield,
      crownBondReserve: state.crownBondReserve,
      ashenStakeReserve: state.ashenStakeReserve,
    },
    runtime: {
      bodyGrowthAdded: state.bodyGrowthAdded,
      lastBodyGrowthDelta: state.lastBodyGrowthDelta,
      wallRushCharges: state.wallRushCharges,
      executionChain: state.executionChain,
      relayCharges: state.relayCharges,
      overclock: state.overclock ? { ...state.overclock } : null,
      permanentTerrainFacts: state.permanentTerrain.length,
      permanentTerrainCells: state.permanentTerrain.reduce(
        (sum, fact) => sum + fact.cells.length,
        0
      ),
      territories: state.territories.length,
      crownWave: state.crownWave
        ? {
            ...state.crownWave,
            currentTargetIds: [...state.crownWave.currentTargetIds],
            futureCells: state.crownWave.futureCells.map((cell) => ({ ...cell })),
            completedTargetIds: [...state.crownWave.completedTargetIds],
          }
        : null,
    },
    candidates: candidates.map((geneId) => {
      ensureActivePool(state, geneId);
      const delta: StrainPoints = {};
      const resulting: StrainPoints = { ...points };
      const unlockDistance: TacticalLoomCandidateDelta['unlockDistance'] = {};
      for (const strain of GENOME_V2_GENE_STRAINS[geneId]) {
        delta[strain] = 1;
        resulting[strain] = (resulting[strain] ?? 0) + 1;
      }
      for (const strain of STRAIN_IDS) {
        const value = resulting[strain] ?? 0;
        unlockDistance[strain] = {
          minor: Math.max(0, genomeV2EffectiveStrainThreshold(
            state,
            strain,
            GENOME_V2_STRAIN_THRESHOLDS.minor
          ) - value),
          expression: Math.max(0, genomeV2EffectiveStrainThreshold(
            state,
            strain,
            GENOME_V2_STRAIN_THRESHOLDS.expression
          ) - value),
          apex: Math.max(0, genomeV2EffectiveStrainThreshold(
            state,
            strain,
            GENOME_V2_STRAIN_THRESHOLDS.apex
          ) - value),
        };
      }
      const thread = threadProjection(state, geneId);
      const requiresReplacement = thread === null;
      return {
        geneId,
        category: GENOME_V2_GENES[geneId].category,
        strainDelta: delta,
        resultingStrainPoints: resulting,
        unlockDistance,
        completesSplice: thread?.formedSplice ?? null,
        occupiesSlot: true,
        requiresReplacement,
        resultingSlots: thread?.resultingSlots ?? null,
        resultingActiveSplices: thread?.resultingActiveSplices ?? null,
        projectedPortalActionGrowth: {
          infuse:
            nextAction <= GENOME_V2_CONFIG.portalGenome.maxActions
              ? expectedInfuseGrowth(nextAction)
              : null,
          recode:
            nextAction <= GENOME_V2_CONFIG.portalGenome.maxActions
              ? expectedRecodeGrowth(nextRecode)
              : null,
        },
        projectedYieldRule: geneProjectedRule(geneId),
        strategicCost: geneProjectedCost(geneId),
        availability: {
          legal: !(geneId === 'phoenix' && state.externalSecondLife !== null),
          blockedReason:
            geneId === 'phoenix' && state.externalSecondLife !== null
              ? 'external_second_life'
              : null,
        },
        splicePaths: splicePathsForCandidate(
          state,
          geneId,
          requiresReplacement
        ),
        targetProjection: targetProjectionForGene(state, geneId),
        bodyProjection: bodyProjectionForGene(geneId),
        terrainProjection: terrainProjectionForGene(state, geneId),
        outcomeProjection: {
          immediateBankDelta: 0,
          immediateCrashDelta: 0,
          bankNow,
          crashNow,
        },
        dynastyProjection: dynastyProjectionForGene(state, geneId),
        replacementOptions: state.slots
          .map((slot) =>
            replacementProjection(
              state,
              geneId,
              points,
              slot,
              expectedRecodeGrowth(nextRecode)
            )
          )
          .filter(
            (option): option is TacticalLoomReplacementDelta => option !== null
          ),
      };
    }),
  };
}

/** Session-safe record: complete deterministic state plus journal, no claims. */
export interface GenomeV2RunRecord extends GenomeV2State {
  settlement: GenomeV2SettlementBreakdown | null;
}

export function genomeV2RunRecord(
  state: GenomeV2State,
  settlement: GenomeV2SettlementBreakdown | null
): GenomeV2RunRecord {
  return { ...cloneState(state), settlement };
}

export function isGenomeRulesVersion(value: unknown): value is GenomeRulesVersion {
  return value === GENOME_RULES_V1 || value === GENOME_RULES_V2;
}

export function genomeV2SignatureForDynasty(
  dynasty: DynastyName
): GenomeV2ActiveGeneId {
  return dynasty === 'PRIMAL'
    ? 'heartwood'
    : dynasty === 'CYBER'
      ? 'zenith_protocol'
      : 'constellation_crown';
}
