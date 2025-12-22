/**
 * Achievements API Tests
 */

import { GET, POST } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase
const mockSupabase = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  })),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

describe('GET /api/achievements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createRequest(): NextRequest {
    return new NextRequest('http://localhost/api/achievements', {
      headers: {
        Authorization: 'Bearer test-token',
      },
    });
  }

  it('returns 401 without authorization', async () => {
    const request = new NextRequest('http://localhost/api/achievements');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns achievements with player progress', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Player query
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123' },
        error: null,
      }),
    });

    // Achievement definitions
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValueOnce({
        data: [
          {
            id: 'games_10',
            category: 'games',
            name: 'Beginner',
            tier: 1,
            requirement_value: 10,
            reward_dna: 100,
          },
        ],
        error: null,
      }),
    });

    // Player progress
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValueOnce({
        data: [
          {
            achievement_id: 'games_10',
            progress: 5,
            completed: false,
            reward_claimed: false,
          },
        ],
        error: null,
      }),
    });

    const response = await GET(createRequest());
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.achievements).toHaveLength(1);
    expect(data.achievements[0].progress).toBe(5);
  });
});

describe('POST /api/achievements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/achievements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without authorization', async () => {
    const request = new NextRequest('http://localhost/api/achievements', {
      method: 'POST',
      body: JSON.stringify({ action: 'claim', achievement_id: 'games_10' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('claims completed achievement rewards', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Player query
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'player-123', dna: 100, energy: 3, max_energy: 5 },
        error: null,
      }),
    });

    // Achievement progress query
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: {
          achievement_id: 'games_10',
          completed: true,
          reward_claimed: false,
        },
        error: null,
      }),
    });

    // Achievement definition query
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: {
          id: 'games_10',
          reward_dna: 100,
          reward_energy: 1,
        },
        error: null,
      }),
    });

    // Update claim status
    mockSupabase.from.mockReturnValueOnce({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    });

    // Update player
    mockSupabase.from.mockReturnValueOnce({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValueOnce({ error: null }),
    });

    // Economy transaction
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockResolvedValueOnce({ error: null }),
    });

    const response = await POST(createRequest({
      action: 'claim',
      achievement_id: 'games_10',
    }));

    expect(response.status).toBe(200);
  });
});
