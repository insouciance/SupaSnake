import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import type { CodexDiscoveryResult } from '@/shared/game/codex';
import type { ClanContributionResult } from '@/lib/server/clanEnergyBattle';
import {
  RUN_IMPACT_VERSION,
  featuredImpactKeys,
  recommendedImpactAction,
  type RunImpact,
  type RunImpactEnvelope,
} from '@/shared/progression/runImpact';

type Dynasty = RunImpactEnvelope['dynasty'];

export interface MasteryImpactInput {
  dynasty: string;
  xpGained: number;
  xpBefore: number;
  xp: number;
  levelBefore: number;
  level: number;
  levelsGained: number;
  leveledUp: boolean;
  unlocks: { level: number; kind: string; label: string }[];
}

export interface SignalImpactInput {
  runId: string;
  completed: boolean;
  progress: number;
  target: number;
  bonusDna: number;
  signalsCompleted: number;
  newMilestones: number;
}

export interface BuildRunImpactInput {
  sessionId: string;
  settledAt: string;
  dynasty: Dynasty;
  extracted: boolean;
  died: boolean;
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
  snakeId: string | null;
  mastery: MasteryImpactInput | null;
  recordsBefore: Record<string, { value: number; tier: number }> | null;
  recordsAfter: Record<string, { value: number; tier: number }> | null;
  ladder: { before: number; after: number; rung: number } | null;
  codex: CodexDiscoveryResult | null;
  signal: SignalImpactInput | null;
  clan: ClanContributionResult | null;
}

