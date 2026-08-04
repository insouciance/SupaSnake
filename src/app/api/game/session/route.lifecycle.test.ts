/**
 * @jest-environment node
 *
 * Session lifecycle at the route (WP-0.06, GT §9.6 · finding F-1).
 *
 * Acceptance proved here:
 *   - an expired session awards nothing and cannot be re-ended for value
 *   - each end reason is recorded by the path that owns it
 *   - an INVALID run cannot write `players.high_score`, and a valid one still can
 *
 * The fake below is a small in-memory Postgres: it stores rows, applies the
 * filters the route passes, and mutates on `update`/`insert`. That matters,
 * because most of these assertions are about what did NOT change.
 */

const mockCaptureException = jest.fn();
var mockSettleSessionReward: jest.Mock;
var mockSettleDurableRunProgression: jest.Mock;
var mockResumeOrRecoverRunImpact: jest.Mock;

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
jest.mock('@/lib/server/gameProgressionSettlement', () => ({
  settleDurableRunProgression: (...args: unknown[]) =>
    mockSettleDurableRunProgression(...args),
  resumeOrRecoverRunImpact: (...args: unknown[]) =>
    mockResumeOrRecoverRunImpact(...args),
}));

type Row = Record<string, unknown>;
type Call = [string, ...unknown[]];

const db: {
  players: Row[];
  game_sessions: Row[];
  economy_transactions: Row[];
  collected_snakes: Row[];
} = {
  players: [],
  game_sessions: [],
  economy_transactions: [],
  collected_snakes: [],
};

const rpcCalls: Array<{ fn: string; params: unknown }> = [];

/**
 * The database's payload byte caps, enforced here so the fake cannot accept a
 * payload the real SQL rejects.
 *
 * This harness previously let `stage_continuity_game_session_end` and
 * `complete_free_run_continuity` succeed unconditionally. That blind spot let a
 * settlement ship that every test passed and production could never complete:
 * two real accounts were locked out of play because their envelopes exceeded
 * `store_pending_game_session_end`'s bound (060:105) and were rejected on every
 * single retry, forever.
 *
 * MEASURE THE WAY POSTGRES DOES. The guard is
 * `octet_length(payload::TEXT)`, and jsonb's canonical text form puts a space
 * after every `:` and `,`. The stranded production envelope measured 63,687 B
 * with `JSON.stringify` — under the old 65,536 cap — but 70,113 B as
 * `jsonb::text`, which is the number that actually rejected it. Measuring the
 * compact form here would re-create the exact blind spot this test closes.
 */
const SETTLEMENT_PAYLOAD_MAX_BYTES = 262_144;

function assertSettlementPayloadBytes(fn: string, payload: unknown) {
  const bytes = jsonbTextByteLength(payload);
  if (bytes > SETTLEMENT_PAYLOAD_MAX_BYTES) {
    throw new Error(
      `${fn}: payload is ${bytes} bytes, over the ${SETTLEMENT_PAYLOAD_MAX_BYTES} cap`
    );
  }
}

