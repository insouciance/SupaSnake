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
import {
  isUpgradeBannerDismissed,
  dismissUpgradeBanner,
} from '@/lib/auth/upgradePrompts';

interface AccountUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountUpgradeModal({ isOpen, onClose }: AccountUpgradeModalProps) {
  const { isAnonymous } = useAuth();

  if (!isOpen || !isAnonymous) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scale-blue-dark/80 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Create an account"
      data-testid="account-upgrade-modal"
    >
      <AccountUpgrade onClose={onClose} className="w-full max-w-md my-8" />
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

  if (isLoading || !isAnonymous || !hydrated) return null;

  const handleDismiss = () => {
    dismissUpgradeBanner();
    setDismissed(true);
  };

  return (
    <>
      {dismissed ? (
        <button
          onClick={() => setShowModal(true)}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2 px-3 py-2 bg-scale-blue border-[2px] border-venom-orange/60 rounded-arcade text-xs font-body text-venom-orange hover:bg-scale-blue-light hover:border-venom-orange transition-all shadow-lg"
          data-testid="save-progress-chip"
          aria-label="Save your progress - create an account"
        >
          <span aria-hidden="true">💾</span>
          <span>Save progress</span>
        </button>
      ) : (
        <div
          className="fixed top-14 inset-x-0 z-40 bg-scale-blue border-b-[2px] border-venom-orange-dark px-4 py-3 shadow-lg"
          data-testid="save-progress-banner"
        >
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-beige text-sm font-body">
              <span className="text-venom-orange font-display uppercase tracking-arcade mr-2">
                Save your progress
              </span>
              You are playing as a guest - create an account to keep your snakes if this
              device is lost.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-venom-orange border-[2px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-xs text-scale-blue-dark hover:bg-venom-orange-light transition-all"
              >
                Create Account
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2 text-beige/60 hover:text-beige text-xs font-body transition-colors"
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
