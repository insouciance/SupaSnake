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

export const GENOME_RULES_V1 = 1 as const;
export const GENOME_RULES_V2 = 2 as const;
export const CURRENT_GENOME_RULES_VERSION = GENOME_RULES_V2;
export type GenomeRulesVersion = typeof GENOME_RULES_V1 | typeof GENOME_RULES_V2;

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
  },
  coilkeeper: {
    chargeFoods: 8,
    minimumSealedCells: 4,
    rewardTiers: [
      { minimumCells: 4, multiplierBps: 40_000 },
      { minimumCells: 8, multiplierBps: 50_000 },
      { minimumCells: 12, multiplierBps: 60_000 },
    ],
  },
  wallRush: {
    rewardMoveBudget: 6,
    multiplierBps: 25_000,
  },
  phaseGate: {
    cadence: 5,
    multiplierBps: 30_000,
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
    rule: 'A completed Gilded target forges its bonus into a Crown Bond that compounds only at BANK.',
    strategicCost: 'Missing the Gilded window breaks that Bond; PASS still gives up the offer.',
  },
  splice_gilded_fork: {
    id: 'splice_gilded_fork',
    name: 'Gilded Fork',
    parents: ['gold_trail', 'overgrowth'],
    rule: 'Every fifth target offers one exclusive branch: ordinary growth, or ×4 Yield with two extra segments.',
    strategicCost: 'Eating either removes the other; the greedy branch permanently raises body pressure.',
  },
  splice_styx_contract: {
    id: 'splice_styx_contract',
    name: 'Styx Contract',
    parents: ['mirror_wager', 'phoenix'],
    rule: 'The visible Stake can fund Phoenix; unused Ash-bound Stake doubles on BANK.',
    strategicCost: 'Using Phoenix consumes the Stake and permanently Ashes its socket.',
  },
  splice_perfect_circuit: {
    id: 'splice_perfect_circuit',
    name: 'Perfect Circuit',
    parents: ['live_wire', 'circuit_run'],
    rule: 'Successful Live routes arm a linked return leg with a larger shared payout.',
    strategicCost: 'Either failed leg burns the whole circuit.',
  },
  splice_worldcoil: {
    id: 'splice_worldcoil',
    name: 'Worldcoil',
    parents: ['coilkeeper', 'overgrowth'],
    rule: 'Sealed territory converts Overgrowth pressure into a higher next-target tier.',
    strategicCost: 'The seal is permanent and Overgrowth keeps adding body.',
  },
  splice_riftline: {
    id: 'splice_riftline',
    name: 'Riftline',
    parents: ['wall_rush', 'phase_gate'],
    rule: 'A deliberate redirect can open a one-use riftline to the empowered target.',
    strategicCost: 'The traversed gate cells become permanent Scars.',
  },
  splice_loom_bond: {
    id: 'splice_loom_bond',
    name: 'Loom Bond',
    parents: ['compound_interest', 'loom_anchor'],
    rule: 'Pinning a passed gene preserves it and mints the same PASS into a Bond.',
    strategicCost: 'The Anchor stays empty until a later explicit portal PASS.',
  },
  splice_ashen_stake: {
    id: 'splice_ashen_stake',
    name: 'Ashen Stake',
    parents: ['loan_shark', 'phoenix'],
    rule: 'A completed Loan can fund Phoenix and preserve the run instead of paying its Escrow.',
    strategicCost: 'The conversion pays no contract Yield and leaves Ash in the Phoenix socket.',
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
}

