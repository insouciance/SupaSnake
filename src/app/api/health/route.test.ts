/**
 * Health Check Endpoint Tests
 * Validates system health reporting and dependency checks
 */

import { GET } from './route';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn(() => Promise.resolve({ data: [{ id: 1 }], error: null })),
      })),
    })),
    rpc: jest.fn(() => Promise.resolve({ data: { version: 1 }, error: null })),
  })),
}));

// Mock environment variables
const originalEnv = process.env;

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      SUPASNAKE_RELEASE_SHA: 'release-sha',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return 200 when all services are healthy', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.timestamp).toBeDefined();
    expect(data.version).toBeDefined();
    expect(data.release).toBe('release-sha');
  });

  it('should include database health check', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.checks).toBeDefined();
    expect(data.checks.database).toBeDefined();
    expect(data.checks.database.status).toBe('healthy');
    expect(data.checks.careerSpine).toEqual({ status: 'healthy', version: 1 });
  });

  it('reports a rolling pre-migration capability without failing basic health', async () => {
    (createClient as jest.Mock).mockReturnValueOnce({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve({ data: [{ id: 1 }], error: null })),
        })),
      })),
    }).mockReturnValueOnce({
      rpc: jest.fn(() => Promise.resolve({
        data: null,
        error: { code: 'PGRST202', message: 'get_career_spine_capability is missing' },
      })),
    });

    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.checks.careerSpine.status).toBe('pending');
  });

  it('fails health when the deployed Career Spine capability is malformed', async () => {
    (createClient as jest.Mock).mockReturnValueOnce({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve({ data: [{ id: 1 }], error: null })),
        })),
      })),
    }).mockReturnValueOnce({
      rpc: jest.fn(() => Promise.resolve({ data: { version: 2 }, error: null })),
    });

    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.checks.careerSpine.status).toBe('unhealthy');
  });

  it('fails health when the service-role capability configuration is absent', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(503);
    expect(data.checks.careerSpine.status).toBe('unhealthy');
  });

  it('does not disguise a permission failure as a pending migration', async () => {
    (createClient as jest.Mock).mockReturnValueOnce({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve({ data: [{ id: 1 }], error: null })),
        })),
      })),
    }).mockReturnValueOnce({
      rpc: jest.fn(() => Promise.resolve({
        data: null,
        error: {
          code: '42501',
          message: 'permission denied for function get_career_spine_capability',
        },
      })),
    });

    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(503);
    expect(data.checks.careerSpine.status).toBe('unhealthy');
  });

  it('should include uptime information', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.uptime).toBeDefined();
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include environment info', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.environment).toBe('test');
  });

  it('should return 503 when database is unhealthy', async () => {
    // Mock database failure
    (createClient as jest.Mock).mockReturnValueOnce({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve({ data: null, error: { message: 'Connection failed' } })),
        })),
      })),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.checks.database.status).toBe('unhealthy');
    expect(data.checks.database.error).toBeDefined();
  });

  it('should include response time for checks', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.checks.database.responseTime).toBeDefined();
    expect(typeof data.checks.database.responseTime).toBe('number');
  });

  it('should handle database timeout gracefully', async () => {
    // Mock database timeout
    (createClient as jest.Mock).mockReturnValueOnce({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          limit: jest.fn(() => new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 100)
          )),
        })),
      })),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
  });

  it('should return memory usage information', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.memory).toBeDefined();
    expect(data.memory.heapUsed).toBeDefined();
    expect(data.memory.heapTotal).toBeDefined();
  });

  it('should set proper cache headers', async () => {
    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  describe('checkDatabase function', () => {
    // checkDatabase is tested indirectly through the GET endpoint
    // These tests verify specific database check scenarios

    it('should return healthy when database query succeeds', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.checks.database.status).toBe('healthy');
      expect(data.checks.database.responseTime).toBeDefined();
      expect(data.checks.database.error).toBeUndefined();
    });

    it('should return unhealthy with error message on database failure', async () => {
      (createClient as jest.Mock).mockReturnValueOnce({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            limit: jest.fn(() => Promise.resolve({
              data: null,
              error: { message: 'Database connection refused' }
            })),
          })),
        })),
      });

      const response = await GET();
      const data = await response.json();

      expect(data.checks.database.status).toBe('unhealthy');
      expect(data.checks.database.error).toBe('Database connection refused');
    });

    it('should return unhealthy when database config is missing', async () => {
      const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const response = await GET();
      const data = await response.json();

      expect(data.checks.database.status).toBe('unhealthy');
      expect(data.checks.database.error).toBe('Database configuration missing');

      process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    });

    it('should catch and report exceptions', async () => {
      (createClient as jest.Mock).mockReturnValueOnce({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            limit: jest.fn(() => Promise.reject(new Error('Unexpected error'))),
          })),
        })),
      });

      const response = await GET();
      const data = await response.json();

      expect(data.checks.database.status).toBe('unhealthy');
      expect(data.checks.database.error).toBe('Unexpected error');
    });

    it('should measure response time accurately', async () => {
      const response = await GET();
      const data = await response.json();

      // Response time should be a positive number
      expect(data.checks.database.responseTime).toBeGreaterThanOrEqual(0);
      // Response time should be reasonable (less than 5 seconds in tests)
      expect(data.checks.database.responseTime).toBeLessThan(5000);
    });
  });
});
