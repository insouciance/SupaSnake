'use client';

/**
 * Snake Lab - Collection Browser
 * Integrates all Collection UI components for the complete Lab experience.
 * Uses useCollection hook for state management + gameStore for energy.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth/AuthProvider';
import { AccountUpgradeModal } from '@/components/auth/UpgradePrompt';
import { shouldShowUpgradePrompt, markUpgradePrompted } from '@/lib/auth/upgradePrompts';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import { useGameStore } from '@/lib/store/gameStore';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';

import { Navigation } from '@/components/ui/Navigation';
import { LabHeader } from '@/components/lab/LabHeader';
import { DynastyTabs } from '@/components/lab/DynastyTabs';
import { CollectionProgress } from '@/components/lab/CollectionProgress';
import { CollectionGrid } from '@/components/lab/CollectionGrid';
import { VariantDetailModal } from '@/components/lab/VariantDetailModal';
import { UnlockConfirmModal } from '@/components/lab/UnlockConfirmModal';

import type { SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';

// =============================================================================
// COMPONENT
// =============================================================================

export default function LabPage() {
  const router = useRouter();
  const { isAuthenticated, isAnonymous, isLoading: authLoading } = useAuth();
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // Collection state from hook
  const {
    dynasties,
    dnaBalance,
    activeDynastyId,
    currentDynastyVariants,
    currentDynastyOwned,
    completionByDynasty,
    equippedSnake,
    selectedVariant,
    selectedOwned,
    isDetailModalOpen,
    isUnlockModalOpen,
    isLoading,
    error,
    setActiveDynasty,
    openDetailModal,
    closeDetailModal,
    openUnlockModal,
    closeUnlockModal,
    unlockVariant,
    equipSnake,
    refresh,
  } = useCollection();

  // Get modal loading/error states directly from store
  const isUnlocking = useCollectionStore((state) => state.isUnlocking);
  const isEquipping = useCollectionStore((state) => state.isEquipping);
  const unlockError = useCollectionStore((state) => state.unlockError);

  // Get energy from game store
  const energy = useGameStore((state) => state.energy);
  const maxEnergy = useGameStore((state) => state.maxEnergy);

  // Get active dynasty object for modals
  const activeDynasty = dynasties.find((d) => d.id === activeDynastyId);

  // Get dynasty theme for current dynasty
  const dynastyTheme = useDynastyTheme(activeDynasty?.name ?? 'CYBER');

  // Get current dynasty completion stats
  const currentCompletion = activeDynastyId
    ? completionByDynasty[activeDynastyId] ?? { owned: 0, total: 0 }
    : { owned: 0, total: 0 };

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  /**
   * Handle variant card selection
   * - If owned: open detail modal
   * - If locked: open unlock modal
   */
  const handleSelectVariant = useCallback(
    (variant: SnakeVariant, owned: OwnedSnake | null) => {
      if (owned) {
        openDetailModal(variant, owned);
      } else {
        openUnlockModal(variant);
      }
    },
    [openDetailModal, openUnlockModal]
  );

  /**
   * Handle unlock confirmation
   */
  const handleUnlockConfirm = useCallback(async () => {
    if (selectedVariant) {
      await unlockVariant(selectedVariant.id);

      // High-investment moment: after the first successful unlock, prompt
      // anonymous players once to secure their progress with an account
      const succeeded = useCollectionStore.getState().unlockError === null;
      if (succeeded && isAnonymous && shouldShowUpgradePrompt('first-unlock')) {
        markUpgradePrompted('first-unlock');
        setShowUpgradePrompt(true);
      }
    }
  }, [selectedVariant, unlockVariant, isAnonymous]);

  /**
   * Handle equip action from detail modal
   */
  const handleEquip = useCallback(async () => {
    if (selectedOwned) {
      await equipSnake(selectedOwned.id);
    }
  }, [selectedOwned, equipSnake]);

  /**
   * Handle breed action - navigate to the Breeding Lab
   */
  const handleBreed = useCallback(() => {
    router.push('/lab/breed');
  }, [router]);

  // ---------------------------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------------------------

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] text-bone-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen pt-14">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#8892b0] font-body">Loading your collection...</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // NOT AUTHENTICATED
  // ---------------------------------------------------------------------------

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] text-bone-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen pt-14 px-4">
          <div className="bg-[#16213e] border-2 border-[#00FFFF]/30 rounded-lg p-8 text-center max-w-md space-y-6">
            <h1 className="text-3xl font-display uppercase tracking-arcade text-[#00FFFF]">
              Snake Lab
            </h1>
            <p className="text-[#8892b0] font-body">
              Sign in to view your snake collection and unlock new variants.
            </p>
            <Link
              href="/login"
              className="inline-block px-8 py-3 bg-[#00FFFF] rounded-lg font-display uppercase tracking-arcade text-[#1a1a2e] hover:bg-[#00FFFF]/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Sign In to Play
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ERROR STATE
  // ---------------------------------------------------------------------------

  if (error && dynasties.length === 0) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] text-bone-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen pt-14 px-4">
          <div className="bg-[#16213e] border-2 border-[#f87171]/30 rounded-lg p-8 text-center max-w-md space-y-6">
            <h1 className="text-3xl font-display uppercase tracking-arcade text-[#f87171]">
              Error
            </h1>
            <p className="text-[#8892b0] font-body">{error}</p>
            <button
              onClick={refresh}
              className="inline-block px-8 py-3 bg-[#00FFFF] rounded-lg font-display uppercase tracking-arcade text-[#1a1a2e] hover:bg-[#00FFFF]/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Global navigation */}
      <Navigation />

      {/* Header with energy and DNA - add top padding for fixed nav */}
      <div className="pt-14">
        <LabHeader energy={energy} maxEnergy={maxEnergy} dna={dnaBalance} />
      </div>

      {/* Dynasty tabs */}
      {activeDynastyId && dynasties.length > 0 && (
        <DynastyTabs
          dynasties={dynasties}
          activeDynastyId={activeDynastyId}
          onSelect={setActiveDynasty}
          completionByDynasty={completionByDynasty}
        />
      )}

      {/* Collection progress indicator + Breeding Lab entry */}
      {activeDynasty && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <CollectionProgress
                owned={currentCompletion.owned}
                total={currentCompletion.total}
                dynastyTheme={dynastyTheme}
              />
            </div>
            <Link
              href="/lab/breed"
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-[#00FFFF]/10 text-[#00FFFF] border border-[#00FFFF]/40 hover:bg-[#00FFFF]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              style={{ minHeight: '44px' }}
              aria-label="Open Breeding Lab"
              data-testid="breed-entry-link"
            >
              <span role="img" aria-hidden="true">🧪</span>
              <span>Breed</span>
            </Link>
          </div>
        </div>
      )}

      {/* Error banner (non-fatal) */}
      {error && dynasties.length > 0 && (
        <div className="px-4 py-3">
          <div className="max-w-6xl mx-auto">
            <div className="p-4 bg-[#f87171]/20 border border-[#f87171]/30 rounded-lg flex items-center justify-between">
              <p className="text-[#f87171] font-body text-sm">{error}</p>
              <button
                onClick={refresh}
                className="text-[#f87171] hover:text-white text-sm font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection grid */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-6xl mx-auto">
          <CollectionGrid
            variants={currentDynastyVariants}
            ownedSnakes={currentDynastyOwned}
            dynastyTheme={dynastyTheme}
            onSelectVariant={handleSelectVariant}
            isLoading={isLoading}
            equippedSnakeId={equippedSnake?.id}
          />
        </div>
      </div>

      {/* Variant Detail Modal - for owned snakes */}
      {selectedVariant && selectedOwned && activeDynasty && (
        <VariantDetailModal
          variant={selectedVariant}
          owned={selectedOwned}
          dynasty={activeDynasty}
          isOpen={isDetailModalOpen}
          onClose={closeDetailModal}
          onEquip={handleEquip}
          onBreed={handleBreed}
          isEquipping={isEquipping}
          isEquipped={equippedSnake?.id === selectedOwned.id}
        />
      )}

      {/* Unlock Confirm Modal - for locked variants */}
      {selectedVariant && activeDynasty && (
        <UnlockConfirmModal
          variant={selectedVariant}
          dynasty={activeDynasty}
          currentDna={dnaBalance}
          isOpen={isUnlockModalOpen}
          onClose={closeUnlockModal}
          onConfirm={handleUnlockConfirm}
          isUnlocking={isUnlocking}
          error={unlockError}
        />
      )}

      {/* One-time account upgrade prompt after the first unlock */}
      <AccountUpgradeModal
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
      />
    </div>
  );
}
