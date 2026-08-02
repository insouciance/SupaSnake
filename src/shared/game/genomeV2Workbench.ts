/**
 * Genome v2 Research model.
 *
 * The Workbench is an experiment table over the canonical reducer, never a
 * second implementation of Genome rules. A plan is an ordered journal of
 * player verbs. Replaying it produces an ordinary `GenomeV2State`; every
 * locus, Splice, liability and BANK/crash figure below is then read from that
 * state through the same projection and settlement functions used by a run.
 *
 * This module deliberately has no optimiser, ranking, suggestion, or Score.
 * Dynasty fit is information the player interprets, not a number we flatten.
 */

import {
  GENOME_V2_GENES,
  genomeV2ActivePool,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  GENOME_V2_CONFIG,
  GENOME_V2_SPLICES,
  GENOME_V2_STRAIN_LADDERS,
  createGenomeV2State,
  genomeV2EventId,
  genomeV2StrainPoints,
  projectGenomeV2,
  reduceGenomeV2Event,
  settleGenomeV2,
  type GenomeV2Event,
  type GenomeV2RunRecord,
  type GenomeV2SlotIndex,
  type GenomeV2SpliceId,
  type GenomeV2State,
  type GenomeV2SettlementBreakdown,
  type TacticalLoomModel,
} from '@/shared/game/genomeV2';
import type { DynastyName } from '@/shared/game/rulesets';
import { STRAIN_IDS, type StrainId } from '@/shared/game/strains';

export type GenomeV2ResearchLens = 'yield' | 'risk' | 'space';

export type GenomeV2ExperimentAction =
  | { kind: 'thread'; geneId: GenomeV2ActiveGeneId }
  | { kind: 'infuse'; geneId: GenomeV2ActiveGeneId }
  | {
      kind: 'recode';
      geneId: GenomeV2ActiveGeneId;
      slot: GenomeV2SlotIndex;
    }
  | { kind: 'decline' }
  | { kind: 'continue'; activateMirror?: boolean }
  | { kind: 'phoenix' };

export interface GenomeV2ExperimentPlan {
  v: typeof GENOME_RULES_V2;
  dynasty: DynastyName;
  actions: readonly GenomeV2ExperimentAction[];
}

export const EMPTY_GENOME_V2_EXPERIMENT: GenomeV2ExperimentPlan = {
  v: GENOME_RULES_V2,
  dynasty: 'CYBER',
  actions: [],
};

export interface GenomeV2ResearchLocus {
  slot: GenomeV2SlotIndex;
  kind: 'empty' | 'gene' | 'splice' | 'ash';
  label: string;
  geneIds: GenomeV2ActiveGeneId[];
  strains: StrainId[];
  spliceId: GenomeV2SpliceId | null;
}

export interface GenomeV2ResearchStrain {
  id: StrainId;
  points: number;
  activeTier: 0 | 3 | 4 | 5;
  nextTier: 3 | 4 | 5 | null;
  pointsToNext: number;
  tiers: typeof GENOME_V2_STRAIN_LADDERS[StrainId];
}

export interface GenomeV2ResearchFact {
  id: string;
  source: 'gene' | 'splice' | 'state';
  title: string;
  rule: string;
  cost: string;
  strains: StrainId[];
}

export interface GenomeV2ResearchReading {
  v: typeof GENOME_RULES_V2;
  dynasty: DynastyName;
  state: GenomeV2State;
  projection: TacticalLoomModel;
  loci: GenomeV2ResearchLocus[];
  strains: GenomeV2ResearchStrain[];
  activeSplices: GenomeV2SpliceId[];
  availableGenes: GenomeV2ActiveGeneId[];
  seenGenes: GenomeV2ActiveGeneId[];
  /** Null only when a long authoritative record compacted the exact events. */
  growthCommitted: number | null;
  bank: GenomeV2SettlementBreakdown;
  crash: GenomeV2SettlementBreakdown;
  lenses: Record<GenomeV2ResearchLens, GenomeV2ResearchFact[]>;
}

export class GenomeV2ExperimentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenomeV2ExperimentError';
  }
}

