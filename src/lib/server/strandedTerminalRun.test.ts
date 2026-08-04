/**
 * @jest-environment node
 *
 * The stranded-terminal absorb, server side (CE-2).
 *
 * Two properties are load-bearing and both are proved here:
 *
 *   1. The service-role identity is SESSION-SCOPED. It resolves only for a row
 *      that genuinely is a stranded terminal run, and it resolves to that
 *      row's owner. Every other session — active, settling, already ended,
 *      legacy — yields nothing, so holding the cron secret does not confer the
 *      ability to act as a player.
 *   2. Absorption never throws and never goes quiet. Every outcome is
 *      classified, and every non-settlement carries the session id, an error
 *      class and the real message — the fail-loud rule from PR #72, written
 *      because the first version of this absorb reported only 5xx and a 4xx
 *      rejection left no trace at all.
 */

const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  absorbStrandedTerminalRun,
  INTERNAL_ABSORB_HEADER,
  INTERNAL_ABSORB_SESSION_HEADER,
  isInternalAbsorbRequest,
  resolveInternalAbsorbIdentity,
  settlementErrorClass,
  settlementErrorMessage,
} from './strandedTerminalRun';

type Row = Record<string, unknown>;

const SESSION_ID = '9d3c1a2e-0f4b-4c7a-9c1f-2b7d8e5a6c31';
const PLAYER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const USER_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';

const db: { game_sessions: Row[]; players: Row[] } = {
  game_sessions: [],
  players: [],
};
const readErrors: { game_sessions?: unknown; players?: unknown } = {};

function strandedRow(overrides: Row = {}): Row {
  return {
    id: SESSION_ID,
    player_id: PLAYER_ID,
    start_request_id: '2f515f00-908b-4f7d-86fb-721db70fed83',
    continuity_phase: 'terminal',
    continuity_terminal_facts: { score: 10 },
    ended_at: null,
    end_reason: null,
    ...overrides,
  };
}

/** Just enough Postgres: filters recorded by `eq`, resolved by `maybeSingle`. */
function fakeSupabase(): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        maybeSingle: async () => {
          const error = readErrors[table as keyof typeof readErrors];
          if (error) return { data: null, error };
          const rows = (db[table as keyof typeof db] ?? []).filter((row) =>
            filters.every(([column, value]) => row[column] === value)
          );
          return { data: rows[0] ?? null, error: null };
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.game_sessions = [strandedRow()];
  db.players = [{ id: PLAYER_ID, user_id: USER_ID }];
  delete readErrors.game_sessions;
  delete readErrors.players;
});

describe('isInternalAbsorbRequest', () => {
  it('recognizes only the marker this server sets', () => {
    expect(isInternalAbsorbRequest(new Headers({ [INTERNAL_ABSORB_HEADER]: '1' }))).toBe(true);
    expect(isInternalAbsorbRequest(new Headers({ [INTERNAL_ABSORB_HEADER]: 'true' }))).toBe(false);
    expect(isInternalAbsorbRequest(new Headers())).toBe(false);
  });
});

