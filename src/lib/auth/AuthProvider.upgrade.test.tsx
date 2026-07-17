/**
 * AuthProvider - anonymous->registered upgrade + signup session tests
 *
 * Regression coverage for the "stale is_anonymous" bug: after
 * supabase.auth.updateUser attaches an email to an anonymous user, the
 * current JWT still carries is_anonymous=true. The provider must refresh
 * the session so UI gating (shop buy buttons, upgrade banners) and
 * server-side checks see the registered account immediately.
 */

import { render, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUpdateUser = jest.fn();
const mockRefreshSession = jest.fn();
const mockSignUp = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
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
  it('refreshes the session after a successful upgrade so is_anonymous clears', async () => {
    const ctx = setup(ANON_USER);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));
    expect(ctx.current?.isAnonymous).toBe(true);

    mockUpdateUser.mockResolvedValue({ data: { user: UPGRADED_USER }, error: null });
    mockRefreshSession.mockResolvedValue({
      data: { session: makeSession(UPGRADED_USER), user: UPGRADED_USER },
      error: null,
    });

    let result: { error: Error | null; pendingEmailConfirmation: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.upgradeAnonymousToEmail('p1@example.com', 'Password123');
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({
      email: 'p1@example.com',
      password: 'Password123',
    });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(result?.error).toBeNull();
    // Auto-confirm project: email confirmed immediately, nothing pending
    expect(result?.pendingEmailConfirmation).toBe(false);
    // Context now reflects the registered account (same user id)
    expect(ctx.current?.isAnonymous).toBe(false);
    expect(ctx.current?.user?.id).toBe(ANON_USER.id);
  });

  it('reports pendingEmailConfirmation when the email is not yet confirmed', async () => {
    const ctx = setup(ANON_USER);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));

    const pendingUser: AnyUser = {
      id: 'user-1',
      is_anonymous: true,
      email: 'p1@example.com',
      email_confirmed_at: null,
    };
    mockUpdateUser.mockResolvedValue({ data: { user: pendingUser }, error: null });
    mockRefreshSession.mockResolvedValue({
      data: { session: makeSession(pendingUser), user: pendingUser },
      error: null,
    });

    let result: { error: Error | null; pendingEmailConfirmation: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.upgradeAnonymousToEmail('p1@example.com', 'Password123');
    });

    expect(result?.error).toBeNull();
    expect(result?.pendingEmailConfirmation).toBe(true);
  });

  it('does not refresh the session when the upgrade fails', async () => {
    const ctx = setup(ANON_USER);
    await waitFor(() => expect(ctx.current?.isLoading).toBe(false));

    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    let result: { error: Error | null; pendingEmailConfirmation: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.upgradeAnonymousToEmail('taken@example.com', 'Password123');
    });

    expect(result?.error?.message).toBe('User already registered');
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(ctx.current?.isAnonymous).toBe(true);
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
