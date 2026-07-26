/**
 * The Signal's charge exemption, and the session route that grants it
 * (Constitution §7.2, §8.6, Rule 11; WP-1.03).
 *
 * §8.6: "the rituals are always full-fat" — the day's Signal objective run
 * consumes no charge. The whole risk in that sentence is the word "the": ONE
 * run a day is exempt, and only because the SERVER said so. What this file
 * pins is the closed direction:
 *
 *   - a claim the server granted -> `exempt`, and the ledger RPC is never
 *     called;
 *   - a client that asks for the Signal with the flag off, before migration
 *     049, with an objective the day did not derive, or on its second run of
 *     the day -> `charged`, the ordinary path;
 *   - and the session route wires exactly that, and nothing looser.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { describe, expect, it, beforeEach } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { claimSignalObjectiveRun } from './signal';
import { consumeRunCharge } from './energyEnvelope';
import { NO_EXEMPTION, isChargeExempt } from '@/shared/game/energyEnvelope';
import { describeSignalDay } from '@/shared/game/signal';

const NOW = Date.UTC(2026, 6, 22, 14, 30);
const TODAY = describeSignalDay(NOW);
const CHOSEN = TODAY.objectives[1];

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

function fakeClient(
  options: {
    tables?: Record<string, Fixture>;
    rpcHandlers?: Record<string, (params: Record<string, unknown>) => Fixture>;
  } = {}
) {
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];

  const client = {
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      const fixture = options.rpcHandlers?.[fn]?.(params);
      return Promise.resolve({
        data: fixture?.data ?? null,
        error: fixture?.error ?? null,
      });
    },
    from: (table: string) => {
      const rows = () => {
        const data = options.tables?.[table]?.data;
        return Array.isArray(data) ? data : data == null ? [] : [data];
      };
      const chain: Record<string, unknown> = {};
      const passthrough = () => chain;
      for (const op of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'lt', 'neq', 'or', 'order', 'limit']) {
        chain[op] = passthrough;
      }
      chain.select = () => {
        const promise = Promise.resolve({
          data: rows(),
          error: options.tables?.[table]?.error ?? null,
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
          error: options.tables?.[table]?.error ?? null,
        });
      chain.single = chain.maybeSingle;
      return chain;
    },
  };

  return { client: client as unknown as SupabaseClient, rpcCalls };
}

/** A database with migration 049 applied and a full charge day. */
function liveClient(claim: Record<string, unknown> = {}) {
  return fakeClient({
    tables: { players: { data: [{ charges_day: '2026-07-22', charges_used: 0 }] } },
    rpcHandlers: {
      ensure_signal_day: () => ({ data: [{ id: 'day-a' }] }),
      begin_signal_objective_run: (params) => ({
        data: [
          {
            id: 'run-a',
            day_id: params.p_day_id,
            objective_id: params.p_objective_id,
            target: params.p_target,
            session_id: params.p_session_id,
            progress: 0,
            completed_at: null,
            owns_attempt: true,
            ...claim,
          },
        ],
      }),
      consume_run_charge: () => ({
        data: [{ charged: true, charges_day: '2026-07-22', charges_used: 1 }],
      }),
    },
  });
}

/**
 * Exactly what `src/app/api/game/session/route.ts` does with a claim. Kept in
 * one place so a test cannot accidentally exercise a kinder composition than
 * the route's.
 */
async function startRun(
  client: SupabaseClient,
  claim: Awaited<ReturnType<typeof claimSignalObjectiveRun>> | null
) {
  return consumeRunCharge(
    client,
    'p1',
    { ...NO_EXEMPTION, signalObjectiveRunId: claim?.exemptRunId ?? null },
    NOW
  );
}

// ---------------------------------------------------------------------------
// §8.6 — the day's Signal objective run consumes no charge
// ---------------------------------------------------------------------------

