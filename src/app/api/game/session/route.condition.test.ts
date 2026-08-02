/**
 * @jest-environment node
 *
 * The run's WORLD CONDITION, connected at both ends (WP-2.10a).
 *
 * THE DEFECT THIS FILE EXISTS TO CATCH
 *
 * `serpent_weeks.modifiers` and the Signal day's condition were written,
 * parsed and rendered — and consumed by nothing. `mode` made the anomaly,
 * Serpent and Signal runs disjoint, so a Serpent run stamped `serpent_week_id`
 * and never `anomaly_id`; the end path read `session.anomaly_id`, found null,
 * and recomputed the run under NO condition. The Signal surface meanwhile told
 * the player "the gene pool tilts today" while the Genome offer-tilt channel
 * was set only on `mode: 'anomaly'`. The condition-sets were inert and one of
 * them was a false claim.
 *
 * v1.5 retires explicit Serpent starts in favour of automatic Clan Energy
 * Battles over ordinary runs. This suite now pins both sides of the cutover:
 * a legacy `mode: serpent` start is normalized to ordinary Energy play, while
 * an already-stamped historical Serpent session still settles under the exact
 * condition it was played under. Signal remains an explicit ritual.
 *
 * The fake below is the same small in-memory Postgres the lifecycle tests use,
 * extended with the two tables a condition is reached through and with the
 * three RPCs that stamp them. The RPC bodies mirror migrations 046 and 049
 * where it matters: `ensure_serpent_week` answers with the STORED week (the
 * row is the authority for a week's condition-set) and
 * `begin_signal_objective_run` mirrors the attempt id onto the session row
 * only when that session owns the attempt.
 */

const mockCaptureException = jest.fn();
var mockSettleSessionReward: jest.Mock;
var mockSettleDurableRunProgression: jest.Mock;
var mockResumeOrRecoverRunImpact: jest.Mock;
var mockGenomeV2Enabled = true;

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: jest.fn(),
}));

