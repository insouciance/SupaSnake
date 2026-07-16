/**
 * @jest-environment node
 */

/**
 * Collection API Tests
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

import { GET, POST } from './route';
import { mapOwnedSnakeRow, getPlayerId } from './utils';
import { NextRequest } from 'next/server';

// =============================================================================
// mapOwnedSnakeRow TESTS
// =============================================================================

describe('mapOwnedSnakeRow', () => {
  it('should convert snake_case to camelCase', () => {
    const row = {
      id: 'uuid-123',
      player_id: 'player-uuid',
      variant_id: 'CYBER SPARK',
      snake_variant_id: 'variant-uuid',
      generation: 1,
      parent1_id: null,
      parent2_id: null,
      acquired_at: '2025-01-22T00:00:00Z',
      acquired_method: 'tutorial',
      is_equipped: true,
      is_favorited: false,
    };

    const result = mapOwnedSnakeRow(row);

    expect(result.id).toBe('uuid-123');
    expect(result.playerId).toBe('player-uuid');
    expect(result.variantId).toBe('CYBER SPARK');
    expect(result.snakeVariantId).toBe('variant-uuid');
    expect(result.generation).toBe(1);
    expect(result.parent1Id).toBeNull();
    expect(result.parent2Id).toBeNull();
    expect(result.acquiredAt).toBe('2025-01-22T00:00:00Z');
    expect(result.acquiredMethod).toBe('tutorial');
    expect(result.isEquipped).toBe(true);
    expect(result.isFavorited).toBe(false);
  });

  it('should handle bred snake with parents', () => {
    const row = {
      id: 'uuid-123',
      player_id: 'player-uuid',
      variant_id: 'CYBER PULSE',
      snake_variant_id: 'variant-uuid',
      generation: 2,
      parent1_id: 'parent1-uuid',
      parent2_id: 'parent2-uuid',
      acquired_at: '2025-01-22T00:00:00Z',
      acquired_method: 'bred',
      is_equipped: false,
      is_favorited: true,
    };

    const result = mapOwnedSnakeRow(row);

    expect(result.generation).toBe(2);
    expect(result.parent1Id).toBe('parent1-uuid');
    expect(result.parent2Id).toBe('parent2-uuid');
    expect(result.acquiredMethod).toBe('bred');
    expect(result.isFavorited).toBe(true);
  });
});

// =============================================================================
// getPlayerId TESTS
// =============================================================================

describe('getPlayerId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    mockRpc = jest.fn();
  });

  it('should return player ID for valid user', async () => {
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123' },
        error: null,
      }),
    });

    const result = await getPlayerId('user-123');
    expect(result).toBe('player-123');
  });

  it('should return null for non-existent user', async () => {
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      }),
    });

    const result = await getPlayerId('non-existent-user');
    expect(result).toBeNull();
  });
});

// =============================================================================
// GET /api/collection TESTS
// =============================================================================

describe('GET /api/collection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    mockRpc = jest.fn();
  });

  it('should return 401 without authorization header', async () => {
    const request = new NextRequest('http://localhost:3000/api/collection');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return player collection', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Mock player lookup
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123' },
        error: null,
      }),
    });

    // Mock collection lookup
    const mockSnakes = [
      {
        id: '1',
        variant_id: 'CYBER SPARK',
        generation: 1,
        is_equipped: true,
      },
    ];

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValueOnce({
        data: mockSnakes,
        error: null,
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/collection', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.snakes).toHaveLength(1);
  });
});

// =============================================================================
// POST /api/collection (unlock) TESTS
// =============================================================================

describe('POST /api/collection (unlock)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    mockRpc = jest.fn();
  });

  it('should return 401 without authorization', async () => {
    const request = new NextRequest('http://localhost:3000/api/collection', {
      method: 'POST',
      body: JSON.stringify({ variantId: 'variant-uuid' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should return 400 without variantId', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Mock player lookup
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123', dna: 1000 },
        error: null,
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/collection', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('should call unlock_variant RPC for valid request', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Mock player lookup
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123', dna: 1000 },
        error: null,
      }),
    });

    // Mock RPC call
    mockRpc.mockResolvedValueOnce({
      data: 'new-snake-uuid',
      error: null,
    });

    // Mock fetch new snake
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'new-snake-uuid', variant_id: 'CYBER PULSE' },
        error: null,
      }),
    });

    // Mock fetch new DNA balance
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { dna: 500 },
        error: null,
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/collection', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ variantId: 'variant-uuid' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('unlock_variant', {
      p_player_id: 'player-123',
      p_variant_id: 'variant-uuid',
    });
  });
});
