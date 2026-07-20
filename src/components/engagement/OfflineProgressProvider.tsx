'use client';

/**
 * OfflineProgressProvider
 *
 * Wraps the app to handle offline progress calculation and modal display.
 * Uses useOfflineProgress hook internally.
 *
 * SupaSnake Premium: the daily +3 energy stipend rides the Welcome Back
 * claim - one tap collects offline rewards AND today's stipend (each
 * server-idempotent on its own).
 */

import { ReactNode, useEffect } from 'react';
import { useOfflineProgress } from '@/hooks/useOfflineProgress';
import { useAuth } from '@/lib/auth/AuthProvider';
import { usePremiumStore } from '@/lib/stores/premiumStore';
import { PREMIUM_CONFIG } from '@/shared/config/premium';
import { WelcomeBackModal } from './WelcomeBackModal';

interface OfflineProgressProviderProps {
  children: ReactNode;
}

export function OfflineProgressProvider({ children }: OfflineProgressProviderProps) {
  const {
    progress,
    showModal,
    isLoading,
    claimRewards,
    dismissModal,
  } = useOfflineProgress();

  const { session, isAuthenticated } = useAuth();
  const { isPremium, stipendClaimedToday, fetchStatus, claimStipend } =
    usePremiumStore();

  useEffect(() => {
    if (isAuthenticated && session?.access_token) {
      fetchStatus(session.access_token);
    }
  }, [isAuthenticated, session?.access_token, fetchStatus]);

  const stipendAvailable = isPremium && !stipendClaimedToday;

  const handleClaim = () => {
    claimRewards();
    if (stipendAvailable && session?.access_token) {
      // Fire-and-forget: the RPC is idempotent per UTC day
      claimStipend(session.access_token);
    }
  };

  return (
    <>
      {children}
      <WelcomeBackModal
        isVisible={showModal}
        progress={progress}
        onClaim={handleClaim}
        onDismiss={dismissModal}
        isLoading={isLoading}
        stipendEnergy={stipendAvailable ? PREMIUM_CONFIG.stipendEnergyPerDay : null}
      />
    </>
  );
}

export default OfflineProgressProvider;
