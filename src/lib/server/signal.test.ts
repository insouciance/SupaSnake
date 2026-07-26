/**
 * The World Signal — server authority (WP-1.03; Constitution §7.2, §7.1, §8.6,
 * Rules 3, 5, 6 and 11).
 *
 * What this file pins:
 *
 *   - the day is derived from the UTC calendar and never from a request;
 *   - the flag-off path is CLOSED — no day, no id, no exemption;
 *   - AUTO-SETTLEMENT IS IDEMPOTENT: run the sweep twice against a faithful
 *     emulation of the RPC's GREATEST/latch/compare-and-set and the stored
 *     state is identical, with the flat bonus paid exactly once;
 *   - practice pays nothing, and an archive day never becomes a row;
 *   - every Supabase `error` is checked and reported to Sentry (Rule 11), and
 *     a pre-migration-049 database degrades quietly instead.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { describe, expect, it, beforeEach } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  autoSettleSignalAttempts,
  emptySignalObjectiveState,
  ensureCurrentSignalDay,
  isMissingSignalInfra,
  loadSettleableSignalAttempts,
  loadSignalAttempt,
  readSignalObjectiveState,
  settleSignalAttemptForSession,
  settleSignalObjectiveRun,
  SIGNAL_RESETTLE_WINDOW_MS,
  type SignalAttemptRow,
} from './signal';
import {
  describeSignalDay,
  signalDayKey,
  signalObjectiveId,
  SIGNAL_FIRST_COMPLETION_BONUS_DNA,
} from '@/shared/game/signal';

/** A Wednesday, mid-afternoon UTC. Nothing about the Signal depends on which. */
const NOW = Date.UTC(2026, 6, 22, 14, 30);
const TODAY = describeSignalDay(NOW);
const DAY_ID = 'day-a';

beforeEach(() => {
  mockCaptureException.mockClear();
});

// ---------------------------------------------------------------------------
// The double
// ---------------------------------------------------------------------------

interface Fixture {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}

function fakeClient(
  options: {
    tables?: Record<string, Fixture>;
    rpcs?: Record<string, Fixture>;
    rpcHandlers?: Record<string, (params: Record<string, unknown>) => Fixture>;
  } = {}
) {
  const rpcCalls: RpcCall[] = [];
  const selects: Array<{ table: string; columns: string }> = [];

  const client = {
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      const handler = options.rpcHandlers?.[fn];
      const fixture = handler ? handler(params) : options.rpcs?.[fn];
      return Promise.resolve({
        data: fixture?.data ?? null,
        error: fixture?.error ?? null,
      });
    },
    from: (table: string) => {
      const fixture = () => options.tables?.[table];
      const rows = () => {
        const data = fixture()?.data;
        return Array.isArray(data) ? data : data == null ? [] : [data];
      };
      const chain: Record<string, unknown> = {};
      const passthrough = () => chain;
      for (const op of [
        'eq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'lt', 'neq', 'or', 'order', 'limit',
      ]) {
        chain[op] = passthrough;
      }
      chain.select = (columns = '') => {
        selects.push({ table, columns: String(columns) });
        const promise = Promise.resolve({
          data: rows(),
          error: fixture()?.error ?? null,
        });
        return Object.assign(chain, {
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
          finally: promise.finally.bind(promise),
        });
      };
      chain.maybeSingle = () =>
        Promise.resolve({
          data: rows()[0] ?? null,
          error: fixture()?.error ?? null,
        });
      chain.single = chain.maybeSingle;
      return chain;
    },
  };

  return { client: client as unknown as SupabaseClient, rpcCalls, selects };
}

// ---------------------------------------------------------------------------
// A faithful emulation of `settle_signal_objective_run` (migration 049 §8)
// ---------------------------------------------------------------------------

interface StoredAttempt {
  id: string;
  day_id: string;
  player_id: string;
  objective_id: string;
  target: number;
  session_id: string | null;
  progress: number;
  completed_at: string | null;
  settled_at: string | null;
  bonus_dna: number;
  bonus_paid_at: string | null;
  signal_days: { day: string };
}

