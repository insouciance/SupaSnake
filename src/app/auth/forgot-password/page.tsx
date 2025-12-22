'use client';

/**
 * Forgot Password Page - Request password reset email
 */

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function ForgotPasswordPage() {
  const { sendPasswordResetEmail, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = isEmailValid && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    const result = await sendPasswordResetEmail(email);
    if (result.error) {
      setError(result.error.message);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-scale-blue-dark px-4">
        <div className="w-full max-w-md">
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6 text-center">
            <div className="text-4xl mb-4">&#x2709;</div>
            <h2 className="text-xl font-display uppercase tracking-arcade text-green-400 mb-2">Check Your Email</h2>
            <p className="text-beige font-body mb-6">
              If an account exists for {email}, you&apos;ll receive a password reset link shortly.
            </p>
            <Link
              href="/login"
              className="inline-block px-6 py-2 bg-scale-blue-light border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-beige hover:text-bone-white hover:border-venom-orange transition-all"
            >
              Back to Login
            </Link>
          </div>
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
          <p className="text-beige font-body mt-2">Reset your password</p>
        </div>

        {/* Form Card */}
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-2">Forgot Password</h2>
          <p className="text-beige text-sm font-body mb-6">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          {error && (
            <div className="bg-strike-red/20 border-[3px] border-strike-red rounded-arcade p-3 mb-4">
              <p className="text-strike-red text-sm font-body">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-body text-beige mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
                placeholder="your@email.com"
                autoComplete="email"
              />
              {email && !isEmailValid && (
                <p className="text-strike-red text-xs mt-1 font-body">Enter a valid email</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full py-3 rounded-arcade border-[3px] font-display uppercase tracking-arcade transition-all ${
                canSubmit
                  ? 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98]'
                  : 'bg-scale-blue-light border-scale-blue-light text-beige cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-sm text-venom-orange hover:text-venom-orange-light font-body transition-colors"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
