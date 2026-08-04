import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import type { DynastyName } from '@/shared/game/rulesets';
import {
  MASTERY_UNLOCK_TRACK,
  masteryUnlockLabel,
} from '@/shared/game/mastery';
import { sanitizeCodexDiscoveryResult } from '@/shared/game/codex';
import type { ClanContributionResult } from '@/lib/server/clanEnergyBattle';
import { settleSignalAttemptForSession } from '@/lib/server/signal';
import {
  buildRunImpactEnvelope,
  isMissingRunImpactInfra,
  loadRunImpactEnvelope,
  persistRunImpactEnvelope,
} from '@/lib/server/runImpact';
import type { MasteryImpactInput, SignalImpactInput } from '@/lib/server/runImpact';

type Row = Record<string, unknown>;

export interface DurableRunProgression {
  player: {
    dna: number;
    total_games_played: number;
    high_score: number;
    total_dna_earned: number;
    breeds_completed: number;
  };
  personalBest: { eligible: boolean; before: number; after: number; improved: boolean };
  codex: ReturnType<typeof sanitizeCodexDiscoveryResult> | null;
  mastery: MasteryImpactInput | null;
  ladder: { rung: number; before: number; best: number } | null;
  streak: { current: number; longest: number; graceConsumed: boolean } | null;
  records: {
    previousRecords: Record<string, { value: number; tier: number }>;
    records: Record<string, { value: number; tier: number }>;
    legacyScore: number;
  } | null;
  signal: SignalImpactInput | null;
  clan: ClanContributionResult | null;
  impact: ReturnType<typeof buildRunImpactEnvelope>;
}

export type DurableRunProgressionResult =
  | { ok: true; settlement: DurableRunProgression }
  | { ok: false; error: unknown; notAtomic?: boolean; pending?: boolean };