jest.mock('@/lib/server/rateLimit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock('@/lib/server/mastery', () => ({
  getMasteryXp: jest.fn().mockResolvedValue(0),
  // WP-2.05: settlement reads mastery XP through the STRICT variant, which
  // reports a read failure instead of returning 0 - because 0 XP narrows the
  // unlocked pool, which drops legal picks, which shrinks the payout.
  getMasteryXpStrict: jest.fn().mockResolvedValue({ ok: true, xp: 0 }),
  grantMasteryXp: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/server/gauntlet', () => ({
  getGauntletBan: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/server/season', () => ({
  getSeasonalMutationIds: jest.fn().mockResolvedValue([]),
  getSeasonalGeneIds: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/server/identity', () => ({
  getLiveIdentityForPlayer: jest.fn().mockResolvedValue(null),
  isMissingIdentityInfra: jest.fn().mockReturnValue(false),
}));
jest.mock('@/lib/server/records', () => ({
  refreshPlayerRecords: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/server/discordSync', () => ({
  enqueueMasteryLevelup: jest.fn().mockResolvedValue(undefined),
  refreshLinkedRolesForPlayer: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/server/codex', () => ({
  recordCodexDiscoveries: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/ftue/config', () => ({ FTUE_V2_ENABLED: true }));
jest.mock('@/lib/features/genomeV2', () => ({
  get GENOME_V2_ENABLED() {
    return mockGenomeV2Enabled;
  },
}));
jest.mock('@/lib/server/gameProgressionSettlement', () => ({
  settleDurableRunProgression: (...args: unknown[]) =>
    mockSettleDurableRunProgression(...args),
  resumeOrRecoverRunImpact: (...args: unknown[]) =>
    mockResumeOrRecoverRunImpact(...args),
}));

// Historical Serpent settlement helpers remain armed; new starts no longer
// consult the flag. Signal still uses its explicit ritual flag.
jest.mock('@/lib/serpent/config', () => ({
  SERPENT_V1_ENABLED: true,
  SERPENT_UNLOCK_BANKED_RUNS: 8,
}));
jest.mock('@/lib/signal/config', () => ({ SIGNAL_V1_ENABLED: true }));

type Row = Record<string, unknown>;
type Call = [string, ...unknown[]];

const db: {
  players: Row[];
  game_sessions: Row[];
  economy_transactions: Row[];
  collected_snakes: Row[];
  serpent_weeks: Row[];
  signal_objective_runs: Row[];
} = {
  players: [],
  game_sessions: [],
  economy_transactions: [],
  collected_snakes: [],
  serpent_weeks: [],
  signal_objective_runs: [],
};

const rpcCalls: Array<{ fn: string; params: Row }> = [];

/** The day key `ensure_signal_day` derived, as the joined row would carry it. */
let resolvedSignalDayKey = '';

function matches(row: Row, calls: Call[]): boolean {
  for (const [op, ...args] of calls) {
    const cell = row[args[0] as string] ?? null;
    if (op === 'eq' && cell !== args[1]) return false;
    if (op === 'is' && cell !== args[1]) return false;
    if (op === 'neq' && (cell === null || cell === args[1])) return false;
    if (op === 'lt' && !(String(cell ?? '') < String(args[1]))) return false;
    if (op === 'gte' && !(String(cell ?? '') >= String(args[1]))) return false;
    if (op === 'not' && args[1] === 'is' && cell === args[2]) return false;
  }
  return true;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'auth-1' } }, error: null }),
    },
    rpc: async (fn: string, params: Row) => {
      rpcCalls.push({ fn, params: params ?? {} });
      const p = (params ?? {}) as Row;

      if (fn === 'get_career_settlement_capability') {
        return {
          data: { status: 'ready', bridgeVersion: 1, careerVersion: 1 },
          error: null,
        };
      }
      if (fn === 'count_staged_pending_game_session_ends') {
        return { data: 0, error: null };
      }
      if (fn === 'stage_pending_game_session_end') {
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (target) {
          target.end_reason = 'completed';
          target.__pendingEnvelope = p.p_envelope;
        }
        return { data: { accepted: true, state: 'staged' }, error: null };
      }
      if (fn === 'stage_run_continuity_terminal') {
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (
          !target ||
          target.continuity_phase !== 'active' ||
          target.continuity_lease_hash !== p.p_lease_hash
        ) {
          return { data: null, error: { message: 'run_lease_conflict' } };
        }
        Object.assign(target, {
          continuity_phase: 'terminal',
          continuity_terminal_facts: p.p_terminal_facts,
          continuity_terminal_digest: p.p_terminal_digest,
          continuity_terminal_at: new Date().toISOString(),
        });
        return {
          data: { accepted: true, inserted: true, sessionId: target.id },
          error: null,
        };
      }
      if (fn === 'stage_continuity_game_session_end') {
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        const terminalRecovery =
          target?.continuity_phase === 'terminal' && p.p_lease_hash === null;
        if (
          !target ||
          (!terminalRecovery && target.continuity_lease_hash !== p.p_lease_hash)
        ) {
          return { data: null, error: { message: 'run_lease_conflict' } };
        }
        target.end_reason = 'completed';
        target.continuity_phase = 'settling';
        target.__pendingEnvelope = p.p_envelope;
        return { data: { accepted: true, state: 'staged' }, error: null };
      }
      if (fn === 'adopt_pending_game_session_end') {
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        const envelope = target?.__pendingEnvelope as Row | undefined;
        const snapshot = envelope?.snapshot as Row | undefined;
        const facts = envelope?.sessionFacts as Row | undefined;
        if (target && snapshot && facts) {
          Object.assign(target, {
            score: snapshot.score,
            dna_earned: snapshot.dnaCredited,
            yield_dna: snapshot.yieldDna,
            duration_seconds: facts.durationSeconds,
            died: snapshot.died,
            victory: facts.victory,
            extracted: snapshot.extracted,
            ended_at: snapshot.settledAt,
            validated: snapshot.validated,
            validation_errors: facts.validationErrors,
            foods_collected: facts.foodsCollected,
            mutations: facts.mutations,
            genome: snapshot.genome,
            reward_protocol: 'atomic_v1',
            atomic_reward_observed_at: new Date().toISOString(),
            progression_settlement_payload: snapshot,
          });
        }
        return { data: { accepted: true, state: 'adopted' }, error: null };
      }

      if (fn === 'ensure_serpent_week') {
        // Migration 046: the row wins. A week created under `gold_rush` keeps
        // it, and the drift tripwire refuses to rewrite a live week's set.
        const week = {
          id: SERPENT_WEEK_ID,
          week_start: p.p_week_start,
          starts_at: p.p_starts_at,
          ends_at: p.p_ends_at,
          seed: p.p_seed,
          modifiers: [WEEK_CONDITION],
          settled_at: null,
        };
        db.serpent_weeks = [week];
        return { data: [week], error: null };
      }

      if (fn === 'ensure_signal_day') {
        resolvedSignalDayKey = String(p.p_day ?? '');
        return { data: [{ id: SIGNAL_DAY_ID }], error: null };
      }

      if (fn === 'begin_signal_objective_run') {
        const attempt: Row = {
          id: SIGNAL_ATTEMPT_ID,
          day_id: p.p_day_id,
          player_id: p.p_player_id,
          objective_id: p.p_objective_id,
          target: p.p_target,
          session_id: p.p_session_id,
          progress: 0,
          completed_at: null,
          settled_at: null,
          bonus_paid_at: null,
          signal_days: { day: resolvedSignalDayKey },
          owns_attempt: true,
        };
        db.signal_objective_runs = [attempt];
        // "Mirror the id onto the session ONLY when this session owns the
        // attempt" (049) — the stamp the end path resolves the day through.
        for (const row of db.game_sessions) {
          if (row.id === p.p_session_id) row.signal_objective_run_id = attempt.id;
        }
        return { data: [attempt], error: null };
      }

      if (fn === 'finalize_run_continuity_start') {
        const exempt = p.p_exempt === true;
        const requested = Number(p.p_commitment ?? 0);
        const commitment = exempt ? 0 : requested;
        const multipliers = Array.isArray(p.p_commitment_multipliers_bps)
          ? p.p_commitment_multipliers_bps as number[]
          : [10_000, 22_000, 36_000, 52_000, 72_000, 100_000];
        const multiplierBps = exempt
          ? 10_000
          : commitment === 0
            ? 2_500
            : Number(multipliers[commitment - 1]);
        const serverNow = new Date().toISOString();
        const runState = exempt ? 'exempt' : commitment === 0 ? 'lean' : 'charged';
        const energy = {
          state: runState,
          available: 6 - commitment,
          capacity: 6,
          recoveryIntervalSeconds: 3600,
          recoveryStartedAt: serverNow,
          nextRecoveryAt: commitment > 0 ? serverNow : null,
          recoveryProgress: commitment > 0 ? 0 : 1,
          serverNow,
          remaining: 6 - commitment,
          perDay: 6,
          usedToday: commitment,
          day: serverNow.slice(0, 10),
          refillsAt: commitment > 0 ? serverNow : null,
          committed: commitment,
          commitmentMultiplierBps: multiplierBps,
          energyAvailableBefore: 6,
          energyRecoveredAtStart: 0,
          visible: p.p_energy_visible === true,
        };
        const manifest = {
          ...((p.p_manifest_base as Row | undefined) ?? {}),
          sessionId: p.p_session_id,
          energy,
          charge: energy,
        };
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (target) {
          Object.assign(target, {
            charge_state: runState,
            energy_committed: commitment,
            energy_harvest_multiplier_bps: multiplierBps,
            energy_available_before: 6,
            energy_recovered_at_start: 0,
            energy_recovery_anchor_at: serverNow,
            energy_commitment_locked_at: serverNow,
            start_manifest: manifest,
            continuity_phase: 'prepared',
          });
        }
        return { data: manifest, error: null };
      }

      if (fn === 'activate_run_continuity') {
        const target = db.game_sessions.find(
          (row) => row.id === p.p_session_id && row.player_id === p.p_player_id
        );
        if (!target) {
          return { data: null, error: { message: 'session_not_found' } };
        }
        if (target.continuity_phase !== 'prepared') {
          return { data: null, error: { message: 'run_not_prepared' } };
        }
        target.continuity_phase = 'active';
        target.continuity_activated_at = new Date().toISOString();
        target.continuity_checkpoint = p.p_checkpoint;
        target.continuity_checkpoint_revision = 1;
        target.continuity_checkpoint_saved_at = new Date().toISOString();
        target.continuity_checkpoint_digest = p.p_checkpoint_digest;
        target.continuity_lease_hash = p.p_lease_hash;
        target.continuity_lease_epoch = 1;
        target.continuity_lease_issued_at = new Date().toISOString();
        return { data: target, error: null };
      }

      if (fn === 'abandon_run_continuity') {
        const target = db.game_sessions.find(
          (row) => row.id === p.p_session_id && row.player_id === p.p_player_id
        );
        if (!target) {
          return { data: null, error: { message: 'session_not_found' } };
        }
        target.ended_at = new Date().toISOString();
        target.end_reason = 'abandoned';
        return {
          data: { accepted: true, sessionId: target.id, endReason: 'abandoned' },
          error: null,
        };
      }

      if (fn === 'commit_run_energy') {
        const exempt = p.p_exempt === true;
        const requested = Number(p.p_commitment ?? 0);
        const commitment = exempt ? 0 : requested;
        const multipliers = Array.isArray(p.p_commitment_multipliers_bps)
          ? p.p_commitment_multipliers_bps as number[]
          : [10_000, 22_000, 36_000, 52_000, 72_000, 100_000];
        const multiplierBps = exempt
          ? 10_000
          : commitment === 0
            ? 2_500
            : Number(multipliers[commitment - 1]);
        const serverNow = new Date().toISOString();
        const runState = exempt ? 'exempt' : commitment === 0 ? 'lean' : 'charged';
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (target) {
          Object.assign(target, {
            charge_state: runState,
            energy_committed: commitment,
            energy_harvest_multiplier_bps: multiplierBps,
            energy_available_before: 6,
            energy_recovered_at_start: 0,
            energy_recovery_anchor_at: serverNow,
            energy_commitment_locked_at: serverNow,
          });
        }
        return {
          data: [{
            run_state: runState,
            energy_available: 6 - commitment,
            energy_updated_at: serverNow,
            energy_recovered: 0,
            server_now: serverNow,
            energy_available_before: 6,
            energy_committed: commitment,
            commitment_multiplier_bps: multiplierBps,
            clan_battle_id: null,
            clan_battle_side_id: null,
            clan_id: null,
            clan_battle_ends_at: null,
            clan_fifth_threshold: 0,
          }],
          error: null,
        };
      }

      if (fn === 'consume_run_charge') {
        return {
          data: [
            {
              charged: true,
              charges_day: new Date().toISOString().slice(0, 10),
              charges_used: 1,
            },
          ],
          error: null,
        };
      }

      if (fn === 'persist_run_impact_envelope') {
        return { data: p.p_envelope ?? null, error: null };
      }

      return { data: null, error: null };
    },
    from: (table: string) => {
      const calls: Call[] = [];
      let pendingUpdate: Row | null = null;
      let pendingInsert: Row | null = null;

      const rows = () => (db[table as keyof typeof db] ?? []) as Row[];

      const settle = () => {
        if (pendingInsert) {
          const inserted = {
            id: `${table}-${rows().length + 1}`,
            ...(table === 'game_sessions'
              ? { ended_at: null, end_reason: null, continuity_activated_at: null }
              : {}),
            ...pendingInsert,
          };
          rows().push(inserted);
          pendingInsert = null;
          return { data: [inserted], error: null };
        }
        const hit = rows().filter((row) => matches(row, calls));
        if (pendingUpdate) {
          for (const row of hit) Object.assign(row, pendingUpdate);
          pendingUpdate = null;
        }
        return { data: hit, error: null };
      };

      const builder: Record<string, unknown> = {};
      const push = (op: string) => (...args: unknown[]) => {
        calls.push([op, ...args]);
        return builder;
      };
      for (const op of [
        'select', 'eq', 'is', 'neq', 'lt', 'gte', 'gt', 'not', 'in', 'or',
        'order', 'range', 'limit',
      ]) {
        builder[op] = push(op);
      }
      builder.update = (payload: Row) => {
        pendingUpdate = payload;
        return builder;
      };
      builder.insert = (payload: Row) => {
        pendingInsert = payload;
        return builder;
      };
      builder.single = async () => {
        const { data } = settle();
        return data.length > 0
          ? { data: data[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      };
      builder.maybeSingle = async () => {
        const { data } = settle();
        return { data: data[0] ?? null, error: null };
      };
      builder.then = (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => Promise.resolve(settle()).then(onFulfilled, onRejected);
      return builder;
    },
  }),
}));

