/** @jest-environment node */

var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

var mockSendConfirmation: jest.Mock;
jest.mock('@/lib/growth/dispatchEmail', () => ({
  sendDispatchConfirmationEmail: (...args: unknown[]) =>
    mockSendConfirmation(...args),
}));

let growthSurfacesEnabled = true;
jest.mock('@/lib/features/growth', () => ({
  get GROWTH_SURFACES_V1_ENABLED() {
    return growthSurfacesEnabled;
  },
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

mockFrom = jest.fn();
mockSendConfirmation = jest.fn().mockResolvedValue(true);

interface Recorded {
  inserted: Record<string, unknown> | null;
  updated: Record<string, unknown> | null;
}

/**
 * Minimal query-builder double: one row lookup by email, then either an
 * insert or a guarded update. Chain shapes mirror the route exactly.
 */
function supabaseDouble(options: {
  existing?: Record<string, unknown> | null;
  readError?: { code?: string; message: string } | null;
  insertError?: { code?: string; message: string } | null;
  updateError?: { code?: string; message: string } | null;
}): Recorded {
  const recorded: Recorded = { inserted: null, updated: null };
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: options.existing ?? null,
          error: options.readError ?? null,
        }),
      }),
    }),
    insert: async (values: Record<string, unknown>) => {
      recorded.inserted = values;
      return { error: options.insertError ?? null };
    },
    update: (values: Record<string, unknown>) => {
      recorded.updated = values;
      return {
        eq: () => ({
          neq: async () => ({ error: options.updateError ?? null }),
        }),
      };
    },
  }));
  return recorded;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/growth/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ACCEPTED_BODY = {
  status: 'pending',
  message: 'Check your inbox for a confirmation link.',
};

describe('POST /api/growth/dispatch', () => {
  beforeEach(() => {
    growthSurfacesEnabled = true;
    mockFrom.mockReset();
    mockSendConfirmation.mockClear().mockResolvedValue(true);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('404s with the growth flag off — the tested rollback path', async () => {
    growthSurfacesEnabled = false;
    const response = await POST(request({ email: 'player@example.com' }));
    expect(response.status).toBe(404);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it('rejects a malformed address before touching the database', async () => {
    const response = await POST(request({ email: 'nope' }));
    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const bad = new NextRequest('http://localhost:3000/api/growth/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it('creates a PENDING row and mails a confirmation for a new address', async () => {
    const recorded = supabaseDouble({ existing: null });

    const response = await POST(
      request({ email: '  Player@Example.COM ', channel: 'hn', landingPath: '/' })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(ACCEPTED_BODY);

    expect(recorded.inserted).toMatchObject({
      email: 'player@example.com',
      status: 'pending',
      confirmed_at: null,
      unsubscribed_at: null,
      channel: 'hn',
      landing_path: '/',
    });
    // Only digests are persisted; the raw tokens exist solely in the email.
    expect(recorded.inserted!.confirmation_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(recorded.inserted!.unsubscribe_token_hash).toMatch(/^[0-9a-f]{64}$/);

    const sent = mockSendConfirmation.mock.calls[0][0];
    expect(sent.to).toBe('player@example.com');
    expect(recorded.inserted!.confirmation_token_hash).not.toBe(
      sent.confirmationToken
    );
  });

  it('never writes a confirmed row — confirmation is a separate act', async () => {
    const recorded = supabaseDouble({ existing: null });
    await POST(request({ email: 'player@example.com' }));
    expect(recorded.inserted!.status).toBe('pending');
    expect(recorded.inserted!.confirmed_at).toBeNull();
  });

  it('says the same thing, and mails nothing, for an already-confirmed address', async () => {
    supabaseDouble({
      existing: {
        id: 'row-1',
        email: 'player@example.com',
        status: 'confirmed',
        confirmation_sent_at: null,
        confirmation_expires_at: null,
        confirmed_at: '2026-07-01T00:00:00.000Z',
        unsubscribed_at: null,
      },
    });

    const response = await POST(request({ email: 'player@example.com' }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(ACCEPTED_BODY);
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it('throttles a repeat request inside the cooldown', async () => {
    supabaseDouble({
      existing: {
        id: 'row-1',
        email: 'player@example.com',
        status: 'pending',
        confirmation_sent_at: new Date().toISOString(),
        confirmation_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        confirmed_at: null,
        unsubscribed_at: null,
      },
    });

    const response = await POST(request({ email: 'player@example.com' }));
    expect(response.status).toBe(202);
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it('re-issues a pending confirmation once the cooldown has passed', async () => {
    const recorded = supabaseDouble({
      existing: {
        id: 'row-1',
        email: 'player@example.com',
        status: 'pending',
        confirmation_sent_at: new Date(Date.now() - 3_600_000).toISOString(),
        confirmation_expires_at: new Date(Date.now() - 1000).toISOString(),
        confirmed_at: null,
        unsubscribed_at: null,
      },
    });

    const response = await POST(request({ email: 'player@example.com' }));
    expect(response.status).toBe(202);
    expect(recorded.updated).toMatchObject({ status: 'pending', confirmed_at: null });
    expect(mockSendConfirmation).toHaveBeenCalledTimes(1);
  });

  it('sends an unsubscribed address back through confirmation, not straight in', async () => {
    const recorded = supabaseDouble({
      existing: {
        id: 'row-1',
        email: 'player@example.com',
        status: 'unsubscribed',
        confirmation_sent_at: null,
        confirmation_expires_at: null,
        confirmed_at: null,
        unsubscribed_at: '2026-07-01T00:00:00.000Z',
      },
    });

    await POST(request({ email: 'player@example.com' }));
    expect(recorded.updated).toMatchObject({
      status: 'pending',
      confirmed_at: null,
      unsubscribed_at: null,
    });
  });

  it('reports 503 rather than 500 before migration 039 is applied', async () => {
    supabaseDouble({
      readError: { code: '42P01', message: 'relation "dispatch_waitlist" does not exist' },
    });
    const response = await POST(request({ email: 'player@example.com' }));
    expect(response.status).toBe(503);
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it('swallows a concurrent-insert conflict into the standard answer', async () => {
    supabaseDouble({
      existing: null,
      insertError: { code: '23505', message: 'duplicate key' },
    });
    const response = await POST(request({ email: 'player@example.com' }));
    expect(response.status).toBe(202);
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it('reports a genuine write failure to Sentry and returns 500', async () => {
    const Sentry = require('@sentry/nextjs');
    supabaseDouble({
      existing: null,
      insertError: { code: '23502', message: 'null value in column' },
    });

    const response = await POST(request({ email: 'player@example.com' }));
    expect(response.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('keeps the row pending when the confirmation mail cannot be sent', async () => {
    mockSendConfirmation.mockResolvedValue(false);
    const recorded = supabaseDouble({ existing: null });

    const response = await POST(request({ email: 'player@example.com' }));
    expect(response.status).toBe(202);
    expect(recorded.inserted!.status).toBe('pending');
  });

  it('clamps oversized attribution labels', async () => {
    const recorded = supabaseDouble({ existing: null });
    await POST(
      request({
        email: 'player@example.com',
        channel: 'c'.repeat(500),
        landingPath: 'p'.repeat(500),
      })
    );
    expect((recorded.inserted!.channel as string).length).toBe(96);
    expect((recorded.inserted!.landing_path as string).length).toBe(128);
  });
});
