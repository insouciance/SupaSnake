/**
 * @jest-environment node
 */

/**
 * Clan Gauntlet API tests - GET/POST handlers with a mocked supabase
 * client: auth gates, pre-migration-020 safety (GET => live:false, POST =>
 * 503), RPC error-code translation (tithe cap, blind lock, officer gate),
 * and payload mapping.
 */

var mockGetUser: jest.Mock;

var mockFrom: jest.Mock;

var mockRpc: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import { GET, POST } from './route';
import { mapGauntletRpcError } from './utils';
import { NextRequest } from 'next/server';

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

describe('GET /api/clan/gauntlet', () => {
  it('401 without a token', async () => {
    mockAuthed();
    const response = await GET(makeGet());
    expect(response.status).toBe(401);
  });

  it('404 when not in a clan', async () => {
    mockAuthed(null);
    const response = await GET(makeGet('token'));
    expect(response.status).toBe(404);
  });

  it('PRE-020: missing RPC returns live:false instead of an error', async () => {
    mockAuthed();
    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function get_gauntlet' },
    });
    const response = await GET(makeGet('token'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ live: false, research: null, gauntlet: null });
  });

  it('maps the live payload (blind: opponent picks stay hidden pre-reveal)', async () => {
    mockAuthed();
    mockRpc = jest.fn().mockResolvedValue({ data: livePayload, error: null });
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
      { name: 'drago', mastery: { CYBER: { level: 4 } } },
    ]);
    expect(json.gauntlet.scouting.lastPicks[0].ban).toBe('shed');
  });
});

describe('POST /api/clan/gauntlet', () => {
  it('rejects unknown actions', async () => {
    mockAuthed();
    const response = await POST(makePost({ action: 'hack' }));
    expect(response.status).toBe(400);
  });

  it('PRE-020: any action returns 503 while the RPCs are missing', async () => {
    mockAuthed();
    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function contribute_tithe(uuid, integer) does not exist' },
    });
    const response = await POST(makePost({ action: 'tithe', amount: 100 }));
    expect(response.status).toBe(503);
  });

  it('tithe: validates the amount client-side before the RPC', async () => {
    mockAuthed();
    mockRpc = jest.fn();
    for (const amount of [0, -5, 1.5, 'x', undefined]) {
      const response = await POST(makePost({ action: 'tithe', amount }));
      expect(response.status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('tithe: cap exhaustion maps to a 400 with the cap message', async () => {
    mockAuthed();
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
    mockAuthed();
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
    mockAuthed();
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
    mockAuthed();
    mockRpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'NOT_AN_OFFICER' },
    });
    const response = await POST(makePost({ action: 'submit_picks', dynasty: 'CYBER' }));
    expect(response.status).toBe(403);
  });

  it('set_target: requires nodeId and maps prereq errors', async () => {
    mockAuthed();
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
