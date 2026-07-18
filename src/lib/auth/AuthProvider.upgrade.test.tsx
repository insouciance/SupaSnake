/**
 * AuthProvider - anonymous->registered upgrade + signup session tests
 *
 * Regression coverage for the "stale is_anonymous" bug: the admin-API
 * upgrade revokes the anonymous session's refresh tokens, so the provider
 * cannot refreshSession() afterwards - it must sign in with the freshly
 * attached credentials to mint a new session, so UI gating (shop buy
 * buttons, upgrade banners) and server-side checks see the registered
 * account immediately.
 */

import { render, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUpdateUser = jest.fn();
const mockRefreshSession = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
    },
  },
}));

interface AnyUser {
  id: string;
  is_anonymous?: boolean;
  email?: string | null;
  email_confirmed_at?: string | null;
}

function makeSession(user: AnyUser) {
  return { access_token: `token-${user.id}`, user };
}

const ANON_USER: AnyUser = { id: 'user-1', is_anonymous: true, email: null };
const UPGRADED_USER: AnyUser = {
  id: 'user-1',
  is_anonymous: false,
  email: 'p1@example.com',
  email_confirmed_at: '2026-07-17T00:00:00Z',
};

type AuthContext = ReturnType<typeof useAuth>;

function setup(initialUser: AnyUser | null) {
  mockGetSession.mockResolvedValue({
    data: { session: initialUser ? makeSession(initialUser) : null },
  });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });

  const ctx: { current: AuthContext | null } = { current: null };
  function Capture() {
    ctx.current = useAuth();
    return null;
  }
  render(
    <AuthProvider>
      <Capture />
    </AuthProvider>
  );
  return ctx;
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe('upgradeAnonymousToEmail', () => {
  // The upgrade now goes through POST /api/auth/upgrade (admin API:
  // instant confirm + honest duplicate-email errors) instead of the
  // anti-enumerating client updateUser flow.
  const mockFetch = jest.fn();
  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('signs in with the new credentials after a successful upgrade so is_anonymous clears', async () => {
    const ctx = setup(ANON_USER);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));
    expect(ctx.current?.isAnonymous).toBe(true);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, emailConfirmed: true }),
    });
    mockSignInWithPassword.mockResolvedValue({
      data: { session: makeSession(UPGRADED_USER), user: UPGRADED_USER },
      error: null,
    });

    let result: { error: Error | null; pendingEmailConfirmation: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.upgradeAnonymousToEmail('p1@example.com', 'Password123');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/upgrade',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'p1@example.com', password: 'Password123' }),
      })
    );
    // The admin upgrade revoked the old refresh token - the provider must
    // NOT rely on refreshSession, it signs in with the new credentials.
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'p1@example.com',
      password: 'Password123',
    });
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(result?.error).toBeNull();
    // Admin upgrade confirms instantly - nothing pending
    expect(result?.pendingEmailConfirmation).toBe(false);
    // Context now reflects the registered account (same user id)
    expect(ctx.current?.isAnonymous).toBe(false);
    expect(ctx.current?.user?.id).toBe(ANON_USER.id);
  });

  it('surfaces email_exists without touching the session', async () => {
    const ctx = setup(ANON_USER);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));

    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'email_exists' }),
    });

    let result: { error: Error | null; pendingEmailConfirmation: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.upgradeAnonymousToEmail('taken@example.com', 'Password123');
    });

    expect(result?.error?.message).toBe('email_exists');
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(ctx.current?.isAnonymous).toBe(true);
  });

  it('reports a friendly error on network failure', async () => {
    const ctx = setup(ANON_USER);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));

    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    let result: { error: Error | null; pendingEmailConfirmation: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.upgradeAnonymousToEmail('p1@example.com', 'Password123');
    });

    expect(result?.error?.message).toMatch(/network error/i);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('does not toggle the global isLoading during the upgrade (form must stay mounted)', async () => {
    const ctx = setup(ANON_USER);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));

    let loadingDuringRequest: boolean | undefined;
    mockFetch.mockImplementation(async () => {
      loadingDuringRequest = ctx.current?.isLoading;
      return { ok: true, json: async () => ({ success: true }) };
    });
    mockSignInWithPassword.mockResolvedValue({
      data: { session: makeSession(UPGRADED_USER), user: UPGRADED_USER },
      error: null,
    });

    await act(async () => {
      await ctx.current!.upgradeAnonymousToEmail('p1@example.com', 'Password123');
    });

    expect(loadingDuringRequest).toBe(false);
  });

  it('rejects upgrade for non-anonymous users', async () => {
    const ctx = setup(UPGRADED_USER);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));

    let result: { error: Error | null; pendingEmailConfirmation: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.upgradeAnonymousToEmail('x@example.com', 'Password123');
    });

    expect(result?.error?.message).toBe('User is not anonymous');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe('signUpWithEmail', () => {
  it('returns the session when the project auto-confirms emails', async () => {
    const ctx = setup(null);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));

    const session = makeSession(UPGRADED_USER);
    mockSignUp.mockResolvedValue({ data: { session, user: UPGRADED_USER }, error: null });

    let result: { error: Error | null; session: unknown } | undefined;
    await act(async () => {
      result = await ctx.current!.signUpWithEmail('p1@example.com', 'Password123');
    });

    expect(result?.error).toBeNull();
    expect(result?.session).toBe(session);
  });

  it('returns a null session when email verification is required', async () => {
    const ctx = setup(null);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));

    mockSignUp.mockResolvedValue({
      data: { session: null, user: { ...UPGRADED_USER, email_confirmed_at: null } },
      error: null,
    });

    let result: { error: Error | null; session: unknown } | undefined;
    await act(async () => {
      result = await ctx.current!.signUpWithEmail('p1@example.com', 'Password123');
    });

    expect(result?.error).toBeNull();
    expect(result?.session).toBeNull();
  });
});
