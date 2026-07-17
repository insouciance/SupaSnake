'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
import { MVP_DYNASTIES, DYNASTY_THEMES } from '@/shared/types/snake-data-model';
import { NavBar } from '@/components/ui/NavBar';
import { StatDisplay } from '@/components/ui/StatDisplay';
import {
  IconDna,
  IconBolt,
  IconTrophy,
  IconFlame,
  IconEgg,
  IconFlask,
  IconPlay,
  IconSnake,
  IconArrowRight,
} from '@/components/ui/icons';
import {
  DailyRewardModal,
  type DailyRewardTier,
  type DailyClaimResult,
} from '@/components/engagement/DailyRewardModal';
import { StarterSelection } from '@/components/ftue/StarterSelection';
import { OverlayHint } from '@/components/ftue/OverlayHint';
import { trackEvent } from '@/lib/analytics/posthog';
import { AnalyticsEvents } from '@/lib/analytics/events';

// Static dynasty preview data (full catalog lives in the DB: 10 variants each)
const DYNASTY_PREVIEW = MVP_DYNASTIES.map((name) => ({
  name,
  colorPrimary: DYNASTY_THEMES[name].primary,
  variantCount: 10,
}));

// Emissive glow color per dynasty (DB primaries are too dark for the void)
const DYNASTY_GLOW: Record<string, string> = {
  CYBER: '#00FFFF',
  PRIMAL: '#86efac',
  COSMIC: '#a855f7',
};

const TOTAL_VARIANTS = DYNASTY_PREVIEW.reduce((sum, d) => sum + d.variantCount, 0);

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