import { NextRequest } from 'next/server';
import { describe, expect, it, beforeEach } from '@jest/globals';
import { GET, POST } from './route';
import {
  ANOMALY_STRAINS,
  anomalyForWeek,
  isAnomalyId,
  type AnomalyId,
} from '@/shared/game/anomalies';
import {
  applyOutcomeWithMutations,
  computeRunTotals,
  getRuleset,
  normalizeDynastyName,
} from '@/shared/game/rulesets';
import { describeSignalDay, signalObjectiveId } from '@/shared/game/signal';
import {
  SnakeGameLogic,
  type SnakeCheckpointV1,
} from '@/lib/game/SnakeGameLogic';
import { sanitizeGenomeCapability } from '@/lib/game/genomeCapability';
import { isMutationId } from '@/shared/game/mutations';
import { sanitizeTraits } from '@/shared/game/traits';
import { GENOME_RULES_V2 } from '@/shared/game/genomeV2';

const PLAYER_ID = 'player-1';
const SNAKE_ID = 'snake-1';
const VARIANT_ID = 'variant-1';
const SERPENT_WEEK_ID = 'week-1';
const SIGNAL_DAY_ID = 'day-1';
const SIGNAL_ATTEMPT_ID = 'attempt-1';
const START_REQUEST_ID = '62b1e42c-c74c-43e5-9437-a994166276e6';

