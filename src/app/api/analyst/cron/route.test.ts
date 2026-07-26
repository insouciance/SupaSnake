/**
 * @jest-environment node
 *
 * Analyst cron route tests (Identity v1 §9.2): exact CRON_SECRET auth,
 * the daily prune, UTC-Monday gating of the digest
 * batch (with the ≥3-earning-runs floor, budget stop and opt-in email),
 * the post-season-week gating of archetypes + Recalls, and pre-025
 * degradation.
 */

var mockFrom: jest.Mock;
var mockRpc: jest.Mock;
var mockGetUserById: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      admin: { getUserById: (...args: unknown[]) => mockGetUserById(...args) },
    },
  }),
}));

const mockGenerateWeeklyDigest = jest.fn();
const mockGenerateArchetype = jest.fn();
const mockGenerateSeasonRecall = jest.fn();
const mockLatestEndedSeason = jest.fn();

jest.mock('@/lib/analyst/insights', () => {
  const actual = jest.requireActual('@/lib/analyst/insights');
  return {
    generateWeeklyDigest: (...args: unknown[]) => mockGenerateWeeklyDigest(...args),
    generateArchetype: (...args: unknown[]) => mockGenerateArchetype(...args),
    generateSeasonRecall: (...args: unknown[]) => mockGenerateSeasonRecall(...args),
    latestEndedSeason: (...args: unknown[]) => mockLatestEndedSeason(...args),
    isMissingAnalystInfra: actual.isMissingAnalystInfra,
    lastCompletedWeekStart: actual.lastCompletedWeekStart,
  };
});

const mockBudgetRemaining = jest.fn();
jest.mock('@/lib/analyst/narrate', () => ({
  budgetRemaining: (...args: unknown[]) => mockBudgetRemaining(...args),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

const MONDAY = new Date('2026-07-13T07:00:00Z');
const TUESDAY = new Date('2026-07-14T07:00:00Z');

function cronRequest(
  headers: Record<string, string> = {
    authorization: 'Bearer cron-secret-test',
  }
) {
  return new NextRequest('http://localhost/api/analyst/cron', { headers });
}

/** game_sessions rows: 4 runs for p1, 2 for p2 (below the ≥3 floor). */
function wireTables(options: { optedIn?: string[] } = {}) {
  const sessions = [
    ...Array.from({ length: 4 }, () => ({ player_id: 'p1' })),
    ...Array.from({ length: 2 }, () => ({ player_id: 'p2' })),
  ];
  mockFrom.mockImplementation((table: string) => {
    const rows =
      table === 'game_sessions'
        ? sessions
        : table === 'player_settings'
          ? (options.optedIn ?? []).map((id) => ({
              player_id: id,
              email_digest_opt_in: true,
            }))
          : table === 'players'
            ? [
                { id: 'p1', user_id: 'u1' },
                { id: 'p2', user_id: 'u2' },
              ]
            : null;
    if (rows === null) throw new Error(`Unexpected table in test: ${table}`);
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gt', 'gte', 'lt', 'not', 'in', 'limit']) {
      c[m] = jest.fn(() => c);
    }
    c.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows, error: null });
    return c;
  });
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  mockFrom = jest.fn();
  mockRpc = jest.fn().mockResolvedValue({ data: 42, error: null });
  mockGetUserById = jest.fn().mockResolvedValue({
    data: { user: { email: 'p1@example.com', is_anonymous: false } },
    error: null,
  });
  mockGenerateWeeklyDigest.mockReset().mockResolvedValue({
    live: true,
    cached: false,
    source: 'llm',
    insight: { content: { headline: 'h', body: 'b', tips: [] } },
  });
  mockGenerateArchetype.mockReset().mockResolvedValue({
    live: true,
    cached: false,
    source: 'llm',
    archetype: 'surgeon',
    insight: { content: { headline: 'The Surgeon', body: 'b', tips: [] } },
  });
  mockGenerateSeasonRecall.mockReset().mockResolvedValue({
    live: true,
    cached: false,
    source: 'llm',
    insight: { content: { headline: 'r', body: 'b', tips: [] } },
  });
  mockLatestEndedSeason.mockReset().mockResolvedValue(null);
  mockBudgetRemaining.mockReset().mockResolvedValue(1_000_000);
  process.env.CRON_SECRET = 'cron-secret-test';
});

afterEach(() => {
  jest.useRealTimers();
});

describe('GET /api/analyst/cron — auth', () => {
  it('rejects unauthenticated calls', async () => {
    jest.setSystemTime(TUESDAY);
    const response = await GET(
      new NextRequest('http://localhost/api/analyst/cron')
    );
    expect(response.status).toBe(401);
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    jest.setSystemTime(TUESDAY);
    delete process.env.CRON_SECRET;
    const response = await GET(
      cronRequest({ authorization: 'Bearer cron-secret-test' })
    );
    expect(response.status).toBe(401);
  });

  it('accepts the CRON_SECRET bearer', async () => {
    jest.setSystemTime(TUESDAY);
    process.env.CRON_SECRET = 'shh';
    wireTables();
    const response = await GET(
      cronRequest({ authorization: 'Bearer shh' })
    );
    expect(response.status).toBe(200);
  });

  it('rejects a forged x-vercel-cron marker', async () => {
    jest.setSystemTime(TUESDAY);
    expect((await GET(cronRequest({ 'x-vercel-cron': '1' }))).status).toBe(401);
  });
});

