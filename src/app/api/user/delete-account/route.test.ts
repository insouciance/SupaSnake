import { POST, DELETE } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      }),
      admin: {
        deleteUser: jest.fn().mockResolvedValue({ error: null }),
      },
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'player-id' },
        error: null,
      }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    })),
  })),
}));

function createMockRequest(
  method: string,
  body?: object,
  headers: Record<string, string> = {}
): NextRequest {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return new NextRequest('http://localhost:3000/api/user/delete-account', init);
}

describe('Delete Account API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST (Request Deletion)', () => {
    it('should return 401 without authorization header', async () => {
      const request = createMockRequest('POST');
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should accept deletion request with valid authorization', async () => {
      const request = createMockRequest('POST', { confirmEmail: 'test@example.com' }, {
        Authorization: 'Bearer valid-token',
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('scheduledDeletion');
    });

    it('should reject if confirmation email does not match', async () => {
      const request = createMockRequest('POST', { confirmEmail: 'wrong@example.com' }, {
        Authorization: 'Bearer valid-token',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE (Immediate Deletion)', () => {
    it('should return 401 without authorization header', async () => {
      const request = createMockRequest('DELETE');
      const response = await DELETE(request);

      expect(response.status).toBe(401);
    });

    it('should require confirmation for immediate deletion', async () => {
      const request = createMockRequest('DELETE', { confirm: false }, {
        Authorization: 'Bearer valid-token',
      });

      const response = await DELETE(request);
      expect(response.status).toBe(400);
    });

    it('should process immediate deletion with confirmation', async () => {
      const request = createMockRequest('DELETE', {
        confirm: true,
        confirmEmail: 'test@example.com',
      }, {
        Authorization: 'Bearer valid-token',
      });

      const response = await DELETE(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('deleted');
      expect(data.deleted).toBe(true);
    });
  });
});
