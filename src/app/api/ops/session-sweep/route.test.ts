/**
 * @jest-environment node
 *
 * GET /api/ops/session-sweep — the sweep as PRIMARY SETTLER (CE-2, GT §9.6).
 *
 * Acceptance proved here:
 *   - the open-session count decays, and expiry awards nothing (WP-0.06). The
 *     second half is proved structurally: `from()` throws for every table, so
 *     reaching a 200 proves the sweep wrote none of them.
 *   - a stranded terminal run settles with NO client involved at all
 *   - one poisoned session blocks neither a later session of the same player
 *     nor any session of any other player
 *   - a chronically failing row yields its slot to healthy work, is never
 *     given up on, and is named in the report once it crosses the threshold
 *   - one invocation keeps working until its duration budget runs out
 *
 * REAL GUARDS (the PR #72 harness pattern). The two scan RPCs are not stubbed
 * with canned arrays: the fake below implements migration 068's actual
 * predicates — the receipt anti-join, the exponential backoff window, the
 * attempt-aware selection order, the chronological return order, and the
 * claim that stamps `progression_recovery_attempted_at` and increments
 * `progression_recovery_attempts`. A test that asserts "session-2 was
 * attempted" therefore fails if the SQL contract regresses to
 * `DISTINCT ON (player_id)`, instead of passing against a hand-written array
 * that could not tell the difference.
 */

const mockCaptureException = jest.fn();
const mockResumeOrRecoverRunImpact = jest.fn();
const mockSessionPost = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => fakeRpc(...(args as [string, Row])),
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// Everything except the settlement itself stays REAL, so the scans under test
// are the shipped parsers running against the shipped SQL contract.
jest.mock('@/lib/server/gameProgressionSettlement', () => ({
  ...jest.requireActual('@/lib/server/gameProgressionSettlement'),
  resumeOrRecoverRunImpact: (...args: unknown[]) =>
    mockResumeOrRecoverRunImpact(...args),
}));

// The settlement fold is invoked in-process; the sweep must not depend on
// loading the whole game-session route to be tested.
jest.mock('@/app/api/game/session/route', () => ({
  POST: (...args: unknown[]) => mockSessionPost(...args),
}));

type Row = Record<string, unknown>;

const SECRET = 'cron-secret-for-tests';
const MINUTE = 60_000;

// ---------------------------------------------------------------------------
// The fake: migration 068's contract, enforced
// ---------------------------------------------------------------------------

interface SweepRow {
  id: string;
  player_id: string;
  user_id: string;
  ended_at: string | null;
  end_reason: string | null;
  is_free_play: boolean;
  reward_protocol: string | null;
  atomic_reward_observed_at: number | null;
  has_receipt: boolean;
  continuity_phase: string | null;
  has_terminal_facts: boolean;
  continuity_terminal_at: number | null;
  progression_recovery_attempted_at: number | null;
  progression_recovery_attempts: number;
}

const db: { game_sessions: SweepRow[] } = { game_sessions: [] };
let clock = Date.parse('2026-08-04T12:00:00.000Z');
let expireResult: { data: unknown; error: unknown } = { data: 0, error: null };
const rpcCalls: Array<{ fn: string; params: Row }> = [];

const mockFrom = jest.fn((table: string) => {
  throw new Error(`the sweep must not touch ${table}`);
});

/**
 * `settlement_recovery_backoff` (068): exponential in the attempt count,
 * capped at 24 hours. Reimplemented here rather than approximated, because
 * every skip/eligibility assertion below is only meaningful if the window is
 * the real one.
 */
function backoffMs(attempts: number): number {
  if (attempts <= 1) return 0;
  return Math.min(2 ** Math.min(attempts - 1, 12), 1440) * MINUTE;
}

function backoffEligible(row: SweepRow): boolean {
  return (
    row.progression_recovery_attempted_at === null ||
    row.progression_recovery_attempted_at <=
      clock - backoffMs(row.progression_recovery_attempts)
  );
}

function clampLimit(raw: unknown, fallback: number, ceiling: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value)) {
    throw new Error(`scan limit must be an integer, received ${String(raw)}`);
  }
  return Math.min(Math.max(value, 1), ceiling);
}

