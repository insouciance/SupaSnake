'use client';

import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useEffect, useRef, useCallback, useState, Suspense } from 'react';
import { themeManager } from '@/lib/theme/ThemeManager';
import { SnakeGameLogic, Direction, Position } from '@/lib/game/SnakeGameLogic';
import { useGameStore } from '@/lib/store/gameStore';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import type { DynastyId } from '@/shared/types/game';
import { GAME_CONFIG } from '@/shared/config/game';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AccountUpgradeModal } from '@/components/auth/UpgradePrompt';
import { AccountChip } from '@/components/ui/AccountChip';
import Link from 'next/link';
import { EnergyTimer } from '@/components/ui/EnergyTimer';
import { CollectEffect, DeathExplosion } from '@/components/game/Particles';
import { SnakeModel, SnakeSegmentFallback } from '@/components/game/SnakeModel';
import { VirtualDPad } from '@/components/game/VirtualDPad';
import { PauseMenu } from '@/components/game/PauseMenu';
import { DynamicLights } from '@/components/game/DynamicLights';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { AimingCrosshair } from '@/components/game/AimingCrosshair';
import { AimSystemSelector } from '@/components/game/AimSystemSelector';
import { CameraRig } from '@/components/game/CameraRig';
import { FoodBeacon } from '@/components/game/FoodBeacon';
import { audioManager } from '@/lib/audio/AudioManager';
import { haptics } from '@/lib/effects/Haptics';
import { screenShake } from '@/lib/effects/ScreenShake';
import { useInterpolatedMesh, useGridPosition } from '@/hooks/useInterpolatedPosition';
import { useToast } from '@/components/ui/Toast';
import { enqueueReward } from '@/lib/outbox/rewardOutbox';
import { isAimSystemId, type AimStats, type AimSystemId } from '@/lib/game/aimSystems';
import {
  IconBolt,
  IconDna,
  IconFlame,
  IconFlask,
  IconHome,
  IconReset,
  IconSnake,
  IconTrophy,
  IconUser,
} from '@/components/ui/icons';

