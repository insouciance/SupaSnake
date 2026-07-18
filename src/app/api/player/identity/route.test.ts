/**
 * @jest-environment node
 */

/**
 * Own-identity API tests (Player Identity v1 section 4) - Supabase
 * mocked. Maps the view row + inventory + loadout, merges the
 * owned-by-default banner, and degrades to { live: false } with the
 * derived handler-NNNN identity pre-022.
 */

var mockAuth: jest.Mock;

var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

const PLAYER_ID = '00000000-0000-0000-0000-000000000417';

const VIEW_ROW = {
  player_id: PLAYER_ID,
  user_id: 'user-1',
  handle: 'Souci',
  display_handle: 'Souci',
  is_generated_name: false,
  is_founder: true,
  title_id: 'solstice_sovereign',
  title: 'Solstice Sovereign',
  banner_id: 'solstice_banner',
  banner_render: { kind: 'gradient', from: '#7c2d12', to: '#facc15' },
  badges: [{ id: 'badge_founder', name: 'Founding Handler', rarity: 'legendary', position: 1 }],
  avatar_variant_id: 'variant-1',
  avatar_variant_name: 'PRIMAL WARDEN',
  avatar_rarity: 'rare',
  avatar_dynasty: 'PRIMAL',
  avatar_generation: 8,
  clan_tag: 'FANG',
  clan_name: 'Fang Dynasty',
  mastery: { PRIMAL: 7, CYBER: 2 },
};

function mockDatabase(options: {
  inventory?: unknown[] | null;
  inventoryError?: { code?: string; message: string };
  viewRow?: unknown;
} = {}) {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: PLAYER_ID }, error: null }),
          }),
        }),
      };
    }
    if (table === 'player_cosmetics') {
      return {
        select: () => ({
          eq: async () => ({
            data: options.inventoryError ? null : (options.inventory ?? []),
            error: options.inventoryError ?? null,
          }),
        }),
      };
    }
    if (table === 'cosmetic_definitions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'banner_hatchery_standard',
                name: 'Hatchery Standard',
                slot: 'banner',
                rarity: 'common',
                dynasty: null,
                season_seq: null,
                render: { kind: 'gradient', from: '#131a2a', to: '#0b0b12' },
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'player_loadout') {
      return {
        select: () => ({
          eq: async () => ({
            data: [{ slot: 'title', position: 1, cosmetic_id: 'solstice_sovereign' }],
            error: null,
          }),
        }),
      };
    }
    if (table === 'player_identity_view') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.viewRow ?? VIEW_ROW,
              error: null,
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

function getRequest() {
  return new NextRequest('http://localhost:3000/api/player/identity', {
    headers: { authorization: 'Bearer valid-token' },
  });
}

beforeEach(() => {
  mockAuth = jest.fn();
  mockFrom = jest.fn();
});

describe('GET /api/player/identity', () => {
  it('401 without a token', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/player/identity'));
    expect(response.status).toBe(401);
  });

  it('maps the identity view row into the card shape', async () => {
    mockDatabase();
    const body = await (await GET(getRequest())).json();
    expect(body.live).toBe(true);
    expect(body.identity).toMatchObject({
      playerId: PLAYER_ID,
      handle: 'Souci',
      displayHandle: 'Souci',
      isGenerated: false,
      isFounder: true,
      title: 'Solstice Sovereign',
      clanTag: 'FANG',
      mastery: { PRIMAL: 7, CYBER: 2 },
      avatar: {
        variantId: 'variant-1',
        variantName: 'PRIMAL WARDEN',
        rarity: 'rare',
        dynasty: 'PRIMAL',
        generation: 8,
      },
      badges: [
        { id: 'badge_founder', name: 'Founding Handler', rarity: 'legendary', position: 1 },
      ],
    });
    expect(body.loadout).toEqual([
      { slot: 'title', position: 1, cosmetic_id: 'solstice_sovereign' },
    ]);
  });

  it('merges the owned-by-default Hatchery Standard banner into the inventory', async () => {
    mockDatabase({
      inventory: [
        {
          cosmetic_id: 'solstice_badge',
          acquired_at: '2026-07-21T00:00:00Z',
          source: 'season_track',
          cosmetic_definitions: {
            id: 'solstice_badge',
            name: 'Solstice Badge',
            slot: 'badge',
            rarity: 'rare',
            dynasty: null,
            season_seq: 1,
            render: null,
          },
        },
      ],
    });
    const body = await (await GET(getRequest())).json();
    const ids = body.inventory.map((item: { id: string }) => item.id);
    expect(ids).toContain('solstice_badge');
    expect(ids).toContain('banner_hatchery_standard');
  });

  it('degrades to { live: false } + derived handler-NNNN identity pre-022', async () => {
    mockDatabase({
      inventoryError: {
        code: '42P01',
        message: 'relation "player_cosmetics" does not exist',
      },
    });
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.live).toBe(false);
    // ...0417 hex = 1047
    expect(body.identity).toMatchObject({
      displayHandle: 'handler-1047',
      isGenerated: true,
    });
    expect(body.inventory).toEqual([]);
  });
});
