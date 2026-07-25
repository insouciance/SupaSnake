/**
 * GET /api/leaderboard - integration tests against an in-memory Supabase
 * fake that actually applies the filters the route passes it.
 *
 * Acceptance (WP-0.05 / Constitution §6.1 / GT §9.3):
 *   - flagged and in-progress runs cannot rank
 *   - one best entry per player
 *   - myRank resolves for a real account (players.id, not auth.users.id)
 *   - the you-centered view returns the top 3 plus the viewer ±5
 *   - every Supabase error is checked and reported
 *
 * Acceptance (WP-0.06 / GT §9.6, §13):
 *   - a run that did not settle (expired, abandoned, disconnected) cannot rank
 *   - a flagged cohort appears on no public board and in no public count
 */

import { NextRequest } from 'next/server';

const mockCaptureException = jest.fn();

interface MockRow {
  id: string;
  player_id: string | null;
  score: number | null;
  dynasty: string | null;
  started_at: string | null;
  ended_at: string | null;
  validated: boolean | null;
  is_free_play: boolean | null;
  anomaly_id: string | null;
  end_reason?: string | null;
}

interface MockPlayer {
  id: string;
  user_id: string | null;
  username: string | null;
  cohort?: string | null;
}

const mockState: {
  sessions: MockRow[];
  players: MockPlayer[];
  authUser: { id: string } | null;
  authError: unknown;
  sessionError: unknown;
  playerLookupError: unknown;
  usernameError: unknown;
  cohortLookupError: unknown;
  queries: Array<{ table: string; calls: Array<[string, ...unknown[]]> }>;
} = {
  sessions: [],
  players: [],
  authUser: null,
  authError: null,
  sessionError: null,
  playerLookupError: null,
  usernameError: null,
  cohortLookupError: null,
  queries: [],
};

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => {
  type Call = [string, ...unknown[]];

  const value = (row: Record<string, unknown>, column: string) =>
    row[column] ?? null;

  const applyFilters = (rows: Record<string, unknown>[], calls: Call[]) => {
    let out = rows;
    for (const [op, ...args] of calls) {
      if (op === 'eq') {
        out = out.filter((r) => value(r, args[0] as string) === args[1]);
      } else if (op === 'is') {
        out = out.filter((r) => value(r, args[0] as string) === args[1]);
      } else if (op === 'not' && args[1] === 'in') {
        // .not(column, 'in', '(id-1,id-2)') — the cohort exclusion
        const list = String(args[2]).replace(/^\(|\)$/g, '').split(',').filter(Boolean);
        out = out.filter((r) => !list.includes(String(value(r, args[0] as string))));
      } else if (op === 'not') {
        // .not(column, 'is', null)
        out = out.filter((r) => value(r, args[0] as string) !== args[2]);
      } else if (op === 'neq') {
        // SQL semantics: NULL <> 'x' is unknown, so a NULL never matches.
        out = out.filter((r) => {
          const cell = value(r, args[0] as string);
          return cell !== null && cell !== args[1];
        });
      } else if (op === 'or') {
        // .or('end_reason.is.null,end_reason.eq.completed')
        const clauses = String(args[0]).split(',');
        out = out.filter((r) =>
          clauses.some((clause) => {
            const [column, operator, operand] = clause.split('.');
            const cell = value(r, column);
            if (operator === 'is') return cell === (operand === 'null' ? null : operand);
            if (operator === 'eq') return String(cell) === operand;
            return false;
          })
        );
      } else if (op === 'gte') {
        out = out.filter(
          (r) => String(value(r, args[0] as string) ?? '') >= String(args[1])
        );
      } else if (op === 'in') {
        out = out.filter((r) =>
          (args[1] as unknown[]).includes(value(r, args[0] as string))
        );
      }
    }
    return out;
  };

  const applyOrder = (rows: Record<string, unknown>[], calls: Call[]) => {
    const orders = calls.filter(([op]) => op === 'order');
    if (orders.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const [, column, opts] of orders) {
        const ascending = (opts as { ascending?: boolean })?.ascending !== false;
        const av = value(a, column as string);
        const bv = value(b, column as string);
        if (av === bv) continue;
        const cmp = (av as number | string) < (bv as number | string) ? -1 : 1;
        return ascending ? cmp : -cmp;
      }
      return 0;
    });
  };

  const applyRange = (rows: Record<string, unknown>[], calls: Call[]) => {
    const range = calls.find(([op]) => op === 'range');
    if (!range) return rows;
    const [, from, to] = range as [string, number, number];
    return rows.slice(from, to + 1);
  };

  const resolve = (table: string, calls: Call[]) => {
    mockState.queries.push({ table, calls });

    if (table === 'game_sessions') {
      if (mockState.sessionError) {
        return { data: null, error: mockState.sessionError };
      }
      const rows = mockState.sessions as unknown as Record<string, unknown>[];
      return {
        data: applyRange(applyOrder(applyFilters(rows, calls), calls), calls),
        error: null,
      };
    }

    if (table === 'players') {
      const isViewerLookup = calls.some(
        ([op, column]) => op === 'eq' && column === 'user_id'
      );
      const isCohortLookup = calls.some(
        ([op, column]) => op === 'neq' && column === 'cohort'
      );
      if (isCohortLookup && mockState.cohortLookupError) {
        return { data: null, error: mockState.cohortLookupError };
      }
      if (isViewerLookup && mockState.playerLookupError) {
        return { data: null, error: mockState.playerLookupError };
      }
      if (!isViewerLookup && !isCohortLookup && mockState.usernameError) {
        return { data: null, error: mockState.usernameError };
      }
      const rows = mockState.players as unknown as Record<string, unknown>[];
      const filtered = applyFilters(rows, calls);
      return { data: filtered, error: null };
    }

    if (table === 'player_identity_view') {
      // Pre-022 behavior: no identity rows, legacy names render.
      return { data: [], error: null };
    }

    return { data: [], error: null };
  };

  const makeBuilder = (table: string) => {
    const calls: Call[] = [];
    const push = (op: string) => (...args: unknown[]) => {
      calls.push([op, ...args]);
      return builder;
    };
    const builder: Record<string, unknown> = {
      select: push('select'),
      eq: push('eq'),
      is: push('is'),
      not: push('not'),
      neq: push('neq'),
      or: push('or'),
      gte: push('gte'),
      in: push('in'),
      order: push('order'),
      range: push('range'),
      maybeSingle: () => {
        const result = resolve(table, calls) as { data: unknown[] | null; error: unknown };
        if (result.error) return Promise.resolve({ data: null, error: result.error });
        const rows = result.data ?? [];
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(table, calls)).then(onFulfilled, onRejected),
    };
    return builder;
  };

  return {
    createClient: jest.fn(() => ({
      auth: {
        getUser: async () => ({
          data: { user: mockState.authUser },
          error: mockState.authError,
        }),
      },
      from: (table: string) => makeBuilder(table),
    })),
  };
});