function storedAttempt(overrides: Partial<StoredAttempt> = {}): StoredAttempt {
  return {
    id: 'run-a',
    day_id: DAY_ID,
    player_id: 'p1',
    objective_id: signalObjectiveId('endure'),
    target: 120,
    session_id: 's1',
    progress: 0,
    completed_at: null,
    settled_at: null,
    bonus_dna: 0,
    bonus_paid_at: null,
    signal_days: { day: TODAY.day },
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    player_id: 'p1',
    duration_seconds: 200,
    extracted: true,
    yield_dna: 800,
    genome: { picks: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }] },
    end_reason: 'completed',
    validated: true,
    is_free_play: false,
    ...overrides,
  };
}

/**
 * The RPC, emulated exactly as migration 049 §8 writes it: GREATEST on
 * progress, COALESCE latch on the completion, compare-and-set on the flat
 * bonus, and `signals_completed` as a recompute clamped upward. Never a `+=`.
 *
 * The emulation is the point of the idempotency test — a stub that just echoed
 * its inputs would prove nothing about running the sweep twice.
 */
function settlementEmulator(attempt: StoredAttempt, player: { dna: number; signals_completed: number }) {
  return (params: Record<string, unknown>): Fixture => {
    if (params.p_run_id !== attempt.id || params.p_player_id !== attempt.player_id) {
      return { error: { code: 'P0001', message: 'unknown attempt for this player' } };
    }
    const progress = Math.max(0, Number(params.p_progress ?? 0));
    attempt.progress = Math.max(attempt.progress, progress);
    attempt.completed_at =
      attempt.completed_at ?? (params.p_completed === true ? '2026-07-22T14:30:00.000Z' : null);
    attempt.settled_at = '2026-07-22T14:30:00.000Z';

    let paid = 0;
    if (attempt.completed_at !== null) {
      const bonus = Math.min(Math.max(0, Number(params.p_bonus_dna ?? 0)), 150);
      if (bonus > 0 && attempt.bonus_paid_at === null) {
        attempt.bonus_dna = bonus;
        attempt.bonus_paid_at = '2026-07-22T14:30:00.000Z';
        player.dna += bonus;
        paid = bonus;
      }
    }

    const completedCount = attempt.completed_at !== null ? 1 : 0;
    player.signals_completed = Math.max(player.signals_completed, completedCount);

    return {
      data: {
        run_id: attempt.id,
        completed: attempt.completed_at !== null,
        progress: attempt.progress,
        target: attempt.target,
        bonus_dna: paid,
        bonus_already_paid: attempt.bonus_paid_at !== null && paid === 0,
        signals_completed: player.signals_completed,
        new_milestones: 0,
      },
    };
  };
}

function settlementStack(
  attempt: StoredAttempt,
  session: Record<string, unknown> = sessionRow()
) {
  const player = { dna: 0, signals_completed: 0 };
  const stack = fakeClient({
    tables: {
      signal_objective_runs: { data: [attempt] },
      game_sessions: { data: [session] },
      players: { data: [{ signals_completed: player.signals_completed }] },
    },
    rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
    rpcHandlers: { settle_signal_objective_run: settlementEmulator(attempt, player) },
  });
  return { ...stack, attempt, player };
}

// ---------------------------------------------------------------------------
// The day is derived, never asserted
// ---------------------------------------------------------------------------

