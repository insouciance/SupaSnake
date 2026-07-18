/**
 * @jest-environment node
 */

/**
 * Tests for POST /api/breeding/reroll (Design v2 Phase 3A, section 6.3):
 * auth, input validation, RPC passthrough, and the token counter in the
 * response. The reroll_trait RPC itself owns ownership/slot/pool/token
 * validation atomically.
 */

// Mock Supabase - must be before imports due to jest.mock hoisting

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

import { describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST } from './route';

function makeRequest(body: unknown, token = 'valid-token'): NextRequest {
  return new NextRequest('http://localhost:3000/api/breeding/reroll', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function mockAuthedPlayer(): void {
  mockAuth.mockResolvedValueOnce({
    data: { user: { id: 'user-123' } },
    error: null,
  });
  // Player lookup
  mockFrom.mockReturnValueOnce({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 'player-123' }, error: null }),
  });
}

describe('POST /api/breeding/reroll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    mockRpc = jest.fn();
  });

  it('returns 401 without authorization header', async () => {
    const request = new NextRequest('http://localhost:3000/api/breeding/reroll', {
      method: 'POST',
      body: JSON.stringify({ snake_id: 's1', slot: 1 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 when snake_id is missing', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    const response = await POST(makeRequest({ slot: 1 }));
    expect(response.status).toBe(400);
  });

  it.each([[0], [-1], [1.5], ['1'], [undefined]])(
    'returns 400 for invalid slot %p',
    async (slot) => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });
      const response = await POST(makeRequest({ snake_id: 'snake-1', slot }));
      expect(response.status).toBe(400);
    }
  );

  it('calls reroll_trait with player, snake, and slot; returns new traits + tokens', async () => {
    mockAuthedPlayer();
    mockRpc.mockResolvedValueOnce({
      data: ['sprinter', 'hoarder'],
      error: null,
    });
    // Updated player read (token counter)
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123', player_reroll_tokens: 1 },
        error: null,
      }),
    });

    const response = await POST(makeRequest({ snake_id: 'snake-1', slot: 2 }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.traits).toEqual(['sprinter', 'hoarder']);
    expect(data.rerollTokens).toBe(1);
    expect(mockRpc).toHaveBeenCalledWith('reroll_trait', {
      p_player_id: 'player-123',
      p_snake_id: 'snake-1',
      p_slot: 2,
    });
  });

  it('sanitizes unexpected RPC trait ids out of the response', async () => {
    mockAuthedPlayer();
    mockRpc.mockResolvedValueOnce({
      data: ['sprinter', 'mystery_trait'],
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123', player_reroll_tokens: 0 },
        error: null,
      }),
    });

    const response = await POST(makeRequest({ snake_id: 'snake-1', slot: 1 }));
    const data = await response.json();
    expect(data.traits).toEqual(['sprinter']);
  });

  it('surfaces RPC errors as 400 with the message (token not spent server-side)', async () => {
    mockAuthedPlayer();
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'No reroll tokens available' },
    });

    const response = await POST(makeRequest({ snake_id: 'snake-1', slot: 1 }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('No reroll tokens available');
  });

  it('defaults rerollTokens to 0 pre-migration-018 (column absent)', async () => {
    mockAuthedPlayer();
    mockRpc.mockResolvedValueOnce({ data: ['sprinter'], error: null });
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn()
        .mockResolvedValueOnce({ data: { id: 'player-123' }, error: null }),
    });

    const response = await POST(makeRequest({ snake_id: 'snake-1', slot: 1 }));
    const data = await response.json();
    expect(data.rerollTokens).toBe(0);
  });
});
