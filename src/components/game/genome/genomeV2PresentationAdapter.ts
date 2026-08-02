import {
  GENOME_V2_GENES,
  type GenomeV2ActiveGeneId,
  type GenomeV2GeneCategory,
} from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  GENOME_V2_CONFIG,
  GENOME_V2_SPLICES,
  genomeV2CarryBankBps,
  genomeV2CarrySalvageBps,
  genomeV2HasGene,
  projectGenomeV2,
  reduceGenomeV2Event,
  settleGenomeV2,
  type GenomeV2Slot,
  type GenomeV2SettlementBreakdown,
  type GenomeV2SpliceId,
  type GenomeV2State,
  type GenomeV2StrainLadderTier,
  type TacticalLoomCandidateDelta as CoreCandidateDelta,
  type TacticalLoomModel as CoreLoomModel,
} from '@/shared/game/genomeV2';
import { STRAINS, type StrainId, type StrainPoints } from '@/shared/game/strains';
import type {
  TacticalLoomConsequence,
  TacticalLoomDecisionModel,
  TacticalLoomFact,
  TacticalLoomGenomeSlot,
  TacticalLoomSplicePath,
  TacticalLoomStrainProjection,
  TacticalLoomTrigger,
} from './tacticalLoomPresentation';

export interface GenomeV2UnlockPresentation {
  unlocked: boolean;
  /** Server-authored explanation. The adapter never rebuilds FTUE thresholds. */
  reason?: string;
  progress?: string;
}

export interface GenomeV2ActivationPresentation {
  continue: GenomeV2UnlockPresentation;
  portalGenome: GenomeV2UnlockPresentation;
  expressions: GenomeV2UnlockPresentation;
  splices: GenomeV2UnlockPresentation;
  apex: GenomeV2UnlockPresentation;
}

export interface GenomeV2SpatialPresentation {
  bodyLength?: number;
  occupiedSpace?: string;
}

