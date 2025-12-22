'use client';

/**
 * Reset Password Page - Set new password after email click
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-scale-blue-dark px-4">
        <div className="w-full max-w-md">
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6 text-center">
            <div className="text-4xl mb-4 text-green-400">&#x2713;</div>
            <h2 className="text-xl font-display uppercase tracking-arcade text-green-400 mb-2">Password Updated!</h2>
            <p className="text-beige font-body">
              Redirecting you to the game...
            </p>
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
          <p className="text-beige font-body mt-2">Set your new password</p>
        </div>

        {/* Form Card */}
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-6">New Password</h2>

          {error && (
            <div className="bg-strike-red/20 border-[3px] border-strike-red rounded-arcade p-3 mb-4">
              <p className="text-strike-red text-sm font-body">{error}</p>
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
              <label htmlFor="password" className="block text-sm font-body text-beige mb-1">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
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
              <label htmlFor="confirmPassword" className="block text-sm font-body text-beige mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
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
              className={`w-full py-3 rounded-arcade border-[3px] font-display uppercase tracking-arcade transition-all ${
                canSubmit
                  ? 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98]'
                  : 'bg-scale-blue-light border-scale-blue-light text-beige cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
