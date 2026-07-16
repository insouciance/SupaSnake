/**
 * @jest-environment node
 */

/**
 * Variants API Tests
 */

// Mock Supabase - must be before imports due to jest.mock hoisting
 
var mockAuth: jest.Mock;
 
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { GET } from './route';
import { mapVariantRow } from './utils';
import { NextRequest } from 'next/server';

// =============================================================================
// mapVariantRow TESTS
// =============================================================================

describe('mapVariantRow', () => {
  it('should convert snake_case to camelCase', () => {
    const row = {
      id: 'uuid-123',
      dynasty_id: 'dynasty-uuid',
      name: 'CYBER SPARK',
      rarity: 'common',
      lore_text: 'Test lore',
      art_url: null,
      base_stats: { speed: 10, size: 5, hp: 100 },
      unlock_cost_dna: 500,
      is_starter: false,
      sort_order: 1,
      is_active: true,
      created_at: '2025-01-22T00:00:00Z',
      updated_at: '2025-01-22T00:00:00Z',
    };

    const result = mapVariantRow(row);

    expect(result.id).toBe('uuid-123');
    expect(result.dynastyId).toBe('dynasty-uuid');
    expect(result.name).toBe('CYBER SPARK');
    expect(result.rarity).toBe('common');
    expect(result.loreText).toBe('Test lore');
    expect(result.artUrl).toBeNull();
    expect(result.baseStats).toEqual({ speed: 10, size: 5, hp: 100 });
    expect(result.unlockCostDna).toBe(500);
    expect(result.isStarter).toBe(false);
    expect(result.sortOrder).toBe(1);
    expect(result.isActive).toBe(true);
  });

  it('should handle starter variant', () => {
    const row = {
      id: 'uuid-123',
      dynasty_id: 'dynasty-uuid',
      name: 'CYBER SPARK',
      rarity: 'common',
      lore_text: 'Starter lore',
      art_url: 'https://example.com/art.png',
      base_stats: { speed: 10, size: 5, hp: 100 },
      unlock_cost_dna: 0,
      is_starter: true,
      sort_order: 1,
      is_active: true,
      created_at: '2025-01-22T00:00:00Z',
      updated_at: '2025-01-22T00:00:00Z',
    };

    const result = mapVariantRow(row);

    expect(result.isStarter).toBe(true);
    expect(result.unlockCostDna).toBe(0);
    expect(result.artUrl).toBe('https://example.com/art.png');
  });
});

// =============================================================================
// GET /api/variants TESTS
// =============================================================================

describe('GET /api/variants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
  });

  it('should return 401 without authorization header', async () => {
    const request = new NextRequest('http://localhost:3000/api/variants');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return all variants for authenticated user', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockVariants = [
      { id: '1', name: 'CYBER SPARK', dynasty_id: 'd1', rarity: 'common' },
      { id: '2', name: 'CYBER PULSE', dynasty_id: 'd1', rarity: 'common' },
    ];

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValueOnce({
        data: mockVariants,
        error: null,
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/variants', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.variants).toHaveLength(2);
  });

  it('should filter by dynasty when query param provided', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockVariants = [
      { id: '1', name: 'CYBER SPARK', dynasty_id: 'd1', rarity: 'common' },
    ];

    const selectMock = jest.fn().mockReturnThis();
    const eqMock = jest.fn().mockReturnThis();
    const orderMock = jest.fn().mockResolvedValueOnce({
      data: mockVariants,
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: selectMock,
      eq: eqMock,
      order: orderMock,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/variants?dynasty=dynasty-uuid',
      {
        headers: { authorization: 'Bearer valid-token' },
      }
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith('is_active', true);
  });
});