let impactPersistError: Row | null = null;
let careerCapabilityError: Row | null = null;
let careerCapability: Row = {
  status: 'ready',
  bridgeVersion: 1,
  careerVersion: 1,
};
let pendingAdoptionError: Row | null = null;
let pendingLookupError: Row | null = null;
let snakeOwnershipCountError: Row | null = null;
let loseNextFreeSessionUpdateRace = false;
let loseNextFreeContinuityRace = false;

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
    rpc: async (fn: string, params: unknown) => {
      rpcCalls.push({ fn, params });
      if (fn === 'get_career_settlement_capability') {
        if (careerCapabilityError) {
          return { data: null, error: careerCapabilityError };
        }
        return { data: careerCapability, error: null };
      }
      if (fn === 'count_staged_pending_game_session_ends') {
        return { data: 0, error: null };
      }
      if (fn === 'stage_pending_game_session_end') {
        const p = (params ?? {}) as Row;
        assertSettlementPayloadBytes(fn, p.p_envelope);
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (target) {
          target.end_reason = 'completed';
          target.__pendingEnvelope = p.p_envelope;
        }
        return { data: { accepted: true, state: 'staged' }, error: null };
      }
      if (fn === 'stage_run_continuity_terminal') {
        const p = (params ?? {}) as Row;
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (!target) return { data: null, error: { message: 'session_not_found' } };
        target.continuity_phase = 'terminal';
        target.continuity_terminal_facts = p.p_terminal_facts;
        target.continuity_terminal_digest = p.p_terminal_digest;
        target.continuity_terminal_at = new Date().toISOString();
        return {
          data: { accepted: true, inserted: true, sessionId: target.id },
          error: null,
        };
      }
      if (fn === 'stage_continuity_game_session_end') {
        const p = (params ?? {}) as Row;
        assertSettlementPayloadBytes(fn, p.p_envelope);
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (target) {
          target.end_reason = 'completed';
          target.continuity_phase = 'settling';
          target.__pendingEnvelope = p.p_envelope;
        }
        return { data: { accepted: true, state: 'staged' }, error: null };
      }
      if (fn === 'complete_free_run_continuity') {
        const p = (params ?? {}) as Row;
        assertSettlementPayloadBytes(fn, p.p_facts);
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (target) {
          const facts = (p.p_facts ?? {}) as Row;
          Object.assign(target, {
            score: facts.score,
            dna_earned: facts.dnaEarned,
            yield_dna: facts.yieldDna,
            duration_seconds: facts.durationSeconds,
            died: facts.died,
            victory: facts.victory,
            extracted: facts.extracted,
            ended_at: facts.endedAt ?? new Date().toISOString(),
            end_reason: 'completed',
            validated: facts.validated,
            validation_errors: facts.validationErrors,
            foods_collected: facts.foodsCollected,
            mutations: facts.mutations,
            genome: facts.genome,
          });
        }
        if (loseNextFreeContinuityRace) {
          loseNextFreeContinuityRace = false;
          return {
            data: null,
            error: { message: 'run_not_terminalizable' },
          };
        }
        return { data: { accepted: true }, error: null };
      }
      if (fn === 'get_pending_game_session_end') {
        if (pendingLookupError) return { data: null, error: pendingLookupError };
        const p = (params ?? {}) as Row;
        const target = db.game_sessions.find((row) => row.id === p.p_session_id);
        if (!target?.__pendingEnvelope) return { data: null, error: null };
        return {
          data: {
            state: target.atomic_reward_observed_at ? 'adopted' : 'staged',
          },
          error: null,
        };
      }
      if (fn === 'adopt_pending_game_session_end') {
        if (pendingAdoptionError) return { data: null, error: pendingAdoptionError };
        const p = (params ?? {}) as Row;
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
            end_reason: 'completed',
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
      if (fn === 'persist_run_impact_envelope') {
        if (impactPersistError) return { data: null, error: impactPersistError };
        return {
          data: (params as { p_envelope?: unknown })?.p_envelope ?? null,
          error: null,
        };
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      const calls: Call[] = [];
      let pendingUpdate: Row | null = null;
      let pendingInsert: Row | null = null;

      const rows = () => (db[table as keyof typeof db] ?? []) as Row[];

      const settle = () => {
        const isSnakeOwnershipCount =
          table === 'collected_snakes' &&
          calls.some(
            ([op, , options]) =>
              op === 'select' &&
              (options as { count?: unknown } | undefined)?.count === 'exact'
          );
        if (isSnakeOwnershipCount && snakeOwnershipCountError) {
          return { data: [], count: null, error: snakeOwnershipCountError };
        }
        if (
          table === 'game_sessions' &&
          careerCapabilityError &&
          calls.some(([op, selected]) => op === 'select' && selected === 'reward_protocol')
        ) {
          return { data: [], count: null, error: careerCapabilityError };
        }
        if (pendingInsert) {
          const inserted = { id: `${table}-${rows().length + 1}`, ...pendingInsert };
          rows().push(inserted);
          pendingInsert = null;
          return { data: [inserted], count: null, error: null };
        }
        const hit = rows().filter((row) => matches(row, calls));
        if (pendingUpdate) {
          for (const row of hit) Object.assign(row, pendingUpdate);
          pendingUpdate = null;
          if (
            loseNextFreeSessionUpdateRace &&
            table === 'game_sessions' &&
            hit.some((row) => row.is_free_play === true)
          ) {
            loseNextFreeSessionUpdateRace = false;
            return { data: [], count: null, error: null };
          }
        }
        return {
          data: hit,
          count: isSnakeOwnershipCount ? hit.length : null,
          error: null,
        };
      };

      const builder: Record<string, unknown> = {};
      const push = (op: string) => (...args: unknown[]) => {
        calls.push([op, ...args]);
        return builder;
      };
      for (const op of ['select', 'eq', 'is', 'neq', 'lt', 'gte', 'not', 'in', 'order', 'range', 'limit']) {
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
import { POST } from './route';
import { computeRunTotals } from '@/shared/game/rulesets';
import { STALE_OPEN_MINUTES } from '@/lib/session/lifecycle';
import {
  SNAKE_RULES_VERSION,
  SnakeGameLogic,
} from '@/lib/game/SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';
import { createHash } from 'crypto';
import { jsonbTextByteLength } from '@/shared/game/settlementGenome';

const PLAYER_ID = 'player-1';
const START_REQUEST_ID = '2f515f00-908b-4f7d-86fb-721db70fed83';
const FOOD_COUNT = 20;
const EXPECTED = computeRunTotals('CYBER', FOOD_COUNT);

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

function seedPlayer(overrides: Row = {}) {
  db.players = [
    {
      id: PLAYER_ID,
      user_id: 'auth-1',
      dna: 0,
      total_games_played: 0,
      total_dna_earned: 0,
      high_score: 10,
      breeds_completed: 0,
      ...overrides,
    },
  ];
}

function seedSession(overrides: Row = {}) {
  const startedAt = new Date(Date.now() - 120_000).toISOString();
  db.game_sessions = [
    {
      id: 'session-1',
      player_id: PLAYER_ID,
      dynasty: 'CYBER',
      snake_used_id: null,
      started_at: startedAt,
      server_started_at: startedAt,
      ended_at: null,
      end_reason: null,
      score: 0,
      dna_earned: 0,
      validated: false,
      is_free_play: false,
      anomaly_id: null,
      ...overrides,
    },
  ];
}

function endBody(overrides: Record<string, unknown> = {}) {
  return {
    action: 'end',
    sessionId: 'session-1',
    food_count: FOOD_COUNT,
    extracted: true,
    score: EXPECTED.score,
    dna_earned: EXPECTED.rawDna,
    duration_seconds: 100,
    died: false,
    victory: false,
    ...overrides,
  };
}

const session = () => db.game_sessions[0];
const player = () => db.players[0];

function seedContinuityTerminalRun(options: {
  phase?: 'active' | 'terminal';
  freePlay?: boolean;
  rulesVersion?: string;
} = {}) {
  const now = Date.now();
  const leaseToken = 'route-terminal-lease-token-with-enough-entropy';
  const game = new SnakeGameLogic({
    gridSize: 4,
    ruleset: RULESETS.PRIMAL,
    simulationSeed: 'route-terminal-seed',
  });
  game.prepare();
  const opening = game.exportCheckpoint(now - 1_000);
  game.activatePrepared(now - 1_000);
  game.tick();
  game.tick();
  const trace = game.getReplayTrace();
  const result = game.getTerminalResult();
  if (!result) throw new Error('terminal fixture did not collide');
  const terminalFacts = {
    score: result.score,
    dna_earned: result.dnaCollected,
    duration_seconds: 1,
    food_count: result.foodEaten,
    extracted: result.extracted,
    died: !result.extracted,
    victory: false,
    mutations: result.mutations,
    phoenix_triggered_at_food: result.phoenixTriggeredAtFood,
    genome: result.genome,
    death_cause: result.deathCause,
    run_events: game.getRunEvents(),
  };
  const manifest = {
    sessionId: 'session-1',
    simulation: {
      seed: 'route-terminal-seed',
      version: 1,
      rulesVersion: options.rulesVersion ?? SNAKE_RULES_VERSION,
    },
    runSnake: { dynasty: 'PRIMAL', generation: 1 },
  };
  seedSession({
    dynasty: 'PRIMAL',
    start_request_id: START_REQUEST_ID,
    start_request_fingerprint: 'a'.repeat(64),
    start_manifest: manifest,
    simulation_rules_version: options.rulesVersion ?? SNAKE_RULES_VERSION,
    continuity_phase: options.phase ?? 'active',
    continuity_activated_at: new Date(now - 1_000).toISOString(),
    continuity_checkpoint: opening,
    continuity_checkpoint_revision: 1,
    continuity_lease_hash: createHash('sha256').update(leaseToken).digest('hex'),
    continuity_lease_epoch: 1,
    energy_committed: options.freePlay ? 0 : 1,
    commitment_multiplier_bps: 10_000,
    is_free_play: options.freePlay === true,
    ...(options.phase === 'terminal'
      ? {
          continuity_terminal_facts: terminalFacts,
          continuity_terminal_digest: 'b'.repeat(64),
          continuity_terminal_at: new Date(now).toISOString(),
        }
      : {}),
  });
  return {
    leaseToken,
    terminalFacts,
    request: {
      action: 'terminal',
      sessionId: 'session-1',
      expectedRevision: 1,
      leaseToken,
      replay: {
        fromTick: opening.privateState.replay.ticks,
        toTick: trace.ticks,
        actionOffset: opening.privateState.replay.actions.length,
        actions: trace.actions.slice(opening.privateState.replay.actions.length),
        activeElapsedMs: 1_000,
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.economy_transactions = [];
  db.collected_snakes = [];
  rpcCalls.length = 0;
  impactPersistError = null;
  careerCapabilityError = null;
  careerCapability = {
    status: 'ready',
    bridgeVersion: 1,
    careerVersion: 1,
  };
  pendingAdoptionError = null;
  pendingLookupError = null;
  snakeOwnershipCountError = null;
  loseNextFreeSessionUpdateRace = false;
  loseNextFreeContinuityRace = false;
  seedPlayer();
  seedSession();
  mockSettleSessionReward = jest.fn(async (_client: unknown, rawInput: unknown) => {
    const input = rawInput as {
      finalDna: number;
      score: number;
      validated: boolean;
      sessionId: string;
    };
    const row = player();
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
    const settled = await mockSettleSessionReward(null, {
      finalDna: Number(session().dna_earned ?? 0),
      score: Number(session().score ?? 0),
      validated: session().validated === true,
      sessionId: String(session().id),
      metadata: {},
    });
    if (!settled.ok) return settled;
    if (impactPersistError) return { ok: false, error: impactPersistError };
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

describe('the migration-060 earning-start gate', () => {
  it('accepts the durable bridge capability and proceeds past maintenance', async () => {
    db.game_sessions = [];
    careerCapability = {
      status: 'pending',
      bridgeVersion: 1,
      careerVersion: null,
    };

    const response = await POST(
      post({ action: 'start', mode: 'earn', snake_id: 'missing-snake', energyCommitment: 1 })
    );

    expect(response.status).toBe(400);
    expect(rpcCalls.map((call) => call.fn)).toContain(
      'count_staged_pending_game_session_ends'
    );
  });

  it('fails before session or Energy mutation when atomic settlement is unavailable', async () => {
    db.game_sessions = [];
    careerCapabilityError = {
      code: '42703',
      message: 'column game_sessions.reward_protocol does not exist',
    };

    const beforePlayer = { ...player() };
    const response = await POST(
      post({ action: 'start', mode: 'earn', snake_id: 'snake-1', energyCommitment: 1 })
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ retryable: true, maintenance: true });
    expect(db.game_sessions).toHaveLength(0);
    expect(player()).toEqual(beforePlayer);
    expect(rpcCalls.map((call) => call.fn)).not.toContain('commit_run_energy');
  });

  it('reports a non-capability database error without mutating gameplay state', async () => {
    db.game_sessions = [];
    careerCapabilityError = { code: '08006', message: 'connection failure' };

    const response = await POST(
      post({ action: 'start', mode: 'earn', snake_id: 'snake-1', energyCommitment: 1 })
    );

    expect(response.status).toBe(503);
    expect(db.game_sessions).toHaveLength(0);
    expect(rpcCalls.map((call) => call.fn)).not.toContain('commit_run_energy');
    expect(mockCaptureException).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('session-start missing-snake ownership fallback', () => {
  async function startWithMissingSnake() {
    db.game_sessions = [];
    return POST(
      post({ action: 'start', mode: 'free', snake_id: 'missing-snake' })
    );
  }

  it('keeps genuine non-ownership distinct when another playable snake exists', async () => {
    db.collected_snakes = [{ id: 'owned-snake', player_id: PLAYER_ID }];

    const response = await startWithMissingSnake();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Snake not found or not owned' });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('directs a player with no owned snakes back through player setup', async () => {
    const response = await startWithMissingSnake();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'No playable snake is available. Retry player setup from Home.',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports an ownership-count read failure as retryable without claiming zero snakes', async () => {
    snakeOwnershipCountError = { code: '08006', message: 'connection failure' };

    const response = await startWithMissingSnake();

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('3');
    expect(await response.json()).toEqual({
      error: 'Could not prepare the run — retry when you are ready',
      retryable: true,
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Session-start snake ownership check failed: connection failure',
      }),
      { extra: { playerId: PLAYER_ID, snakeId: 'missing-snake' } }
    );
  });
});

// ---------------------------------------------------------------------------

describe('a settled run records `completed`', () => {
  it('stamps the reason and pays out', async () => {
    const response = await POST(post(endBody()));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(session().end_reason).toBe('completed');
    expect(session().ended_at).not.toBeNull();
    expect(session().validated).toBe(true);
    expect(player().dna).toBeGreaterThan(0);
  });

  it('acknowledges secured pending progress when the atomic reward fold defers', async () => {
    mockSettleSessionReward.mockResolvedValueOnce({
      ok: false,
      error: { code: '40001', message: 'serialization failure' },
    });
    const response = await POST(post(endBody()));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
      sessionId: 'session-1',
    });
    expect(session().ended_at).not.toBeNull();
    expect(session().end_reason).toBe('completed');
    expect(session().reward_protocol).toBe('atomic_v1');
    expect(session().progression_settlement_payload).toMatchObject({ v: 1 });
    expect(player().dna).toBe(0);
    expect(player().total_games_played).toBe(0);
  });

  it('makes a concurrent completed-before-receipt response retryable', async () => {
    seedSession({
      ended_at: new Date().toISOString(),
      end_reason: 'completed',
      validated: true,
      atomic_reward_observed_at: new Date().toISOString(),
    });
    mockResumeOrRecoverRunImpact.mockResolvedValueOnce({
      status: 'unavailable',
      error: new Error('still settling'),
    });
    const response = await POST(post(endBody()));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      alreadyEnded: true,
      impactPending: true,
      retryable: true,
    });
    expect(mockSettleDurableRunProgression).not.toHaveBeenCalled();
  });

  it('acknowledges a duplicate while its server receipt remains pending', async () => {
    seedSession({
      ended_at: new Date().toISOString(),
      end_reason: 'completed',
      validated: true,
      atomic_reward_observed_at: new Date().toISOString(),
    });
    mockResumeOrRecoverRunImpact.mockResolvedValueOnce({
      status: 'pending',
      error: new Error('ordered stage deferred'),
    });
    const response = await POST(post(endBody()));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
      sessionId: 'session-1',
    });
  });

  it('keeps a continuity settlement retryable when its pending receipt lookup fails', async () => {
    const leaseToken = 'continuity-terminal-lease-token-with-enough-entropy';
    const { createHash } = await import('crypto');
    seedSession({
      start_request_id: START_REQUEST_ID,
      continuity_phase: 'active',
      continuity_checkpoint: { version: 1 },
      continuity_checkpoint_revision: 1,
      continuity_lease_hash: createHash('sha256').update(leaseToken).digest('hex'),
      ended_at: null,
      end_reason: 'completed',
    });
    pendingLookupError = { code: '08006', message: 'connection failure' };

    const response = await POST(post(endBody({ leaseToken })));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      retryable: true,
    });
    expect(session().end_reason).toBe('completed');
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_continuity_game_session_end'
    );
  });

  it('does not call an unpersisted impact envelope successful', async () => {
    impactPersistError = { code: '08006', message: 'connection failure' };
    const response = await POST(post(endBody()));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
      sessionId: 'session-1',
    });
    // The atomic reward succeeded; only its durable presentation is pending.
    expect(player().dna).toBeGreaterThan(0);
    expect(session().ended_at).not.toBeNull();
  });
});

describe('durable earning-end ingress', () => {
  it('stages replay-derived terminal facts before entering earning settlement', async () => {
    const fixture = seedContinuityTerminalRun();

    const response = await POST(post(fixture.request));

    expect([200, 202]).toContain(response.status);
    const terminalCall = rpcCalls.find(
      (call) => call.fn === 'stage_run_continuity_terminal'
    );
    const settlementCall = rpcCalls.find(
      (call) => call.fn === 'stage_continuity_game_session_end'
    );
    expect(terminalCall).toBeDefined();
    expect(terminalCall?.params).toMatchObject({
      p_session_id: 'session-1',
      p_expected_revision: 1,
      p_terminal_facts: expect.objectContaining({
        score: fixture.terminalFacts.score,
        food_count: fixture.terminalFacts.food_count,
        death_cause: fixture.terminalFacts.death_cause,
      }),
    });
    expect(settlementCall).toBeDefined();
    expect(settlementCall?.params).toMatchObject({
      p_session_id: 'session-1',
      // The terminal phase is the durable authority after the first RPC, so
      // settlement recovery no longer depends on a browser-held lease token.
      p_lease_hash: null,
    });
    expect(session().continuity_phase).toBe('settling');
    expect(session().end_reason).toBe('completed');
  });

  it('recognizes a terminal-to-settling commit when its first response was lost', async () => {
    seedContinuityTerminalRun({ phase: 'terminal' });
    Object.assign(session(), {
      continuity_phase: 'settling',
      end_reason: 'completed',
      __pendingEnvelope: { v: 1, sessionId: 'session-1' },
    });

    // This is the exact browser retry after stage_continuity_game_session_end
    // committed but its HTTP acknowledgement disappeared.
    const response = await POST(
      post({
        action: 'terminal',
        sessionId: 'session-1',
        expectedRevision: 1,
        leaseToken: 'stale-browser-token-is-not-consulted-here',
        replay: {
          fromTick: 0,
          toTick: 0,
          actionOffset: 0,
          actions: [],
          activeElapsedMs: 0,
        },
      })
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
      sessionId: 'session-1',
    });
    expect(rpcCalls.map((call) => call.fn)).toEqual(
      expect.arrayContaining([
        'get_pending_game_session_end',
        'adopt_pending_game_session_end',
      ])
    );
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_run_continuity_terminal'
    );
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_continuity_game_session_end'
    );
  });

  it('folds a stored terminal outcome after reload without a lease token', async () => {
    seedContinuityTerminalRun({ phase: 'terminal' });

    const response = await POST(
      post({ action: 'end', sessionId: 'session-1' })
    );

    expect([200, 202]).toContain(response.status);
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_run_continuity_terminal'
    );
    expect(
      rpcCalls.find((call) => call.fn === 'stage_continuity_game_session_end')
        ?.params
    ).toMatchObject({
      p_session_id: 'session-1',
      p_lease_hash: null,
    });
    expect(session().end_reason).toBe('completed');
  });

  it('completes a free terminal run without entering Career settlement', async () => {
    seedContinuityTerminalRun({ phase: 'terminal', freePlay: true });

    const response = await POST(
      post({ action: 'end', sessionId: 'session-1' })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, freePlay: true });
    expect(
      rpcCalls.find((call) => call.fn === 'complete_free_run_continuity')
        ?.params
    ).toMatchObject({
      p_session_id: 'session-1',
      p_lease_hash: null,
    });
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_continuity_game_session_end'
    );
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_pending_game_session_end'
    );
    expect(mockSettleDurableRunProgression).not.toHaveBeenCalled();
    expect(session().ended_at).not.toBeNull();

    const replay = await POST(
      post({ action: 'end', sessionId: 'session-1' })
    );
    const replayBody = await replay.json();

    expect(replay.status).toBe(409);
    expect(replayBody).toMatchObject({
      success: true,
      alreadyEnded: true,
      endReason: 'completed',
      sessionId: 'session-1',
      freePlay: true,
      validation: {
        valid: true,
        score: body.validation.score,
        extracted: body.validation.extracted,
        yieldDna: body.validation.yieldDna,
      },
      hypotheticalDna: body.hypotheticalDna,
      genome: body.genome ?? null,
    });
  });

  it('returns the persisted Free Play result after losing the completion race', async () => {
    seedSession({
      is_free_play: true,
      charge_state: 'lean',
      energy_harvest_multiplier_bps: 2_500,
    });
    loseNextFreeSessionUpdateRace = true;

    const response = await POST(post(endBody()));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: true,
      alreadyEnded: true,
      endReason: 'completed',
      sessionId: 'session-1',
      freePlay: true,
      validation: {
        valid: true,
        score: EXPECTED.score,
        extracted: true,
        yieldDna: expect.any(Number),
        chargeState: 'lean',
      },
      hypotheticalDna: expect.any(Number),
    });
    expect(body.hypotheticalDna).toBeLessThan(body.validation.yieldDna);
  });

  it('returns the persisted result after losing an atomic continuity completion race', async () => {
    seedContinuityTerminalRun({ phase: 'terminal', freePlay: true });
    loseNextFreeContinuityRace = true;

    const response = await POST(
      post({ action: 'end', sessionId: 'session-1' })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: true,
      alreadyEnded: true,
      endReason: 'completed',
      sessionId: 'session-1',
      freePlay: true,
      validation: {
        valid: true,
        score: session().score,
        extracted: session().extracted,
        yieldDna: session().yield_dna,
      },
    });
  });

  it('never lets an older continuity rules stamp fall back to raw end facts', async () => {
    const fixture = seedContinuityTerminalRun({
      rulesVersion: 'snake-rules-older-release',
    });

    const response = await POST(
      post(endBody({ leaseToken: fixture.leaseToken }))
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      reason: 'terminal_intent_required',
      retryable: true,
    });
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_continuity_game_session_end'
    );
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_pending_game_session_end'
    );
    expect(session().end_reason).toBeNull();
  });

  it('returns durable 202 on schema 060 and a replay adopts the same result on 061', async () => {
    pendingAdoptionError = {
      code: 'PGRST202',
      message: 'Could not find adopt_pending_game_session_end',
    };
    const first = await POST(post(endBody()));
    const firstBody = await first.json();

    expect(first.status).toBe(202);
    expect(firstBody).toEqual({
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
      sessionId: 'session-1',
    });
    expect(session().ended_at).toBeNull();
    expect(session().end_reason).toBe('completed');
    expect(player().dna).toBe(0);
    expect(rpcCalls.map((call) => call.fn)).toEqual(
      expect.arrayContaining([
        'stage_pending_game_session_end',
        'adopt_pending_game_session_end',
      ])
    );

    pendingAdoptionError = null;
    mockResumeOrRecoverRunImpact.mockResolvedValue({
      status: 'found',
      impact: { version: 1, sessionId: 'session-1' },
    });
    const replay = await POST(post(endBody()));
    const replayBody = await replay.json();

    expect(replay.status).toBe(409);
    expect(replayBody).toMatchObject({
      alreadyEnded: true,
      impact: { sessionId: 'session-1' },
    });
    expect(session().reward_protocol).toBe('atomic_v1');
    expect(session().ended_at).not.toBeNull();
    expect(mockResumeOrRecoverRunImpact).toHaveBeenCalledWith(
      expect.anything(),
      PLAYER_ID,
      'session-1'
    );
  });
});

