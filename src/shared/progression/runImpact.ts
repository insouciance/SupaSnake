/**
 * Canonical server-authored account impact produced by one settled run.
 *
 * This contract deliberately contains presentation facts, not mutations. DNA,
 * Mastery, Records, Discovery and clan writes have already settled before an
 * envelope is stored. Clients may review or skip it, but never claim it or
 * alter its values.
 */

export const RUN_IMPACT_VERSION = 1 as const;

export type ProgressionPillar =
  | 'mastery'
  | 'lineage'
  | 'discovery'
  | 'clan'
  | 'calendar';

export type ImpactSignificance =
  | 'routine'
  | 'notable'
  | 'milestone'
  | 'historic';

export type ProgressionDestination =
  | 'chronicle'
  | 'mastery'
  | 'records'
  | 'codex'
  | 'signal'
  | 'clan'
  | 'lab'
  | 'lineage';

export type RunOutcome = 'extracted' | 'crashed' | 'completed';

export type RunImpactKind =
  | 'mastery_xp'
  | 'mastery_level'
  | 'personal_best'
  | 'lineage_run'
  | 'record_value'
  | 'record_tier'
  | 'ladder_record'
  | 'codex_discovery'
  | 'codex_milestone'
  | 'signal_progress'
  | 'signal_completion'
  | 'signal_milestone'
  | 'clan_contribution'
  | 'clan_top_five';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface RunImpact {
  /** Stable within this session; used for idempotency and presentation state. */
  key: string;
  pillar: ProgressionPillar;
  kind: RunImpactKind;
  significance: ImpactSignificance;
  headline: string;
  detail?: string;
  before?: number;
  after?: number;
  delta?: number;
  destination?: ProgressionDestination;
  artifactRef?: string;
  metadata?: Record<string, JsonValue>;
}

export interface RunImpactReceipt {
  validated: boolean;
  score: number;
  yieldDna: number;
  dnaCredited: number;
  energyCommitted: number;
  commitmentMultiplierBps: number;
  generation: number;
  personalBest: {
    eligible: boolean;
    before: number;
    after: number;
    improved: boolean;
  };
}

export interface RunImpactAction {
  headline: string;
  destination: ProgressionDestination;
  artifactRef?: string;
}

export interface RunImpactEnvelope {
  version: typeof RUN_IMPACT_VERSION;
  sessionId: string;
  settledAt: string;
  outcome: RunOutcome;
  dynasty: 'CYBER' | 'PRIMAL' | 'COSMIC';
  receipt: RunImpactReceipt;
  impacts: RunImpact[];
  /** At most three high-salience impacts. Routine facts remain in `impacts`. */
  featuredImpactKeys: string[];
  /** Exactly zero or one next action; Results never becomes a task list. */
  recommendedAction: RunImpactAction | null;
}

export interface ProgressionMoment {
  id: string;
  pillar: ProgressionPillar;
  kind: RunImpactKind | string;
  significance: Exclude<ImpactSignificance, 'routine'>;
  headline: string;
  detail?: string;
  securedAt: string;
  destination?: ProgressionDestination;
  artifactRef?: string;
  source: { type: string; id: string };
}

export type AttentionKind = 'action' | 'recognition';
export type AttentionStatus = 'unseen' | 'seen' | 'resolved' | 'dismissed';

export interface ProgressionAttentionItem {
  id: string;
  kind: AttentionKind;
  status: AttentionStatus;
  destination: ProgressionDestination;
  headline: string;
  detail?: string;
  momentId?: string;
  /** Stable identifier of the exact earned artifact this item points at. */
  artifactRef?: string;
  source: { type: string; id: string };
  createdAt: string;
  seenAt?: string;
  resolvedAt?: string;
}

const SIGNIFICANCE_PRIORITY: Record<ImpactSignificance, number> = {
  routine: 0,
  notable: 1,
  milestone: 2,
  historic: 3,
};

/** Deterministic, stable selection for the Results presentation budget. */
export function featuredImpactKeys(impacts: readonly RunImpact[]): string[] {
  return impacts
    .map((impact, index) => ({ impact, index }))
    .filter(({ impact }) => impact.significance !== 'routine')
    .sort(
      (a, b) =>
        SIGNIFICANCE_PRIORITY[b.impact.significance] -
          SIGNIFICANCE_PRIORITY[a.impact.significance] || a.index - b.index
    )
    .slice(0, 3)
    .map(({ impact }) => impact.key);
}

export function recommendedImpactAction(
  impacts: readonly RunImpact[]
): RunImpactAction | null {
  const keys = new Set(featuredImpactKeys(impacts));
  const impact = impacts.find(
    (candidate) => keys.has(candidate.key) && candidate.destination
  );
  if (!impact?.destination) return null;
  return {
    headline: `Review ${impact.headline}`,
    destination: impact.destination,
    ...(impact.artifactRef ? { artifactRef: impact.artifactRef } : {}),
  };
}
