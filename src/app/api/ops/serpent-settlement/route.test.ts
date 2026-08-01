/**
 * @jest-environment node
 *
 * The settlement cron — GET /api/ops/serpent-settlement (Constitution §7.3).
 *
 * The acceptance criterion this file exists for: RUNNING THE CRON TWICE MUST
 * NOT DOUBLE-COUNT DEPTH. It is asserted end-to-end against a database double
 * that implements the migration's own rules — GREATEST on the weekly row, SUM
 * over persisted rows for the lifetime — so the test fails if either side of
 * the boundary starts incrementing.
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
import { describeSerpentWeek } from '@/shared/game/serpent';
import { SERPENT_RESETTLE_WINDOW_MS } from '@/lib/server/serpent';
import { GET } from './route';

const CRON_SECRET = 'cron-secret-for-tests';
const NOW = Date.UTC(2026, 6, 27, 0, 20);
// A week that has demonstrably submerged whenever this suite runs: the route
// settles against the real clock, so the fixture week must be in the past.
const WEEK = describeSerpentWeek(Date.UTC(2025, 0, 8));

/**
 * A miniature of the schema migration 046 defines. Only the rules that carry
 * the idempotency argument are modelled: GREATEST on the weekly row, SUM over
 * persisted weekly rows for the lifetime, and ON CONFLICT DO NOTHING on the
 * Chronicle.
 */
class FakeSerpentDb {
  weeks = [
    {
      id: 'week-a',
      week_start: WEEK.weekStart,
      starts_at: WEEK.startsAt,
      ends_at: WEEK.endsAt,
      seed: WEEK.seed,
      modifiers: WEEK.modifiers,
      settled_at: null as string | null,
    },
  ];

  sessions: Array<Record<string, unknown>> = [];
  players: Array<Record<string, unknown>> = [];
  clanMembers: Array<Record<string, unknown>> = [];

  weekPlayers = new Map<string, { depth: number; attempts: number }>();
  weekClans = new Map<string, number>();
  lifetime = new Map<string, number>();
  bestWeek = new Map<string, number>();
  chronicle = new Set<string>();

  apply(weekId: string, rows: Array<Record<string, unknown>>) {
    for (const row of rows) {
      const key = `${weekId}:${row.player_id}`;
      const existing = this.weekPlayers.get(key);
      const depth = Math.max(existing?.depth ?? 0, Number(row.depth ?? 0));
      this.weekPlayers.set(key, {
        depth,
        attempts: Math.max(existing?.attempts ?? 0, Number(row.attempts ?? 0)),
      });

      const playerId = String(row.player_id);
      const previousBest = this.bestWeek.get(playerId) ?? 0;
      if (depth > 0 && depth > previousBest) {
        this.chronicle.add(`${weekId}:${playerId}:personal_best_week`);
      }
      // lifetime = SUM over persisted weekly rows, clamped upward.
      const recomputed = [...this.weekPlayers.entries()]
        .filter(([entryKey]) => entryKey.endsWith(`:${playerId}`))
        .reduce((sum, [, value]) => sum + value.depth, 0);
      this.lifetime.set(playerId, Math.max(this.lifetime.get(playerId) ?? 0, recomputed));
      this.bestWeek.set(playerId, Math.max(previousBest, depth));
    }

    // Clan Depth = SUM of member Depths for the week.
    const clanTotals = new Map<string, number>();
    for (const row of rows) {
      if (!row.clan_id) continue;
      const key = `${weekId}:${row.clan_id}`;
      const depth = this.weekPlayers.get(`${weekId}:${row.player_id}`)?.depth ?? 0;
      clanTotals.set(key, (clanTotals.get(key) ?? 0) + depth);
    }
    for (const [key, depth] of clanTotals) {
      this.weekClans.set(key, Math.max(this.weekClans.get(key) ?? 0, depth));
    }

    const week = this.weeks.find((w) => w.id === weekId);
    if (week) week.settled_at = week.settled_at ?? new Date(NOW).toISOString();

    return {
      week_id: weekId,
      players: rows.length,
      clans: clanTotals.size,
      chronicle_entries: this.chronicle.size,
    };
  }
}

let db: FakeSerpentDb;

