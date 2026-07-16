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
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  upgradeAnonymousToEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
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
    const { error } = await supabase.auth.signUp({ email, password });
    setIsLoading(false);
    return { error: error ? new Error(error.message) : null };
  };

  const upgradeAnonymousToEmail = async (email: string, password: string) => {
    if (!user?.is_anonymous) {
      return { error: new Error('User is not anonymous') };
    }

    setIsLoading(true);
    // Update user with email and password - this links the anonymous account
    const { error } = await supabase.auth.updateUser({
      email,
      password,
    });
    setIsLoading(false);
    return { error: error ? new Error(error.message) : null };
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
