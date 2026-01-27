/**
 * @jest-environment node
 */

/**
 * Dynasties API Tests
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

import { GET } from './route';
import { mapDynastyRow } from './utils';
import { NextRequest } from 'next/server';

// =============================================================================
// mapDynastyRow TESTS
// =============================================================================

describe('mapDynastyRow', () => {
  it('should convert snake_case to camelCase', () => {
    const row = {
      id: 'uuid-123',
      name: 'CYBER',
      display_name: 'Cyber Dynasty',
      description: 'Test description',
      color_primary: '#00FFFF',
      color_secondary: '#FF00FF',
      stat_bonus_type: 'speed',
      stat_bonus_value: 0.05,
      sort_order: 1,
      is_active: true,
      created_at: '2025-01-22T00:00:00Z',
      updated_at: '2025-01-22T00:00:00Z',
    };

    const result = mapDynastyRow(row);

    expect(result.id).toBe('uuid-123');
    expect(result.name).toBe('CYBER');
    expect(result.displayName).toBe('Cyber Dynasty');
    expect(result.colorPrimary).toBe('#00FFFF');
    expect(result.colorSecondary).toBe('#FF00FF');
    expect(result.statBonusType).toBe('speed');
    expect(result.statBonusValue).toBe(0.05);
    expect(result.sortOrder).toBe(1);
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBe('2025-01-22T00:00:00Z');
    expect(result.updatedAt).toBe('2025-01-22T00:00:00Z');
  });
});

// =============================================================================
// GET /api/dynasties TESTS
// =============================================================================

describe('GET /api/dynasties', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = jest.fn();
    mockFrom = jest.fn();
  });

  it('should return 401 without authorization header', async () => {
    const request = new NextRequest('http://localhost:3000/api/dynasties');
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 401 with invalid token', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const request = new NextRequest('http://localhost:3000/api/dynasties', {
      headers: { authorization: 'Bearer invalid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return dynasties for authenticated user', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockDynasties = [
      { id: '1', name: 'CYBER', display_name: 'Cyber Dynasty' },
      { id: '2', name: 'PRIMAL', display_name: 'Primal Dynasty' },
      { id: '3', name: 'COSMIC', display_name: 'Cosmic Dynasty' },
    ];

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValueOnce({
        data: mockDynasties,
        error: null,
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/dynasties', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.dynasties).toHaveLength(3);
    expect(data.dynasties[0].name).toBe('CYBER');
  });

  it('should handle database errors gracefully', async () => {
    mockAuth.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/dynasties', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});
