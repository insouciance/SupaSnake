'use client';

/**
 * Home - "The Specimen Chamber"
 *
 * A premium game menu, not a web dashboard: the player's equipped snake
 * lives as a 3D character in a full-viewport chamber behind the UI. Over
 * it, a minimal hierarchy - identity and wallet up top, one rotating mission
 * line, and four compact player destinations below the character.
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
import { ChamberPlaceholder } from '@/components/home/ChamberPlaceholder';
import {
  HomeIdentityHud,
  type HomeClanIdentity,
  type HomeSpecimenIdentity,
} from '@/components/home/HomeIdentityHud';
import {
  HomeCommandRail,
  type HomeCommand,
} from '@/components/home/HomeCommandRail';
import { HomeCodexRelic } from '@/components/home/HomeCodexRelic';
import { CosmeticsMenu } from '@/components/home/CosmeticsMenu';
import { useSnakeCosmetics } from '@/hooks/useSnakeCosmetics';
import { SNAKE_COSMETICS_ENABLED } from '@/lib/features/snakeCosmetics';
import type { ChargeSnapshot } from '@/lib/store/gameStore';
import { isStrainId } from '@/shared/game/strains';
import {
  SeasonTrack,
  type SeasonView,
  type SeasonTrackView,
} from '@/components/engagement/SeasonTrack';
import { StarterSelection } from '@/components/ftue/StarterSelection';
import { SignalSurface } from '@/components/signal/SignalSurface';
import { WorldReportCard } from '@/components/report/WorldReportCard';
import { HomeAnomalyFlash } from '@/components/home/HomeAnomalyFlash';
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
  requestAttentionRefresh,
} from '@/lib/stores/notificationStore';

// The chamber is WebGL-heavy: lazy-mount client-side only, with the styled
// gradient placeholder holding the space (zero layout shift).
const SpecimenChamber = dynamicImport(
  () => import('@/components/home/SpecimenChamber'),
  { ssr: false, loading: () => null }
);

/**
 * SHARED-ELEMENT CONTINUITY — how the wardrobe opens.
 *
 * The snake never unmounts, never moves, and never reloads. What changes is
 * the chrome around it: Home's menus blur and fade back, the cosmetics
 * selectors fade in where the dock was, and the camera pushes slightly in.
 * The player should read it as approaching their pet, not as visiting a page.
 *
 * `blur` on a wrapper creates a containing block for absolutely positioned
 * descendants, which is why the chrome wrapper spans `inset-0` instead of
 * being a bare `<div>`: the header and the codex relic position themselves
 * against the viewport, and a collapsed static wrapper would move them the
 * instant the blur turned on. Spanning the same box keeps their coordinates
 * identical in both states — the transition may change appearance, never
 * layout.
 *
 * The step-back is paired with `inert` at the call site. A faded control that
 * is still clickable and still in the tab order is a trap, and no amount of
 * opacity makes it not one.
 */
const HOME_CHROME_TRANSITION =
  'transition-[opacity,filter] duration-300 ease-out motion-reduce:transition-none';
const HOME_CHROME_BACK = 'pointer-events-none opacity-0 blur-[6px]';

/** Full catalog: 10 variants per MVP dynasty (full data lives in the DB) */
const TOTAL_VARIANTS = MVP_DYNASTIES.length * 10;

interface HomeStats {
  dna: number;
  /** Recovering Energy (§8.6); null before sync or while the ramp hides it. */
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
  const [specimenIdentity, setSpecimenIdentity] =
    useState<HomeSpecimenIdentity | null>(null);
  const [clanIdentity, setClanIdentity] = useState<HomeClanIdentity | null>(null);
  const [chamberReaction, setChamberReaction] = useState<HomeCommand | null>(null);
  const [chamberReady, setChamberReady] = useState(false);
  /**
   * The wardrobe is a STATE of this page, never a route.
   *
   * Shared-element continuity, stated as a rule: the canvas is mounted once
   * and the snake never unmounts, never moves, and never reloads. Opening the
   * cosmetics menu blurs the home chrome out, fades the selectors in, and
   * pushes the camera slightly toward the specimen. A route would remount the
   * canvas, and a remounted canvas is a visible page change no amount of
   * transition styling can hide — the player would watch their pet blink out
   * and come back.
   */
  const [cosmeticsOpen, setCosmeticsOpen] = useState(false);
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

  const token = session?.access_token;

  // The wardrobe. Read even when the flag is off: the loadout is server-held
  // and the snake must wear what the database says whether or not this build
  // can open the menu that changed it. Rolling the flag back removes the
  // wardrobe, never the clothes.
  const cosmetics = useSnakeCosmetics(token);
  const cosmeticsAvailable =
    SNAKE_COSMETICS_ENABLED && isAuthenticated && cosmetics.catalog.live;

  // A flag flip or a sign-out while the tray is open must close it rather than
  // leave an orphaned surface over the chamber.
  useEffect(() => {
    if (!cosmeticsAvailable && cosmeticsOpen) setCosmeticsOpen(false);
  }, [cosmeticsAvailable, cosmeticsOpen]);