let GET: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import('./route'));
});

const NOW = '2026-07-24T12:00:00.000Z'; // Friday, well after the content epoch

function session(overrides: Partial<MockRow> & { id: string; player_id: string }): MockRow {
  return {
    score: 100,
    dynasty: 'CYBER',
    started_at: NOW,
    ended_at: '2026-07-24T12:05:00.000Z',
    validated: true,
    is_free_play: false,
    anomaly_id: null,
    ...overrides,
  };
}

function request(query = '', auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new NextRequest(`http://localhost:3000/api/leaderboard${query}`, { headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.sessions = [];
  mockState.players = [];
  mockState.authUser = null;
  mockState.authError = null;
  mockState.sessionError = null;
  mockState.playerLookupError = null;
  mockState.usernameError = null;
  mockState.cohortLookupError = null;
  mockState.queries = [];
});

describe('leaderboard eligibility is enforced in the query', () => {
  it('an in-progress run cannot rank', async () => {
    mockState.sessions = [
      session({ id: 'open', player_id: 'p-open', score: 99999, ended_at: null }),
      session({ id: 'done', player_id: 'p-done', score: 120 }),
    ];

    const data = await (await GET(request('?type=global'))).json();

    expect(data.entries.map((e: { playerId: string }) => e.playerId)).toEqual(['p-done']);
    expect(data.total).toBe(1);
  });

  it('a flagged run cannot rank', async () => {
    mockState.sessions = [
      session({ id: 'cheat', player_id: 'p-cheat', score: 99999, validated: false }),
      session({ id: 'clean', player_id: 'p-clean', score: 120 }),
    ];

    const data = await (await GET(request('?type=global'))).json();

    expect(data.entries.map((e: { playerId: string }) => e.playerId)).toEqual(['p-clean']);
  });

  it('Free Play and Anomaly runs cannot rank', async () => {
    mockState.sessions = [
      session({ id: 'free', player_id: 'p-free', score: 99999, is_free_play: true }),
      session({ id: 'anom', player_id: 'p-anom', score: 99999, anomaly_id: 'gold_rush' }),
      session({ id: 'real', player_id: 'p-real', score: 10 }),
    ];

    const data = await (await GET(request('?type=global'))).json();

    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].playerId).toBe('p-real');
  });

  it('a run from an incompatible content version cannot rank', async () => {
    mockState.sessions = [
      session({
        id: 'ancient',
        player_id: 'p-old',
        score: 99999,
        started_at: '2026-06-01T00:00:00.000Z',
        ended_at: '2026-06-01T00:05:00.000Z',
      }),
      session({ id: 'current', player_id: 'p-new', score: 10 }),
    ];

    const data = await (await GET(request('?type=global'))).json();

    expect(data.entries.map((e: { playerId: string }) => e.playerId)).toEqual(['p-new']);
    expect(data.contentVersion).toMatch(/\S/);
  });

  it('pushes every eligibility predicate into the session query, not the client', async () => {
    await GET(request('?type=daily'));

    const sessionQuery = mockState.queries.find((q) => q.table === 'game_sessions');
    expect(sessionQuery).toBeDefined();
    const calls = sessionQuery!.calls.map((c) => JSON.stringify(c));
    expect(calls).toContain(JSON.stringify(['not', 'ended_at', 'is', null]));
    expect(calls).toContain(JSON.stringify(['eq', 'validated', true]));
    expect(calls).toContain(JSON.stringify(['eq', 'is_free_play', false]));
    expect(calls).toContain(JSON.stringify(['is', 'anomaly_id', null]));
    expect(sessionQuery!.calls.some(([op, column]) => op === 'gte' && column === 'started_at')).toBe(
      true
    );
  });
});

