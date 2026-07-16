/**
 * @jest-environment node
 */

/**
 * Collection API Utils Tests
 */

// Mock Supabase - must be before imports due to jest.mock hoisting
 
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { mapOwnedSnakeRow, getPlayerId } from './utils';

// =============================================================================
// mapOwnedSnakeRow TESTS
// =============================================================================

describe('mapOwnedSnakeRow', () => {
  it('should convert snake_case to camelCase', () => {
    const row = {
      id: 'uuid-123',
      player_id: 'player-uuid',
      snake_variant_id: 'variant-uuid',
      snake_variants: { name: 'CYBER SPARK', dynasties: { name: 'CYBER' } },
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
    expect(result.variantName).toBe('CYBER SPARK');
    expect(result.dynastyName).toBe('CYBER');
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
      snake_variant_id: 'variant-uuid',
      snake_variants: { name: 'CYBER PULSE', dynasties: { name: 'CYBER' } },
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
    mockFrom = jest.fn();
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
