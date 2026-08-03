import { GENES, type GeneId, type GenePick } from '@/shared/game/genes';
import {
  SPLICES,
  SPLICE_IDS,
  spliceForPair,
  type SpliceId,
} from '@/shared/game/splices';
import {
  STRAINS,
  STRAIN_IDS,
  STRAIN_THRESHOLDS,
  STRAIN_TIER_NAMES,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';
import { describe, strainTierId } from '@/shared/game/lexicon';
import type {
  TacticalLoomConsequence,
  TacticalLoomDecisionModel,
  TacticalLoomGenomeSlot,
  TacticalLoomSplicePath,
  TacticalLoomStrainProjection,
} from './tacticalLoomPresentation';

export interface LegacyTacticalLoomInput {
  options: readonly [GeneId, GeneId];
  held: readonly GenePick[];
  strainCounts: StrainPoints;
  source: 'gene_food' | 'infuse' | null;
  showStrains: boolean;
  splicesUnlocked: boolean;
  discoveredSplices: readonly SpliceId[];
  pityStrain: StrainId | null;
}

function genomeSlots(held: readonly GenePick[], incoming?: GeneId): TacticalLoomGenomeSlot[] {
  const genes = incoming ? [...held, { id: incoming, atFood: 0 }] : [...held];
  return Array.from({ length: 6 }, (_, index) => {
    const pick = genes[index];
    return pick
      ? {
          index,
          kind: 'gene' as const,
          label: GENES[pick.id].name,
          strains: GENES[pick.id].strains,
          detail: GENES[pick.id].effect,
        }
      : { index, kind: 'empty' as const, label: 'Open locus', strains: [] };
  });
}

function strainProjection(
  option: GeneId,
  counts: StrainPoints,
  showStrains: boolean
): TacticalLoomStrainProjection[] {
  if (!showStrains) return [];
  const affected = new Set(GENES[option].strains);
  return STRAIN_IDS.filter((strain) => affected.has(strain)).map((strain) => {
    const before = counts[strain] ?? 0;
    const after = before + 1;
    const names = STRAIN_TIER_NAMES[strain];
    const tiers = [
      { points: STRAIN_THRESHOLDS.minor, name: names.minor, lexiconTier: 1 as const },
      { points: STRAIN_THRESHOLDS.expression, name: names.expression, lexiconTier: 2 as const },
      { points: STRAIN_THRESHOLDS.apex, name: names.apex, lexiconTier: 3 as const },
    ];
    return {
      id: strain,
      name: STRAINS[strain].name,
      color: STRAINS[strain].color,
      before,
      after,
      thresholds: tiers.map((tier) => {
        const entry = describe('strainTier', strainTierId(strain, tier.lexiconTier));
        return {
          points: tier.points,
          name: tier.name,
          rule: entry?.effect ?? STRAINS[strain].identity,
          state: after >= tier.points ? 'active' as const : after + 1 === tier.points ? 'next' as const : 'future' as const,
          progressLabel: after >= tier.points ? 'active' : `${tier.points - after} away`,
        };
      }),
    };
  });
}

function splicePaths(
  option: GeneId,
  held: readonly GenePick[],
  unlocked: boolean,
  discovered: ReadonlySet<SpliceId>
): TacticalLoomSplicePath[] {
  if (!unlocked) return [];
  const paths: TacticalLoomSplicePath[] = [];
  const immediate = held
    .map((pick) => spliceForPair(pick.id, option))
    .find((id): id is SpliceId => id !== null);
  if (immediate) {
    const known = discovered.has(immediate);
    const splice = SPLICES[immediate];
    const partner = splice.parents.find((geneId) => geneId !== option);
    paths.push({
      id: immediate,
      name: known ? splice.name : 'Uncatalogued Splice',
      stage: 'immediate',
      projectionState: 'forms-now',
      rule: known ? splice.effect : 'This choice creates a valid fusion in one active locus.',
      cost: known ? splice.cost : 'Its complete rule is revealed when the fusion is discovered.',
      recipeKnown: known,
      recipeLabel: known
        ? `Recipe: ${GENES[splice.parents[0]].name} + ${GENES[splice.parents[1]].name}`
        : 'Recipe not yet archived',
      partnerLabel: partner ? GENES[partner].name : undefined,
      partnerState: 'held',
      activation: 'available',
    });
  }
  for (const spliceId of SPLICE_IDS) {
    if (!discovered.has(spliceId) || spliceId === immediate) continue;
    const splice = SPLICES[spliceId];
    if (!splice.parents.includes(option)) continue;
    const partner = splice.parents[0] === option ? splice.parents[1] : splice.parents[0];
    if (held.some((pick) => pick.id === partner)) continue;
    paths.push({
      id: `${spliceId}:next`,
      name: splice.name,
      stage: 'one-step',
      projectionState: 'future',
      rule: splice.effect,
      cost: splice.cost,
      recipeKnown: true,
      recipeLabel: `Next connection: ${GENES[partner].name}`,
      partnerLabel: GENES[partner].name,
      partnerState: 'needed',
      activation: 'available',
    });
  }
  return paths;
}

function candidateConsequence(
  option: GeneId,
  input: LegacyTacticalLoomInput,
  discovered: ReadonlySet<SpliceId>
): TacticalLoomConsequence {
  const def = GENES[option];
  const strains = strainProjection(option, input.strainCounts, input.showStrains);
  const splices = splicePaths(option, input.held, input.splicesUnlocked, discovered);
  const formingSplice = splices.find((path) => path.stage === 'immediate');
  const unlockedTier = strains.flatMap((strain) =>
    strain.thresholds.map((threshold) => ({ strain, threshold }))
  ).find(({ strain, threshold }) =>
    strain.before < threshold.points && strain.after >= threshold.points
  );
  return {
    category: def.economics === 'pure' ? 'Yield & outcome' : def.economics === 'path' ? 'Execution' : 'Genome',
    trigger: { label: 'Active immediately after THREAD' },
    salienceChip: formingSplice
      ? `Forms ${formingSplice.name}`
      : unlockedTier
        ? `Unlocks ${unlockedTier.threshold.name}`
        : `+1 ${STRAINS[def.strains[0]].name}`,
    effect: def.effect,
    cost: def.cost,
    genomeAfter: genomeSlots(input.held, option),
    strains,
    splices,
    ledgers: [],
    targets: [],
    body: [],
    outcomes: [],
    dynastyFacts: [],
  };
}

function declineConsequence(input: LegacyTacticalLoomInput): TacticalLoomConsequence {
  const nextOffer = input.pityStrain
    ? `Next first slot forced to ${STRAINS[input.pityStrain].name}`
    : 'Normal weighted offer stream';
  return {
    category: 'Opportunity cost',
    trigger: { label: 'Resolves when DECLINE is confirmed', cadence: 1, unit: 'offer' },
    salienceChip: input.pityStrain
      ? `Next: ${STRAINS[input.pityStrain].name}`
      : 'Genome unchanged',
    effect: input.pityStrain
      ? `Spend this offer. The next first slot is forced to ${STRAINS[input.pityStrain].name.toUpperCase()}.`
      : 'Spend this offer and preserve every open Genome locus.',
    cost: 'Neither offered gene enters this run. The next offer keeps its normal cadence.',
    genomeAfter: genomeSlots(input.held),
    strains: [],
    splices: [],
    ledgers: [{
      id: 'next-offer',
      label: 'Next offer',
      before: 'This pair',
      after: nextOffer,
      tone: input.pityStrain ? 'positive' : 'neutral',
    }],
    targets: [],
    body: [],
    outcomes: [],
    dynastyFacts: [],
  };
}

/** Honest adapter for already-started Genome v1 sessions. */
export function buildLegacyTacticalLoomModel(
  input: LegacyTacticalLoomInput
): TacticalLoomDecisionModel {
  const discovered = new Set(input.discoveredSplices);
  return {
    rulesVersion: 1,
    title: 'Tactical Loom',
    sourceLabel: input.source === 'infuse' ? 'Portal infusion' : 'Genome offer',
    dynasty: 'ACTIVE RUN',
    currentGenome: genomeSlots(input.held),
    candidates: input.options.map((option) => ({
      action: 'THREAD' as const,
      geneId: option,
      name: GENES[option].name,
      category: GENES[option].economics,
      strains: GENES[option].strains,
      consequence: candidateConsequence(option, input, discovered),
    })) as unknown as TacticalLoomDecisionModel['candidates'],
    decline: {
      action: 'DECLINE',
      name: 'Keep this Genome',
      consequence: declineConsequence(input),
    },
  };
}
