/**
 * @jest-environment node
 *
 * The Signal settlement sweep — GET /api/ops/signal-settlement (§7.2).
 *
 * The acceptance criterion this file exists for: RUNNING THE CRON TWICE MUST
 * NOT PAY THE FLAT BONUS TWICE. It is asserted end-to-end against a database
 * double that implements migration 049's own rules — GREATEST on progress, a
 * COALESCE latch on the completion, a compare-and-set on the bonus — so the
 * test fails if either side of the boundary starts incrementing.
 *
 * The route is also the reason §7.2 needs no claim endpoint: rewards arrive
 * because the server swept, never because a player asked.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  }),
}));

import { describe, expect, it, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import {
  describeSignalDay,
  signalObjectiveId,
  SIGNAL_FIRST_COMPLETION_BONUS_DNA,
} from '@/shared/game/signal';
import { GET } from './route';

const CRON_SECRET = 'cron-secret-for-tests';
/** Today, because an attempt is settleable from the moment it opens. */
const TODAY = describeSignalDay(Date.now());
const ENDURE = TODAY.objectives.find((objective) => objective.kind === 'endure')!;

/** The stored attempt and the player row it pays, as migration 049 holds them. */
class FakeSignalDb {
  attempt = {
    id: 'run-a',
    day_id: 'day-a',
    player_id: 'p1',
    objective_id: signalObjectiveId('endure'),
    target: ENDURE.target,
    session_id: 's1',
    progress: 0,
    completed_at: null as string | null,
    settled_at: null as string | null,
    bonus_dna: 0,
    bonus_paid_at: null as string | null,
    signal_days: { day: TODAY.day },
  };

  session: Record<string, unknown> = {
    id: 's1',
    player_id: 'p1',
    // Comfortably past the ENDURE band, whatever today's band is.
    duration_seconds: ENDURE.target + 60,
    extracted: true,
    yield_dna: 900,
    genome: { picks: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }] },
    end_reason: 'completed',
    validated: true,
    is_free_play: false,
  };

  player = { dna: 0, signals_completed: 0 };

  /** `settle_signal_objective_run`, exactly as the migration writes it. */
  settle(params: Record<string, unknown>) {
    const progress = Math.max(0, Number(params.p_progress ?? 0));
    this.attempt.progress = Math.max(this.attempt.progress, progress);
    this.attempt.completed_at =
      this.attempt.completed_at ?? (params.p_completed === true ? 'then' : null);
    this.attempt.settled_at = 'then';

    let paid = 0;
    if (this.attempt.completed_at !== null) {
      const bonus = Math.min(
        Math.max(0, Number(params.p_bonus_dna ?? 0)),
        SIGNAL_FIRST_COMPLETION_BONUS_DNA
      );
      // The compare-and-set: it pays only while `bonus_paid_at` is still null.
      if (bonus > 0 && this.attempt.bonus_paid_at === null) {
        this.attempt.bonus_dna = bonus;
        this.attempt.bonus_paid_at = 'then';
        this.player.dna += bonus;
        paid = bonus;
      }
    }

    this.player.signals_completed = Math.max(
      this.player.signals_completed,
      this.attempt.completed_at !== null ? 1 : 0
    );

    return {
      run_id: this.attempt.id,
      completed: this.attempt.completed_at !== null,
      progress: this.attempt.progress,
      target: this.attempt.target,
      bonus_dna: paid,
      signals_completed: this.player.signals_completed,
      new_milestones: 0,
    };
  }
}

let db: FakeSignalDb;

function wire(database: FakeSignalDb, tableError: { code?: string; message?: string } | null = null) {
  mockFrom.mockImplementation((table: string) => {
    const rowsFor = () => {
      if (table === 'signal_objective_runs') return [database.attempt];
      if (table === 'game_sessions') return [database.session];
      if (table === 'players') return [{ signals_completed: database.player.signals_completed }];
      return [];
    };
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'lt', 'neq', 'or', 'order', 'limit']) {
      chain[op] = () => chain;
    }
    chain.select = () => {
      const promise = Promise.resolve({
        data: tableError ? null : rowsFor(),
        error: tableError,
      });
      return Object.assign(chain, {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      });
    };
    chain.maybeSingle = () =>
      Promise.resolve({ data: tableError ? null : rowsFor()[0] ?? null, error: tableError });
    chain.single = chain.maybeSingle;
    return chain;
  });

  mockRpc.mockImplementation((fn: string, params: Record<string, unknown>) =>
    fn === 'settle_signal_objective_run'
      ? Promise.resolve({ data: database.settle(params), error: null })
      : Promise.resolve({ data: null, error: null })
  );
}

function request(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://supasnake.com/api/ops/signal-settlement', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  mockCaptureException.mockClear();
  mockFrom.mockReset();
  mockRpc.mockReset();
  db = new FakeSignalDb();
  wire(db);
});

describe('authentication', () => {
  it('refuses a request with no bearer', async () => {
    expect((await GET(request(null))).status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret', async () => {
    expect((await GET(request('not-the-secret'))).status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses everything when CRON_SECRET is unset — no open settlement path', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(401);
  });
});

describe('settlement', () => {
  it('settles the completed attempt and pays the flat bonus once', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(false);
    expect(body.bonusDnaPaid).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);
    expect(db.attempt.completed_at).not.toBeNull();
    expect(db.player.dna).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);
    expect(db.player.signals_completed).toBe(1);
  });

  it('IDEMPOTENT: a second sweep pays exactly nothing and changes nothing', async () => {
    await GET(request());
    const after = {
      dna: db.player.dna,
      progress: db.attempt.progress,
      completed: db.attempt.completed_at,
      marks: db.player.signals_completed,
    };

    // The cron fires again — a retry, a double schedule, a manual re-run.
    const second = await GET(request());
    expect(second.status).toBe(200);
    expect((await second.json()).bonusDnaPaid).toBe(0);

    expect(db.player.dna).toBe(after.dna);
    expect(db.attempt.progress).toBe(after.progress);
    expect(db.attempt.completed_at).toBe(after.completed);
    expect(db.player.signals_completed).toBe(after.marks);
  });

  it('converges after a partial failure — a third sweep changes nothing further', async () => {
    await GET(request());
    db.attempt.settled_at = null;
    await GET(request());
    db.attempt.settled_at = null;
    await GET(request());
    expect(db.player.dna).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);
    expect(db.player.signals_completed).toBe(1);
  });

  it('progress only ever rises — a later, worse read cannot lower it (Rule 6)', async () => {
    await GET(request());
    const banked = db.attempt.progress;
    expect(banked).toBeGreaterThan(0);

    // The run is re-read as a much shorter one. GREATEST holds the line.
    db.session.duration_seconds = 1;
    await GET(request());
    expect(db.attempt.progress).toBe(banked);
    expect(db.attempt.completed_at).not.toBeNull();
  });

  it('reports skipped rather than failing before migration 049', async () => {
    wire(db, { code: '42P01', message: 'relation "signal_objective_runs" does not exist' });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, skipped: true, settled: [] });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('answers 500 when an attempt failed, so a broken cron is visible', async () => {
    mockRpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { code: '40001', message: 'serialization failure' } })
    );
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
    expect(db.player.dna).toBe(0);
  });
});
