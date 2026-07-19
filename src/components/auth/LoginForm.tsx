'use client';

/**
 * Login Form Component - Reusable email/password login
 * Used on login page and for session recovery
 */

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import Link from 'next/link';
import { IconCheck } from '@/components/ui/icons';

interface FormError {
  text: string;
  /** Offer a "sign in instead" shortcut (signup with an existing email). */
  offerSignIn?: boolean;
}

/** Map raw Supabase auth errors to friendly, actionable copy. */
export function describeAuthError(message: string, mode: 'login' | 'signup'): FormError {
  if (/already (been )?registered|already exists/i.test(message)) {
    return {
      text: 'That email already has a SupaSnake account.',
      offerSignIn: mode === 'signup',
    };
  }
  if (/invalid login credentials/i.test(message)) {
    return {
      text: 'Wrong email or password. Double-check for typos, or reset your password below.',
    };
  }
  if (/rate limit|too many/i.test(message)) {
    return { text: 'Too many attempts. Take a breather and try again in a minute.' };
  }
  return { text: message };
}

interface LoginFormProps {
  mode?: 'login' | 'signup';
  onSuccess?: () => void;
  showForgotPassword?: boolean;
  showSignUpLink?: boolean;
  className?: string;
}

const INPUT_CLASSES =
  'w-full px-4 py-2.5 min-h-[44px] bg-void-deep/70 border-2 border-scale-blue-light rounded-arcade font-body text-bone-white placeholder:text-beige/40 focus:outline-none focus:border-venom-orange transition-colors';

/** Divider with edge-fading glow line and centered label */
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 divider-glow" />
      <span className="text-sm text-beige/70 font-body">{label}</span>
      <div className="flex-1 divider-glow" />
    </div>
  );
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const isSignup = mode === 'signup';

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit =
    isEmailValid &&
    password.length >= 8 &&
    !isLoading &&
    (!isSignup || termsAccepted);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    if (isSignup) {
      const result = await signUpWithEmail(email, password);
      if (result.error) {
        setError(describeAuthError(result.error.message, 'signup'));
      } else if (result.session) {
        // Email auto-confirm is on: the account is live and signed in right
        // now - go straight into the game, no "check your email" dead end.
        onSuccess?.();
      } else {
        // Email verification required: show the check-your-email screen.
        setSignupSuccess(true);
      }
    } else {
      const result = await signInWithEmail(email, password);
      if (result.error) {
        setError(describeAuthError(result.error.message, 'login'));
      } else {
        onSuccess?.();
      }
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    setError(null);
    const result = await signInWithOAuth(provider);
    if (result.error) {
      setError(describeAuthError(result.error.message, mode));
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
        <div className="text-center space-y-4 animate-pop-in">
          <div className="w-16 h-16 mx-auto bg-venom-orange/15 rounded-arcade border-2 border-venom-orange shadow-glow-sm shadow-venom-orange/50 flex items-center justify-center">
            <IconCheck size={32} className="text-venom-orange" />
          </div>
          <h3 className="heading-display text-xl text-bone-white">Check your email!</h3>
          <p className="text-beige font-body">
            We sent a verification link to <span className="text-bone-white font-bold">{email}</span>
          </p>
          <p className="text-beige/60 text-sm font-body">
            Click the link in the email to verify your account and start playing.
          </p>
        </div>
        <Link href="/login" className="btn-neutral block w-full py-3 text-center">
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {error && (
        <div className="bg-strike-red/15 border-2 border-strike-red rounded-arcade p-3">
          <p className="text-strike-red text-sm font-body font-semibold">{error.text}</p>
          {error.offerSignIn && (
            <p className="text-beige text-xs font-body mt-2">
              <Link
                href="/login"
                className="text-venom-orange underline hover:text-venom-orange-light"
              >
                Sign in with that email instead
              </Link>
            </p>
          )}
        </div>
      )}

      {/* OAuth Options */}
      <div className="space-y-3">
        <button
          onClick={() => handleOAuthLogin('google')}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 min-h-[44px] bg-bone-white text-void-deep rounded-arcade border-2 border-beige font-body font-bold hover:bg-beige transition-all disabled:opacity-50"
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
          className="w-full flex items-center justify-center gap-3 px-4 py-3 min-h-[44px] bg-void-deep border-2 border-scale-blue-light rounded-arcade font-body font-bold text-bone-white hover:border-beige/60 hover:bg-scale-blue/40 transition-all disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          Continue with Apple
        </button>
      </div>

      <Divider label="or with email" />

      {/* Email Form */}
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block label-arcade mb-1.5">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLASSES}
            placeholder="your@email.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block label-arcade mb-1.5">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT_CLASSES}
            placeholder="Your password"
            autoComplete="current-password"
          />
        </div>

        {isSignup && (
          <label
            htmlFor="signup-terms"
            className="flex items-start gap-3 cursor-pointer text-sm text-beige font-body"
          >
            <input
              id="signup-terms"
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-venom-orange"
            />
            <span>
              I agree to the{' '}
              <Link
                href="/legal/terms"
                target="_blank"
                className="text-venom-orange hover:text-venom-orange-light underline"
              >
                Terms of Service
              </Link>{' '}
              and have read the{' '}
              <Link
                href="/legal/privacy"
                target="_blank"
                className="text-venom-orange hover:text-venom-orange-light underline"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}

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
          className="btn-go w-full py-3 min-h-[48px]"
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

      <Divider label="or" />

      <button
        onClick={handleGuestPlay}
        disabled={isLoading}
        className="btn-neutral w-full py-3 min-h-[48px]"
      >
        Play as Guest
      </button>

      <p className="text-center text-xs text-beige/60 font-body">
        By signing in with Google/Apple or playing as guest, you agree to our{' '}
        <Link
          href="/legal/terms"
          target="_blank"
          className="text-venom-orange/80 hover:text-venom-orange underline"
        >
          Terms
        </Link>{' '}
        and acknowledge the{' '}
        <Link
          href="/legal/privacy"
          target="_blank"
          className="text-venom-orange/80 hover:text-venom-orange underline"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

export default LoginForm;
