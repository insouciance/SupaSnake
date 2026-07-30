/**
 * Client boundary for the server-authored Career Spine receipt.
 *
 * This deliberately validates unknown JSON instead of trusting the settlement
 * response. The server owns every progress mutation and every significance
 * decision; this module only decides whether an answer is safe to present.
 * Nothing here persists progress or reconstructs an authoritative milestone.
 */

import {
  RUN_IMPACT_VERSION,
  type ImpactSignificance,
  type JsonValue,
  type ProgressionDestination,
  type ProgressionPillar,
  type RunImpact,
  type RunImpactEnvelope,
  type RunImpactKind,
  type RunImpactReceipt,
  type RunOutcome,
} from '@/shared/progression/runImpact';

export { RUN_IMPACT_VERSION };
export type { RunImpact, RunImpactEnvelope, RunImpactReceipt };
export type RunImpactOutcome = RunOutcome;
export type RunImpactPillar = ProgressionPillar;
export type RunImpactSignificance = ImpactSignificance;
export type RunImpactDestination = ProgressionDestination;
export type RunImpactDynasty = RunImpactEnvelope['dynasty'];

export interface RunImpactGroup {
  id: 'growth' | 'discovery' | 'clan-world';
  label: string;
  significance: RunImpactSignificance;
  impacts: RunImpact[];
}

const PILLARS = new Set<RunImpactPillar>([
  'mastery',
  'lineage',
  'discovery',
  'clan',
  'calendar',
]);
const SIGNIFICANCE = new Set<RunImpactSignificance>([
  'routine',
  'notable',
  'milestone',
  'historic',
]);
const OUTCOMES = new Set<RunImpactOutcome>([
  'extracted',
  'crashed',
  'completed',
]);
const DYNASTIES = new Set<RunImpactDynasty>(['CYBER', 'PRIMAL', 'COSMIC']);
const KINDS = new Set<RunImpactKind>([
  'mastery_xp',
  'mastery_level',
  'personal_best',
  'lineage_run',
  'record_value',
  'record_tier',
  'ladder_record',
  'codex_discovery',
  'codex_milestone',
  'signal_progress',
  'signal_completion',
  'signal_milestone',
  'clan_contribution',
  'clan_top_five',
]);
const DESTINATIONS = new Set<RunImpactDestination>([
  'chronicle',
  'mastery',
  'records',
  'codex',
  'signal',
  'clan',
  'lab',
  'lineage',
]);

