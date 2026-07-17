'use client';

/**
 * Signup Page - For new users
 * Email/password registration with verification.
 *
 * Anonymous players with an active session are routed through the UPGRADE
 * path (supabase.auth.updateUser attaches the email to the SAME user id) so
 * their progress is preserved. A plain signUp here would create a brand-new
 * empty account and orphan everything they earned as a guest.
 *
 * COPPA/GDPR: account creation is gated by a 13+ age check (AgeGate).
 * The gate lives only in the signup flow - anonymous play stays
 * friction-free. A prior verification (localStorage backup) skips the gate.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LoginForm } from '@/components/auth/LoginForm';
import { AccountUpgrade } from '@/components/auth/AccountUpgrade';
import AgeGate, { UnderageScreen } from '@/components/legal/AgeGate';

type AgeStatus = 'checking' | 'unverified' | 'verified' | 'underage';

export default function SignupPage() {
  const router = useRouter();
  const { isAuthenticated, isAnonymous, isLoading } = useAuth();
  const [ageStatus, setAgeStatus] = useState<AgeStatus>('checking');
  // Latched when the guest upgrade succeeds on this page, so the
  // "registered user -> /game" redirect below doesn't yank away the
  // success screen the moment isAnonymous flips to false.
  const [upgradedHere, setUpgradedHere] = useState(false);
  // Latched when a fresh auto-confirmed signup completes on this page:
  // that flow routes to "/" (home hosts the starter-selection FTUE), and
  // the /game redirect below must not race it.
  const [signedUpHere, setSignedUpHere] = useState(false);

  useEffect(() => {
    // Redirect already-registered users to game
    if (!isLoading && isAuthenticated && !isAnonymous && !upgradedHere && !signedUpHere) {
      router.push('/game');
    }
  }, [isAuthenticated, isAnonymous, isLoading, router, upgradedHere, signedUpHere]);

  // Skip the gate if this browser already passed verification
  useEffect(() => {
    try {
      const verified = window.localStorage.getItem('age_verified') === 'true';
      setAgeStatus(verified ? 'verified' : 'unverified');
    } catch {
      setAgeStatus('unverified');
    }
  }, []);

  if (isLoading || ageStatus === 'checking') {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-t-transparent border-venom-orange rounded-full mx-auto" />
          <p className="text-beige font-body">Loading...</p>
        </div>
      </div>
    );
  }

  if (ageStatus === 'underage') {
    return <UnderageScreen />;
  }

  if (ageStatus === 'unverified') {
    return (
      <AgeGate
        onVerified={() => setAgeStatus('verified')}
        onUnderage={() => setAgeStatus('underage')}
      />
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
          <p className="text-beige mt-2 font-body">Join the snake empire</p>
        </div>

        {/* Signup Card */}
        {isAuthenticated && (isAnonymous || upgradedHere) ? (
          // Active guest session: upgrade the SAME account so every snake,
          // DNA point and streak earned as a guest carries over.
          <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
            <p
              className="text-beige/80 text-sm font-body text-center mb-4"
              data-testid="signup-upgrade-note"
            >
              You&apos;re playing as a guest - your current progress will be
              attached to this account.
            </p>
            <AccountUpgrade onSuccess={() => setUpgradedHere(true)} />
          </div>
        ) : (
          <div
            className="panel-glow p-6 animate-fade-up"
            style={{ '--glow': '#22d3ee', animationDelay: '100ms' } as React.CSSProperties}
          >
            <h2 className="heading-display text-xl text-bone-white mb-6">Create Account</h2>
            <LoginForm
              mode="signup"
              onSuccess={() => {
                // New account is live (auto-confirm): land on home, where the
                // starter-selection FTUE opens for brand-new players.
                setSignedUpHere(true);
                router.push('/');
              }}
            />
          </div>
        )}

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