type GenomeV2EventFacts = GenomeV2Event extends infer Event
  ? Event extends GenomeV2Event
    ? Omit<Event, 'index' | 'tick' | 'eventId'>
    : never
  : never;

function event<Facts extends GenomeV2EventFacts>(
  state: GenomeV2State,
  actionOrdinal: number,
  eventOrdinal: number,
  facts: Facts
): GenomeV2Event {
  return {
    ...facts,
    index: state.eventIndex + 1,
    tick: state.tick + 1,
    eventId: genomeV2EventId(state.runSeed, state.eventIndex + 1),
  } as GenomeV2Event;
}

function apply<Facts extends GenomeV2EventFacts>(
  state: GenomeV2State,
  actionOrdinal: number,
  eventOrdinal: number,
  facts: Facts
): GenomeV2State {
  return reduceGenomeV2Event(
    state,
    event(state, actionOrdinal, eventOrdinal, facts)
  );
}

function seenGeneIds(state: GenomeV2State): GenomeV2ActiveGeneId[] {
  return Object.values(state.instances)
    .sort((left, right) => left.acquisitionOrdinal - right.acquisitionOrdinal)
    .map((instance) => instance.geneId);
}

function candidatePair(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId
): readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId] {
  const pool = genomeV2ActivePool(state.dynasty);
  const seen = new Set(seenGeneIds(state));
  if (!pool.includes(geneId)) {
    throw new GenomeV2ExperimentError(
      `${GENOME_V2_GENES[geneId]?.name ?? geneId} is not in ${state.dynasty}'s active pool.`
    );
  }
  if (seen.has(geneId)) {
    throw new GenomeV2ExperimentError('A gene cannot recur after it has entered this run.');
  }
  const alternative = pool.find(
    (candidate) => candidate !== geneId && !seen.has(candidate)
  );
  if (!alternative) {
    throw new GenomeV2ExperimentError('The active pool cannot form another legal offer.');
  }
  return [geneId, alternative];
}

function firstOpenSlot(state: GenomeV2State): GenomeV2SlotIndex {
  const slot = state.slots.find((entry) => entry.occupant === null);
  if (!slot) {
    throw new GenomeV2ExperimentError('All six loci are occupied. Use Recode.');
  }
  return slot.index;
}

function expectedInfuseGrowth(actionOrdinal: number): number {
  return GENOME_V2_CONFIG.portalGenome.infuseGrowth[actionOrdinal - 1] ?? 0;
}

function expectedRecodeGrowth(recodeOrdinal: number): number {
  const curve = GENOME_V2_CONFIG.portalGenome.recodeGrowth;
  return curve[Math.min(recodeOrdinal - 1, curve.length - 1)];
}

