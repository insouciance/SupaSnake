/**
 * @jest-environment node
 */

/**
 * Equip API Tests
 */

// Mock Supabase - must be before imports due to jest.mock hoisting
// eslint-disable-next-line no-var
var mockAuth: jest.Mock;
// eslint-disable-next-line no-var
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// Mock the utils module
jest.mock('../utils', () => ({
  mapOwnedSnakeRow: jest.fn((row) => ({
    id: row.id,
    playerId: row.player_id,
    variantId: row.variant_id,
    snakeVariantId: row.snake_variant_id,
    generation: row.generation,
    parent1Id: row.parent1_id,
    parent2Id: row.parent2_id,
    acquiredAt: row.acquired_at,
    acquiredMethod: row.acquired_method,
    isEquipped: row.is_equipped,
    isFavorited: row.is_favorited,
  })),
  getPlayerId: jest.fn(),
}));

import { POST } from './route';
import { getPlayerId } from '../utils';
import { NextRequest } from 'next/server';

const mockGetPlayerId = getPlayerId as jest.Mock;

// =============================================================================
// POST /api/collection/equip TESTS
// =============================================================================

describe('POST /api/collection/equip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
  });

  // -------------------------------------------------------------------------
  // Authentication Tests
  // -------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 without authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 with invalid token', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: { authorization: 'Bearer invalid-token' },
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid token');
    });

    it('should return 404 when player not found', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Player not found');
    });
  });

  // -------------------------------------------------------------------------
  // Validation Tests
  // -------------------------------------------------------------------------

  describe('Request Validation', () => {
    it('should return 400 for invalid JSON body', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: 'invalid-json',
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid JSON body');
    });

    it('should return 400 without snakeId', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Validation failed');
    });

    it('should return 400 for non-UUID snakeId', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snakeId: 'not-a-uuid' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Validation failed');
      expect(data.details[0].field).toBe('snakeId');
      expect(data.details[0].message).toBe('snakeId must be a valid UUID');
    });
  });

  // -------------------------------------------------------------------------
  // Ownership Tests
  // -------------------------------------------------------------------------

  describe('Snake Ownership', () => {
    it('should return 404 when snake not found in collection', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      // Mock snake lookup - not found
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Not found' },
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Snake not found in your collection');
    });

    it('should not allow equipping another player\'s snake', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      // Mock snake lookup - no result because player_id doesn't match
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Snake not found in your collection');
    });
  });

  // -------------------------------------------------------------------------
  // Success Cases
  // -------------------------------------------------------------------------

  describe('Successful Equip', () => {
    it('should equip snake and unequip previously equipped', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      // Mock snake lookup - found
      const targetSnake = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        player_id: 'player-123',
        variant_id: 'CYBER SPARK',
        snake_variant_id: 'variant-uuid',
        generation: 1,
        parent1_id: null,
        parent2_id: null,
        acquired_at: '2025-01-22T00:00:00Z',
        acquired_method: 'tutorial',
        is_equipped: false,
        is_favorited: false,
      };

      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: targetSnake,
          error: null,
        }),
      });

      // Mock unequip previous snake
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      });

      // Mock equip new snake
      const equippedSnake = { ...targetSnake, is_equipped: true };
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: equippedSnake,
          error: null,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.equippedSnake).toBeDefined();
      expect(data.equippedSnake.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(data.equippedSnake.isEquipped).toBe(true);
    });

    it('should equip snake when no snake was previously equipped', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      // Mock snake lookup
      const targetSnake = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        player_id: 'player-123',
        variant_id: 'PRIMAL SEED',
        snake_variant_id: 'variant-uuid-2',
        generation: 2,
        parent1_id: 'parent1',
        parent2_id: 'parent2',
        acquired_at: '2025-01-22T00:00:00Z',
        acquired_method: 'bred',
        is_equipped: false,
        is_favorited: true,
      };

      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: targetSnake,
          error: null,
        }),
      });

      // Mock unequip (no rows affected, but no error)
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      });

      // Mock equip new snake
      const equippedSnake = { ...targetSnake, is_equipped: true };
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: equippedSnake,
          error: null,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.equippedSnake.variantId).toBe('PRIMAL SEED');
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should return 500 when unequip fails', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      // Mock snake lookup
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            player_id: 'player-123',
          },
          error: null,
        }),
      });

      // Mock unequip - fails (needs to chain .eq().eq())
      const unequipMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockResolvedValueOnce({
            error: { message: 'Database error' },
          }),
        })),
      };
      mockFrom.mockReturnValueOnce(unequipMock);

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to update equipment');
    });

    it('should return 500 when equip fails', async () => {
      mockAuth.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockGetPlayerId.mockResolvedValueOnce('player-123');

      // Mock snake lookup
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            player_id: 'player-123',
          },
          error: null,
        }),
      });

      // Mock unequip - succeeds
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      });

      // Mock equip - fails
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error' },
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/collection/equip', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snakeId: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to equip snake');
    });
  });
});
