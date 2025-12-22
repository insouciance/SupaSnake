'use client';

/**
 * Session Recovery Hook - Detect and handle expired sessions
 * Shows recovery modal during gameplay when token expires
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';

interface SessionRecoveryState {
  isSessionExpired: boolean;
  isRecovering: boolean;
  error: string | null;
}

export function useSessionRecovery() {
  const { refreshSession, isAuthenticated, signOut } = useAuth();
  const [state, setState] = useState<SessionRecoveryState>({
    isSessionExpired: false,
    isRecovering: false,
    error: null,
  });

  const handleUnauthorized = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isSessionExpired: true,
      error: 'Your session has expired. Please sign in again.',
    }));
  }, []);

  const attemptRecovery = useCallback(async () => {
    setState((prev) => ({ ...prev, isRecovering: true, error: null }));

    const result = await refreshSession();

    if (result.error) {
      setState({
        isSessionExpired: true,
        isRecovering: false,
        error: 'Could not refresh session. Please sign in again.',
      });
      return false;
    }

    setState({
      isSessionExpired: false,
      isRecovering: false,
      error: null,
    });
    return true;
  }, [refreshSession]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setState({
      isSessionExpired: false,
      isRecovering: false,
      error: null,
    });
  }, [signOut]);

  const dismissRecovery = useCallback(() => {
    setState({
      isSessionExpired: false,
      isRecovering: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    const handleApiError = (event: CustomEvent<{ status: number }>) => {
      if (event.detail.status === 401) {
        handleUnauthorized();
      }
    };

    window.addEventListener('api-error' as keyof WindowEventMap, handleApiError as EventListener);
    return () => {
      window.removeEventListener('api-error' as keyof WindowEventMap, handleApiError as EventListener);
    };
  }, [handleUnauthorized]);

  return {
    ...state,
    isAuthenticated,
    handleUnauthorized,
    attemptRecovery,
    handleSignOut,
    dismissRecovery,
  };
}

export function dispatchApiError(status: number) {
  window.dispatchEvent(
    new CustomEvent('api-error', { detail: { status } })
  );
}
