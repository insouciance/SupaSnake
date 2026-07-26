'use client';

/**
 * Home - "The Specimen Chamber"
 *
 * A premium game menu, not a web dashboard: the player's equipped snake
 * lives as a 3D character in a full-viewport chamber behind the UI. Over
 * it, a minimal hierarchy - small wordmark up top, ambient DNA/charges
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
import type { ChargeSnapshot } from '@/lib/store/gameStore';
import {
  SeasonTrack,
  type SeasonView,
  type SeasonTrackView,
} from '@/components/engagement/SeasonTrack';
import { StarterSelection } from '@/components/ftue/StarterSelection';
import { SignalSurface } from '@/components/signal/SignalSurface';
import { WorldReportCard } from '@/components/report/WorldReportCard';
import { onAnalyticsReady, trackEvent } from '@/lib/analytics/posthog';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { FunnelStages, trackFunnelStage } from '@/lib/analytics/funnel';
import { captureAttribution } from '@/lib/growth/attribution';
import { GROWTH_SURFACES_V1_ENABLED } from '@/lib/features/growth';
import { RUN_FLOW_V1_ENABLED } from '@/lib/features/runFlow';
import { LandingPitch } from '@/components/growth/LandingPitch';
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
  /** The day's harvest envelope (§8.6); null before sync or while the ramp hides it. */
  charge: ChargeSnapshot | null;
  highScore: number;
  collectionSize: number;
  needsStarterSelection: boolean;
  hasCompletedFirstRun: boolean;
}