describe('the day is server-derived from the UTC calendar', () => {
  it('sends exactly what describeSignalDay derived, and nothing else', async () => {
    const { client, rpcCalls } = fakeClient({
      rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
    });

    const day = await ensureCurrentSignalDay(client, NOW, { enabled: true });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('ensure_signal_day');
    expect(rpcCalls[0].params).toEqual({
      p_day: TODAY.day,
      p_starts_at: TODAY.startsAt,
      p_ends_at: TODAY.endsAt,
      p_seed: TODAY.seed,
      p_modifier: TODAY.condition.id,
      p_strain_tilt: TODAY.condition.strainTilt,
      // The day's clauses ride their own column (migration 056), unlike the
      // Serpent's, which share `modifiers`. Asserted from the derivation so a
      // clause that stopped being persisted still fails this test.
      p_clauses: TODAY.clauses,
      p_objectives: TODAY.objectives,
    });
    expect(day).toEqual({
      id: DAY_ID,
      day: TODAY.day,
      startsAt: TODAY.startsAt,
      endsAt: TODAY.endsAt,
      seed: TODAY.seed,
      condition: TODAY.condition,
      clauses: TODAY.clauses,
      objectives: TODAY.objectives,
    });
  });

  it('takes only the id from the row — condition and objectives come from the calendar', async () => {
    // A row that disagrees with the calendar on every derived field. The RPC
    // would already have raised; if it somehow did not, the module still
    // renders the derivation, so two readers can never see different days.
    const { client } = fakeClient({
      rpcs: {
        ensure_signal_day: {
          data: [
            {
              id: DAY_ID,
              day: '1999-12-31',
              seed: 'Ddeadbeef',
              modifier: 'blackout',
              objectives: [],
            },
          ],
        },
      },
    });

    const day = await ensureCurrentSignalDay(client, NOW, { enabled: true });
    expect(day?.id).toBe(DAY_ID);
    expect(day?.day).toBe(TODAY.day);
    expect(day?.seed).toBe(TODAY.seed);
    expect(day?.objectives).toEqual(TODAY.objectives);
  });

  it('resolves the same day for every wall clock inside it', async () => {
    // Auckland (+12) and Los Angeles (-7) reading the same UTC day.
    const instants = [
      Date.UTC(2026, 6, 22, 0, 0, 0),
      Date.UTC(2026, 6, 22, 11, 59, 59),
      Date.UTC(2026, 6, 22, 23, 59, 59, 999),
      new Date('2026-07-22T23:30:00.000Z'),
    ];

    const payloads: unknown[] = [];
    for (const at of instants) {
      const { client, rpcCalls } = fakeClient({
        rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
      });
      await ensureCurrentSignalDay(client, at, { enabled: true });
      payloads.push(rpcCalls[0].params);
    }

    for (const payload of payloads) expect(payload).toEqual(payloads[0]);
    expect((payloads[0] as Record<string, unknown>).p_day).toBe(signalDayKey(NOW));
  });

  it('rolls at 00:00 UTC and nowhere else', async () => {
    const before = fakeClient({ rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } } });
    const after = fakeClient({ rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } } });

    await ensureCurrentSignalDay(before.client, Date.UTC(2026, 6, 22, 23, 59, 59, 999), {
      enabled: true,
    });
    await ensureCurrentSignalDay(after.client, Date.UTC(2026, 6, 23, 0, 0, 0), {
      enabled: true,
    });

    expect(before.rpcCalls[0].params.p_day).toBe('2026-07-22');
    expect(after.rpcCalls[0].params.p_day).toBe('2026-07-23');
    expect(before.rpcCalls[0].params.p_seed).not.toBe(after.rpcCalls[0].params.p_seed);
  });

  it('never resolves an archive or a future day (Rule 5, §7.2)', async () => {
    // A year of clocks; the resolved day is always the one containing `now`.
    for (let i = 0; i < 365; i += 7) {
      const at = NOW + i * 86_400_000;
      const { client, rpcCalls } = fakeClient({
        rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
      });
      await ensureCurrentSignalDay(client, at, { enabled: true });
      expect(rpcCalls[0].params.p_day).toBe(signalDayKey(at));
    }
  });

  it('is CLOSED when the flag is off — no RPC, no id, no exemption', async () => {
    const { client, rpcCalls } = fakeClient({
      rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
    });
    expect(await ensureCurrentSignalDay(client, NOW, { enabled: false })).toBeNull();
    expect(rpcCalls).toHaveLength(0);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// A player's objective state
// ---------------------------------------------------------------------------

describe('reading a player objective state', () => {
  it('returns the empty, non-live state when the flag is off', async () => {
    const { client, rpcCalls } = fakeClient();
    const state = await readSignalObjectiveState(client, 'p1', NOW, { enabled: false });
    expect(state).toEqual(emptySignalObjectiveState());
    expect(state.live).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it('reports live with no attempt before the player opens the Signal', async () => {
    const { client } = fakeClient({
      tables: {
        signal_objective_runs: { data: [] },
        players: { data: [{ signals_completed: 7 }] },
      },
      rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
    });

    const state = await readSignalObjectiveState(client, 'p1', NOW, { enabled: true });
    expect(state.live).toBe(true);
    expect(state.day?.id).toBe(DAY_ID);
    expect(state.attempt).toBeNull();
    expect(state.objective).toBeNull();
    expect(state.completed).toBe(false);
    expect(state.signalsCompleted).toBe(7);
    expect(state.milestonesReached).toEqual([]);
  });

  it('resolves the chosen objective and the cumulative, non-consecutive marks', async () => {
    const { client } = fakeClient({
      tables: {
        signal_objective_runs: {
          data: [storedAttempt({ progress: 95, completed_at: '2026-07-22T15:00:00.000Z' })],
        },
        players: { data: [{ signals_completed: 101 }] },
      },
      rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
    });

    const state = await readSignalObjectiveState(client, 'p1', NOW, { enabled: true });
    expect(state.objective?.kind).toBe('endure');
    expect(state.progress).toBe(95);
    expect(state.target).toBe(120);
    expect(state.completed).toBe(true);
    // 101 completions, whenever they happened. A count has no memory of gaps.
    expect(state.milestonesReached).toEqual([30, 100]);
  });

  it('never writes — reading a state settles nothing (§7.2, no claim cascades)', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: {
        signal_objective_runs: { data: [storedAttempt()] },
        players: { data: [{ signals_completed: 0 }] },
      },
      rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
    });

    await readSignalObjectiveState(client, 'p1', NOW, { enabled: true });
    expect(rpcCalls.map((call) => call.fn)).toEqual(['ensure_signal_day']);
  });
});

// ---------------------------------------------------------------------------
// Auto-settlement, and the idempotency criterion
// ---------------------------------------------------------------------------

describe('auto-settlement is idempotent', () => {
  it('running the sweep twice leaves identical stored state and pays once', async () => {
    const attempt = storedAttempt();
    const { client, attempt: stored, player } = settlementStack(attempt);

    const first = await autoSettleSignalAttempts(client, NOW);
    const afterFirst = JSON.parse(JSON.stringify(stored));
    const dnaAfterFirst = player.dna;

    const second = await autoSettleSignalAttempts(client, NOW);
    const afterSecond = JSON.parse(JSON.stringify(stored));

    // The run survived 200s against a 120s ENDURE target.
    expect(first.settled).toHaveLength(1);
    expect(first.settled[0].completed).toBe(true);
    expect(first.settled[0].progress).toBe(200);
    expect(first.bonusDnaPaid).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);

    // The second sweep changes nothing and pays nothing.
    expect(second.settled).toHaveLength(1);
    expect(second.settled[0].completed).toBe(true);
    expect(second.settled[0].progress).toBe(200);
    expect(second.bonusDnaPaid).toBe(0);

    expect(afterSecond).toEqual(afterFirst);
    expect(player.dna).toBe(dnaAfterFirst);
    expect(player.dna).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);
    expect(player.signals_completed).toBe(1);
  });

  it('ten sweeps are the same as one', async () => {
    const { client, attempt, player } = settlementStack(storedAttempt());

    await autoSettleSignalAttempts(client, NOW);
    const once = JSON.parse(JSON.stringify(attempt));
    for (let i = 0; i < 9; i += 1) await autoSettleSignalAttempts(client, NOW);

    expect(JSON.parse(JSON.stringify(attempt))).toEqual(once);
    expect(player.dna).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);
  });

  it('never asks the RPC to increment — the second payload asks for a bonus of 0', async () => {
    const { client, rpcCalls } = settlementStack(storedAttempt());

    await autoSettleSignalAttempts(client, NOW);
    await autoSettleSignalAttempts(client, NOW);

    const settles = rpcCalls.filter((call) => call.fn === 'settle_signal_objective_run');
    expect(settles).toHaveLength(2);
    expect(settles[0].params.p_bonus_dna).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);
    expect(settles[0].params.p_progress).toBe(200);
    // Absolute, not a delta: the same progress, and no bonus the second time.
    expect(settles[1].params.p_progress).toBe(200);
    expect(settles[1].params.p_bonus_dna).toBe(0);
    expect(settles[1].params.p_completed).toBe(true);
  });

  it('a re-settle can raise a progress and can never lower one (Rule 6)', async () => {
    // A late replay reporting LESS than what already settled.
    const attempt = storedAttempt({ progress: 400, completed_at: '2026-07-22T10:00:00.000Z' });
    const { client } = settlementStack(attempt, sessionRow({ duration_seconds: 10 }));

    const result = await autoSettleSignalAttempts(client, NOW);
    expect(attempt.progress).toBe(400);
    expect(result.settled[0].progress).toBe(400);
    expect(attempt.completed_at).toBe('2026-07-22T10:00:00.000Z');
  });
});

