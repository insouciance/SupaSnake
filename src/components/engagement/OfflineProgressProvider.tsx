'use client';

/**
 * OfflineProgressProvider
 *
 * Wraps the app to publish offline progress into the player-pulled inbox.
 * Uses useOfflineProgress hook internally.
 *
 * SupaSnake Premium: the daily +3 energy stipend rides the Welcome Back
 * claim - one tap collects offline rewards AND today's stipend (each
 * server-idempotent on its own).
 */

import { ReactNode, useEffect, useState } from 'react';
import { useOfflineProgress } from '@/hooks/useOfflineProgress';
import { useAuth } from '@/lib/auth/AuthProvider';
import { usePremiumStore } from '@/lib/stores/premiumStore';
import { PREMIUM_CONFIG } from '@/shared/config/premium';
import { WelcomeBackModal } from './WelcomeBackModal';
import {
  NOTIFICATION_TARGETS,
  subscribeNotificationAction,
  useNotificationStore,
} from '@/lib/stores/notificationStore';

interface OfflineProgressProviderProps {
  children: ReactNode;
}

export function OfflineProgressProvider({ children }: OfflineProgressProviderProps) {
  const {
    progress,
    showModal,
    isLoading,
    error,
    claimRewards,
    dismissModal,
  } = useOfflineProgress();

  const { session, isAuthenticated } = useAuth();
  const { isPremium, stipendClaimedToday, fetchStatus, claimStipend } =
    usePremiumStore();
  const publish = useNotificationStore((state) => state.publish);
  const clear = useNotificationStore((state) => state.clear);
  const notificationsHydrated = useNotificationStore((state) => state.hasHydrated);
  const [openedByPlayer, setOpenedByPlayer] = useState(false);

  useEffect(() => {
    const readHash = () => setOpenedByPlayer(window.location.hash === '#offline-rewards');
    const unsubscribe = subscribeNotificationAction(
      'open-offline-rewards',
      () => setOpenedByPlayer(true)
    );
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => {
      unsubscribe();
      window.removeEventListener('hashchange', readHash);
    };
  }, []);

  useEffect(() => {
    if (!notificationsHydrated || isLoading || error) return;
    if (!showModal || !progress?.hasRewards) {
      clear('offline-rewards');
      return;
    }
    const rewardParts = [
      progress.passiveDnaEarned > 0 ? `${progress.passiveDnaEarned} DNA` : null,
      progress.energyRestored > 0 ? `${progress.energyRestored} energy` : null,
    ].filter(Boolean);
    publish({
      id: 'offline-rewards',
      title: 'Offline rewards ready',
      description: rewardParts.length > 0
        ? `Claim ${rewardParts.join(' and ')} when you’re ready.`
        : 'Your return rewards are ready to claim.',
      ...NOTIFICATION_TARGETS.offlineRewards,
      badgeKind: 'exclamation',
      attentionReason: 'reward-available',
      actionLabel: 'Review rewards',
    });
  }, [
    clear,
    error,
    isLoading,
    notificationsHydrated,
    showModal,
    progress,
    publish,
  ]);

  useEffect(() => {
    if (isAuthenticated && session?.access_token) {
      fetchStatus(session.access_token);
    }
  }, [isAuthenticated, session?.access_token, fetchStatus]);

  const stipendAvailable = isPremium && !stipendClaimedToday;

  const clearHash = () => {
    if (window.location.hash === '#offline-rewards') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setOpenedByPlayer(false);
  };

  const handleClaim = async () => {
    const claimed = await claimRewards();
    if (!claimed) return;
    if (stipendAvailable && session?.access_token) {
      // Fire-and-forget: the RPC is idempotent per UTC day
      void claimStipend(session.access_token);
    }
    clear('offline-rewards');
    clearHash();
  };

  const handleDismiss = () => {
    dismissModal();
    clear('offline-rewards');
    clearHash();
  };

  return (
    <>
      {children}
      <WelcomeBackModal
        isVisible={showModal && openedByPlayer}
        progress={progress}
        onClaim={handleClaim}
        onDismiss={handleDismiss}
        isLoading={isLoading}
        stipendEnergy={stipendAvailable ? PREMIUM_CONFIG.stipendEnergyPerDay : null}
      />
    </>
  );
}

export default OfflineProgressProvider;
