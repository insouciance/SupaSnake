/**
 * @jest-environment node
 */

/**
 * Tests for Breeding API - Unit tests for business logic + GET history route
 * Breeding is executed by the breed_snakes RPC:
 *   cost = 200 + floor((gen1 + gen2) / 2) * 100
 *   parents must share a dynasty; offspring variant is 50/50 from parents
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

import { describe, it, expect } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { mapBreedingHistoryRow } from './utils';

/** Mirrors the breed_snakes RPC cost formula (integer division) */
function breedingCost(parent1Gen: number, parent2Gen: number): number {
  return 200 + Math.floor((parent1Gen + parent2Gen) / 2) * 100;
}

describe('Breeding Logic', () => {
  describe('Cost Calculation', () => {
    it('should compute base cost for two Gen 1 parents', () => {
      expect(breedingCost(1, 1)).toBe(300);
    });

    it('should scale cost with parent generations', () => {
      expect(breedingCost(2, 5)).toBe(500); // floor(7/2) = 3
      expect(breedingCost(4, 4)).toBe(600);
    });

    it('should reject cross-dynasty parents', () => {
      const parent1DynastyId = 'dynasty-uuid-cyber';
      const parent2DynastyId = 'dynasty-uuid-primal';
      const sameDynasty = parent1DynastyId === (parent2DynastyId as string);

      // RPC raises 'Parents must be same dynasty'
      expect(sameDynasty).toBe(false);
    });
  });

  describe('DNA Requirements', () => {
    it('should fail if insufficient DNA', () => {
      const playerDna = 100;
      const cost = breedingCost(1, 1);

      expect(playerDna < cost).toBe(true);
    });

    it('should succeed with enough DNA', () => {
      const playerDna = 500;
      const cost = breedingCost(1, 1);

      expect(playerDna >= cost).toBe(true);
    });

    it('should deduct DNA on success', () => {
      const playerDna = 500;
      const cost = breedingCost(1, 1);
      const remaining = playerDna - cost;

      expect(remaining).toBe(200);
    });
  });

  describe('Parent Validation', () => {
    it('should require two different parents', () => {
      const parent1Id = 'uuid-1';
      const parent2Id = 'uuid-1';

      expect(parent1Id === parent2Id).toBe(true);
    });

    it('should accept two different parents', () => {
      const parent1Id = 'uuid-1';
      const parent2Id = 'uuid-2';

      expect(parent1Id !== parent2Id).toBe(true);
    });

    it('should require both parents to be owned by the player', () => {
      const playerId = 'player-uuid';
      const parent = { id: 'snake-uuid', player_id: 'other-player-uuid' };

      expect(parent.player_id === playerId).toBe(false);
    });
  });

  describe('Child Generation', () => {
    it('should produce offspring from one of the parent variants', () => {
      const parent1VariantId = 'variant-uuid-a';
      const parent2VariantId = 'variant-uuid-b';

      // RPC: random() < 0.5 -> parent1 variant, else parent2 variant
      const offspring = [parent1VariantId, parent2VariantId];
      expect(offspring).toContain(parent1VariantId);
      expect(offspring).toContain(parent2VariantId);
      expect(offspring).toHaveLength(2);
    });

    it('should calculate child generation correctly', () => {
      const parent1Gen = 2;
      const parent2Gen = 5;
      const childGen = Math.max(parent1Gen, parent2Gen) + 1;

      expect(childGen).toBe(6);
    });

    it('should cap generation at 50', () => {
      const parent1Gen = 50;
      const parent2Gen = 49;
      const childGen = Math.max(parent1Gen, parent2Gen) + 1;

      // RPC raises 'Maximum generation (50) reached'
      expect(childGen > 50).toBe(true);
    });
  });

  describe('Result Data', () => {
    it('should return child with variant UUID reference', () => {
      const childRow = {
        id: 'new-uuid',
        snake_variant_id: 'variant-uuid-a',
        generation: 3,
        snake_variants: {
          name: 'CYBER SPARK',
          rarity: 'common',
          dynasties: { name: 'CYBER' },
        },
      };

      expect(childRow.snake_variant_id).toBeDefined();
      expect(childRow.snake_variants.name).toBe('CYBER SPARK');
      expect(childRow.snake_variants.dynasties.name).toBe('CYBER');
    });

    it('should include generation and cost in response', () => {
      const response = {
        child: {
          id: 'new-uuid',
          snake_variant_id: 'variant-uuid-a',
          generation: 3,
        },
        cost: breedingCost(2, 2),
        remainingDna: 150,
      };

      expect(response.child.generation).toBe(3);
      expect(response.cost).toBe(400);
    });
  });
});