describe('an expired session awards nothing and cannot be re-ended for value', () => {
  beforeEach(() => {
    // Exactly what the sweep leaves behind: closed, reason recorded, and —
    // the dangerous case — a row that had already been scored and validated
    // by a settlement whose reward write failed and was never replayed.
    seedSession({
      ended_at: new Date().toISOString(),
      end_reason: 'expired',
      score: 99999,
      validated: true,
      dna_earned: 4242,
    });
  });

  it('refuses the end with 409 and names the reason', async () => {
    const response = await POST(post(endBody()));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.alreadyEnded).toBe(true);
    expect(body.endReason).toBe('expired');
  });

  it('grants no DNA, no games played, no total earned, no record', async () => {
    const before = { ...player() };

    await POST(post(endBody()));

    expect(player().dna).toBe(before.dna);
    expect(player().total_games_played).toBe(before.total_games_played);
    expect(player().total_dna_earned).toBe(before.total_dna_earned);
    // Not even the 99999 sitting on the expired row.
    expect(player().high_score).toBe(before.high_score);
  });

  it('writes no economy transaction and no streak', async () => {
    await POST(post(endBody()));

    expect(db.economy_transactions).toHaveLength(0);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('record_daily_play');
  });

  it('cannot be re-ended by a replay, however many times it is tried', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await POST(post(endBody()));
      expect(response.status).toBe(409);
    }
    expect(player().dna).toBe(0);
    expect(session().end_reason).toBe('expired');
  });

  it('cannot be forfeited into a different reason either', async () => {
    const response = await POST(
      post({ action: 'abandon', sessionId: 'session-1', reason: 'disconnected' })
    );

    expect(response.status).toBe(409);
    expect(session().end_reason).toBe('expired');
  });
});

