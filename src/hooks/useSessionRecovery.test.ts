import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionRecovery, dispatchApiError } from './useSessionRecovery';

const mockRefreshSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    refreshSession: mockRefreshSession,
    isAuthenticated: true,
    signOut: mockSignOut,
  }),
}));

describe('useSessionRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useSessionRecovery());

    expect(result.current.isSessionExpired).toBe(false);
    expect(result.current.isRecovering).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should set session expired when handleUnauthorized is called', () => {
    const { result } = renderHook(() => useSessionRecovery());

    act(() => {
      result.current.handleUnauthorized();
    });

    expect(result.current.isSessionExpired).toBe(true);
    expect(result.current.error).toBe('Your session has expired. Please sign in again.');
  });

  it('should attempt recovery and succeed', async () => {
    mockRefreshSession.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSessionRecovery());

    act(() => {
      result.current.handleUnauthorized();
    });

    let success: boolean = false;
    await act(async () => {
      success = await result.current.attemptRecovery();
    });

    expect(success).toBe(true);
    expect(result.current.isSessionExpired).toBe(false);
    expect(result.current.isRecovering).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should attempt recovery and fail', async () => {
    mockRefreshSession.mockResolvedValue({ error: new Error('Session invalid') });
    const { result } = renderHook(() => useSessionRecovery());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.attemptRecovery();
    });

    expect(success).toBe(false);
    expect(result.current.isSessionExpired).toBe(true);
    expect(result.current.error).toBe('Could not refresh session. Please sign in again.');
  });

  it('should handle sign out', async () => {
    mockSignOut.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSessionRecovery());

    act(() => {
      result.current.handleUnauthorized();
    });

    await act(async () => {
      await result.current.handleSignOut();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(result.current.isSessionExpired).toBe(false);
  });

  it('should dismiss recovery', () => {
    const { result } = renderHook(() => useSessionRecovery());

    act(() => {
      result.current.handleUnauthorized();
    });

    expect(result.current.isSessionExpired).toBe(true);

    act(() => {
      result.current.dismissRecovery();
    });

    expect(result.current.isSessionExpired).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should respond to api-error events with 401 status', async () => {
    const { result } = renderHook(() => useSessionRecovery());

    await act(async () => {
      dispatchApiError(401);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isSessionExpired).toBe(true);
  });

  it('should not respond to api-error events with non-401 status', async () => {
    const { result } = renderHook(() => useSessionRecovery());

    await act(async () => {
      dispatchApiError(500);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isSessionExpired).toBe(false);
  });
});

describe('dispatchApiError', () => {
  it('should dispatch custom event with status', () => {
    const eventListener = vi.fn();
    window.addEventListener('api-error', eventListener);

    dispatchApiError(401);

    expect(eventListener).toHaveBeenCalled();
    const event = eventListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.status).toBe(401);

    window.removeEventListener('api-error', eventListener);
  });
});

describe('handleApiError (internal)', () => {
  it('should trigger session expired on 401 through event dispatch', async () => {
    const { result } = renderHook(() => useSessionRecovery());

    expect(result.current.isSessionExpired).toBe(false);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('api-error', { detail: { status: 401 } })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isSessionExpired).toBe(true);
  });

  it('should not trigger session expired on non-401 through event dispatch', async () => {
    const { result } = renderHook(() => useSessionRecovery());

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('api-error', { detail: { status: 500 } })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isSessionExpired).toBe(false);
  });
});