function displayId(value: string): string {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function finiteInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function buildRunImpactEnvelope(
  input: BuildRunImpactInput
): RunImpactEnvelope {
  const impacts: RunImpact[] = [];

  if (input.validated && input.snakeId) {
    impacts.push({
      key: `lineage:${input.snakeId}:run`,
      pillar: 'lineage',
      kind: 'lineage_run',
      significance: 'routine',
      headline: `Gen ${finiteInt(input.generation)} history advanced`,
      detail: input.extracted ? 'Extraction recorded' : 'Run recorded',
      destination: 'lineage',
      artifactRef: input.snakeId,
    });
  }

  if (input.personalBest.improved) {
    impacts.push({
      key: `personal-best:${input.sessionId}`,
      pillar: 'mastery',
      kind: 'personal_best',
      significance: 'notable',
      headline: 'New personal best',
      before: input.personalBest.before,
      after: input.personalBest.after,
      delta: input.personalBest.after - input.personalBest.before,
      destination: 'chronicle',
      artifactRef: input.sessionId,
    });
  }

  if (input.mastery) {
    if (input.mastery.leveledUp) {
      impacts.push({
        key: `mastery:${input.dynasty}:level:${input.mastery.level}`,
        pillar: 'mastery',
        kind: 'mastery_level',
        significance: input.mastery.level >= 10 ? 'historic' : 'milestone',
        headline: `${input.dynasty} Mastery M${input.mastery.level}`,
        detail:
          input.mastery.unlocks.map((unlock) => unlock.label).join(' · ') ||
          'Mastery level reached',
        before: input.mastery.levelBefore,
        after: input.mastery.level,
        delta: input.mastery.levelsGained,
        destination: 'mastery',
        artifactRef: input.dynasty,
      });
    } else if (input.mastery.xpGained > 0) {
      impacts.push({
        key: `mastery:${input.dynasty}:xp`,
        pillar: 'mastery',
        kind: 'mastery_xp',
        significance: 'routine',
        headline: `+${input.mastery.xpGained.toLocaleString('en-US')} ${input.dynasty} Mastery XP`,
        before: input.mastery.xpBefore,
        after: input.mastery.xp,
        delta: input.mastery.xpGained,
        destination: 'mastery',
        artifactRef: input.dynasty,
      });
    }
  }

  if (input.recordsBefore && input.recordsAfter) {
    for (const [recordId, after] of Object.entries(input.recordsAfter)) {
      const before = input.recordsBefore[recordId] ?? { value: 0, tier: 0 };
      if (after.tier > before.tier) {
        impacts.push({
          key: `record:${recordId}:tier:${after.tier}`,
          pillar: 'mastery',
          kind: 'record_tier',
          significance: after.tier >= 5 ? 'historic' : 'milestone',
          headline: `${displayId(recordId)} reached Tier ${after.tier}`,
          before: before.tier,
          after: after.tier,
          delta: after.tier - before.tier,
          destination: 'records',
          artifactRef: recordId,
          metadata: { recordId, value: finiteInt(after.value) },
        });
      } else if (after.value > before.value) {
        impacts.push({
          key: `record:${recordId}:value`,
          pillar: 'mastery',
          kind: 'record_value',
          significance: 'routine',
          headline: `${displayId(recordId)} advanced`,
          before: finiteInt(before.value),
          after: finiteInt(after.value),
          delta: finiteInt(after.value - before.value),
          destination: 'records',
          artifactRef: recordId,
          metadata: { recordId, tier: finiteInt(after.tier) },
        });
      }
    }
  }

  if (input.ladder && input.ladder.after > input.ladder.before) {
    impacts.push({
      key: `ladder:${input.dynasty}:rung:${input.ladder.after}`,
      pillar: 'mastery',
      kind: 'ladder_record',
      significance: input.ladder.after >= 7 ? 'historic' : 'milestone',
      headline: `${input.dynasty} ladder rung ${input.ladder.after} banked`,
      before: input.ladder.before,
      after: input.ladder.after,
      delta: input.ladder.after - input.ladder.before,
      // The current ladder record is verified in the Chronicle's Career
      // Pulse; the Mastery panel has no ladder projection to render exactly.
      destination: 'chronicle',
      artifactRef: `ladder:${input.dynasty}:${input.ladder.after}`,
    });
  }

  for (const discovery of input.codex?.discoveries ?? []) {
    const historic = discovery.worldFirst;
    const milestone = discovery.type === 'apex';
    impacts.push({
      key: `codex:${discovery.type}:${discovery.entryId}`,
      pillar: 'discovery',
      kind: 'codex_discovery',
      significance: historic ? 'historic' : milestone ? 'milestone' : 'notable',
      headline: `${displayId(discovery.entryId)} ${displayId(discovery.type)} discovered`,
      detail: historic ? 'World-first discovery' : undefined,
      destination: 'codex',
      artifactRef: `${discovery.type}:${discovery.entryId}`,
      metadata: {
        discoveryType: discovery.type,
        entryId: discovery.entryId,
        worldFirst: discovery.worldFirst,
        rewardDna: discovery.rewardDna,
      },
    });
  }
  if (input.codex?.genomeWeaverUnlocked) {
    impacts.push({
      key: 'codex:genome_weaver',
      pillar: 'discovery',
      kind: 'codex_milestone',
      significance: 'historic',
      headline: 'Genome Weaver completed',
      destination: 'codex',
      artifactRef: 'genome_weaver',
    });
  }

  if (input.signal) {
    if (input.signal.newMilestones > 0) {
      impacts.push({
        key: `signal:milestone:${input.signal.signalsCompleted}`,
        pillar: 'calendar',
        kind: 'signal_milestone',
        significance: 'milestone',
        headline: `${input.signal.signalsCompleted} Signals completed`,
        delta: input.signal.newMilestones,
        destination: 'signal',
        artifactRef: `signals:${input.signal.signalsCompleted}`,
      });
    } else if (input.signal.completed) {
      impacts.push({
        key: `signal:complete:${input.signal.runId}`,
        pillar: 'calendar',
        kind: 'signal_completion',
        significance: 'notable',
        headline: 'World Signal completed',
        before: 0,
        after: input.signal.target,
        delta: input.signal.target,
        destination: 'signal',
        artifactRef: `signals:${input.signal.signalsCompleted}`,
      });
    } else if (input.signal.progress > 0) {
      impacts.push({
        key: `signal:progress:${input.signal.runId}`,
        pillar: 'calendar',
        kind: 'signal_progress',
        significance: 'routine',
        headline: `World Signal ${input.signal.progress}/${input.signal.target}`,
        after: input.signal.progress,
        destination: 'signal',
        artifactRef: `signals:${input.signal.signalsCompleted}`,
      });
    }
  }

  if (input.clan?.eligible && input.clan.enteredTopFive) {
    const delta = finiteInt(input.clan.scoreDelta ?? 0);
    impacts.push({
      key: `clan:top-five:${input.sessionId}`,
      pillar: 'clan',
      kind: 'clan_top_five',
      // A contributing clan result is socially durable, not just a result-card
      // flourish. Milestone significance creates cross-device Compete attention
      // keyed to this exact session; the clan surface clears it only when that
      // contribution is actually visible.
      significance: 'milestone',
      headline: 'Entered your clan five',
      detail: delta > 0 ? `Clan Depth increased by ${delta.toLocaleString('en-US')}` : undefined,
      delta,
      destination: 'clan',
      artifactRef: input.sessionId,
      metadata: {
        replacedSessionId: input.clan.replacedSessionId ?? null,
        fifthBest: finiteInt(input.clan.fifthBest ?? 0),
        clanTotal: finiteInt(input.clan.clanTotal ?? 0),
      },
    });
  }

  const featured = featuredImpactKeys(impacts);
  return {
    version: RUN_IMPACT_VERSION,
    sessionId: input.sessionId,
    settledAt: input.settledAt,
    outcome: input.extracted ? 'extracted' : input.died ? 'crashed' : 'completed',
    dynasty: input.dynasty,
    receipt: {
      validated: input.validated,
      score: finiteInt(input.score),
      yieldDna: finiteInt(input.yieldDna),
      dnaCredited: finiteInt(input.dnaCredited),
      // constitution-allow: energy-commerce immutable run settlement fact is unrelated to any SKU, perk, or purchase
      energyCommitted: finiteInt(input.energyCommitted),
      commitmentMultiplierBps: finiteInt(input.commitmentMultiplierBps),
      generation: Math.max(1, finiteInt(input.generation)),
      personalBest: {
        eligible: input.personalBest.eligible,
        before: finiteInt(input.personalBest.before),
        after: finiteInt(input.personalBest.after),
        improved: input.personalBest.improved,
      },
    },
    impacts,
    featuredImpactKeys: featured,
    recommendedAction: recommendedImpactAction(impacts),
  };
}

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

export function isMissingRunImpactInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  return (
    ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(
      error.code ?? ''
    ) ||
    /run_impact_receipts|progression_moments|player_attention_items|persist_run_impact_envelope/i.test(
      error.message ?? ''
    )
  );
}