function replayAction(
  initial: GenomeV2State,
  action: GenomeV2ExperimentAction,
  actionOrdinal: number
): GenomeV2State {
  let state = initial;
  const id = `research-${actionOrdinal}`;

  switch (action.kind) {
    case 'thread': {
      const candidates = candidatePair(state, action.geneId);
      const slot = firstOpenSlot(state);
      state = apply(state, actionOrdinal, 1, {
        type: 'offer_opened',
        offerId: `${id}-offer`,
        source: 'cadence',
        candidates,
      });
      return apply(state, actionOrdinal, 2, {
        type: 'gene_acquired',
        offerId: `${id}-offer`,
        instanceId: `${id}-gene`,
        geneId: action.geneId,
        slot,
        source: 'offer',
      });
    }
    case 'infuse': {
      const candidates = candidatePair(state, action.geneId);
      const slot = firstOpenSlot(state);
      const portalId = `${id}-portal`;
      const offerId = `${id}-offer`;
      state = apply(state, actionOrdinal, 1, {
        type: 'portal_opened',
        portalId,
        genomeOffer: { offerId, candidates },
      });
      return apply(state, actionOrdinal, 2, {
        type: 'portal_infuse',
        portalId,
        offerId,
        instanceId: `${id}-gene`,
        geneId: action.geneId,
        slot,
        growthCharged: expectedInfuseGrowth(state.portalGenomeActions + 1),
      });
    }
    case 'recode': {
      const candidates = candidatePair(state, action.geneId);
      const portalId = `${id}-portal`;
      const offerId = `${id}-offer`;
      state = apply(state, actionOrdinal, 1, {
        type: 'portal_opened',
        portalId,
        genomeOffer: { offerId, candidates },
      });
      return apply(state, actionOrdinal, 2, {
        type: 'offer_recoded',
        source: 'portal',
        offerId,
        instanceId: `${id}-gene`,
        replacementGeneId: action.geneId,
        slot: action.slot,
        growthCharged: expectedRecodeGrowth(state.recodeCount + 1),
      });
    }
    case 'decline': {
      const candidates = genomeV2ActivePool(state.dynasty).filter(
        (candidate) => !seenGeneIds(state).includes(candidate)
      );
      if (candidates.length < 2) {
        throw new GenomeV2ExperimentError('The active pool cannot form a legal DECLINE.');
      }
      state = apply(state, actionOrdinal, 1, {
        type: 'offer_opened',
        offerId: `${id}-offer`,
        source: 'cadence',
        candidates: [candidates[0], candidates[1]],
      });
      return apply(state, actionOrdinal, 2, {
        type: 'offer_declined',
        offerId: `${id}-offer`,
      });
    }
    case 'continue': {
      const portalId = `${id}-portal`;
      state = apply(state, actionOrdinal, 1, {
        type: 'portal_opened',
        portalId,
        genomeOffer: null,
      });
      return apply(state, actionOrdinal, 2, {
        type: 'portal_continued',
        portalId,
        activateMirror: action.activateMirror === true,
      });
    }
    case 'phoenix': {
      const phoenix = Object.values(state.instances).find(
        (instance) => instance.geneId === 'phoenix'
      );
      if (!phoenix) {
        throw new GenomeV2ExperimentError('Phoenix must be active before its Ash state can be studied.');
      }
      return apply(state, actionOrdinal, 1, {
        type: 'phoenix_triggered',
        sourceInstanceId: phoenix.instanceId,
      });
    }
  }
}

export function replayGenomeV2Experiment(
  plan: GenomeV2ExperimentPlan
): GenomeV2State {
  if (plan.v !== GENOME_RULES_V2) {
    throw new GenomeV2ExperimentError('Research accepts only Genome rules v2 plans.');
  }
  return plan.actions.reduce(
    (state, action, index) => replayAction(state, action, index + 1),
    createGenomeV2State(plan.dynasty)
  );
}

function locusReading(state: GenomeV2State): GenomeV2ResearchLocus[] {
  return state.slots.map((slot) => {
    const occupant = slot.occupant;
    if (!occupant) {
      return {
        slot: slot.index,
        kind: 'empty',
        label: 'Open locus',
        geneIds: [],
        strains: [],
        spliceId: null,
      };
    }
    if (occupant.kind === 'ash') {
      return {
        slot: slot.index,
        kind: 'ash',
        label: 'Ash',
        geneIds: ['phoenix'],
        strains: [],
        spliceId: null,
      };
    }
    if (occupant.kind === 'gene') {
      const gene = state.instances[occupant.instanceId];
      return {
        slot: slot.index,
        kind: 'gene',
        label: GENOME_V2_GENES[gene.geneId].name,
        geneIds: [gene.geneId],
        strains: [...GENOME_V2_GENES[gene.geneId].strains],
        spliceId: null,
      };
    }
    const splice = GENOME_V2_SPLICES[occupant.spliceId];
    return {
      slot: slot.index,
      kind: 'splice',
      label: splice.name,
      geneIds: [...splice.parents],
      strains: Array.from(
        new Set(splice.parents.flatMap((parent) => GENOME_V2_GENES[parent].strains))
      ),
      spliceId: splice.id,
    };
  });
}

function strainReading(state: GenomeV2State): GenomeV2ResearchStrain[] {
  const points = genomeV2StrainPoints(state);
  return STRAIN_IDS.map((id) => {
    const value = points[id] ?? 0;
    const activeTier: GenomeV2ResearchStrain['activeTier'] =
      value >= 5 ? 5 : value >= 4 ? 4 : value >= 3 ? 3 : 0;
    const nextTier: GenomeV2ResearchStrain['nextTier'] =
      value < 3 ? 3 : value < 4 ? 4 : value < 5 ? 5 : null;
    return {
      id,
      points: value,
      activeTier,
      nextTier,
      pointsToNext: nextTier === null ? 0 : Math.max(0, nextTier - value),
      tiers: GENOME_V2_STRAIN_LADDERS[id],
    };
  });
}

