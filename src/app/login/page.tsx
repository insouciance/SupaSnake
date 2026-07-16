'use client';

/**
 * Login Page - For returning users
 * Supports email/password, OAuth, and guest play
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LoginForm } from '@/components/auth/LoginForm';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isAnonymous, isLoading } = useAuth();

  const returnTo = searchParams.get('returnTo') || '/game';

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isAnonymous) {
      router.push(returnTo);
    }
  }, [isAuthenticated, isAnonymous, isLoading, router, returnTo]);

  const handleLoginSuccess = () => {
    router.push(returnTo);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-scale-blue-dark">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-t-transparent border-venom-orange rounded-full mx-auto" />
          <p className="text-beige font-body">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-scale-blue-dark px-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">
              OG Snake
            </h1>
          </Link>
          <p className="text-beige mt-2 font-body">Welcome back!</p>
        </div>

        {/* Login Card */}
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-6">Sign In</h2>
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
        <div className="min-h-screen flex items-center justify-center bg-scale-blue-dark">
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