function isRunImpactEnvelope(value: unknown): value is RunImpactEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<RunImpactEnvelope>;
  const receipt = envelope.receipt as Partial<RunImpactEnvelope['receipt']> | undefined;
  const personalBest = receipt?.personalBest;
  const isStoredInt = (candidate: unknown, minimum = 0): candidate is number =>
    typeof candidate === 'number' &&
    Number.isSafeInteger(candidate) &&
    candidate >= minimum;
  return (
    envelope.version === RUN_IMPACT_VERSION &&
    typeof envelope.sessionId === 'string' &&
    typeof envelope.settledAt === 'string' &&
    Array.isArray(envelope.impacts) &&
    Array.isArray(envelope.featuredImpactKeys) &&
    !!receipt &&
    typeof receipt === 'object' &&
    typeof receipt.validated === 'boolean' &&
    isStoredInt(receipt.score) &&
    isStoredInt(receipt.yieldDna) &&
    isStoredInt(receipt.dnaCredited) &&
    isStoredInt(receipt.energyCommitted) &&
    isStoredInt(receipt.commitmentMultiplierBps) &&
    isStoredInt(receipt.generation, 1) &&
    !!personalBest &&
    typeof personalBest === 'object' &&
    typeof personalBest.eligible === 'boolean' &&
    isStoredInt(personalBest.before) &&
    isStoredInt(personalBest.after) &&
    personalBest.after >= personalBest.before &&
    typeof personalBest.improved === 'boolean' &&
    personalBest.improved ===
      (personalBest.eligible && personalBest.after > personalBest.before)
  );
}

