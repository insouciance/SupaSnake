'use client';

/**
 * Login Form Component - Reusable email/password login
 * Used on login page and for session recovery
 */

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import Link from 'next/link';

interface LoginFormProps {
  mode?: 'login' | 'signup';
  onSuccess?: () => void;
  showForgotPassword?: boolean;
  showSignUpLink?: boolean;
  className?: string;
}

export function LoginForm({
  mode = 'login',
  onSuccess,
  showForgotPassword = true,
  showSignUpLink = true,
  className = '',
}: LoginFormProps) {
  const { signInWithEmail, signUpWithEmail, signInWithOAuth, signInAnonymously, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const isSignup = mode === 'signup';

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = isEmailValid && password.length >= 8 && !isLoading;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    if (isSignup) {
      const result = await signUpWithEmail(email, password);
      if (result.error) {
        setError(result.error.message);
      } else {
        setSignupSuccess(true);
      }
    } else {
      const result = await signInWithEmail(email, password);
      if (result.error) {
        setError(result.error.message);
      } else {
        onSuccess?.();
      }
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    setError(null);
    const result = await signInWithOAuth(provider);
    if (result.error) {
      setError(result.error.message);
    }
  };

  const handleGuestPlay = async () => {
    setError(null);
    await signInAnonymously();
    onSuccess?.();
  };

  // Show success message after signup
  if (signupSuccess) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-venom-orange/20 rounded-arcade border-[3px] border-venom-orange flex items-center justify-center">
            <svg className="w-8 h-8 text-venom-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-display uppercase tracking-arcade text-bone-white">Check your email!</h3>
          <p className="text-beige font-body">
            We sent a verification link to <span className="text-bone-white font-bold">{email}</span>
          </p>
          <p className="text-beige/60 text-sm font-body">
            Click the link in the email to verify your account and start playing.
          </p>
        </div>
        <Link
          href="/login"
          className="block w-full py-3 text-center bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-bone-white hover:bg-scale-blue-light transition-all"
        >
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {error && (
        <div className="bg-strike-red/20 border-[2px] border-strike-red rounded-arcade p-3">
          <p className="text-strike-red text-sm font-body">{error}</p>
        </div>
      )}

      {/* OAuth Options */}
      <div className="space-y-3">
        <button
          onClick={() => handleOAuthLogin('google')}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-bone-white text-scale-blue-dark rounded-arcade border-[3px] border-beige font-body font-bold hover:bg-beige transition-all disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <button
          onClick={() => handleOAuthLogin('apple')}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-scale-blue-dark border-[3px] border-scale-blue-light rounded-arcade font-body font-bold text-bone-white hover:bg-scale-blue transition-all disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          Continue with Apple
        </button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-[2px] border-scale-blue-light" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-scale-blue text-beige font-body">or with email</span>
        </div>
      </div>

      {/* Email Form */}
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-body font-bold text-beige mb-1">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade font-body text-bone-white focus:outline-none focus:border-venom-orange transition-colors"
            placeholder="your@email.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-body font-bold text-beige mb-1">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade font-body text-bone-white focus:outline-none focus:border-venom-orange transition-colors"
            placeholder="Your password"
            autoComplete="current-password"
          />
        </div>

        {showForgotPassword && (
          <div className="text-right">
            <Link
              href="/auth/forgot-password"
              className="text-sm text-venom-orange hover:text-venom-orange-light font-body transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-3 rounded-arcade border-[3px] font-display uppercase tracking-arcade transition-all ${
            canSubmit
              ? 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98]'
              : 'bg-scale-blue-light border-scale-blue text-beige cursor-not-allowed opacity-50'
          }`}
        >
          {isLoading
            ? (isSignup ? 'Creating...' : 'Signing In...')
            : (isSignup ? 'Create Account' : 'Sign In')}
        </button>
      </form>

      {showSignUpLink && (
        <p className="text-center text-sm text-beige font-body">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <Link href="/login" className="text-venom-orange hover:text-venom-orange-light transition-colors">
                Sign in
              </Link>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-venom-orange hover:text-venom-orange-light transition-colors">
                Sign up
              </Link>
            </>
          )}
        </p>
      )}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-[2px] border-scale-blue-light" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-scale-blue text-beige font-body">or</span>
        </div>
      </div>

      <button
        onClick={handleGuestPlay}
        disabled={isLoading}
        className="w-full py-3 bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-bone-white hover:bg-scale-blue-light hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
      >
        Play as Guest
      </button>
    </div>
  );
}

export default LoginForm;