describe('GET /api/analyst/cron — fan-out gating', () => {
  it('daily: prunes run_events and reports the count', async () => {
    jest.setSystemTime(TUESDAY);
    wireTables();
    const body = await (await GET(cronRequest())).json();
    expect(mockRpc).toHaveBeenCalledWith('prune_run_events', { p_days: 90 });
    expect(body.pruned).toBe(42);
    expect(body.digests).toBeUndefined(); // not Monday
    expect(body.season).toBeUndefined(); // no ended season
  });

  it('pre-025: prune RPC missing → live: false, nothing else runs', async () => {
    jest.setSystemTime(MONDAY);
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no rpc' } });
    wireTables();
    const body = await (await GET(cronRequest())).json();
    expect(body.live).toBe(false);
    expect(mockGenerateWeeklyDigest).not.toHaveBeenCalled();
  });

  it('Monday: digests only for players with ≥3 earning runs', async () => {
    jest.setSystemTime(MONDAY);
    wireTables();
    const body = await (await GET(cronRequest())).json();
    expect(body.digests.weekStart).toBe('2026-07-06');
    expect(body.digests.eligible).toBe(1); // p1 only (p2 has 2 runs)
    expect(mockGenerateWeeklyDigest).toHaveBeenCalledTimes(1);
    expect(mockGenerateWeeklyDigest).toHaveBeenCalledWith(expect.anything(), {
      playerId: 'p1',
      weekStart: '2026-07-06',
    });
    expect(body.digests.generated).toBe(1);
  });

  /**
   * WP-1.09 retired the LLM-narrated digest email (Constitution §7.6). This
   * cron writes in-app insight cards and nothing else: it reads no opt-in
   * column, resolves no address, and reports no `emailed` count. The
   * deterministic replacement lives at GET /api/ops/settlement-dispatch.
   */
  it('Monday: writes digests and sends no email at all', async () => {
    jest.setSystemTime(MONDAY);
    wireTables({ optedIn: ['p1'] });
    const body = await (await GET(cronRequest())).json();

    expect(body.digests.generated).toBe(1);
    expect(body.digests.emailed).toBeUndefined();
    // No address is ever resolved, so no address can ever be mailed here.
    expect(mockGetUserById).not.toHaveBeenCalled();
    // The opt-in column is not this route's business any more.
    const tablesRead = mockFrom.mock.calls.map((call) => call[0]);
    expect(tablesRead).not.toContain('player_settings');
  });

  it('Monday: the budget breaker stops the batch', async () => {
    jest.setSystemTime(MONDAY);
    wireTables();
    mockBudgetRemaining.mockResolvedValue(0);
    const body = await (await GET(cronRequest())).json();
    expect(body.digests.budgetStopped).toBe(true);
    expect(mockGenerateWeeklyDigest).not.toHaveBeenCalled();
  });

  it('post-season week: archetypes + Recalls for ≥3-run players', async () => {
    jest.setSystemTime(TUESDAY); // not Monday — season branch is day-independent
    mockLatestEndedSeason.mockResolvedValue({
      id: 'season-1', seq: 1, name: 'Solstice',
      startsOn: '2026-05-25', endsOn: '2026-07-13', // ended yesterday
    });
    wireTables();
    const body = await (await GET(cronRequest())).json();
    expect(body.season.seasonSeq).toBe(1);
    expect(body.season.eligible).toBe(1);
    expect(mockGenerateArchetype).toHaveBeenCalledTimes(1);
    expect(mockGenerateSeasonRecall).toHaveBeenCalledTimes(1);
    expect(body.season.archetypes).toBe(1);
    expect(body.season.badges).toBe(1);
    expect(body.season.recalls).toBe(1);
  });

  it('a season that ended more than a week ago is left alone', async () => {
    jest.setSystemTime(TUESDAY);
    mockLatestEndedSeason.mockResolvedValue({
      id: 'season-0', seq: 0, name: null,
      startsOn: '2026-03-01', endsOn: '2026-07-01', // 13 days before
    });
    wireTables();
    const body = await (await GET(cronRequest())).json();
    expect(body.season).toBeUndefined();
    expect(mockGenerateArchetype).not.toHaveBeenCalled();
  });

  it('Hatchling results grant no badge in the count', async () => {
    jest.setSystemTime(TUESDAY);
    mockLatestEndedSeason.mockResolvedValue({
      id: 'season-1', seq: 1, name: 'Solstice',
      startsOn: '2026-05-25', endsOn: '2026-07-13',
    });
    mockGenerateArchetype.mockResolvedValue({
      live: true, cached: false, source: 'fallback', archetype: 'hatchling',
      insight: { content: { headline: 'The Hatchling', body: 'b', tips: [] } },
    });
    wireTables();
    const body = await (await GET(cronRequest())).json();
    expect(body.season.archetypes).toBe(1);
    expect(body.season.badges).toBe(0);
  });
});