const SIGNIFICANCE_RANK: Record<RunImpactSignificance, number> = {
  routine: 0,
  notable: 1,
  milestone: 2,
  historic: 3,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isObject(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

function parseImpact(value: unknown): RunImpact | null {
  if (!isObject(value)) return null;
  if (
    typeof value.key !== 'string' ||
    value.key.length === 0 ||
    typeof value.kind !== 'string' ||
    value.kind.length === 0 ||
    !KINDS.has(value.kind as RunImpactKind) ||
    typeof value.headline !== 'string' ||
    value.headline.length === 0 ||
    !PILLARS.has(value.pillar as RunImpactPillar) ||
    !SIGNIFICANCE.has(value.significance as RunImpactSignificance)
  ) {
    return null;
  }

  const destination = DESTINATIONS.has(value.destination as RunImpactDestination)
    ? (value.destination as RunImpactDestination)
    : undefined;
  const before = finiteNumber(value.before);
  const after = finiteNumber(value.after);
  const delta = finiteNumber(value.delta);

  return {
    key: value.key,
    pillar: value.pillar as RunImpactPillar,
    kind: value.kind as RunImpactKind,
    significance: value.significance as RunImpactSignificance,
    headline: value.headline,
    ...(typeof value.detail === 'string' && value.detail.length > 0
      ? { detail: value.detail }
      : {}),
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
    ...(delta !== undefined ? { delta } : {}),
    ...(destination ? { destination } : {}),
    ...(typeof value.artifactRef === 'string' && value.artifactRef.length > 0
      ? { artifactRef: value.artifactRef }
      : {}),
    ...(isObject(value.metadata) && isJsonValue(value.metadata)
      ? { metadata: value.metadata }
      : {}),
  };
}

/** Return null for any malformed envelope; partial progress must never be invented. */
export function parseRunImpactEnvelope(value: unknown): RunImpactEnvelope | null {
  if (!isObject(value) || value.version !== RUN_IMPACT_VERSION) return null;
  if (
    typeof value.sessionId !== 'string' ||
    value.sessionId.length === 0 ||
    typeof value.settledAt !== 'string' ||
    Number.isNaN(Date.parse(value.settledAt)) ||
    !DYNASTIES.has(value.dynasty as RunImpactDynasty) ||
    !OUTCOMES.has(value.outcome as RunImpactOutcome) ||
    !isObject(value.receipt) ||
    !Array.isArray(value.impacts) ||
    !Array.isArray(value.featuredImpactKeys)
  ) {
    return null;
  }

  const rawPersonalBest = value.receipt.personalBest;
  if (
    typeof value.receipt.validated !== 'boolean' ||
    !isObject(rawPersonalBest) ||
    typeof rawPersonalBest.eligible !== 'boolean' ||
    typeof rawPersonalBest.improved !== 'boolean'
  ) {
    return null;
  }
  const personalBestBefore = nonNegativeInteger(rawPersonalBest.before);
  const personalBestAfter = nonNegativeInteger(rawPersonalBest.after);
  if (
    personalBestBefore === undefined ||
    personalBestAfter === undefined ||
    personalBestAfter < personalBestBefore ||
    rawPersonalBest.eligible !== value.receipt.validated ||
    rawPersonalBest.improved !==
      (rawPersonalBest.eligible && personalBestAfter > personalBestBefore)
  ) {
    return null;
  }

  const receipt: RunImpactReceipt = {
    validated: value.receipt.validated,
    score: nonNegativeInteger(value.receipt.score) ?? -1,
    yieldDna: nonNegativeInteger(value.receipt.yieldDna) ?? -1,
    dnaCredited: nonNegativeInteger(value.receipt.dnaCredited) ?? -1,
    // constitution-allow: energy-commerce settlement receipt validation is unrelated to any SKU, perk, or purchase
    energyCommitted: nonNegativeInteger(value.receipt.energyCommitted) ?? -1,
    commitmentMultiplierBps:
      nonNegativeInteger(value.receipt.commitmentMultiplierBps) ?? -1,
    generation: nonNegativeInteger(value.receipt.generation) ?? -1,
    personalBest: {
      eligible: rawPersonalBest.eligible,
      before: personalBestBefore,
      after: personalBestAfter,
      improved: rawPersonalBest.improved,
    },
  };
  if (
    [
      receipt.score,
      receipt.yieldDna,
      receipt.dnaCredited,
      receipt.energyCommitted,
      receipt.commitmentMultiplierBps,
      receipt.generation,
    ].some((number) => number < 0) ||
    receipt.generation < 1
  ) {
    return null;
  }

  const impacts = value.impacts.map(parseImpact);
  if (impacts.some((impact) => impact === null)) return null;
  const safeImpacts = impacts as RunImpact[];
  const impactKeys = new Set(safeImpacts.map((impact) => impact.key));
  if (impactKeys.size !== safeImpacts.length) return null;

  const featuredImpactKeys = value.featuredImpactKeys.filter(
    (key): key is string => typeof key === 'string' && impactKeys.has(key)
  );
  if (
    featuredImpactKeys.length !== value.featuredImpactKeys.length ||
    new Set(featuredImpactKeys).size !== featuredImpactKeys.length ||
    featuredImpactKeys.length > 3
  ) {
    return null;
  }

  const recommendedAction = value.recommendedAction;
  if (
    recommendedAction !== null &&
    (!isObject(recommendedAction) ||
      typeof recommendedAction.headline !== 'string' ||
      recommendedAction.headline.length === 0 ||
      !DESTINATIONS.has(recommendedAction.destination as RunImpactDestination) ||
      (recommendedAction.artifactRef !== undefined &&
        (typeof recommendedAction.artifactRef !== 'string' ||
          recommendedAction.artifactRef.trim().length === 0)))
  ) {
    return null;
  }

  return {
    version: RUN_IMPACT_VERSION,
    sessionId: value.sessionId,
    settledAt: value.settledAt,
    outcome: value.outcome as RunImpactOutcome,
    dynasty: value.dynasty as RunImpactDynasty,
    receipt,
    impacts: safeImpacts,
    featuredImpactKeys,
    recommendedAction:
      isObject(recommendedAction)
        ? {
            headline: recommendedAction.headline as string,
            destination: recommendedAction.destination as RunImpactDestination,
            ...(typeof recommendedAction.artifactRef === 'string'
              ? { artifactRef: recommendedAction.artifactRef }
              : {}),
          }
        : null,
  };
}

export function parseImpactFromSettlement(value: unknown): RunImpactEnvelope | null {
  if (!isObject(value)) return null;
  return parseRunImpactEnvelope(value.impact);
}

export async function recoverRunImpact(
  sessionId: string,
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<RunImpactEnvelope | null> {
  const response = await fetchFn(
    `/api/progression/impact?sessionId=${encodeURIComponent(sessionId)}`,
    {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Impact recovery failed (${response.status})`);
  }
  return parseImpactFromSettlement(await response.json());
}

function maxSignificance(impacts: RunImpact[]): RunImpactSignificance {
  return impacts.reduce<RunImpactSignificance>(
    (highest, impact) =>
      SIGNIFICANCE_RANK[impact.significance] > SIGNIFICANCE_RANK[highest]
        ? impact.significance
        : highest,
    'routine'
  );
}

/**
 * Groups the server's selected recognition beats into at most three coherent
 * player-facing moments. Featured keys select ceremony, never authority.
 */
export function groupRunImpacts(envelope: RunImpactEnvelope): RunImpactGroup[] {
  const featured = new Set(envelope.featuredImpactKeys);
  const ceremonyImpacts = envelope.impacts.filter((impact) => featured.has(impact.key));
  const source = ceremonyImpacts.length > 0
    ? ceremonyImpacts
    : envelope.impacts.filter((impact) => impact.significance !== 'routine');

  const buckets: Array<{
    id: RunImpactGroup['id'];
    label: string;
    accepts: (impact: RunImpact) => boolean;
  }> = [
    {
      id: 'growth',
      label: 'Personal growth',
      accepts: (impact) => impact.pillar === 'mastery' || impact.pillar === 'lineage',
    },
    {
      id: 'discovery',
      label: 'Discovery',
      accepts: (impact) => impact.pillar === 'discovery',
    },
    {
      id: 'clan-world',
      label: 'Clan & world',
      accepts: (impact) => impact.pillar === 'clan' || impact.pillar === 'calendar',
    },
  ];

  return buckets.flatMap((bucket) => {
    const impacts = source.filter(bucket.accepts);
    return impacts.length === 0
      ? []
      : [{
          id: bucket.id,
          label: bucket.label,
          significance: maxSignificance(impacts),
          impacts,
          firstSourceIndex: Math.min(...impacts.map((impact) => source.indexOf(impact))),
        }];
  })
    .sort(
      (a, b) =>
        SIGNIFICANCE_RANK[b.significance] - SIGNIFICANCE_RANK[a.significance] ||
        a.firstSourceIndex - b.firstSourceIndex
    )
    .slice(0, 3)
    .map(({ id, label, significance, impacts }) => ({
      id,
      label,
      significance,
      impacts,
    }));
}

export function impactSummary(envelope: RunImpactEnvelope): string {
  if (envelope.impacts.length === 0) {
    return 'Run settled — no persistent milestone changed.';
  }
  const headlines = envelope.impacts.slice(0, 3).map((impact) => impact.headline);
  const remaining = envelope.impacts.length - headlines.length;
  return `${headlines.join(' · ')}${remaining > 0 ? ` · +${remaining} more` : ''}`;
}

export function hasRecognitionCeremony(envelope: RunImpactEnvelope): boolean {
  return groupRunImpacts(envelope).length > 0;
}
