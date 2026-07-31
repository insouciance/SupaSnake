import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('@/shared/game/clanEnergyBattle', () => ({
  energyBattleCycleAt: () => ({
    index: 4,
    startsAt: '2026-08-12T00:00:00.000Z',
    endsAt: '2026-08-15T00:00:00.000Z',
    intermissionEndsAt: '2026-08-16T00:00:00.000Z',
    phase: 'active',
  }),
}));

import { GET } from './route';

interface Fixture {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function query(fixture: Fixture) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  for (const op of ['select', 'eq', 'neq', 'order', 'limit']) chain[op] = passthrough;
  chain.single = () => Promise.resolve(fixture);
  chain.maybeSingle = () => Promise.resolve(fixture);
  const promise = Promise.resolve(fixture);
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);
  chain.finally = promise.finally.bind(promise);
  return chain;
}

function installTables(fixtures: Record<string, Fixture[]>) {
  const queues = Object.fromEntries(
    Object.entries(fixtures).map(([table, rows]) => [table, [...rows]])
  );
  mockFrom.mockImplementation((table: string) => {
    const fixture = queues[table]?.shift();
    if (!fixture) throw new Error(`No ${table} fixture left`);
    return query(fixture);
  });
}

function request(authenticated = true) {
  return new NextRequest('https://supasnake.com/api/clan/energy-battle', {
    headers: authenticated ? { Authorization: 'Bearer token' } : {},
  });
}

describe('GET /api/clan/energy-battle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('requires authentication', async () => {
    const response = await GET(request(false));
    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('reports no clan without exposing a battle surface', async () => {
    installTables({
      players: [{ data: { id: 'player-1' }, error: null }],
      clan_energy_battle_reward_ledger: [{ data: [], error: null }],
      clan_glory_reward_ledger: [{ data: [], error: null }],
      clan_members: [{ data: null, error: null }],
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      active: false,
      reason: 'no_clan',
      cycle: { index: 4, phase: 'active' },
    });
  });

  it('marks a member eligible before their clan has created a side', async () => {
    installTables({
      players: [{ data: { id: 'player-1' }, error: null }],
      clan_energy_battle_reward_ledger: [{ data: [], error: null }],
      clan_glory_reward_ledger: [{ data: [], error: null }],
      clan_members: [
        {
          data: { clan_id: 'clan-1', clans: { id: 'clan-1', name: 'Coilers', tag: 'COIL' } },
          error: null,
        },
      ],
      clan_energy_cycle_memberships: [{ data: null, error: null }],
      clan_energy_battle_sides: [{ data: null, error: null }],
      clan_energy_honors: [{ data: [], error: null }],
    });

    const response = await GET(request());
    const body = await response.json();
    expect(body).toMatchObject({
      live: true,
      active: true,
      eligible: true,
      battle: null,
      clan: { id: 'clan-1', name: 'Coilers' },
      team: { score: 0, outcome: 'pending' },
      you: { topFive: [], fifthBest: 0, scoreToImprove: 0, contribution: 0 },
    });
  });

  it('keeps a clan switch locked to the original side and returns only the viewer’s attempts', async () => {
    const battle = {
      starts_at: '2026-08-12T00:00:00.000Z',
      ends_at: '2026-08-15T00:00:00.000Z',
      intermission_ends_at: '2026-08-16T00:00:00.000Z',
      settled_at: null,
    };
    installTables({
      players: [{ data: { id: 'player-1' }, error: null }],
      clan_energy_battle_reward_ledger: [
        {
          data: [
            {
              id: 'reward-1',
              battle_id: 'battle-0',
              clan_id: 'clan-old',
              cycle_index: 3,
              reward_kind: 'victor',
              outcome: 'victor',
              participation_amount: 100,
              bonus_amount: 100,
              amount: 200,
              counted_depth: 4200,
              eligible_run_count: 6,
              counted_run_count: 5,
              awarded_at: '2026-08-11T01:00:00.000Z',
              clans: { id: 'clan-old', name: 'Old Clan', tag: 'OLD' },
            },
          ],
          error: null,
        },
      ],
      clan_glory_reward_ledger: [
        {
          data: [
            {
              id: 'glory-1',
              battle_id: 'battle-0',
              clan_id: 'clan-old',
              cycle_index: 3,
              seat: 1,
              amount: 250,
              eligible_depth: 4200,
              eligible_contribution_count: 5,
              awarded_at: '2026-08-11T02:00:00.000Z',
              clans: { id: 'clan-old', name: 'Old Clan', tag: 'OLD' },
            },
          ],
          error: null,
        },
      ],
      clan_members: [
        {
          data: { clan_id: 'clan-new', clans: { id: 'clan-new', name: 'New Clan', tag: 'NEW' } },
          error: null,
        },
      ],
      clan_energy_cycle_memberships: [{ data: { clan_id: 'clan-old' }, error: null }],
      clan_energy_battle_sides: [
        {
          data: {
            id: 'side-1',
            battle_id: 'battle-1',
            score: 2100,
            outcome: 'pending',
            clans: { id: 'clan-old', name: 'Old Clan', tag: 'OLD' },
            clan_energy_battles: battle,
          },
          error: null,
        },
        {
          data: {
            score: 1900,
            outcome: 'pending',
            clans: { id: 'clan-rival', name: 'Rivals', tag: 'RIV' },
          },
          error: null,
        },
      ],
      clan_energy_contributions: [
        {
          data: [
            {
              session_id: 'session-1',
              score: 700,
              energy_committed: 2,
              commitment_multiplier_bps: 22000,
              snake_generation: 7,
              contribution_rank: 1,
              completed_at: '2026-08-12T01:00:00.000Z',
            },
          ],
          error: null,
        },
      ],
      clan_energy_honors: [{ data: [{ honor: 'victor' }], error: null }],
    });

    const response = await GET(request());
    const body = await response.json();
    expect(body).toMatchObject({
      active: true,
      eligible: false,
      reason: 'cycle_locked_to_previous_clan',
      clan: { id: 'clan-old' },
      opponent: { clan: { id: 'clan-rival' }, score: 1900 },
      you: {
        topFive: [{ sessionId: 'session-1', score: 700, energyCommitted: 2, generation: 7 }],
        contribution: 700,
      },
      honors: { total: 1, victories: 1 },
      rewardHistory: [
        { id: 'glory-1', type: 'glory', amount: 250, artifactRef: 'glory-reward:glory-1' },
        {
          id: 'reward-1',
          type: 'battle',
          amount: 200,
          participationDna: 100,
          bonusDna: 100,
          artifactRef: 'battle-reward:reward-1',
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('clan-new');
  });

  it('reports unexpected database failures', async () => {
    installTables({
      players: [
        { data: null, error: { code: '08006', message: 'connection failure' } },
      ],
    });

    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
