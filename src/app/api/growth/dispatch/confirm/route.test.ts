/** @jest-environment node */

var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

let growthSurfacesEnabled = true;
jest.mock('@/lib/features/growth', () => ({
  get GROWTH_SURFACES_V1_ENABLED() {
    return growthSurfacesEnabled;
  },
}));

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import { NextRequest } from 'next/server';
import { createToken, hashToken } from '@/lib/growth/dispatchWaitlist';
import { POST } from './route';

mockFrom = jest.fn();

interface Recorded {
  updated: Record<string, unknown> | null;
  guards: string[][];
}

function supabaseDouble(options: {
  row?: Record<string, unknown> | null;
  readError?: { code?: string; message: string } | null;
  updatedRows?: Array<{ id: string }>;
  updateError?: { code?: string; message: string } | null;
}): Recorded {
  const recorded: Recorded = { updated: null, guards: [] };
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: options.row ?? null,
          error: options.readError ?? null,
        }),
      }),
    }),
    update: (values: Record<string, unknown>) => {
      recorded.updated = values;
      return {
        eq: (column: string, value: string) => {
          recorded.guards.push([column, value]);
          return {
            eq: (column2: string, value2: string) => {
              recorded.guards.push([column2, value2]);
              return {
                select: async () => ({
                  data: options.updatedRows ?? [{ id: 'row-1' }],
                  error: options.updateError ?? null,
                }),
              };
            },
          };
        },
      };
    },
  }));
  return recorded;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/growth/dispatch/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function pendingRow(expiresInMs: number) {
  return {
    id: 'row-1',
    email: 'player@example.com',
    status: 'pending',
    confirmation_sent_at: new Date().toISOString(),
    confirmation_expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    confirmed_at: null,
    unsubscribed_at: null,
  };
}

describe('POST /api/growth/dispatch/confirm', () => {
  const token = createToken();

  beforeEach(() => {
    growthSurfacesEnabled = true;
    mockFrom.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('404s with the growth flag off', async () => {
    growthSurfacesEnabled = false;
    expect((await POST(request({ token }))).status).toBe(404);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a malformed token before it reaches a query', async () => {
    const response = await POST(request({ token: "x'; DROP TABLE--" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ outcome: 'invalid' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('looks the row up by digest, never by the raw token', async () => {
    const recorded = supabaseDouble({ row: pendingRow(3_600_000) });
    await POST(request({ token }));
    const guards = recorded.guards.map(([, value]) => value);
    expect(guards).toContain(hashToken(token));
    expect(guards).not.toContain(token);
  });

  it('confirms a pending row and burns the token', async () => {
    const recorded = supabaseDouble({ row: pendingRow(3_600_000) });
    const response = await POST(request({ token }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ outcome: 'confirmed' });
    expect(recorded.updated).toMatchObject({
      status: 'confirmed',
      confirmation_token_hash: null,
      confirmation_expires_at: null,
    });
    expect(recorded.updated!.confirmed_at).toEqual(expect.any(String));
  });

  it('guards the write on the pending status, so a race cannot double-claim', async () => {
    const recorded = supabaseDouble({ row: pendingRow(3_600_000) });
    await POST(request({ token }));
    expect(recorded.guards).toContainEqual(['status', 'pending']);
  });

  it('reports already-confirmed when a concurrent request won the race', async () => {
    supabaseDouble({ row: pendingRow(3_600_000), updatedRows: [] });
    const response = await POST(request({ token }));
    await expect(response.json()).resolves.toEqual({
      outcome: 'already-confirmed',
    });
  });

  it('refuses an expired token and writes nothing', async () => {
    const recorded = supabaseDouble({ row: pendingRow(-1000) });
    const response = await POST(request({ token }));
    await expect(response.json()).resolves.toEqual({ outcome: 'expired' });
    expect(recorded.updated).toBeNull();
  });

  it('refuses an unknown token and writes nothing', async () => {
    const recorded = supabaseDouble({ row: null });
    const response = await POST(request({ token }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ outcome: 'invalid' });
    expect(recorded.updated).toBeNull();
  });

  it('never promotes an unsubscribed row back onto the list', async () => {
    const recorded = supabaseDouble({
      row: {
        ...pendingRow(3_600_000),
        status: 'unsubscribed',
        unsubscribed_at: '2026-07-01T00:00:00.000Z',
        confirmation_expires_at: null,
      },
    });
    const response = await POST(request({ token }));
    await expect(response.json()).resolves.toEqual({ outcome: 'invalid' });
    expect(recorded.updated).toBeNull();
  });

  it('reports a write failure to Sentry and confirms nobody', async () => {
    const Sentry = require('@sentry/nextjs');
    supabaseDouble({
      row: pendingRow(3_600_000),
      updateError: { message: 'connection reset' },
    });
    const response = await POST(request({ token }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ outcome: 'error' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
