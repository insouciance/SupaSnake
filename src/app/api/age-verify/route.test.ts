import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

function createMockRequest(body: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/age-verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('Age Verify API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST', () => {
    it('should verify age for users 13 and older', async () => {
      const currentYear = new Date().getFullYear();
      const request = createMockRequest({
        birthYear: currentYear - 20,
        birthMonth: 1,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.verified).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.expiresAt).toBeDefined();
    });

    it('should reject users under 13', async () => {
      const currentYear = new Date().getFullYear();
      const request = createMockRequest({
        birthYear: currentYear - 10,
        birthMonth: 1,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.verified).toBe(false);
      expect(data.message).toContain('13');
    });

    it('should handle exactly 13 years old', async () => {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const request = createMockRequest({
        birthYear: currentYear - 13,
        birthMonth: currentMonth, // Same month = exactly 13
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.verified).toBe(true);
    });

    it('should handle birth month in the future (not yet 13)', async () => {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const futureMonth = currentMonth === 12 ? 12 : currentMonth + 1;

      const request = createMockRequest({
        birthYear: currentYear - 13,
        birthMonth: futureMonth,
      });

      const response = await POST(request);
      const data = await response.json();

      // If birth month is after current month, they're still 12
      if (futureMonth > currentMonth) {
        expect(response.status).toBe(403);
        expect(data.verified).toBe(false);
      }
    });

    it('should reject invalid birth year', async () => {
      const request = createMockRequest({
        birthYear: 1800,
        birthMonth: 1,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('year');
    });

    it('should reject future birth year', async () => {
      const request = createMockRequest({
        birthYear: new Date().getFullYear() + 1,
        birthMonth: 1,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('year');
    });

    it('should reject invalid birth month', async () => {
      const request = createMockRequest({
        birthYear: 2000,
        birthMonth: 13,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('month');
    });

    it('should reject month 0', async () => {
      const request = createMockRequest({
        birthYear: 2000,
        birthMonth: 0,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('month');
    });

    it('should handle non-numeric input', async () => {
      const request = createMockRequest({
        birthYear: 'abc',
        birthMonth: 'def',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
    });
  });
});
