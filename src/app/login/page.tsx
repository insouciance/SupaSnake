'use client';

/**
 * Login Page - For returning users
 * Supports email/password, OAuth, and guest play
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LoginForm } from '@/components/auth/LoginForm';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isAnonymous, isLoading } = useAuth();
  // Latch the first completed auth check: the global isLoading also flips
  // during a sign-in attempt, and swapping to the spinner then would unmount
  // LoginForm mid-request and lose its error state ("Invalid login
  // credentials" never rendered).
  const [initialAuthChecked, setInitialAuthChecked] = useState(false);

  const returnTo = searchParams.get('returnTo') || '/game';

  useEffect(() => {
    if (!isLoading && !initialAuthChecked) {
      setInitialAuthChecked(true);
    }
  }, [isLoading, initialAuthChecked]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isAnonymous) {
      router.push(returnTo);
    }
  }, [isAuthenticated, isAnonymous, isLoading, router, returnTo]);

  const handleLoginSuccess = () => {
    router.push(returnTo);
  };

  if (isLoading && !initialAuthChecked) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-t-transparent border-venom-orange rounded-full mx-auto" />
          <p className="text-beige font-body">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8 animate-fade-up">
          <Link href="/" className="inline-block">
            <span className="animate-float inline-block">
              <Image
                src="/brand/mascot-sm.png"
                alt="SupaSnake mascot"
                width={104}
                height={104}
                priority
                className="mx-auto mb-3 w-24 h-auto drop-shadow-[0_0_28px_rgba(34,211,238,0.4)]"
              />
            </span>
            <h1 className="heading-display text-glow-orange text-venom-orange text-4xl">
              SUPASNAKE
            </h1>
          </Link>
          <p className="text-beige mt-2 font-body">Welcome back!</p>
        </div>

        {/* Guest with an active session: switching accounts changes profiles */}
        {isAnonymous && (
          <div
            className="panel p-4 mb-4 animate-fade-up border-venom-orange/50"
            data-testid="guest-signin-warning"
          >
            <p className="text-beige text-sm font-body">
              <span className="label-arcade text-venom-orange mr-2">Heads up</span>
              You&apos;re playing as a guest. Signing in switches this device to
              that account&apos;s progress.
            </p>
            <p className="text-beige/80 text-sm font-body mt-2">
              Want to keep your guest snakes and DNA?{' '}
              <Link
                href="/signup"
                className="text-venom-orange underline hover:text-venom-orange-light"
              >
                Create an account
              </Link>{' '}
              - your progress comes with you.
            </p>
          </div>
        )}

        {/* Login Card */}
        <div
          className="panel-glow p-6 animate-fade-up"
          style={{ '--glow': '#22d3ee', animationDelay: '100ms' } as React.CSSProperties}
        >
          <h2 className="heading-display text-xl text-bone-white mb-6">Sign In</h2>
          <LoginForm onSuccess={handleLoginSuccess} />
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-beige/60 hover:text-bone-white text-sm font-body transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="app-bg min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin w-12 h-12 border-4 border-t-transparent border-venom-orange rounded-full mx-auto" />
            <p className="text-beige font-body">Loading...</p>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
