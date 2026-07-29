import { NextRequest } from 'next/server';
import { GET } from './route';

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockCreateClient = jest.fn(() => ({
  auth: { getUser: mockGetUser },
  from: mockFrom,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

interface QueryResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function createQueryBuilder(result: QueryResult) {
  const builder: Record<string, jest.Mock | unknown> = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.order = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.single = jest.fn().mockResolvedValue(result);
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason?: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/user/export-data', {
    method: 'GET',
    headers,
  });
}

const playerResult: QueryResult = {
  data: {
    id: 'player-id',
    username: 'testuser',
    dna: 100,
    energy: 5,
    max_energy: 5,
    total_games_played: 12,
    total_dna_earned: 900,
    high_score: 88,
    breeds_completed: 2,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  error: null,
};

const tableResults: Record<string, QueryResult> = {
  players: playerResult,
  collected_snakes: {
    data: [{
      id: 'snake-id',
      snake_variant_id: 'variant-id',
      generation: 2,
      parent1_id: null,
      parent2_id: null,
      acquired_at: '2026-01-02T00:00:00.000Z',
      acquired_method: 'bred',
      is_equipped: true,
      is_favorited: false,
      traits: ['scavenger'],
      lineage: { strains: ['AURUM'], strength: 1 },
      snake_variants: {
        name: 'Solar Coil',
        rarity: 'rare',
        dynasties: { name: 'CYBER' },
      },
    }],
    error: null,
  },
  game_sessions: {
    data: [{
      id: 'session-id',
      score: 88,
      dna_earned: 42,
      duration_seconds: 90,
      foods_collected: 31,
      died: false,
      victory: true,
      extracted: true,
      validated: true,
      started_at: '2026-01-03T00:00:00.000Z',
      ended_at: '2026-01-03T00:01:30.000Z',
      genome: { v: 1 },
    }],
    error: null,
  },
  purchase_history: {
    data: [{
      id: 'purchase-id',
      product_id: 'dna_pack',
      product_name: 'DNA Pack',
      price_cents: 499,
      currency: 'eur',
      status: 'completed',
      purchased_at: '2026-01-04T00:00:00.000Z',
      refunded_at: null,
    }],
    error: null,
  },
  player_achievements: {
    data: [{
      achievement_id: 'games_10',
      completed: true,
      completed_at: '2026-01-05',
      progress: 10,
    }],
    error: null,
  },
  breeding_history: {
    data: [{
      id: 'breed-1',
      parent1_id: 'parent-1',
      parent2_id: 'parent-2',
      child_id: null,
      dna_cost: 1280,
      bred_at: '2026-01-05T00:00:00.000Z',
      trait_rolls: { preview: { generation: 11 } },
      refunded_at: '2026-01-06T00:00:00.000Z',
      refunded_child_id: 'child-11',
      refund_snapshot: { child: { id: 'child-11', generation: 11 } },
    }],
    error: null,
  },
};

describe('Export Data API', () => {
  let builders: Record<string, ReturnType<typeof createQueryBuilder>>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'auth-user-id',
          email: 'test@example.com',
          created_at: '2026-01-01T00:00:00.000Z',
          last_sign_in_at: '2026-01-06T00:00:00.000Z',
        },
      },
      error: null,
    });
    builders = Object.fromEntries(
      Object.entries(tableResults).map(([table, result]) => [
        table,
        createQueryBuilder(result),
      ])
    );
    mockFrom.mockImplementation((table: string) => builders[table]);
  });

  it('returns 401 without an authorization header', async () => {
    const response = await GET(createMockRequest());
    expect(response.status).toBe(401);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('uses an authenticated RLS client and the internal player id', async () => {
    const response = await GET(createMockRequest({ Authorization: 'Bearer valid-token' }));
    expect(response.status).toBe(200);

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer valid-token' } },
      })
    );
    expect(builders.players.eq).toHaveBeenCalledWith('user_id', 'auth-user-id');
    for (const table of [
      'collected_snakes',
      'game_sessions',
      'purchase_history',
      'player_achievements',
      'breeding_history',
    ]) {
      expect(builders[table].eq).toHaveBeenCalledWith('player_id', 'player-id');
      expect(builders[table].eq).not.toHaveBeenCalledWith('player_id', 'auth-user-id');
    }
  });

  // WP-0.04: player_achievements is a frozen ledger and the export is the
  // reason it is retained, so the export has to actually work. It selected
  // `unlocked_at`, a column this table has never had (003:108-121), and a
  // failed category 500s the whole request - the entire GDPR data export
  // was broken. The earned timestamp is `completed_at`.
  it('exports the frozen achievement ledger with columns that exist', async () => {
    const response = await GET(createMockRequest({ Authorization: 'Bearer valid-token' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(builders.player_achievements.select).toHaveBeenCalledWith(
      'achievement_id, completed, completed_at, progress'
    );
    expect(builders.player_achievements.select).not.toHaveBeenCalledWith(
      expect.stringContaining('unlocked_at')
    );
    expect(data.achievements).toEqual([
      {
        achievementId: 'games_10',
        completed: true,
        completedAt: '2026-01-05',
        progress: 10,
      },
    ]);
  });

  it('exports current schema fields without payment-provider identifiers', async () => {
    const response = await GET(createMockRequest({ Authorization: 'Bearer valid-token' }));
    const data = await response.json();

    expect(data.collection.snakes[0]).toMatchObject({
      snakeVariantId: 'variant-id',
      variantName: 'Solar Coil',
      dynasty: 'CYBER',
      lineage: { strains: ['AURUM'], strength: 1 },
    });
    expect(data.purchases[0]).toMatchObject({
      productId: 'dna_pack',
      priceCents: 499,
      currency: 'eur',
    });
    expect(data.lineage.breedingHistory[0]).toMatchObject({
      id: 'breed-1',
      dnaCost: 1280,
      refundedChildId: 'child-11',
      refundSnapshot: { child: { id: 'child-11', generation: 11 } },
    });
    expect(JSON.stringify(data)).not.toContain('stripe_session');
    expect(builders.purchase_history.select).toHaveBeenCalledWith(
      expect.stringContaining('price_cents')
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toMatch(/attachment/);
  });

  it('fails closed when any export category query fails', async () => {
    builders.game_sessions = createQueryBuilder({
      data: null,
      error: { code: 'XX000', message: 'database failure' },
    });
    mockFrom.mockImplementation((table: string) => builders[table]);

    const response = await GET(createMockRequest({ Authorization: 'Bearer valid-token' }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Export failed' });
  });

  it('returns 404 when the authenticated account has no player', async () => {
    builders.players = createQueryBuilder({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });
    mockFrom.mockImplementation((table: string) => builders[table]);

    const response = await GET(createMockRequest({ Authorization: 'Bearer valid-token' }));
    expect(response.status).toBe(404);
  });
});
