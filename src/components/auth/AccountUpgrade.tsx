'use client';

/**
 * Account Upgrade Component
 * Allows anonymous users to upgrade to email auth
 * Per BM-004: Appears after engagement, not during tutorial
 *
 * WHY THERE IS NO "CONTINUE WITH GOOGLE/APPLE" HERE (WP-E)
 *
 * There was, and it silently destroyed accounts. The buttons called
 * `signInWithOAuth`, which does exactly what its name says: it starts a NEW
 * sign-in. The guest's anonymous user id — and with it their DNA, snakes,
 * records and Chronicle — stayed behind on a user nobody could ever
 * authenticate into again. A panel headed "Protect Your Account" was the most
 * reliable way in the product to lose one.
 *
 * The correct primitive is `supabase.auth.linkIdentity()`, which attaches a
 * provider identity to the CURRENT user and keeps the id. It exists in the
 * pinned client (`@supabase/auth-js` 2.110.6 declares it), but calling it is
 * not enough: it requires **Enable Manual Linking** on the Supabase project's
 * auth settings, which is off by default, is a hosted setting no feature
 * branch may read or change, and appears nowhere in `supabase/config.toml`.
 * No external provider is configured there either, so the flow cannot be
 * exercised in the isolated local environment or in CI. An unverifiable fix to
 * an account-destroying path is not a fix.
 *
 * So the orphaning path is REMOVED rather than rewritten. The email path below
 * is correct — `upgradeAnonymousToEmail` preserves the user id — and is the
 * one this panel offers. `signInWithOAuth` remains where it belongs, on
 * `LoginForm`, where starting a new session is the intended outcome.
 *
 * TO RESTORE OAUTH HERE: enable Manual Linking on the project, add the
 * provider blocks to `supabase/config.toml` so the flow is testable, then call
 * `linkIdentity({ provider })` — never `signInWithOAuth` — and assert the user
 * id is unchanged across the round trip before shipping it.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { IconCheck, IconEdit } from '@/components/ui/icons';
import { HandleClaimModal } from '@/components/identity/HandleClaimModal';

interface AccountUpgradeProps {
  onClose?: () => void;
  /** Called once the upgrade succeeds (before the success screen renders). */
  onSuccess?: () => void;
  className?: string;
}

/** Map raw Supabase auth errors to friendly, actionable copy. */
export function describeUpgradeError(message: string): {
  text: string;
  offerSignIn: boolean;
} {
  if (/email_exists|already (been )?registered|already exists/i.test(message)) {
    return {
      text: 'That email already has a SupaSnake account.',
      offerSignIn: true,
    };
  }
  if (/rate limit|too many/i.test(message)) {
    return {
      text: 'Too many attempts. Take a breather and try again in a minute.',
      offerSignIn: false,
    };
  }
  if (/weak_password/i.test(message)) {
    return {
      text: 'Password needs at least 8 characters.',
      offerSignIn: false,
    };
  }
  if (/invalid_email/i.test(message)) {
    return { text: 'That email address does not look valid.', offerSignIn: false };
  }
  if (/network error/i.test(message)) {
    return { text: message, offerSignIn: false };
  }
  if (/upgrade_failed|server error/i.test(message)) {
    return {
      text: 'Something went wrong creating the account. Please try again.',
      offerSignIn: false,
    };
  }
  if (/password/i.test(message)) {
    return { text: message, offerSignIn: false };
  }
  return { text: message, offerSignIn: false };
}

const INPUT_CLASSES =
  'w-full px-4 py-2.5 min-h-[44px] bg-void-deep/70 border-2 border-scale-blue-light rounded-arcade font-body text-bone-white placeholder:text-beige/40 focus:outline-none focus:border-venom-orange transition-colors';