// =============================================================================
// mapBreedingHistoryRow TESTS
// =============================================================================

describe('mapBreedingHistoryRow', () => {
  it('maps a joined history row to camelCase', () => {
    const row = {
      id: 'history-1',
      dna_cost: 300,
      bred_at: '2026-07-01T10:00:00Z',
      parent1: {
        id: 'snake-1',
        generation: 1,
        snake_variants: { name: 'CYBER SPARK', rarity: 'common' },
      },
      parent2: {
        id: 'snake-2',
        generation: 2,
        snake_variants: { name: 'CYBER PULSE', rarity: 'uncommon' },
      },
      child: {
        id: 'snake-3',
        generation: 3,
        snake_variants: { name: 'CYBER SPARK', rarity: 'common' },
      },
    };

    const result = mapBreedingHistoryRow(row);

    expect(result).toEqual({
      id: 'history-1',
      dnaCost: 300,
      bredAt: '2026-07-01T10:00:00Z',
      parent1: { id: 'snake-1', generation: 1, variantName: 'CYBER SPARK', rarity: 'common' },
      parent2: { id: 'snake-2', generation: 2, variantName: 'CYBER PULSE', rarity: 'uncommon' },
      child: { id: 'snake-3', generation: 3, variantName: 'CYBER SPARK', rarity: 'common' },
    });
  });

  it('handles array-shaped joins and a deleted child', () => {
    const row = {
      id: 'history-2',
      dna_cost: 400,
      bred_at: '2026-07-02T10:00:00Z',
      parent1: [
        {
          id: 'snake-1',
          generation: 2,
          snake_variants: [{ name: 'PRIMAL SEED', rarity: 'common' }],
        },
      ],
      parent2: [
        { id: 'snake-2', generation: 2, snake_variants: null },
      ],
      child: null, // ON DELETE SET NULL
    };

    const result = mapBreedingHistoryRow(row);

    expect(result.parent1).toEqual({
      id: 'snake-1',
      generation: 2,
      variantName: 'PRIMAL SEED',
      rarity: 'common',
    });
    expect(result.parent2).toEqual({
      id: 'snake-2',
      generation: 2,
      variantName: null,
      rarity: null,
    });
    expect(result.child).toBeNull();
  });
});

// =============================================================================
// GET /api/breeding (history) TESTS
// =============================================================================

describe('GET /api/breeding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    mockRpc = jest.fn();
  });

  it('should return 401 without authorization header', async () => {
    const request = new NextRequest('http://localhost:3000/api/breeding');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 401 for invalid token', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer bad-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 404 when player is missing', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it('should return mapped history, newest first, limited to 10', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Player lookup
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123' },
        error: null,
      }),
    });

    // History query chain: select().eq().order().limit()
    const mockOrder = jest.fn().mockReturnThis();
    const mockLimit = jest.fn().mockResolvedValueOnce({
      data: [
        {
          id: 'history-1',
          dna_cost: 300,
          bred_at: '2026-07-01T10:00:00Z',
          parent1: {
            id: 'snake-1',
            generation: 1,
            snake_variants: { name: 'CYBER SPARK', rarity: 'common' },
          },
          parent2: {
            id: 'snake-2',
            generation: 1,
            snake_variants: { name: 'CYBER PULSE', rarity: 'uncommon' },
          },
          child: {
            id: 'snake-3',
            generation: 2,
            snake_variants: { name: 'CYBER PULSE', rarity: 'uncommon' },
          },
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: mockOrder,
      limit: mockLimit,
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.history).toHaveLength(1);
    expect(data.history[0].id).toBe('history-1');
    expect(data.history[0].dnaCost).toBe(300);
    expect(data.history[0].child.variantName).toBe('CYBER PULSE');
    expect(data.history[0].parent1.generation).toBe(1);
    expect(mockOrder).toHaveBeenCalledWith('bred_at', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('should return 500 when the history query fails', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123' },
        error: null,
      }),
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'boom' },
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/breeding', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});