describe('the explicit abandonment path', () => {
  it('cannot overwrite a completed run whose durable settlement is pending', async () => {
    seedSession({ ended_at: null, end_reason: 'completed' });
    const response = await POST(
      post({ action: 'abandon', sessionId: 'session-1' })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      alreadyEnded: true,
      endReason: 'completed',
    });
    expect(session().end_reason).toBe('completed');
    expect(session().ended_at).toBeNull();
  });

  it('never interprets disconnection copy as consent to forfeit implicitly', async () => {
    const response = await POST(
      post({ action: 'abandon', sessionId: 'session-1', reason: 'disconnected' })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, endReason: 'abandoned' });
    expect(session().end_reason).toBe('abandoned');
    expect(session().ended_at).not.toBeNull();
  });

  it('defaults to `abandoned` when no reason is given', async () => {
    await POST(post({ action: 'abandon', sessionId: 'session-1' }));
    expect(session().end_reason).toBe('abandoned');
  });

  it('refuses to let a client claim its run settled', async () => {
    for (const claimed of ['completed', 'expired', 'nonsense', 42, null]) {
      seedSession();
      await POST(post({ action: 'abandon', sessionId: 'session-1', reason: claimed }));
      expect(session().end_reason).toBe('abandoned');
    }
  });

  it('pays nothing: no DNA, no games played, no record, no transaction', async () => {
    await POST(post({ action: 'abandon', sessionId: 'session-1' }));

    expect(player().dna).toBe(0);
    expect(player().total_games_played).toBe(0);
    expect(player().total_dna_earned).toBe(0);
    expect(player().high_score).toBe(10);
    expect(db.economy_transactions).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it('leaves the run row itself untouched apart from how it closed', async () => {
    await POST(post({ action: 'abandon', sessionId: 'session-1' }));

    expect(session().score).toBe(0);
    expect(session().dna_earned).toBe(0);
    expect(session().validated).toBe(false);
  });

  it('turns a forfeited run into one that can never settle', async () => {
    await POST(post({ action: 'abandon', sessionId: 'session-1' }));

    const replay = await POST(post(endBody()));
    const body = await replay.json();

    expect(replay.status).toBe(409);
    expect(body.endReason).toBe('abandoned');
    expect(player().dna).toBe(0);
  });

  it('404s a session that is not this player’s', async () => {
    const response = await POST(post({ action: 'abandon', sessionId: 'someone-else' }));
    expect(response.status).toBe(404);
  });

  it('400s without a session id', async () => {
    const response = await POST(post({ action: 'abandon' }));
    expect(response.status).toBe(400);
  });
});

