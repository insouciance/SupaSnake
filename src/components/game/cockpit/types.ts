import type { ChargeStatus } from '@/shared/game/energyEnvelope';
import type { GeneId } from '@/shared/game/genes';
import type { GrowthProfileId } from '@/shared/game/growth';
import type { StrainId, StrainTier } from '@/shared/game/strains';
import type { DynastyId } from '@/shared/types/game';

export type RunCockpitState = 'ready' | 'held' | 'active' | 'portal' | 'apex';
export type RunCockpitMode = 'standard' | 'free' | 'anomaly' | 'training';

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
  /**
   * The day's harvest envelope (Constitution §8.6). Null hides the readout
   * entirely - which is what the §8.6 ramp wants before the meter surfaces,
   * and what Training wants always (it never touches the envelope).
   */
  charge: ChargeStatus | null;
  /**
   * Tactical holds left in this run, and the budget they came out of. Null
   * hides the readout - which is what Training wants, since a driven run is
   * never metered. Stated up front on purpose: a hold budget the player only
   * discovers by running out is a trap, not a rule.
   */
  holds: { remaining: number; total: number } | null;
  bankDna: number;
  crashDna: number;
  comboMultiplier: number;
  chainLength: number;
  genes: readonly RunCockpitGene[];
  strains: readonly RunCockpitStrain[];
  showGenome: boolean;
  portalLive: boolean;
  portalTicksRemaining: number;
  /**
   * The live growth rate (WP-3.09): `baseGrowthForFood(profile, n)` for the
   * food about to be eaten, and the profile it came from.
   *
   * Numbers only, never the curve. The game page calls the one function that
   * knows the step (growth.ts) and hands the result over; the cockpit must
   * never derive a rate, or the HUD becomes a second copy of the curve.
   *
   * Optional because Training has no growth profile to report - a driven run
   * eats no profile food - and `null`/absent hides the instrument entirely
   * rather than printing a rate that does not apply.
   */
  growth?: {
    profileId: GrowthProfileId;
    label: string;
    perFood: number;
    foodsOnBoard: number;
  } | null;
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