/**
 * The condition both stamped paths are pinned to.
 *
 * `gold_rush` on purpose: it is an [E] modifier (every food ×1.5 DNA), so a
 * settlement that ignores the condition and one that honours it produce
 * DIFFERENT numbers. A [P] modifier would let the inert behaviour pass.
 */
const WEEK_CONDITION: AnomalyId = 'gold_rush';

/**
 * A UTC day whose Signal condition is `gold_rush`, for the same reason.
 * Pinned rather than searched, so a change to the day derivation fails here
 * loudly instead of quietly weakening the test (the guard below is the alarm).
 */
const GOLD_RUSH_SIGNAL_DAY = '2026-08-04';

function post(body: Record<string, unknown>) {
  const requestBody = body.action === 'start'
    ? { startRequestId: START_REQUEST_ID, ...body }
    : body;
  return new NextRequest('http://localhost/api/game/session', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
}

function get() {
  return new NextRequest('http://localhost/api/game/session', {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
  });
}

function openingCheckpoint(manifest: Row) {
  const simulation = manifest.simulation as Row;
  const runSnake = manifest.runSnake as Row;
  const ladder = manifest.ladder as Row | undefined;
  const game = new SnakeGameLogic();
  game.setRuleset(getRuleset(normalizeDynastyName(String(runSnake.dynasty))));
  game.setTraits(sanitizeTraits(manifest.traits));
  game.setGrowthProfile(manifest.growthProfile);
  game.setLadderRung(ladder?.rung);
  game.setGenome(sanitizeGenomeCapability(manifest.genome));
  game.setMutationPool(
    Array.isArray(manifest.mutationPool)
      ? manifest.mutationPool.filter(isMutationId)
      : []
  );
  game.setSimulationSeed(String(simulation.seed));
  game.setAnomaly(isAnomalyId(manifest.condition) ? manifest.condition : null);
  game.prepare();
  return game.exportCheckpoint();
}

function terminalReplayProof(checkpointValue: unknown) {
  const checkpoint = checkpointValue as SnakeCheckpointV1;
  const accepted = checkpoint.privateState.replay;
  const game = new SnakeGameLogic();
  game.restoreCheckpoint(checkpoint);
  for (let tick = 0; tick < 16 && !game.getState().isGameOver; tick += 1) {
    game.tick();
  }
  if (!game.getState().isGameOver) {
    throw new Error('condition fixture did not reach a deterministic wall death');
  }
  const terminal = game.getReplayTrace();
  return {
    fromTick: accepted.ticks,
    toTick: terminal.ticks,
    actionOffset: accepted.actions.length,
    actions: terminal.actions.slice(accepted.actions.length),
  };
}

function seedPlayer() {
  db.players = [
    {
      id: PLAYER_ID,
      user_id: 'auth-1',
      dna: 0,
      total_games_played: 0,
      total_dna_earned: 0,
      high_score: 0,
      breeds_completed: 0,
    },
  ];
}

function seedSnake() {
  db.collected_snakes = [
    {
      id: SNAKE_ID,
      player_id: PLAYER_ID,
      snake_variant_id: VARIANT_ID,
      is_equipped: true,
      generation: 1,
      traits: [],
      snake_variants: {
        id: VARIANT_ID,
        name: 'CYBER SPARK',
        dynasties: { name: 'CYBER' },
      },
    },
  ];
}

/** A run that already exists and is waiting to settle. */
function seedSession(overrides: Row = {}) {
  const startedAt = new Date(Date.now() - 120_000).toISOString();
  db.game_sessions = [
    {
      id: 'session-1',
      player_id: PLAYER_ID,
      dynasty: 'CYBER',
      snake_used_id: SNAKE_ID,
      snake_variant_id: VARIANT_ID,
      started_at: startedAt,
      server_started_at: startedAt,
      ended_at: null,
      end_reason: null,
      score: 0,
      dna_earned: 0,
      validated: false,
      is_free_play: false,
      anomaly_id: null,
      serpent_week_id: null,
      signal_objective_run_id: null,
      // Stamped at start; 'charged' settles at full strength, so the harvest
      // envelope contributes nothing to the numbers compared below.
      charge_state: 'charged',
      run_seed: null,
      ...overrides,
    },
  ];
}

const FOOD_COUNT = 20;

function endBody(sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    action: 'end',
    sessionId,
    food_count: FOOD_COUNT,
    extracted: true,
    duration_seconds: 100,
    died: false,
    victory: false,
    score: 0,
    dna_earned: 0,
    ...overrides,
  };
}

/** What a CYBER run of `FOOD_COUNT` foods banks under `condition`. */
function bankedUnder(condition: AnomalyId | null): number {
  const { rawDna } = computeRunTotals('CYBER', FOOD_COUNT, [], null, [], condition);
  return applyOutcomeWithMutations(rawDna, true, [], false, [], condition);
}

