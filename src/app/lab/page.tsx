'use client';

/**
 * Snake Lab - Collection Browser
 * Integrates all Collection UI components for the complete Lab experience.
 * Uses useCollection hook for state management + gameStore for energy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth/AuthProvider';
import { AccountUpgradeModal } from '@/components/auth/UpgradePrompt';
import { shouldShowUpgradePrompt, markUpgradePrompted } from '@/lib/auth/upgradePrompts';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import { useGameStore } from '@/lib/store/gameStore';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';
import { useToast } from '@/components/ui/Toast';
import { sanitizeLineage } from '@/shared/game/lineage';
import type { StrainId } from '@/shared/game/strains';

import { Navigation } from '@/components/ui/Navigation';
import { IconEgg } from '@/components/ui/icons';
import { LabHeader } from '@/components/lab/LabHeader';
import { DynastyTabs } from '@/components/lab/DynastyTabs';
import { CollectionProgress } from '@/components/lab/CollectionProgress';
import { MasteryPanel, type DynastyMasteryState } from '@/components/lab/MasteryPanel';
import { CollectionGrid } from '@/components/lab/CollectionGrid';
import { VariantDetailModal } from '@/components/lab/VariantDetailModal';
import { UnlockConfirmModal } from '@/components/lab/UnlockConfirmModal';

import type { SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';

// =============================================================================
// COMPONENT
// =============================================================================

export default function LabPage() {
  const router = useRouter();
  const { session, isAuthenticated, isAnonymous, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [codexUnlocked, setCodexUnlocked] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    fetch('/api/player', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setCodexUnlocked(data?.genomeFtue?.splicesUnlocked === true);
        }
      })
      .catch((err) => console.error('Failed to fetch Genome FTUE:', err));
    return () => { cancelled = true; };
  }, [session?.access_token]);

  // Per-dynasty mastery (Design v2 §7.1) - server-read; pre-migration-019
  // every dynasty reads level 0. Non-fatal: on error the panel just hides.
  const [masteryByDynasty, setMasteryByDynasty] = useState<
    Record<string, DynastyMasteryState>
  >({});
  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    fetch('/api/mastery', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.mastery) return;
        const byDynasty: Record<string, DynastyMasteryState> = {};
        for (const entry of data.mastery as DynastyMasteryState[]) {
          byDynasty[entry.dynasty] = entry;
        }
        setMasteryByDynasty(byDynasty);
      })
      .catch((err) => console.error('Failed to fetch mastery:', err));
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  // Celebrate a fresh unlock with a brief shimmer on the new card
  const [justUnlockedVariantId, setJustUnlockedVariantId] = useState<string | null>(null);
  const shimmerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (shimmerTimeoutRef.current) clearTimeout(shimmerTimeoutRef.current);
    };
  }, []);

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
  const updateOwnedSnake = useCollectionStore((state) => state.updateOwnedSnake);
  const setDnaBalance = useCollectionStore((state) => state.setDnaBalance);
  const [isUpdatingLineage, setIsUpdatingLineage] = useState(false);

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
      const unlockedId = selectedVariant.id;
      await unlockVariant(unlockedId);

      const succeeded = useCollectionStore.getState().unlockError === null;

      // Celebration shimmer on the freshly unlocked card
      if (succeeded) {
        setJustUnlockedVariantId(unlockedId);
        if (shimmerTimeoutRef.current) clearTimeout(shimmerTimeoutRef.current);
        shimmerTimeoutRef.current = setTimeout(() => {
          setJustUnlockedVariantId(null);
        }, 2400);
      }

      // High-investment moment: after the first successful unlock, prompt
      // anonymous players once to secure their progress with an account
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

  const updateLineage = useCallback(
    async (action: 'reroll' | 'select_primary', primary?: StrainId) => {
      if (!selectedOwned || !session?.access_token || isUpdatingLineage) return;
      setIsUpdatingLineage(true);
      try {
        const response = await fetch('/api/breeding/lineage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action,
            snake_id: selectedOwned.id,
            ...(primary ? { primary } : {}),
          }),
        });
        const data = await response.json();
        const lineage = sanitizeLineage(data.lineage);
        if (!response.ok || !data.success || !lineage) {
          throw new Error(data.error ?? 'Lineage update failed');
        }
        updateOwnedSnake(selectedOwned.id, { lineage });
        if (typeof data.remainingDna === 'number') {
          setDnaBalance(data.remainingDna);
        }
        showToast(
          action === 'reroll' ? 'Lineage strain rerolled' : `${primary} selected`,
          'success'
        );
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : 'Lineage update failed',
          'error'
        );
      } finally {
        setIsUpdatingLineage(false);
      }
    },
    [
      selectedOwned,
      session?.access_token,
      isUpdatingLineage,
      updateOwnedSnake,
      setDnaBalance,
      showToast,
    ]
  );

  // ---------------------------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------------------------

  if (isLoading || authLoading) {
    return (
      <div className="app-bg min-h-screen text-bone-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center animate-fade-up">
            <div className="w-16 h-16 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4 shadow-glow-sm shadow-venom-orange/50" />
            <p className="text-beige/70 font-body">Loading your collection...</p>
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
      <div className="app-bg min-h-screen text-bone-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="panel-glow [--glow:#00FFFF] animate-pop-in p-8 text-center max-w-md space-y-6">
            <h1 className="heading-display text-3xl text-cyber text-glow">
              Snake Lab
            </h1>
            <p className="text-beige/70 font-body">
              Sign in to view your snake collection and unlock new variants.
            </p>
            <Link href="/login" className="btn-go inline-block px-8 py-3">
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
      <div className="app-bg min-h-screen text-bone-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="panel-glow [--glow:#f43f5e] animate-pop-in p-8 text-center max-w-md space-y-6">
            <h1 className="heading-display text-3xl text-strike-red">
              Error
            </h1>
            <p className="text-beige/70 font-body">{error}</p>
            <button onClick={refresh} className="btn-go inline-block px-8 py-3">
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
    <div className="app-bg min-h-screen flex flex-col text-bone-white pb-28 sm:pb-0 sm:pr-16">
      {/* Global navigation rail (right edge desktop / bottom mobile) */}
      <Navigation />

      {/* Header with energy and DNA */}
      <div className="pt-4 animate-fade-up">
        <LabHeader
          energy={energy}
          maxEnergy={maxEnergy}
          dna={dnaBalance}
          codexUnlocked={codexUnlocked}
        />
      </div>

      {/* Dynasty tabs - glowing segmented control */}
      {activeDynastyId && dynasties.length > 0 && (
        <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <DynastyTabs
            dynasties={dynasties}
            activeDynastyId={activeDynastyId}
            onSelect={setActiveDynasty}
            completionByDynasty={completionByDynasty}
          />
        </div>
      )}

      {/* Collection progress indicator + Breeding Lab entry */}
      {activeDynasty && (
        <div className="px-4 py-3 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="panel max-w-6xl mx-auto flex items-center gap-4 px-4 py-3">
            <div className="flex-1 min-w-0">
              <CollectionProgress
                owned={currentCompletion.owned}
                total={currentCompletion.total}
                dynastyTheme={dynastyTheme}
              />
            </div>
            <Link
              href="/lab/breed"
              className="btn-go shrink-0 flex items-center gap-2 px-4 py-2 text-sm min-h-[44px]"
              aria-label="Open Breeding Lab"
              data-testid="breed-entry-link"
            >
              <IconEgg size={18} />
              <span>Breed</span>
            </Link>
          </div>
        </div>
      )}

      {/* Per-dynasty Mastery track (Design v2 §7.1) */}
      {activeDynasty && masteryByDynasty[activeDynasty.name?.toUpperCase?.() ?? ''] && (
        <div className="px-4 pb-3 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <div className="max-w-6xl mx-auto">
            <MasteryPanel
              mastery={masteryByDynasty[activeDynasty.name.toUpperCase()]}
              dynastyTheme={dynastyTheme}
            />
          </div>
        </div>
      )}

      {/* Error banner (non-fatal) */}
      {error && dynasties.length > 0 && (
        <div className="px-4 pb-3">
          <div className="max-w-6xl mx-auto">
            <div className="panel-glow [--glow:#f43f5e] p-4 flex items-center justify-between">
              <p className="text-strike-red font-body text-sm">{error}</p>
              <button
                onClick={refresh}
                className="text-strike-red hover:text-bone-white text-sm font-body font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection grid */}
      <div className="flex-1 overflow-hidden animate-fade-up" style={{ animationDelay: '180ms' }}>
        <div className="h-full max-w-6xl mx-auto">
          <CollectionGrid
            variants={currentDynastyVariants}
            ownedSnakes={currentDynastyOwned}
            dynastyTheme={dynastyTheme}
            onSelectVariant={handleSelectVariant}
            isLoading={isLoading}
            equippedSnakeId={equippedSnake?.id}
            justUnlockedVariantId={justUnlockedVariantId}
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
          dnaBalance={dnaBalance}
          isUpdatingLineage={isUpdatingLineage}
          onRerollLineage={() => updateLineage('reroll')}
          onSelectLineagePrimary={(strain) =>
            updateLineage('select_primary', strain)
          }
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
