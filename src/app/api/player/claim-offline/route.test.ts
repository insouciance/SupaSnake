/**
 * Claim Offline Progress API Tests
 */

import { POST } from './route';
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
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  })),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

describe('POST /api/player/claim-offline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest('http://localhost/api/player/claim-offline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without authorization header', async () => {
    const request = new NextRequest('http://localhost/api/player/claim-offline', {
      method: 'POST',
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(401);
  });

  it('returns 404 when player not found', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(404);
  });

  it('calculates and claims offline rewards', async () => {
    const now = new Date('2024-01-15T12:00:00Z');
    jest.setSystemTime(now);

    const twoHoursAgo = new Date('2024-01-15T10:00:00Z').toISOString();

    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Player query
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: {
          id: 'player-123',
          dna: 100,
          energy: 2,
          max_energy: 5,
          last_login_at: twoHoursAgo,
        },
        error: null,
      }),
    });

    // Collection count query
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { count: 10 },
        error: null,
      }),
    });

    // Update player
    mockSupabase.from.mockReturnValueOnce({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValueOnce({ error: null }),
    });

    // Insert economy transaction
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockResolvedValueOnce({ error: null }),
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.rewards.passiveDnaEarned).toBe(20); // 10 snakes * 1 DNA/hr * 2 hrs
    expect(data.rewards.energyRestored).toBe(3); // From 2 to 5
  });

  it('returns no rewards if already claimed recently', async () => {
    const now = new Date('2024-01-15T12:00:00Z');
    jest.setSystemTime(now);

    const oneMinuteAgo = new Date('2024-01-15T11:59:00Z').toISOString();

    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: {
          id: 'player-123',
          dna: 100,
          energy: 5,
          max_energy: 5,
          last_login_at: oneMinuteAgo,
        },
        error: null,
      }),
    });

    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { count: 10 },
        error: null,
      }),
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.rewards.passiveDnaEarned).toBe(0);
    expect(data.rewards.energyRestored).toBe(0);
    expect(data.message).toContain('No rewards');
  });
});
