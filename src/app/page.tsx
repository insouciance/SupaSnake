'use client';

/**
 * Home - "The Specimen Chamber"
 *
 * A premium game menu, not a web dashboard: the player's equipped snake
 * lives as a 3D character in a full-viewport chamber behind the UI. Over
 * it, a minimal hierarchy - small wordmark up top, ambient DNA/energy
 * counters top-right, one rotating mission line, and a single obvious
 * primary action: LAUNCH.
 */

import { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  readLastUser,
  clearLastUser,
  evaluateAnonymousSignInGate,
  markProgressLossNoticed,
  type LastUserMarker,
} from '@/lib/auth/lastUser';
import { replayRewardOutbox } from '@/lib/outbox/rewardOutbox';
import { MVP_DYNASTIES } from '@/shared/types/snake-data-model';
import type { DynastyId } from '@/shared/types/game';
import { Navigation } from '@/components/ui/Navigation';
import { ChamberPlaceholder } from '@/components/home/ChamberPlaceholder';
import { IconDna, IconBolt, IconPlay } from '@/components/ui/icons';
import {
  ContractsBoard,
  summarizeContracts,
  type ContractView,
  type ContractClaimOutcome,
} from '@/components/engagement/ContractsBoard';
import {
  SeasonTrack,
  type SeasonView,
  type SeasonTrackView,
} from '@/components/engagement/SeasonTrack';
import { StarterSelection } from '@/components/ftue/StarterSelection';
import { trackEvent } from '@/lib/analytics/posthog';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { FTUE_V2_ENABLED } from '@/lib/ftue/config';
import {
  INITIAL_LAUNCH_STATE,
  LAUNCH_PHASE_LABEL,
  LaunchFlowError,
  bootstrapForLaunch,
  launchHandoffStorageAvailable,
  prepareLaunchHandoff,
  storeLaunchHandoff,
  transitionLaunch,
} from '@/lib/ftue/launchFlow';
import {
  NOTIFICATION_TARGETS,
  subscribeNotificationAction,
  useNotificationStore,
} from '@/lib/stores/notificationStore';

// The chamber is WebGL-heavy: lazy-mount client-side only, with the styled
// gradient placeholder holding the space (zero layout shift).
const SpecimenChamber = dynamicImport(
  () => import('@/components/home/SpecimenChamber'),
  { ssr: false, loading: () => null }
);

/** Full catalog: 10 variants per MVP dynasty (full data lives in the DB) */
const TOTAL_VARIANTS = MVP_DYNASTIES.length * 10;

interface HomeStats {
  dna: number;
  energy: number;
  maxEnergy: number;
  highScore: number;
  collectionSize: number;
  needsStarterSelection: boolean;
  hasCompletedFirstRun: boolean;
}

interface ContractsState {
  contracts: ContractView[];
  picksRemaining: number;
  claimable: boolean;
}

interface MissionItem {
  id: string;
  text: string;
  /** Glowing beacon dot (contract action ready) */
  beacon?: boolean;
  /** Tapping the line performs this action (e.g. open the contracts board) */
  onSelect?: () => void;
}