describe("the day's Signal objective run consumes NO charge (§8.6)", () => {
  it('never calls the ledger RPC when the server granted the attempt', async () => {
    const { client, rpcCalls } = liveClient();

    const claim = await claimSignalObjectiveRun(client, 'p1', 's1', CHOSEN.id, NOW, {
      enabled: true,
    });
    expect(claim.live).toBe(true);
    expect(claim.ownsAttempt).toBe(true);
    expect(claim.exemptRunId).toBe('run-a');

    const charge = await startRun(client, claim);
    expect(charge.state).toBe('exempt');
    expect(rpcCalls.map((call) => call.fn)).not.toContain('consume_run_charge');
  });

  it('is exempt even on a day whose allotment is already empty', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: { players: { data: [{ charges_day: '2026-07-22', charges_used: 6 }] } },
    });
    const charge = await consumeRunCharge(
      client,
      'p1',
      { ...NO_EXEMPTION, signalObjectiveRunId: 'run-a' },
      NOW
    );
    expect(charge.state).toBe('exempt');
    expect(charge.status.remaining).toBe(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it('sends the day and the target the CALENDAR derived, not the request', async () => {
    const { client, rpcCalls } = liveClient();
    await claimSignalObjectiveRun(client, 'p1', 's1', CHOSEN.id, NOW, { enabled: true });

    expect(rpcCalls.find((call) => call.fn === 'ensure_signal_day')?.params).toMatchObject({
      p_day: TODAY.day,
      p_seed: TODAY.seed,
      p_modifier: TODAY.condition.id,
    });
    expect(rpcCalls.find((call) => call.fn === 'begin_signal_objective_run')?.params).toEqual({
      p_player_id: 'p1',
      p_day_id: 'day-a',
      p_objective_id: CHOSEN.id,
      p_target: CHOSEN.target,
      p_session_id: 's1',
    });
  });
});

// ---------------------------------------------------------------------------
// A claim the server did not grant buys an ORDINARY run
// ---------------------------------------------------------------------------