function wire(database: FakeSerpentDb) {
  mockFrom.mockImplementation((table: string) => {
    const rowsFor = () => {
      if (table === 'serpent_weeks') {
        // The real predicate: submerged, AND (never settled OR settled
        // recently enough that a late outbox replay could still belong to it).
        const now = Date.now();
        return database.weeks.filter(
          (w) =>
            new Date(w.ends_at).getTime() <= now &&
            (!w.settled_at ||
              new Date(w.ends_at).getTime() >= now - SERPENT_RESETTLE_WINDOW_MS)
        );
      }
      if (table === 'game_sessions') return database.sessions;
      if (table === 'players') return database.players;
      if (table === 'clan_members') return database.clanMembers;
      return [];
    };
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'lt', 'neq', 'or', 'order', 'limit']) {
      chain[op] = () => chain;
    }
    chain.select = () => {
      const promise = Promise.resolve({ data: rowsFor(), error: null });
      return Object.assign(chain, {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      });
    };
    chain.maybeSingle = () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null });
    chain.single = chain.maybeSingle;
    return chain;
  });

  mockRpc.mockImplementation((fn: string, params: Record<string, unknown>) => {
    if (fn === 'apply_serpent_week_settlement') {
      return Promise.resolve({
        data: database.apply(
          String(params.p_week_id),
          params.p_players as Array<Record<string, unknown>>
        ),
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

function request(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://supasnake.com/api/ops/serpent-settlement', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  mockCaptureException.mockClear();
  mockFrom.mockReset();
  mockRpc.mockReset();

  db = new FakeSerpentDb();
  db.players = [
    { id: 'p1', user_id: 'u1' },
    { id: 'p2', user_id: 'u2' },
  ];
  db.clanMembers = [
    { player_id: 'u1', clan_id: 'clan-1' },
    { player_id: 'u2', clan_id: 'clan-1' },
  ];
  db.sessions = [
    { id: 's1', player_id: 'p1', serpent_week_id: 'week-a', yield_dna: 300, ended_at: '2025-01-09T10:00:00Z', end_reason: 'completed', validated: true, is_free_play: false },
    { id: 's2', player_id: 'p1', serpent_week_id: 'week-a', yield_dna: 200, ended_at: '2025-01-09T11:00:00Z', end_reason: 'completed', validated: true, is_free_play: false },
    { id: 's3', player_id: 'p1', serpent_week_id: 'week-a', yield_dna: 100, ended_at: '2025-01-09T12:00:00Z', end_reason: 'completed', validated: true, is_free_play: false },
    { id: 's4', player_id: 'p1', serpent_week_id: 'week-a', yield_dna: 90, ended_at: '2025-01-09T13:00:00Z', end_reason: 'completed', validated: true, is_free_play: false },
    { id: 's5', player_id: 'p1', serpent_week_id: 'week-a', yield_dna: 9999, ended_at: '2025-01-09T14:00:00Z', end_reason: 'expired', validated: true, is_free_play: false },
    { id: 's6', player_id: 'p2', serpent_week_id: 'week-a', yield_dna: 150, ended_at: '2025-01-10T10:00:00Z', end_reason: 'completed', validated: true, is_free_play: false },
  ];
  wire(db);
});

describe('authentication', () => {
  it('refuses a request with no bearer', async () => {
    const response = await GET(request(null));
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret', async () => {
    const response = await GET(request('not-the-secret'));
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses everything when CRON_SECRET is unset — no open settlement path', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request());
    expect(response.status).toBe(401);
  });
});

describe('settlement', () => {
  it('settles Glory only after Energy Battles and exposes the idempotent payout summary', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);

    const calls = mockRpc.mock.calls.map(([name]) => name);
    expect(calls.indexOf('settle_clan_energy_battles')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('settle_clan_glory_rewards')).toBeGreaterThan(
      calls.indexOf('settle_clan_energy_battles')
    );
    expect(await response.json()).toMatchObject({
      energyBattles: {
        settled: 0,
        glory: { settled: 0, dnaAwarded: 0, cycleIndex: null },
      },
    });
  });

  it('settles the submerged week: best-3 per member, clan sum, lifetime', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);

    expect(db.weekPlayers.get('week-a:p1')?.depth).toBe(600); // 300+200+100
    expect(db.weekPlayers.get('week-a:p1')?.attempts).toBe(4); // the expired run is not one
    expect(db.weekPlayers.get('week-a:p2')?.depth).toBe(150);
    expect(db.weekClans.get('week-a:clan-1')).toBe(750);
    expect(db.lifetime.get('p1')).toBe(600);
    expect(db.bestWeek.get('p1')).toBe(600);
    expect(db.chronicle.has('week-a:p1:personal_best_week')).toBe(true);
  });

  it('IDEMPOTENT: running it twice produces exactly the same Depth', async () => {
    await GET(request());
    const afterFirst = {
      week: db.weekPlayers.get('week-a:p1')?.depth,
      clan: db.weekClans.get('week-a:clan-1'),
      lifetime: db.lifetime.get('p1'),
      best: db.bestWeek.get('p1'),
      chronicle: db.chronicle.size,
    };

    // The cron fires again — a retry, a double schedule, a manual re-run.
    const second = await GET(request());
    expect(second.status).toBe(200);

    expect(db.weekPlayers.get('week-a:p1')?.depth).toBe(afterFirst.week);
    expect(db.weekClans.get('week-a:clan-1')).toBe(afterFirst.clan);
    expect(db.lifetime.get('p1')).toBe(afterFirst.lifetime);
    expect(db.bestWeek.get('p1')).toBe(afterFirst.best);
    expect(db.chronicle.size).toBe(afterFirst.chronicle);
  });

  it('IDEMPOTENT even when the week is re-opened and settled again', async () => {
    await GET(request());
    const first = db.lifetime.get('p1');

    // The stronger claim: a partial failure left `settled_at` unset, so the
    // next run settles the SAME week a second time. Depth must not move.
    db.weeks[0].settled_at = null;
    const response = await GET(request());
    expect(response.status).toBe(200);

    expect(db.weekPlayers.get('week-a:p1')?.depth).toBe(600);
    expect(db.weekClans.get('week-a:clan-1')).toBe(750);
    expect(db.lifetime.get('p1')).toBe(first);
    expect(db.lifetime.get('p1')).toBe(600);
    // And no duplicate Chronicle entry.
    expect(db.chronicle.size).toBe(2);
  });

  it('converges after a partial failure — a third run changes nothing further', async () => {
    await GET(request());
    db.weeks[0].settled_at = null;
    await GET(request());
    db.weeks[0].settled_at = null;
    await GET(request());
    expect(db.lifetime.get('p1')).toBe(600);
    expect(db.lifetime.get('p2')).toBe(150);
    expect(db.weekClans.get('week-a:clan-1')).toBe(750);
  });

  it('re-settles a week inside the outbox window without moving a number', async () => {
    // A run replayed late by the offline outbox must still reach the Depth it
    // earned (Rule 6), so a recently-submerged week stays settleable. Doing so
    // is safe precisely because settlement is a recompute, not an increment.
    const recent = describeSerpentWeek(Date.now() - 9 * 86_400_000);
    db.weeks = [
      {
        id: 'week-a',
        week_start: recent.weekStart,
        starts_at: recent.startsAt,
        ends_at: recent.endsAt,
        seed: recent.seed,
        modifiers: recent.modifiers,
        settled_at: null,
      },
    ];

    await GET(request());
    expect(db.weeks[0].settled_at).not.toBeNull();
    expect(db.lifetime.get('p1')).toBe(600);

    // Settled, but still inside the window — so it settles AGAIN.
    await GET(request());
    await GET(request());
    expect(db.weekPlayers.get('week-a:p1')?.depth).toBe(600);
    expect(db.weekClans.get('week-a:clan-1')).toBe(750);
    expect(db.lifetime.get('p1')).toBe(600);
    expect(db.chronicle.size).toBe(2);
  });

  it('a non-settling run contributes nothing, at any depth of Yield', async () => {
    await GET(request());
    // s5 carried yield_dna 9999 and end_reason 'expired'.
    expect(db.weekPlayers.get('week-a:p1')?.depth).toBe(600);
    expect(db.lifetime.get('p1')).toBeLessThan(9999);
  });

  it('reports skipped rather than failing before migration 046', async () => {
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      for (const op of ['eq', 'in', 'is', 'not', 'gt', 'lte', 'or', 'order', 'limit']) {
        chain[op] = () => chain;
      }
      chain.select = () => {
        const promise = Promise.resolve({
          data: null,
          error: { code: '42P01', message: 'relation "serpent_weeks" does not exist' },
        });
        return Object.assign(chain, {
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
          finally: promise.finally.bind(promise),
        });
      };
      return chain;
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, skipped: true, settled: [] });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('answers 500 when a week failed, so a broken cron is visible', async () => {
    mockRpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { code: '40001', message: 'serialization failure' } })
    );
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