function row(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function int(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function isOrderedProgressionPending(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'message' in error &&
      /GAME_PROGRESSION_EARLIER_(?:SESSION|CLAN|SIGNAL)_PENDING/i.test(
        String((error as { message?: unknown }).message ?? '')
      )
  );
}

function reportProgressionError(
  stage: string,
  error: unknown,
  playerId: string,
  sessionId: string
) {
  console.error(`Durable progression ${stage} failed:`, {
    playerId,
    sessionId,
    stage,
    error,
  });
  Sentry.captureException(error, {
    tags: { progression_stage: stage },
    extra: { playerId, sessionId },
  });
}

function dynasty(value: unknown): DynastyName | null {
  return value === 'CYBER' || value === 'PRIMAL' || value === 'COSMIC'
    ? value
    : null;
}

function parsePlayer(value: unknown): DurableRunProgression['player'] | null {
  const valueRow = row(value);
  if (!valueRow) return null;
  for (const key of [
    'dna',
    'total_games_played',
    'high_score',
    'total_dna_earned',
    'breeds_completed',
  ]) {
    if (!Number.isSafeInteger(Number(valueRow[key])) || Number(valueRow[key]) < 0) {
      return null;
    }
  }
  return {
    dna: int(valueRow.dna),
    total_games_played: int(valueRow.total_games_played),
    high_score: int(valueRow.high_score),
    total_dna_earned: int(valueRow.total_dna_earned),
    breeds_completed: int(valueRow.breeds_completed),
  };
}

function parseRecords(
  value: unknown
): DurableRunProgression['records'] {
  const valueRow = row(value);
  if (!valueRow) return null;
  const parseMap = (raw: unknown) => {
    const rawRow = row(raw);
    if (!rawRow) return {};
    const parsed: Record<string, { value: number; tier: number }> = {};
    for (const [key, entry] of Object.entries(rawRow)) {
      const entryRow = row(entry);
      if (!entryRow) continue;
      parsed[key] = { value: int(entryRow.value), tier: int(entryRow.tier) };
    }
    return parsed;
  };
  return {
    previousRecords: parseMap(valueRow.previousRecords),
    records: parseMap(valueRow.records),
    legacyScore: int(valueRow.legacyScore),
  };
}

function parseMastery(value: unknown): MasteryImpactInput | null {
  const valueRow = row(value);
  const masteryDynasty = dynasty(valueRow?.dynasty);
  if (!valueRow || !masteryDynasty) return null;
  const levelBefore = int(valueRow.levelBefore);
  const level = int(valueRow.level);
  const unlocks: MasteryImpactInput['unlocks'] = [];
  for (let crossed = levelBefore + 1; crossed <= level; crossed += 1) {
    const definition = MASTERY_UNLOCK_TRACK[crossed - 1];
    if (!definition) continue;
    unlocks.push({
      level: crossed,
      kind: definition.kind,
      label: masteryUnlockLabel(masteryDynasty, crossed),
    });
  }
  return {
    dynasty: masteryDynasty,
    xpGained: int(valueRow.xpGained),
    xpBefore: int(valueRow.xpBefore),
    xp: int(valueRow.xp),
    levelBefore,
    level,
    levelsGained: Math.max(0, level - levelBefore),
    leveledUp: level > levelBefore,
    unlocks,
  };
}

function parseSignal(value: unknown): SignalImpactInput | null {
  const valueRow = row(value);
  if (!valueRow || typeof valueRow.runId !== 'string') return null;
  return {
    runId: valueRow.runId,
    completed: bool(valueRow.completed),
    progress: int(valueRow.progress),
    target: int(valueRow.target),
    bonusDna: int(valueRow.bonusDna),
    signalsCompleted: int(valueRow.signalsCompleted),
    newMilestones: int(valueRow.newMilestones),
  };
}

function parseCore(data: unknown) {
  const core = row(data);
  const reward = row(core?.reward);
  const pb = row(reward?.personal_best);
  const snapshot = row(core?.snapshot);
  const player = parsePlayer(core?.player);
  if (!core || !reward || !pb || !snapshot || !player) return null;
  const parsedDynasty = dynasty(snapshot.dynasty);
  if (!parsedDynasty) return null;
  const before = int(pb.before);
  const after = int(pb.after);
  const personalBest = {
    eligible: bool(pb.eligible),
    before,
    after,
    improved: bool(pb.improved),
  };
  if (after < before || personalBest.improved !== (personalBest.eligible && after > before)) {
    return null;
  }
  const ladderRow = row(core.ladder);
  const streakRow = row(core.streak);
  return {
    core,
    snapshot,
    dynasty: parsedDynasty,
    player,
    personalBest,
    codex: core.codex === null ? null : sanitizeCodexDiscoveryResult(core.codex),
    mastery: parseMastery(core.mastery),
    ladder: ladderRow
      ? { rung: int(ladderRow.rung), before: int(ladderRow.before), best: int(ladderRow.best) }
      : null,
    streak: streakRow
      ? {
          current: int(streakRow.current),
          longest: int(streakRow.longest),
          graceConsumed: bool(streakRow.graceConsumed),
        }
      : null,
    records: parseRecords(core.records),
  };
}

/**
 * Resume every server-owned stage from the immutable session snapshot and
 * persist one canonical receipt. Safe to call concurrently and after reload;
 * no original request body or browser queue is required.
 */
export async function settleDurableRunProgression(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string
): Promise<DurableRunProgressionResult> {
  try {
    const rewardRpc = await supabase.rpc('settle_game_session_reward_from_snapshot', {
      p_player_id: playerId,
      p_session_id: sessionId,
    });
    if (rewardRpc.error) {
      const notAtomic = /GAME_REWARD_SNAPSHOT_NOT_RECOVERABLE/i.test(
        rewardRpc.error.message ?? ''
      );
      const pending = /GAME_REWARD_EARLIER_SESSION_PENDING/i.test(
        rewardRpc.error.message ?? ''
      );
      if (!notAtomic && !pending) {
        console.error('Durable base reward RPC failed:', {
          playerId,
          sessionId,
          stage: 'base_reward',
          error: rewardRpc.error,
        });
        Sentry.captureException(rewardRpc.error, {
          tags: { progression_stage: 'base_reward' },
          extra: { playerId, sessionId },
        });
      }
      return {
        ok: false,
        error: rewardRpc.error,
        ...(notAtomic ? { notAtomic: true } : {}),
        ...(pending ? { pending: true } : {}),
      };
    }

    const stageErrors: Array<{ error: unknown; pending?: boolean; notAtomic?: boolean }> = [];
    let parsed: ReturnType<typeof parseCore> = null;
    let signal: SignalImpactInput | null = null;
    let finalPlayer: DurableRunProgression['player'] | null = null;
    let clan: ClanContributionResult | null | undefined;

    const coreRpc = await supabase.rpc('settle_game_session_progression_core', {
      p_player_id: playerId,
      p_session_id: sessionId,
    });
    if (coreRpc.error) {
      const notAtomic = /GAME_PROGRESSION_SESSION_NOT_RECOVERABLE/i.test(
        coreRpc.error.message ?? ''
      );
      const pending = isOrderedProgressionPending(coreRpc.error);
      if (!notAtomic && !pending) {
        reportProgressionError('core', coreRpc.error, playerId, sessionId);
      }
      stageErrors.push({ error: coreRpc.error, notAtomic, pending });
    } else {
      parsed = parseCore(coreRpc.data);
      if (!parsed) {
        const error = new Error('invalid progression core result');
        reportProgressionError('core_parse', error, playerId, sessionId);
        stageErrors.push({ error });
      }
    }

    // Signal and clan are sibling stages. Each is attempted even when core or
    // the other sibling is unavailable, so neither a personal analytics bug
    // nor a social outage can suppress an otherwise valid reward/contribution.
    const signalPrepare = await supabase.rpc('prepare_game_session_signal_stage', {
      p_player_id: playerId,
      p_session_id: sessionId,
    });
    if (signalPrepare.error) {
      const pending = isOrderedProgressionPending(signalPrepare.error);
      if (!pending) {
        reportProgressionError('signal_prepare', signalPrepare.error, playerId, sessionId);
      }
      stageErrors.push({ error: signalPrepare.error, pending });
    } else {
      const prepared = row(signalPrepare.data);
      let canCapture = prepared !== null;
      if (!prepared) {
        const error = new Error('invalid progression Signal preflight');
        reportProgressionError('signal_prepare_parse', error, playerId, sessionId);
        stageErrors.push({ error });
        canCapture = false;
      } else if (!bool(prepared.captured)) {
        const signalAttempt = await settleSignalAttemptForSession(
          supabase,
          sessionId,
          playerId
        );
        if (signalAttempt?.failed) {
          const error = new Error('Signal settlement failed');
          reportProgressionError('signal_settle', error, playerId, sessionId);
          stageErrors.push({ error });
          canCapture = false;
        }
      }
      if (canCapture) {
        const signalRpc = await supabase.rpc('capture_game_session_signal_result', {
          p_player_id: playerId,
          p_session_id: sessionId,
        });
        if (signalRpc.error) {
          const pending = isOrderedProgressionPending(signalRpc.error);
          if (!pending) {
            reportProgressionError('signal_capture', signalRpc.error, playerId, sessionId);
          }
          stageErrors.push({ error: signalRpc.error, pending });
        } else {
          const signalCapture = row(signalRpc.data);
          finalPlayer = parsePlayer(signalCapture?.player);
          if (!signalCapture || !finalPlayer) {
            const error = new Error('invalid progression signal capture');
            reportProgressionError('signal_capture_parse', error, playerId, sessionId);
            stageErrors.push({ error });
          } else {
            signal = parseSignal(signalCapture.signal);
          }
        }
      }
    }

    const clanRpc = await supabase.rpc('capture_game_session_clan_result', {
      p_player_id: playerId,
      p_session_id: sessionId,
    });
    if (clanRpc.error) {
      const pending = isOrderedProgressionPending(clanRpc.error);
      if (!pending) {
        reportProgressionError('clan_capture', clanRpc.error, playerId, sessionId);
      }
      stageErrors.push({ error: clanRpc.error, pending });
    } else {
      const clanCapture = row(clanRpc.data);
      if (!clanCapture || !('clan' in clanCapture)) {
        const error = new Error('invalid progression clan capture');
        reportProgressionError('clan_capture_parse', error, playerId, sessionId);
        stageErrors.push({ error });
      } else {
        clan = row(clanCapture.clan) as ClanContributionResult | null;
      }
    }

    if (stageErrors.length > 0 || !parsed || !finalPlayer || clan === undefined) {
      const failure = stageErrors[0] ?? { error: new Error('progression stage incomplete') };
      return {
        ok: false,
        error: failure.error,
        ...(failure.notAtomic ? { notAtomic: true } : {}),
        ...(failure.pending ? { pending: true } : {}),
      };
    }

    const settledAt = parsed.snapshot.settledAt;
    if (
      typeof settledAt !== 'string' ||
      !Number.isFinite(Date.parse(settledAt))
    ) {
      const error = new Error('invalid progression settlement timestamp');
      reportProgressionError('snapshot_timestamp', error, playerId, sessionId);
      return { ok: false, error };
    }

    const impact = buildRunImpactEnvelope({
      sessionId,
      settledAt,
      dynasty: parsed.dynasty,
      extracted: bool(parsed.snapshot.extracted),
      died: bool(parsed.snapshot.died),
      validated: bool(parsed.snapshot.validated),
      score: int(parsed.snapshot.score),
      yieldDna: int(parsed.snapshot.yieldDna),
      dnaCredited: int(parsed.snapshot.dnaCredited),
      energyCommitted: int(parsed.snapshot.energyCommitted),
      commitmentMultiplierBps: int(parsed.snapshot.commitmentMultiplierBps),
      generation: Math.max(1, int(parsed.snapshot.generation, 1)),
      personalBest: parsed.personalBest,
      snakeId: typeof parsed.snapshot.snakeId === 'string' ? parsed.snapshot.snakeId : null,
      mastery: parsed.mastery,
      recordsBefore: parsed.records?.previousRecords ?? null,
      recordsAfter: parsed.records?.records ?? null,
      ladder:
        parsed.ladder && parsed.ladder.best > parsed.ladder.before
          ? {
              before: parsed.ladder.before,
              after: parsed.ladder.best,
              rung: parsed.ladder.rung,
            }
          : null,
      codex: parsed.codex,
      signal,
      clan,
    });
    const persisted = await persistRunImpactEnvelope(supabase, playerId, impact);
    if (persisted.status !== 'persisted') {
      console.error('Durable progression impact persistence failed:', {
        playerId,
        sessionId,
        stage: 'impact_persist',
        error: persisted.error,
      });
      Sentry.captureException(persisted.error, {
        tags: { progression_stage: 'impact_persist' },
        extra: { playerId, sessionId },
      });
      return { ok: false, error: persisted.error };
    }

    return {
      ok: true,
      settlement: {
        player: finalPlayer,
        personalBest: parsed.personalBest,
        codex: parsed.codex,
        mastery: parsed.mastery,
        ladder: parsed.ladder,
        streak: parsed.streak,
        records: parsed.records,
        signal,
        clan,
        impact: persisted.impact,
      },
    };
  } catch (error) {
    Sentry.captureException(error, { extra: { playerId, sessionId } });
    return { ok: false, error };
  }
}

/**
 * A row the server has tried this many times is not given up on — nothing is
 * ever given up on — but it stops being a silent statistic and is named in the
 * sweep's response, which is the operator's cue that it needs a human.
 *
 * Lives here rather than beside the sweep because a Next.js route module may
 * only export route fields; `export const` on a threshold there fails the
 * production build.
 */
export const RECOVERY_ATTENTION_THRESHOLD = 8;

export interface PendingRunProgressionCandidate {
  playerId: string;
  sessionId: string;
  protocol: string | null;
  /**
   * How many times the server has already tried to settle this run,
   * including the claim that returned it. Migration 068 added the column to
   * the scan's result; during the application-first deploy window the older
   * three-column function is still installed and this reads 0, which simply
   * means "no attention threshold crossed yet".
   */
  recoveryAttempts: number;
}

export async function listPendingRunProgression(
  supabase: SupabaseClient,
  limit = 20
): Promise<PendingRunProgressionCandidate[] | null> {
  const { data, error } = await supabase.rpc('list_pending_game_progression_sessions', {
    p_limit: limit,
  });
  if (
    error &&
    ['42883', 'PGRST202'].includes(error.code ?? '') &&
    /list_pending_game_progression_sessions/i.test(error.message ?? '')
  ) {
    // Expected only during the bounded application-first 059→060 cutover.
    // Stale-session expiry still runs; the first post-migration cron drains
    // atomic progression.
    return [];
  }
  if (error || !Array.isArray(data)) {
    const cause = error ?? new Error('invalid pending progression response');
    console.error('Pending progression scan failed:', {
      stage: 'pending_scan',
      error: cause,
    });
    Sentry.captureException(cause, {
      tags: { progression_stage: 'pending_scan' },
      extra: { limit },
    });
    return null;
  }
  return data.flatMap((entry) => {
    const entryRow = row(entry);
    if (typeof entryRow?.player_id !== 'string' || typeof entryRow.session_id !== 'string') {
      return [];
    }
    return [{
      playerId: entryRow.player_id,
      sessionId: entryRow.session_id,
      protocol: typeof entryRow.reward_protocol === 'string'
        ? entryRow.reward_protocol
        : null,
      recoveryAttempts: int(entryRow.recovery_attempts),
    }];
  });
}

export interface StrandedTerminalRunCandidate {
  playerId: string;
  userId: string;
  sessionId: string;
  recoveryAttempts: number;
}

/**
 * Claim a batch of runs the server terminalized but never settled (CE-2).
 *
 * This is the state that had no server driver at all: `continuity_phase =
 * 'terminal'` with `ended_at IS NULL` is invisible to the expiry sweeper, to
 * the pending-end scan, and to the progression scan, so its value could not
 * settle unless the player came back and their browser re-posted the end.
 */
export async function listStrandedTerminalRuns(
  supabase: SupabaseClient,
  limit = 20
): Promise<StrandedTerminalRunCandidate[] | null> {
  const { data, error } = await supabase.rpc('list_stranded_terminal_runs', {
    p_limit: limit,
  });
  if (
    error &&
    ['42883', 'PGRST202'].includes(error.code ?? '') &&
    /list_stranded_terminal_runs/i.test(error.message ?? '')
  ) {
    // Expected only during the bounded application-first 067→068 cutover.
    // Every other sweep stage still runs; the first post-migration cron
    // drains the stranded terminal rows.
    return [];
  }
  if (error || !Array.isArray(data)) {
    const cause = error ?? new Error('invalid stranded terminal scan response');
    console.error('Stranded terminal scan failed:', {
      stage: 'stranded_terminal_scan',
      error: cause,
    });
    Sentry.captureException(cause, {
      tags: { progression_stage: 'stranded_terminal_scan' },
      extra: { limit },
    });
    return null;
  }
  return data.flatMap((entry) => {
    const entryRow = row(entry);
    if (
      typeof entryRow?.player_id !== 'string' ||
      typeof entryRow.user_id !== 'string' ||
      typeof entryRow.session_id !== 'string'
    ) {
      return [];
    }
    return [{
      playerId: entryRow.player_id,
      userId: entryRow.user_id,
      sessionId: entryRow.session_id,
      recoveryAttempts: int(entryRow.recovery_attempts),
    }];
  });
}

export interface PendingEndAdoptionSummary {
  phase: 'bridge' | 'ready';
  scanned: number;
  adopted: number;
  superseded: number;
  failed: number;
  failures: Array<{ playerId: string; sessionId: string; state: string }>;
}

export async function adoptPendingGameSessionEnds(
  supabase: SupabaseClient,
  limit = 20
): Promise<PendingEndAdoptionSummary | null> {
  const capability = await supabase.rpc('get_career_settlement_capability');
  const capabilityRow = row(capability.data);
  if (capability.error || !capabilityRow) {
    const error = capability.error ?? new Error('invalid Career capability response');
    reportProgressionError('pending_end_capability', error, 'system', 'bridge');
    return null;
  }
  if (capabilityRow.status === 'pending') {
    return {
      phase: 'bridge',
      scanned: 0,
      adopted: 0,
      superseded: 0,
      failed: 0,
      failures: [],
    };
  }
  if (capabilityRow.status !== 'ready') {
    const error = new Error('unknown Career capability state');
    reportProgressionError('pending_end_capability', error, 'system', 'bridge');
    return null;
  }

  const pending = await supabase.rpc('list_pending_game_session_ends', {
    p_limit: limit,
  });
  if (pending.error || !Array.isArray(pending.data)) {
    const error = pending.error ?? new Error('invalid pending end scan response');
    reportProgressionError('pending_end_scan', error, 'system', 'bridge');
    return null;
  }

  const candidates = pending.data.flatMap((value) => {
    const valueRow = row(value);
    if (
      typeof valueRow?.player_id !== 'string' ||
      typeof valueRow.session_id !== 'string'
    ) return [];
    return [{ playerId: valueRow.player_id, sessionId: valueRow.session_id }];
  });
  let adopted = 0;
  let superseded = 0;
  const failures: PendingEndAdoptionSummary['failures'] = [];
  for (const candidate of candidates) {
    const result = await supabase.rpc('adopt_pending_game_session_end', {
      p_session_id: candidate.sessionId,
    });
    const resultRow = row(result.data);
    const state = typeof resultRow?.state === 'string' ? resultRow.state : 'invalid';
    if (result.error || !resultRow) {
      const error = result.error ?? new Error('invalid pending end adoption response');
      reportProgressionError(
        'pending_end_adopt',
        error,
        candidate.playerId,
        candidate.sessionId
      );
      failures.push({ ...candidate, state });
    } else if (state === 'adopted') adopted += 1;
    else if (state === 'superseded_legacy') superseded += 1;
    else {
      failures.push({ ...candidate, state });
    }
  }
  return {
    phase: 'ready',
    scanned: candidates.length,
    adopted,
    superseded,
    failed: failures.length,
    failures,
  };
}

export async function resumeOrRecoverRunImpact(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string
) {
  const loaded = await loadRunImpactEnvelope(supabase, playerId, sessionId);
  if (loaded.status === 'found') return loaded;
  if (
    loaded.status === 'unavailable' &&
    !isMissingRunImpactInfra(
      loaded.error && typeof loaded.error === 'object'
        ? (loaded.error as { code?: string; message?: string })
        : null
    )
  ) {
    return loaded;
  }

  // A server-accepted result may be between durable ingress and its atomic
  // stamp. Make every recovery surface capable of advancing that state; on
  // schema 060 the missing adopter reports pending rather than pretending the
  // run is legacy or requiring browser persistence.
  const pending = await supabase.rpc('get_pending_game_session_end', {
    p_player_id: playerId,
    p_session_id: sessionId,
  });
  const pendingRow = row(pending.data);
  const pendingState =
    typeof pendingRow?.state === 'string' ? pendingRow.state : null;
  if (!pending.error && pendingState === 'staged') {
    const adoption = await supabase.rpc('adopt_pending_game_session_end', {
      p_session_id: sessionId,
    });
    const adoptionRow = row(adoption.data);
    if (adoption.error || adoptionRow?.state !== 'adopted') {
      return {
        status: 'pending' as const,
        error:
          adoption.error ??
          new Error(`pending end adoption is ${String(adoptionRow?.state ?? 'invalid')}`),
      };
    }
  } else if (!pending.error && pendingState === 'quarantined') {
    return {
      status: 'unavailable' as const,
      error: new Error('pending end is quarantined'),
    };
  } else if (!pending.error && pendingState === 'superseded_legacy') {
    return { status: 'absent' as const };
  }

  const resumed = await settleDurableRunProgression(supabase, playerId, sessionId);
  if (resumed.ok) return { status: 'found' as const, impact: resumed.settlement.impact };
  if (pendingState === 'staged' || pendingState === 'adopted' || resumed.pending) {
    return { status: 'pending' as const, error: resumed.error };
  }
  if (!resumed.notAtomic) {
    return { status: 'unavailable' as const, error: resumed.error };
  }
  // Protocol-NULL history predates the canonical receipt. The production
  // hard cutover prevents new legacy completions instead of guessing from
  // unsafe outgoing absolute aggregate writes.
  return { status: 'absent' as const };
}