describe('the start path preserves an existing run for explicit recovery', () => {
  it('never auto-abandons stale or fresh sessions on a new start', async () => {
    const stale = new Date(Date.now() - (STALE_OPEN_MINUTES + 30) * 60_000).toISOString();
    const fresh = new Date(Date.now() - 60_000).toISOString();
    db.game_sessions = [
      { id: 'mine-stale', player_id: PLAYER_ID, started_at: stale, ended_at: null, end_reason: null },
      { id: 'mine-fresh', player_id: PLAYER_ID, started_at: fresh, ended_at: null, end_reason: null },
      // Settled, reward write failed, awaiting an outbox replay worth DNA.
      { id: 'mine-pending', player_id: PLAYER_ID, started_at: stale, ended_at: null, end_reason: 'completed' },
      { id: 'theirs', player_id: 'player-2', started_at: stale, ended_at: null, end_reason: null },
    ];

    const response = await POST(post({
      action: 'start',
      snake_id: 'snake-1',
      energyCommitment: 1,
    }));
    expect(response.status).toBe(409);

    const byId = Object.fromEntries(db.game_sessions.map((row) => [row.id, row]));
    expect(byId['mine-stale'].end_reason).toBeNull();
    expect(byId['mine-stale'].ended_at).toBeNull();
    expect(byId['mine-fresh'].ended_at).toBeNull();
    // Still owed (Rule 6).
    expect(byId['mine-pending'].ended_at).toBeNull();
    expect(byId['mine-pending'].end_reason).toBe('completed');
    // Someone else's run.
    expect(byId['theirs'].ended_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FINDING F-1
// ---------------------------------------------------------------------------

describe('players.high_score is written from the recompute (F-1, WP-2.05)', () => {
  // WHAT CHANGED, AND WHY THE FINDING IS STILL CLOSED
  //
  // F-1 (WP-0.06) was: a run that failed validation still set a permanent
  // personal record. The fix at the time was to gate the write on
  // `validation.valid`.
  //
  // WP-2.05 reclassifies what `valid` means, so that gate now lets through a
  // run whose only finding was a claim mismatch. That is CORRECT, and the
  // finding stays closed, because the gate was never the real protection:
  // the route writes `validation.adjustedScore` - THE SERVER'S OWN RECOMPUTE
  // - and has no path that can write a claimed number. An inflated claim
  // therefore cannot inflate the record whether the run is eligible or not,
  // which is what the tests below assert directly rather than by proxy.
  //
  // The gate still does one job, and only one: a run the server could not
  // BOUND (a fatal code) writes no record at all.

  it('a VALID run still sets the record', async () => {
    const response = await POST(post(endBody()));

    expect(response.status).toBe(200);
    expect(session().validated).toBe(true);
    expect(player().high_score).toBe(EXPECTED.score);
    expect(EXPECTED.score).toBeGreaterThan(10);
  });

  it('an INFLATED CLAIM cannot inflate the record — the recompute is written', async () => {
    // This is the real F-1 protection, and it is stronger than the flag was:
    // 999,999 never reaches `players`, because the only number the route can
    // write is the one it computed itself.
    const response = await POST(post(endBody({ score: 999_999 })));

    expect(response.status).toBe(200);
    // ADVISORY under WP-2.05: a claim that disagrees with the server's own
    // arithmetic loses the argument about the payout, not the run.
    expect(session().validated).toBe(true);
    expect(session().validation_errors).toEqual(
      expect.arrayContaining([expect.stringContaining('SCORE_MISMATCH')])
    );
    expect(player().high_score).toBe(EXPECTED.score);
    expect(player().high_score).not.toBe(999_999);
  });

  it('a run the server cannot BOUND writes no record at all', async () => {
    // INVALID_DURATION is one of the two surviving fatal codes: the
    // food-rate bound is derived from duration, so an unbounded duration is
    // an unbounded run. `server_started_at` is 120s ago; the claim is an
    // hour.
    const response = await POST(post(endBody({ duration_seconds: 3_600 })));

    expect(response.status).toBe(200);
    expect(session().validated).toBe(false);
    expect(session().validation_errors).toEqual(
      expect.arrayContaining([expect.stringContaining('INVALID_DURATION')])
    );
    expect(player().high_score).toBe(10);
  });

  it('never writes the record downward — an existing record survives a fatal run', async () => {
    seedPlayer({ high_score: 50_000 });

    await POST(post(endBody({ duration_seconds: 3_600 })));

    expect(session().validated).toBe(false);
    expect(player().high_score).toBe(50_000);
  });

  it('never writes the record downward on a valid but weaker run either', async () => {
    seedPlayer({ high_score: 50_000 });

    await POST(post(endBody()));

    expect(session().validated).toBe(true);
    expect(player().high_score).toBe(50_000);
  });

  it('still records and pays a run the server could not bound', async () => {
    await POST(post(endBody({ duration_seconds: 3_600 })));

    // Rule 6 in the other direction: a flagged run is not confiscated. It is
    // stored, it settles, and the leaderboard refuses it at read time.
    expect(session().ended_at).not.toBeNull();
    expect(session().end_reason).toBe('completed');
    expect(player().total_games_played).toBe(1);
  });

  it('stores the duration clamped to the time that actually passed', async () => {
    // The row is read directly by Signal's `endure` objective, so a crafted
    // hour must not become an hour of objective progress.
    await POST(post(endBody({ duration_seconds: 3_600 })));

    expect(session().duration_seconds).toBeLessThanOrEqual(125);
    expect(session().duration_seconds).toBeGreaterThanOrEqual(115);
  });
});

// ---------------------------------------------------------------------------
// STRANDED TERMINAL RUNS — the settlement-recovery incident
// ---------------------------------------------------------------------------
//
// A run the server terminalized but never folded keeps `ended_at IS NULL`, so
// `readActiveRun` keeps returning it and the start guard refused every future
// run — permanently, because no sweeper can reach such a row:
// `expire_stale_game_sessions` skips continuity rows, and both pending
// settlement scans require a durable envelope this run never staged. The start
// path now folds it first, through this route's own audited settlement branch.

describe('a start absorbs a stranded terminal run instead of refusing forever', () => {
  const startRequest = (startRequestId: string) =>
    post({
      action: 'start',
      startRequestId,
      mode: 'earn',
      snake_id: 'snake-1',
      energyCommitment: 1,
    });

  it('folds the server-locked outcome and stops answering `active_run`', async () => {
    seedContinuityTerminalRun({ phase: 'terminal' });
    db.collected_snakes = [{ id: 'snake-1', player_id: PLAYER_ID }];

    const response = await POST(startRequest('4d0cf776-7646-4db9-8cb4-f6557d99926d'));
    const body = await response.json();

    // The stranded run is settled, not merely inspected.
    expect(session().end_reason).toBe('completed');
    expect(session().ended_at).not.toBeNull();
    expect(
      rpcCalls.find((call) => call.fn === 'stage_continuity_game_session_end')
        ?.params
    ).toMatchObject({ p_session_id: 'session-1', p_lease_hash: null });

    // And the account is no longer locked out by that run.
    expect(body?.reason).not.toBe('active_run');
  });

  it('pays the absorbed run exactly once, however many starts are attempted', async () => {
    seedContinuityTerminalRun({ phase: 'terminal' });
    db.collected_snakes = [{ id: 'snake-1', player_id: PLAYER_ID }];

    await POST(startRequest('4d0cf776-7646-4db9-8cb4-f6557d99926d'));
    const dnaAfterFirst = Number(player().dna ?? 0);
    const gamesAfterFirst = Number(player().total_games_played ?? 0);
    const settlementsAfterFirst = mockSettleSessionReward.mock.calls.length;

    await POST(startRequest('9128ca9f-2a4b-41d0-bfe0-af993743e610'));

    expect(mockSettleSessionReward.mock.calls.length).toBe(settlementsAfterFirst);
    expect(Number(player().dna ?? 0)).toBe(dnaAfterFirst);
    expect(Number(player().total_games_played ?? 0)).toBe(gamesAfterFirst);
    expect(
      db.economy_transactions.filter(
        (row) => row.source_id === 'session-1'
      ).length
    ).toBeLessThanOrEqual(1);
  });

  it('absorbs through one delegated settlement, never a recursive cascade', async () => {
    seedContinuityTerminalRun({ phase: 'terminal' });
    db.collected_snakes = [{ id: 'snake-1', player_id: PLAYER_ID }];

    await POST(startRequest('4d0cf776-7646-4db9-8cb4-f6557d99926d'));

    expect(
      rpcCalls.filter((call) => call.fn === 'stage_continuity_game_session_end')
        .length
    ).toBe(1);
  });

  it('leaves an ordinary active run refused — absorption is only for locked outcomes', async () => {
    seedContinuityTerminalRun({ phase: 'active' });
    db.collected_snakes = [{ id: 'snake-1', player_id: PLAYER_ID }];

    const response = await POST(startRequest('4d0cf776-7646-4db9-8cb4-f6557d99926d'));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ reason: 'active_run' });
    expect(session().ended_at).toBeNull();
    expect(session().end_reason).toBeNull();
    expect(rpcCalls.map((call) => call.fn)).not.toContain(
      'stage_continuity_game_session_end'
    );
  });
});
