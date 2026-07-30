'use client';

/**
 * Snake Lab - Collection Browser
 * Integrates all Collection UI components for the complete Lab experience.
 * Uses useCollection hook for state management + gameStore for charges.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/lib/auth/AuthProvider';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import {
  NOTIFICATION_TARGETS,
  useNotificationStore,
} from '@/lib/stores/notificationStore';
import {
  bootstrapForLaunch,
  launchHandoffStorageAvailable,
  prepareLaunchHandoff,
  storeLaunchHandoff,
} from '@/lib/ftue/launchFlow';
import { useGameStore } from '@/lib/store/gameStore';
import { useDynastyTheme } from '@/hooks/useDynastyTheme';
import { useToast } from '@/components/ui/Toast';
import { useRecognitionSeen } from '@/components/ui/useRecognitionSeen';
import { rosterForVariant } from '@/lib/collection/roster';
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
import {
  LineageDossier,
  type LineageDossierData,
} from '@/components/lab/LineageDossier';
import { UnlockConfirmModal } from '@/components/lab/UnlockConfirmModal';

import type {
  SnakeVariant,
  OwnedSnake,
  DowngradeSnakeResponse,
} from '@/shared/types/snake-data-model';

// =============================================================================
// COMPONENT
// =============================================================================

export default function LabPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSpecimenId = searchParams.get('specimen');
  const requestedDynasty = searchParams.get('dynasty')?.toUpperCase() ?? null;
  const { user, session, isAuthenticated, isAnonymous, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [hasCompletedFirstRun, setHasCompletedFirstRun] = useState(false);
  const publishNotification = useNotificationStore((state) => state.publish);

  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    fetch('/api/player', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setHasCompletedFirstRun(data?.hasCompletedFirstRun === true);
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
      cache: 'no-store',
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
    variants,
    dnaBalance,
    ownedSnakes,
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
    equipError,
    setActiveDynasty,
    openDetailModal,
    selectOwnedSnake,
    closeDetailModal,
    openUnlockModal,
    closeUnlockModal,
    unlockVariant,
    equipSnake,
    toggleFavorite,
    refresh,
  } = useCollection();
  const openedDeepLinkedSpecimen = useRef<string | null>(null);
  const [deepLinkedSpecimenId, setDeepLinkedSpecimenId] = useState<string | null>(null);

  useEffect(() => {
    if (
      isLoading ||
      !requestedSpecimenId ||
      !session?.access_token ||
      openedDeepLinkedSpecimen.current === requestedSpecimenId
    ) return;
    let cancelled = false;

    const openSpecimen = async () => {
      let specimen = ownedSnakes.find((snake) => snake.id === requestedSpecimenId) ?? null;
      let variantId = specimen?.snakeVariantId ?? null;

      if (!variantId) {
        const response = await fetch('/api/progression/lineage', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { dossiers?: LineageDossierData[] };
        const dossier = data.dossiers?.find((entry) =>
          entry.specimens.some((entrySpecimen) => entrySpecimen.id === requestedSpecimenId)
        );
        if (!dossier) return;
        variantId = dossier.variant.id;
        specimen = [...ownedSnakes]
          .filter((snake) => snake.snakeVariantId === variantId)
          .sort((a, b) => b.generation - a.generation)[0] ?? null;
      }

      const variant = variants.find((entry) => entry.id === variantId);
      if (cancelled || !specimen || !variant) return;
      setActiveDynasty(variant.dynastyId);
      openDetailModal(variant, specimen);
      setDeepLinkedSpecimenId(requestedSpecimenId);
      openedDeepLinkedSpecimen.current = requestedSpecimenId;
    };

    void openSpecimen().catch(() => {
      // The ordinary Lab remains usable; server recognition stays unseen
      // until its exact durable passport can be loaded.
    });
    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    openDetailModal,
    ownedSnakes,
    requestedSpecimenId,
    session?.access_token,
    setActiveDynasty,
    variants,
  ]);

  // Get modal loading/error states directly from store
  const isUnlocking = useCollectionStore((state) => state.isUnlocking);
  const isEquipping = useCollectionStore((state) => state.isEquipping);
  const unlockError = useCollectionStore((state) => state.unlockError);
  const updateOwnedSnake = useCollectionStore((state) => state.updateOwnedSnake);
  const [isUpdatingLineage, setIsUpdatingLineage] = useState(false);
  const [isLaunchingSnake, setIsLaunchingSnake] = useState(false);
  const [isDowngradingSnake, setIsDowngradingSnake] = useState(false);
  const [downgradeError, setDowngradeError] = useState<string | null>(null);

  useEffect(() => {
    setDowngradeError(null);
  }, [selectedOwned?.id, isDetailModalOpen]);

  // Recovering Energy from the game store (server-synced, §8.6)
  const charge = useGameStore((state) => state.charge);

  // Get active dynasty object for modals
  const activeDynasty = dynasties.find((d) => d.id === activeDynastyId);
  const activeMasteryKey = activeDynasty?.name?.toUpperCase?.() ?? '';

  useEffect(() => {
    if (dynasties.length === 0 || typeof window === 'undefined') return;
    if (!requestedDynasty) return;
    const dynasty = dynasties.find(
      (candidate) => candidate.name.toUpperCase() === requestedDynasty
    );
    if (dynasty && dynasty.id !== activeDynastyId) setActiveDynasty(dynasty.id);
  }, [activeDynastyId, dynasties, requestedDynasty, setActiveDynasty]);

  useEffect(() => {
    if (!activeMasteryKey || !masteryByDynasty[activeMasteryKey] || typeof window === 'undefined') {
      return;
    }
    const id = window.location.hash.slice(1);
    if (id !== `mastery-${activeMasteryKey}`) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeMasteryKey, masteryByDynasty]);

  useRecognitionSeen(
    'mastery',
    Boolean(activeMasteryKey && masteryByDynasty[activeMasteryKey]),
    session?.access_token,
    { artifactRefs: activeMasteryKey ? [activeMasteryKey] : [] }
  );

  // Get dynasty theme for current dynasty
  const dynastyTheme = useDynastyTheme(activeDynasty?.name ?? 'PRIMAL');

  // Get current dynasty completion stats
  const currentCompletion = activeDynastyId
    ? completionByDynasty[activeDynastyId] ?? { owned: 0, total: 0, snakes: 0 }
    : { owned: 0, total: 0, snakes: 0 };

  /**
   * The open sheet's highest-generation roster, resolved against the LIVE
   * owned list so equip/favorite changes update without reopening it.
   */
  const selectedRoster = useMemo(
    () =>
      selectedVariant
        ? rosterForVariant(
            selectedVariant.id,
            ownedSnakes,
            equippedSnake?.id ?? null
          )?.snakes ?? []
        : [],
    [selectedVariant, ownedSnakes, equippedSnake?.id]
  );

  /** The selected sibling, refreshed from the live list by id. */
  const selectedSnake = useMemo(
    () =>
      selectedOwned
        ? selectedRoster.find((snake) => snake.id === selectedOwned.id) ??
          selectedOwned
        : null,
    [selectedOwned, selectedRoster]
  );

  const downgradeFacts = useMemo(() => {
    if (!selectedSnake || selectedSnake.downgradeRefundDna === undefined) {
      return null;
    }

    const descendants = ownedSnakes.filter(
      (snake) =>
        snake.parent1Id === selectedSnake.id || snake.parent2Id === selectedSnake.id
    );
    const remainingVariant = ownedSnakes.filter(
      (snake) =>
        snake.id !== selectedSnake.id &&
        snake.snakeVariantId === selectedSnake.snakeVariantId
    );
    const toGeneration = remainingVariant.reduce(
      (highest, snake) => Math.max(highest, snake.generation),
      1
    );

    return {
      refundDna: selectedSnake.downgradeRefundDna,
      toGeneration,
      blockedReason:
        descendants.length > 0
          ? 'Downgrade descendants first so no active lineage loses a parent.'
          : null,
    };
  }, [ownedSnakes, selectedSnake]);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  /**
   * Handle variant card selection. The grid hands over the active top-gen roster;
   * the sheet opens on its representative and can walk the siblings.
   * - If owned: open detail modal
   * - If locked: open unlock modal
   */
  const handleSelectVariant = useCallback(
    (variant: SnakeVariant, roster: OwnedSnake[]) => {
      setDeepLinkedSpecimenId(null);
      if (roster.length > 0) {
        openDetailModal(variant, roster[0]);
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
      const unlockedSnake = await unlockVariant(unlockedId, { equip: true });
      const succeeded = unlockedSnake !== null;

      // Celebration shimmer on the freshly unlocked card
      if (succeeded) {
        setJustUnlockedVariantId(unlockedId);
        if (shimmerTimeoutRef.current) clearTimeout(shimmerTimeoutRef.current);
        shimmerTimeoutRef.current = setTimeout(() => {
          setJustUnlockedVariantId(null);
        }, 2400);
        showToast(`${selectedVariant.name} unlocked and equipped`, 'success');
      }

      // Account creation remains optional and player-pulled. Even this badge
      // waits until gameplay has established value.
      if (succeeded && isAnonymous && hasCompletedFirstRun) {
        publishNotification({
          id: 'save-progress',
          title: 'Add account recovery',
          description:
            'Your collection is secured. Add an email for account recovery or another device.',
          ...NOTIFICATION_TARGETS.saveProgress,
          badgeKind: 'exclamation',
          attentionReason: 'action-required',
          actionLabel: 'Add recovery',
        });
      }
    }
  }, [
    selectedVariant,
    unlockVariant,
    isAnonymous,
    hasCompletedFirstRun,
    publishNotification,
    showToast,
  ]);

  /**
   * Handle equip action from detail modal - acts on the SELECTED sibling,
   * and leaves the sheet open so the state change is visible.
   */
  const handleEquip = useCallback(async () => {
    if (selectedSnake) {
      await equipSnake(selectedSnake.id);
    }
  }, [selectedSnake, equipSnake]);

  /** Persist the favorite flag; the roster rule ranks by it. */
  const handleToggleFavorite = useCallback(
    async (snakeId: string, favorited: boolean) => {
      const succeeded = await toggleFavorite(snakeId, favorited);
      if (!succeeded) {
        showToast('Could not save that favorite', 'error');
      }
      return succeeded;
    },
    [toggleFavorite, showToast]
  );

  /** Equip when needed, create the run, then hand the ready board to game. */
  const handlePlayWithSnake = useCallback(async () => {
    if (
      !selectedSnake ||
      !session?.access_token ||
      !user?.id ||
      isLaunchingSnake
    ) {
      return;
    }

    if (!launchHandoffStorageAvailable()) {
      // Storage-restricted browsers retain the safe legacy pre-run screen;
      // no paid session is created without a reliable consume-once handoff.
      const equipped =
        selectedSnake.id === equippedSnake?.id ||
        (await equipSnake(selectedSnake.id));
      if (equipped) router.push('/game');
      return;
    }

    setIsLaunchingSnake(true);
    try {
      if (selectedSnake.id !== equippedSnake?.id) {
        // An equip failure already reports itself through the sheet's own
        // equipError channel. Rethrowing it here is what made one failure
        // surface twice, under two different messages.
        if (!(await equipSnake(selectedSnake.id))) return;
      }
      const bootstrap = await bootstrapForLaunch(session.access_token);
      const handoff = await prepareLaunchHandoff(
        session.access_token,
        user.id,
        bootstrap
      );
      if (!storeLaunchHandoff(handoff)) {
        throw new Error('Could not transfer the prepared run');
      }
      router.push('/game?launch=ftue-v2&source=lab');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not prepare the run',
        'error'
      );
    } finally {
      setIsLaunchingSnake(false);
    }
  }, [
    selectedSnake,
    session?.access_token,
    user?.id,
    isLaunchingSnake,
    equippedSnake?.id,
    equipSnake,
    router,
    showToast,
  ]);

  /**
   * Handle breed action - navigate to the Breeding Lab
   */
  const handleBreed = useCallback(() => {
    router.push('/lab/breed');
  }, [router]);

  /**
   * Voluntarily exchange one leaf breeding result for its exact receipt.
   * There is no optimistic economy mutation: the wallet, ancestry removal and
   * possible replacement equip commit together in the database, then the Lab
   * reloads that server truth.
   */
  const handleDowngrade = useCallback(async () => {
    if (
      !selectedSnake ||
      !session?.access_token ||
      isDowngradingSnake ||
      !downgradeFacts ||
      downgradeFacts.blockedReason
    ) {
      return;
    }

    setIsDowngradingSnake(true);
    setDowngradeError(null);
    try {
      const response = await fetch('/api/collection/downgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ snakeId: selectedSnake.id }),
      });
      const data: DowngradeSnakeResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Could not refund this generation');
      }

      closeDetailModal();
      await refresh();
      showToast(
        `Gen ${data.fromGeneration ?? selectedSnake.generation} → Gen ${data.toGeneration ?? downgradeFacts.toGeneration} · +${(data.refundedDna ?? downgradeFacts.refundDna).toLocaleString()} DNA`,
        'success'
      );
    } catch (error) {
      setDowngradeError(
        error instanceof Error ? error.message : 'Could not refund this generation'
      );
    } finally {
      setIsDowngradingSnake(false);
    }
  }, [
    selectedSnake,
    session?.access_token,
    isDowngradingSnake,
    downgradeFacts,
    closeDetailModal,
    refresh,
    showToast,
  ]);

  /**
   * Choose which strain of a dual lineage receives its point. The lineage
   * REROLL is retired (Constitution §8.2): breeding is a deterministic
   * draft, so there is nothing random left to redraw.
   */
  const selectLineagePrimary = useCallback(
    async (primary: StrainId) => {
      if (!selectedSnake || !session?.access_token || isUpdatingLineage) return;
      setIsUpdatingLineage(true);
      try {
        const response = await fetch('/api/breeding/lineage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'select_primary',
            snake_id: selectedSnake.id,
            primary,
          }),
        });
        const data = await response.json();
        const lineage = sanitizeLineage(data.lineage);
        if (!response.ok || !data.success || !lineage) {
          throw new Error(data.error ?? 'Lineage update failed');
        }
        updateOwnedSnake(selectedSnake.id, { lineage });
        showToast(`${primary} selected`, 'success');
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
      selectedSnake,
      session?.access_token,
      isUpdatingLineage,
      updateOwnedSnake,
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

      {/* Header with charges and DNA */}
      <div className="pt-4 animate-fade-up">
        <LabHeader charge={charge} dna={dnaBalance} />
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
                snakes={currentCompletion.snakes}
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
        <div id="mastery" className="px-4 pb-3 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <div className="max-w-6xl mx-auto">
            <div id={`mastery-${activeMasteryKey}`}>
              <MasteryPanel
                mastery={masteryByDynasty[activeDynasty.name.toUpperCase()]}
                dynastyTheme={dynastyTheme}
              />
            </div>
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
      <div className="flex-1 animate-fade-up" style={{ animationDelay: '180ms' }}>
        <div className="max-w-6xl mx-auto">
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
      {selectedVariant && selectedSnake && activeDynasty && (
        <VariantDetailModal
          variant={selectedVariant}
          owned={selectedSnake}
          roster={selectedRoster}
          onSelectSnake={(snake) => {
            setDeepLinkedSpecimenId(null);
            selectOwnedSnake(snake);
          }}
          dynasty={activeDynasty}
          isOpen={isDetailModalOpen}
          onClose={closeDetailModal}
          onEquip={handleEquip}
          onPlay={handlePlayWithSnake}
          onBreed={handleBreed}
          isEquipping={isEquipping}
          isLaunching={isLaunchingSnake}
          isEquipped={equippedSnake?.id === selectedSnake.id}
          equippedSnakeId={equippedSnake?.id ?? null}
          equipError={equipError}
          isUpdatingLineage={isUpdatingLineage}
          onSelectLineagePrimary={selectLineagePrimary}
          onToggleFavorite={handleToggleFavorite}
          downgradeRefundDna={downgradeFacts?.refundDna ?? null}
          downgradeToGeneration={downgradeFacts?.toGeneration ?? null}
          downgradeBlockedReason={downgradeFacts?.blockedReason ?? null}
          onDowngrade={downgradeFacts ? handleDowngrade : undefined}
          isDowngrading={isDowngradingSnake}
          downgradeError={downgradeError}
          lineageDossierSlot={
            session?.access_token && selectedSnake.snakeVariantId ? (
              <LineageDossier
                accessToken={session.access_token}
                variantId={selectedSnake.snakeVariantId}
                specimenId={deepLinkedSpecimenId ?? selectedSnake.id}
              />
            ) : undefined
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
    </div>
  );
}
