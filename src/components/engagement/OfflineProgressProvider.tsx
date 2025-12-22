'use client';

/**
 * OfflineProgressProvider
 *
 * Wraps the app to handle offline progress calculation and modal display.
 * Uses useOfflineProgress hook internally.
 */

import { ReactNode } from 'react';
import { useOfflineProgress } from '@/hooks/useOfflineProgress';
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

  return (
    <>
      {children}
      <WelcomeBackModal
        isVisible={showModal}
        progress={progress}
        onClaim={claimRewards}
        onDismiss={dismissModal}
        isLoading={isLoading}
      />
    </>
  );
}

export default OfflineProgressProvider;
