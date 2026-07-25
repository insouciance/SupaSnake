/**
 * Claim Offline Progress API Tests
 */

import { POST } from './route';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase. The mock client is built inside the factory because jest.mock
// is hoisted above imports and the route module calls createClient() while it
// is being imported - capturing a const declared later would hit the TDZ
// ("Cannot access 'mockSupabase' before initialization").
jest.mock('@supabase/supabase-js', () => {
  const supabaseMock = {
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
  return { createClient: () => supabaseMock };
});

// Retrieve the singleton mock client the route is using
const mockSupabase = (createClient as unknown as () => {
  auth: { getUser: jest.Mock };
  from: jest.Mock;
})();

describe('POST /api/player/claim-offline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // undici (Request/Response bodies) resolves via microtasks - faking
    // queueMicrotask would deadlock response.json() under fake timers.
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
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
          last_login_at: twoHoursAgo,
        },
        error: null,
      }),
    });

    // Collection count query (head:true - route awaits the builder after
    // .eq() and reads the count field; data is always null)
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValueOnce({
        count: 10,
        data: null,
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
    // GT §9.1: this route no longer reports, writes or clamps energy. The
    // €4-destroying `Math.min(energy + restored, max_energy)` is gone with
    // the balance it clamped.
    expect(data.rewards.energyRestored).toBeUndefined();
    expect(data.newBalances.energy).toBeUndefined();
    expect(Object.keys(data.newBalances)).toEqual(['dna']);
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
          last_login_at: oneMinuteAgo,
        },
        error: null,
      }),
    });

    // Collection count query (head:true builder await)
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValueOnce({
        count: 10,
        data: null,
        error: null,
      }),
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.rewards.passiveDnaEarned).toBe(0);
    expect(data.rewards.energyRestored).toBeUndefined();
    expect(data.message).toContain('No rewards');
  });
});
