import type { StrainId } from '@/shared/game/strains';

export type TacticalLoomAction = 'THREAD' | 'FORK' | 'DECLINE';
export type TacticalLoomTone = 'neutral' | 'positive' | 'danger' | 'warning';

export interface TacticalLoomGenomeSlot {
  index: number;
  kind: 'gene' | 'splice' | 'ash' | 'empty';
  label: string;
  strains: readonly StrainId[];
  detail?: string;
}
export interface TacticalLoomThreshold {
  points: number;
  name: string;
  rule: string;
  state: 'active' | 'next' | 'future' | 'locked';
  progressLabel: string;
  lockedReason?: string;
}

export interface TacticalLoomStrainProjection {
  id: StrainId;
  name: string;
  color: string;
  before: number;
  after: number;
  thresholds: readonly TacticalLoomThreshold[];
}

export interface TacticalLoomSplicePath {
  id: string;
  name: string;
  stage: 'immediate' | 'one-step';
  rule: string;
  cost: string;
  /** Recipes may stay undiscovered; their rules never do. */
  recipeKnown: boolean;
  recipeLabel: string;
  /** Knowledge stays visible before activation unlocks. */
  activation: 'available' | 'locked';
  lockedReason?: string;
}

export interface TacticalLoomFact {
  id: string;
  label: string;
  before: string;
  after: string;
  detail?: string;
  tone?: TacticalLoomTone;
}

export interface TacticalLoomConsequence {
  category: string;
  effect: string;
  cost: string;
  genomeAfter: readonly TacticalLoomGenomeSlot[];
  strains: readonly TacticalLoomStrainProjection[];
  splices: readonly TacticalLoomSplicePath[];
  ledgers: readonly TacticalLoomFact[];
  targets: readonly TacticalLoomFact[];
  body: readonly TacticalLoomFact[];
  outcomes: readonly TacticalLoomFact[];
  dynastyFacts: readonly string[];
  retainedFacts?: readonly string[];
}

export interface TacticalLoomReplacementChoice {
  slotIndex: number;
  label: string;
  kind: TacticalLoomGenomeSlot['kind'];
  growthCost: number;
  consequence: TacticalLoomConsequence;
  disabledReason?: string;
}

export interface TacticalLoomCandidate {
  action: Exclude<TacticalLoomAction, 'DECLINE'>;
  geneId: string;
  name: string;
  category: string;
  strains: readonly StrainId[];
  consequence: TacticalLoomConsequence;
  disabledReason?: string;
  replacementChoices?: readonly TacticalLoomReplacementChoice[];
}

export interface TacticalLoomDecline {
  action: 'DECLINE';
  name: string;
  consequence: TacticalLoomConsequence;
  /** Charged Loom Anchor makes DECLINE a deliberate sub-choice. */
  options?: readonly TacticalLoomDeclineOption[];
}

export interface TacticalLoomDeclineOption {
  id: string;
  label: string;
  detail: string;
  /** Undefined means decline without pinning either candidate. */
  pinCandidateIndex?: 0 | 1;
  consequence: TacticalLoomConsequence;
}

/**
 * Complete display contract for one frozen offer.
 *
 * Values in this object are facts, not suggestions. Runtime/state code owns
 * every projection and supplies already-formatted exact values; the surface
 * only compares them. Keeping this boundary display-only prevents a future
 * tuning change from making the Loom disagree with settlement.
 */
export interface TacticalLoomDecisionModel {
  rulesVersion: 1 | 2;
  title: string;
  sourceLabel: string;
  dynasty: string;
  currentGenome: readonly TacticalLoomGenomeSlot[];
  candidates: readonly [TacticalLoomCandidate, TacticalLoomCandidate];
  decline: TacticalLoomDecline;
}
