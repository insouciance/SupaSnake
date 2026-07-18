/**
 * @jest-environment node
 */

/**
 * Equip API tests (Player Identity v1 sections 5.1 + 6.5) - Supabase
 * mocked. Maps the equip_cosmetic result codes (ownership, slot
 * mismatch, badge duplicates, unequip) and 503s pre-022.
 */

var mockAuth: jest.Mock;

var mockFrom: jest.Mock;

var mockRpc: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

const PLAYER_ID = 'player-1';

function authedPlayer() {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { id: PLAYER_ID }, error: null }),
      }),
    }),
  }));
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/player/cosmetics/equip', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockAuth = jest.fn();
  mockFrom = jest.fn();
  mockRpc = jest.fn();
});

describe('POST /api/player/cosmetics/equip', () => {
  it('401 without a token', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/player/cosmetics/equip', {
        method: 'POST',
        body: '{}',
      })
    );
    expect(response.status).toBe(401);
  });

  it('400s an unknown slot before calling the RPC', async () => {
    authedPlayer();
    const response = await POST(postRequest({ slot: 'hat', cosmeticId: 'x' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('equips an owned cosmetic (position defaults to 1)', async () => {
    authedPlayer();
    mockRpc.mockResolvedValue({
      data: { success: true, equipped: 'solstice_trail_1' },
      error: null,
    });
    const response = await POST(
      postRequest({ slot: 'trail', cosmeticId: 'solstice_trail_1' })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, equipped: 'solstice_trail_1' });
    expect(mockRpc).toHaveBeenCalledWith('equip_cosmetic', {
      p_player_id: PLAYER_ID,
      p_slot: 'trail',
      p_position: 1,
      p_cosmetic_id: 'solstice_trail_1',
    });
  });

  it('unequips with a null cosmetic', async () => {
    authedPlayer();
    mockRpc.mockResolvedValue({ data: { success: true, equipped: null }, error: null });
    const response = await POST(
      postRequest({ slot: 'badge', position: 2, cosmeticId: null })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, equipped: null });
    expect(mockRpc).toHaveBeenCalledWith('equip_cosmetic', {
      p_player_id: PLAYER_ID,
      p_slot: 'badge',
      p_position: 2,
      p_cosmetic_id: null,
    });
  });

  it('maps not_owned to 409 (server-side ownership authority)', async () => {
    authedPlayer();
    mockRpc.mockResolvedValue({ data: { error: 'not_owned' }, error: null });
    const response = await POST(
      postRequest({ slot: 'title', cosmeticId: 'title_primal_sovereign' })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'not_owned' });
  });

  it('maps slot_mismatch to 409 (a trail cannot be worn as a title)', async () => {
    authedPlayer();
    mockRpc.mockResolvedValue({ data: { error: 'slot_mismatch' }, error: null });
    const response = await POST(
      postRequest({ slot: 'title', cosmeticId: 'solstice_trail_1' })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'slot_mismatch' });
  });

  it('maps already_equipped to 409 (3 DIFFERENT badges)', async () => {
    authedPlayer();
    mockRpc.mockResolvedValue({ data: { error: 'already_equipped' }, error: null });
    const response = await POST(
      postRequest({ slot: 'badge', position: 2, cosmeticId: 'solstice_badge' })
    );
    expect(response.status).toBe(409);
  });

  it('503s (never 500s) while equip_cosmetic does not exist yet', async () => {
    authedPlayer();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function equip_cosmetic' },
    });
    const response = await POST(
      postRequest({ slot: 'trail', cosmeticId: 'solstice_trail_1' })
    );
    expect(response.status).toBe(503);
  });
});
