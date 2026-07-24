'use client';

/**
 * AccountChip - persistent identity indicator for the command bar.
 *
 * Answers "am I logged in?" at a glance from every screen:
 * - Signed out entirely -> icon opens viewport-level sign-in choices
 * - Guest (anonymous session) -> subtle GUEST chip + "Save progress"
 *   affordance that opens the existing AccountUpgradeModal
 * - Registered -> email-derived initial in a small avatar square; tap
 *   opens a popover with the full email, Settings link and Sign out
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AccountUpgradeModal } from '@/components/auth/UpgradePrompt';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { IconUser, IconGear, IconX } from '@/components/ui/icons';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import {
  destinationBadge,
  useNotificationStore,
} from '@/lib/stores/notificationStore';

interface AccountChipProps {
  className?: string;
}

export function AccountChip({ className = '' }: AccountChipProps) {
  const { user, isAnonymous, isLoading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const notifications = useNotificationStore((state) => state.notifications);
  const clearDestination = useNotificationStore((state) => state.clearDestination);
  const accountBadge = destinationBadge(notifications, 'account');

  useEffect(() => {
    if (user && !isAnonymous) clearDestination('account');
  }, [user, isAnonymous, clearDestination]);

  useEffect(() => {
    if (!isAnonymous) return;
    const openFromNotification = () => {
      if (window.location.hash === '#save-progress') setShowUpgrade(true);
    };
    openFromNotification();
    window.addEventListener('hashchange', openFromNotification);
    return () => window.removeEventListener('hashchange', openFromNotification);
  }, [isAnonymous]);

  const closeUpgrade = () => {
    setShowUpgrade(false);
    if (window.location.hash === '#save-progress') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  };

  // Close the popover on outside taps
  useEffect(() => {
    // The signed-out surface is a viewport-level modal with its own backdrop.
    // This listener is only for the registered account popover that remains
    // attached to the chip.
    if (!menuOpen || !user) return;
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
  }, [menuOpen, user]);

  if (isLoading) return null;

  // Fully signed out (no anonymous session either): a square icon chip that
  // matches the rail's proportions - a text button broke the icon rhythm.
  // Opens a viewport-level dialog so the auth choices cannot inherit the
  // animated navigation rail's stacking context or clipping boundaries.
  if (!user) {
    return (
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          data-testid="account-chip"
          aria-label="Sign in"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? 'account-auth-dialog' : undefined}
          className="flex items-center justify-center w-10 h-10 rounded-arcade border border-scale-blue-light/60 bg-scale-blue/50 text-beige hover:text-bone-white hover:border-venom-orange/60 transition-all"
        >
          <IconUser size={18} />
        </button>
        {menuOpen && (
          <ModalDialog
            id="account-auth-dialog"
            testId="account-auth-dialog"
            onClose={() => setMenuOpen(false)}
            ariaLabelledBy="account-auth-dialog-title"
            ariaDescribedBy="account-auth-dialog-description"
            panelClassName="panel-elevated max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 animate-pop-in"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 id="account-auth-dialog-title" className="label-arcade text-bone-white">
                Join the run
              </h2>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close sign in dialog"
                className="-m-2 flex min-h-[44px] min-w-[44px] items-center justify-center text-beige transition-colors hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
              >
                <IconX size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href="/login"
                className="btn-go px-3 py-2.5 text-center text-xs"
                onClick={() => setMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="btn-neutral px-3 py-2.5 text-center text-xs"
                onClick={() => setMenuOpen(false)}
              >
                Create Account
              </Link>
            </div>
            <p
              id="account-auth-dialog-description"
              className="mt-3 text-[11px] leading-snug text-beige/60 font-body"
            >
              Or just hit Launch - you can play instantly as a guest and save
              your progress later.
            </p>
          </ModalDialog>
        )}
      </div>
    );
  }

  // Guest identity is always visible. Save-progress emphasis is notification-
  // driven only after gameplay has established value; the chip remains an
  // explicit, voluntary way to open account creation at any time.
  if (isAnonymous) {
    return (
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          onClick={() => setShowUpgrade(true)}
          data-testid="account-chip"
          aria-label={accountBadge.kind === 'hidden' ? 'Playing as guest' : 'Playing as guest - save progress available'}
          className="relative flex items-center gap-2 px-2 py-1 min-h-[44px] rounded-arcade border border-scale-blue-light/60 bg-scale-blue/50 hover:border-venom-orange/60 transition-all"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-arcade border border-scale-blue-light/70 bg-void/70 text-beige">
            <IconUser size={13} />
          </span>
          <span className="flex flex-col items-start leading-tight text-left">
            <span className="font-display text-[10px] tracking-wide-arcade text-beige/80 uppercase">
              Guest
            </span>
            {accountBadge.kind !== 'hidden' && (
              <span className="hidden sm:block font-body text-[10px] font-semibold text-venom-orange">
                Save progress
              </span>
            )}
          </span>
          <NotificationBadge
            kind={accountBadge.kind}
            count={accountBadge.count}
            label="Save progress available"
            className="absolute -right-1 -top-1"
          />
        </button>
        <AccountUpgradeModal
          isOpen={showUpgrade}
          onClose={closeUpgrade}
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
