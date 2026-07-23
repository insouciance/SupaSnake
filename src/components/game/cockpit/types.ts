import type { GeneId } from '@/shared/game/genes';
import type { StrainId, StrainTier } from '@/shared/game/strains';
import type { DynastyId } from '@/shared/types/game';

export type RunCockpitState = 'ready' | 'held' | 'active' | 'portal' | 'apex';
export type RunCockpitMode = 'standard' | 'free' | 'anomaly';

export interface RunCockpitGene {
  id: GeneId;
  name: string;
  strains: readonly StrainId[];
  spent?: boolean;
}

export interface RunCockpitStrain {
  id: StrainId;
  name: string;
  color: string;
  points: number;
  tier: StrainTier;
  suppressed: boolean;
}

/**
 * A presentation-only snapshot. The cockpit never computes rewards or mutates
 * run state; canonical engine/store values are adapted into this model by the
 * game page.
 */
export interface RunCockpitModel {
  dynasty: DynastyId;
  state: RunCockpitState;
  mode: RunCockpitMode;
  modeLabel: string;
  modeDetail: string;
  statusText: string;
  isFirstMovementPrompt: boolean;
  score: number;
  dna: number;
  bankDna: number;
  crashDna: number;
  comboMultiplier: number;
  chainLength: number;
  genes: readonly RunCockpitGene[];
  strains: readonly RunCockpitStrain[];
  showGenome: boolean;
  portalLive: boolean;
  portalTicksRemaining: number;
}