describe('an exemption the server did not grant is an ordinary CHARGED run', () => {
  it('a run that names no server-resolved id at all is charged', async () => {
    const { client, rpcCalls } = liveClient();
    // The shape of a client that sent `mode: 'signal'` and nothing came of it.
    const charge = await startRun(client, null);
    expect(charge.state).toBe('charged');
    expect(rpcCalls.map((call) => call.fn)).toContain('consume_run_charge');
  });

  it('the flag being off resolves no day, so the run is charged', async () => {
    const { client, rpcCalls } = liveClient();
    const claim = await claimSignalObjectiveRun(client, 'p1', 's1', CHOSEN.id, NOW, {
      enabled: false,
    });
    expect(claim.live).toBe(false);
    expect(claim.exemptRunId).toBeNull();

    const charge = await startRun(client, claim);
    expect(charge.state).toBe('charged');
    // Off means off: the database was never asked to open an attempt.
    expect(rpcCalls.map((call) => call.fn)).not.toContain('begin_signal_objective_run');
  });

  it('an objective the day did not derive is refused, and the run is charged', async () => {
    const { client, rpcCalls } = liveClient();
    const claim = await claimSignalObjectiveRun(
      client,
      'p1',
      's1',
      'signal_pay_me_please',
      NOW,
      { enabled: true }
    );
    expect(claim.unknownObjective).toBe(true);
    expect(claim.exemptRunId).toBeNull();

    const charge = await startRun(client, claim);
    expect(charge.state).toBe('charged');
    expect(rpcCalls.map((call) => call.fn)).not.toContain('begin_signal_objective_run');
  });

  it('the SECOND run of the day is charged — one attempt, one exemption', async () => {
    // The database returns the first run's attempt, unchanged, with
    // owns_attempt false. That is the whole guard against farming exemptions.
    const { client } = liveClient({ session_id: 's-first', owns_attempt: false });
    const claim = await claimSignalObjectiveRun(client, 'p1', 's-second', CHOSEN.id, NOW, {
      enabled: true,
    });
    expect(claim.runId).toBe('run-a');
    expect(claim.ownsAttempt).toBe(false);
    expect(claim.exemptRunId).toBeNull();

    expect((await startRun(client, claim)).state).toBe('charged');
  });

  it('a pre-migration-049 database grants nothing and reports nothing', async () => {
    const { client } = fakeClient({
      tables: { players: { data: [{ charges_day: '2026-07-22', charges_used: 0 }] } },
      rpcHandlers: {
        ensure_signal_day: () => ({
          error: { code: 'PGRST202', message: 'Could not find ensure_signal_day' },
        }),
        consume_run_charge: () => ({
          data: [{ charged: true, charges_day: '2026-07-22', charges_used: 1 }],
        }),
      },
    });
    const claim = await claimSignalObjectiveRun(client, 'p1', 's1', CHOSEN.id, NOW, {
      enabled: true,
    });
    expect(claim.live).toBe(false);
    expect(claim.exemptRunId).toBeNull();
    expect((await startRun(client, claim)).state).toBe('charged');
    // A migration that has not landed yet is expected, not an incident.
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('a claim that FAILED grants no exemption, and is reported (Rule 11)', async () => {
    const { client } = fakeClient({
      tables: { players: { data: [{ charges_day: '2026-07-22', charges_used: 0 }] } },
      rpcHandlers: {
        ensure_signal_day: () => ({ data: [{ id: 'day-a' }] }),
        begin_signal_objective_run: () => ({
          error: {
            code: 'P0001',
            message: 'begin_signal_objective_run: session s1 is not an open run for this player',
          },
        }),
        consume_run_charge: () => ({
          data: [{ charged: true, charges_day: '2026-07-22', charges_used: 1 }],
        }),
      },
    });
    const claim = await claimSignalObjectiveRun(client, 'p1', 's1', CHOSEN.id, NOW, {
      enabled: true,
    });
    expect(claim.failed).toBe(true);
    expect(claim.exemptRunId).toBeNull();
    expect((await startRun(client, claim)).state).toBe('charged');
    // The RPC's own raise names the function, so it must not be swallowed as
    // "migration 049 is not applied".
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('only a non-null server id is exempt — the pure rule agrees', () => {
    expect(isChargeExempt({ ...NO_EXEMPTION, signalObjectiveRunId: 'run-a' })).toBe(true);
    expect(isChargeExempt({ ...NO_EXEMPTION, signalObjectiveRunId: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The session route supplies the fact (the hook WP-0.01 left open)
// ---------------------------------------------------------------------------

describe('the session route wires the Signal, tightly', () => {
  const routeSource = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/game/session/route.ts'),
    'utf8'
  );
  const code = routeSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('claims the day against the SERVER clock and the session it just created', () => {
    expect(code).toMatch(
      /claimSignalObjectiveRun\(\s*supabase,\s*player\.id,\s*session\.id,\s*signalObjectiveId,\s*startedAtDate\s*\)/
    );
    // `mode: 'signal'` is a request, not a grant: no claim without it.
    expect(code).toMatch(/const isSignalRun = mode === 'signal';/);
    expect(code).toMatch(/isSignalRun\s*\?\s*await claimSignalObjectiveRun/);
  });

  it('passes the claim result as the exemption fact, never a request value', () => {
    expect(code).toMatch(/signalObjectiveRunId:\s*signalClaim\?\.exemptRunId \?\? null,/);
    // The only occurrence of the fact in the whole route is that one.
    expect([...code.matchAll(/signalObjectiveRunId/g)]).toHaveLength(1);
    // And nothing from the request body can reach it.
    expect(code).not.toMatch(/signalObjectiveRunId:\s*(body|signalRunId|signal_objective_run_id)/);
  });

  it('never lets the request name a day, a target, a seed or a run id', () => {
    // `signalObjectiveId` is the one Signal field on the request, and it is a
    // lookup key the engine resolves against the derived day.
    const signalBodyFields = [
      'signalDay',
      'signal_day',
      'signalTarget',
      'signal_target',
      'signalSeed',
      'signalRunId',
      'signal_objective_run_id',
    ];
    for (const field of signalBodyFields) {
      expect(code).not.toContain(field);
    }
  });

  it('settles the attempt at the end of the run — there is no claim step', () => {
    expect(code).toMatch(
      /settleSignalAttemptForSession\(\s*supabase,\s*sessionId,\s*player\.id\s*\)/
    );
    // Settlement is the ONLY Signal write on the end path.
    expect(code).not.toMatch(/settle_signal_objective_run/);
    expect(code).not.toMatch(/claimSignal[A-Za-z]*\(.*sessionId/);
  });

  it('adds no new column to the session insert, so the pre-049 window is safe', () => {
    // The RPC mirrors the id onto game_sessions inside its own transaction.
    expect(code).not.toMatch(/sessionInsert[\s\S]{0,400}signal_objective_run_id/);
  });

  it('carries no TODO or FIXME', () => {
    expect(routeSource).not.toMatch(/\bTODO\b|\bFIXME\b/);
  });
});