export interface GenomeV2PortalDecisionState {
  portalId: string;
  openedAtFood: number;
  openedAtTick: number;
  genomeOffer: {
    offerId: string;
    candidates: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
  } | null;
  pendingRecode: {
    offerId: string;
    slot: GenomeV2SlotIndex;
    replacementGeneId: GenomeV2ActiveGeneId;
    growthCost: number;
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
  secondaryCell: GenomeV2Cell | null;
  spawnTick: number;
  speedAtSpawnMs: number;
  shortestSafeMoves: number;
  sealedAreaCells: number;
  moveBudget: number | null;
  expiresAtTick: number | null;
}

export interface GenomeV2TerrainFact {
  terrainId: string;
  source: 'coilkeeper_seal' | 'phase_gate_scar';
  cells: readonly GenomeV2Cell[];
  createdAtFood: number;
  permanent: true;
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
  eventIndex: number;
  tick: number;
  foodCount: number;
  eligibleTargetCount: number;
  acquisitionCount: number;
  portalGenomeActions: number;
  infuseCount: number;
  recodeCount: number;
  splicesEnabled: boolean;
  carryPasses: number;
  bonds: number;
  slots: GenomeV2Slot[];
  instances: Record<string, GenomeV2GeneInstance>;
  retired: GenomeV2RetiredInstance[];
  activeSplices: GenomeV2SpliceId[];
  offer: GenomeV2OfferState | null;
  portal: GenomeV2PortalDecisionState | null;
  loan: GenomeV2LoanState | null;
  mirrorLeg: { portalId: string; frozenCarryBps: number } | null;
  secondLife: GenomeV2SecondLifeState | null;
  anchor: GenomeV2AnchorState;
  targetQueue: GenomeV2PendingTargetContract[];
  targets: Record<string, GenomeV2TargetState>;
  permanentTerrain: GenomeV2TerrainFact[];
  coilCharge: number;
  compactedJournalEvents: number;
  compactedJournalDigest: string;
  compactedTargets: number;
  compactedTargetDigest: string;
  ledger: GenomeV2YieldLedger;
  journal: GenomeV2Event[];
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
      type: 'portal_recode_selected';
      portalId: string;
      offerId: string;
      replacementGeneId: GenomeV2ActiveGeneId;
      slot: GenomeV2SlotIndex;
    })
  | (GenomeV2EventBase & {
      type: 'portal_recode';
      portalId: string;
      offerId: string;
      instanceId: string;
      growthCharged: number;
    })
  | (GenomeV2EventBase & {
      type: 'anchor_pinned';
      offerId: string;
      geneId: GenomeV2ActiveGeneId;
    })
  | (GenomeV2EventBase & {
      type: 'target_spawned';
      targetId: string;
      cell: GenomeV2Cell;
      secondaryCell?: GenomeV2Cell | null;
      speedAtSpawnMs: number;
      shortestSafeMoves: number;
      /** False only for a linked secondary spawned as part of one contract. */
      cadenceEligible: boolean;
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
      cells: readonly GenomeV2Cell[];
    })
  | (GenomeV2EventBase & {
      type: 'wall_redirected';
      sourceInstanceId: string;
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

export interface GenomeV2StrainLadderTier {
  points: 3 | 4 | 5;
  name: string;
  rule: string;
}

/** Visible from the first run; unlocking controls activation, never discovery. */
export const GENOME_V2_STRAIN_LADDERS: Readonly<
  Record<StrainId, readonly GenomeV2StrainLadderTier[]>
> = {
  AURUM: [
    { points: 3, name: 'Mint', rule: 'Successful active contracts mint visible Yield.' },
    { points: 4, name: 'Dividend', rule: 'BANK converts execution chains into a premium.' },
    { points: 5, name: 'Treasury', rule: 'One forfeitable reserve may compound across portals.' },
  ],
  VOLT: [
    { points: 3, name: 'Telemetry', rule: 'Route budgets reveal their exact execution margin.' },
    { points: 4, name: 'Relay', rule: 'A clean route can arm the next compatible challenge.' },
    { points: 5, name: 'Overclock', rule: 'The player may activate a rewarded, bounded speed burst.' },
  ],
  FERAL: [
    { points: 3, name: 'Mass', rule: 'Body pressure visibly raises FERAL execution value.' },
    { points: 4, name: 'Territory', rule: 'Clean coils can claim strategically useful space.' },
    { points: 5, name: 'Worldbody', rule: 'Perfect body control converts pressure into a major payout.' },
  ],
  FLUX: [
    { points: 3, name: 'Vector', rule: 'Planned terrain interactions preview a legal exit.' },
    { points: 4, name: 'Riftcraft', rule: 'The player may trade permanent space for route power.' },
    { points: 5, name: 'Topology', rule: 'Linked spatial actions can reshape one target route.' },
  ],
  UMBRA: [
    { points: 3, name: 'Stake', rule: 'At-risk Yield is separated and always visible.' },
    { points: 4, name: 'Covenant', rule: 'Deferred contracts may protect or amplify one another.' },
    { points: 5, name: 'Afterlife', rule: 'One explicit second-life economy may be assembled.' },
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
  options: { splicesEnabled?: boolean } = {}
): GenomeV2State {
  return {
    v: GENOME_RULES_V2,
    dynasty,
    eventIndex: 0,
    tick: 0,
    foodCount: 0,
    eligibleTargetCount: 0,
    acquisitionCount: 0,
    portalGenomeActions: 0,
    infuseCount: 0,
    recodeCount: 0,
    splicesEnabled: options.splicesEnabled ?? true,
    carryPasses: 0,
    bonds: 0,
    slots: emptySlots(),
    instances: {},
    retired: [],
    activeSplices: [],
    offer: null,
    portal: null,
    loan: null,
    mirrorLeg: null,
    secondLife: null,
    anchor: {
      charges: GENOME_V2_CONFIG.loomAnchor.initialCharges,
      pinnedGeneId: null,
    },
    targetQueue: [],
    targets: {},
    permanentTerrain: [],
    coilCharge: 0,
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
  };
}

function cloneState(state: GenomeV2State): GenomeV2State {
  return {
    ...state,
    slots: state.slots.map((slot) => ({
      ...slot,
      occupant: slot.occupant ? { ...slot.occupant } : null,
    })),
    instances: Object.fromEntries(
      Object.entries(state.instances).map(([id, instance]) => [id, { ...instance }])
    ),
    retired: state.retired.map((entry) => ({ ...entry })),
    activeSplices: [...state.activeSplices],
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
          pendingRecode: state.portal.pendingRecode
            ? { ...state.portal.pendingRecode }
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
          secondaryCell: target.secondaryCell
            ? { ...target.secondaryCell }
            : null,
        },
      ])
    ),
    permanentTerrain: state.permanentTerrain.map((fact) => ({
      ...fact,
      cells: fact.cells.map((cell) => ({ ...cell })),
    })),
    ledger: { ...state.ledger },
    journal: [...state.journal],
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

function geneInstance(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): GenomeV2GeneInstance | null {
  return activeGeneInstances(state).find((instance) => instance.geneId === geneId) ?? null;
}

function ensureEventEnvelope(state: GenomeV2State, event: GenomeV2Event): void {
  if (event.index !== state.eventIndex + 1) {
    throw new Error('Genome v2 journal index is not contiguous.');
  }
  if (!Number.isSafeInteger(event.tick) || event.tick < state.tick) {
    throw new Error('Genome v2 journal tick rewinds.');
  }
  if (!event.eventId || state.journal.some((entry) => entry.eventId === event.eventId)) {
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

function ensureActivePool(state: GenomeV2State, geneId: unknown): asserts geneId is GenomeV2ActiveGeneId {
  if (
    !isGenomeV2ActiveGeneId(geneId) ||
    !genomeV2ActivePool(state.dynasty).includes(geneId)
  ) {
    throw new Error(`Genome v2 gene ${String(geneId)} is not legal for ${state.dynasty}.`);
  }
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
    if (state.secondLife !== null) {
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
  for (const instance of activeGeneInstances(state)) {
    const since = targetOrdinal - instance.acquiredAtTargetOrdinal;
    if (since <= 0) continue;
    if (instance.lastCadenceTargetOrdinal === targetOrdinal) continue;
    let queued = false;
    if (instance.geneId === 'gold_trail' && since % GENOME_V2_CONFIG.goldTrail.cadence === 0) {
      enqueueContract(state, instance, 'gold_trail');
      queued = true;
    }
    if (instance.geneId === 'live_wire' && since % GENOME_V2_CONFIG.liveWire.cadence === 0) {
      enqueueContract(state, instance, 'live_wire');
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
      return withinBudget
        ? GENOME_V2_CONFIG.goldTrail.multiplierBps
        : GENOME_V2_YIELD_SCALE;
    case 'live_wire':
      return withinBudget
        ? GENOME_V2_CONFIG.liveWire.successMultiplierBps
        : GENOME_V2_CONFIG.liveWire.failureMultiplierBps;
    case 'circuit_run':
      return withinBudget
        ? GENOME_V2_CONFIG.circuitRun.successMultiplierBps
        : GENOME_V2_CONFIG.circuitRun.failureMultiplierBps;
    case 'coilkeeper': {
      const tier = [...GENOME_V2_CONFIG.coilkeeper.rewardTiers]
        .reverse()
        .find((entry) => target.sealedAreaCells >= entry.minimumCells);
      return tier?.multiplierBps ?? 0;
    }
    case 'wall_rush':
      return withinBudget
        ? GENOME_V2_CONFIG.wallRush.multiplierBps
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
  const potential = safeAdd(
    state.ledger.bankableYield,
    safeAdd(
      genomeV2MultiplyBps(
        state.ledger.mirrorStake,
        GENOME_V2_CONFIG.mirrorWager.bankStakeMultiplierBps
      ),
      state.loan?.escrowYield ?? 0,
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
  const exclusiveBps = targetMultiplierBps(target, event);
  const exclusiveYield = genomeV2MultiplyBps(event.baseYield, exclusiveBps);
  state.ledger.exclusiveTargetDelta = safeSignedAdd(
    state.ledger.exclusiveTargetDelta,
    exclusiveYield - event.baseYield,
    'exclusive target ledger'
  );

  const continuousBps = genomeV2HasGene(state, 'overgrowth')
    ? genomeV2OvergrowthMultiplierBps(event.pressureBps)
    : GENOME_V2_YIELD_SCALE;
  const continuousYield = genomeV2MultiplyBps(exclusiveYield, continuousBps);
  state.ledger.continuousDelta = safeSignedAdd(
    state.ledger.continuousDelta,
    continuousYield - exclusiveYield,
    'continuous Yield ledger'
  );

  let flowYield = continuousYield;
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
      state.loan = null;
    }
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

  if (event.resolution === 'collected') {
    state.foodCount += 1;
    if (genomeV2HasGene(state, 'coilkeeper')) state.coilCharge += 1;
  }
  updateDisplayGross(state);
}

function startLoanIfEligible(state: GenomeV2State, portalId: string): void {
  if (!genomeV2HasGene(state, 'loan_shark') || state.loan !== null) return;
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
  if (!genomeV2HasGene(state, 'mirror_wager')) {
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

  switch (event.type) {
    case 'offer_opened':
      if (state.offer) throw new Error('Genome v2 already has an active offer.');
      if (event.candidates.length < 2 || event.candidates.length > 3) {
        throw new Error('Genome v2 offer must contain two or three candidates.');
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
      };
      break;
    case 'offer_declined':
    case 'offer_expired': {
      if (state.offer?.offerId !== event.offerId) {
        throw new Error('Genome v2 offer resolution does not match the active offer.');
      }
      if (event.type === 'offer_declined' && genomeV2HasGene(state, 'compound_interest')) {
        state.bonds = Math.min(
          GENOME_V2_CONFIG.compoundInterest.maxBonds,
          state.bonds + 1
        );
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
      }
      state.offer = null;
      break;
    case 'portal_opened':
      if (state.portal) throw new Error('Genome v2 already has an active portal.');
      if (event.genomeOffer) {
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
            }
          : null,
        pendingRecode: null,
      };
      break;
    case 'portal_continued':
    case 'portal_expired':
      if (state.portal?.portalId !== event.portalId) {
        throw new Error('Genome v2 portal outcome does not match the active portal.');
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
        }
        startLoanIfEligible(state, event.portalId);
        if (genomeV2HasGene(state, 'loom_anchor')) {
          state.anchor.charges = GENOME_V2_CONFIG.loomAnchor.maximumCharges;
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
      state.portal = null;
      break;
    case 'portal_infuse': {
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
      acquireGene(state, {
        instanceId: event.instanceId,
        geneId: event.geneId,
        slot: event.slot,
        source: 'infuse',
      });
      state.mirrorLeg = null;
      state.portal = null;
      break;
    }
    case 'portal_recode_selected': {
      if (
        state.portal?.portalId !== event.portalId ||
        state.portal.genomeOffer?.offerId !== event.offerId ||
        !state.portal.genomeOffer.candidates.includes(event.replacementGeneId)
      ) {
        throw new Error('Genome v2 Recode selection is not an immutable portal candidate.');
      }
      const slot = state.slots[event.slot];
      if (!slot?.occupant || slot.occupant.kind === 'ash') {
        throw new Error('Genome v2 Recode selection requires a non-Ash locus.');
      }
      if (
        Object.values(state.instances).some(
          (instance) => instance.geneId === event.replacementGeneId
        )
      ) {
        throw new Error('Genome v2 Recode cannot restore an active or retired gene.');
      }
      state.portal.pendingRecode = {
        offerId: event.offerId,
        slot: event.slot,
        replacementGeneId: event.replacementGeneId,
        growthCost: expectedRecodeGrowth(state.recodeCount + 1),
      };
      break;
    }
    case 'portal_recode':
      if (
        state.portal?.portalId !== event.portalId ||
        state.portal.pendingRecode?.offerId !== event.offerId
      ) {
        throw new Error('Genome v2 Recode does not match the active portal.');
      }
      if (state.portalGenomeActions >= GENOME_V2_CONFIG.portalGenome.maxActions) {
        throw new Error('Genome v2 portal Genome action cap exceeded.');
      }
      state.portalGenomeActions += 1;
      recodeSlot(state, {
        ...event,
        replacementGeneId: state.portal.pendingRecode.replacementGeneId,
        slot: state.portal.pendingRecode.slot,
      });
      state.mirrorLeg = null;
      state.portal = null;
      break;
    case 'anchor_pinned':
      if (
        state.offer?.offerId !== event.offerId ||
        !state.offer.candidateGeneIds.includes(event.geneId) ||
        state.anchor.charges < 1 ||
        !genomeV2HasGene(state, 'loom_anchor')
      ) {
        throw new Error('Genome v2 Anchor pin is not available.');
      }
      state.anchor.charges -= 1;
      state.anchor.pinnedGeneId = event.geneId;
      break;
    case 'target_spawned': {
      if (state.targets[event.targetId]) {
        throw new Error('Genome v2 target identity was reused.');
      }
      assertSafeInteger(event.speedAtSpawnMs, 'target speed', 1);
      assertSafeInteger(event.shortestSafeMoves, 'target route length');
      const eligibleOrdinal = event.cadenceEligible
        ? state.eligibleTargetCount + 1
        : null;
      if (eligibleOrdinal !== null) {
        state.eligibleTargetCount = eligibleOrdinal;
        enqueueCadenceContractsForTarget(state, eligibleOrdinal);
      }
      const contract = state.targetQueue.shift() ?? null;
      const kind: GenomeV2TargetState['kind'] = contract?.kind ?? 'ordinary';
      const budget = contract
        ? contractMoveBudget(
            contract.kind,
            event.shortestSafeMoves,
            event.speedAtSpawnMs
          )
        : { moves: null, ticks: null };
      state.targets[event.targetId] = {
        targetId: event.targetId,
        eligibleOrdinal,
        contractId: contract?.contractId ?? null,
        kind,
        lifecycle: contract?.stage === 2 ? 'armed' : 'active',
        cell: { ...event.cell },
        secondaryCell: event.secondaryCell ? { ...event.secondaryCell } : null,
        spawnTick: event.tick,
        speedAtSpawnMs: event.speedAtSpawnMs,
        shortestSafeMoves: event.shortestSafeMoves,
        sealedAreaCells: contract?.sealedAreaCells ?? 0,
        moveBudget: budget.moves,
        expiresAtTick: budget.ticks === null ? null : event.tick + budget.ticks,
      };
      break;
    }
    case 'target_resolved': {
      const target = state.targets[event.targetId];
      if (!target || !['active', 'armed'].includes(target.lifecycle)) {
        throw new Error('Genome v2 target resolution has no active target.');
      }
      const withinBudget =
        target.moveBudget === null || event.movesUsed <= target.moveBudget;
      target.lifecycle = event.resolution === 'expired'
        ? 'expired'
        : event.resolution === 'collected' && withinBudget
          ? 'completed'
          : 'burnt';
      applyResolvedTarget(state, target, event);
      compactResolvedTargets(state);
      break;
    }
    case 'target_window_expired': {
      const target = state.targets[event.targetId];
      if (!target || target.lifecycle !== 'active' || target.kind !== 'gold_trail') {
        throw new Error('Genome v2 Gold window expiry has no active Gilded target.');
      }
      target.kind = 'ordinary';
      target.contractId = null;
      target.moveBudget = null;
      target.expiresAtTick = null;
      break;
    }
    case 'coil_sealed':
      if (
        !genomeV2HasGene(state, 'coilkeeper') ||
        state.coilCharge < GENOME_V2_CONFIG.coilkeeper.chargeFoods ||
        event.cells.length < GENOME_V2_CONFIG.coilkeeper.minimumSealedCells
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
        const instance = geneInstance(state, 'coilkeeper');
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
      break;
    case 'phase_gate_used':
      if (!genomeV2HasGene(state, 'phase_gate') || event.cells.length !== 2) {
        throw new Error('Genome v2 Phase Gate use is invalid.');
      }
      state.permanentTerrain.push({
        terrainId: event.terrainId,
        source: 'phase_gate_scar',
        cells: event.cells.map((cell) => ({ ...cell })),
        createdAtFood: state.foodCount,
        permanent: true,
      });
      break;
    case 'wall_redirected': {
      const instance = state.instances[event.sourceInstanceId];
      if (!instance || instance.status !== 'active' || instance.geneId !== 'wall_rush') {
        throw new Error('Genome v2 wall redirect has no active Wall Rush source.');
      }
      enqueueContract(state, instance, 'wall_rush');
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
  }

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
  const mirrorPaid = terminal === 'bank'
    ? genomeV2MultiplyBps(
        mirrorStake,
        GENOME_V2_CONFIG.mirrorWager.bankStakeMultiplierBps
      )
    : 0;
  const preCarry = terminal === 'bank'
    ? safeAdd(bankable, bondBonus, 'BANK Bonds')
    : bankable;
  const carryMultiplierBps = terminal === 'bank'
    ? genomeV2CarryBankBps(state.carryPasses)
    : genomeV2CarrySalvageBps(state.carryPasses);
  const carryAppliedYield = genomeV2MultiplyBps(
    preCarry,
    carryMultiplierBps
  );
  const genomeYield = terminal === 'bank'
    ? safeAdd(carryAppliedYield, mirrorPaid, 'BANK frozen Mirror')
    : carryAppliedYield;
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
  unlockDistance: Partial<Record<StrainId, { to3: number; to4: number; to5: number }>>;
  completesSplice: GenomeV2SpliceId | null;
  occupiesSlot: boolean;
  requiresReplacement: boolean;
  projectedPortalActionGrowth: { infuse: number | null; recode: number | null };
  projectedYieldRule: string;
  strategicCost: string;
  /** Exact per-locus consequence when all six loci are occupied. Ash is shown
   * as a deliberate non-option rather than silently omitted. */
  replacementOptions: TacticalLoomReplacementDelta[];
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
  activeSplices: GenomeV2SpliceId[];
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
  };
  candidates: TacticalLoomCandidateDelta[];
}

const GENE_PROJECTED_RULE: Readonly<Record<GenomeV2ActiveGeneId, string>> = {
  gold_trail: 'Every fifth future target can pay ×3 inside its visible six-second budget.',
  compound_interest: 'Each deliberate Loom DECLINE adds +8% BANK, up to three Bonds.',
  loan_shark: 'A portal PASS can begin six zero-now foods whose completed Escrow pays ×2.',
  live_wire: 'Every third target becomes a topology-scaled ×3 route test; miss pays zero.',
  circuit_run: 'Every fourth target becomes a linked ×4 route with one normal growth unit.',
  time_dilation: 'World speed ×0.88; every fourth food adds one extra segment.',
  overgrowth: 'Every food adds one extra segment and pays ×1.4–×2.5 with board pressure.',
  coilkeeper: 'Charge eight foods; sealing territory makes the next target ×4–×6.',
  wall_rush: 'A charged wall redirect arms a six-move target worth ×2.5.',
  phase_gate: 'Every fifth food may open a ×3 shortcut whose cells become Scars.',
  mirror_wager: 'At portal CONTINUE, optionally freeze 40% of that leg at current Carry; BANK doubles Stake.',
  phoenix: 'One rewind and phase; +10 body, then this socket becomes Ash.',
  loom_anchor: 'Pin one declined option; recharge only through an explicit portal PASS.',
  heartwood: 'PRIMAL signature: clean territorial actions scale with controlled body mass.',
  zenith_protocol: 'CYBER signature: player-triggered precision overclock pays for execution.',
  constellation_crown: 'COSMIC signature: perfect clears build visible Crown Stars.',
};

const GENE_PROJECTED_COST: Readonly<Record<GenomeV2ActiveGeneId, string>> = {
  gold_trail: 'The premium target has a visible time budget.',
  compound_interest: 'DECLINE gives up a viable build choice; Bonds do nothing on crash.',
  loan_shark: 'BANK or crash before all six foods forfeits all visible Escrow.',
  live_wire: 'Missing the route budget burns the target to zero Yield.',
  circuit_run: 'A failed linked route pays zero while body growth remains.',
  time_dilation: 'Extra growth increases spatial pressure; unavailable in CYBER.',
  overgrowth: 'Double growth consumes board space substantially faster.',
  coilkeeper: 'Every sealed cell remains solid for the rest of the run.',
  wall_rush: 'The charge is spent even when the reward route is missed.',
  phase_gate: 'Using the shortcut leaves two permanent Scars.',
  mirror_wager: 'Crash forfeits Stake; ordinary crash salvage is never reduced.',
  phoenix: 'Adds ten segments, occupies Ash after use, and excludes another second life.',
  loom_anchor: 'The pin is single-use until a later explicit portal PASS.',
  heartwood: 'Value requires dangerous, dynasty-specific territorial execution.',
  zenith_protocol: 'Value requires choosing a readable but genuinely harder speed state.',
  constellation_crown: 'Only fully cleared, unambiguous constellations advance the Crown.',
};

export function genomeV2StrainPoints(state: GenomeV2State): StrainPoints {
  const result: StrainPoints = {};
  for (const instance of Object.values(state.instances)) {
    if (instance.status === 'replaced' || instance.status === 'ash') continue;
    for (const strain of GENOME_V2_GENE_STRAINS[instance.geneId]) {
      result[strain] = (result[strain] ?? 0) + 1;
    }
  }
  return result;
}

function spliceCompletionForCandidate(
  state: GenomeV2State,
  candidate: GenomeV2ActiveGeneId,
  excludedInstanceIds: ReadonlySet<string> = new Set()
): GenomeV2SpliceId | null {
  for (const instance of activeGeneInstances(state)) {
    if (excludedInstanceIds.has(instance.instanceId)) continue;
    const splice = genomeV2SpliceForPair(instance.geneId, candidate);
    if (splice && !state.activeSplices.includes(splice)) return splice;
  }
  return null;
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
  const resulting: StrainPoints = { ...points };
  for (const strain of removedStrains) {
    resulting[strain] = Math.max(0, (resulting[strain] ?? 0) - 1);
  }
  for (const strain of GENOME_V2_GENE_STRAINS[candidate]) {
    resulting[strain] = (resulting[strain] ?? 0) + 1;
  }
  const life = state.secondLife;
  const losesSecondLife = Boolean(
    life && (
      removedInstanceIds.has(life.phoenixInstanceId) ||
      (life.owner.kind === 'splice' &&
        life.owner.parentInstanceIds.some((id) => removedInstanceIds.has(id)))
    )
  );
  return {
    slot: slot.index,
    allowed: true,
    blockedReason: null,
    growthCost,
    removedGeneIds,
    removedStrains,
    addedStrains: [...GENOME_V2_GENE_STRAINS[candidate]],
    resultingStrainPoints: resulting,
    breaksSplice:
      slot.occupant.kind === 'splice' ? slot.occupant.spliceId : null,
    createsSplice: spliceCompletionForCandidate(
      state,
      candidate,
      removedInstanceIds
    ),
    losesSecondLife,
    retainedLiabilities,
  };
}

export function projectGenomeV2(
  state: GenomeV2State,
  candidates: readonly GenomeV2ActiveGeneId[] = state.offer?.candidateGeneIds ?? []
): TacticalLoomModel {
  const points = genomeV2StrainPoints(state);
  const nextAction = state.portalGenomeActions + 1;
  const nextRecode = state.recodeCount + 1;
  return {
    v: GENOME_RULES_V2,
    dynasty: state.dynasty,
    slots: state.slots.map((slot) => ({
      ...slot,
      occupant: slot.occupant ? { ...slot.occupant } : null,
    })),
    strainPoints: points,
    ladder: GENOME_V2_STRAIN_LADDERS,
    activeSplices: [...state.activeSplices],
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
          to3: Math.max(0, 3 - value),
          to4: Math.max(0, 4 - value),
          to5: Math.max(0, 5 - value),
        };
      }
      return {
        geneId,
        category: GENOME_V2_GENES[geneId].category,
        strainDelta: delta,
        resultingStrainPoints: resulting,
        unlockDistance,
        completesSplice: spliceCompletionForCandidate(state, geneId),
        occupiesSlot: true,
        requiresReplacement: state.slots.every((slot) => slot.occupant !== null),
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
        projectedYieldRule: GENE_PROJECTED_RULE[geneId],
        strategicCost: GENE_PROJECTED_COST[geneId],
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