  // Escape closes the wardrobe. It is not a modal — nothing is trapped and
  // Home is still fully operable behind it — but Escape is what a player
  // reaches for to back out of a state, and that expectation is not modal.
  useEffect(() => {
    if (!cosmeticsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCosmeticsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cosmeticsOpen]);

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

  // Retry any settlement requests held in this tab's memory. Progress never
  // enters browser persistence; a delivered/duplicate request recovers the
  // canonical server impact receipt and refreshes server-owned attention.
  useEffect(() => {
    if (!token) return;
    replayRewardOutbox(token, fetch, session?.user?.id)
      .then((result) => {
        if (result.impacts.length > 0) requestAttentionRefresh();
      })
      .catch((err) => {
        console.error('Settlement retry failed:', err);
      });
  }, [session?.user?.id, token]);

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
              charge:
                (data.energy as ChargeSnapshot | undefined) ??
                (data.charge as ChargeSnapshot | undefined) ??
                null,
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

  // The chamber presents the EQUIPPED snake. The art scene may retain its
  // PRIMAL fallback while loading, but the identity label remains absent
  // until the authoritative collection response supplies factual values.
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setSpecimenIdentity(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/collection', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const snakes: {
          isEquipped?: boolean;
          dynastyName?: string | null;
          variantName?: string | null;
          generation?: number;
          lineage?: { strains?: unknown } | null;
        }[] = Array.isArray(data.snakes) ? data.snakes : [];
        const specimen = snakes.find((s) => s.isEquipped) ?? snakes[0];
        const name = specimen?.dynastyName?.toUpperCase();
        if (name && (MVP_DYNASTIES as readonly string[]).includes(name)) {
          setDynasty(name as DynastyId);
        }
        const variantName = specimen?.variantName?.trim();
        const generation = Number(specimen?.generation);
        const rawStrains = specimen?.lineage?.strains;
        const lineageStrain =
          Array.isArray(rawStrains) && isStrainId(rawStrains[0])
            ? rawStrains[0]
            : null;
        if (
          variantName &&
          Number.isSafeInteger(generation) &&
          generation > 0
        ) {
          setSpecimenIdentity({ variantName, generation, lineageStrain });
        } else {
          setSpecimenIdentity(null);
        }
      } catch {
        // The visual fallback remains, but no factual identity is invented.
        if (!cancelled) setSpecimenIdentity(null);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  // Clan identity is optional and likewise server-fed. Home only needs the
  // small membership bridge, never the full governance/roster payload.
  useEffect(() => {
    const userId = session?.user.id;
    if (!isAuthenticated || !token || !userId) {
      setClanIdentity(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/clan?playerId=${encodeURIComponent(userId)}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setClanIdentity(null);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const clan = data.clan as Record<string, unknown> | null | undefined;
        const name = typeof clan?.name === 'string' ? clan.name.trim() : '';
        const tag = typeof clan?.tag === 'string' && clan.tag.trim()
          ? clan.tag.trim()
          : null;
        setClanIdentity(name ? { name, tag } : null);
      } catch {
        if (!cancelled) setClanIdentity(null);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, session?.user.id, token]);

  // Season track (§7.2): fetch the live season + the player's read-only track.
  // { live: false } (pre-migration-021) or no live season simply keeps the
  // season surfaces hidden - non-fatal like every engagement fetch here.
  useEffect(() => {
    if (
      !isAuthenticated ||
      !token ||
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
    isAuthenticated,
    token,
    stats?.hasCompletedFirstRun,
  ]);

  // A hash destination represents an explicit player action. Merely
  // loading Home never opens these overlays.
  useEffect(() => {
    const syncExplicitDestination = () => {
      if (window.location.hash === '#season') setShowSeasonTrack(true);
    };
    syncExplicitDestination();
    window.addEventListener('hashchange', syncExplicitDestination);
    return () => {
      window.removeEventListener('hashchange', syncExplicitDestination);
    };
  }, []);

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
        error: 'This browser cannot safely prepare a run. Please Retry.',
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
            'The Signal run did not start. Try again, or just Play — an ordinary run is unaffected.'
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
  // Mission line - one contextual line above the Home actions, rotating every 6s
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
      items.push({
        id: 'season',
        text: `${seasonState.season.name} · week ${seasonState.season.week} of ${seasonState.season.weeks}`,
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
    <main
      className="consent-safe-viewport app-bg text-bone-white relative h-[100dvh] overflow-hidden"
      data-home-chamber-root
    >
      {/* The Specimen Chamber - full-viewport scene behind the UI. The
          placeholder holds the atmosphere until WebGL is live, then the
          chamber fades in from black (600ms). */}
      {/* Not aria-hidden as a whole: the specimen carries a real, labelled tap
          target when the wardrobe is available, and a control inside an
          aria-hidden subtree is a control no assistive technology can reach.
          The <canvas> itself announces nothing, which is correct — it is the
          picture, and the button is how the platform is told about it. */}
      <div className="absolute inset-0 z-0">
        <ChamberPlaceholder />
        <div
          className={`absolute inset-0 transition-opacity duration-[600ms] ease-out ${
            chamberReady ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <SpecimenChamber
            dynasty={dynasty}
            reaction={chamberReaction}
            onReady={() => setChamberReady(true)}
            loadout={cosmetics.displayLoadout}
            pushIn={cosmeticsOpen}
            onSelect={
              cosmeticsAvailable ? () => setCosmeticsOpen(true) : undefined
            }
            selectLabel="Dress up your snake"
          />
        </div>
      </div>

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

      {/* Season track (§7.2): read-only milestones - cosmetics and titles.
          Opened from the mission line. The contracts board that used to
          contend for this slot was retired with the mechanism (§12.2). */}
      {seasonState && !needsStarter && (
        <SeasonTrack
          isVisible={showSeasonTrack}
          season={seasonState.season}
          track={seasonState.track}
          onDismiss={() => {
            if (window.location.hash === '#season') {
              window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
            }
            setShowSeasonTrack(false);
          }}
        />
      )}

      {/* HOME CHROME. It steps back while the wardrobe is open — blurred and
          faded, not unmounted, so nothing reflows and the return is the same
          motion reversed. `inert` is what makes "stepped back" true rather
          than cosmetic: a faded control that is still clickable and still in
          the tab order is a trap, and blur alone would leave one. */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 ${HOME_CHROME_TRANSITION} ${
          cosmeticsOpen ? HOME_CHROME_BACK : ''
        }`}
        data-home-chrome
        data-stepped-back={cosmeticsOpen}
        inert={cosmeticsOpen}
      >
        <HomeIdentityHud
          specimen={specimenIdentity}
          clan={clanIdentity}
          authenticated={isAuthenticated}
          dna={stats?.dna ?? null}
          energy={stats?.charge ?? null}
        />
        <HomeCodexRelic />
      </div>

      {/* The wardrobe takes the dock's place, in the dock's position, so the
          player's eye does not travel: the controls change, the layout does
          not. */}
      {cosmeticsOpen && (
        <div
          className="absolute inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-20 flex flex-col items-center gap-3 px-4 animate-fade-up sm:bottom-[calc(1rem+var(--consent-banner-height,0px))]"
          data-home-cosmetics-dock
        >
          <CosmeticsMenu
            catalog={cosmetics.catalog}
            busy={cosmetics.busy}
            error={cosmetics.error}
            onEquip={cosmetics.equip}
            onPreview={cosmetics.preview}
            onClose={() => setCosmeticsOpen(false)}
          />
        </div>
      )}

      {/* Context and four equal player destinations. The dock stays clear of
          phone safe areas and the measured desktop consent surface. */}
      <div
        className={`absolute inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-10 flex flex-col items-center gap-3 px-4 sm:bottom-[calc(1rem+var(--consent-banner-height,0px))] ${HOME_CHROME_TRANSITION} ${
          cosmeticsOpen ? HOME_CHROME_BACK : ''
        }`}
        data-home-command-dock
        data-stepped-back={cosmeticsOpen}
        inert={cosmeticsOpen}
      >
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
        {isAuthenticated && !needsStarter && <HomeAnomalyFlash token={token} />}

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
                /* The mission line is the one piece of type on Home that sits
                   directly on the ROOM rather than on a chip, so it is the one
                   the dark ruling actually moves: ink on a night ground is
                   ink on ink. It takes the bone white the rest of the product
                   uses over the void, and its hover goes to the amber's LIT
                   end for the same reason — `venom-orange-dark` was picked to
                   survive cream and disappears here. */
                className="animate-fade-up flex items-center gap-2 label-arcade text-bone-white hover:text-venom-orange transition-colors"
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
                className="animate-fade-up label-arcade text-bone-white/70"
              >
                {mission.text}
              </p>
            ))}
        </div>

        <div className="flex w-full flex-col items-center animate-fade-up" style={{ animationDelay: '480ms' }}>
          {launchState.error && (
            <p
              id="launch-error"
              role="alert"
              className="mb-1 max-w-sm text-center font-body text-sm text-strike-red"
            >
              {launchState.error}
            </p>
          )}
          <HomeCommandRail
            onPlay={() => void runLaunch()}
            playDisabled={
              isLoading ||
              (launchState.phase !== 'idle' && launchState.phase !== 'failed')
            }
            playLabel={
              launchState.phase === 'idle'
                ? 'Play'
                : launchState.phase === 'failed'
                  ? 'Retry Play'
                  : LAUNCH_PHASE_LABEL[launchState.phase]
            }
            playPhase={launchState.phase}
            playErrorId={launchState.error ? 'launch-error' : undefined}
            onReactionChange={setChamberReaction}
          />
        </div>
      </div>
    </main>
    {showLandingPitch && <LandingPitch />}
    </>
  );
}