function activeGeneFacts(state: GenomeV2State): GenomeV2ResearchFact[] {
  return Object.values(state.instances)
    .filter((instance) => instance.status === 'active')
    .sort((left, right) => left.acquisitionOrdinal - right.acquisitionOrdinal)
    .map((instance) => {
      const gene = GENOME_V2_GENES[instance.geneId];
      return {
        id: gene.id,
        source: 'gene' as const,
        title: gene.name,
        rule: gene.effect,
        cost: gene.cost,
        strains: [...gene.strains],
      };
    });
}

function activeSpliceFacts(state: GenomeV2State): GenomeV2ResearchFact[] {
  return state.activeSplices.map((id) => {
    const splice = GENOME_V2_SPLICES[id];
    return {
      id,
      source: 'splice' as const,
      title: splice.name,
      rule: splice.rule,
      cost: splice.strategicCost,
      strains: Array.from(
        new Set(splice.parents.flatMap((parent) => GENOME_V2_GENES[parent].strains))
      ),
    };
  });
}

const SPACE_GENE_IDS = new Set<GenomeV2ActiveGeneId>([
  'time_dilation',
  'overgrowth',
  'coilkeeper',
  'wall_rush',
  'phase_gate',
  'phoenix',
  'heartwood',
]);

const DIRECT_YIELD_CATEGORIES = new Set([
  'yield',
  'banking',
  'execution',
  'terrain',
]);

function stateFacts(
  state: GenomeV2State,
  growthCommitted: number | null
): Record<GenomeV2ResearchLens, GenomeV2ResearchFact[]> {
  const genes = activeGeneFacts(state);
  const splices = activeSpliceFacts(state);
  const yieldFacts = genes.filter((fact) =>
    DIRECT_YIELD_CATEGORIES.has(GENOME_V2_GENES[fact.id as GenomeV2ActiveGeneId].category)
  );
  const riskFacts: GenomeV2ResearchFact[] = [
    ...genes,
    ...splices,
  ];
  const spaceFacts = genes.filter((fact) =>
    SPACE_GENE_IDS.has(fact.id as GenomeV2ActiveGeneId)
  );

  if (state.bonds > 0) {
    riskFacts.push({
      id: 'bonds',
      source: 'state',
      title: `${state.bonds} BANK Bond${state.bonds === 1 ? '' : 's'}`,
      rule: `Each pays +${GENOME_V2_CONFIG.compoundInterest.bankBonusPerBondBps / 100}% at BANK.`,
      cost: 'Pays nothing on crash.',
      strains: ['AURUM'],
    });
  }
  if (state.loan) {
    riskFacts.push({
      id: 'loan-escrow',
      source: 'state',
      title: 'Loan Escrow open',
      rule: `${state.loan.foodsRemaining} contract food${state.loan.foodsRemaining === 1 ? '' : 's'} remain.`,
      cost: 'BANK or crash now forfeits the Escrow.',
      strains: ['AURUM', 'UMBRA'],
    });
  }
  if (state.mirrorLeg || state.ledger.mirrorStake > 0) {
    riskFacts.push({
      id: 'mirror-stake',
      source: 'state',
      title: 'Mirror Stake exposed',
      rule: 'BANK doubles the frozen Stake.',
      cost: 'Crash loses the Stake while ordinary salvage remains.',
      strains: ['UMBRA'],
    });
  }
  if (growthCommitted !== null && growthCommitted > 0) {
    spaceFacts.push({
      id: 'committed-growth',
      source: 'state',
      title: `+${growthCommitted} body committed`,
      rule: 'Portal mutation and Phoenix costs only increase length.',
      cost: 'This space never returns during the run.',
      strains: [],
    });
  }
  if (state.permanentTerrain.length > 0) {
    const cells = state.permanentTerrain.reduce(
      (total, terrain) => total + terrain.cells.length,
      0
    );
    spaceFacts.push({
      id: 'permanent-terrain',
      source: 'state',
      title: `${cells} permanent terrain cell${cells === 1 ? '' : 's'}`,
      rule: 'Seals and Scars remain for this run.',
      cost: 'Available board space only decreases.',
      strains: ['FLUX'],
    });
  }

  return {
    yield: [...yieldFacts, ...splices],
    risk: riskFacts,
    space: [...spaceFacts, ...splices.filter((fact) =>
      /growth|body|terrain|scar|seal|space/i.test(`${fact.rule} ${fact.cost}`)
    )],
  };
}

