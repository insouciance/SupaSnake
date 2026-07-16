import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => {
  // Chainable + awaitable query builder (supabase builders are thenables):
  // supports .select().eq().single(), .select().eq(), .select().eq().order().limit()
  const createQueryBuilder = () => {
    const builder: Record<string, unknown> = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.order = jest.fn(() => builder);
    builder.limit = jest.fn(() => builder);
    builder.single = jest.fn().mockResolvedValue({
      data: {
        id: 'player-id',
        username: 'testuser',
        dna: 100,
        energy: 5,
      },
      error: null,
    });
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return builder;
  };

  return {
    createClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id', email: 'test@example.com' } },
          error: null,
        }),
      },
      from: jest.fn(() => createQueryBuilder()),
    })),
  };
});

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
    jest.clearAllMocks();
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