/** The claim both scans perform: stamp the attempt and count it. */
function claim(rows: SweepRow[]): void {
  for (const row of rows) {
    row.progression_recovery_attempted_at = clock;
    row.progression_recovery_attempts += 1;
  }
}

function listPendingProgression(params: Row) {
  const limit = clampLimit(params.p_limit, 100, 500);
  const eligible = db.game_sessions
    .filter(
      (row) =>
        row.ended_at !== null &&
        row.end_reason === 'completed' &&
        !row.is_free_play &&
        !row.has_receipt &&
        row.reward_protocol === 'atomic_v1' &&
        row.atomic_reward_observed_at !== null &&
        backoffEligible(row)
    )
    // Selection is attempt-aware: healthy work outranks failing work.
    .sort(
      (left, right) =>
        left.progression_recovery_attempts - right.progression_recovery_attempts ||
        (left.atomic_reward_observed_at ?? 0) -
          (right.atomic_reward_observed_at ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, limit);
  claim(eligible);
  // Execution is chronological, so a whole per-player backlog can drain in
  // one pass in the order the settlement RPCs require.
  return [...eligible]
    .sort(
      (left, right) =>
        (left.atomic_reward_observed_at ?? 0) -
          (right.atomic_reward_observed_at ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .map((row) => ({
      player_id: row.player_id,
      session_id: row.id,
      reward_protocol: row.reward_protocol,
      recovery_attempts: row.progression_recovery_attempts,
    }));
}

function listStrandedTerminal(params: Row) {
  const limit = clampLimit(params.p_limit, 20, 200);
  const minAgeMs = 120_000;
  const eligible = db.game_sessions
    .filter(
      (row) =>
        row.ended_at === null &&
        row.end_reason === null &&
        row.continuity_phase === 'terminal' &&
        row.has_terminal_facts &&
        row.continuity_terminal_at !== null &&
        row.continuity_terminal_at <= clock - minAgeMs &&
        backoffEligible(row)
    )
    .sort(
      (left, right) =>
        left.progression_recovery_attempts - right.progression_recovery_attempts ||
        (left.continuity_terminal_at ?? 0) - (right.continuity_terminal_at ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, limit);
  claim(eligible);
  return [...eligible]
    .sort(
      (left, right) =>
        (left.continuity_terminal_at ?? 0) - (right.continuity_terminal_at ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .map((row) => ({
      player_id: row.player_id,
      user_id: row.user_id,
      session_id: row.id,
      recovery_attempts: row.progression_recovery_attempts,
    }));
}

async function fakeRpc(fn: string, params: Row = {}) {
  rpcCalls.push({ fn, params });
  if (fn === 'expire_stale_game_sessions') return expireResult;
  if (fn === 'get_career_settlement_capability') {
    return { data: { status: 'ready' }, error: null };
  }
  if (fn === 'list_pending_game_session_ends') return { data: [], error: null };
  if (fn === 'list_pending_game_progression_sessions') {
    return { data: listPendingProgression(params), error: null };
  }
  if (fn === 'list_stranded_terminal_runs') {
    return { data: listStrandedTerminal(params), error: null };
  }
  return { data: null, error: null };
}

import { NextRequest } from 'next/server';
import { GET } from './route';
import { RECOVERY_ATTENTION_THRESHOLD } from '@/lib/server/gameProgressionSettlement';
import {
  STALE_OPEN_MINUTES,
  STALE_PENDING_SETTLEMENT_MINUTES,
} from '@/lib/session/lifecycle';

function request(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/ops/session-sweep', { headers });
}

const authorized = () => request(`Bearer ${SECRET}`);

function seedCompleted(overrides: Partial<SweepRow> & { id: string }): SweepRow {
  const row: SweepRow = {
    player_id: 'player-1',
    user_id: 'auth-1',
    ended_at: new Date(clock - MINUTE).toISOString(),
    end_reason: 'completed',
    is_free_play: false,
    reward_protocol: 'atomic_v1',
    atomic_reward_observed_at: clock - MINUTE,
    has_receipt: false,
    continuity_phase: null,
    has_terminal_facts: false,
    continuity_terminal_at: null,
    progression_recovery_attempted_at: null,
    progression_recovery_attempts: 0,
    ...overrides,
  };
  db.game_sessions.push(row);
  return row;
}

function seedStranded(overrides: Partial<SweepRow> & { id: string }): SweepRow {
  const row: SweepRow = {
    player_id: 'player-1',
    user_id: 'auth-1',
    ended_at: null,
    end_reason: null,
    is_free_play: false,
    reward_protocol: null,
    atomic_reward_observed_at: null,
    has_receipt: false,
    continuity_phase: 'terminal',
    has_terminal_facts: true,
    continuity_terminal_at: clock - 10 * MINUTE,
    progression_recovery_attempted_at: null,
    progression_recovery_attempts: 0,
    ...overrides,
  };
  db.game_sessions.push(row);
  return row;
}

const rowById = (id: string) =>
  db.game_sessions.find((row) => row.id === id) as SweepRow;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  db.game_sessions = [];
  rpcCalls.length = 0;
  clock = Date.parse('2026-08-04T12:00:00.000Z');
  expireResult = { data: 0, error: null };
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  mockResumeOrRecoverRunImpact.mockImplementation(
    async (_client: unknown, _playerId: string, sessionId: string) => {
      const row = rowById(sessionId);
      if (row) row.has_receipt = true;
      return { status: 'found', impact: {} };
    }
  );
  // The default fold: the audited end branch settles the run and stamps it
  // for the progression scan. This is what a browser's `action: 'end'` does.
  mockSessionPost.mockImplementation(async (internal: NextRequest) => {
    // `clone()` so an assertion can still read the request the sweep built.
    const body = await internal.clone().json();
    const row = rowById(String(body.sessionId));
    if (row) {
      row.ended_at = new Date(clock).toISOString();
      row.end_reason = 'completed';
      row.reward_protocol = 'atomic_v1';
      row.atomic_reward_observed_at = clock;
      row.continuity_phase = 'terminal';
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the route module', () => {
  it('exports only the fields Next.js allows on a route', async () => {
    // A route file is an entry point, not a module: `next build` rejects any
    // other export with "is not a valid Route export field". That failure
    // costs a 15-minute production build to discover, so it is caught here.
    // Shared constants belong in `@/lib/server/*`.
    const moduleExports = await import('./route');
    expect(Object.keys(moduleExports).sort()).toEqual(['GET', 'maxDuration']);
  });
});

describe('authorization', () => {
  it('refuses an unauthenticated request', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it('refuses a wrong secret', async () => {
    const response = await GET(request('Bearer not-the-secret'));
    expect(response.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it('refuses when no secret is configured', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(authorized());
    expect(response.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe('stale-session expiry', () => {
  it('expires stale sessions and reports how many, so the count decays', async () => {
    expireResult = { data: 72, error: null };

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      expired: 72,
      skipped: false,
      strandedScanned: 0,
      progressionScanned: 0,
      progressionFailed: 0,
      settlementFailures: [],
      recoveryAttention: [],
      budgetExhausted: false,
    });
    expect(rpcCalls[0]).toEqual({
      fn: 'expire_stale_game_sessions',
      params: {
        p_open_max_minutes: STALE_OPEN_MINUTES,
        p_pending_max_minutes: STALE_PENDING_SETTLEMENT_MINUTES,
        p_batch_limit: 5000,
      },
    });
  });

  it('keeps the whole sweep table-free', async () => {
    expireResult = { data: 5, error: null };
    seedStranded({ id: 'session-1' });
    seedCompleted({ id: 'session-2' });

    const response = await GET(authorized());

    // `mockFrom` throws for every table; reaching 200 proves none was touched.
    expect(response.status).toBe(200);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('is idempotent — a second pass finds nothing left to close', async () => {
    expireResult = { data: 12, error: null };
    const first = await (await GET(authorized())).json();
    expireResult = { data: 0, error: null };
    const second = await (await GET(authorized())).json();

    expect(first.expired).toBe(12);
    expect(second.expired).toBe(0);
  });

  it('reports a no-op before migration 045 without failing the cron', async () => {
    expireResult = { data: null, error: { code: 'PGRST202' } };

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, expired: 0, skipped: true });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('fails loudly on a real error, and reports it (Rule 11)', async () => {
    expireResult = {
      data: null,
      error: { code: '40001', message: 'deadlock detected' },
    };

    const response = await GET(authorized());

    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The state nothing covered before CE-2
// ---------------------------------------------------------------------------

describe('a stranded terminal run settles with no client present', () => {
  it('drives the fold and settles the run end to end in one pass', async () => {
    seedStranded({ id: 'session-1' });

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      strandedScanned: 1,
      strandedSettled: 1,
      strandedFailed: 0,
      strandedRejected: 0,
      // The absorbed run reaches the progression scan in the SAME invocation,
      // so the player's value is secured now rather than ten minutes later.
      progressionScanned: 1,
      progressionSettled: 1,
    });
    expect(rowById('session-1').has_receipt).toBe(true);
    expect(mockResumeOrRecoverRunImpact).toHaveBeenCalledWith(
      expect.anything(),
      'player-1',
      'session-1'
    );
  });

  it('re-enters the audited settlement branch with a session-scoped identity', async () => {
    seedStranded({ id: 'session-1' });

    await GET(authorized());

    expect(mockSessionPost).toHaveBeenCalledTimes(1);
    const internal = mockSessionPost.mock.calls[0][0] as NextRequest;
    expect(new URL(internal.url).pathname).toBe('/api/game/session');
    expect(await internal.json()).toEqual({
      action: 'end',
      sessionId: 'session-1',
    });
    // The cron cannot mint a player token, so it authenticates as the cron and
    // names exactly one session; the route derives the owner from that row.
    expect(internal.headers.get('authorization')).toBe(`Bearer ${SECRET}`);
    expect(internal.headers.get('x-supasnake-absorb-stranded-run')).toBe('1');
    expect(internal.headers.get('x-supasnake-absorb-session')).toBe('session-1');
  });

  it('leaves a run younger than the grace window to its own client first', async () => {
    seedStranded({ id: 'session-1', continuity_terminal_at: clock - 30_000 });

    const body = await (await GET(authorized())).json();

    expect(body.strandedScanned).toBe(0);
    expect(mockSessionPost).not.toHaveBeenCalled();
  });

  it('counts a durable staging as progress, not as a failure', async () => {
    seedStranded({ id: 'session-1' });
    mockSessionPost.mockResolvedValue(
      new Response(JSON.stringify({ pendingSettlement: true }), { status: 202 })
    );

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ strandedStaged: 1, strandedFailed: 0 });
  });

  it('reports a refusal with its status and body instead of swallowing it', async () => {
    seedStranded({ id: 'session-1' });
    mockSessionPost.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Settlement is unavailable' }), {
        status: 503,
      })
    );

    const response = await GET(authorized());
    const body = await response.json();

    // A refusal races a live client legitimately, so it does not paint the
    // cron red on its own — but it is never invisible.
    expect(response.status).toBe(200);
    expect(body.strandedRejected).toBe(1);
    expect(body.settlementFailures).toEqual([
      {
        stage: 'stranded_terminal',
        playerId: 'player-1',
        sessionId: 'session-1',
        errorClass: 'http_503',
        message: expect.stringContaining('Settlement is unavailable'),
        attempts: 1,
      },
    ]);
  });

  it('fails loudly when the fold throws, naming the session and the error', async () => {
    seedStranded({ id: 'session-1' });
    mockSessionPost.mockRejectedValue(new TypeError('handler exploded'));

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.strandedFailed).toBe(1);
    expect(body.settlementFailures[0]).toMatchObject({
      sessionId: 'session-1',
      errorClass: 'TypeError',
      message: 'handler exploded',
    });
  });

  it('isolates one exploding fold from every other stranded run', async () => {
    seedStranded({ id: 'session-1', continuity_terminal_at: clock - 30 * MINUTE });
    seedStranded({
      id: 'session-2',
      player_id: 'player-2',
      user_id: 'auth-2',
      continuity_terminal_at: clock - 20 * MINUTE,
    });
    mockSessionPost.mockImplementationOnce(async () => {
      throw new Error('first one exploded');
    });

    const body = await (await GET(authorized())).json();

    expect(mockSessionPost).toHaveBeenCalledTimes(2);
    expect(body).toMatchObject({ strandedFailed: 1, strandedSettled: 1 });
  });
});

// ---------------------------------------------------------------------------
// Head-of-line blocking
// ---------------------------------------------------------------------------

describe('no head-of-line blocking', () => {
  it('offers every session of a player an attempt, not just the earliest', async () => {
    seedCompleted({ id: 'session-1', atomic_reward_observed_at: clock - 9 * MINUTE });
    seedCompleted({ id: 'session-2', atomic_reward_observed_at: clock - 8 * MINUTE });
    seedCompleted({ id: 'session-3', atomic_reward_observed_at: clock - 7 * MINUTE });

    const body = await (await GET(authorized())).json();

    // `DISTINCT ON (player_id)` would have returned exactly one of these.
    expect(body).toMatchObject({ progressionScanned: 3, progressionSettled: 3 });
    expect(
      mockResumeOrRecoverRunImpact.mock.calls.map((call) => call[2])
    ).toEqual(['session-1', 'session-2', 'session-3']);
  });

  it('lets a poisoned session fail without starving a later one', async () => {
    seedCompleted({ id: 'session-1', atomic_reward_observed_at: clock - 9 * MINUTE });
    seedCompleted({ id: 'session-2', atomic_reward_observed_at: clock - 8 * MINUTE });
    seedCompleted({
      id: 'session-3',
      player_id: 'player-2',
      atomic_reward_observed_at: clock - 7 * MINUTE,
    });
    mockResumeOrRecoverRunImpact.mockImplementationOnce(async () => {
      throw new Error('snapshot is corrupt');
    });

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      progressionScanned: 3,
      progressionSettled: 2,
      progressionFailed: 1,
    });
    // The same player's later run settled anyway, and so did the other
    // player's — a thrown settlement no longer aborts the pass.
    expect(rowById('session-2').has_receipt).toBe(true);
    expect(rowById('session-3').has_receipt).toBe(true);
    expect(body.settlementFailures).toEqual([
      {
        stage: 'progression',
        playerId: 'player-1',
        sessionId: 'session-1',
        errorClass: 'Error',
        message: 'snapshot is corrupt',
        attempts: 1,
      },
    ]);
    expect(body.progressionFailures).toEqual([
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        errorClass: 'Error',
        message: 'snapshot is corrupt',
      },
    ]);
  });

  it('treats ordered durable debt as deferred rather than a failed cron', async () => {
    seedCompleted({ id: 'session-1' });
    mockResumeOrRecoverRunImpact.mockResolvedValue({
      status: 'pending',
      error: new Error('earlier receipt is still settling'),
    });

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      progressionSettled: 0,
      progressionDeferred: 1,
      progressionFailed: 0,
    });
  });

  it('recognizes the ordering barrier reported as an unavailable stage', async () => {
    seedCompleted({ id: 'session-1' });
    mockResumeOrRecoverRunImpact.mockResolvedValue({
      status: 'unavailable',
      error: { message: 'GAME_PROGRESSION_EARLIER_SESSION_PENDING' },
    });

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ progressionDeferred: 1, progressionFailed: 0 });
  });
});

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

describe('per-session backoff', () => {
  it('skips a chronically failing row so it cannot burn the batch', async () => {
    seedCompleted({ id: 'fresh', atomic_reward_observed_at: clock - 5 * MINUTE });
    seedCompleted({
      id: 'poisoned',
      atomic_reward_observed_at: clock - 60 * MINUTE,
      progression_recovery_attempts: 9,
      progression_recovery_attempted_at: clock - MINUTE,
    });
    seedCompleted({
      id: 'recovering',
      atomic_reward_observed_at: clock - 30 * MINUTE,
      progression_recovery_attempts: 2,
      progression_recovery_attempted_at: clock - 30 * MINUTE,
    });

    const body = await (await GET(authorized())).json();

    // 2^9 = 512 minutes of spacing for `poisoned`; 2^2 = 4 for `recovering`.
    expect(
      mockResumeOrRecoverRunImpact.mock.calls.map((call) => call[2])
    ).toEqual(['recovering', 'fresh']);
    expect(body.progressionScanned).toBe(2);
    expect(rowById('poisoned').progression_recovery_attempts).toBe(9);
  });

  it('never gives up: the spacing expires and the row is tried again', async () => {
    seedCompleted({
      id: 'poisoned',
      progression_recovery_attempts: 9,
      progression_recovery_attempted_at: clock - MINUTE,
    });

    await GET(authorized());
    expect(mockResumeOrRecoverRunImpact).not.toHaveBeenCalled();

    clock += 9 * 60 * MINUTE;
    const body = await (await GET(authorized())).json();

    expect(mockResumeOrRecoverRunImpact).toHaveBeenCalledTimes(1);
    expect(body.progressionScanned).toBe(1);
  });

  it('names a row past the attention threshold instead of retrying it silently', async () => {
    seedCompleted({
      id: 'long-suffering',
      progression_recovery_attempts: RECOVERY_ATTENTION_THRESHOLD,
      progression_recovery_attempted_at: clock - 30 * 60 * MINUTE,
    });
    mockResumeOrRecoverRunImpact.mockResolvedValue({
      status: 'unavailable',
      error: { code: '23514', message: 'envelope check violated' },
    });

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.recoveryAttention).toEqual([
      {
        stage: 'progression',
        playerId: 'player-1',
        sessionId: 'long-suffering',
        attempts: RECOVERY_ATTENTION_THRESHOLD + 1,
      },
    ]);
    expect(body.settlementFailures[0]).toMatchObject({
      errorClass: '23514',
      message: 'envelope check violated',
    });
  });

  it('surfaces a stranded run that has been failing for a long time', async () => {
    seedStranded({
      id: 'session-1',
      progression_recovery_attempts: 20,
      progression_recovery_attempted_at: clock - 48 * 60 * MINUTE,
    });

    const body = await (await GET(authorized())).json();

    expect(body.recoveryAttention).toEqual([
      {
        stage: 'stranded_terminal',
        playerId: 'player-1',
        sessionId: 'session-1',
        attempts: 21,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Batch effectiveness inside the fixed cadence
// ---------------------------------------------------------------------------

describe('one pass does as much as it can', () => {
  it('loops past a single batch ceiling to drain a real backlog', async () => {
    for (let index = 0; index < 120; index += 1) {
      seedCompleted({
        id: `session-${String(index).padStart(3, '0')}`,
        player_id: `player-${index % 7}`,
        atomic_reward_observed_at: clock - (200 - index) * MINUTE,
      });
    }

    const body = await (await GET(authorized())).json();

    expect(body.progressionScanned).toBe(120);
    expect(body.progressionSettled).toBe(120);
    expect(body.budgetExhausted).toBe(false);
  });

  it('stops at the duration budget and still returns its report', async () => {
    for (let index = 0; index < 200; index += 1) {
      seedCompleted({
        id: `session-${String(index).padStart(3, '0')}`,
        atomic_reward_observed_at: clock - (300 - index) * MINUTE,
      });
    }
    mockResumeOrRecoverRunImpact.mockImplementation(
      async (_client: unknown, _playerId: string, sessionId: string) => {
        clock += 5_000;
        rowById(sessionId).has_receipt = true;
        return { status: 'found', impact: {} };
      }
    );

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.budgetExhausted).toBe(true);
    expect(body.progressionSettled).toBeGreaterThan(0);
    expect(body.progressionSettled).toBeLessThan(200);
    expect(body.elapsedMs).toBeGreaterThan(0);
    // Everything it did not reach is still claimable next pass: nothing was
    // dropped, and the unattempted rows kept their attempt count.
    const untouched = db.game_sessions.filter(
      (row) => row.progression_recovery_attempts === 0
    );
    expect(untouched.length).toBeGreaterThan(0);
  });

  it('does not start a stranded batch it has no time to finish', async () => {
    for (let index = 0; index < 60; index += 1) {
      seedStranded({
        id: `stranded-${String(index).padStart(3, '0')}`,
        player_id: `player-${index}`,
        continuity_terminal_at: clock - (60 + index) * MINUTE,
      });
    }
    mockSessionPost.mockImplementation(async (internal: NextRequest) => {
      clock += 20_000;
      const body = await internal.json();
      const row = rowById(String(body.sessionId));
      row.ended_at = new Date(clock).toISOString();
      row.end_reason = 'completed';
      row.reward_protocol = 'atomic_v1';
      row.atomic_reward_observed_at = clock;
      return new Response('{}', { status: 200 });
    });

    const body = await (await GET(authorized())).json();

    expect(body.budgetExhausted).toBe(true);
    expect(body.strandedSettled).toBeGreaterThan(0);
    expect(body.strandedSettled).toBeLessThan(60);
  });
});
