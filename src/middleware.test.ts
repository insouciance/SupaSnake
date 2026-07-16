/**
 * Security Middleware Tests
 * Validates security headers and request handling
 */

import { NextRequest } from 'next/server';
import { middleware } from './middleware';

// Export internal functions for testing via the public middleware behavior
// These are tested indirectly through the middleware function

describe('Security Middleware', () => {
  function createMockRequest(url: string, headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      headers: new Headers(headers),
    });
  }

  describe('generateRequestId (tested via X-Request-ID header)', () => {
    it('should generate unique request IDs', async () => {
      const request1 = createMockRequest('/');
      const request2 = createMockRequest('/');

      const response1 = await middleware(request1);
      const response2 = await middleware(request2);

      const id1 = response1.headers.get('X-Request-ID');
      const id2 = response2.headers.get('X-Request-ID');

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with expected format', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      const requestId = response.headers.get('X-Request-ID');
      expect(requestId).toBeDefined();
      expect(requestId).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('buildCSP (tested via Content-Security-Policy header)', () => {
    it('should include default-src directive', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
    });

    it('should include script-src with required domains', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain('script-src');
      expect(csp).toContain('https://js.stripe.com');
      expect(csp).toContain('https://eu-assets.i.posthog.com');
    });

    it('should include connect-src with API domains', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain('connect-src');
      expect(csp).toContain('https://*.supabase.co');
      expect(csp).toContain('https://api.stripe.com');
    });

    it('should deny frame-ancestors', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('isOriginAllowed (tested via CORS headers)', () => {
    it('should allow localhost:3000', async () => {
      const request = createMockRequest('/api/health', {
        'Origin': 'http://localhost:3000',
      });

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    });

    it('should allow production domain', async () => {
      const request = createMockRequest('/api/health', {
        'Origin': 'https://ogsnake.com',
      });

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ogsnake.com');
    });

    it('should allow staging domain', async () => {
      const request = createMockRequest('/api/health', {
        'Origin': 'https://staging.ogsnake.com',
      });

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://staging.ogsnake.com');
    });

    it('should not set CORS header for disallowed origins', async () => {
      const request = createMockRequest('/api/health', {
        'Origin': 'https://malicious-site.com',
      });

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle missing origin header', async () => {
      const request = createMockRequest('/api/health');

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('Security Headers', () => {
    it('should add X-Frame-Options header', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should add X-Content-Type-Options header', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should add Referrer-Policy header', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('should add X-XSS-Protection header', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should add Permissions-Policy header', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      const permissionsPolicy = response.headers.get('Permissions-Policy');
      expect(permissionsPolicy).toContain('camera=()');
      expect(permissionsPolicy).toContain('microphone=()');
      expect(permissionsPolicy).toContain('geolocation=()');
    });

    it('should add Content-Security-Policy header', async () => {
      const request = createMockRequest('/');
      const response = await middleware(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self'");
    });

    it('should add Strict-Transport-Security header in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const request = createMockRequest('/');
      const response = await middleware(request);

      expect(response.headers.get('Strict-Transport-Security')).toBe(
        'max-age=31536000; includeSubDomains; preload'
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('API Routes', () => {
    it('should allow API requests to pass through', async () => {
      const request = createMockRequest('/api/game/submit');
      const response = await middleware(request);

      expect(response.status).not.toBe(403);
    });

    it('should add correlation ID header to API requests', async () => {
      const request = createMockRequest('/api/health');
      const response = await middleware(request);

      expect(response.headers.get('X-Request-ID')).toBeDefined();
    });
  });

  describe('Static Assets', () => {
    it('should skip middleware for static files', async () => {
      const request = createMockRequest('/_next/static/chunks/main.js');
      const response = await middleware(request);

      // Should pass through without blocking
      expect(response.status).not.toBe(403);
    });

    it('should skip middleware for images', async () => {
      const request = createMockRequest('/favicon.ico');
      const response = await middleware(request);

      expect(response.status).not.toBe(403);
    });
  });

  describe('CORS', () => {
    it('should handle preflight OPTIONS requests', async () => {
      const request = new NextRequest(new URL('/api/health', 'http://localhost:3000'), {
        method: 'OPTIONS',
        headers: new Headers({
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
        }),
      });

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
    });

    it('should include CORS headers for allowed origins', async () => {
      const request = createMockRequest('/api/health', {
        'Origin': 'http://localhost:3000',
      });

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    });
  });
});
