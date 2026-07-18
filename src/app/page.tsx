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

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { SaveProgressBanner } from '@/components/auth/UpgradePrompt';
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
import { OverlayHint } from '@/components/ftue/OverlayHint';
import { trackEvent } from '@/lib/analytics/posthog';
import { AnalyticsEvents } from '@/lib/analytics/events';

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
  const [dynasty, setDynasty] = useState<DynastyId>('CYBER');
  const [chamberReady, setChamberReady] = useState(false);
  const [missionIndex, setMissionIndex] = useState(0);

  const token = session?.access_token;

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
  // collection. Fresh visitors (or failures) get the CYBER specimen.
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
        // CYBER specimen fallback
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  // Daily contracts (Design v2 section 7.3 - the modal is the contracts
  // board now): fetch on mount (lazily generates today's 3 offers) and
  // auto-open once per day while there is something to do - picks left
  // or a completed contract to claim.
  useEffect(() => {
    if (!isAuthenticated || !token) return;
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

        const today = new Date().toISOString().split('T')[0];
        let dismissedToday = false;
        try {
          dismissedToday = window.localStorage.getItem(dailyDismissKey(today)) === '1';
        } catch {
          // localStorage unavailable - treat as not dismissed
        }

        const canPick =
          data.picksRemaining > 0 && data.contracts.some((c) => !c.picked);
        if ((canPick || data.claimable) && !dismissedToday) {
          setShowContractsBoard(true);
        }
      } catch {
        // Contracts UI simply stays closed on failure
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  // Season track (§7.2): fetch the live season + the player's free track.
  // { live: false } (pre-migration-021) or no live season simply keeps the
  // season surfaces hidden - non-fatal like every engagement fetch here.
  useEffect(() => {
    if (!isAuthenticated || !token) return;
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
        }
      } catch {
        // Season UI simply stays hidden on failure
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

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
    const today = new Date().toISOString().split('T')[0];
    try {
      window.localStorage.setItem(dailyDismissKey(today), '1');
    } catch {
      // Ignore storage failures
    }
    setShowContractsBoard(false);
  }, []);

  const handlePlay = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isAuthenticated) return;

    const gate = evaluateAnonymousSignInGate(readLastUser());

    if (gate === 'welcome-back') {
      // A registered account used this device - never silently replace it
      e.preventDefault();
      setWelcomeBack(readLastUser());
      return;
    }

    if (gate === 'warn-progress-loss') {
      // Previous anonymous session is gone - warn once before a new identity
      e.preventDefault();
      setShowLossNotice(true);
      return;
    }

    await signInAnonymously();
  };

  const handleContinueAfterLossNotice = useCallback(async () => {
    markProgressLossNoticed();
    setShowLossNotice(false);
    await signInAnonymously();
    router.push('/game');
  }, [signInAnonymously, router]);

  const handleStartFresh = useCallback(() => {
    clearLastUser();
    setWelcomeBack(null);
  }, []);

  const needsStarter = isAuthenticated && stats?.needsStarterSelection === true;

  // ---------------------------------------------------------------------------
  // Mission line - one contextual line above Launch, rotating every 6s
  // ---------------------------------------------------------------------------

  const missionItems = useMemo<MissionItem[]>(() => {
    if (!isAuthenticated) {
      return [{ id: 'tagline', text: 'Where Skill Creates Legacy' }];
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

      {/* Anonymous users: corner chip only on the cinematic home (the nav
          rail's GUEST node signals auth state); hidden while any modal is
          up so overlays never stack */}
      <SaveProgressBanner
        variant="chip"
        suppressed={
          needsStarter ||
          showContractsBoard ||
          showSeasonTrack ||
          Boolean(welcomeBack && !isAuthenticated)
        }
      />

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

      {/* FTUE: full-screen starter chooser for players with no snakes */}
      {needsStarter && <StarterSelection />}

      {/* Daily contracts board (auto-opens once/day when actionable) */}
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
          onDismiss={() => setShowSeasonTrack(false)}
        />
      )}

      {/* One-time FTUE hint - never while a modal is up (single-overlay
          policy: on mobile the stacked chip+modal+rail read as clutter) */}
      {isAuthenticated && !needsStarter && !showContractsBoard && (
        <OverlayHint id="home-play-dna" message="Play to earn DNA - spend it in the Lab" />
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
      <div className="absolute inset-x-0 z-10 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] sm:bottom-12 flex flex-col items-center gap-4 px-4">
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
          <Link
            href="/game"
            onClick={handlePlay}
            className="btn-go px-16 sm:px-20 py-5 text-2xl min-h-[64px] inline-flex items-center justify-center gap-3 animate-glow-pulse shadow-venom-orange/70"
          >
            <IconPlay size={26} />
            <span>Launch</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