/** Same once-per-day dismissal slot the calendar used - the board replaced it */
function dailyDismissKey(today: string): string {
  return `daily-reward-dismissed-${today}`;
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, signInAnonymously, session } = useAuth();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [streak, setStreak] = useState<{ current: number; multiplier: number } | null>(null);
  const [contractsState, setContractsState] = useState<ContractsState | null>(null);
  const [showContractsBoard, setShowContractsBoard] = useState(false);
  // Season track (Design v2 §7.2): the free seasonal reward track. Null
  // until fetched or while no season is live / pre-migration-021.
  const [seasonState, setSeasonState] = useState<{
    season: SeasonView;
    track: SeasonTrackView;
  } | null>(null);
  const [showSeasonTrack, setShowSeasonTrack] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState<LastUserMarker | null>(null);
  const [showLossNotice, setShowLossNotice] = useState(false);
  const [dynasty, setDynasty] = useState<DynastyId>('PRIMAL');
  const [chamberReady, setChamberReady] = useState(false);
  const [missionIndex, setMissionIndex] = useState(0);
  const [launchState, dispatchLaunch] = useReducer(
    transitionLaunch,
    INITIAL_LAUNCH_STATE
  );
  const launchInFlightRef = useRef(false);
  const publishNotification = useNotificationStore((state) => state.publish);
  const clearNotification = useNotificationStore((state) => state.clear);
  const notificationsHydrated = useNotificationStore((state) => state.hasHydrated);

  const token = session?.access_token;

  // Persisted attention belongs only to an eligible signed-in player. Clear
  // stale meta links once auth or first-run authority proves them unavailable.
  useEffect(() => {
    if (!FTUE_V2_ENABLED || !notificationsHydrated || isLoading) return;
    if (!isAuthenticated || stats?.hasCompletedFirstRun === false) {
      clearNotification('contracts');
      clearNotification('season');
    }
  }, [
    clearNotification,
    isAuthenticated,
    isLoading,
    notificationsHydrated,
    stats?.hasCompletedFirstRun,
  ]);

  // No silent new identity: if a registered account previously used this
  // device and the session is gone, surface "Welcome back" instead of
  // letting the player fall into a fresh anonymous account.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      setWelcomeBack(null);
      return;
    }
    const marker = readLastUser();
    if (marker && !marker.isAnonymous) {
      setWelcomeBack(marker);
    }
  }, [isLoading, isAuthenticated]);

  // Replay any queued game rewards that failed to send (tab closed at
  // death, network drop). Server dedupes by sessionId.
  useEffect(() => {
    if (!token) return;
    replayRewardOutbox(token).catch((err) => {
      console.error('Reward outbox replay failed:', err);
    });
  }, [token]);

  // Real home stats from server authority: /api/player + /api/streaks
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };

    const load = async () => {
      try {
        const [playerRes, streaksRes] = await Promise.all([
          fetch('/api/player', { headers }),
          fetch('/api/streaks', { headers }),
        ]);

        if (playerRes.ok) {
          const data = await playerRes.json();
          if (!cancelled && data.player) {
            setStats({
              dna: data.player.dna ?? 0,
              energy: data.player.energy ?? 0,
              maxEnergy: data.player.max_energy ?? 5,
              highScore: data.player.high_score ?? 0,
              collectionSize: data.collectionSize ?? 0,
              needsStarterSelection: data.needsStarterSelection ?? false,
              hasCompletedFirstRun:
                data.hasCompletedFirstRun === true ||
                (data.player.total_games_played ?? 0) > 0,
            });
          }
        }

        if (streaksRes.ok) {
          const data = await streaksRes.json();
          if (!cancelled) {
            setStreak({
              current: data.currentStreak ?? 0,
              multiplier: Number(data.multiplier ?? 1) || 1,
            });
            trackEvent(AnalyticsEvents.DAILY_LOGIN, {
              current_streak: data.currentStreak ?? 0,
              streak_multiplier: data.multiplier ?? 1,
              category: 'engagement',
            });
          }
        }
      } catch {
        // Stats stay in loading placeholders; non-fatal
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  // The chamber presents the EQUIPPED snake: resolve its dynasty from the
  // collection. Fresh visitors (or failures) get the PRIMAL specimen.
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/collection', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const snakes: { isEquipped?: boolean; dynastyName?: string | null }[] =
          data.snakes ?? [];
        const specimen = snakes.find((s) => s.isEquipped) ?? snakes[0];
        const name = specimen?.dynastyName?.toUpperCase();
        if (name && (MVP_DYNASTIES as readonly string[]).includes(name)) {
          setDynasty(name as DynastyId);
        }
      } catch {
        // PRIMAL specimen fallback
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  // Daily contracts are generated only after the first completed run. Under
  // FTUE v2 they publish a persistent mission/badge and never auto-open.
  useEffect(() => {
    if (
      !isAuthenticated ||
      !token ||
      !notificationsHydrated ||
      (FTUE_V2_ENABLED && stats?.hasCompletedFirstRun !== true)
    ) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/contracts', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data: ContractsState = await res.json();
        if (cancelled) return;
        setContractsState(data);

        const canPick =
          data.picksRemaining > 0 && data.contracts.some((c) => !c.picked);
        if (!FTUE_V2_ENABLED) {
          const today = new Date().toISOString().split('T')[0];
          let dismissedToday = false;
          try {
            dismissedToday = window.localStorage.getItem(dailyDismissKey(today)) === '1';
          } catch {
            // localStorage unavailable - treat as not dismissed
          }
          if ((canPick || data.claimable) && !dismissedToday) {
            setShowContractsBoard(true);
          }
        }
      } catch {
        // Contracts UI simply stays closed on failure
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, notificationsHydrated, token, stats?.hasCompletedFirstRun]);

  // Season track (§7.2): fetch the live season + the player's free track.
  // { live: false } (pre-migration-021) or no live season simply keeps the
  // season surfaces hidden - non-fatal like every engagement fetch here.
  useEffect(() => {
    if (
      !isAuthenticated ||
      !token ||
      !notificationsHydrated ||
      (FTUE_V2_ENABLED && stats?.hasCompletedFirstRun !== true)
    ) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/season', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.live && data.season && data.track) {
          setSeasonState({ season: data.season, track: data.track });
        } else {
          setSeasonState(null);
          clearNotification('season');
        }
      } catch {
        // Season UI simply stays hidden on failure
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    clearNotification,
    isAuthenticated,
    notificationsHydrated,
    token,
    stats?.hasCompletedFirstRun,
  ]);

  // One notification source drives the contracts badge, mission indicator,
  // and inbox. No parallel automatic modal exists.
  useEffect(() => {
    if (
      !FTUE_V2_ENABLED ||
      !notificationsHydrated ||
      !contractsState ||
      !stats?.hasCompletedFirstRun
    ) return;
    const summary = summarizeContracts(contractsState.contracts);
    const claimableCount = contractsState.contracts.filter(
      (contract) => contract.completed && !contract.claimed
    ).length;
    const canPick =
      contractsState.picksRemaining > 0 &&
      contractsState.contracts.some((contract) => !contract.picked);

    if (!canPick && claimableCount === 0) {
      clearNotification('contracts');
      return;
    }

    publishNotification({
      id: 'contracts',
      title: claimableCount > 0 ? 'Contract reward ready' : 'Daily Contracts ready',
      description:
        claimableCount > 0
          ? `${summary.completedCount}/${summary.pickedCount} selected contracts complete.`
          : `Choose ${contractsState.picksRemaining} contract${contractsState.picksRemaining === 1 ? '' : 's'} when you’re ready.`,
      ...NOTIFICATION_TARGETS.contracts,
      badgeKind: claimableCount > 0 ? 'numeric' : 'exclamation',
      attentionReason: claimableCount > 0 ? 'reward-available' : 'action-required',
      count: claimableCount || undefined,
      actionLabel:
        claimableCount > 0
          ? `Claim ${claimableCount === 1 ? 'reward' : 'rewards'}`
          : 'Choose Contracts',
    });
  }, [
    clearNotification,
    contractsState,
    notificationsHydrated,
    stats?.hasCompletedFirstRun,
    publishNotification,
  ]);

  useEffect(() => {
    if (
      !FTUE_V2_ENABLED ||
      !notificationsHydrated ||
      !seasonState ||
      !stats?.hasCompletedFirstRun
    ) return;
    const claimableCount = seasonState.track.tiers.filter(
      (tier) =>
        !tier.claimed &&
        seasonState.track.level >= tier.level &&
        (tier.is_premium !== true ||
          seasonState.track.premium?.is_premium === true ||
          seasonState.track.premium?.season_locked_in === true)
    ).length;
    if (claimableCount === 0) {
      clearNotification('season');
      return;
    }
    publishNotification({
      id: 'season',
      title: `${seasonState.season.name} milestone ready`,
      description: `${claimableCount} seasonal reward${claimableCount === 1 ? '' : 's'} available.`,
      ...NOTIFICATION_TARGETS.season,
      badgeKind: 'numeric',
      attentionReason: 'reward-available',
      count: claimableCount,
      actionLabel: 'Review rewards',
    });
  }, [
    clearNotification,
    notificationsHydrated,
    seasonState,
    stats?.hasCompletedFirstRun,
    publishNotification,
  ]);

  // Hash destinations represent an explicit inbox/mission action. Merely
  // loading Home never opens these overlays.
  useEffect(() => {
    const syncExplicitDestination = () => {
      if (window.location.hash === '#contracts') setShowContractsBoard(true);
      if (window.location.hash === '#season') setShowSeasonTrack(true);
    };
    const unsubscribeContracts = subscribeNotificationAction(
      'open-contracts',
      () => setShowContractsBoard(true)
    );
    const unsubscribeSeason = subscribeNotificationAction(
      'open-season',
      () => setShowSeasonTrack(true)
    );
    syncExplicitDestination();
    window.addEventListener('hashchange', syncExplicitDestination);
    return () => {
      unsubscribeContracts();
      unsubscribeSeason();
      window.removeEventListener('hashchange', syncExplicitDestination);
    };
  }, []);

  const handleSeasonClaim = useCallback(
    async (level: number): Promise<boolean> => {
      if (!token) return false;
      try {
        const res = await fetch('/api/season', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'claim', level }),
        });
        if (!res.ok) return false;
        const data = await res.json();

        setSeasonState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            track: {
              ...prev.track,
              tiers: prev.track.tiers.map((t) =>
                t.level === level ? { ...t, claimed: true } : t
              ),
              reroll_tokens:
                typeof data.reward?.reroll_tokens === 'number'
                  ? data.reward.reroll_tokens
                  : prev.track.reroll_tokens,
            },
          };
        });
        return true;
      } catch {
        return false;
      }
    },
    [token]
  );

  const handleContractsPick = useCallback(
    async (contractIds: string[]): Promise<boolean> => {
      if (!token) return false;
      try {
        const res = await fetch('/api/contracts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'pick', contractIds }),
        });

        if (!res.ok) return false;

        const data: ContractsState = await res.json();
        setContractsState(data);

        trackEvent(AnalyticsEvents.CHALLENGE_STARTED, {
          contracts: contractIds,
          category: 'engagement',
        });
        return true;
      } catch {
        return false;
      }
    },
    [token]
  );

  const handleContractClaim = useCallback(
    async (contractId: string): Promise<ContractClaimOutcome | null> => {
      if (!token) return null;
      try {
        const res = await fetch('/api/contracts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'claim', contractId }),
        });

        if (!res.ok) return null;

        const data = await res.json();
        const outcome: ContractClaimOutcome = {
          contractId: data.contractId,
          dnaGranted: data.dnaGranted,
          energyGranted: data.energyGranted,
          xpGranted: data.xpGranted,
        };

        trackEvent(AnalyticsEvents.CHALLENGE_COMPLETED, {
          contract: outcome.contractId,
          dna_granted: outcome.dnaGranted,
          energy_granted: outcome.energyGranted,
          xp_granted: outcome.xpGranted,
          category: 'engagement',
        });

        setContractsState((prev) => {
          if (!prev) return prev;
          const contracts = prev.contracts.map((c) =>
            c.contractId === contractId ? { ...c, claimed: true } : c
          );
          return {
            ...prev,
            contracts,
            claimable: summarizeContracts(contracts).claimable,
          };
        });
        setStats((prev) =>
          prev
            ? {
                ...prev,
                dna: prev.dna + outcome.dnaGranted,
                energy: prev.energy + outcome.energyGranted,
              }
            : prev
        );

        return outcome;
      } catch {
        return null;
      }
    },
    [token]
  );

  const handleContractsDismiss = useCallback(() => {
    if (!FTUE_V2_ENABLED) {
      const today = new Date().toISOString().split('T')[0];
      try {
        window.localStorage.setItem(dailyDismissKey(today), '1');
      } catch {
        // Ignore storage failures
      }
    }
    if (window.location.hash === '#contracts') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setShowContractsBoard(false);
  }, []);

  const runLaunch = useCallback(async (skipIdentityGate = false) => {
    if (launchInFlightRef.current) return;

    if (!skipIdentityGate && !isAuthenticated) {
      const gate = evaluateAnonymousSignInGate(readLastUser());
      if (gate === 'welcome-back') {
        setWelcomeBack(readLastUser());
        return;
      }
      if (gate === 'warn-progress-loss') {
        setShowLossNotice(true);
        return;
      }
    }

    if (!FTUE_V2_ENABLED) {
      if (!isAuthenticated) {
        const result = await signInAnonymously();
        if (result?.error) {
          dispatchLaunch({ type: 'FAIL', error: result.error.message });
          return;
        }
      }
      router.push('/game');
      return;
    }

    if (!launchHandoffStorageAvailable()) {
      dispatchLaunch({
        type: 'FAIL',
        error: 'This browser cannot safely prepare a run. Enable session storage and Retry.',
      });
      return;
    }

    launchInFlightRef.current = true;
    dispatchLaunch({ type: 'BEGIN', alreadyAuthenticated: isAuthenticated });
    try {
      let launchSession = session;
      if (!launchSession?.access_token) {
        if (isAuthenticated) {
          throw new LaunchFlowError('Your session is still loading. Please Retry.');
        }
        const result = await signInAnonymously();
        if (result?.error || !result?.session) {
          throw new LaunchFlowError(
            result?.error?.message ?? 'Anonymous authentication did not complete'
          );
        }
        launchSession = result.session;
        dispatchLaunch({ type: 'AUTHENTICATED' });
      }

      const bootstrap = await bootstrapForLaunch(launchSession.access_token);
      setDynasty(bootstrap.equippedSnake.dynasty);
      dispatchLaunch({ type: 'BOOTSTRAPPED' });

      const handoff = await prepareLaunchHandoff(
        launchSession.access_token,
        launchSession.user.id,
        bootstrap
      );
      if (!storeLaunchHandoff(handoff)) {
        throw new LaunchFlowError('Could not transfer the prepared run. Please Retry.');
      }

      dispatchLaunch({ type: 'RUN_LOADED' });
      router.push('/game?launch=ftue-v2');
    } catch (error) {
      const message =
        error instanceof LaunchFlowError && error.retryAfterMs
          ? `${error.message}. Retry in ${Math.ceil(error.retryAfterMs / 1000)}s.`
          : error instanceof Error
            ? error.message
            : 'Could not launch the run';
      dispatchLaunch({ type: 'FAIL', error: message });
    } finally {
      launchInFlightRef.current = false;
    }
  }, [isAuthenticated, router, session, signInAnonymously]);

  const handleContinueAfterLossNotice = useCallback(async () => {
    markProgressLossNoticed();
    setShowLossNotice(false);
    await runLaunch(true);
  }, [runLaunch]);

  const handleStartFresh = useCallback(() => {
    clearLastUser();
    setWelcomeBack(null);
  }, []);

  const needsStarter =
    !FTUE_V2_ENABLED &&
    isAuthenticated &&
    stats?.needsStarterSelection === true;

  // ---------------------------------------------------------------------------
  // Mission line - one contextual line above Launch, rotating every 6s
  // ---------------------------------------------------------------------------

  const missionItems = useMemo<MissionItem[]>(() => {
    if (!isAuthenticated) {
      return [{ id: 'tagline', text: 'Where Skill Creates Legacy' }];
    }
    if (FTUE_V2_ENABLED && stats?.hasCompletedFirstRun !== true) {
      return [{ id: 'first-run', text: 'Your first run is ready' }];
    }
    const items: MissionItem[] = [];
    if (contractsState) {
      const summary = summarizeContracts(contractsState.contracts);
      const canPick =
        contractsState.picksRemaining > 0 &&
        contractsState.contracts.some((c) => !c.picked);
      if (canPick) {
        items.push({
          id: 'contracts',
          text: 'New contracts available',
          beacon: true,
          onSelect: () => setShowContractsBoard(true),
        });
      } else if (summary.pickedCount > 0) {
        items.push({
          id: 'contracts',
          text: `Contracts: ${summary.completedCount}/${summary.pickedCount} complete`,
          beacon: summary.claimable,
          onSelect: () => setShowContractsBoard(true),
        });
      }
    }
    if (seasonState) {
      const claimable = seasonState.track.tiers.some(
        (t) => !t.claimed && seasonState.track.level >= t.level
      );
      items.push({
        id: 'season',
        text: claimable
          ? `${seasonState.season.name} · milestone ready`
          : `${seasonState.season.name} · week ${seasonState.season.week} of ${seasonState.season.weeks}`,
        beacon: claimable,
        onSelect: () => setShowSeasonTrack(true),
      });
    }
    if (stats) {
      items.push({
        id: 'goal',
        text:
          stats.collectionSize >= TOTAL_VARIANTS
            ? 'Every variant unlocked'
            : `Next goal · ${stats.collectionSize}/${TOTAL_VARIANTS} variants`,
      });
    }
    if (streak !== null && streak.current > 0) {
      items.push({ id: 'streak', text: `${streak.current}-day streak active` });
    }
    if (items.length === 0) {
      items.push({ id: 'tagline', text: 'Where Skill Creates Legacy' });
    }
    return items;
  }, [isAuthenticated, contractsState, seasonState, stats, streak]);

  useEffect(() => {
    setMissionIndex(0);
  }, [missionItems.length]);

  useEffect(() => {
    if (missionItems.length < 2) return;
    const id = window.setInterval(
      () => setMissionIndex((i) => (i + 1) % missionItems.length),
      6000
    );
    return () => window.clearInterval(id);
  }, [missionItems.length]);

  const mission = missionItems[missionIndex % missionItems.length];

  return (
    <main className="app-bg text-bone-white relative h-[100dvh] overflow-hidden">
      {/* The Specimen Chamber - full-viewport scene behind the UI. The
          placeholder holds the atmosphere until WebGL is live, then the
          chamber fades in from black (600ms). */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <ChamberPlaceholder />
        <div
          className={`absolute inset-0 transition-opacity duration-[600ms] ease-out ${
            chamberReady ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <SpecimenChamber dynasty={dynasty} onReady={() => setChamberReady(true)} />
        </div>
      </div>

      {/* Navigation rail */}
      <Navigation />

      {/* Welcome back: a registered account used this device but the
          session is gone - never silently create a new anonymous identity */}
      {welcomeBack && !isAuthenticated && !isLoading && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-void-deep/90 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="welcome-back-modal"
        >
          <div
            className="panel-glow animate-pop-in p-8 text-center space-y-6 max-w-md w-full"
            style={{ '--glow': '#22d3ee' } as React.CSSProperties}
          >
            <h2 className="heading-display text-2xl text-venom-orange text-glow-orange">
              Welcome Back
            </h2>
            <p className="text-beige font-body">
              Sign in to restore your progress
              {welcomeBack.emailHint && (
                <>
                  {' '}
                  (<span className="text-bone-white">{welcomeBack.emailHint}</span>)
                </>
              )}
              . Your snakes and DNA are waiting on your account.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/login" className="btn-go px-8 py-3 text-lg">
                Sign In
              </Link>
              <button
                onClick={handleStartFresh}
                className="px-4 py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
              >
                Start fresh instead (new account, empty collection)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One-time notice: previous anonymous session is unrecoverable */}
      {showLossNotice && !isAuthenticated && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-void-deep/90 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="progress-loss-notice"
        >
          <div
            className="panel-glow animate-pop-in p-8 text-center space-y-6 max-w-md w-full"
            style={{ '--glow': '#f43f5e' } as React.CSSProperties}
          >
            <h2 className="heading-display text-2xl text-strike-red">
              Previous Progress Lost
            </h2>
            <p className="text-beige font-body">
              A previous guest session on this device could not be restored - that
              progress may be unrecoverable. A new guest profile will be created.
              Create an account next time to keep your progress safe.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleContinueAfterLossNotice}
                className="btn-go px-8 py-3 text-lg"
              >
                Continue as Guest
              </button>
              <button
                onClick={() => setShowLossNotice(false)}
                className="px-4 py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback-only legacy path. FTUE v2 never exposes starter selection. */}
      {needsStarter && <StarterSelection />}

      {/* Daily contracts board opens only after a mission/inbox action. */}
      {contractsState && !needsStarter && (
        <ContractsBoard
          isVisible={showContractsBoard}
          contracts={contractsState.contracts}
          picksRemaining={contractsState.picksRemaining}
          streak={streak}
          onPick={handleContractsPick}
          onClaim={handleContractClaim}
          onDismiss={handleContractsDismiss}
        />
      )}

      {/* Season track (§7.2): free milestones - cosmetics + reroll tokens.
          Opened from the mission line; single-overlay policy respected
          (never rendered while the contracts board is up). */}
      {seasonState && !needsStarter && !showContractsBoard && (
        <SeasonTrack
          isVisible={showSeasonTrack}
          season={seasonState.season}
          track={seasonState.track}
          onClaim={handleSeasonClaim}
          onDismiss={() => {
            if (window.location.hash === '#season') {
              window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
            }
            setShowSeasonTrack(false);
          }}
        />
      )}

      {/* Wordmark - small and confident; the character below is the hero */}
      <header
        className="absolute top-0 inset-x-0 z-10 pt-5 flex justify-center pointer-events-none animate-fade-up"
        style={{ animationDelay: '120ms' }}
      >
        <h1 className="heading-display text-venom-orange text-glow-accent text-xl sm:text-2xl">
          SUPASNAKE
        </h1>
      </header>

      {/* Ambient counters - icon + number only, top-right */}
      {isAuthenticated && (
        <div
          className="absolute top-5 right-4 sm:right-5 z-10 flex items-center gap-4 animate-fade-up"
          style={{ animationDelay: '240ms' }}
        >
          <span className="flex items-center gap-1.5" title="DNA">
            <IconDna size={16} className="text-rarity-uncommon" />
            <span className="font-mono font-bold text-sm">
              {stats ? stats.dna.toLocaleString('en-US') : '—'}
            </span>
          </span>
          <span className="flex items-center gap-1.5" title="Energy">
            <IconBolt size={16} className="text-venom-orange" />
            <span className="font-mono font-bold text-sm">
              {stats ? `${stats.energy}/${stats.maxEnergy}` : '—'}
            </span>
          </span>
        </div>
      )}

      {/* Mission line + LAUNCH - the one obvious primary action */}
      <div className="home-launch-dock absolute inset-x-0 z-10 flex flex-col items-center gap-4 px-4">
        <div
          className="h-6 flex items-center justify-center animate-fade-up"
          style={{ animationDelay: '360ms' }}
        >
          {mission &&
            (mission.onSelect ? (
              <button
                key={mission.id}
                onClick={mission.onSelect}
                className="animate-fade-up flex items-center gap-2 label-arcade text-bone-white/90 hover:text-venom-orange-light transition-colors"
              >
                {mission.beacon && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-venom-orange shadow-glow-sm shadow-venom-orange/80 animate-glow-pulse"
                    aria-hidden="true"
                  />
                )}
                <span>{mission.text}</span>
              </button>
            ) : (
              <p
                key={mission.id}
                className="animate-fade-up label-arcade text-beige/80"
              >
                {mission.text}
              </p>
            ))}
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '480ms' }}>
          <button
            type="button"
            onClick={() => void runLaunch()}
            disabled={
              isLoading ||
              (launchState.phase !== 'idle' && launchState.phase !== 'failed')
            }
            className="btn-go px-16 sm:px-20 py-5 text-2xl min-h-[64px] inline-flex items-center justify-center gap-3 animate-glow-pulse shadow-venom-orange/70 disabled:cursor-wait disabled:opacity-70"
            aria-describedby={launchState.error ? 'launch-error' : undefined}
            data-launch-phase={launchState.phase}
          >
            <IconPlay size={26} />
            <span>{LAUNCH_PHASE_LABEL[launchState.phase]}</span>
          </button>
          {launchState.error && (
            <p
              id="launch-error"
              role="alert"
              className="mt-2 max-w-sm text-center font-body text-sm text-strike-red"
            >
              {launchState.error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