interface ProjectedSplicePath {
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

interface ProjectedDeclineOption {
  id: string;
  label: string;
  pinGeneId: GenomeV2ActiveGeneId | null;
  anchorChargesAfter: number;
  bondAfter: number;
  loomBondAfter: { pinnedGeneId: GenomeV2ActiveGeneId; matured: boolean } | null;
  slotsAfter: GenomeV2Slot[];
  strainPointsAfter: StrainPoints;
  targetQueueAfter: number;
  bodyGrowthAddedAfter: number;
  bankAfter: GenomeV2SettlementBreakdown;
  crashAfter: GenomeV2SettlementBreakdown;
  dynasty: GenomeV2State['dynasty'];
}

interface ProjectedSlot {
  index: number;
  occupant:
    | null
    | { kind: 'gene'; geneId: GenomeV2ActiveGeneId }
    | {
        kind: 'splice';
        spliceId: GenomeV2SpliceId;
        parentGeneIds: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
      }
    | { kind: 'ash' };
}

type EnrichedReplacementDelta = CoreCandidateDelta['replacementOptions'][number] & {
  resultingSlots?: readonly ProjectedSlot[];
  resultingActiveSplices?: readonly GenomeV2SpliceId[];
};

type EnrichedCandidateDelta = CoreCandidateDelta & {
  /** Structural v2 projector seam. These members become required with the
   * authoritative core integration; optionality only keeps this branch
   * buildable on the preceding core checkpoint. */
  availability?: {
    legal: boolean;
    blockedReason: 'external_second_life' | null;
  };
  splicePaths?: readonly {
    spliceId: ProjectedSplicePath['spliceId'];
    partnerGeneId: ProjectedSplicePath['partnerGeneId'];
    state: ProjectedSplicePath['state'];
    unlocked: ProjectedSplicePath['unlocked'];
    blockedReason: ProjectedSplicePath['blockedReason'];
  }[];
  targetProjection?: {
    currentlyQueued: number;
    addedImmediately: 0;
    trigger: 'cadence' | 'event' | 'none';
    cadence: number | null;
    multiplierBps: number | null;
    routeSlackMoves: number | null;
  };
  bodyProjection?: {
    growthOnAcquire: 0;
    extraGrowthPerFood: number;
    extraGrowthCadence: number | null;
    growthOnTrigger: number;
  };
  terrainProjection?: {
    currentPermanentFacts: number;
    currentPermanentCells: number;
    createsPermanentTerrain: boolean;
    cellsPerUse: number | null;
    minimumCellsPerUse: number | null;
  };
  outcomeProjection?: {
    immediateBankDelta: 0;
    immediateCrashDelta: 0;
    bankNow: GenomeV2SettlementBreakdown;
    crashNow: GenomeV2SettlementBreakdown;
  };
  dynastyProjection?: {
    dynasty: GenomeV2State['dynasty'];
    relation: 'signature' | 'favored' | 'universal';
    legal: boolean;
  };
  resultingSlots?: readonly ProjectedSlot[] | null;
  resultingActiveSplices?: readonly GenomeV2SpliceId[] | null;
  replacementOptions: EnrichedReplacementDelta[];
};

type EnrichedLoomModel = CoreLoomModel & {
  offer?: {
    offerId: string;
    source: 'cadence' | 'portal';
    openedAtFood: number;
    openedAtTick: number;
    offerIndex: number;
    candidateGeneIds: GenomeV2ActiveGeneId[];
  } | null;
  decline?: {
    available: boolean;
    forfeitedCandidateGeneIds: GenomeV2ActiveGeneId[];
    bondBefore: number;
    bondAfter: number;
    bondDelta: number;
    anchorCanPinBeforeDecline: boolean;
    anchorChargesBefore: number;
    anchorChargesAfterPin: number;
    pinnedGeneId: GenomeV2ActiveGeneId | null;
    options: ProjectedDeclineOption[];
  };
  candidates: EnrichedCandidateDelta[];
};

export interface GenomeV2TacticalLoomInput {
  state: GenomeV2State;
  candidates?: readonly GenomeV2ActiveGeneId[];
  sourceLabel?: string;
  activation: GenomeV2ActivationPresentation;
  spatial?: GenomeV2SpatialPresentation;
  /** Portal inspection DECLINE means return, not consume the offer. */
  declineBehavior?: 'consume-offer' | 'return-to-portal';
}

export interface GenomeV2PortalPresentation {
  continueState: GenomeV2UnlockPresentation;
  mutateState: GenomeV2UnlockPresentation;
  carryProjection: {
    bankCurrent: string;
    bankNext: string;
    salvageCurrent: string;
    salvageNext: string;
  };
  /** Exact inner Genome Yield; outer run-stamped multipliers remain server-owned. */
  outcomeProjection: {
    bank: string;
    crash: string;
    label: string;
  };
  mirrorChoice: {
    available: boolean;
    detail: string;
  } | null;
  mutationTerms: {
    mode: 'mutate' | 'recode';
    growthCost: number;
    actionOrdinal: number;
    actionLimit: number;
    detail: string;
  };
  mutationLoom: TacticalLoomDecisionModel | null;
}

export interface GenomeV2OutcomePresentation {
  bank: string;
  crash: string;
  label: string;
}

const CATEGORY_LABELS: Record<GenomeV2GeneCategory, string> = {
  yield: 'Yield & compounding',
  banking: 'Banking wager',
  execution: 'Execution & route mastery',
  body: 'Body & spatial pressure',
  terrain: 'Movement & terrain',
  survival: 'Survival & insurance',
  genome: 'Genome control',
};

const GENE_TRIGGER_PRESENTATION: Readonly<
  Record<GenomeV2ActiveGeneId, TacticalLoomTrigger>
> = {
  gold_trail: { label: 'Every fifth eligible target', cadence: 5, unit: 'target' },
  compound_interest: { label: 'Each deliberate Loom DECLINE', cadence: 1, unit: 'offer' },
  loan_shark: { label: 'Portal PASS starts a six-food contract', cadence: 6, unit: 'food' },
  live_wire: { label: 'Every third eligible target', cadence: 3, unit: 'target' },
  circuit_run: { label: 'Every fourth eligible target', cadence: 4, unit: 'target' },
  time_dilation: { label: 'Always active · body cost every fourth food', cadence: 4, unit: 'food' },
  overgrowth: { label: 'Every food', cadence: 1, unit: 'food' },
  coilkeeper: { label: 'Charge eight foods, then seal territory', cadence: 8, unit: 'food' },
  wall_rush: { label: 'Charged deliberate wall impact' },
  phase_gate: { label: 'Every fifth food can charge a Gate', cadence: 5, unit: 'food' },
  mirror_wager: { label: 'Opt in on an explicit portal CONTINUE', cadence: 1, unit: 'portal' },
  phoenix: { label: 'First fatal collision while ready' },
  loom_anchor: { label: 'Pin on DECLINE · recharge on portal PASS' },
  heartwood: { label: 'Deliberate PRIMAL territory geometry' },
  zenith_protocol: { label: 'Player-triggered CYBER overclock' },
  constellation_crown: { label: 'Perfect COSMIC constellation clear' },
};

export function genomeV2CategoryLabel(category: GenomeV2GeneCategory): string {
  return CATEGORY_LABELS[category];
}

function formatBps(value: number): string {
  const safe = Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const whole = Math.floor(safe / 10_000);
  const fraction = String(safe % 10_000).padStart(4, '0').replace(/0+$/, '');
  return `×${whole}${fraction ? `.${fraction}` : ''}`;
}

function formatScaledYield(value: number): string {
  const sign = value < 0 ? '−' : '';
  const safe = Number.isSafeInteger(value) ? Math.abs(value) : 0;
  const whole = Math.floor(safe / 10_000);
  const fraction = String(safe % 10_000).padStart(4, '0').replace(/0+$/, '');
  return `${sign}${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''} Yield`;
}

function uniqueStrains(values: readonly StrainId[]): StrainId[] {
  return Array.from(new Set(values));
}

function slotPresentation(state: GenomeV2State, slot: GenomeV2Slot): TacticalLoomGenomeSlot {
  const occupant = slot.occupant;
  if (!occupant) {
    return { index: slot.index, kind: 'empty', label: 'Open locus', strains: [] };
  }
  if (occupant.kind === 'ash') {
    return {
      index: slot.index,
      kind: 'ash',
      label: 'Ash',
      strains: [],
      detail: 'Permanent spent Phoenix locus; Recode cannot remove it.',
    };
  }
  if (occupant.kind === 'gene') {
    const instance = state.instances[occupant.instanceId];
    if (!instance) {
      return { index: slot.index, kind: 'gene', label: 'Unresolved locus', strains: [] };
    }
    const definition = GENOME_V2_GENES[instance.geneId];
    return {
      index: slot.index,
      kind: 'gene',
      label: definition.name,
      strains: definition.strains,
      detail: definition.effect,
    };
  }
  const splice = GENOME_V2_SPLICES[occupant.spliceId];
  const strains = uniqueStrains(
    occupant.parentInstanceIds.flatMap((instanceId) => {
      const instance = state.instances[instanceId];
      return instance ? GENOME_V2_GENES[instance.geneId].strains : [];
    })
  );
  return {
    index: slot.index,
    kind: 'splice',
    label: splice.name,
    strains,
    detail: splice.rule,
  };
}

function genomePresentation(
  state: GenomeV2State,
  slots: readonly GenomeV2Slot[] = state.slots
): TacticalLoomGenomeSlot[] {
  return slots.map((slot) => slotPresentation(state, slot));
}

function projectedGenomePresentation(
  slots: readonly ProjectedSlot[]
): TacticalLoomGenomeSlot[] {
  return slots.map((slot) => {
    const occupant = slot.occupant;
    if (!occupant) {
      return { index: slot.index, kind: 'empty', label: 'Open locus', strains: [] };
    }
    if (occupant.kind === 'ash') {
      return {
        index: slot.index,
        kind: 'ash',
        label: 'Ash',
        strains: [],
        detail: 'Permanent spent Phoenix locus; Recode cannot remove it.',
      };
    }
    if (occupant.kind === 'gene') {
      const gene = GENOME_V2_GENES[occupant.geneId];
      return {
        index: slot.index,
        kind: 'gene',
        label: gene.name,
        strains: gene.strains,
        detail: gene.effect,
      };
    }
    const splice = GENOME_V2_SPLICES[occupant.spliceId];
    return {
      index: slot.index,
      kind: 'splice',
      label: splice.name,
      strains: uniqueStrains(
        occupant.parentGeneIds.flatMap((geneId) => GENOME_V2_GENES[geneId].strains)
      ),
      detail: splice.rule,
    };
  });
}

function fallbackResultingGenome(
  state: GenomeV2State,
  candidate: GenomeV2ActiveGeneId,
  replacementSlot?: number
): TacticalLoomGenomeSlot[] {
  const result = genomePresentation(state);
  const open = replacementSlot ?? state.slots.find((slot) => slot.occupant === null)?.index;
  if (open === undefined) return result;
  const definition = GENOME_V2_GENES[candidate];
  result[open] = {
    index: open,
    kind: 'gene',
    label: definition.name,
    strains: definition.strains,
    detail: definition.effect,
  };
  return result;
}

function lockForTier(
  points: number,
  activation: GenomeV2ActivationPresentation
): GenomeV2UnlockPresentation {
  if (points === 4) return activation.expressions;
  if (points === 5) return activation.apex;
  return { unlocked: true };
}

function strainProjection(
  before: StrainPoints,
  after: StrainPoints,
  affected: readonly StrainId[],
  ladder: CoreLoomModel['ladder'],
  activation: GenomeV2ActivationPresentation
): TacticalLoomStrainProjection[] {
  return uniqueStrains(affected).map((strain) => ({
    id: strain,
    name: STRAINS[strain].name,
    color: STRAINS[strain].color,
    before: before[strain] ?? 0,
    after: after[strain] ?? 0,
    thresholds: ladder[strain].map((tier: GenomeV2StrainLadderTier) => {
      const permission = lockForTier(tier.points, activation);
      const nextPoints = after[strain] ?? 0;
      return {
        points: tier.points,
        name: tier.name,
        rule: tier.rule,
        state: !permission.unlocked
          ? 'locked' as const
          : nextPoints >= tier.points
            ? 'active' as const
            : nextPoints + 1 === tier.points
              ? 'next' as const
              : 'future' as const,
        progressLabel: nextPoints >= tier.points
          ? permission.unlocked ? 'active' : `${nextPoints} / ${tier.points}`
          : `${tier.points - nextPoints} away`,
        lockedReason: permission.unlocked
          ? undefined
          : [permission.reason, permission.progress].filter(Boolean).join(' · ') || 'Activation pending',
      };
    }),
  }));
}

function splicePresentation(
  state: GenomeV2State,
  candidate: EnrichedCandidateDelta,
  activation: GenomeV2ActivationPresentation,
  currentActiveSplices: readonly GenomeV2SpliceId[]
): TacticalLoomSplicePath[] {
  const paths = candidate.splicePaths ?? (candidate.completesSplice
    ? [{
        spliceId: candidate.completesSplice,
        partnerGeneId: GENOME_V2_SPLICES[candidate.completesSplice].parents.find(
          (geneId) => geneId !== candidate.geneId
        ) ?? candidate.geneId,
        state: 'completes_now' as const,
        unlocked: activation.splices.unlocked,
        blockedReason: activation.splices.unlocked ? null : 'splices_locked' as const,
      }]
    : []);
  const authoritativeNew = candidate.resultingActiveSplices
    ? candidate.resultingActiveSplices.filter((id) => !currentActiveSplices.includes(id))
    : candidate.completesSplice
      ? [candidate.completesSplice]
      : [];
  const winner = authoritativeNew[0] ?? null;
  return paths.map<TacticalLoomSplicePath>((path) => {
    const splice = GENOME_V2_SPLICES[path.spliceId];
    // A partner can be held for more than one recipe, but the reducer may
    // consume the candidate into only one deterministic fusion. Never light a
    // second recipe merely because its partner was present before THREAD.
    const formsNow = path.spliceId === winner;
    const stage = formsNow ? 'immediate' as const : 'one-step' as const;
    const available = path.unlocked && activation.splices.unlocked;
    const projectionState = formsNow
      ? 'forms-now' as const
      : path.state === 'closed_by_completion'
        ? 'closed' as const
        : path.state === 'depends_on_recode'
          ? 'recode' as const
          : path.state === 'unavailable'
            ? 'unavailable' as const
            : 'future' as const;
    // `closed_by_completion` describes the candidate's fate, not ownership of
    // the other parent. A different deterministic fusion can consume this
    // candidate while the alternate recipe's partner is still entirely
    // absent. Derive HELD/NEEDS from the actual pre-choice Genome so the Loom
    // never invents a gene the player does not own.
    const partnerHeld = genomeV2HasGene(state, path.partnerGeneId);
    const partnerName = GENOME_V2_GENES[path.partnerGeneId].name;
    const recipeLabel = projectionState === 'closed'
      ? `${partnerName} is ${partnerHeld ? 'held' : 'still needed'} · ${GENOME_V2_GENES[candidate.geneId].name} is consumed by ${winner ? GENOME_V2_SPLICES[winner].name : 'the selected fusion'} and must return for this branch`
      : projectionState === 'recode'
        ? `Possible only through an outgoing-locus choice · ${splice.parents.map((id) => GENOME_V2_GENES[id].name).join(' + ')}`
        : `With ${partnerName} · ${splice.parents.map((id) => GENOME_V2_GENES[id].name).join(' + ')}`;
    return {
      id: `${path.spliceId}:${stage}`,
      name: splice.name,
      stage,
      projectionState,
      rule: splice.rule,
      cost: splice.strategicCost,
      recipeKnown: true,
      recipeLabel,
      partnerLabel: partnerName,
      partnerState: partnerHeld ? 'held' as const : 'needed' as const,
      activation: available ? 'available' : 'locked',
      lockedReason: available
        ? undefined
        : path.blockedReason === 'splices_locked'
          ? [activation.splices.reason, activation.splices.progress].filter(Boolean).join(' · ') || 'Splices are visible but not yet active'
          : [activation.splices.reason, activation.splices.progress].filter(Boolean).join(' · ') || 'Activation pending',
    };
  }).sort((left, right) => {
    if (left.stage !== right.stage) return left.stage === 'immediate' ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function liabilityFacts(
  model: CoreLoomModel,
  beforeModel: CoreLoomModel = model
): TacticalLoomFact[] {
  const { liabilities } = model;
  const before = beforeModel.liabilities;
  return [
    {
      id: 'carry',
      label: 'Carry',
      before: `${formatBps(before.bankMultiplierBps)} BANK / ${formatBps(before.salvageMultiplierBps)} crash`,
      after: `${formatBps(liabilities.bankMultiplierBps)} BANK / ${formatBps(liabilities.salvageMultiplierBps)} crash`,
    },
    { id: 'bonds', label: 'Bonds', before: String(before.bonds), after: String(liabilities.bonds) },
    {
      id: 'escrow',
      label: 'Escrow',
      before: formatScaledYield(before.loanEscrow),
      after: formatScaledYield(liabilities.loanEscrow),
      detail: liabilities.loanFoodsRemaining > 0 ? `${liabilities.loanFoodsRemaining} contract foods remain.` : 'No active contract.',
    },
    { id: 'stake', label: 'Stake', before: formatScaledYield(before.mirrorStake), after: formatScaledYield(liabilities.mirrorStake) },
    {
      id: 'second-life',
      label: 'Second life',
      before: before.phoenixAvailable ? 'Phoenix ready' : 'None ready',
      after: liabilities.phoenixAvailable ? 'Phoenix ready' : 'None ready',
    },
  ];
}

function targetFacts(state: GenomeV2State): TacticalLoomFact[] {
  const active = Object.values(state.targets).filter((target) => ['active', 'armed'].includes(target.lifecycle));
  const next = state.targetQueue[0];
  return [
    {
      id: 'active-targets',
      label: 'Active target contracts',
      before: String(active.length),
      after: String(active.length),
      detail: active.length > 0 ? active.map((target) => target.kind).join(' · ') : 'No transformed target is active.',
    },
    {
      id: 'target-queue',
      label: 'Next queued transform',
      before: next?.kind ?? 'Ordinary',
      after: next?.kind ?? 'Ordinary',
      detail: `${state.targetQueue.length} queued exclusive transformation${state.targetQueue.length === 1 ? '' : 's'}.`,
    },
  ];
}

function projectedTargetFacts(
  state: GenomeV2State,
  candidate: EnrichedCandidateDelta
): TacticalLoomFact[] {
  const projected = candidate.targetProjection;
  if (!projected) return targetFacts(state);
  const trigger = projected.trigger === 'none'
    ? 'No target transformation'
    : projected.trigger === 'cadence'
      ? `Every ${projected.cadence ?? '?'} eligible targets`
      : 'Player-created event';
  const reward = projected.multiplierBps === null
    ? trigger
    : `${trigger} · ${formatBps(projected.multiplierBps)} target`;
  const route = projected.routeSlackMoves === null
    ? undefined
    : `${projected.routeSlackMoves} route-slack moves are included in the authoritative budget.`;
  return [
    {
      id: 'target-rule',
      label: 'Future target rule',
      before: 'Current Genome only',
      after: reward,
      detail: route,
    },
    {
      id: 'target-queue',
      label: 'Queued transforms now',
      before: String(projected.currentlyQueued),
      after: String(projected.currentlyQueued + projected.addedImmediately),
      detail: 'Taking a gene never changes an already spawned target retroactively.',
    },
  ];
}

function bodyFacts(
  state: GenomeV2State,
  spatial: GenomeV2SpatialPresentation | undefined,
  growthCost: number | null
): TacticalLoomFact[] {
  const facts: TacticalLoomFact[] = [];
  if (spatial?.bodyLength !== undefined) {
    facts.push({
      id: 'body-length',
      label: 'Current body',
      before: `${spatial.bodyLength} segments`,
      after: growthCost && growthCost > 0 ? `+${growthCost} on commit` : `${spatial.bodyLength} segments`,
    });
  }
  if (spatial?.occupiedSpace) {
    facts.push({ id: 'occupied-space', label: 'Occupied space', before: spatial.occupiedSpace, after: spatial.occupiedSpace });
  }
  facts.push({
    id: 'permanent-terrain',
    label: 'Permanent Genome terrain',
    before: `${state.permanentTerrain.length} formations`,
    after: `${state.permanentTerrain.length} formations`,
  });
  return facts;
}

function projectedBodyFacts(
  state: GenomeV2State,
  candidate: EnrichedCandidateDelta,
  spatial: GenomeV2SpatialPresentation | undefined,
  commitGrowth: number | null
): TacticalLoomFact[] {
  const projected = candidate.bodyProjection;
  if (!projected) return bodyFacts(state, spatial, commitGrowth);
  const facts = bodyFacts(state, spatial, commitGrowth);
  if (projected.extraGrowthPerFood > 0) {
    facts.push({
      id: 'future-growth',
      label: 'Future body pressure',
      before: 'Current growth profile',
      after: projected.extraGrowthCadence === 1
        ? `+${projected.extraGrowthPerFood} extra per food`
        : `+${projected.extraGrowthPerFood} extra every ${projected.extraGrowthCadence ?? '?'} foods`,
    });
  }
  if (projected.growthOnTrigger > 0) {
    facts.push({
      id: 'trigger-growth',
      label: 'Triggered body cost',
      before: 'None',
      after: `+${projected.growthOnTrigger} segments when triggered`,
    });
  }
  return facts;
}

function projectedTerrainFacts(
  state: GenomeV2State,
  candidate: EnrichedCandidateDelta
): TacticalLoomFact[] {
  const projected = candidate.terrainProjection;
  if (!projected) return [];
  const existing = `${projected.currentPermanentFacts} facts · ${projected.currentPermanentCells} cells`;
  return [{
    id: 'terrain-rule',
    label: 'Permanent terrain',
    before: existing,
    after: projected.createsPermanentTerrain
      ? projected.cellsPerUse !== null
        ? `Creates ${projected.cellsPerUse} permanent cells per use`
        : `Creates at least ${projected.minimumCellsPerUse ?? 0} permanent cells per use`
      : 'No new permanent-terrain rule',
    detail: projected.createsPermanentTerrain
      ? 'Scars and sealed cells remain part of this run’s geometry.'
      : undefined,
  }];
}

function outcomeFacts(state: GenomeV2State): TacticalLoomFact[] {
  const bank = settleGenomeV2(state, 'bank');
  const crash = settleGenomeV2(state, 'crash');
  return [
    {
      id: 'bank',
      label: 'BANK Genome Yield',
      before: formatScaledYield(bank.genomeYield),
      after: formatScaledYield(bank.genomeYield),
      tone: 'positive',
    },
    {
      id: 'crash',
      label: 'Crash Genome Yield',
      before: formatScaledYield(crash.genomeYield),
      after: formatScaledYield(crash.genomeYield),
      tone: 'danger',
    },
  ];
}

function projectedOutcomeFacts(
  state: GenomeV2State,
  candidate: EnrichedCandidateDelta
): TacticalLoomFact[] {
  const projected = candidate.outcomeProjection;
  if (!projected) return outcomeFacts(state);
  return [
    {
      id: 'bank',
      label: 'BANK Genome Yield now',
      before: formatScaledYield(projected.bankNow.genomeYield),
      after: formatScaledYield(projected.bankNow.genomeYield),
      detail: 'Acquisition has no retroactive Yield effect.',
      tone: 'positive',
    },
    {
      id: 'crash',
      label: 'Crash Genome Yield now',
      before: formatScaledYield(projected.crashNow.genomeYield),
      after: formatScaledYield(projected.crashNow.genomeYield),
      detail: 'Future execution changes the outcome; this choice does not rewrite earned Yield.',
      tone: 'danger',
    },
  ];
}

export function buildGenomeV2OutcomePresentation(
  state: GenomeV2State
): GenomeV2OutcomePresentation {
  const bank = settleGenomeV2(state, 'bank');
  const crash = settleGenomeV2(state, 'crash');
  return {
    bank: formatScaledYield(bank.genomeYield),
    crash: formatScaledYield(crash.genomeYield),
    label: 'Genome Yield · before run-stamped Ascendance and Energy',
  };
}

function dynastyFacts(state: GenomeV2State, candidate: GenomeV2ActiveGeneId): string[] {
  const definition = GENOME_V2_GENES[candidate];
  if (definition.dynasties.length === 0) return [];
  return [`${definition.name} is a ${state.dynasty} Dynasty signature and appears only in that Dynasty's pool.`];
}

function projectedDynastyFacts(
  state: GenomeV2State,
  candidate: EnrichedCandidateDelta
): string[] {
  const projection = candidate.dynastyProjection;
  if (!projection) return dynastyFacts(state, candidate.geneId);
  if (projection.relation === 'signature') {
    return [`${GENOME_V2_GENES[candidate.geneId].name} is this ${projection.dynasty} run’s signature gene.`];
  }
  if (projection.relation === 'favored') {
    return [`This gene is deliberately favored by ${projection.dynasty}; Dynasty fit is part of the build decision.`];
  }
  return [`This is a universal gene. Its value still depends on ${projection.dynasty} speed, growth, and board state.`];
}

function highestSalienceChip(
  consequence: TacticalLoomConsequence,
  fallback: string
): string {
  const formingSplice = consequence.splices.find(
    (path) => path.stage === 'immediate' && path.activation === 'available'
  );
  if (formingSplice) return `Forms ${formingSplice.name}`;
  const newlyActive = consequence.strains.flatMap((strain) =>
    strain.thresholds.map((threshold) => ({ strain, threshold }))
  ).find(({ strain, threshold }) =>
    strain.before < threshold.points
    && strain.after >= threshold.points
    && threshold.state === 'active'
  );
  if (newlyActive) return `Unlocks ${newlyActive.threshold.name}`;
  const bodyCommit = consequence.body.find((fact) =>
    fact.id === 'body-length' && fact.after.startsWith('+')
  );
  if (bodyCommit) return `${bodyCommit.after.replace(' on commit', '')} body`;
  const changedLedger = consequence.ledgers.find((fact) => fact.before !== fact.after);
  if (changedLedger) return `${changedLedger.label}: ${changedLedger.after}`;
  const targetRule = consequence.targets.find((fact) => fact.id === 'target-rule');
  if (targetRule && targetRule.before !== targetRule.after) return targetRule.after;
  const nextTier = consequence.strains.flatMap((strain) =>
    strain.thresholds
      .filter((threshold) => threshold.state === 'next')
      .map((threshold) => `${threshold.name} · ${threshold.progressLabel}`)
  )[0];
  return nextTier ?? fallback;
}

function replacementConsequence(
  state: GenomeV2State,
  projection: EnrichedLoomModel,
  candidate: EnrichedCandidateDelta,
  replacement: EnrichedReplacementDelta,
  input: GenomeV2TacticalLoomInput
): TacticalLoomConsequence {
  const affected = uniqueStrains([...replacement.removedStrains, ...replacement.addedStrains]);
  const retained = replacement.retainedLiabilities;
  const immediateSplices: TacticalLoomSplicePath[] = [];
  if (replacement.breaksSplice) {
    immediateSplices.push({
      id: `${replacement.breaksSplice}:break`,
      name: GENOME_V2_SPLICES[replacement.breaksSplice].name,
      stage: 'immediate',
      projectionState: 'breaks',
      rule: 'This Recode breaks the active Splice and stops its future rule.',
      cost: GENOME_V2_SPLICES[replacement.breaksSplice].strategicCost,
      recipeKnown: true,
      recipeLabel: 'Broken by the outgoing locus',
      activation: 'available',
    });
  }
  if (replacement.createsSplice) {
    immediateSplices.push({
      id: `${replacement.createsSplice}:create`,
      name: GENOME_V2_SPLICES[replacement.createsSplice].name,
      stage: 'immediate',
      projectionState: 'forms-now',
      rule: GENOME_V2_SPLICES[replacement.createsSplice].rule,
      cost: GENOME_V2_SPLICES[replacement.createsSplice].strategicCost,
      recipeKnown: true,
      recipeLabel: 'Created by this Recode',
      activation: input.activation.splices.unlocked ? 'available' : 'locked',
      lockedReason: input.activation.splices.unlocked
        ? undefined
        : [input.activation.splices.reason, input.activation.splices.progress].filter(Boolean).join(' · ') || 'Activation pending',
    });
  }
  const consequence: TacticalLoomConsequence = {
    category: CATEGORY_LABELS[candidate.category],
    trigger: GENE_TRIGGER_PRESENTATION[candidate.geneId],
    effect: candidate.projectedYieldRule,
    cost: candidate.strategicCost,
    genomeAfter: replacement.resultingSlots
      ? projectedGenomePresentation(replacement.resultingSlots)
      : fallbackResultingGenome(state, candidate.geneId, replacement.slot),
    strains: strainProjection(
      projection.strainPoints,
      replacement.resultingStrainPoints,
      affected,
      projection.ladder,
      input.activation
    ),
    splices: immediateSplices,
    ledgers: [
      { id: 'bonds', label: 'Bonds retained', before: String(retained.bonds), after: String(retained.bonds) },
      { id: 'escrow', label: 'Escrow retained', before: formatScaledYield(retained.loanEscrow), after: formatScaledYield(retained.loanEscrow) },
      { id: 'stake', label: 'Stake retained', before: formatScaledYield(retained.mirrorStake), after: formatScaledYield(retained.mirrorStake) },
    ],
    targets: projectedTargetFacts(state, candidate),
    body: [
      ...projectedBodyFacts(state, candidate, input.spatial, replacement.growthCost),
      ...projectedTerrainFacts(state, candidate),
    ],
    outcomes: projectedOutcomeFacts(state, candidate),
    dynastyFacts: projectedDynastyFacts(state, candidate),
    retainedFacts: [
      'earned Yield',
      'Bonds',
      'Escrow',
      'Stake',
      'Ash',
      'prior growth',
      'Scars and seals',
      ...(replacement.losesSecondLife ? ['Phoenix is lost with the outgoing locus'] : []),
    ],
  };
  return {
    ...consequence,
    salienceChip: replacement.breaksSplice
      ? `Breaks ${GENOME_V2_SPLICES[replacement.breaksSplice].name}`
      : highestSalienceChip(consequence, `Replaces locus ${replacement.slot + 1}`),
  };
}

function candidateConsequence(
  state: GenomeV2State,
  projection: EnrichedLoomModel,
  candidate: EnrichedCandidateDelta,
  input: GenomeV2TacticalLoomInput
): TacticalLoomConsequence {
  const consequence: TacticalLoomConsequence = {
    category: CATEGORY_LABELS[candidate.category],
    trigger: GENE_TRIGGER_PRESENTATION[candidate.geneId],
    effect: candidate.projectedYieldRule,
    cost: candidate.strategicCost,
    genomeAfter: candidate.resultingSlots
      ? projectedGenomePresentation(candidate.resultingSlots)
      : fallbackResultingGenome(state, candidate.geneId),
    strains: strainProjection(
      projection.strainPoints,
      candidate.resultingStrainPoints,
      GENOME_V2_GENES[candidate.geneId].strains,
      projection.ladder,
      input.activation
    ),
    splices: splicePresentation(
      state,
      candidate,
      input.activation,
      projection.activeSplices
    ),
    ledgers: liabilityFacts(projection),
    targets: projectedTargetFacts(state, candidate),
    body: [
      ...projectedBodyFacts(
        state,
        candidate,
        input.spatial,
        state.portal ? candidate.projectedPortalActionGrowth.infuse : null
      ),
      ...projectedTerrainFacts(state, candidate),
    ],
    outcomes: projectedOutcomeFacts(state, candidate),
    dynastyFacts: projectedDynastyFacts(state, candidate),
  };
  return {
    ...consequence,
    salienceChip: highestSalienceChip(
      consequence,
      `+1 ${GENOME_V2_GENES[candidate.geneId].strains[0]}`
    ),
  };
}

function projectedDeclineState(state: GenomeV2State): GenomeV2State {
  if (!state.offer) return state;
  return reduceGenomeV2Event(state, {
    type: 'offer_declined',
    offerId: state.offer.offerId,
    index: state.eventIndex + 1,
    tick: state.tick,
    eventId: `loom-projection:decline:${state.eventIndex + 1}`,
  });
}

function declineOptionConsequence(
  state: GenomeV2State,
  projection: EnrichedLoomModel,
  option: ProjectedDeclineOption,
  input: GenomeV2TacticalLoomInput
): TacticalLoomConsequence {
  const decline = projection.decline;
  const bondDelta = option.bondAfter - projection.liabilities.bonds;
  const consequence: TacticalLoomConsequence = {
    category: option.pinGeneId ? 'Genome control' : 'Opportunity cost',
    trigger: { label: 'Resolves when DECLINE is confirmed', cadence: 1, unit: 'offer' },
    effect: option.pinGeneId
      ? `Spend one charged Anchor to preserve ${GENOME_V2_GENES[option.pinGeneId].name} for its next legal offer.`
      : bondDelta > 0
        ? `Forfeit both candidates and create ${bondDelta} prospective BANK Bond${bondDelta === 1 ? '' : 's'}.`
        : 'Forfeit both candidates and keep the active Genome.',
    cost: option.pinGeneId
      ? 'The Anchor remains empty until an explicit portal CONTINUE recharges it.'
      : 'Neither offered build opportunity is taken.',
    genomeAfter: genomePresentation(state, option.slotsAfter),
    strains: [],
    splices: [],
    ledgers: [
      {
        id: 'bonds',
        label: 'Bonds',
        before: String(projection.liabilities.bonds),
        after: String(option.bondAfter),
      },
      {
        id: 'anchor',
        label: 'Anchor charges',
        before: String(decline?.anchorChargesBefore ?? option.anchorChargesAfter),
        after: String(option.anchorChargesAfter),
      },
      {
        id: 'loom-bond',
        label: 'Loom Bond',
        before: 'None',
        after: option.loomBondAfter
          ? `${GENOME_V2_GENES[option.loomBondAfter.pinnedGeneId].name} · ${option.loomBondAfter.matured ? 'matured' : 'bound'}`
          : 'None',
      },
    ],
    targets: [{
      id: 'target-queue',
      label: 'Queued target transforms',
      before: String(state.targetQueue.length),
      after: String(option.targetQueueAfter),
    }],
    body: [
      ...bodyFacts(state, input.spatial, null),
      {
        id: 'genome-growth',
        label: 'Genome-added growth',
        before: String((state as GenomeV2State & { bodyGrowthAdded?: number }).bodyGrowthAdded ?? 0),
        after: String(option.bodyGrowthAddedAfter),
      },
    ],
    outcomes: [
      {
        id: 'bank',
        label: 'BANK Genome Yield',
        before: formatScaledYield(settleGenomeV2(state, 'bank').genomeYield),
        after: formatScaledYield(option.bankAfter.genomeYield),
        tone: 'positive',
      },
      {
        id: 'crash',
        label: 'Crash Genome Yield',
        before: formatScaledYield(settleGenomeV2(state, 'crash').genomeYield),
        after: formatScaledYield(option.crashAfter.genomeYield),
        tone: 'danger',
      },
    ],
    dynastyFacts: [`DECLINE resolves inside the frozen ${option.dynasty} run state.`],
  };
  return {
    ...consequence,
    salienceChip: option.pinGeneId
      ? `Pins ${GENOME_V2_GENES[option.pinGeneId].name}`
      : bondDelta > 0
        ? `BANK Bond ${projection.liabilities.bonds} → ${option.bondAfter}`
        : 'Genome unchanged',
  };
}

function declineConsequence(
  state: GenomeV2State,
  projection: EnrichedLoomModel,
  input: GenomeV2TacticalLoomInput
): TacticalLoomConsequence {
  if (input.declineBehavior === 'return-to-portal') {
    return {
      category: 'Portal return',
      salienceChip: 'No commitment',
      trigger: { label: 'Return before committing a mutation' },
      effect: 'Return to BANK / CONTINUE / MUTATE without consuming this portal or its Genome offer.',
      cost: 'No build choice is committed.',
      genomeAfter: genomePresentation(state),
      strains: [],
      splices: [],
      ledgers: liabilityFacts(projection),
      targets: targetFacts(state),
      body: bodyFacts(state, input.spatial, null),
      outcomes: outcomeFacts(state),
      dynastyFacts: [],
    };
  }
  const authoritative = projection.decline?.options.find(
    (option) => option.pinGeneId === null
  );
  if (authoritative) {
    return declineOptionConsequence(state, projection, authoritative, input);
  }
  // Compatibility only for the preceding v2 core checkpoint. Once the
  // authoritative projector exposes `decline.options`, this path is unused.
  const after = projectedDeclineState(state);
  const afterProjection = projectGenomeV2(after, []);
  return {
    category: 'Opportunity cost',
    salienceChip: after.bonds > state.bonds ? `BANK Bond ${state.bonds} → ${after.bonds}` : 'Genome unchanged',
    trigger: { label: 'Resolves when DECLINE is confirmed', cadence: 1, unit: 'offer' },
    effect: after.bonds > state.bonds
      ? 'Spend this offer, keep the current Genome, and mint one prospective BANK Bond.'
      : 'Spend this offer and keep the current Genome unchanged.',
    cost: 'Neither offered gene can return in this offer.',
    genomeAfter: genomePresentation(after),
    strains: [],
    splices: [],
    ledgers: liabilityFacts(afterProjection, projection),
    targets: targetFacts(after),
    body: bodyFacts(after, input.spatial, null),
    outcomes: outcomeFacts(after),
    dynastyFacts: [],
  };
}

export function buildGenomeV2TacticalLoomModel(
  input: GenomeV2TacticalLoomInput
): TacticalLoomDecisionModel | null {
  if (input.state.v !== GENOME_RULES_V2) return null;
  const candidates = input.candidates ?? input.state.offer?.candidateGeneIds ?? input.state.portal?.genomeOffer?.candidates ?? [];
  if (candidates.length !== 2) return null;
  const projection = projectGenomeV2(input.state, candidates) as EnrichedLoomModel;
  if (projection.candidates.length !== 2) return null;
  const currentGenome = genomePresentation(input.state);
  const projectedCandidates = (projection.candidates as EnrichedCandidateDelta[]).map((candidate) => ({
    action: candidate.requiresReplacement ? 'FORK' as const : 'THREAD' as const,
    geneId: candidate.geneId,
    name: GENOME_V2_GENES[candidate.geneId].name,
    category: CATEGORY_LABELS[candidate.category],
    strains: GENOME_V2_GENES[candidate.geneId].strains,
    disabledReason: candidate.availability?.legal === false
      ? candidate.availability.blockedReason === 'external_second_life'
        ? 'Another second life is already active'
        : 'Unavailable in this run state'
      : undefined,
    consequence: candidateConsequence(input.state, projection, candidate, input),
    replacementChoices: candidate.requiresReplacement
      ? candidate.replacementOptions.map((replacement) => ({
          slotIndex: replacement.slot,
          label: currentGenome[replacement.slot]?.label ?? `Locus ${replacement.slot + 1}`,
          kind: currentGenome[replacement.slot]?.kind ?? 'gene',
          growthCost: replacement.growthCost,
          consequence: replacementConsequence(
            input.state,
            projection,
            candidate,
            replacement,
            input
          ),
          disabledReason: replacement.allowed
            ? undefined
            : replacement.blockedReason === 'ash_is_permanent'
              ? 'Ash is permanent'
              : 'This locus cannot be replaced',
        }))
      : undefined,
  }));
  const firstCandidate = projectedCandidates[0];
  const secondCandidate = projectedCandidates[1];
  if (!firstCandidate || !secondCandidate) return null;
  const declineOptions = input.declineBehavior === 'return-to-portal'
    ? undefined
    : projection.decline?.options.map((option) => {
        const candidateIndex = option.pinGeneId === null
          ? undefined
          : candidates.findIndex((geneId) => geneId === option.pinGeneId);
        return {
          id: option.id,
          label: option.label,
          detail: option.pinGeneId
            ? `Anchor ${projection.decline?.anchorChargesBefore ?? 0} → ${option.anchorChargesAfter} · preserve ${GENOME_V2_GENES[option.pinGeneId].name}`
            : option.bondAfter > projection.liabilities.bonds
              ? `Bonds ${projection.liabilities.bonds} → ${option.bondAfter}`
              : 'No pin · no replacement',
          ...(candidateIndex === 0 || candidateIndex === 1
            ? { pinCandidateIndex: candidateIndex as 0 | 1 }
            : {}),
          consequence: declineOptionConsequence(input.state, projection, option, input),
        };
      });
  return {
    rulesVersion: 2,
    title: input.state.portal ? 'Mutation Loom' : 'Tactical Loom',
    sourceLabel: input.sourceLabel ?? (input.state.portal ? 'Portal Genome offer' : 'Cadence Genome offer'),
    dynasty: input.state.dynasty,
    currentGenome,
    candidates: [firstCandidate, secondCandidate],
    decline: {
      action: 'DECLINE',
      name: input.declineBehavior === 'return-to-portal' ? 'Back to Portal' : 'Keep this Genome',
      consequence: declineConsequence(input.state, projection, input),
      options: declineOptions && declineOptions.length > 1 ? declineOptions : undefined,
    },
  };
}

export function buildGenomeV2PortalPresentation(
  input: Omit<GenomeV2TacticalLoomInput, 'candidates' | 'declineBehavior'>
): GenomeV2PortalPresentation {
  const projection = projectGenomeV2(
    input.state,
    input.state.portal?.genomeOffer?.candidates ?? []
  );
  const first = projection.candidates[0];
  const full = first?.requiresReplacement === true;
  const growthCost = full
    ? first?.projectedPortalActionGrowth.recode ?? 0
    : first?.projectedPortalActionGrowth.infuse ?? 0;
  const actionOrdinal = input.state.portalGenomeActions + 1;
  const actionLimit = GENOME_V2_CONFIG.portalGenome.maxActions;
  const hasOffer = input.state.portal?.genomeOffer?.candidates.length === 2;
  const withinLimit = actionOrdinal <= actionLimit;
  const outcomeProjection = buildGenomeV2OutcomePresentation(input.state);
  const mutationLoom = hasOffer && withinLimit
    ? buildGenomeV2TacticalLoomModel({
        ...input,
        candidates: input.state.portal!.genomeOffer!.candidates,
        declineBehavior: 'return-to-portal',
      })
    : null;
  return {
    continueState: input.activation.continue,
    mutateState: !input.activation.portalGenome.unlocked
      ? input.activation.portalGenome
      : !withinLimit
        ? { unlocked: false, reason: 'Portal Genome action limit reached' }
        : !hasOffer
          ? { unlocked: false, reason: 'No immutable Genome offer is attached to this portal' }
          : { unlocked: true },
    carryProjection: {
      bankCurrent: formatBps(genomeV2CarryBankBps(input.state.carryPasses)),
      bankNext: formatBps(genomeV2CarryBankBps(input.state.carryPasses + 1)),
      salvageCurrent: formatBps(genomeV2CarrySalvageBps(input.state.carryPasses)),
      salvageNext: formatBps(genomeV2CarrySalvageBps(input.state.carryPasses + 1)),
    },
    outcomeProjection,
    mirrorChoice: genomeV2HasGene(input.state, 'mirror_wager')
      ? {
          available: true,
          detail: 'Divert 40% of the next leg into visible Stake; BANK doubles it and crash forfeits it. Ordinary salvage stays unchanged.',
        }
      : null,
    mutationTerms: {
      mode: full ? 'recode' : 'mutate',
      growthCost,
      actionOrdinal,
      actionLimit,
      detail: full
        ? 'Choose the incoming gene, then the outgoing locus. Liabilities and permanent consequences remain.'
        : 'Choose one of the two immutable portal genes.',
    },
    mutationLoom,
  };
}

export const genomeV2PresentationFormat = {
  bps: formatBps,
  scaledYield: formatScaledYield,
};
