'use client';

/**
 * Reset Password Page - Set new password after email click
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { IconCheck } from '@/components/ui/icons';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { updatePassword, isPasswordRecovery, isLoading, isAuthenticated } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push('At least 8 characters');
    if (!/[A-Z]/.test(pwd)) errors.push('One uppercase letter');
    if (!/[a-z]/.test(pwd)) errors.push('One lowercase letter');
    if (!/[0-9]/.test(pwd)) errors.push('One number');
    return errors;
  };

  const passwordErrors = validatePassword(password);
  const isPasswordValid = passwordErrors.length === 0;
  const passwordsMatch = password === confirmPassword;
  const canSubmit = isPasswordValid && passwordsMatch && !isLoading;

  useEffect(() => {
    if (!isLoading && !isPasswordRecovery && !isAuthenticated) {
      setError('Invalid or expired reset link. Please request a new one.');
    }
  }, [isLoading, isPasswordRecovery, isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    const result = await updatePassword(password);
    if (result.error) {
      setError(result.error.message);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push('/game');
      }, 2000);
    }
  };

  if (success) {
    return (
      <div className="app-bg min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="panel-elevated animate-pop-in p-6 text-center">
            <IconCheck size={40} className="mx-auto mb-4 text-rarity-uncommon drop-shadow-[0_0_12px_rgba(74,222,128,0.6)]" />
            <h2 className="heading-display text-xl text-rarity-uncommon mb-2">Password Updated!</h2>
            <p className="text-beige font-body">
              Redirecting you to the game...
            </p>
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
          <p className="text-beige font-body mt-2">Set your new password</p>
        </div>

        {/* Form Card */}
        <div
          className="panel-glow p-6 animate-fade-up"
          style={{ '--glow': '#22d3ee', animationDelay: '100ms' } as React.CSSProperties}
        >
          <h2 className="heading-display text-xl text-bone-white mb-6">New Password</h2>

          {error && (
            <div className="bg-strike-red/15 border-2 border-strike-red rounded-arcade p-3 mb-4">
              <p className="text-strike-red text-sm font-body font-semibold">{error}</p>
              {error.includes('expired') && (
                <Link
                  href="/auth/forgot-password"
                  className="text-venom-orange hover:text-venom-orange-light text-sm mt-2 inline-block font-body"
                >
                  Request new reset link
                </Link>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block label-arcade mb-1.5">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 min-h-[44px] bg-void-deep/70 border-2 border-scale-blue-light rounded-arcade text-bone-white font-body placeholder:text-beige/40 focus:border-venom-orange focus:outline-none transition-colors"
                placeholder="Create a new password"
                autoComplete="new-password"
              />
              {password && passwordErrors.length > 0 && (
                <div className="text-xs mt-1 text-beige/60 font-body">
                  Missing: {passwordErrors.join(', ')}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block label-arcade mb-1.5">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 min-h-[44px] bg-void-deep/70 border-2 border-scale-blue-light rounded-arcade text-bone-white font-body placeholder:text-beige/40 focus:border-venom-orange focus:outline-none transition-colors"
                placeholder="Confirm your password"
                autoComplete="new-password"
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-strike-red text-xs mt-1 font-body">Passwords don&apos;t match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-go w-full py-3 min-h-[48px]"
            >
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