const session = () => db.game_sessions[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockGenomeV2Enabled = true;
  db.economy_transactions = [];
  db.serpent_weeks = [];
  db.signal_objective_runs = [];
  rpcCalls.length = 0;
  resolvedSignalDayKey = '';
  seedPlayer();
  seedSnake();
  seedSession();
  mockSettleSessionReward = jest.fn(async (_client: unknown, rawInput: unknown) => {
    const input = rawInput as {
      finalDna: number;
      score: number;
      validated: boolean;
      sessionId: string;
      metadata: Record<string, unknown>;
    };
    const row = db.players[0];
    const before = Number(row.high_score ?? 0);
    const after = input.validated ? Math.max(before, input.score) : before;
    row.dna = Number(row.dna ?? 0) + input.finalDna;
    row.total_games_played = Number(row.total_games_played ?? 0) + 1;
    row.total_dna_earned = Number(row.total_dna_earned ?? 0) + input.finalDna;
    row.high_score = after;
    if (input.finalDna > 0) {
      db.economy_transactions.push({
        source_type: 'game_reward',
        source_id: input.sessionId,
        amount: input.finalDna,
        metadata: { ...input.metadata, score: input.score, validated: input.validated },
      });
    }
    return {
      ok: true,
      settlement: {
        applied: true,
        player: {
          dna: row.dna,
          totalGamesPlayed: row.total_games_played,
          highScore: row.high_score,
          totalDnaEarned: row.total_dna_earned,
          breedsCompleted: row.breeds_completed,
        },
        personalBest: {
          eligible: input.validated,
          before,
          after,
          improved: input.validated && after > before,
        },
      },
    };
  });
  mockSettleDurableRunProgression = jest.fn(async () => {
    const serpentCondition = db.serpent_weeks.find(
      (week) => week.id === session().serpent_week_id
    )?.modifiers;
    const resolvedCondition =
      session().anomaly_id ??
      (Array.isArray(serpentCondition) ? serpentCondition[0] : null) ??
      (session().signal_objective_run_id ? WEEK_CONDITION : null);
    const settled = await mockSettleSessionReward(null, {
      finalDna: Number(session().dna_earned ?? 0),
      score: Number(session().score ?? 0),
      validated: session().validated === true,
      sessionId: String(session().id),
      metadata: {
        ...(resolvedCondition ? { anomaly: resolvedCondition } : {}),
      },
    });
    const rewardPlayer = settled.settlement.player;
    return {
      ok: true,
      settlement: {
        player: {
          dna: rewardPlayer.dna,
          total_games_played: rewardPlayer.totalGamesPlayed,
          high_score: rewardPlayer.highScore,
          total_dna_earned: rewardPlayer.totalDnaEarned,
          breeds_completed: rewardPlayer.breedsCompleted,
        },
        personalBest: settled.settlement.personalBest,
        codex: null,
        mastery: null,
        ladder: null,
        streak: null,
        records: null,
        signal: null,
        clan: null,
        impact: { version: 1, sessionId: String(session().id) },
      },
    };
  });
  mockResumeOrRecoverRunImpact = jest.fn().mockResolvedValue({ status: 'absent' });
});

// ---------------------------------------------------------------------------
// The pins the rest of the file leans on
// ---------------------------------------------------------------------------

describe('the pinned conditions are still the ones the assertions assume', () => {
  it('`gold_rush` is economic, so honouring it moves the payout', () => {
    expect(bankedUnder('gold_rush')).toBeGreaterThan(bankedUnder(null));
  });

  it('the pinned Signal day still derives `gold_rush`', () => {
    expect(describeSignalDay(new Date(`${GOLD_RUSH_SIGNAL_DAY}T12:00:00.000Z`)).condition.id)
      .toBe('gold_rush');
  });
});

