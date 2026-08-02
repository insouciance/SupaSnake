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
  projectGenomeV2,
  reduceGenomeV2Event,
  settleGenomeV2,
  type GenomeV2Slot,
  type GenomeV2State,
  type GenomeV2StrainLadderTier,
  type TacticalLoomCandidateDelta as CoreCandidateDelta,
  type TacticalLoomModel as CoreLoomModel,
  type TacticalLoomReplacementDelta as CoreReplacementDelta,
} from '@/shared/game/genomeV2';
import { STRAINS, type StrainId, type StrainPoints } from '@/shared/game/strains';
import type {
  TacticalLoomConsequence,
  TacticalLoomDecisionModel,
  TacticalLoomFact,
  TacticalLoomGenomeSlot,
  TacticalLoomSplicePath,
  TacticalLoomStrainProjection,
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

interface EnrichedCandidateDelta extends CoreCandidateDelta {
  /** Core projector may add these exact facts without changing the surface. */
  resultingSlots?: readonly GenomeV2Slot[];
  splicePaths?: readonly {
    id: keyof typeof GENOME_V2_SPLICES;
    stage: 'immediate' | 'one-step';
    recipeKnown?: boolean;
  }[];
  targetFacts?: readonly TacticalLoomFact[];
  bodyFacts?: readonly TacticalLoomFact[];
  outcomeFacts?: readonly TacticalLoomFact[];
  dynastyFacts?: readonly string[];
}

interface EnrichedReplacementDelta extends CoreReplacementDelta {
  resultingSlots?: readonly GenomeV2Slot[];
  targetFacts?: readonly TacticalLoomFact[];
  bodyFacts?: readonly TacticalLoomFact[];
  outcomeFacts?: readonly TacticalLoomFact[];
  dynastyFacts?: readonly string[];
}

interface EnrichedLoomModel extends CoreLoomModel {
  sourceLabel?: string;
  decline?: {
    effect: string;
    cost: string;
    resultingSlots?: readonly GenomeV2Slot[];
    resultingStrainPoints?: StrainPoints;
    targetFacts?: readonly TacticalLoomFact[];
    bodyFacts?: readonly TacticalLoomFact[];
    outcomeFacts?: readonly TacticalLoomFact[];
    dynastyFacts?: readonly string[];
  };
  candidates: EnrichedCandidateDelta[];
}

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
  mutationTerms: {
    mode: 'mutate' | 'recode';
    growthCost: number;
    actionOrdinal: number;
    actionLimit: number;
    detail: string;
  };
  mutationLoom: TacticalLoomDecisionModel | null;
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
  candidate: EnrichedCandidateDelta,
  activation: GenomeV2ActivationPresentation
): TacticalLoomSplicePath[] {
  const paths = candidate.splicePaths ?? (candidate.completesSplice
    ? [{ id: candidate.completesSplice, stage: 'immediate' as const, recipeKnown: true }]
    : []);
  return paths.map((path) => {
    const splice = GENOME_V2_SPLICES[path.id];
    return {
      id: `${path.id}:${path.stage}`,
      name: splice.name,
      stage: path.stage,
      rule: splice.rule,
      cost: splice.strategicCost,
      recipeKnown: path.recipeKnown !== false,
      recipeLabel: path.recipeKnown === false
        ? 'Recipe remains undiscovered'
        : `Recipe: ${splice.parents.map((id) => GENOME_V2_GENES[id].name).join(' + ')}`,
      activation: activation.splices.unlocked ? 'available' : 'locked',
      lockedReason: activation.splices.unlocked
        ? undefined
        : [activation.splices.reason, activation.splices.progress].filter(Boolean).join(' · ') || 'Activation pending',
    };
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

function dynastyFacts(state: GenomeV2State, candidate: GenomeV2ActiveGeneId): string[] {
  const definition = GENOME_V2_GENES[candidate];
  if (definition.dynasties.length === 0) return [];
  return [`${definition.name} is a ${state.dynasty} Dynasty signature and appears only in that Dynasty's pool.`];
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
  const immediateSplices: TacticalLoomSplicePath[] = [
    replacement.breaksSplice
      ? {
          id: `${replacement.breaksSplice}:break`,
          name: GENOME_V2_SPLICES[replacement.breaksSplice].name,
          stage: 'immediate',
          rule: 'This Recode breaks the active Splice and stops its future rule.',
          cost: GENOME_V2_SPLICES[replacement.breaksSplice].strategicCost,
          recipeKnown: true,
          recipeLabel: 'Broken by the outgoing locus',
          activation: 'available',
        }
      : null,
    replacement.createsSplice
      ? {
          id: `${replacement.createsSplice}:create`,
          name: GENOME_V2_SPLICES[replacement.createsSplice].name,
          stage: 'immediate',
          rule: GENOME_V2_SPLICES[replacement.createsSplice].rule,
          cost: GENOME_V2_SPLICES[replacement.createsSplice].strategicCost,
          recipeKnown: true,
          recipeLabel: 'Created by this Recode',
          activation: input.activation.splices.unlocked ? 'available' : 'locked',
          lockedReason: input.activation.splices.unlocked
            ? undefined
            : [input.activation.splices.reason, input.activation.splices.progress].filter(Boolean).join(' · ') || 'Activation pending',
        }
      : null,
  ].filter((path): path is TacticalLoomSplicePath => path !== null);
  return {
    category: CATEGORY_LABELS[candidate.category],
    effect: candidate.projectedYieldRule,
    cost: candidate.strategicCost,
    genomeAfter: replacement.resultingSlots
      ? genomePresentation(state, replacement.resultingSlots)
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
    targets: replacement.targetFacts ?? targetFacts(state),
    body: replacement.bodyFacts ?? bodyFacts(state, input.spatial, replacement.growthCost),
    outcomes: replacement.outcomeFacts ?? outcomeFacts(state),
    dynastyFacts: replacement.dynastyFacts ?? dynastyFacts(state, candidate.geneId),
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
}

function candidateConsequence(
  state: GenomeV2State,
  projection: EnrichedLoomModel,
  candidate: EnrichedCandidateDelta,
  input: GenomeV2TacticalLoomInput
): TacticalLoomConsequence {
  return {
    category: CATEGORY_LABELS[candidate.category],
    effect: candidate.projectedYieldRule,
    cost: candidate.strategicCost,
    genomeAfter: candidate.resultingSlots
      ? genomePresentation(state, candidate.resultingSlots)
      : fallbackResultingGenome(state, candidate.geneId),
    strains: strainProjection(
      projection.strainPoints,
      candidate.resultingStrainPoints,
      GENOME_V2_GENES[candidate.geneId].strains,
      projection.ladder,
      input.activation
    ),
    splices: splicePresentation(candidate, input.activation),
    ledgers: liabilityFacts(projection),
    targets: candidate.targetFacts ?? targetFacts(state),
    body: candidate.bodyFacts ?? bodyFacts(
      state,
      input.spatial,
      state.portal ? candidate.projectedPortalActionGrowth.infuse : null
    ),
    outcomes: candidate.outcomeFacts ?? outcomeFacts(state),
    dynastyFacts: candidate.dynastyFacts ?? dynastyFacts(state, candidate.geneId),
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

function declineConsequence(
  state: GenomeV2State,
  projection: EnrichedLoomModel,
  input: GenomeV2TacticalLoomInput
): TacticalLoomConsequence {
  if (input.declineBehavior === 'return-to-portal') {
    return {
      category: 'Portal return',
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
  const enriched = projection.decline;
  const after = enriched ? state : projectedDeclineState(state);
  const afterProjection = projectGenomeV2(after, []);
  return {
    category: 'Opportunity cost',
    effect: enriched?.effect ?? (after.bonds > state.bonds
      ? 'Spend this offer, keep the current Genome, and mint one prospective BANK Bond.'
      : 'Spend this offer and keep the current Genome unchanged.'),
    cost: enriched?.cost ?? 'Neither offered gene can return in this offer.',
    genomeAfter: enriched?.resultingSlots
      ? genomePresentation(state, enriched.resultingSlots)
      : genomePresentation(after),
    strains: [],
    splices: [],
    ledgers: liabilityFacts(afterProjection, projection),
    targets: enriched?.targetFacts ?? targetFacts(after),
    body: enriched?.bodyFacts ?? bodyFacts(after, input.spatial, null),
    outcomes: enriched?.outcomeFacts ?? outcomeFacts(after),
    dynastyFacts: enriched?.dynastyFacts ?? [],
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
  const projectedCandidates = projection.candidates.map((candidate) => ({
    action: candidate.requiresReplacement ? 'FORK' as const : 'THREAD' as const,
    geneId: candidate.geneId,
    name: GENOME_V2_GENES[candidate.geneId].name,
    category: CATEGORY_LABELS[candidate.category],
    strains: GENOME_V2_GENES[candidate.geneId].strains,
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
  return {
    rulesVersion: 2,
    title: input.state.portal ? 'Mutation Loom' : 'Tactical Loom',
    sourceLabel: input.sourceLabel ?? projection.sourceLabel ?? (input.state.portal ? 'Portal Genome offer' : 'Cadence Genome offer'),
    dynasty: input.state.dynasty,
    currentGenome,
    candidates: [firstCandidate, secondCandidate],
    decline: {
      action: 'DECLINE',
      name: input.declineBehavior === 'return-to-portal' ? 'Back to Portal' : 'Keep this Genome',
      consequence: declineConsequence(input.state, projection, input),
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
  const bank = settleGenomeV2(input.state, 'bank');
  const crash = settleGenomeV2(input.state, 'crash');
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
    outcomeProjection: {
      bank: formatScaledYield(bank.genomeYield),
      crash: formatScaledYield(crash.genomeYield),
      label: 'Genome Yield · before run-stamped Ascendance and Energy',
    },
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
