'use client';

/**
 * Signup Page - For new users
 * Email/password registration with verification
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LoginForm } from '@/components/auth/LoginForm';

export default function SignupPage() {
  const router = useRouter();
  const { isAuthenticated, isAnonymous, isLoading } = useAuth();

  useEffect(() => {
    // Redirect authenticated non-anonymous users to game
    if (!isLoading && isAuthenticated && !isAnonymous) {
      router.push('/game');
    }
  }, [isAuthenticated, isAnonymous, isLoading, router]);

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
          <p className="text-beige mt-2 font-body">Join the snake empire</p>
        </div>

        {/* Signup Card */}
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-6">Create Account</h2>
          <LoginForm mode="signup" />
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
