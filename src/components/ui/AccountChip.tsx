'use client';

/**
 * AccountChip - persistent identity indicator for the command bar.
 *
 * Answers "am I logged in?" at a glance from every screen:
 * - Signed out entirely -> "Sign in" link to /login
 * - Guest (anonymous session) -> subtle GUEST chip + "Save progress"
 *   affordance that opens the existing AccountUpgradeModal
 * - Registered -> email-derived initial in a small avatar square; tap
 *   opens a popover with the full email, Settings link and Sign out
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AccountUpgradeModal } from '@/components/auth/UpgradePrompt';
import { IconUser, IconGear } from '@/components/ui/icons';

interface AccountChipProps {
  className?: string;
}

export function AccountChip({ className = '' }: AccountChipProps) {
  const { user, isAnonymous, isLoading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside taps
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [menuOpen]);

  if (isLoading) return null;

  // Fully signed out (no anonymous session either): a square icon chip that
  // matches the rail's proportions - a text button broke the icon rhythm.
  // Opens a compact auth panel instead of hard-navigating to /login.
  if (!user) {
    return (
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          data-testid="account-chip"
          aria-label="Sign in"
          className="flex items-center justify-center w-10 h-10 rounded-arcade border border-scale-blue-light/60 bg-scale-blue/50 text-beige hover:text-bone-white hover:border-venom-orange/60 transition-all"
        >
          <IconUser size={18} />
        </button>
        {menuOpen && (
          <div
            className="absolute bottom-12 right-0 max-sm:bottom-12 sm:bottom-auto sm:top-0 sm:right-12 w-56 panel-elevated p-3 animate-pop-in z-50"
            data-testid="account-auth-menu"
            role="menu"
          >
            <p className="label-arcade mb-2">Join the run</p>
            <div className="flex flex-col gap-2">
              <Link href="/login" className="btn-go px-3 py-2 text-xs text-center" role="menuitem">
                Sign In
              </Link>
              <Link href="/signup" className="btn-neutral px-3 py-2 text-xs text-center" role="menuitem">
                Create Account
              </Link>
            </div>
            <p className="text-beige/60 text-[11px] font-body mt-2 leading-snug">
              Or just hit Launch - you can play instantly as a guest and save
              your progress later.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Guest (anonymous) - identity + save-progress affordance
  if (isAnonymous) {
    return (
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          onClick={() => setShowUpgrade(true)}
          data-testid="account-chip"
          aria-label="Playing as guest - save progress"
          className="flex items-center gap-2 px-2 py-1 min-h-[36px] rounded-arcade border border-scale-blue-light/60 bg-scale-blue/50 hover:border-venom-orange/60 transition-all"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-arcade border border-scale-blue-light/70 bg-void/70 text-beige">
            <IconUser size={13} />
          </span>
          <span className="flex flex-col items-start leading-tight text-left">
            <span className="font-display text-[10px] tracking-wide-arcade text-beige/80 uppercase">
              Guest
            </span>
            <span className="hidden sm:block font-body text-[10px] font-semibold text-venom-orange">
              Save progress
            </span>
          </span>
        </button>
        <AccountUpgradeModal
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
        />
      </div>
    );
  }

  // Registered - avatar square with email-derived initial
  const email = user.email ?? '';
  const initial = (email.charAt(0) || '?').toUpperCase();

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        onClick={() => setMenuOpen((open) => !open)}
        data-testid="account-chip"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`flex items-center justify-center w-9 h-9 min-h-[36px] rounded-arcade font-display text-sm text-void-deep bg-cta-gradient border border-venom-orange-light transition-all ${
          menuOpen
            ? 'shadow-glow-sm shadow-venom-orange/60'
            : 'hover:shadow-glow-sm hover:shadow-venom-orange/40'
        }`}
      >
        {initial}
      </button>

      {menuOpen && (
        <div
          data-testid="account-chip-menu"
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 panel-elevated p-2 space-y-1 text-left animate-pop-in z-50"
        >
          <p className="px-2 py-1.5 text-xs font-body text-beige break-all border-b border-scale-blue-light/40">
            Signed in as{' '}
            <span className="text-bone-white font-semibold">{email}</span>
          </p>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 px-2 py-2 min-h-[40px] rounded-arcade text-sm font-body font-semibold text-beige hover:text-bone-white hover:bg-scale-blue/60 transition-colors"
          >
            <IconGear size={15} />
            Settings
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              signOut();
            }}
            className="flex items-center gap-2 w-full px-2 py-2 min-h-[40px] rounded-arcade text-sm font-body font-semibold text-strike-red/90 hover:text-strike-red hover:bg-strike-red/10 transition-colors text-left"
          >
            <IconUser size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default AccountChip;
