'use client';

/**
 * Forgot Password Page - Request password reset email
 */

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { IconCheck } from '@/components/ui/icons';

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
      <div className="app-bg min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="panel-elevated animate-pop-in p-6 text-center">
            <IconCheck size={40} className="mx-auto mb-4 text-rarity-uncommon drop-shadow-[0_0_12px_rgba(74,222,128,0.6)]" />
            <h2 className="heading-display text-xl text-rarity-uncommon mb-2">Check Your Email</h2>
            <p className="text-beige font-body mb-6">
              If an account exists for {email}, you&apos;ll receive a password reset link shortly.
            </p>
            <Link href="/login" className="btn-neutral inline-block px-6 py-2.5 min-h-[44px]">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8 animate-fade-up">
          <Link href="/" className="inline-block">
            <h1 className="heading-display text-glow-orange text-venom-orange text-4xl">
              SUPASNAKE
            </h1>
          </Link>
          <p className="text-beige font-body mt-2">Reset your password</p>
        </div>

        {/* Form Card */}
        <div
          className="panel-glow p-6 animate-fade-up"
          style={{ '--glow': '#22d3ee', animationDelay: '100ms' } as React.CSSProperties}
        >
          <h2 className="heading-display text-xl text-bone-white mb-2">Forgot Password</h2>
          <p className="text-beige text-sm font-body mb-6">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          {error && (
            <div className="bg-strike-red/15 border-2 border-strike-red rounded-arcade p-3 mb-4">
              <p className="text-strike-red text-sm font-body font-semibold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block label-arcade mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 min-h-[44px] bg-void-deep/70 border-2 border-scale-blue-light rounded-arcade text-bone-white font-body placeholder:text-beige/40 focus:border-venom-orange focus:outline-none transition-colors"
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
              className="btn-go w-full py-3 min-h-[48px]"
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