describe('what settlement refuses to pay', () => {
  it('pays nothing for a practice run (§7.2, Rule 5)', async () => {
    const attempt = storedAttempt();
    const { client, player } = settlementStack(attempt, sessionRow({ is_free_play: true }));

    const result = await autoSettleSignalAttempts(client, NOW);
    expect(result.bonusDnaPaid).toBe(0);
    expect(attempt.completed_at).toBeNull();
    expect(player.dna).toBe(0);
  });

  it('pays nothing for a run that did not settle', async () => {
    const attempt = storedAttempt();
    const { client, player } = settlementStack(attempt, sessionRow({ end_reason: 'abandoned' }));

    await autoSettleSignalAttempts(client, NOW);
    expect(attempt.completed_at).toBeNull();
    expect(player.dna).toBe(0);
  });

  it('pays nothing for a flagged run', async () => {
    const attempt = storedAttempt();
    const { client, player } = settlementStack(attempt, sessionRow({ validated: false }));

    await autoSettleSignalAttempts(client, NOW);
    expect(attempt.completed_at).toBeNull();
    expect(player.dna).toBe(0);
  });

  it('measures an EXTRACT objective from the banked decision, not the run', async () => {
    const attempt = storedAttempt({ objective_id: signalObjectiveId('extract'), target: 300 });
    const { client } = settlementStack(attempt, sessionRow({ extracted: false, yield_dna: 900 }));

    await autoSettleSignalAttempts(client, NOW);
    expect(attempt.progress).toBe(0);
    expect(attempt.completed_at).toBeNull();
  });

  it('skips an attempt whose run has not finished', async () => {
    const attempt = storedAttempt({ session_id: null });
    const { client, rpcCalls } = settlementStack(attempt);

    const result = await autoSettleSignalAttempts(client, NOW);
    expect(result.settled[0].skipped).toBe(true);
    expect(result.failed).toBe(false);
    expect(rpcCalls.some((call) => call.fn === 'settle_signal_objective_run')).toBe(false);
  });

  it('never reads the lean-adjusted DNA or the Score (Rules 2 and 3)', async () => {
    const { client, selects } = settlementStack(storedAttempt());
    await autoSettleSignalAttempts(client, NOW);
    await readSignalObjectiveState(client, 'p1', NOW, { enabled: true });

    for (const select of selects) {
      expect(select.columns).not.toMatch(/\bdna_earned\b/);
      expect(select.columns).not.toMatch(/\bscore\b/);
      expect(select.columns).not.toMatch(/entitlement|premium|subscription|stripe/i);
    }
  });
});