describe('server-owned run-start continuity', () => {
  const startBody = {
    action: 'start',
    mode: 'earn',
    snake_id: SNAKE_ID,
    energyCommitment: 6,
    confirmMaxEnergy: true,
  };

  beforeEach(() => {
    db.game_sessions = [];
  });

  it('requires authentication for active-run discovery', async () => {
    const response = await GET(new NextRequest('http://localhost/api/game/session'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('fails a pre-continuity tab closed before any Energy or session write', async () => {
    const response = await POST(new NextRequest('http://localhost/api/game/session', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'start',
        mode: 'earn',
        snake_id: SNAKE_ID,
        energyCommitment: 6,
        confirmMaxEnergy: true,
      }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: 'client_upgrade_required',
      reloadRequired: true,
      error: expect.stringMatching(/Reload once.*No Energy was used/i),
    });
    expect(db.game_sessions).toHaveLength(0);
    expect(rpcCalls.some((call) =>
      call.fn === 'finalize_run_continuity_start' || call.fn === 'commit_run_energy'
    )).toBe(false);
  });

  it('rejects zero Energy for a rewarded run before creating a preparing shell', async () => {
    const response = await POST(post({
      ...startBody,
      energyCommitment: 0,
      confirmMaxEnergy: false,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/whole number from 1 to 6/i),
    });
    expect(db.game_sessions).toHaveLength(0);
    expect(rpcCalls.some((call) =>
      call.fn === 'finalize_run_continuity_start' || call.fn === 'commit_run_energy'
    )).toBe(false);
  });

  it('returns the exact frozen manifest after a lost six-Energy response', async () => {
    const firstResponse = await POST(post(startBody));
    const first = await firstResponse.json();
    const retryResponse = await POST(post(startBody));
    const retry = await retryResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(retryResponse.status).toBe(200);
    expect(retry).toEqual(first);
    expect(first.energy.committed).toBe(6);
    expect(first.simulation).toMatchObject({ version: 1 });
    expect(first.simulation.seed).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first.runSnake).toEqual(expect.objectContaining({
      id: SNAKE_ID,
      name: 'CYBER SPARK',
      generation: 1,
      dynasty: 'CYBER',
      traits: [],
      traitSlots: 1,
    }));
    expect(
      rpcCalls.filter((call) => call.fn === 'finalize_run_continuity_start')
    ).toHaveLength(1);
  });

  it('repairs a zero-spend preparing shell from the same immutable start intent', async () => {
    const first = await (await POST(post(startBody))).json();
    const shell = session();
    Object.assign(shell, {
      start_manifest: null,
      start_manifest_draft: null,
      continuity_energy_commitment: null,
      continuity_exempt: null,
      continuity_energy_visible: null,
      continuity_phase: 'preparing',
      energy_committed: null,
      end_reason: null,
      ended_at: null,
    });
    rpcCalls.length = 0;

    const response = await POST(post(startBody));
    const repaired = await response.json();

    expect(response.status).toBe(200);
    expect(repaired.sessionId).toBe(first.sessionId);
    expect(db.game_sessions).toHaveLength(1);
    expect(shell.continuity_start_intent).toEqual({
      v: 1,
      startRequestId: START_REQUEST_ID,
      mode: 'earn',
      snakeId: SNAKE_ID,
      energyCommitment: 6,
      confirmMaxEnergy: true,
      signalObjectiveId: null,
      ladderRung: null,
    });
    expect(
      rpcCalls.filter((call) => call.fn === 'finalize_run_continuity_start')
    ).toHaveLength(1);
  });

  it('rejects the same request id when any material setting changes', async () => {
    expect((await POST(post(startBody))).status).toBe(200);
    const conflict = await POST(post({ ...startBody, energyCommitment: 5 }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ reason: 'request_conflict' });
    expect(
      rpcCalls.filter((call) => call.fn === 'finalize_run_continuity_start')
    ).toHaveLength(1);
  });

  it('refuses a second intent while exposing the prepared run for Continue Run', async () => {
    const first = await (await POST(post(startBody))).json();
    const second = await POST(post({
      ...startBody,
      startRequestId: '34d2f613-7cca-4bca-b617-53fc88fced53',
    }));
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      reason: 'active_run',
      activeRun: {
        phase: 'prepared',
        canContinue: true,
        requiresAbandon: false,
        manifest: first,
      },
    });
  });

  it('GET exposes only a prepared manifest and activation prevents rewind', async () => {
    const manifest = await (await POST(post(startBody))).json();

    const preparedResponse = await GET(get());
    expect(preparedResponse.status).toBe(200);
    expect(preparedResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(await preparedResponse.json()).toMatchObject({
      activeRun: {
        phase: 'prepared',
        canContinue: true,
        manifest,
      },
    });

    const sessionId = String(manifest.sessionId);
    const activation = await POST(post({
      action: 'activate',
      sessionId,
      checkpoint: openingCheckpoint(manifest),
    }));
    expect(activation.status).toBe(200);
    const activationBody = await activation.json();
    expect(activationBody).toMatchObject({
      activeRun: {
        phase: 'active',
        canContinue: true,
        requiresAbandon: false,
        manifest,
        checkpointRevision: 1,
        leaseToken: expect.any(String),
      },
    });

    const active = await (await GET(get())).json();
    expect(active.activeRun).toMatchObject({
      phase: 'active',
      manifest,
      canContinue: true,
      requiresAbandon: false,
      checkpointRevision: 1,
    });
    expect(active.activeRun.leaseToken).toBeNull();

    const rewind = await POST(post({
      action: 'activate',
      sessionId,
      checkpoint: openingCheckpoint(manifest),
    }));
    expect(rewind.status).toBe(409);
  });

  it('continues and settles an existing Genome v2 run after new v2 starts are switched off', async () => {
    const manifest = await (await POST(post(startBody))).json();
    expect(manifest.genome).toMatchObject({ rulesVersion: GENOME_RULES_V2 });

    const activation = await POST(post({
      action: 'activate',
      sessionId: manifest.sessionId,
      checkpoint: openingCheckpoint(manifest),
    }));
    expect(activation.status).toBe(200);
    const activeRun = (await activation.json()).activeRun;

    // The rollout flag controls intake only. A forward flag-off deployment
    // must retain the immutable v2 contract already stamped onto this run.
    mockGenomeV2Enabled = false;
    const resumed = await (await GET(get())).json();
    expect(resumed.activeRun).toMatchObject({
      phase: 'active',
      manifest: {
        sessionId: manifest.sessionId,
        genome: { rulesVersion: GENOME_RULES_V2 },
      },
      checkpointRevision: activeRun.checkpointRevision,
      canContinue: true,
    });

    const terminal = await POST(post({
      action: 'terminal',
      sessionId: manifest.sessionId,
      expectedRevision: activeRun.checkpointRevision,
      leaseToken: activeRun.leaseToken,
      replay: terminalReplayProof(activeRun.checkpoint),
    }));

    expect(terminal.status).toBe(200);
    expect(await terminal.json()).toMatchObject({ success: true });
    expect(session()).toMatchObject({ validated: true });
  });

  it('cannot activate a session outside the authenticated player scope', async () => {
    const response = await POST(post({
      action: 'activate',
      sessionId: 'someone-elses-session',
    }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ reason: 'not_found' });
  });

  it('abandons a prepared run directly without fake activation or a lease', async () => {
    const manifest = await (await POST(post(startBody))).json();
    const response = await POST(post({
      action: 'abandon',
      sessionId: manifest.sessionId,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      endReason: 'abandoned',
    });
    expect(rpcCalls.some((call) => call.fn === 'activate_run_continuity')).toBe(false);
    expect(rpcCalls.find((call) => call.fn === 'abandon_run_continuity'))
      .toEqual(expect.objectContaining({
        params: expect.objectContaining({ p_lease_hash: null }),
      }));
  });
});

// ---------------------------------------------------------------------------
// Retired Serpent start; historical Serpent settlement
// ---------------------------------------------------------------------------

describe('the Serpent cutover preserves history without creating a separate mode', () => {
  it('requires an explicit maximum-commitment confirmation', async () => {
    db.game_sessions = [];

    const response = await POST(
      post({
        action: 'start',
        mode: 'earn',
        snake_id: SNAKE_ID,
        energyCommitment: 6,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/confirm.*maximum energy/i);
    expect(db.game_sessions).toHaveLength(0);
    expect(rpcCalls.some((call) => call.fn === 'finalize_run_continuity_start')).toBe(false);
  });

  it('passes a confirmed six-Energy commitment to the atomic start RPC', async () => {
    db.game_sessions = [];

    const response = await POST(
      post({
        action: 'start',
        mode: 'earn',
        snake_id: SNAKE_ID,
        energyCommitment: 6,
        confirmMaxEnergy: true,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.energy.committed).toBe(6);
    expect(body.energy.commitmentMultiplierBps).toBe(100_000);
    expect(rpcCalls).toContainEqual(expect.objectContaining({
      fn: 'finalize_run_continuity_start',
      params: expect.objectContaining({ p_commitment: 6, p_exempt: false }),
    }));
  });

  it('normalizes a legacy Serpent request to an ordinary Energy run', async () => {
    db.game_sessions = [];

    const response = await POST(
      post({ action: 'start', mode: 'serpent', snake_id: SNAKE_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.condition).toBeUndefined();
    expect(body.serpent).toBeUndefined();
    expect(session().serpent_week_id ?? null).toBeNull();
    expect(session().anomaly_id ?? null).toBeNull();
    expect(rpcCalls.some((call) => call.fn === 'ensure_serpent_week')).toBe(false);
    expect(rpcCalls).toContainEqual(expect.objectContaining({
      fn: 'finalize_run_continuity_start',
      params: expect.objectContaining({ p_commitment: 1, p_exempt: false }),
    }));
  });

  it('settlement re-derives the SAME condition from the row and recomputes with it', async () => {
    seedSession({ serpent_week_id: SERPENT_WEEK_ID });
    db.serpent_weeks = [{ id: SERPENT_WEEK_ID, modifiers: [WEEK_CONDITION] }];

    const response = await POST(post(endBody('session-1')));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Same id at the other end, from `serpent_week_id` alone — the row never
    // had an `anomaly_id` to read.
    expect(body.anomaly).toBe(WEEK_CONDITION);
    expect(db.economy_transactions[0].metadata).toMatchObject({
      anomaly: WEEK_CONDITION,
    });
    // And it reached the fold: the payout is the one the condition produces.
    expect(session().dna_earned).toBe(bankedUnder(WEEK_CONDITION));
    expect(session().dna_earned).toBeGreaterThan(bankedUnder(null));
  });

  it('a week whose stored set names a different modifier settles under THAT one', async () => {
    seedSession({ serpent_week_id: SERPENT_WEEK_ID });
    db.serpent_weeks = [{ id: SERPENT_WEEK_ID, modifiers: ['twin_exits'] }];

    const response = await POST(post(endBody('session-1')));
    const body = await response.json();

    // Twin Exits banks at ×1.15 instead of ×1.25 — the condition is read from
    // the week, never guessed from the calendar or the request.
    expect(body.anomaly).toBe('twin_exits');
    expect(session().dna_earned).toBe(bankedUnder('twin_exits'));
    expect(session().dna_earned).toBeLessThan(bankedUnder(null));
  });

  it('a week the row no longer names settles under no condition at all', async () => {
    seedSession({ serpent_week_id: 'week-that-vanished' });
    db.serpent_weeks = [];

    const response = await POST(post(endBody('session-1')));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.anomaly).toBeUndefined();
    expect(session().dna_earned).toBe(bankedUnder(null));
  });
});

// ---------------------------------------------------------------------------
// A Signal run
// ---------------------------------------------------------------------------

describe('a Signal run resolves the day’s condition and settles under it', () => {
  it('start resolves it from the claimed day and puts it on the offer-weight channel', async () => {
    db.game_sessions = [];

    const response = await POST(
      post({
        action: 'start',
        mode: 'signal',
        snake_id: SNAKE_ID,
        signalObjectiveId: signalObjectiveId('extract'),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // NON-NULL, and the day's own condition — not a second derivation that
    // could drift from the one the Signal surface renders.
    expect(body.condition).toBe(body.signal.condition.id);
    expect(body.condition).toBe(describeSignalDay(body.signal.day).condition.id);
    // The tilt `SignalSurface` promises the player IS the tilt the engine's
    // offer draw reads. Asserted against the day's advertised `strainTilt`
    // rather than against ANOMALY_STRAINS directly: since WP-2.10b a clause
    // can outweigh the anomaly and move the tilt, and the whole point is that
    // the sentence on screen and the stream in the engine move together. A
    // regression that let them diverge would fail here.
    expect(body.genome.offerTiltStrain).toBe(
      describeSignalDay(body.signal.day).condition.strainTilt
    );
    expect(body.genome).toMatchObject({
      rulesVersion: GENOME_RULES_V2,
      runSeed: expect.any(String),
      ftuePresentation: { v: GENOME_RULES_V2 },
    });
    expect(Array.isArray(body.genome.v2GenePool)).toBe(true);
    expect(body.genome.v2GenePool.length).toBeGreaterThan(1);
    expect(body.genome).not.toHaveProperty('genePool');
    expect(body.runContext).toMatchObject({
      snake: {
        ascendance: {
          curveVersion: 2,
          multiplierBps: expect.any(Number),
        },
      },
      genome: {
        rulesVersion: GENOME_RULES_V2,
        genePool: body.genome.v2GenePool,
        ftuePresentation: body.genome.ftuePresentation,
      },
    });
    // The stamp the end path re-derives it from — mirrored by the RPC, not by
    // the session insert.
    expect(session().signal_objective_run_id).toBe(SIGNAL_ATTEMPT_ID);
    expect(session().anomaly_id ?? null).toBeNull();
    expect(session().serpent_week_id ?? null).toBeNull();
  });

  it('issues the complete legacy Genome contract when the v2 rollout is off', async () => {
    mockGenomeV2Enabled = false;
    db.game_sessions = [];

    const response = await POST(
      post({
        action: 'start',
        mode: 'signal',
        snake_id: SNAKE_ID,
        signalObjectiveId: signalObjectiveId('extract'),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.genome).toMatchObject({
      runSeed: expect.any(String),
      ftue: {
        bankedRuns: expect.any(Number),
        strainTagsUnlocked: expect.any(Boolean),
      },
    });
    expect(Array.isArray(body.genome.genePool)).toBe(true);
    expect(body.genome.genePool.length).toBeGreaterThan(1);
    expect(body.genome).not.toHaveProperty('rulesVersion');
    expect(body.genome).not.toHaveProperty('v2GenePool');
    expect(body.runContext.genome).toMatchObject({
      genePool: body.genome.genePool,
      tierCap: expect.any(Number),
    });
    expect(body.runContext.genome).not.toHaveProperty('rulesVersion');
  });

  it('settlement re-derives the SAME condition from the attempt and recomputes with it', async () => {
    seedSession({ signal_objective_run_id: SIGNAL_ATTEMPT_ID });
    db.signal_objective_runs = [
      {
        id: SIGNAL_ATTEMPT_ID,
        day_id: SIGNAL_DAY_ID,
        player_id: PLAYER_ID,
        objective_id: signalObjectiveId('extract'),
        target: 200,
        session_id: 'session-1',
        progress: 0,
        completed_at: null,
        settled_at: null,
        bonus_paid_at: null,
        signal_days: { day: GOLD_RUSH_SIGNAL_DAY },
      },
    ];

    const response = await POST(post(endBody('session-1')));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.anomaly).toBe('gold_rush');
    expect(db.economy_transactions[0].metadata).toMatchObject({
      anomaly: 'gold_rush',
    });
    expect(session().dna_earned).toBe(bankedUnder('gold_rush'));
    expect(session().dna_earned).toBeGreaterThan(bankedUnder(null));
  });

  it('start and end agree on one id across a whole run', async () => {
    db.game_sessions = [];

    const start = await POST(
      post({
        action: 'start',
        mode: 'signal',
        snake_id: SNAKE_ID,
        signalObjectiveId: signalObjectiveId('endure'),
      })
    );
    const startBody = await start.json();
    expect(startBody.condition).toBeTruthy();

    const activation = await POST(post({
      action: 'activate',
      sessionId: startBody.sessionId,
      checkpoint: openingCheckpoint(startBody),
    }));
    expect(activation.status).toBe(200);
    const activeRun = (await activation.json()).activeRun;

    const end = await POST(post({
      action: 'terminal',
      sessionId: startBody.sessionId,
      expectedRevision: activeRun.checkpointRevision,
      leaseToken: activeRun.leaseToken,
      replay: terminalReplayProof(activeRun.checkpoint),
    }));
    const endBodyJson = await end.json();

    expect(end.status).toBe(200);
    expect(endBodyJson.anomaly).toBe(startBody.condition);
  });
});

// ---------------------------------------------------------------------------
// The paths this must not have changed
// ---------------------------------------------------------------------------

describe('the legacy anomaly path is untouched', () => {
  it('start still stamps `anomaly_id` and resolves the week’s rotation', async () => {
    db.game_sessions = [];

    const response = await POST(
      post({ action: 'start', mode: 'anomaly', snake_id: SNAKE_ID })
    );
    const body = await response.json();

    const expected = anomalyForWeek(new Date());
    expect(body.condition).toBe(expected);
    expect(body.anomaly.id).toBe(expected);
    expect(session().anomaly_id).toBe(expected);
    expect(body.genome.offerTiltStrain).toBe(ANOMALY_STRAINS[expected]);
  });

  it('settlement still reads it straight off `anomaly_id`, with no week or day lookup', async () => {
    seedSession({ anomaly_id: 'gold_rush', anomaly_week: '2026-07-20' });

    const response = await POST(post(endBody('session-1')));
    const body = await response.json();

    expect(body.anomaly).toBe('gold_rush');
    expect(session().dna_earned).toBe(bankedUnder('gold_rush'));
    // The stamp is the whole answer: nothing else is consulted for it.
    expect(db.serpent_weeks).toHaveLength(0);
    expect(db.signal_objective_runs).toHaveLength(0);
  });
});

describe('an ordinary run has no condition at either end', () => {
  it('start resolves none and leaves the offer channel untilted', async () => {
    db.game_sessions = [];

    const response = await POST(
      post({ action: 'start', mode: 'earn', snake_id: SNAKE_ID })
    );
    const body = await response.json();

    expect(body.condition).toBeUndefined();
    expect(body.genome.offerTiltStrain).toBeNull();
  });

  it('settlement recomputes it under no condition', async () => {
    const response = await POST(post(endBody('session-1')));
    const body = await response.json();

    expect(body.anomaly).toBeUndefined();
    expect(session().dna_earned).toBe(bankedUnder(null));
  });
});
