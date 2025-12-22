import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockExchangeCodeForSession = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}));

describe('OAuth Callback Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should redirect to login with error when OAuth error param present', async () => {
      const { GET } = await import('./route');
      const request = new NextRequest(
        'http://localhost:3000/auth/callback?error=access_denied&error_description=User%20cancelled'
      );

      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/login');
      expect(response.headers.get('location')).toContain('error=User%20cancelled');
    });

    it('should exchange code for session and redirect to game on success', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });

      const { GET } = await import('./route');
      const request = new NextRequest(
        'http://localhost:3000/auth/callback?code=valid_code'
      );

      const response = await GET(request);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid_code');
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/game');
    });

    it('should redirect to custom returnTo path on success', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });

      const { GET } = await import('./route');
      const request = new NextRequest(
        'http://localhost:3000/auth/callback?code=valid_code&returnTo=/shop'
      );

      const response = await GET(request);

      expect(response.headers.get('location')).toContain('/shop');
    });

    it('should redirect to login with error on exchange failure', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        error: { message: 'Invalid code' },
      });

      const { GET } = await import('./route');
      const request = new NextRequest(
        'http://localhost:3000/auth/callback?code=invalid_code'
      );

      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/login');
      expect(response.headers.get('location')).toContain('error=Invalid%20code');
    });

    it('should redirect to login when no code or error present', async () => {
      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost:3000/auth/callback');

      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/login');
    });
  });
});
