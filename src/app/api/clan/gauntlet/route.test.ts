/**
 * @jest-environment node
 */

/**
 * Clan Gauntlet API — the GATE and the PRESERVED SURFACE (§9.3, §12.1 slot 7).
 *
 * WP-1.02 put the Gauntlet behind a population gate. §12.1 slot 7 is explicit
 * about what that means — the layer is "opened, not built": it ships whole and
 * hidden, and the day §9.3's criteria are met a flag opens it onto the state it
 * already had. So this suite makes two claims, and neither is optional.
 *
 *   HIDDEN — with `NEXT_PUBLIC_CLAN_GAUNTLET` off (the default, and what CI
 *   must never infer from an omitted variable) GET and POST both answer 200
 *   `{ available: false, live: false, gate: 'clan_gauntlet' }` and touch no
 *   row. A closed gate is a configuration, not a fault: 503 would page an
 *   engineer, 403 would blame the caller, 404 would suggest a typo. And the
 *   closed POST carries no `success`, so it cannot be misread as a write that
 *   landed.
 *
 *   The "touches no row" half is the load-bearing one. `get_gauntlet` and
 *   `contribute_tithe` write — the former settles lazily in SQL on every read,
 *   the latter moves DNA. A hidden layer that kept settling would keep grading
 *   clans behind a curtain, which is what Rule 8 forbids happening at all.
 *
 *   NOT DELETED — with the flag on, every behaviour the Gauntlet had answers
 *   exactly as it did before the gate: the auth ladder, pre-migration-020
 *   safety (GET => live:false, POST => 503), the RPC error->HTTP matrix (tithe
 *   cap, blind lock, officer gate) and payload mapping. Migration 048 keeps the
 *   rows (asserted in `noOfficerLever.test.ts`); these tests keep the
 *   behaviour.
 *
 * The officer language below (`is_officer`, NOT_AN_OFFICER) belongs to the
 * gated layer's own pre-existing SQL and reaches no player: the clan page does
 * not render `GauntletPanel` unless the same flag is on, and after migration
 * 048 no row can hold the officer role for it to match.
 */

var mockGetUser: jest.Mock;

var mockFrom: jest.Mock;

var mockRpc: jest.Mock;

/**
 * Sentry is asserted on, so the spy has to survive `jest.resetModules()` —
 * the factory re-runs on every reload, but the closure keeps pointing at this
 * one function, exactly as the Supabase spies above do.
 */
var mockCaptureException: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { mapGauntletRpcError } from './utils';
import { NextRequest } from 'next/server';

type GauntletRoute = typeof import('./route');

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_CLAN_GAUNTLET;

/**
 * Load the route with the gate in a chosen state. The flag is a build-time
 * constant read once at module scope, on the server as on the client — so
 * switching it means reloading the module, exactly as a deployment would.
 */
function loadRoute(flag?: string): GauntletRoute {
  if (flag === undefined) {
    delete process.env.NEXT_PUBLIC_CLAN_GAUNTLET;
  } else {
    process.env.NEXT_PUBLIC_CLAN_GAUNTLET = flag;
  }
  jest.resetModules();
  return require('./route') as GauntletRoute;
}

afterAll(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.NEXT_PUBLIC_CLAN_GAUNTLET;
  } else {
    process.env.NEXT_PUBLIC_CLAN_GAUNTLET = ORIGINAL_FLAG;
  }
  jest.resetModules();
});

function makeGet(token?: string) {
  return new NextRequest('http://localhost/api/clan/gauntlet', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function makePost(body: unknown, token = 'token') {
  return new NextRequest('http://localhost/api/clan/gauntlet', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockAuthed(clanId: string | null = 'clan-1') {
  mockGetUser = jest.fn().mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
  mockFrom = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: clanId ? { clan_id: clanId } : null, error: null }),
      }),
    }),
  });
}

/** A membership read that FAILED, as opposed to one that came back empty. */
function mockMembershipError(message = 'connection reset') {
  mockGetUser = jest.fn().mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
  mockFrom = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message } }),
      }),
    }),
  });
}

