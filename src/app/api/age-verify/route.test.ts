import { POST } from './route';
import { NextRequest } from 'next/server';

const mockInsert = jest.fn();

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: (...args: unknown[]) => mockInsert(...args),
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
    mockInsert.mockResolvedValue({ data: null, error: null });
  });

  describe('POST', () => {
    it('should verify age for users 14 and older', async () => {
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
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: expect.stringMatching(/^[a-f0-9]{64}$/),
          verification_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          age_verified: true,
        })
      );
      const inserted = mockInsert.mock.calls[0][0];
      expect(inserted.session_id).toBe(inserted.verification_hash);
      expect(inserted).not.toHaveProperty('user_id');
      expect(inserted).not.toHaveProperty('is_verified');
    });

    it('should reject users under 14', async () => {
      const currentYear = new Date().getFullYear();
      const request = createMockRequest({
        birthYear: currentYear - 10,
        birthMonth: 1,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.verified).toBe(false);
      expect(data.message).toContain('14');
    });

    it('should handle exactly 14 years old', async () => {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const request = createMockRequest({
        birthYear: currentYear - 14,
        birthMonth: currentMonth, // Same month = exactly 14
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.verified).toBe(true);
    });

    it('should handle birth month in the future (not yet 14)', async () => {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const futureMonth = currentMonth === 12 ? 12 : currentMonth + 1;

      const request = createMockRequest({
        birthYear: currentYear - 14,
        birthMonth: futureMonth,
      });

      const response = await POST(request);
      const data = await response.json();

      // If birth month is after current month, they're still 13
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

    it('rejects partially numeric input rather than parseInt-coercing it', async () => {
      const request = createMockRequest({
        birthYear: '2000oops',
        birthMonth: '1x',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('fails closed when the anonymized audit record cannot be stored', async () => {
      mockInsert.mockResolvedValueOnce({
        data: null,
        error: { code: '42P01', message: 'relation missing' },
      });
      const request = createMockRequest({ birthYear: 2000, birthMonth: 1 });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(data.error).toMatch(/temporarily unavailable/i);
    });
  });
});