export default function GamePage() {
  const { session, isAuthenticated, isAnonymous, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const gameRef = useRef<SnakeGameLogic | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [particlePos, setParticlePos] = useState<[number, number, number] | null>(null);
  const [particleTrigger, setParticleTrigger] = useState(0);
  const [deathPos, setDeathPos] = useState<[number, number, number] | null>(null);
  const [showDeathExplosion, setShowDeathExplosion] = useState(false);
  const [cameraShake, setCameraShake] = useState<[number, number, number]>([0, 0, 0]);
  const [viewResetToken, setViewResetToken] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Post-run save-progress prompt for guests (never shown on the way INTO
  // a game - account nudges belong after a run, not before it)
  const [showSaveProgress, setShowSaveProgress] = useState(false);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [equippedSnake, setEquippedSnake] = useState<{
    id: string;
    name: string;
    generation: number;
    dynasty: string;
  } | null>(null);
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [needsStarterSelection, setNeedsStarterSelection] = useState(false);
  const [aimStats, setAimStats] = useState<AimStats | null>(null);
  const [streakInfo, setStreakInfo] = useState<{
    current: number;
    longest: number;
    multiplier: number;
    graceConsumed: boolean;
  } | null>(null);
  const gameStartTime = useRef<number>(0);

  // Refs to hold current values for use in event handlers (avoids stale closure)
  const sessionRef = useRef(session);
  const currentSessionIdRef = useRef(currentSessionId);

  // Keep refs in sync with state
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const {
    isPlaying,
    isGameOver,
    isPaused,
    isDeathSequence,
    isReady,
    score,
    dnaCollected,
    energy,
    maxEnergy,
    energyRegenAt,
    selectedDynasty,
    snake,
    food,
    direction,
    queuedDirections,
    startGame: storeStartGame,
    endGame,
    setSnake,
    setFood,
    setDirection,
    setQueuedDirections,
    setScore,
    setDnaCollected,
    setSelectedDynasty,
    aimSystem,
    setAimSystem,
    resetGame,
    setPaused,
    setDeathSequence,
    setReady,
    syncEnergyFromServer,
  } = useGameStore();

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize audio on first interaction
  useEffect(() => {
    const initAudio = () => {
      audioManager.init();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('touchstart', initAudio);
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
  }, []);

  // Screen shake callback
  useEffect(() => {
    screenShake.setUpdateCallback((offset) => {
      setCameraShake([offset.x, offset.y, offset.z]);
    });
    return () => screenShake.clearCallback();
  }, []);

  // Fetch player data from server on mount
  useEffect(() => {
    if (!session?.access_token) return;

    fetch('/api/player', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.player) {
          syncEnergyFromServer(data.player.energy, data.player.energy_regen_at);
        }
        setNeedsStarterSelection(Boolean(data.needsStarterSelection));
        // Aim system meta-progression: server-stored selection + unlock stats
        if (isAimSystemId(data.aimSystem)) {
          setAimSystem(data.aimSystem);
        }
        if (data.aimStats) {
          setAimStats(data.aimStats);
        }
      })
      .catch(err => console.error('Failed to fetch player data:', err));
  }, [session?.access_token, syncEnergyFromServer, setAimSystem]);

  // Fetch collection to find the equipped snake (game always uses it)
  useEffect(() => {
    if (!session?.access_token) return;

    fetch('/api/collection', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(res => res.json())
      .then(data => {
        const snakes: Array<{
          id: string;
          isEquipped: boolean;
          generation: number;
          variantName?: string | null;
          variantId?: string;
          dynastyName?: string | null;
        }> = data.snakes ?? [];

        const equipped = snakes.find((s) => s.isEquipped) ?? null;
        if (equipped) {
          const dynastyName = (equipped.dynastyName ?? 'CYBER').toUpperCase();
          setEquippedSnake({
            id: equipped.id,
            name: equipped.variantName ?? equipped.variantId ?? 'Snake',
            generation: equipped.generation,
            dynasty: dynastyName,
          });
          // Theme follows the equipped snake's dynasty
          if (dynastyName === 'CYBER' || dynastyName === 'PRIMAL' || dynastyName === 'COSMIC') {
            setSelectedDynasty(dynastyName as DynastyId);
          }
        }
        setCollectionLoaded(true);
      })
      .catch(err => {
        console.error('Failed to fetch collection:', err);
        setCollectionLoaded(true);
      });
  }, [session?.access_token, setSelectedDynasty]);

  const theme = themeManager.getTheme(selectedDynasty);

  // No playable snake: new player (never picked a starter) or nothing equipped
  const noSnakeAvailable = needsStarterSelection || (collectionLoaded && !equippedSnake);

  // Calculate board center for camera
  const boardCenter = GAME_CONFIG.board.gridSize / 2;

  // Initialize game logic
  useEffect(() => {
    gameRef.current = new SnakeGameLogic({ gridSize: GAME_CONFIG.board.gridSize });

    gameRef.current.on('foodCollected', (data: any) => {
      setScore(data.score);
      setDnaCollected(data.dna);
      // Trigger particle effect at food position
      if (data.position) {
        setParticlePos([data.position.x + 0.5, 0.5, data.position.z + 0.5]);
        setParticleTrigger(t => t + 1);
      }
      // Audio and haptic feedback
      audioManager.play('collect');
      haptics.medium();
    });

    gameRef.current.on('deathSequence', (data: any) => {
      // Start death sequence effects
      setDeathSequence(true, data.position);
      if (data.position) {
        setDeathPos([data.position.x + 0.5, 0.5, data.position.z + 0.5]);
        setShowDeathExplosion(true);
      }
      // Audio, haptic, and screen shake
      audioManager.play('death');
      haptics.death();
      screenShake.heavy();
    });

    gameRef.current.on('gameOver', async (data: any) => {
      // Send results to server first (use refs to avoid stale closure)
      const currentSession = sessionRef.current;
      const sessionId = currentSessionIdRef.current;
      if (currentSession?.access_token && sessionId) {
        const gameDuration = Math.floor((Date.now() - gameStartTime.current) / 1000);
        // If the reward POST can't be delivered, queue it for replay on the
        // next app load so a tab close at death never loses the run's DNA.
        const queueForReplay = () => {
          enqueueReward({
            sessionId,
            score: data.score,
            dna_earned: data.dnaCollected,
            duration_seconds: gameDuration,
            timestamp: Date.now(),
          });
        };
        try {
          const response = await fetch('/api/game/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentSession.access_token}`,
            },
            // keepalive lets the browser finish this request even if the
            // tab is closed immediately after death
            keepalive: true,
            body: JSON.stringify({
              action: 'end',
              sessionId: sessionId,
              score: data.score,
              dna_earned: data.dnaCollected,
              duration_seconds: gameDuration,
              died: true,
              victory: false,
            }),
          });

          if (!response.ok) {
            // 409 = session already ended (duplicate) - nothing to retry
            if (response.status !== 409) {
              console.error(`Game end rejected (status ${response.status}), queueing for replay`);
              queueForReplay();
            }
          } else {
            const result = await response.json();

            // Sync DNA balance to collection store (server authority)
            if (result.player?.dna !== undefined) {
              useCollectionStore.getState().setDnaBalance(result.player.dna);
            }

            // Show daily streak info on the game-over screen
            if (result.streak) {
              setStreakInfo(result.streak);
            }

            // Show toast for each newly unlocked achievement
            if (result.newAchievements && result.newAchievements.length > 0) {
              setUnlockedAchievements(result.newAchievements);
              result.newAchievements.forEach((name: string) => {
                showToast(`Achievement Unlocked: ${name}`, 'achievement', 5000);
              });
            }
          }
        } catch (err) {
          console.error('Failed to send game results, queueing for replay:', err);
          queueForReplay();
        }
      }

      endGame(data.score, data.dnaCollected);
      setDeathSequence(false);
      setShowDeathExplosion(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    });

    gameRef.current.on('pause', () => {
      setPaused(true);
      audioManager.play('pause');
    });

    gameRef.current.on('resume', () => {
      setPaused(false);
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  // Note: session, currentSessionId, and showToast are accessed via closure
   
  }, [endGame, setDnaCollected, setScore, setDeathSequence, setPaused, showToast]);

  // Sync game state to store
  const syncState = useCallback(() => {
    if (gameRef.current) {
      const state = gameRef.current.getState();
      setSnake(state.snake);
      setFood(state.food);
      setDirection(state.direction);
      setQueuedDirections(gameRef.current.getQueuedDirections());
    }
  }, [setSnake, setFood, setDirection, setQueuedDirections]);

  // Sync only heading + input buffer - called on every direction input so
  // the aim telegraph reacts on the keypress, not on the next tick
  const syncAim = useCallback(() => {
    if (gameRef.current) {
      setDirection(gameRef.current.getState().direction);
      setQueuedDirections(gameRef.current.getQueuedDirections());
    }
  }, [setDirection, setQueuedDirections]);

  // Game loop function (reusable)
  const startGameLoop = useCallback(() => {
    if (intervalRef.current) return;

    const tick = () => {
      if (gameRef.current && !gameRef.current.getState().isGameOver) {
        gameRef.current.tick();
        syncState();

        // Adjust speed dynamically
        const newSpeed = gameRef.current.getSpeed();
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = setInterval(tick, newSpeed);
        }
      }
    };

    intervalRef.current = setInterval(tick, gameRef.current?.getSpeed() || 200);
  }, [syncState]);

  // Start game - call server API first, then enter ready state
  const handleStart = useCallback(async () => {
    if (!session?.access_token) {
      setStartError('Please sign in to play');
      return;
    }
    if (!equippedSnake) {
      setStartError('No snake equipped. Choose one in the Lab.');
      return;
    }
    if (energy < GAME_CONFIG.economy.energy.costPerGame) return;
    if (isStarting) return;

    setIsStarting(true);
    setStartError(null);

    try {
      const response = await fetch('/api/game/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'start',
          snake_id: equippedSnake.id, // Server validates ownership + equipped
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setStartError(`Rate limited. Wait ${Math.ceil((data.retryAfterMs || 5000) / 1000)}s`);
        } else {
          setStartError(data.error || 'Failed to start game');
        }
        return;
      }

      // Sync server state to local
      syncEnergyFromServer(data.energy, data.energyRegenAt);
      setCurrentSessionId(data.sessionId);
      gameStartTime.current = Date.now();

      // Now start the game locally
      storeStartGame();
      setReady(true);
      gameRef.current?.start();
      syncState();
    } catch (err) {
      console.error('Failed to start game:', err);
      setStartError('Network error. Please try again.');
    } finally {
      setIsStarting(false);
    }
  }, [session?.access_token, energy, isStarting, equippedSnake, syncEnergyFromServer, storeStartGame, setReady, syncState]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle ready state - first input starts movement
      if (isReady && !intervalRef.current) {
        const validStartKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                                'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', ' '];
        if (validStartKeys.includes(e.key)) {
          e.preventDefault();
          setReady(false);
          startGameLoop();

          // If direction key, also set direction
          const keyMap: Record<string, Direction> = {
            ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
            w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
            W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT',
          };
          const dir = keyMap[e.key];
          if (dir && gameRef.current) {
            gameRef.current.setDirection(dir);
            syncAim();
          }
          return;
        }
      }

      // Handle pause toggle
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && isPlaying && !isGameOver && !isDeathSequence && !isReady) {
        e.preventDefault();
        gameRef.current?.togglePause();
        return;
      }

      // Existing direction logic (only when game is running)
      if (!isPlaying || isGameOver || isPaused || isReady) return;

      const keyMap: Record<string, Direction> = {
        ArrowUp: 'UP',
        ArrowDown: 'DOWN',
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
        w: 'UP',
        s: 'DOWN',
        a: 'LEFT',
        d: 'RIGHT',
        W: 'UP',
        S: 'DOWN',
        A: 'LEFT',
        D: 'RIGHT',
      };

      const dir = keyMap[e.key];
      if (dir && gameRef.current) {
        e.preventDefault();
        gameRef.current.setDirection(dir);
        syncAim();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isGameOver, isPaused, isDeathSequence, isReady, startGameLoop, setReady, syncAim]);

  // Handle direction from D-Pad
  const handleDPadDirection = useCallback((dir: Direction) => {
    if (!isPlaying || isGameOver || isPaused || !gameRef.current) return;
    gameRef.current.setDirection(dir);
    syncAim();
  }, [isPlaying, isGameOver, isPaused, syncAim]);

  // Select an aim system - optimistic with rollback; the server re-checks
  // the unlock predicate (403 on a locked pick)
  const handleSelectAimSystem = useCallback(async (id: AimSystemId) => {
    const previous = useGameStore.getState().aimSystem;
    if (id === previous) return;
    setAimSystem(id); // optimistic
    try {
      const response = await fetch('/api/player', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionRef.current?.access_token}`,
        },
        body: JSON.stringify({ aim_system: id }),
      });
      if (!response.ok) {
        throw new Error(`Aim system PATCH rejected (${response.status})`);
      }
    } catch (err) {
      console.error('Failed to save aim system, rolling back:', err);
      setAimSystem(previous);
      showToast('Could not save aim system', 'error');
    }
  }, [setAimSystem, showToast]);

  // Handle pause/resume
  const handlePause = useCallback(() => {
    gameRef.current?.pause();
  }, []);

  const handleResume = useCallback(() => {
    gameRef.current?.resume();
  }, []);

  const handleQuit = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    resetGame();
  }, [resetGame]);

  // Restart
  const handleRestart = useCallback(() => {
    resetGame();
    setCurrentSessionId(null);
    setUnlockedAchievements([]);
    setStreakInfo(null);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [resetGame]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="w-screen h-dvh app-bg flex items-center justify-center">
        <div className="text-center space-y-4 animate-fade-up">
          <div className="animate-spin w-12 h-12 border-4 border-t-transparent border-venom-orange rounded-full mx-auto" />
          <p className="text-beige font-body">Loading...</p>
        </div>
      </div>
    );
  }

  // Prompt sign-in if not authenticated (anonymous auth should auto-sign in)
  if (!isAuthenticated) {
    return (
      <div className="w-screen h-dvh app-bg flex items-center justify-center p-4">
        <div className="panel-elevated p-8 text-center space-y-6 w-full max-w-sm animate-pop-in">
          <h1 className="heading-display text-3xl text-venom-orange text-glow-orange">SupaSnake</h1>
          <p className="text-beige font-body">Sign in to play and save your progress</p>
          <Link
            href="/login"
            className="btn-go inline-block px-8 py-3 text-lg min-h-[44px]"
          >
            Sign In
          </Link>
          <p className="text-beige/60 text-sm font-body">
            <Link href="/" className="hover:text-bone-white transition-colors">Back to Home</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-dvh relative overflow-hidden app-bg">
      {/* Dynasty ambient tint - lets the void backdrop participate in the
          equipped dynasty's identity without leaving the app palette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 50% 45%, ${theme.ambient} 0%, transparent 70%)`,
          opacity: 0.55,
        }}
      />
      {/* Faint star-field hint for depth while playing - opacity kept very
          low so the arena reads as part of the void, not a photo backdrop */}
      {isPlaying && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'url(/textures/minimalistic_background_texture_of_space_1.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.12,
          }}
        />
      )}
      {/* HUD - small void chips, safe-area aware */}
      <div
        className="absolute left-4 z-10 text-bone-white space-y-2"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <h1 className="heading-display text-2xl text-venom-orange text-glow-orange">SupaSnake</h1>

        {/* Stats */}
        <div className="flex flex-wrap gap-2 items-start font-body">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/70 backdrop-blur-sm">
            <span className="text-beige text-sm">Score:</span>
            <span className="font-bold text-bone-white">{score}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/70 backdrop-blur-sm">
            <IconDna size={15} className="text-venom-orange" />
            <span className="text-beige text-sm">DNA:</span>
            <span className="font-bold text-venom-orange">{dnaCollected}</span>
          </div>
          <div className="flex items-center px-3 py-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/70 backdrop-blur-sm">
            <EnergyTimer
              energy={energy}
              maxEnergy={maxEnergy}
              energyRegenAt={energyRegenAt}
            />
          </div>
        </div>

        {/* Equipped Snake (the game always uses the equipped snake) */}
        {equippedSnake && !isPlaying && (
          <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/70 backdrop-blur-sm font-body text-sm">
            <IconSnake size={15} className="text-beige" />
            <span className="text-beige">Snake:</span>
            <span className="font-bold text-bone-white">{equippedSnake.name}</span>
            <span className="text-beige/70">Gen {equippedSnake.generation}</span>
          </div>
        )}
      </div>

      {/* Navigation (when not playing) - z-30 so it stays clickable above
          the start/game-over overlay (z-20): no dead end on those screens */}
      {!isPlaying && (
        <div
          className="absolute right-4 z-30 flex items-center gap-2"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <Link
            href="/"
            className="flex items-center justify-center w-11 h-11 rounded-arcade border border-scale-blue-light/60 bg-void/70 backdrop-blur-sm hover:border-venom-orange/70 transition-all text-beige hover:text-bone-white"
            title="Home"
            aria-label="Home"
          >
            <IconHome size={20} />
          </Link>
          <Link
            href="/leaderboard"
            className="flex items-center justify-center w-11 h-11 rounded-arcade border border-scale-blue-light/60 bg-void/70 backdrop-blur-sm hover:border-venom-orange/70 transition-all text-beige hover:text-bone-white"
            title="Leaderboard"
            aria-label="Leaderboard"
          >
            <IconTrophy size={20} />
          </Link>
          <Link
            href="/settings"
            className="flex items-center justify-center w-11 h-11 rounded-arcade border border-scale-blue-light/60 bg-void/70 backdrop-blur-sm hover:border-venom-orange/70 transition-all text-beige hover:text-bone-white"
            title="Profile"
            aria-label="Profile"
          >
            <IconUser size={20} />
          </Link>
          <AccountChip />
        </div>
      )}

      {/* Pause Button (in-game) */}
      {isPlaying && !isGameOver && !isPaused && (
        <button
          onClick={handlePause}
          className="absolute right-4 z-10 flex items-center justify-center w-11 h-11 rounded-arcade border border-scale-blue-light/60 bg-void/70 backdrop-blur-sm hover:border-venom-orange/70 transition-all text-bone-white"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          aria-label="Pause game"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        </button>
      )}

      {/* Controls Info (desktop) */}
      {!isMobile && (
        <div className="absolute bottom-4 left-4 z-10 text-beige/60 text-sm font-body space-y-0.5">
          <p>Controls: Arrow Keys or WASD</p>
          <p>Pause: ESC or P</p>
          <p>Orbit: Mouse drag (snaps to sides) | Zoom: Scroll</p>
        </div>
      )}

      {/* Reset view - restores the default side-aligned camera */}
      <button
        onClick={() => setViewResetToken((t) => t + 1)}
        className="absolute right-4 z-10 flex items-center justify-center w-11 h-11 rounded-arcade border border-scale-blue-light/60 bg-void/70 backdrop-blur-sm hover:border-venom-orange/70 transition-all text-beige hover:text-bone-white"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        title="Reset view"
        aria-label="Reset view"
      >
        <IconReset size={20} />
      </button>

      {/* Virtual D-Pad (mobile). bottom offset includes the safe-area inset
          so the DOWN button clears home indicators / browser chrome. */}
      {isMobile && isPlaying && !isGameOver && !isPaused && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <VirtualDPad
            onDirectionChange={handleDPadDirection}
            disabled={!isPlaying || isGameOver || isPaused}
            isReady={isReady}
            setReady={setReady}
            onStartGame={startGameLoop}
          />
        </div>
      )}

      {/* Pause Menu */}
      {isPaused && isPlaying && !isGameOver && (
        <PauseMenu
          dynasty={selectedDynasty}
          score={score}
          dnaCollected={dnaCollected}
          onResume={handleResume}
          onQuit={handleQuit}
        />
      )}

      {/* Game Over / Start Screen */}
      {!isPlaying && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-void-deep/85 backdrop-blur-sm p-4">
          <div
            className={`panel-elevated p-8 text-center space-y-6 min-w-[320px] max-w-full animate-pop-in ${
              isGameOver ? '[--glow:#f43f5e]' : '[--glow:#22d3ee]'
            }`}
          >
            {isGameOver ? (
              <>
                <h2 className="heading-display text-4xl text-strike-red text-glow">Game Over</h2>
                <div className="space-y-2 font-body">
                  <p className="text-2xl text-bone-white">
                    Score: <span className="font-bold text-venom-orange">{score}</span>
                  </p>
                  <p className="text-2xl text-bone-white flex items-center justify-center gap-2">
                    <IconDna size={22} className="text-venom-orange" />
                    DNA: <span className="font-bold text-venom-orange text-glow-orange">+{dnaCollected}</span>
                  </p>
                  {streakInfo && (
                    <p className="text-lg text-beige flex items-center justify-center gap-1.5">
                      <IconFlame size={18} className="text-venom-orange" />
                      Day <span className="font-bold text-venom-orange">{streakInfo.current}</span> streak
                      {streakInfo.multiplier > 1 && (
                        <span className="text-beige/70"> ({streakInfo.multiplier}x DNA)</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Unlocked Achievements */}
                {unlockedAchievements.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-scale-blue-light/60">
                    <p className="label-arcade">Achievements Unlocked!</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {unlockedAchievements.map((name, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-rarity-legendary/15 border border-rarity-legendary/60 rounded-arcade text-rarity-legendary text-sm font-body shadow-glow-sm shadow-rarity-legendary/30"
                        >
                          <IconTrophy size={14} />
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="heading-display text-4xl text-venom-orange text-glow-orange animate-breathe">
                  Ready to Play
                </h2>
                {equippedSnake ? (
                  <div className="panel inline-flex items-center gap-3 px-4 py-3 font-body">
                    <IconSnake size={20} className="text-venom-orange" />
                    <p>
                      <span className="heading-display text-lg text-bone-white">{equippedSnake.name}</span>
                      <span className="text-beige/70"> · Gen {equippedSnake.generation}</span>
                      <Link
                        href="/lab"
                        className="ml-3 text-venom-orange underline hover:text-venom-orange-light transition-colors"
                      >
                        Change in Lab
                      </Link>
                    </p>
                  </div>
                ) : noSnakeAvailable ? (
                  <p className="text-beige font-body">
                    You need a snake before you can play.
                  </p>
                ) : (
                  <p className="text-beige/70 font-body">Loading your snake...</p>
                )}
              </>
            )}

            {/* Aim system picker - locked chips show their unlock path */}
            {!noSnakeAvailable && (
              <div className="space-y-2">
                <p className="label-arcade">Aim System</p>
                <AimSystemSelector
                  selected={aimSystem}
                  stats={aimStats}
                  onSelect={handleSelectAimSystem}
                />
              </div>
            )}

            {/* Error Message */}
            {startError && (
              <div className="bg-strike-red/15 border border-strike-red/70 rounded-arcade px-4 py-2 animate-fade-up">
                <p className="text-strike-red font-body">{startError}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-4 justify-center items-center">
              {noSnakeAvailable ? (
                <Link
                  href="/lab"
                  className="btn-go inline-flex items-center gap-2 px-8 py-3 text-lg min-h-[44px]"
                >
                  <IconFlask size={20} />
                  Choose Your Snake in the Lab
                </Link>
              ) : energy > 0 ? (
                <button
                  onClick={handleStart}
                  disabled={isStarting || !equippedSnake}
                  className={`btn-go inline-flex items-center gap-2 px-8 py-4 text-xl min-h-[44px] ${
                    isStarting || !equippedSnake
                      ? 'cursor-wait'
                      : 'animate-glow-pulse shadow-venom-orange/50'
                  }`}
                >
                  {isStarting ? 'Starting...' : (
                    <>
                      {isGameOver ? 'Play Again' : 'Play'}
                      <span className="inline-flex items-center gap-0.5 text-base">
                        ({GAME_CONFIG.economy.energy.costPerGame}
                        <IconBolt size={16} />)
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <div className="text-venom-orange font-body">
                  <p className="heading-display text-xl flex items-center justify-center gap-1.5">
                    <IconBolt size={20} />
                    No Energy!
                  </p>
                  <p className="text-sm text-beige">Regenerates in {GAME_CONFIG.economy.energy.regenRateMinutes} minutes</p>
                </div>
              )}

              {isGameOver && (
                <>
                  <Link
                    href="/lab"
                    className="btn-neutral inline-flex items-center gap-2 px-6 py-3 min-h-[44px]"
                  >
                    <IconFlask size={18} />
                    Lab
                  </Link>
                  <Link
                    href="/"
                    className="btn-neutral inline-flex items-center gap-2 px-6 py-3 min-h-[44px]"
                  >
                    <IconHome size={18} />
                    Home
                  </Link>
                  <button
                    onClick={handleRestart}
                    className="btn-neutral px-6 py-3 min-h-[44px]"
                  >
                    Menu
                  </button>
                </>
              )}
            </div>

            {/* Guests: secondary post-run CTA to secure the DNA they just
                earned - never shown before or during a run */}
            {isGameOver && isAnonymous && (
              <button
                onClick={() => setShowSaveProgress(true)}
                data-testid="gameover-save-progress"
                className="block mx-auto text-sm font-body text-venom-orange underline hover:text-venom-orange-light transition-colors min-h-[44px]"
              >
                Playing as guest - save this progress with a free account
              </button>
            )}
          </div>
        </div>
      )}

      {/* Save-progress modal (opened from the game-over screen) */}
      <AccountUpgradeModal
        isOpen={showSaveProgress}
        onClose={() => setShowSaveProgress(false)}
      />

      {/* Ready State Overlay */}
      {isReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-4 animate-fade-up">
            <h2 className="heading-display text-5xl text-venom-orange text-glow-orange animate-breathe">Ready!</h2>
            <p className="text-bone-white text-lg font-body">Press SPACE or Arrow Key to Start</p>
            <p className="text-beige/60 text-sm font-body">Use Arrow Keys or WASD to move</p>
          </div>
        </div>
      )}

      {/* 3D Canvas - initial position approximates CameraRig's default
          south-side 70-degree view to avoid a first-frame jump */}
      <Canvas
        camera={{
          position: [boardCenter, boardCenter * 2.4, boardCenter * 1.9],
          fov: 50
        }}
        shadows
      >
        {/* Fog in the void family so the arena's far edge melts into the
            page backdrop instead of cutting out against it */}
        <fog attach="fog" args={['#06090d', 34, 65]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={0.9}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={1}
          shadow-camera-far={50}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={15}
          shadow-camera-bottom={-15}
          shadow-bias={-0.0001}
        />
        <DynamicLights
          dynasty={selectedDynasty}
          score={score}
          isDeathSequence={isDeathSequence}
          foodPosition={food}
          gridSize={GAME_CONFIG.board.gridSize}
        />

        <Suspense fallback={null}>
          <GameBoard
            dynasty={selectedDynasty}
            snake={snake}
            food={food}
            direction={direction}
            queuedDirections={queuedDirections}
            aimSystem={aimSystem}
            particlePos={particlePos}
            particleTrigger={particleTrigger}
            deathPos={deathPos}
            showDeathExplosion={showDeathExplosion}
            cameraShake={cameraShake}
          />
        </Suspense>

        <CameraRig gridSize={GAME_CONFIG.board.gridSize} resetToken={viewResetToken} />

        {/* Bloom postprocessing - desktop only, to protect mobile framerate */}
        {!isMobile && (
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.3}
              luminanceSmoothing={0.9}
              intensity={0.6}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}

interface GameBoardProps {
  dynasty: DynastyId;
  snake: Position[];
  food: Position | null;
  direction: Direction;
  queuedDirections: Direction[];
  aimSystem: AimSystemId;
  particlePos: [number, number, number] | null;
  particleTrigger: number;
  deathPos: [number, number, number] | null;
  showDeathExplosion: boolean;
  cameraShake: [number, number, number];
}

function GameBoard({
  dynasty,
  snake,
  food,
  direction,
  queuedDirections,
  aimSystem,
  particlePos,
  particleTrigger,
  deathPos,
  showDeathExplosion,
  cameraShake,
}: GameBoardProps) {
  const foodMaterial = themeManager.createFoodMaterial(dynasty);

  const theme = themeManager.getTheme(dynasty);

  return (
    <group position={cameraShake}>
      {/* Arena - void-family floor with dynasty edge wash, secondary rails */}
      <ArenaFloor
        gridSize={GAME_CONFIG.board.gridSize}
        floorColor="#0b1016"
        gridColor="#2b3b4d"
        majorGridColor="#6b7d8a"
        accentColor={theme.primary}
      />
      <ArenaBorder
        gridSize={GAME_CONFIG.board.gridSize}
        color={theme.secondary}
        accentColor="#22d3ee"
        emissiveIntensity={0.5}
      />

      {/* Aim telegraph - layers rendered per the selected aim system
          (pulse/vector/sequence/radar/apex meta-progression) */}
      <AimingCrosshair
        headPosition={snake[0] ?? null}
        direction={direction}
        queuedDirections={queuedDirections}
        snake={snake}
        gridSize={GAME_CONFIG.board.gridSize}
        aimSystem={aimSystem}
        color={theme.accent}
        laneColor={theme.primary}
      />

      {/* Snake Segments with Interpolation + GLB Voxel Models */}
      {snake.map((seg, i) => (
        <InterpolatedSegment
          key={i}
          segment={seg}
          isHead={i === 0}
          dynasty={dynasty}
        />
      ))}

      {/* Food Beacon - Enhanced food with ring + beam */}
      {food && (
        <FoodBeacon
          position={[food.x + 0.5, 0, food.z + 0.5]}
          color={theme.accent}
        />
      )}

      {/* Particle Effects */}
      <CollectEffect
        position={particlePos}
        dynasty={dynasty}
        trigger={particleTrigger}
      />

      {/* Death Explosion */}
      <DeathExplosion
        position={deathPos}
        dynasty={dynasty}
        active={showDeathExplosion}
      />
    </group>
  );
}

/**
 * Interpolated Snake Segment Component - Smooth movement between grid positions
 *
 * Renders the voxel GLB mesh (SnakeModel); while the GLB streams in, a box
 * with the same shared per-dynasty material renders so the game never blocks
 * on asset load. Both share the meshRef, so interpolation stays smooth across
 * the swap.
 */
interface InterpolatedSegmentProps {
  segment: Position;
  isHead: boolean;
  dynasty: DynastyId;
}

function InterpolatedSegment({
  segment,
  isHead,
  dynasty,
}: InterpolatedSegmentProps) {
  const meshRef = useInterpolatedMesh(segment);
  const initialPos = useGridPosition(segment);

  return (
    <Suspense
      fallback={
        <SnakeSegmentFallback
          meshRef={meshRef}
          position={initialPos}
          isHead={isHead}
          dynasty={dynasty}
        />
      }
    >
      <SnakeModel
        meshRef={meshRef}
        position={initialPos}
        isHead={isHead}
        dynasty={dynasty}
      />
    </Suspense>
  );
}