describe('resolveInternalAbsorbIdentity', () => {
  it('resolves a genuinely stranded terminal run to its owner', async () => {
    await expect(
      resolveInternalAbsorbIdentity(fakeSupabase(), SESSION_ID)
    ).resolves.toEqual({
      playerId: PLAYER_ID,
      userId: USER_ID,
      sessionId: SESSION_ID,
    });
  });

  it.each([
    ['an active run', { continuity_phase: 'active', continuity_terminal_facts: null }],
    ['a settling run', { end_reason: 'completed' }],
    ['an ended run', { ended_at: '2026-08-04T10:00:00.000Z', end_reason: 'completed' }],
    ['a legacy non-continuity row', { start_request_id: null }],
    ['a terminal row with no server-derived facts', { continuity_terminal_facts: null }],
  ])('refuses %s', async (_label, overrides) => {
    db.game_sessions = [strandedRow(overrides)];
    await expect(
      resolveInternalAbsorbIdentity(fakeSupabase(), SESSION_ID)
    ).resolves.toBeNull();
  });

  it('refuses an unknown session, and any malformed identifier', async () => {
    db.game_sessions = [];
    await expect(
      resolveInternalAbsorbIdentity(fakeSupabase(), SESSION_ID)
    ).resolves.toBeNull();

    for (const value of [
      null,
      undefined,
      '',
      42,
      { id: SESSION_ID },
      "' OR 1=1 --",
      'a'.repeat(65),
    ]) {
      await expect(
        resolveInternalAbsorbIdentity(fakeSupabase(), value)
      ).resolves.toBeNull();
    }
  });

  it('refuses, and reports, when the session read fails', async () => {
    readErrors.game_sessions = { code: '57014', message: 'statement timeout' };
    await expect(
      resolveInternalAbsorbIdentity(fakeSupabase(), SESSION_ID)
    ).resolves.toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('refuses, and reports, when the owner read fails', async () => {
    readErrors.players = { code: '08006', message: 'connection failure' };
    await expect(
      resolveInternalAbsorbIdentity(fakeSupabase(), SESSION_ID)
    ).resolves.toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('refuses a session whose owner row is missing', async () => {
    db.players = [];
    await expect(
      resolveInternalAbsorbIdentity(fakeSupabase(), SESSION_ID)
    ).resolves.toBeNull();
  });
});

describe('absorbStrandedTerminalRun', () => {
  const input = {
    requestUrl: 'http://localhost/api/ops/session-sweep',
    authorization: 'Bearer cron-secret',
    sessionId: SESSION_ID,
    playerId: PLAYER_ID,
  };

  it('re-enters the settlement branch with only an action and a session id', async () => {
    const handler = jest.fn(async () => new Response('{}', { status: 200 }));

    await absorbStrandedTerminalRun(handler, { ...input, serviceRole: true });

    const internal = handler.mock.calls[0][0] as unknown as NextRequest;
    expect(new URL(internal.url).pathname).toBe('/api/game/session');
    expect(internal.method).toBe('POST');
    // Nothing in this body can raise a payout: there is no score, no dna, no
    // food count. Every value settles from the row's server-derived facts.
    expect(await internal.json()).toEqual({ action: 'end', sessionId: SESSION_ID });
    expect(internal.headers.get(INTERNAL_ABSORB_HEADER)).toBe('1');
    expect(internal.headers.get(INTERNAL_ABSORB_SESSION_HEADER)).toBe(SESSION_ID);
    expect(internal.headers.get('authorization')).toBe('Bearer cron-secret');
  });

  it('omits the session header when the player drives their own absorb', async () => {
    const handler = jest.fn(async () => new Response('{}', { status: 200 }));

    await absorbStrandedTerminalRun(handler, input);

    const internal = handler.mock.calls[0][0] as unknown as NextRequest;
    expect(internal.headers.get(INTERNAL_ABSORB_SESSION_HEADER)).toBeNull();
    expect(internal.headers.get(INTERNAL_ABSORB_HEADER)).toBe('1');
  });

  it('classifies a settlement and a durable staging as the successes they are', async () => {
    await expect(
      absorbStrandedTerminalRun(async () => new Response('{}', { status: 200 }), input)
    ).resolves.toMatchObject({ status: 'settled', httpStatus: 200, errorClass: null });

    await expect(
      absorbStrandedTerminalRun(async () => new Response('{}', { status: 202 }), input)
    ).resolves.toMatchObject({ status: 'staged', httpStatus: 202, errorClass: null });

    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('reports every other answer with its status and its body', async () => {
    const outcome = await absorbStrandedTerminalRun(
      async () =>
        new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 }),
      input
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      sessionId: SESSION_ID,
      httpStatus: 404,
      errorClass: 'http_404',
    });
    expect(outcome.message).toContain('Session not found');
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Stranded terminal run absorption did not settle',
      expect.objectContaining({
        level: 'error',
        tags: { progression_stage: 'stranded_terminal_absorb' },
      })
    );
  });

  it('never throws: a thrown fold becomes a classified, reported outcome', async () => {
    const outcome = await absorbStrandedTerminalRun(async () => {
      throw new RangeError('replay ran off the end');
    }, input);

    expect(outcome).toEqual({
      status: 'failed',
      sessionId: SESSION_ID,
      httpStatus: null,
      errorClass: 'RangeError',
      message: 'replay ran off the end',
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('survives a response whose body cannot be read', async () => {
    const outcome = await absorbStrandedTerminalRun(async () => {
      const response = new Response('{}', { status: 503 });
      Object.defineProperty(response, 'clone', {
        value: () => {
          throw new Error('stream already locked');
        },
      });
      return response;
    }, input);

    // The clone throws, so this lands in the catch: still classified, still
    // reported, still not an exception escaping into the caller's loop.
    expect(outcome.status).toBe('failed');
    expect(outcome.message).toContain('stream already locked');
  });
});

describe('failure description', () => {
  it('prefers a Postgres code, then a name, and always finds the real message', () => {
    expect(settlementErrorClass({ code: '23514', message: 'check violated' })).toBe('23514');
    expect(settlementErrorClass(new TypeError('bad'))).toBe('TypeError');
    expect(settlementErrorClass({ message: 'no code' })).toBe('object');
    expect(settlementErrorClass('plain')).toBe('string');
    expect(settlementErrorClass(null)).toBe('object');

    expect(settlementErrorMessage(new Error('boom'))).toBe('boom');
    expect(settlementErrorMessage({ message: 'rpc failed' })).toBe('rpc failed');
    expect(settlementErrorMessage({ detail: 'x' })).toBe('{"detail":"x"}');
    expect(settlementErrorMessage(undefined)).toBe('undefined');
    expect(settlementErrorMessage(new Error('a'.repeat(900)))).toHaveLength(500);
  });
});
