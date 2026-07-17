'use client';

/**
 * Auth Provider - Supabase Authentication
 * Supports anonymous auth for immediate play + email upgrade
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, Provider } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { recordLastUser } from '@/lib/auth/lastUser';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  isPasswordRecovery: boolean;
  signInAnonymously: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  /**
   * `session` is non-null when the project auto-confirms emails (no
   * verification step): the player is signed in immediately and must NOT be
   * shown a "check your email" screen.
   */
  signUpWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null; session: Session | null }>;
  /**
   * Attaches email+password to the CURRENT anonymous user (same user id, so
   * all progress is preserved). On success the session is refreshed so the
   * stale `is_anonymous` JWT claim clears immediately.
   * `pendingEmailConfirmation` is true when the project requires email
   * verification before the account becomes permanent.
   */
  upgradeAnonymousToEmail: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null; pendingEmailConfirmation: boolean }>;
  signInWithOAuth: (provider: Provider) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  refreshSession: () => Promise<{ error: Error | null }>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      // Remember who was signed in on this device so a lost session is
      // never silently replaced by a fresh anonymous identity.
      if (session?.user) {
        recordLastUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        if (session?.user) {
          recordLastUser(session.user);
        }

        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInAnonymously = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('Anonymous sign in failed:', error);
    }
    setIsLoading(false);
  };

  const signInWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    return { error: error ? new Error(error.message) : null };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setIsLoading(false);
    return {
      error: error ? new Error(error.message) : null,
      session: data?.session ?? null,
    };
  };

  const upgradeAnonymousToEmail = async (email: string, password: string) => {
    if (!user?.is_anonymous) {
      return {
        error: new Error('User is not anonymous'),
        pendingEmailConfirmation: false,
      };
    }

    // Deliberately does NOT toggle the global isLoading: surfaces hosting
    // the upgrade form gate on it and would unmount the form mid-request,
    // losing its success/error state (the "fields just got emptied" bug).
    // The form manages its own submit state.

    // Server-side upgrade (admin API): attaches email+password to the SAME
    // user id with instant confirmation, and reports duplicate emails
    // honestly - the client updateUser flow anti-enumerates and pretends
    // success without attaching anything.
    if (!session?.access_token) {
      return {
        error: new Error('No active session'),
        pendingEmailConfirmation: false,
      };
    }

    let response: Response;
    try {
      response = await fetch('/api/auth/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return {
        error: new Error('Network error - please try again'),
        pendingEmailConfirmation: false,
      };
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        error: new Error(body.error || 'upgrade_failed'),
        pendingEmailConfirmation: false,
      };
    }

    // The current access token still carries is_anonymous=true until it is
    // reissued, so everything gated on it (shop buy buttons, upgrade
    // banners, server-side checkout checks) would keep treating the player
    // as a guest. Refresh the session so the claim clears immediately.
    const { data: refreshed, error: refreshError } =
      await supabase.auth.refreshSession();
    if (!refreshError && refreshed?.session) {
      setSession(refreshed.session);
      setUser(refreshed.session.user ?? refreshed.user ?? null);
    }

    // The admin upgrade confirms the email instantly - no pending link.
    return { error: null, pendingEmailConfirmation: false };
  };

  const signInWithOAuth = async (provider: Provider) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
      },
    });
    setIsLoading(false);
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setIsLoading(false);
  };

  const sendPasswordResetEmail = async (email: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined'
        ? `${window.location.origin}/auth/reset-password`
        : undefined,
    });
    setIsLoading(false);
    return { error: error ? new Error(error.message) : null };
  };

  const updatePassword = async (newPassword: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      setIsPasswordRecovery(false);
    }
    setIsLoading(false);
    return { error: error ? new Error(error.message) : null };
  };

  const refreshSession = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.refreshSession();
    setIsLoading(false);
    return { error: error ? new Error(error.message) : null };
  };

  const getToken = async (): Promise<string | null> => {
    return session?.access_token ?? null;
  };

  const isAnonymous = user?.is_anonymous ?? false;

  const value = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    isAnonymous,
    isPasswordRecovery,
    signInAnonymously,
    signInWithEmail,
    signUpWithEmail,
    upgradeAnonymousToEmail,
    signInWithOAuth,
    signOut,
    sendPasswordResetEmail,
    updatePassword,
    refreshSession,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