const livePayload = {
  is_officer: true,
  research: {
    pool: 7500,
    target: 'protocols_2',
    unlocked: [{ node_id: 'protocols_1', unlocked_at: '2026-07-01T00:00:00Z' }],
    tithe_cap: 500,
    my_tithe_this_week: 200,
    recent_tithes: [{ name: 'viper', amount: 500, week_start: '2026-07-13' }],
  },
  gauntlet: {
    duel_id: 'duel-1',
    week_start: '2026-07-13',
    phase: 'picks_open',
    picks_deadline: '2026-07-15T00:00:00+00:00',
    window_from: '2026-07-16T00:00:00+00:00',
    window_to: '2026-07-20T00:00:00+00:00',
    opponent: { id: 'clan-2', name: 'Dragon Lords', tag: 'DRAG', rating: 990 },
    revealed: false,
    my_picks: {
      dynasty: 'CYBER', dynasty_2: null, modifier: 'vanguard',
      ban: 'phoenix', locked_at: '2026-07-13T10:00:00Z',
    },
    their_picks: null,
    my_rules: null,
    their_rules: null,
    rivalry: { wins: 1, losses: 2, ties: 0, meetings: 3, last_winner_me: false },
    revenge: true,
    scouting: {
      roster: [{ name: 'drago', mastery: { CYBER: { level: 4 } } }],
      last_picks: [{ week_start: '2026-07-06', dynasty: 'CYBER', dynasty_2: null, modifier: null, ban: 'shed' }],
      detail: false,
    },
    can_substitute: false,
  },
  early_preview: null,
};

/** The one answer a closed gate gives, whatever it is asked. */
const CLOSED_BODY = { available: false, live: false, gate: 'clan_gauntlet' };

beforeEach(() => {
  mockAuthed();
  mockRpc = jest.fn().mockResolvedValue({ data: livePayload, error: null });
  mockCaptureException = jest.fn();
});

