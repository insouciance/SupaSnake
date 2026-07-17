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
  DailyRewardModal,
  type DailyRewardTier,
  type DailyClaimResult,
} from '@/components/engagement/DailyRewardModal';
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

interface DailyRewardsState {
  currentDay: number;
  canClaimToday: boolean;
  tiers: DailyRewardTier[];
  streak: { current: number; multiplier: number };
}

interface MissionItem {
  id: string;
  text: string;
  /** Glowing beacon dot (daily reward ready) */
  beacon?: boolean;
  /** Tapping the line performs this action (e.g. open the daily rewards) */
  onSelect?: () => void;
}

function dailyDismissKey(today: string): string {
  return `daily-reward-dismissed-${today}`;
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, signInAnonymously, session } = useAuth();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [daily, setDaily] = useState<DailyRewardsState | null>(null);
  const [showDailyModal, setShowDailyModal] = useState(false);
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
            setStreak(data.currentStreak ?? 0);
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

  // Daily rewards: fetch on mount, auto-open when claimable (once per day)
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/daily-rewards', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data: DailyRewardsState = await res.json();
        if (cancelled) return;
        setDaily(data);

        const today = new Date().toISOString().split('T')[0];
        let dismissedToday = false;
        try {
          dismissedToday = window.localStorage.getItem(dailyDismissKey(today)) === '1';
        } catch {
          // localStorage unavailable - treat as not dismissed
        }

        if (data.canClaimToday && !dismissedToday) {
          setShowDailyModal(true);
        }
      } catch {
        // Daily rewards UI simply stays closed on failure
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  const handleDailyClaim = useCallback(async (): Promise<DailyClaimResult | null> => {
    if (!token) return null;
    try {
      const res = await fetch('/api/daily-rewards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'claim' }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const result: DailyClaimResult = {
        dayClaimed: data.dayClaimed,
        dnaGranted: data.dnaGranted,
        energyGranted: data.energyGranted,
        nextDay: data.nextDay,
        cycleCompleted: data.cycleCompleted,
      };

      trackEvent(AnalyticsEvents.DAILY_REWARD_CLAIMED, {
        day: result.dayClaimed,
        dna_granted: result.dnaGranted,
        energy_granted: result.energyGranted,
        cycle_completed: result.cycleCompleted,
        category: 'engagement',
      });

      setDaily((prev) =>
        prev ? { ...prev, canClaimToday: false, currentDay: result.nextDay } : prev
      );
      setStats((prev) =>
        prev
          ? {
              ...prev,
              dna: prev.dna + result.dnaGranted,
              energy: prev.energy + result.energyGranted,
            }
          : prev
      );

      return result;
    } catch {
      return null;
    }
  }, [token]);

  const handleDailyDismiss = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    try {
      window.localStorage.setItem(dailyDismissKey(today), '1');
    } catch {
      // Ignore storage failures
    }
    setShowDailyModal(false);
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
    if (daily?.canClaimToday) {
      items.push({
        id: 'daily',
        text: 'Daily reward ready',
        beacon: true,
        onSelect: () => setShowDailyModal(true),
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
    if (streak !== null && streak > 0) {
      items.push({ id: 'streak', text: `${streak}-day streak active` });
    }
    if (items.length === 0) {
      items.push({ id: 'tagline', text: 'Where Skill Creates Legacy' });
    }
    return items;
  }, [isAuthenticated, daily?.canClaimToday, stats, streak]);

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

      {/* Anonymous users: dismissible save-progress banner / corner chip */}
      <SaveProgressBanner />

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

      {/* Daily reward calendar (auto-opens when claimable) */}
      {daily && !needsStarter && (
        <DailyRewardModal
          isVisible={showDailyModal}
          currentDay={daily.currentDay}
          canClaimToday={daily.canClaimToday}
          tiers={daily.tiers}
          streak={daily.streak}
          onClaim={handleDailyClaim}
          onDismiss={handleDailyDismiss}
        />
      )}

      {/* One-time FTUE hint */}
      {isAuthenticated && !needsStarter && (
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