export function AccountUpgrade({ onClose, onSuccess, className = '' }: AccountUpgradeProps) {
  const { isAnonymous, upgradeAnonymousToEmail, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<{ text: string; offerSignIn: boolean } | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  // Identity v1 (section 3.3): the upgrade flow's handle step - offered
  // on the success screen, never required.
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimedHandle, setClaimedHandle] = useState<string | null>(null);

  // NOTE: after a successful upgrade the session refresh flips isAnonymous
  // to false, so the success screen must render BEFORE this guard.
  if (!isAnonymous && !success) {
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
  const canSubmit =
    isEmailValid && isPasswordValid && passwordsMatch && termsAccepted && !isLoading;

  const handleEmailUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    const result = await upgradeAnonymousToEmail(email, password);
    if (result.error) {
      setError(describeUpgradeError(result.error.message));
    } else {
      setPendingConfirmation(result.pendingEmailConfirmation);
      setSuccess(true);
      onSuccess?.();
    }
  };

  if (success) {
    return (
      <div
        className={`panel-glow p-6 animate-pop-in ${className}`}
        style={{ '--glow': '#4ade80' } as React.CSSProperties}
        data-testid="upgrade-success"
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-rarity-uncommon/15 rounded-arcade border-2 border-rarity-uncommon shadow-glow-sm shadow-rarity-uncommon/50 flex items-center justify-center">
            <IconCheck size={32} className="text-rarity-uncommon" />
          </div>
          <h3 className="heading-display text-xl text-rarity-uncommon mb-2">Progress Saved!</h3>
          <p className="text-beige font-body">
            {pendingConfirmation
              ? 'One last step: check your email and click the confirmation link to lock in your account.'
              : 'Your snakes, DNA and stats now live on your account - safe on any device.'}
          </p>
          {/* Identity v1 (section 3.3): the handle step - a real account
              deserves a real name. Optional, never a wall. */}
          <div className="mt-4">
            {claimedHandle ? (
              <p className="text-beige font-body text-sm" data-testid="upgrade-handle-claimed">
                You are <span className="text-bone-white font-bold">{claimedHandle}</span> now.
              </p>
            ) : (
              <button
                onClick={() => setClaimOpen(true)}
                data-testid="upgrade-claim-handle"
                className="btn-go inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px]"
              >
                <IconEdit size={16} />
                Claim your handle
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <Link href="/game" className="btn-go px-6 py-2.5 min-h-[44px]" onClick={onClose}>
              Keep Playing
            </Link>
            {onClose && (
              <button onClick={onClose} className="btn-neutral px-6 py-2 min-h-[44px]">
                Close
              </button>
            )}
          </div>
        </div>
        <HandleClaimModal
          isOpen={claimOpen}
          onClose={() => setClaimOpen(false)}
          onClaimed={(handle) => setClaimedHandle(handle)}
          prompt="Your progress is saved — now put a name on it."
        />
      </div>
    );
  }

  return (
    <div
      className={`panel-glow p-6 ${className}`}
      style={{ '--glow': '#22d3ee' } as React.CSSProperties}
    >
      <h3 className="heading-display text-xl text-venom-orange mb-2">Protect Your Account</h3>
      <p className="text-beige/70 text-sm font-body mb-6">
        Add a sign-in so this server-secured collection is recoverable across devices
      </p>

      {error && (
        <div className="bg-strike-red/15 border-2 border-strike-red rounded-arcade p-3 mb-4">
          <p className="text-strike-red text-sm font-body font-semibold">{error.text}</p>
          {error.offerSignIn && (
            <p className="text-beige text-xs font-body mt-2">
              <Link href="/login" className="text-venom-orange underline hover:text-venom-orange-light">
                Sign in to that account instead
              </Link>{' '}
              - heads up: signing in switches this device to that account&apos;s
              progress, and this guest run stays behind.
            </p>
          )}
        </div>
      )}

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

        <label
          htmlFor="upgrade-terms"
          className="flex items-start gap-3 cursor-pointer text-sm text-beige font-body"
        >
          <input
            id="upgrade-terms"
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