describe('the settleable window', () => {
  it('keeps re-settling for eight days past the outbox horizon', () => {
    expect(SIGNAL_RESETTLE_WINDOW_MS).toBe(8 * 24 * 60 * 60 * 1000);
  });

  it('drops an attempt whose day key cannot be re-derived', async () => {
    const { client } = fakeClient({
      tables: {
        signal_objective_runs: {
          data: [storedAttempt({ signal_days: { day: '2026-02-30' } })],
        },
      },
    });
    const { attempts, skipped } = await loadSettleableSignalAttempts(client, NOW);
    expect(skipped).toBe(false);
    expect(attempts).toHaveLength(0);
  });
});

describe('settling the attempt one finished run owns', () => {
  it('settles it, and returns null when the run owns none', async () => {
    const attempt = storedAttempt();
    const { client } = settlementStack(attempt);
    const settled = await settleSignalAttemptForSession(client, 's1', 'p1');
    expect(settled?.completed).toBe(true);

    const { client: empty } = fakeClient({ tables: { signal_objective_runs: { data: [] } } });
    expect(await settleSignalAttemptForSession(empty, 's1', 'p1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule 11 — every error is checked, and reported
// ---------------------------------------------------------------------------

describe('errors are checked and reported to Sentry (Rule 11)', () => {
  const genuine = { code: 'XX000', message: 'connection reset' };

  it('reports a failed day resolution and returns the closed answer', async () => {
    const { client } = fakeClient({ rpcs: { ensure_signal_day: { error: genuine } } });
    expect(await ensureCurrentSignalDay(client, NOW, { enabled: true })).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reports a failed attempt read', async () => {
    const { client } = fakeClient({
      tables: { signal_objective_runs: { error: genuine } },
    });
    expect(await loadSignalAttempt(client, DAY_ID, 'p1')).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reports a failed cumulative-count read', async () => {
    const { client } = fakeClient({
      tables: {
        signal_objective_runs: { data: [] },
        players: { error: genuine },
      },
      rpcs: { ensure_signal_day: { data: [{ id: DAY_ID }] } },
    });
    const state = await readSignalObjectiveState(client, 'p1', NOW, { enabled: true });
    expect(state.signalsCompleted).toBe(0);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reports a failed run-facts read and marks the attempt for retry', async () => {
    const { client } = fakeClient({
      tables: {
        signal_objective_runs: { data: [storedAttempt()] },
        game_sessions: { error: genuine },
      },
    });
    const { attempts } = await loadSettleableSignalAttempts(client, NOW);
    const result = await settleSignalObjectiveRun(client, attempts[0]);
    expect(result.failed).toBe(true);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reports a failed settlement and marks the attempt for retry', async () => {
    const { client } = fakeClient({
      tables: {
        signal_objective_runs: { data: [storedAttempt()] },
        game_sessions: { data: [sessionRow()] },
      },
      rpcs: { settle_signal_objective_run: { error: genuine } },
    });
    const result = await autoSettleSignalAttempts(client, NOW);
    expect(result.failed).toBe(true);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reports an attempt whose objective the day does not derive', async () => {
    const attempt: SignalAttemptRow = {
      id: 'run-a',
      dayId: DAY_ID,
      dayKey: TODAY.day,
      playerId: 'p1',
      objectiveId: 'signal_not_a_kind',
      target: 120,
      sessionId: 's1',
      progress: 0,
      completedAt: null,
      settledAt: null,
      bonusPaidAt: null,
    };
    const { client } = fakeClient();
    const result = await settleSignalObjectiveRun(client, attempt);
    expect(result.failed).toBe(true);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('degrades quietly before migration 049 — and never reports it as a fault', async () => {
    for (const error of [
      { code: '42P01', message: 'relation "signal_days" does not exist' },
      { code: 'PGRST202', message: 'could not find function ensure_signal_day' },
      { message: 'column players.signals_completed does not exist' },
    ]) {
      expect(isMissingSignalInfra(error)).toBe(true);
    }
    expect(isMissingSignalInfra(genuine)).toBe(false);
    expect(isMissingSignalInfra(null)).toBe(false);

    const { client } = fakeClient({
      rpcs: { ensure_signal_day: { error: { code: '42P01', message: 'no such table' } } },
    });
    expect(await ensureCurrentSignalDay(client, NOW, { enabled: true })).toBeNull();

    const { client: sweep } = fakeClient({
      tables: {
        signal_objective_runs: { error: { code: '42P01', message: 'no such table' } },
      },
    });
    const result = await autoSettleSignalAttempts(sweep, NOW);
    expect(result).toEqual({ settled: [], skipped: true, failed: false, bonusDnaPaid: 0 });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The source itself
// ---------------------------------------------------------------------------

describe('the module', () => {
  const source = fs.readFileSync(path.join(__dirname, 'signal.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('carries no incomplete-work markers', () => {
    // The marker literals are assembled here rather than written out, so this
    // assertion does not itself trip `verify:constitution`'s todo-fixme gate -
    // the gate's own scanner does the same for the same reason.
    const markers = new RegExp(`\\b${'TO' + 'DO'}\\b|\\b${'FIX' + 'ME'}\\b`);
    expect(source).not.toMatch(markers);
  });

  it('increments nothing that is stored — settlement is a recompute', () => {
    // The one `+=` in the file totals what THIS sweep paid, for the caller's
    // log. It is a local, it is never written back, and every number that is
    // stored lands through GREATEST or a compare-and-set inside the RPC.
    const increments = [...code.matchAll(/(\w+)\s*\+=/g)].map((match) => match[1]);
    expect(increments).toEqual(['bonusDnaPaid']);
    expect(code).not.toMatch(/\bdna_earned\b/);
  });

  it('has no parameter through which a client could name a day', () => {
    // The only inputs to day resolution are a client, a clock and a flag.
    expect(code).toMatch(
      /ensureCurrentSignalDay\(\s*supabase: SupabaseClient,\s*now: Date \| number = Date\.now\(\),\s*options: \{ enabled\?: boolean \} = \{\}\s*\)/
    );
    expect(code).toMatch(/describeSignalDay\(now\)/);
  });
});
