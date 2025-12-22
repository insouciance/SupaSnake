import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'player-id',
          username: 'testuser',
          dna: 100,
          energy: 5,
        },
        error: null,
      }),
    })),
  })),
}));

function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/user/export-data', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

describe('Export Data API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 401 without authorization header', async () => {
      const request = createMockRequest();
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return user data with valid authorization', async () => {
      const request = createMockRequest({
        Authorization: 'Bearer valid-token',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('exportedAt');
      expect(data).toHaveProperty('account');
    });

    it('should include proper GDPR export format', async () => {
      const request = createMockRequest({
        Authorization: 'Bearer valid-token',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('exportedAt');
      expect(data).toHaveProperty('dataCategories');
    });
  });
});