interface MissionItem {
  id: string;
  text: string;
  /** Glowing beacon dot (an action is ready) */
  beacon?: boolean;
  /** Tapping the line performs this action (e.g. open the season track) */
  onSelect?: () => void;
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, signInAnonymously, session } = useAuth();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [streak, setStreak] = useState<{ current: number } | null>(null);
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
  // The Signal's own take state (§7.2). Separate from `launchState` so a
  // failed take never puts the LAUNCH button into a Retry phase — the ordinary
  // run must stay one tap away whatever the Signal did (§5, Rule 10).
  const [signalTaking, setSignalTaking] = useState(false);
  const [signalTakeError, setSignalTakeError] = useState<string | null>(null);
  const publishNotification = useNotificationStore((state) => state.publish);
  const clearNotification = useNotificationStore((state) => state.clear);
  const notificationsHydrated = useNotificationStore((state) => state.hasHydrated);

  const token = session?.access_token;

  // Persisted attention belongs only to an eligible signed-in player. Clear
  // stale meta links once auth or first-run authority proves them unavailable.
  useEffect(() => {
    if (!FTUE_V2_ENABLED || !notificationsHydrated || isLoading) return;
    if (!isAuthenticated || stats?.hasCompletedFirstRun === false) {
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

  // Acquisition funnel (Constitution §11.5). Arrive fires on every landing;
  // Reach fires additionally when the visit carries a channel. Both wait for
  // capture to be live, because the provider that starts PostHog is this
  // component's parent and its effect therefore runs second — sampling
  // isAnalyticsInitialized() here directly would drop every first paint.
  // Attribution storage is separately gated on marketing consent.
  useEffect(() => {
    return onAnalyticsReady(() => {
      const attribution = captureAttribution();
      if (attribution) trackFunnelStage(FunnelStages.REACH);
      trackFunnelStage(FunnelStages.ARRIVE);
    });
  }, []);

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
              charge: (data.charge as ChargeSnapshot | undefined) ?? null,
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
            setStreak({ current: data.currentStreak ?? 0 });
            trackEvent(AnalyticsEvents.DAILY_LOGIN, {
              current_streak: data.currentStreak ?? 0,
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

  // Contracts were retired by WP-1.03 (Constitution §7.2, §12.2, §13): the
  // World Signal is the one daily surface, `/api/contracts` is gone and the
  // RPCs behind it are tombstones. Nothing here fetches a contract board.
  //
  // What remains is cleanup for players who still carry a persisted
  // "Daily Contracts ready" entry in local notification state: it points at
  // `/#contracts`, which no longer opens anything. Clear it once, on mount,
  // so nobody is left tapping a dead link. Claimed contract HISTORY is
  // untouched — it lives server-side in `player_contracts` (Rule 6).
  useEffect(() => {
    if (!notificationsHydrated) return;
    clearNotification('contracts');
  }, [clearNotification, notificationsHydrated]);

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
      if (window.location.hash === '#season') setShowSeasonTrack(true);
    };
    const unsubscribeSeason = subscribeNotificationAction(
      'open-season',
      () => setShowSeasonTrack(true)
    );
    syncExplicitDestination();
    window.addEventListener('hashchange', syncExplicitDestination);
    return () => {
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

  const runLaunch = useCallback(async (
    skipIdentityGate = false,
    /**
     * Constitution §7.2: the Signal objective the player took, if this launch
     * came from the Signal surface rather than the LAUNCH button. It is a
     * lookup key among the day's server-derived three and travels on the START
     * request, because migration 049 binds the day's attempt to an open run
     * and §8.6 decides the charge in that same request.
     */
    signalObjectiveId?: string
  ): Promise<boolean> => {
    if (launchInFlightRef.current) return false;

    if (!skipIdentityGate && !isAuthenticated) {
      const gate = evaluateAnonymousSignInGate(readLastUser());
      if (gate === 'welcome-back') {
        setWelcomeBack(readLastUser());
        return false;
      }
      if (gate === 'warn-progress-loss') {
        setShowLossNotice(true);
        return false;
      }
    }

    if (!FTUE_V2_ENABLED) {
      if (!isAuthenticated) {
        const result = await signInAnonymously();
        if (result?.error) {
          dispatchLaunch({ type: 'FAIL', error: result.error.message });
          return false;
        }
      }
      router.push('/game');
      return true;
    }

    // Constitution §5 (owner ruling, 25 July 2026): LAUNCH opens the Run
    // Setup page, it does not start a run. The prepared-run handoff below
    // exists to put the board on screen in one tap; the ruling replaces that
    // with "open → LAUNCH → START → board, ≤3 taps, and the setup page adds
    // exactly one of them". So under Run Flow v1 LAUNCH still signs the
    // player in and bootstraps their snake — that is what makes the setup
    // page *fully preset* for a first-time player — and then simply
    // navigates. No session is started here, so no run is ever created and
    // abandoned by a player who opens setup and walks away.
    // Run Setup (WP-1.06) does not carry a taken Signal objective onto its
    // START request, and the objective has to ride the START that opens the
    // run (§8.6). So a launch that came from the Signal surface prepares the
    // run here, exactly as the pre-Run-Flow path does, whatever this flag
    // says. The LAUNCH button is untouched by this branch: with no objective
    // it still opens Run Setup and adds no tap.
    if (RUN_FLOW_V1_ENABLED && !signalObjectiveId) {
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
        dispatchLaunch({ type: 'RUN_LOADED' });
        router.push('/game');
        return true;
      } catch (error) {
        dispatchLaunch({
          type: 'FAIL',
          error:
            error instanceof Error ? error.message : 'Could not open the run setup',
        });
        return false;
      } finally {
        launchInFlightRef.current = false;
      }
    }

    if (!launchHandoffStorageAvailable()) {
      dispatchLaunch({
        type: 'FAIL',
        error: 'This browser cannot safely prepare a run. Enable session storage and Retry.',
      });
      return false;
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
        bootstrap,
        fetch,
        signalObjectiveId
      );
      if (!storeLaunchHandoff(handoff)) {
        throw new LaunchFlowError('Could not transfer the prepared run. Please Retry.');
      }

      dispatchLaunch({ type: 'RUN_LOADED' });
      router.push('/game?launch=ftue-v2');
      return true;
    } catch (error) {
      const message =
        error instanceof LaunchFlowError && error.retryAfterMs
          ? `${error.message}. Retry in ${Math.ceil(error.retryAfterMs / 1000)}s.`
          : error instanceof Error
            ? error.message
            : 'Could not launch the run';
      dispatchLaunch({ type: 'FAIL', error: message });
      return false;
    } finally {
      launchInFlightRef.current = false;
    }
  }, [isAuthenticated, router, session, signInAnonymously]);

  /**
   * Take one of the day's three (§7.2). The take and the run are one act — the
   * server binds the day's attempt to an OPEN run — so this launches, and the
   * surface says so before the player taps.
   *
   * A failure here is reported on the Signal card and nowhere else: the day's
   * opportunity is the only thing at stake (Rule 5), and LAUNCH stays exactly
   * as available as it was.
   */
  const handleSignalTake = useCallback(
    async (objectiveId: string): Promise<boolean> => {
      setSignalTaking(true);
      setSignalTakeError(null);
      try {
        const launched = await runLaunch(false, objectiveId);
        if (!launched) {
          setSignalTakeError(
            'The Signal run did not start. Try again, or just LAUNCH — an ordinary run is unaffected.'
          );
        }
        return launched;
      } finally {
        setSignalTaking(false);
      }
    },
    [runLaunch]
  );

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
  }, [isAuthenticated, seasonState, stats, streak]);

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

  // The "what is this" section for scrollers and crawlers (§11.4). Rendered
  // AFTER the 100dvh chamber, never inside it: the fold, the LAUNCH dock and
  // the ≤3-tap law (§5) are untouched for a visitor who never scrolls. Shown
  // to logged-out visitors only — a returning player wants the game, not the
  // pitch — and server-rendered in that state, so crawlers always see it.
  const showLandingPitch = GROWTH_SURFACES_V1_ENABLED && !isAuthenticated;

  return (
    <>
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

      {/* Season track (§7.2): free milestones - cosmetics and titles.
          Opened from the mission line. The contracts board that used to
          contend for this slot was retired with the mechanism (§12.2). */}
      {seasonState && !needsStarter && (
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
          {/* Charges appear only once the §8.6 ramp says so - a new player
              never meets scarcity before they have met the game. */}
          {stats?.charge?.visible && (
            <span className="flex items-center gap-1.5" title="Charges today">
              <IconBolt size={16} className="text-venom-orange" />
              <span className="font-mono font-bold text-sm">
                {stats.charge.remaining}/{stats.charge.perDay}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Mission line + LAUNCH - the one obvious primary action */}
      <div className="home-launch-dock absolute inset-x-0 z-10 flex flex-col items-center gap-4 px-4">
        {/* The World Signal (§7.2) — the ONE daily surface, standing in the
            slot the retired Contracts board occupied (§12.2, §13). The dock is
            bottom-anchored, so this grows UPWARD: LAUNCH does not move and
            open → LAUNCH → START is the same three taps it always was (§5,
            Rule 10). Nothing here is required to start a run.

            Withheld until the player has completed a run under FTUE v2, the
            same threshold every other meta surface on this page uses — a first
            run is never made to compete with a daily. */}
        {/* The World Report (§7.5) — what the world did while they were away,
            read before today's Signal because that is the order the two make
            sense in: the weeks that submerged, then the day that is up. It
            renders only for a player the server judges to be returning, and
            renders nothing at all for everybody else, so this slot is empty on
            almost every visit.

            It is in the dock rather than over it on purpose: the dock is
            bottom-anchored and grows upward, so the card cannot move LAUNCH and
            cannot stand in front of it (§7.5's "never blocking Launch", Rule
            10). Same authentication gate as the Signal below — a first run is
            never made to compete with a meta surface. */}
        {isAuthenticated &&
          !needsStarter &&
          (!FTUE_V2_ENABLED || stats?.hasCompletedFirstRun === true) && (
            <WorldReportCard token={token} />
          )}

        {isAuthenticated &&
          !needsStarter &&
          (!FTUE_V2_ENABLED || stats?.hasCompletedFirstRun === true) && (
            <SignalSurface
              token={token}
              onTake={handleSignalTake}
              taking={signalTaking}
              takeError={signalTakeError}
            />
          )}

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
            data-testid="launch-cta"
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
    {showLandingPitch && <LandingPitch />}
    </>
  );
}
