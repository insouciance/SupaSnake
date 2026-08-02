import type { ChargeStatus } from '@/shared/game/energyEnvelope';
import type { StrainId, StrainTier } from '@/shared/game/strains';
import type { DynastyId } from '@/shared/types/game';
import type { GenomeV2OverclockPresentation } from '@/components/game/genome/genomeV2RuntimeAdapter';

export type RunCockpitState = 'ready' | 'held' | 'active' | 'portal' | 'apex';
export type RunCockpitMode = 'standard' | 'free' | 'anomaly' | 'training';

export interface RunCockpitGene {
  id: string;
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
  /**
   * Latest stored-Energy snapshot (Constitution §8.6). The cockpit presents
   * the immutable run stake below, not this remaining balance.
   */
  charge: ChargeStatus | null;
  /** Immutable run stake; unlike remaining stock, this matters mid-run. */
  energyCommitment?: {
    committed: number;
    multiplierBps: number;
    state: 'charged' | 'lean' | 'exempt';
  } | null;
  /**
   * Tactical holds left in this run, and the budget they came out of. Null
   * hides the readout - which is what Training wants, since a driven run is
   * never metered. Stated up front on purpose: a hold budget the player only
   * discovers by running out is a trap, not a rule.
   */
  holds: { remaining: number; total: number } | null;
  /** Explicit, player-pulled Genome v2 speed-risk control. */
  overclock?: GenomeV2OverclockPresentation | null;
  bankDna: number;
  crashDna: number;
  /** Exact projector labels used by Genome v2 instead of client DNA math. */
  bankOutcomeLabel?: string;
  crashOutcomeLabel?: string;
  outcomeUnitLabel?: string;
  /**
   * COSMIC's constellation window: stars still on the board, and the
   * fraction of the window left before they calcify. Null on the dynasties
   * that have no constellation.
   *
   * This slot used to carry the combo multiplier and its chain length. The
   * combo was deleted in WP-3.13 on the owner's ruling that it had "no
   * thrill factor"; what took its place has to be VISIBLE for the same
   * reason the combo never needed to be - it decides where permanent lethal
   * blocks land.
   */
  constellation: { stars: number; fraction: number } | null;
  genes: readonly RunCockpitGene[];
  strains: readonly RunCockpitStrain[];
  /** Visible ladder width: legacy is four points; Genome v2 activates at 3/4/5. */
  strainPointCap?: 4 | 5;
  showGenome: boolean;
  portalLive: boolean;
  portalTicksRemaining: number;
  /** Training swaps economy instruments for presentation-only skill facts. */
  training?: {
    primaryLabel: string;
    primaryValue: string;
    secondaryLabel: string;
    secondaryValue: string;
    progressLabel: string;
    progress: number;
    progressTotal: number;
    metrics: readonly { label: string; value: string }[];
    comparison: string;
  };
}