function planGrowth(actions: readonly GenomeV2ExperimentAction[]): number {
  let portalActions = 0;
  let recodes = 0;
  let total = 0;
  for (const action of actions) {
    if (action.kind === 'infuse') {
      portalActions += 1;
      total += expectedInfuseGrowth(portalActions);
    } else if (action.kind === 'recode') {
      portalActions += 1;
      recodes += 1;
      total += expectedRecodeGrowth(recodes);
    } else if (action.kind === 'phoenix') {
      total += GENOME_V2_CONFIG.phoenix.growthCost;
    }
  }
  return total;
}

export function readGenomeV2Experiment(
  plan: GenomeV2ExperimentPlan
): GenomeV2ResearchReading {
  const state = replayGenomeV2Experiment(plan);
  const projection = projectGenomeV2(state);
  const seen = seenGeneIds(state);
  const growthCommitted = planGrowth(plan.actions);
  return {
    v: GENOME_RULES_V2,
    dynasty: state.dynasty,
    state,
    projection,
    loci: locusReading(state),
    strains: strainReading(state),
    activeSplices: [...state.activeSplices],
    availableGenes: genomeV2ActivePool(state.dynasty).filter(
      (geneId) => !seen.includes(geneId)
    ),
    seenGenes: seen,
    growthCommitted,
    bank: settleGenomeV2(state, 'bank'),
    crash: settleGenomeV2(state, 'crash'),
    lenses: stateFacts(state, growthCommitted),
  };
}

/** Read a completed authoritative run without replaying or altering it. */
export function readGenomeV2RunResearch(
  record: GenomeV2RunRecord
): GenomeV2ResearchReading {
  if (record.v !== GENOME_RULES_V2 || !record.settlement) {
    throw new GenomeV2ExperimentError('Research requires a completed Genome v2 record.');
  }
  const state: GenomeV2State = record;
  const projection = projectGenomeV2(state);
  const seen = seenGeneIds(state);
  const portalGrowthEvents = state.journal.filter(
    (entry) => entry.type === 'portal_infuse' || entry.type === 'portal_recode'
  );
  const phoenixEvents = state.journal.filter(
    (entry) => entry.type === 'phoenix_triggered'
  );
  const expectedPhoenixEvents = state.retired.some(
    (entry) => entry.reason === 'phoenix'
  ) ? 1 : 0;
  const exactGrowthEventsRetained =
    portalGrowthEvents.length === state.portalGenomeActions
    && phoenixEvents.length === expectedPhoenixEvents;
  const retainedGrowth = state.journal.reduce((total, entry) => {
    if (entry.type === 'portal_infuse' || entry.type === 'portal_recode') {
      return total + entry.growthCharged;
    }
    if (entry.type === 'phoenix_triggered') {
      return total + GENOME_V2_CONFIG.phoenix.growthCost;
    }
    return total;
  }, 0);
  const growthCommitted = exactGrowthEventsRetained ? retainedGrowth : null;
  return {
    v: GENOME_RULES_V2,
    dynasty: state.dynasty,
    state,
    projection,
    loci: locusReading(state),
    strains: strainReading(state),
    activeSplices: [...state.activeSplices],
    availableGenes: genomeV2ActivePool(state.dynasty).filter(
      (geneId) => !seen.includes(geneId)
    ),
    seenGenes: seen,
    growthCommitted,
    bank: settleGenomeV2(state, 'bank'),
    crash: settleGenomeV2(state, 'crash'),
    lenses: stateFacts(state, growthCommitted),
  };
}