describe('the gate is closed — hidden is not broken (§9.3, §12.1 slot 7)', () => {
  it('GET answers 200 { available: false } with the flag absent, not an error', async () => {
    // Absent, not the string "false": CI must never infer the rollback path
    // from an omitted variable, so the omitted case is tested on its own.
    const { GET } = loadRoute(undefined);
    const response = await GET(makeGet('token'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CLOSED_BODY);
  });

  it('GET touches no row: the lazy settler in get_gauntlet is never reached', async () => {
    const { GET } = loadRoute(undefined);
    await GET(makeGet('token'));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('GET leaks no gauntlet state through the closed answer', async () => {
    const { GET } = loadRoute(undefined);
    const body = await (await GET(makeGet('token'))).json();
    expect(body).not.toHaveProperty('gauntlet');
    expect(body).not.toHaveProperty('research');
    expect(body).not.toHaveProperty('isOfficer');
  });

  it('GET closes for an unauthenticated caller too — a hidden layer is not a 401', async () => {
    const { GET } = loadRoute(undefined);
    const response = await GET(makeGet());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CLOSED_BODY);
  });

  it('POST answers the same closed body for EVERY action, and writes nothing', async () => {
    const { POST } = loadRoute(undefined);
    for (const body of [
      { action: 'tithe', amount: 100 },
      { action: 'set_target', nodeId: 'protocols_2' },
      { action: 'submit_picks', dynasty: 'CYBER' },
      { action: 'substitute', out: 'a', in: 'b' },
      { action: 'hack' },
    ]) {
      const response = await POST(makePost(body));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(CLOSED_BODY);
    }
    // `contribute_tithe` moves DNA. Not reaching it is the whole guarantee.
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('the closed POST carries no success key, so it cannot read as a write', async () => {
    const { POST } = loadRoute(undefined);
    const body = await (await POST(makePost({ action: 'tithe', amount: 100 }))).json();
    expect(body).not.toHaveProperty('success');
    expect(body).not.toHaveProperty('result');
  });

  it('reports nothing to Sentry: a closed gate is a configuration, not a fault', async () => {
    const { GET, POST } = loadRoute(undefined);
    await GET(makeGet('token'));
    await POST(makePost({ action: 'tithe', amount: 100 }));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('opens only for the exact string "true"', async () => {
    for (const flag of ['false', 'TRUE', '1', '']) {
      const { GET } = loadRoute(flag);
      expect(await (await GET(makeGet('token'))).json()).toEqual(CLOSED_BODY);
    }
    const { GET } = loadRoute('true');
    expect((await (await GET(makeGet('token'))).json()).available).toBeUndefined();
  });
});

describe('GET /api/clan/gauntlet — behind an open gate, the surface is intact', () => {
  let GET: GauntletRoute['GET'];

  beforeEach(() => {
    ({ GET } = loadRoute('true'));
  });

  it('401 without a token', async () => {
    const response = await GET(makeGet());
    expect(response.status).toBe(401);
  });

  it('401 for an invalid token', async () => {
    mockGetUser = jest
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const response = await GET(makeGet('bad-token'));
    expect(response.status).toBe(401);
  });

  it('404 when not in a clan', async () => {
    mockAuthed(null);
    const response = await GET(makeGet('token'));
    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('500s and reports when the membership read FAILS rather than lying "not in a clan" (Rule 11)', async () => {
    mockMembershipError();
    const response = await GET(makeGet('token'));
    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('PRE-020: missing RPC returns live:false instead of an error', async () => {
    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function get_gauntlet' },
    });
    const response = await GET(makeGet('token'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ live: false, research: null, gauntlet: null });
    // Not-yet-applied is expected, so it is not reported either.
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('500s and reports a real RPC failure (Rule 11)', async () => {
    mockRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'deadlock detected' } });
    const response = await GET(makeGet('token'));
    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('maps the live payload (blind: opponent picks stay hidden pre-reveal)', async () => {
    const response = await GET(makeGet('token'));
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(mockRpc).toHaveBeenCalledWith('get_gauntlet', {
      p_clan_id: 'clan-1',
      p_user_id: 'user-1',
    });
    expect(json.live).toBe(true);
    expect(json.isOfficer).toBe(true);
    expect(json.research.pool).toBe(7500);
    expect(json.research.target).toBe('protocols_2');
    expect(json.research.unlocked).toEqual([
      { nodeId: 'protocols_1', unlockedAt: '2026-07-01T00:00:00Z' },
    ]);
    expect(json.research.myTitheThisWeek).toBe(200);
    expect(json.gauntlet.phase).toBe('picks_open');
    expect(json.gauntlet.revealed).toBe(false);
    expect(json.gauntlet.myPicks.dynasty).toBe('CYBER');
    expect(json.gauntlet.myPicks.ban).toBe('phoenix');
    expect(json.gauntlet.theirPicks).toBeNull();
    expect(json.gauntlet.rivalry).toEqual({
      wins: 1, losses: 2, ties: 0, meetings: 3, lastWinnerMe: false,
    });
    expect(json.gauntlet.revenge).toBe(true);
    expect(json.gauntlet.scouting.roster).toEqual([
      // identity: the Player Card fields ride along once 022 is live;
      // this payload predates it, so the mapper passes null through
      { name: 'drago', identity: null, mastery: { CYBER: { level: 4 } } },
    ]);
    expect(json.gauntlet.scouting.lastPicks[0].ban).toBe('shed');
  });
});

describe('POST /api/clan/gauntlet — behind an open gate, the surface is intact', () => {
  let POST: GauntletRoute['POST'];

  beforeEach(() => {
    ({ POST } = loadRoute('true'));
  });

  it('rejects unknown actions', async () => {
    const response = await POST(makePost({ action: 'hack' }));
    expect(response.status).toBe(400);
  });

  it('PRE-020: any action returns 503 while the RPCs are missing', async () => {
    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function contribute_tithe(uuid, integer) does not exist' },
    });
    const response = await POST(makePost({ action: 'tithe', amount: 100 }));
    expect(response.status).toBe(503);
  });

  it('tithe: validates the amount client-side before the RPC', async () => {
    mockRpc = jest.fn();
    for (const amount of [0, -5, 1.5, 'x', undefined]) {
      const response = await POST(makePost({ action: 'tithe', amount }));
      expect(response.status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('tithe: cap exhaustion maps to a 400 with the cap message', async () => {
    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'TITHE_CAP_EXCEEDED:0' },
    });
    const response = await POST(makePost({ action: 'tithe', amount: 100 }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('TITHE_CAP_EXCEEDED');
  });

  it('tithe: success returns the RPC result', async () => {
    mockRpc = jest.fn().mockResolvedValue({
      data: { dna: 900, tithed_this_week: 300, remaining_cap: 200, pool: 6300, unlocked_node: 'protocols_1' },
      error: null,
    });
    const response = await POST(makePost({ action: 'tithe', amount: 100 }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.result.unlocked_node).toBe('protocols_1');
    expect(mockRpc).toHaveBeenCalledWith('contribute_tithe', {
      p_user_id: 'user-1',
      p_amount: 100,
    });
  });

  it('submit_picks: passes the full pick through and maps blind-lock errors', async () => {
    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'ALREADY_LOCKED' },
    });
    const response = await POST(
      makePost({ action: 'submit_picks', dynasty: 'CYBER', modifier: 'vanguard', ban: 'phoenix' })
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('ALREADY_LOCKED');
    expect(mockRpc).toHaveBeenCalledWith('submit_gauntlet_picks', {
      p_user_id: 'user-1',
      p_dynasty: 'CYBER',
      p_modifier: 'vanguard',
      p_ban: 'phoenix',
      p_dynasty_2: null,
    });
  });

  it('submit_picks: officer gate maps to 403', async () => {
    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'NOT_AN_OFFICER' },
    });
    const response = await POST(makePost({ action: 'submit_picks', dynasty: 'CYBER' }));
    expect(response.status).toBe(403);
  });

  it('set_target: requires nodeId and maps prereq errors', async () => {
    mockRpc = jest.fn();
    expect((await POST(makePost({ action: 'set_target' }))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();

    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'PREREQ_LOCKED:protocols_1' },
    });
    const response = await POST(makePost({ action: 'set_target', nodeId: 'protocols_2' }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('PREREQ_LOCKED');
  });

  it('500s and reports an unrecognised RPC failure (Rule 11)', async () => {
    mockRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'deadlock detected' } });
    const response = await POST(makePost({ action: 'tithe', amount: 100 }));
    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});

describe('mapGauntletRpcError', () => {
  it('translates every migration-020 error code', () => {
    for (const code of [
      'TITHE_CAP_EXCEEDED', 'INSUFFICIENT_DNA', 'NOT_IN_CLAN', 'NOT_AN_OFFICER',
      'INVALID_NODE', 'ALREADY_UNLOCKED', 'PREREQ_LOCKED', 'NO_DUEL_THIS_WEEK',
      'BYE_WEEK', 'PICKS_CLOSED', 'ALREADY_LOCKED', 'INVALID_DYNASTY',
      'INVALID_DYNASTY_SPLIT', 'SPLIT_PICK_LOCKED', 'INVALID_MODIFIER',
      'ANOMALY_NOT_LIVE', 'MODIFIER_LOCKED', 'INVALID_BAN',
      'SUBSTITUTION_LOCKED', 'ALREADY_SUBSTITUTED',
    ]) {
      const mapped = mapGauntletRpcError(`${code}: details`);
      expect(mapped).not.toBeNull();
      expect(mapped!.code).toBe(code);
      expect(mapped!.status).toBeGreaterThanOrEqual(400);
      expect(mapped!.status).toBeLessThan(500);
    }
  });

  it('returns null for unknown errors (falls through to 500)', () => {
    expect(mapGauntletRpcError('deadlock detected')).toBeNull();
  });
});