describe('one best entry per player', () => {
  it('a single player cannot occupy the whole board', async () => {
    mockState.sessions = [
      session({ id: 'h1', player_id: 'hoarder', score: 900 }),
      session({ id: 'h2', player_id: 'hoarder', score: 880 }),
      session({ id: 'h3', player_id: 'hoarder', score: 860 }),
      session({ id: 'r1', player_id: 'rival', score: 500 }),
    ];

    const data = await (await GET(request('?type=global'))).json();

    expect(data.entries).toHaveLength(2);
    expect(data.entries[0]).toMatchObject({ playerId: 'hoarder', rank: 1, score: 900 });
    expect(data.entries[1]).toMatchObject({ playerId: 'rival', rank: 2, score: 500 });
    expect(data.total).toBe(2);
  });
});

describe('viewer resolution (the GT §9.3 myRank bug)', () => {
  beforeEach(() => {
    mockState.players = [
      { id: 'player-uuid', user_id: 'auth-uuid', username: 'Sans_Souci' },
      { id: 'other-uuid', user_id: 'auth-other', username: 'Rival' },
    ];
    mockState.sessions = [
      session({ id: 's1', player_id: 'other-uuid', score: 900 }),
      session({ id: 's2', player_id: 'player-uuid', score: 400 }),
    ];
    mockState.authUser = { id: 'auth-uuid' };
  });

  it('resolves myRank for a real account by joining auth id -> players.user_id', async () => {
    const data = await (await GET(request('?type=global', 'Bearer good-token'))).json();

    expect(data.viewer).toEqual({
      playerId: 'player-uuid',
      ranked: true,
      rank: 2,
      score: 400,
    });
  });

  it('reports the viewer in the players.id space, never the auth user id', async () => {
    const data = await (await GET(request('?type=global', 'Bearer good-token'))).json();

    expect(data.viewer.playerId).toBe('player-uuid');
    expect(data.viewer.playerId).not.toBe('auth-uuid');
    // Entries are in the same space, so a client comparison now matches
    const mine = data.entries.find(
      (e: { playerId: string }) => e.playerId === data.viewer.playerId
    );
    expect(mine.rank).toBe(data.viewer.rank);
  });

  it('marks a signed-in player with no eligible run as unranked, not absent', async () => {
    mockState.sessions = [session({ id: 's1', player_id: 'other-uuid', score: 900 })];

    const data = await (await GET(request('?type=global', 'Bearer good-token'))).json();

    expect(data.viewer).toEqual({
      playerId: 'player-uuid',
      ranked: false,
      rank: null,
      score: null,
    });
  });

  it('serves the board anonymously with viewer null', async () => {
    const data = await (await GET(request('?type=global'))).json();

    expect(data.viewer).toBeNull();
    expect(data.entries).toHaveLength(2);
  });

  it('treats an invalid token as anonymous rather than failing the board', async () => {
    mockState.authUser = null;
    mockState.authError = { message: 'invalid token' };

    const response = await GET(request('?type=global', 'Bearer nope'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.viewer).toBeNull();
  });
});

describe('you-centered view (§6.1)', () => {
  beforeEach(() => {
    // 30 players; the viewer sits at rank 15
    mockState.sessions = Array.from({ length: 30 }, (_, i) =>
      session({
        id: `s${i}`,
        player_id: i === 14 ? 'player-uuid' : `p${i}`,
        score: 3000 - i * 10,
        ended_at: `2026-07-24T12:${String(i).padStart(2, '0')}:00.000Z`,
      })
    );
    mockState.players = [{ id: 'player-uuid', user_id: 'auth-uuid', username: 'Sans_Souci' }];
    mockState.authUser = { id: 'auth-uuid' };
  });

  it('returns the top 3 plus the viewer ±5', async () => {
    const data = await (await GET(request('?type=global&view=you', 'Bearer good-token'))).json();

    expect(data.view).toBe('you');
    expect(data.top.map((e: { rank: number }) => e.rank)).toEqual([1, 2, 3]);
    expect(data.window.map((e: { rank: number }) => e.rank)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(data.window[5].playerId).toBe('player-uuid');
    expect(data.entries.map((e: { rank: number }) => e.rank)).toEqual([
      1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it('falls back to the top slice for an anonymous visitor', async () => {
    const data = await (await GET(request('?type=global&view=you'))).json();

    expect(data.window).toEqual([]);
    expect(data.entries).toHaveLength(3);
  });

  it('still exposes top and viewer on the paged board view', async () => {
    const data = await (
      await GET(request('?type=global&view=board&limit=5', 'Bearer good-token'))
    ).json();

    expect(data.view).toBe('board');
    expect(data.entries).toHaveLength(5);
    expect(data.top).toHaveLength(3);
    expect(data.viewer.rank).toBe(15);
  });

  it('rejects an unknown view', async () => {
    const response = await GET(request('?view=sideways'));
    expect(response.status).toBe(400);
  });
});

describe('filters and validation', () => {
  it('rejects an unknown type', async () => {
    expect((await GET(request('?type=monthly'))).status).toBe(400);
  });

  it('rejects a non-canonical dynasty (EMBER/CRYSTAL/VOID are deprecated)', async () => {
    expect((await GET(request('?dynasty=EMBER'))).status).toBe(400);
  });

  it('applies the dynasty filter to every board type', async () => {
    mockState.sessions = [
      session({ id: 'c', player_id: 'a', score: 900, dynasty: 'CYBER' }),
      session({ id: 'p', player_id: 'b', score: 800, dynasty: 'PRIMAL' }),
    ];

    const data = await (await GET(request('?type=global&dynasty=PRIMAL'))).json();

    expect(data.dynasty).toBe('PRIMAL');
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].playerId).toBe('b');
  });
});

describe('score stays build-independent (Rule 2)', () => {
  it('never reads generation, collection or account state on the board path', async () => {
    mockState.sessions = [session({ id: 's1', player_id: 'a', score: 500 })];
    mockState.players = [{ id: 'a', user_id: null, username: 'Pilot' }];

    const data = await (await GET(request('?type=global'))).json();

    expect(Object.keys(data.entries[0]).sort()).toEqual(
      ['achievedAt', 'dynasty', 'playerId', 'playerName', 'rank', 'score'].sort()
    );

    const columns = mockState.queries
      .flatMap((q) => q.calls.filter(([op]) => op === 'select').map(([, arg]) => String(arg)))
      .join(' ');
    expect(columns).not.toMatch(/collected_snakes|generation|high_score|dna/);
  });

  it('never reads players.high_score - flagged runs used to set a permanent record', async () => {
    mockState.sessions = [session({ id: 's1', player_id: 'a', score: 500 })];

    await GET(request('?type=global'));

    const playerSelects = mockState.queries
      .filter((q) => q.table === 'players')
      .flatMap((q) => q.calls.filter(([op]) => op === 'select').map(([, arg]) => String(arg)));
    for (const columns of playerSelects) {
      expect(columns).not.toMatch(/high_score/);
    }
  });
});

describe('error handling (Rule 11)', () => {
  it('fails the request and reports to Sentry when the session scan errors', async () => {
    mockState.sessionError = { message: 'relation does not exist', code: '42P01' };

    const response = await GET(request('?type=global'));

    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('reports a failed viewer lookup and serves the board anonymously', async () => {
    mockState.authUser = { id: 'auth-uuid' };
    mockState.playerLookupError = { message: 'connection reset' };
    mockState.sessions = [session({ id: 's1', player_id: 'a', score: 500 })];

    const response = await GET(request('?type=global', 'Bearer good-token'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.viewer).toBeNull();
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('reports a failed username lookup and still ranks correctly', async () => {
    mockState.usernameError = { message: 'timeout' };
    mockState.sessions = [session({ id: 's1', player_id: 'a', score: 500 })];

    const response = await GET(request('?type=global'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries[0].rank).toBe(1);
    expect(data.entries[0].playerName).toBe('Player a');
    expect(mockCaptureException).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// WP-0.06 — session lifecycle and cohorts (GT §9.6, §13)
// ---------------------------------------------------------------------------

describe('a run that did not settle cannot rank', () => {
  it.each(['expired', 'abandoned', 'disconnected'])(
    'excludes an %s run even when it is ended and validated',
    async (reason) => {
      mockState.sessions = [
        // The dangerous shape: the sweep set ended_at on a row whose
        // settlement had already written score and validated (a reward-grant
        // failure that was never replayed). It must not rank.
        session({
          id: 'ghost',
          player_id: 'p-ghost',
          score: 99999,
          end_reason: reason,
        }),
        session({ id: 'real', player_id: 'p-real', score: 120, end_reason: 'completed' }),
      ];

      const data = await (await GET(request('?type=global'))).json();

      expect(data.entries.map((e: { playerId: string }) => e.playerId)).toEqual([
        'p-real',
      ]);
      expect(data.total).toBe(1);
    }
  );

  it('still ranks a pre-045 row, which had only one end path', async () => {
    mockState.sessions = [session({ id: 'legacy', player_id: 'p-legacy', score: 300 })];

    const data = await (await GET(request('?type=global'))).json();

    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].playerId).toBe('p-legacy');
  });

  it('pushes the settled predicate into the query', async () => {
    await GET(request('?type=global'));

    const sessionQuery = mockState.queries.find((q) => q.table === 'game_sessions');
    const calls = sessionQuery!.calls.map((c) => JSON.stringify(c));
    expect(calls).toContain(
      JSON.stringify(['or', 'end_reason.is.null,end_reason.eq.completed'])
    );
  });
});

describe('a flagged cohort appears on no public surface', () => {
  beforeEach(() => {
    mockState.players = [
      { id: 'p-dev', user_id: 'auth-dev', username: 'DevAccount', cohort: 'dev' },
      { id: 'p-qa', user_id: 'auth-qa', username: 'QaAccount', cohort: 'qa' },
      { id: 'p-fix', user_id: null, username: 'Fixture', cohort: 'fixture' },
      { id: 'p-real', user_id: 'auth-real', username: 'RealPlayer', cohort: 'player' },
    ];
  });

  it('keeps dev, QA and fixture runs off the board and out of the count', async () => {
    mockState.sessions = [
      session({ id: 'd', player_id: 'p-dev', score: 99999, end_reason: 'completed' }),
      session({ id: 'q', player_id: 'p-qa', score: 88888, end_reason: 'completed' }),
      session({ id: 'f', player_id: 'p-fix', score: 77777, end_reason: 'completed' }),
      session({ id: 'r', player_id: 'p-real', score: 120, end_reason: 'completed' }),
    ];

    const data = await (await GET(request('?type=global'))).json();

    expect(data.entries.map((e: { playerId: string }) => e.playerId)).toEqual(['p-real']);
    // The public count is the board's own length, so it decays with it.
    expect(data.total).toBe(1);
    expect(data.entries[0].rank).toBe(1);
  });

  it('excludes them from every board type and from the you-centered view', async () => {
    // Inside today's window as well as this week's, so the daily and weekly
    // boards see the same two runs the global board does.
    const justNow = new Date().toISOString();
    mockState.sessions = [
      session({
        id: 'd',
        player_id: 'p-dev',
        score: 99999,
        started_at: justNow,
        ended_at: justNow,
      }),
      session({
        id: 'r',
        player_id: 'p-real',
        score: 120,
        started_at: justNow,
        ended_at: justNow,
      }),
    ];

    for (const type of ['global', 'weekly', 'daily']) {
      const board = await (await GET(request(`?type=${type}`))).json();
      expect(board.entries.map((e: { playerId: string }) => e.playerId)).toEqual([
        'p-real',
      ]);
    }

    const you = await (await GET(request('?type=global&view=you'))).json();
    expect(you.top.map((e: { playerId: string }) => e.playerId)).toEqual(['p-real']);
  });

  it('pushes the cohort exclusion into the query rather than filtering after', async () => {
    mockState.sessions = [session({ id: 'r', player_id: 'p-real', score: 120 })];

    await GET(request('?type=global'));

    const cohortQuery = mockState.queries.find((q) =>
      q.calls.some(([op, column]) => op === 'neq' && column === 'cohort')
    );
    expect(cohortQuery?.table).toBe('players');

    const sessionQuery = mockState.queries.find((q) => q.table === 'game_sessions');
    const notIn = sessionQuery!.calls.find(
      ([op, column, operator]) =>
        op === 'not' && column === 'player_id' && operator === 'in'
    );
    expect(notIn).toBeDefined();
    expect(String(notIn![3])).toContain('p-dev');
    expect(String(notIn![3])).toContain('p-qa');
    expect(String(notIn![3])).toContain('p-fix');
    expect(String(notIn![3])).not.toContain('p-real');
  });

  it('unranks a flagged viewer without erroring — they still see the board', async () => {
    mockState.authUser = { id: 'auth-dev' };
    mockState.sessions = [
      session({ id: 'd', player_id: 'p-dev', score: 99999 }),
      session({ id: 'r', player_id: 'p-real', score: 120 }),
    ];

    const response = await GET(request('?type=global', 'Bearer dev-token'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.viewer).toEqual({
      playerId: 'p-dev',
      ranked: false,
      rank: null,
      score: null,
    });
    expect(data.entries.map((e: { playerId: string }) => e.playerId)).toEqual(['p-real']);
  });

  it('writes nothing — flagging is read-side only (Rule 6)', async () => {
    mockState.sessions = [session({ id: 'd', player_id: 'p-dev', score: 99999 })];

    await GET(request('?type=global'));

    for (const query of mockState.queries) {
      const operations = query.calls.map(([op]) => op);
      expect(operations).not.toContain('update');
      expect(operations).not.toContain('delete');
      expect(operations).not.toContain('insert');
      expect(operations).not.toContain('upsert');
    }
  });

  it('serves everyone when the cohort read fails, and reports it', async () => {
    mockState.cohortLookupError = { code: '08006', message: 'connection failure' };
    mockState.sessions = [session({ id: 'r', player_id: 'p-real', score: 120 })];

    const response = await GET(request('?type=global'));

    expect(response.status).toBe(200);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('serves everyone silently before migration 045', async () => {
    mockState.cohortLookupError = { code: '42703', message: 'column players.cohort does not exist' };
    mockState.sessions = [session({ id: 'r', player_id: 'p-real', score: 120 })];

    const response = await GET(request('?type=global'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(1);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

describe('a mass flagging degrades safely', () => {
  it('drops the query predicate but still excludes every flagged account', async () => {
    const flagged = Array.from({ length: 301 }, (_, i) => `p-flag-${i}`);
    mockState.players = [
      ...flagged.map((id) => ({ id, user_id: null, username: id, cohort: 'qa' })),
      { id: 'p-real', user_id: null, username: 'RealPlayer', cohort: 'player' },
    ];
    mockState.sessions = [
      ...flagged.map((id, i) =>
        session({ id: `s-${i}`, player_id: id, score: 90000 + i })
      ),
      session({ id: 's-real', player_id: 'p-real', score: 120 }),
    ];

    const data = await (await GET(request('?type=global'))).json();

    // The exclusion list is too long to push down…
    const sessionQuery = mockState.queries.find((q) => q.table === 'game_sessions');
    expect(
      sessionQuery!.calls.some(
        ([op, column, operator]) =>
          op === 'not' && column === 'player_id' && operator === 'in'
      )
    ).toBe(false);
    // …and the board is still correct, because the pure gate re-applies it.
    expect(data.entries.map((e: { playerId: string }) => e.playerId)).toEqual(['p-real']);
    expect(data.total).toBe(1);
  });
});
