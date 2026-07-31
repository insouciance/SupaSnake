import { createClient } from '@supabase/supabase-js';
import { GET } from './route';
import {
  PRODUCTION_PUBLIC_FLAGS,
  PRODUCTION_PUBLIC_SURFACE_HASH,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from '@/lib/server/productionPublicSurface';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  })),
}));

const originalEnv = process.env;

describe('GET /api/release-contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
      SUPASNAKE_PUBLIC_SURFACE_HASH: PRODUCTION_PUBLIC_SURFACE_HASH,
      SUPASNAKE_RELEASE_SHA: 'release-sha',
      ...Object.fromEntries(PRODUCTION_PUBLIC_FLAGS.map((name) => [name, 'true'])),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('proves the exact public contract using only the anonymous client', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'healthy',
      release: 'release-sha',
      checks: {
        publicSurface: {
          status: 'healthy',
          healthy: true,
          contractHash: PRODUCTION_PUBLIC_SURFACE_HASH,
          projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
          enabledFlagCount: PRODUCTION_PUBLIC_FLAGS.length,
          expectedFlagCount: PRODUCTION_PUBLIC_FLAGS.length,
          disabledFlags: [],
        },
        database: { status: 'healthy' },
      },
    });
    expect(createClient).toHaveBeenCalledWith(
      PRODUCTION_SUPABASE_URL,
      'public-anon-key',
      expect.any(Object)
    );
  });

  it('fails closed for a valid-looking but different Supabase project', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://different.supabase.co';
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.publicSurface).toMatchObject({
      status: 'unhealthy',
      projectRef: 'different',
      expectedProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    });
  });

  it('fails closed for a disabled flag, stale hash, or anonymous query error', async () => {
    process.env.NEXT_PUBLIC_LADDER_V1 = 'false';
    process.env.SUPASNAKE_PUBLIC_SURFACE_HASH = '0'.repeat(64);
    (createClient as jest.Mock).mockReturnValueOnce({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve({
            data: null,
            error: { message: 'anonymous query denied' },
          })),
        })),
      })),
    });

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.checks.publicSurface).toMatchObject({
      status: 'unhealthy',
      declaredHash: '0'.repeat(64),
      disabledFlags: ['NEXT_PUBLIC_LADDER_V1'],
    });
    expect(body.checks.database).toMatchObject({
      status: 'unhealthy',
      error: 'anonymous query denied',
    });
  });
});
