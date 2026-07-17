'use client';

/**
 * Upgrade prompt surfaces for anonymous users:
 * - AccountUpgradeModal: full-screen overlay around AccountUpgrade
 * - SaveProgressBanner: dismissible home-page banner; collapses to a
 *   persistent corner chip after dismissal
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AccountUpgrade } from '@/components/auth/AccountUpgrade';
import { IconShield } from '@/components/ui/icons';
import {
  isUpgradeBannerDismissed,
  dismissUpgradeBanner,
} from '@/lib/auth/upgradePrompts';

interface AccountUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountUpgradeModal({ isOpen, onClose }: AccountUpgradeModalProps) {
  // Deliberately NOT gated on isAnonymous here: a successful upgrade flips
  // the flag mid-flow, and unmounting then would hide the success screen.
  // AccountUpgrade itself renders null for non-anonymous users pre-success.
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void-deep/85 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Create an account"
      data-testid="account-upgrade-modal"
    >
      <AccountUpgrade onClose={onClose} className="w-full max-w-md my-8 animate-pop-in" />
    </div>
  );
}

/**
 * Home-page save-progress prompt for anonymous players.
 * Banner until dismissed; afterwards a subtle persistent corner chip.
 */
export function SaveProgressBanner() {
  const { isAnonymous, isLoading } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setDismissed(isUpgradeBannerDismissed());
    setHydrated(true);
  }, []);

  const handleDismiss = () => {
    dismissUpgradeBanner();
    setDismissed(true);
  };

  // The modal renders OUTSIDE the banner/chip gate: gating it on
  // isAnonymous/isLoading unmounted it mid-upgrade (auth state flips during
  // the request), destroying the form and its success screen - the reported
  // "fields just got emptied with no feedback" bug. Only the banner/chip
  // hide for registered players; the open modal survives the transition to
  // show "Progress Saved!".
  const showPromptSurfaces = !isLoading && isAnonymous && hydrated;

  return (
    <>
      {!showPromptSurfaces ? null : dismissed ? (
        <button
          onClick={() => setShowModal(true)}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2 px-3 py-2.5 min-h-[44px] bg-void-deep/90 border-2 border-venom-orange/60 rounded-arcade text-xs font-body font-semibold text-venom-orange hover:border-venom-orange transition-all shadow-glow-sm shadow-venom-orange/40"
          data-testid="save-progress-chip"
          aria-label="Save your progress - create an account"
        >
          <IconShield size={14} />
          <span>Save progress</span>
        </button>
      ) : (
        <div
          className="fixed top-14 inset-x-0 z-40 bg-void-deep/95 backdrop-blur-sm border-b-2 border-venom-orange-dark px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
          data-testid="save-progress-banner"
        >
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-beige text-sm font-body">
              <span className="label-arcade text-venom-orange mr-2">
                Save your progress
              </span>
              You are playing as a guest - create an account to keep your snakes if this
              device is lost.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowModal(true)}
                className="btn-go px-4 py-2.5 min-h-[44px] text-xs"
              >
                Create Account
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2.5 min-h-[44px] text-beige/60 hover:text-beige text-xs font-body transition-colors"
                aria-label="Dismiss save progress banner"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      <AccountUpgradeModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
