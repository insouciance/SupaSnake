/**
 * Account upgrade API tests
 */

import { POST } from './route';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Mock built inside the factory (jest.mock hoists above imports; the route
// calls createClient at module scope - see achievements route test).
jest.mock('@supabase/supabase-js', () => {
  const supabaseMock = {
    auth: {
      getUser: jest.fn(),
      admin: {
        updateUserById: jest.fn(),
      },
    },
  };
  return { createClient: () => supabaseMock };
});

const mockSupabase = (createClient as unknown as () => {
  auth: {
    getUser: jest.Mock;
    admin: { updateUserById: jest.Mock };
  };
})();

function makeRequest(body: Record<string, unknown>, token = 'test-token'): NextRequest {
  return new NextRequest('http://localhost/api/auth/upgrade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const ANON_USER = { id: 'user-1', is_anonymous: true, app_metadata: {} };

describe('POST /api/auth/upgrade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without authorization', async () => {
    const req = new NextRequest('http://localhost/api/auth/upgrade', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects non-anonymous users', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u2', is_anonymous: false, app_metadata: { provider: 'email' } } },
      error: null,
    });
    const res = await POST(makeRequest({ email: 'a@b.co', password: 'Password123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('account_already_registered');
  });

  it('rejects invalid email and weak password', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ANON_USER }, error: null });

    const bad = await POST(makeRequest({ email: 'nope', password: 'Password123' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('invalid_email');

    const weak = await POST(makeRequest({ email: 'a@b.co', password: 'short' }));
    expect(weak.status).toBe(400);
    expect((await weak.json()).error).toBe('weak_password');
  });

  it('upgrades via admin API with instant confirmation', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ANON_USER }, error: null });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    const res = await POST(makeRequest({ email: 'new@player.co', password: 'Password123' }));
    expect(res.status).toBe(200);
    expect((await res.json()).emailConfirmed).toBe(true);
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', {
      email: 'new@player.co',
      password: 'Password123',
      email_confirm: true,
    });
  });

  it('maps duplicate email to 409 email_exists', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ANON_USER }, error: null });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({
      data: null,
      error: { message: 'A user with this email address has already been registered' },
    });

    const res = await POST(makeRequest({ email: 'taken@player.co', password: 'Password123' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('email_exists');
  });

  it('maps other admin errors to 500', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ANON_USER }, error: null });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const res = await POST(makeRequest({ email: 'a@b.co', password: 'Password123' }));
    expect(res.status).toBe(500);
  });
});
