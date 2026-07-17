'use client';

/**
 * Account Upgrade Component
 * Allows anonymous users to upgrade to email auth
 * Per BM-004: Appears after engagement, not during tutorial
 */

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { IconCheck } from '@/components/ui/icons';

interface AccountUpgradeProps {
  onClose?: () => void;
  className?: string;
}

const INPUT_CLASSES =
  'w-full px-4 py-2.5 min-h-[44px] bg-void-deep/70 border-2 border-scale-blue-light rounded-arcade font-body text-bone-white placeholder:text-beige/40 focus:outline-none focus:border-venom-orange transition-colors';

export function AccountUpgrade({ onClose, className = '' }: AccountUpgradeProps) {
  const { isAnonymous, upgradeAnonymousToEmail, signInWithOAuth, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isAnonymous) {
    return null;
  }

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
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = isEmailValid && isPasswordValid && passwordsMatch && !isLoading;

  const handleEmailUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    const result = await upgradeAnonymousToEmail(email, password);
    if (result.error) {
      setError(result.error.message);
    } else {
      setSuccess(true);
    }
  };

  const handleOAuthUpgrade = async (provider: 'google' | 'apple') => {
    setError(null);
    const result = await signInWithOAuth(provider);
    if (result.error) {
      setError(result.error.message);
    }
  };

  if (success) {
    return (
      <div
        className={`panel-glow p-6 animate-pop-in ${className}`}
        style={{ '--glow': '#4ade80' } as React.CSSProperties}
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-rarity-uncommon/15 rounded-arcade border-2 border-rarity-uncommon shadow-glow-sm shadow-rarity-uncommon/50 flex items-center justify-center">
            <IconCheck size={32} className="text-rarity-uncommon" />
          </div>
          <h3 className="heading-display text-xl text-rarity-uncommon mb-2">Account Upgraded!</h3>
          <p className="text-beige font-body">
            Check your email to confirm your account.
          </p>
          {onClose && (
            <button onClick={onClose} className="btn-neutral mt-4 px-6 py-2 min-h-[44px]">
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`panel-glow p-6 ${className}`}
      style={{ '--glow': '#D98324' } as React.CSSProperties}
    >
      <h3 className="heading-display text-xl text-venom-orange mb-2">Save Your Progress</h3>
      <p className="text-beige/70 text-sm font-body mb-6">
        Create an account to keep your collection across devices
      </p>

      {error && (
        <div className="bg-strike-red/15 border-2 border-strike-red rounded-arcade p-3 mb-4">
          <p className="text-strike-red text-sm font-body font-semibold">{error}</p>
        </div>
      )}

      {/* OAuth Options */}
      <div className="space-y-3 mb-6">
        <button
          onClick={() => handleOAuthUpgrade('google')}
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
          onClick={() => handleOAuthUpgrade('apple')}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 min-h-[44px] bg-void-deep border-2 border-scale-blue-light rounded-arcade font-body font-bold text-bone-white hover:border-beige/60 hover:bg-scale-blue/40 transition-all disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          Continue with Apple
        </button>
      </div>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 divider-glow" />
        <span className="text-sm text-beige/70 font-body">or with email</span>
        <div className="flex-1 divider-glow" />
      </div>

      {/* Email Form */}
      <form onSubmit={handleEmailUpgrade} className="space-y-4">
        <div>
          <label htmlFor="email" className="block label-arcade mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLASSES}
            placeholder="your@email.com"
          />
          {email && !isEmailValid && (
            <p className="text-strike-red text-xs mt-1 font-body">Enter a valid email</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block label-arcade mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT_CLASSES}
            placeholder="Create a password"
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
            className={INPUT_CLASSES}
            placeholder="Confirm password"
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
          {isLoading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>

      {onClose && (
        <button
          onClick={onClose}
          className="w-full mt-4 py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
        >
          Maybe Later
        </button>
      )}
    </div>
  );
}

export default AccountUpgrade;