function dailyDismissKey(today: string): string {
  return `daily-reward-dismissed-${today}`;
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, signInAnonymously, session } = useAuth();
  const [selectedDynasty, setSelectedDynasty] = useState<string>('CYBER');
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [daily, setDaily] = useState<DailyRewardsState | null>(null);
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState<LastUserMarker | null>(null);
  const [showLossNotice, setShowLossNotice] = useState(false);

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
  const collectionPct = stats
    ? Math.min(100, Math.round((stats.collectionSize / TOTAL_VARIANTS) * 100))
    : 0;

  return (
    <main className="app-bg text-bone-white relative overflow-x-hidden">
      {/* Navigation Bar */}
      <NavBar />

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

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-8 pt-16 pb-12">
        <div className="w-full max-w-5xl space-y-6">

          {/* Hero: mascot + wordmark + primary CTA */}
          <section className="text-center pt-6 sm:pt-10 animate-fade-up">
            <div className="animate-float inline-block">
              <Image
                src="/brand/mascot.png"
                alt="SupaSnake mascot"
                width={288}
                height={288}
                priority
                className="mx-auto w-44 sm:w-64 h-auto drop-shadow-[0_0_48px_rgba(34,211,238,0.35)]"
              />
            </div>
            <h1 className="heading-display text-glow-orange text-venom-orange text-5xl sm:text-7xl animate-breathe">
              SUPASNAKE
            </h1>
            <p className="label-arcade mt-3 text-sm">Where Skill Creates Legacy</p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Link
                href="/game"
                onClick={handlePlay}
                className="btn-go px-10 py-4 text-xl min-h-[56px] inline-flex items-center justify-center gap-3 animate-glow-pulse shadow-venom-orange/70"
              >
                <IconPlay size={22} />
                <span>Launch</span>
              </Link>
              <Link
                href="/lab"
                className="btn-neutral px-10 py-4 text-xl min-h-[56px] inline-flex items-center justify-center gap-3"
              >
                <IconFlask size={22} />
                <span>Lab</span>
              </Link>
            </div>
          </section>

          {/* Stat strip: DNA / energy / streak / high score */}
          <section
            className="panel-elevated p-4 sm:p-6 animate-fade-up"
            style={{ animationDelay: '80ms' }}
          >
            <h2 className="label-arcade mb-4">Pilot Stats</h2>
            {isAuthenticated ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="flex items-start gap-2.5">
                  <IconTrophy size={20} className="text-venom-orange mt-0.5 shrink-0" />
                  <StatDisplay
                    label="High Score"
                    value={stats ? stats.highScore : '—'}
                    highlight
                    size="sm"
                  />
                </div>
                <div className="flex items-start gap-2.5">
                  <IconFlame size={20} className="text-strike-red mt-0.5 shrink-0" />
                  <StatDisplay
                    label="Streak"
                    value={streak !== null ? streak : '—'}
                    size="sm"
                  />
                </div>
                <div className="flex items-start gap-2.5">
                  <IconDna size={20} className="text-rarity-uncommon mt-0.5 shrink-0" />
                  <StatDisplay label="DNA" value={stats ? stats.dna : '—'} size="sm" />
                </div>
                <div className="flex items-start gap-2.5">
                  <IconBolt size={20} className="text-rarity-legendary mt-0.5 shrink-0" />
                  <StatDisplay
                    label="Energy"
                    value={stats ? `${stats.energy}/${stats.maxEnergy}` : '—'}
                    size="sm"
                  />
                </div>
                <div className="flex items-start gap-2.5">
                  <IconEgg size={20} className="text-beige mt-0.5 shrink-0" />
                  <StatDisplay
                    label="Collection"
                    value={stats ? stats.collectionSize : '—'}
                    suffix="snakes"
                    size="sm"
                  />
                </div>
              </div>
            ) : (
              <p className="text-beige/60 text-sm font-body py-2">
                {isLoading ? 'Connecting...' : 'Launch a game to start your pilot record.'}
              </p>
            )}
          </section>

          {/* Dynasty showcase: three glow cards, selectable */}
          <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
            <h2 className="label-arcade mb-3">Dynasties</h2>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {DYNASTY_PREVIEW.map((dynasty) => {
                const glow = DYNASTY_GLOW[dynasty.name] ?? dynasty.colorPrimary;
                const isSelected = selectedDynasty === dynasty.name;
                return (
                  <button
                    key={dynasty.name}
                    onClick={() => setSelectedDynasty(dynasty.name)}
                    className={`panel-glow p-3 sm:p-5 text-center transition-all hover:scale-[1.02] active:scale-[0.98] ${
                      isSelected ? '' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ '--glow': glow } as React.CSSProperties}
                  >
                    <IconSnake size={28} className="mx-auto" style={{ color: glow }} />
                    <div
                      className="heading-display text-sm sm:text-base mt-2"
                      style={{ color: glow, textShadow: `0 0 14px ${glow}66` }}
                    >
                      {dynasty.name}
                    </div>
                    <div className="text-xs font-mono text-beige/50 mt-1">
                      {dynasty.variantCount} variants
                    </div>
                    <div className="h-4 mt-1">
                      {isSelected && (
                        <span className="label-arcade text-[10px]" style={{ color: glow }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Next goal: collection progress toward the next variant */}
          {isAuthenticated && stats && (
            <section
              className="panel p-4 sm:p-6 animate-fade-up"
              style={{ animationDelay: '240ms' }}
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="label-arcade">Next Goal</h2>
                <span className="font-mono text-xs text-beige/50">
                  {stats.collectionSize}/{TOTAL_VARIANTS} unlocked
                </span>
              </div>
              <p className="font-body text-beige text-sm mb-3">
                {stats.collectionSize >= TOTAL_VARIANTS
                  ? 'Every variant unlocked. Your dynasty is complete.'
                  : 'Unlock your next variant - earn DNA and spend it in the Lab.'}
              </p>
              <div className="h-2 bg-void-deep border border-scale-blue-light/40 rounded-[2px] overflow-hidden">
                <div
                  className="h-full bg-cta-gradient shadow-glow-sm shadow-venom-orange/60 transition-all duration-500"
                  style={{ width: `${collectionPct}%` }}
                />
              </div>
              <Link
                href="/lab"
                className="inline-flex items-center gap-1.5 mt-3 py-2 text-sm font-body font-semibold text-venom-orange hover:text-venom-orange-light transition-colors"
              >
                Go to Lab
                <IconArrowRight size={16} />
              </Link>
            </section>
          )}

          {/* Mission briefing */}
          <section
            className="panel-elevated p-4 sm:p-6 animate-fade-up"
            style={{ animationDelay: '320ms' }}
          >
            <h2 className="label-arcade mb-4">Mission Briefing</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-void-deep/40 rounded-arcade border border-scale-blue-light/20">
                <IconDna size={28} className="mx-auto mb-2 text-rarity-uncommon" />
                <h4 className="heading-display text-bone-white text-sm mb-1">
                  Collect DNA
                </h4>
                <p className="text-beige/60 text-xs font-body">
                  Play snake to harvest genetic material
                </p>
              </div>
              <div className="text-center p-4 bg-void-deep/40 rounded-arcade border border-scale-blue-light/20">
                <IconEgg size={28} className="mx-auto mb-2 text-cyber" />
                <h4 className="heading-display text-bone-white text-sm mb-1">
                  Breed Variants
                </h4>
                <p className="text-beige/60 text-xs font-body">
                  Combine snakes to unlock new species
                </p>
              </div>
              <div className="text-center p-4 bg-void-deep/40 rounded-arcade border border-scale-blue-light/20">
                <IconTrophy size={28} className="mx-auto mb-2 text-rarity-legendary" />
                <h4 className="heading-display text-bone-white text-sm mb-1">
                  Dominate Ranks
                </h4>
                <p className="text-beige/60 text-xs font-body">
                  Climb the global leaderboard
                </p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="text-center pt-4 text-beige/30 text-xs font-mono">
            <p>v1.0.0 // NEXT.JS + THREE.JS + SUPABASE</p>
          </div>
        </div>
      </div>
    </main>
  );
}