export type RunImpactPersistResult =
  | { status: 'persisted'; impact: RunImpactEnvelope }
  | { status: 'unavailable'; error: unknown };

export type RunImpactLoadResult =
  | { status: 'found'; impact: RunImpactEnvelope }
  | { status: 'absent' }
  | { status: 'unavailable'; error: unknown };

export async function persistRunImpactEnvelope(
  supabase: SupabaseClient,
  playerId: string,
  envelope: RunImpactEnvelope
): Promise<RunImpactPersistResult> {
  try {
    const { data, error } = await supabase.rpc('persist_run_impact_envelope', {
      p_player_id: playerId,
      p_session_id: envelope.sessionId,
      p_envelope: envelope,
    });
    if (error) {
      if (!isMissingRunImpactInfra(error)) {
        console.error('Run impact persistence failed:', {
          playerId,
          sessionId: envelope.sessionId,
          error,
        });
        Sentry.captureException(
          new Error(`run impact persistence failed: ${error.message ?? error.code ?? 'unknown'}`),
          { extra: { playerId, sessionId: envelope.sessionId, code: error.code } }
        );
      }
      return { status: 'unavailable', error };
    }
    if (!isRunImpactEnvelope(data)) {
      const error = new Error('run impact persistence returned invalid data');
      console.error('Run impact persistence returned an invalid envelope:', {
        playerId,
        sessionId: envelope.sessionId,
      });
      Sentry.captureException(error, {
        extra: { playerId, sessionId: envelope.sessionId },
      });
      return { status: 'unavailable', error };
    }
    return { status: 'persisted', impact: data };
  } catch (error) {
    console.error('Run impact persistence threw:', {
      playerId,
      sessionId: envelope.sessionId,
      error,
    });
    Sentry.captureException(error, {
      extra: { playerId, sessionId: envelope.sessionId },
    });
    return { status: 'unavailable', error };
  }
}

export async function loadRunImpactEnvelope(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string
): Promise<RunImpactLoadResult> {
  try {
    const { data, error } = await supabase
      .from('run_impact_receipts')
      .select('envelope')
      .eq('player_id', playerId)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) {
      if (!isMissingRunImpactInfra(error)) {
        console.error('Run impact receipt read failed:', { playerId, sessionId, error });
        Sentry.captureException(
          new Error(`run impact receipt read failed: ${error.message ?? error.code ?? 'unknown'}`),
          { extra: { playerId, sessionId, code: error.code } }
        );
      }
      return { status: 'unavailable', error };
    }
    if (!data) return { status: 'absent' };
    const envelope = (data as { envelope?: unknown }).envelope;
    if (isRunImpactEnvelope(envelope)) return { status: 'found', impact: envelope };
    const invalid = new Error('run impact receipt contains invalid data');
    console.error('Run impact receipt read invalid data:', { playerId, sessionId });
    Sentry.captureException(invalid, { extra: { playerId, sessionId } });
    return { status: 'unavailable', error: invalid };
  } catch (error) {
    console.error('Run impact receipt read threw:', { playerId, sessionId, error });
    Sentry.captureException(error, { extra: { playerId, sessionId } });
    return { status: 'unavailable', error };
  }
}

/** Historical compatibility alias. Recovery is driven only by atomic-v1
 * server snapshots; protocol-NULL history remains a pure read miss. */
export async function recoverRunImpactEnvelope(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string
): Promise<RunImpactLoadResult> {
  return loadRunImpactEnvelope(supabase, playerId, sessionId);
}
