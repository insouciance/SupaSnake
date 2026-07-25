/** @jest-environment node */

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

import { NextRequest } from 'next/server';
import { POST } from './route';

function query(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

describe('POST /api/breeding/lineage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    mockRpc = jest.fn();
  });

  it('requires authentication', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/breeding/lineage', {
        method: 'POST',
        body: JSON.stringify({ action: 'reroll', snake_id: 'snake-1' }),
      })
    );
    expect(response.status).toBe(401);
  });

  // WP-1.05: the previous test here asserted a successful 150-DNA reroll.
  // §8.2 retires it, so the test is rewritten to assert the retirement -
  // a named 410 and, crucially, NO RPC call and NO DNA spent.
  it('refuses the retired reroll without touching the RPC or the balance', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockFrom.mockReturnValue(
      query({ data: { id: 'player-1', dna: 500 }, error: null })
    );

    const response = await POST(
      new NextRequest('http://localhost/api/breeding/lineage', {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ action: 'reroll', snake_id: 'snake-1' }),
      })
    );
    expect(response.status).toBe(410);
    expect(mockRpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('retired'),
    });
  });

  it('validates and persists a dual-lineage primary', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockFrom.mockReturnValueOnce(
      query({ data: { id: 'player-1', dna: 500 }, error: null })
    );
    mockRpc.mockResolvedValue({
      data: { strains: ['VOLT', 'FERAL'], strength: 1, primary: 'FERAL' },
      error: null,
    });

    const response = await POST(
      new NextRequest('http://localhost/api/breeding/lineage', {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({
          action: 'select_primary',
          snake_id: 'snake-1',
          primary: 'FERAL',
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('set_lineage_primary', {
      p_player_id: 'player-1',
      p_snake_id: 'snake-1',
      p_primary: 'FERAL',
    });
  });

  it('rejects an invalid primary before calling the RPC', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const response = await POST(
      new NextRequest('http://localhost/api/breeding/lineage', {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({
          action: 'select_primary',
          snake_id: 'snake-1',
          primary: 'NOPE',
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
