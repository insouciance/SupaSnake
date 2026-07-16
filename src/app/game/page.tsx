'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useEffect, useRef, useCallback, useState, useMemo, Suspense } from 'react';
import * as THREE from 'three';
import { themeManager } from '@/lib/theme/ThemeManager';
import { SnakeGameLogic, Direction, Position } from '@/lib/game/SnakeGameLogic';
import { useGameStore } from '@/lib/store/gameStore';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import type { DynastyId } from '@/shared/types/game';
import { GAME_CONFIG } from '@/shared/config/game';
import { useAuth } from '@/lib/auth/AuthProvider';
import Link from 'next/link';
import { EnergyTimer } from '@/components/ui/EnergyTimer';
import { CollectEffect, DeathExplosion } from '@/components/game/Particles';
import { VirtualDPad } from '@/components/game/VirtualDPad';
import { PauseMenu } from '@/components/game/PauseMenu';
import { DynamicLights } from '@/components/game/DynamicLights';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { AimingCrosshair } from '@/components/game/AimingCrosshair';
import { FoodBeacon } from '@/components/game/FoodBeacon';
import { audioManager } from '@/lib/audio/AudioManager';
import { haptics } from '@/lib/effects/Haptics';
import { screenShake } from '@/lib/effects/ScreenShake';
import { useInterpolatedMesh, useGridPosition } from '@/hooks/useInterpolatedPosition';
import { useToast } from '@/components/ui/Toast';

export default function GamePage() {
  const { session, isAuthenticated, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const gameRef = useRef<SnakeGameLogic | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [particlePos, setParticlePos] = useState<[number, number, number] | null>(null);
  const [particleTrigger, setParticleTrigger] = useState(0);
  const [deathPos, setDeathPos] = useState<[number, number, number] | null>(null);
  const [showDeathExplosion, setShowDeathExplosion] = useState(false);
  const [cameraShake, setCameraShake] = useState<[number, number, number]>([0, 0, 0]);
  const [isMobile, setIsMobile] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [equippedSnake, setEquippedSnake] = useState<{
    id: string;
    name: string;
    generation: number;
    dynasty: string;
  } | null>(null);
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [needsStarterSelection, setNeedsStarterSelection] = useState(false);
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
    startGame: storeStartGame,
    endGame,
    setSnake,
    setFood,
    setScore,
    setDnaCollected,
    setSelectedDynasty,
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
      })
      .catch(err => console.error('Failed to fetch player data:', err));
  }, [session?.access_token, syncEnergyFromServer]);

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
        try {
          const response = await fetch('/api/game/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentSession.access_token}`,
            },
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
        } catch (err) {
          console.error('Failed to send game results:', err);
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
    }
  }, [setSnake, setFood]);

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isGameOver, isPaused, isDeathSequence, isReady, startGameLoop, setReady]);

  // Handle direction from D-Pad
  const handleDPadDirection = useCallback((dir: Direction) => {
    if (!isPlaying || isGameOver || isPaused || !gameRef.current) return;
    gameRef.current.setDirection(dir);
  }, [isPlaying, isGameOver, isPaused]);

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
      <div className="w-screen h-screen flex items-center justify-center bg-scale-blue-dark">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-t-transparent border-venom-orange rounded-full mx-auto" />
          <p className="text-beige font-body">Loading...</p>
        </div>
      </div>
    );
  }

  // Prompt sign-in if not authenticated (anonymous auth should auto-sign in)
  if (!isAuthenticated) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-scale-blue-dark">
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-8 text-center space-y-6">
          <h1 className="text-3xl font-display uppercase tracking-arcade text-venom-orange">OG Snake</h1>
          <p className="text-beige font-body">Sign in to play and save your progress</p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-lg text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
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
    <div
      className="w-screen h-screen relative"
      style={{ backgroundColor: theme.ambient }}
    >
      {/* Space background overlay */}
      {isPlaying && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'url(/textures/minimalistic_background_texture_of_space_1.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {/* HUD */}
      <div className="absolute top-4 left-4 z-10 text-bone-white space-y-2">
        <h1 className="text-2xl font-display uppercase tracking-arcade text-venom-orange">OG Snake</h1>

        {/* Stats */}
        <div className="flex gap-6 text-lg items-start font-body">
          <div>
            <span className="text-beige">Score:</span>{' '}
            <span className="font-bold text-bone-white">{score}</span>
          </div>
          <div>
            <span className="text-beige">DNA:</span>{' '}
            <span className="font-bold text-venom-orange">{dnaCollected}</span>
          </div>
          <EnergyTimer
            energy={energy}
            maxEnergy={maxEnergy}
            energyRegenAt={energyRegenAt}
          />
        </div>

        {/* Equipped Snake (the game always uses the equipped snake) */}
        {equippedSnake && !isPlaying && (
          <div className="flex items-center gap-2 mt-4 font-body text-sm">
            <span className="text-beige">Snake:</span>
            <span className="font-bold text-bone-white">{equippedSnake.name}</span>
            <span className="text-beige/70">Gen {equippedSnake.generation}</span>
          </div>
        )}
      </div>

      {/* Navigation (when not playing) */}
      {!isPlaying && (
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Link
            href="/"
            className="p-2 bg-scale-blue border-[2px] border-scale-blue-light rounded-arcade hover:bg-scale-blue-light transition-all text-beige hover:text-bone-white"
            title="Home"
          >
            🏠
          </Link>
          <Link
            href="/leaderboard"
            className="p-2 bg-scale-blue border-[2px] border-scale-blue-light rounded-arcade hover:bg-scale-blue-light transition-all text-beige hover:text-bone-white"
            title="Leaderboard"
          >
            🏆
          </Link>
          <Link
            href="/settings"
            className="p-2 bg-scale-blue border-[2px] border-scale-blue-light rounded-arcade hover:bg-scale-blue-light transition-all text-beige hover:text-bone-white"
            title="Profile"
          >
            👤
          </Link>
        </div>
      )}

      {/* Pause Button (in-game) */}
      {isPlaying && !isGameOver && !isPaused && (
        <button
          onClick={handlePause}
          className="absolute top-4 right-4 z-10 p-3 bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade hover:bg-scale-blue-light transition-all"
          aria-label="Pause game"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#F4F4F4">
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
          <p>Orbit: Mouse drag | Zoom: Scroll</p>
        </div>
      )}

      {/* Virtual D-Pad (mobile) */}
      {isMobile && isPlaying && !isGameOver && !isPaused && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
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
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-scale-blue-dark/90">
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-8 text-center space-y-6 min-w-[320px]">
            {isGameOver ? (
              <>
                <h2 className="text-4xl font-display uppercase tracking-arcade text-strike-red">Game Over</h2>
                <div className="space-y-2 font-body">
                  <p className="text-2xl text-bone-white">
                    Score: <span className="font-bold text-venom-orange">{score}</span>
                  </p>
                  <p className="text-2xl text-bone-white">
                    DNA: <span className="font-bold text-venom-orange">+{dnaCollected}</span>
                  </p>
                  {streakInfo && (
                    <p className="text-lg text-beige">
                      Day <span className="font-bold text-venom-orange">{streakInfo.current}</span> streak
                      {streakInfo.multiplier > 1 && (
                        <span className="text-beige/70"> ({streakInfo.multiplier}x DNA)</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Unlocked Achievements */}
                {unlockedAchievements.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-scale-blue-light">
                    <p className="text-sm text-beige font-body">Achievements Unlocked!</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {unlockedAchievements.map((name, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-yellow-600/30 border border-yellow-500 rounded-arcade text-yellow-400 text-sm font-body"
                        >
                          🏆 {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">
                  Ready to Play
                </h2>
                {equippedSnake ? (
                  <p className="text-beige font-body">
                    <span className="font-bold text-bone-white">{equippedSnake.name}</span>
                    <span className="text-beige/70"> · Gen {equippedSnake.generation}</span>
                    <Link
                      href="/lab"
                      className="ml-3 text-venom-orange underline hover:text-venom-orange-light transition-colors"
                    >
                      Change in Lab
                    </Link>
                  </p>
                ) : noSnakeAvailable ? (
                  <p className="text-beige font-body">
                    You need a snake before you can play.
                  </p>
                ) : (
                  <p className="text-beige/70 font-body">Loading your snake...</p>
                )}
              </>
            )}

            {/* Error Message */}
            {startError && (
              <div className="bg-strike-red/20 border-[2px] border-strike-red rounded-arcade px-4 py-2">
                <p className="text-strike-red font-body">{startError}</p>
              </div>
            )}

            <div className="flex gap-4 justify-center">
              {noSnakeAvailable ? (
                <Link
                  href="/lab"
                  className="px-8 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-lg text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Choose Your Snake in the Lab
                </Link>
              ) : energy > 0 ? (
                <button
                  onClick={handleStart}
                  disabled={isStarting || !equippedSnake}
                  className={`px-8 py-3 rounded-arcade border-[3px] font-display uppercase tracking-arcade text-lg transition-all ${
                    isStarting || !equippedSnake
                      ? 'bg-scale-blue-light border-scale-blue cursor-wait text-beige'
                      : 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {isStarting ? 'Starting...' : (
                    <>{isGameOver ? 'Play Again' : 'Play'} ({GAME_CONFIG.economy.energy.costPerGame}⚡)</>
                  )}
                </button>
              ) : (
                <div className="text-venom-orange font-body">
                  <p className="text-xl font-display uppercase">No Energy!</p>
                  <p className="text-sm text-beige">Regenerates in {GAME_CONFIG.economy.energy.regenRateMinutes} minutes</p>
                </div>
              )}

              {isGameOver && (
                <button
                  onClick={handleRestart}
                  className="px-6 py-3 bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-bone-white hover:bg-scale-blue-light hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Menu
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ready State Overlay */}
      {isReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-4">
            <h2 className="text-5xl font-display uppercase tracking-arcade text-venom-orange animate-pulse-slow">Ready!</h2>
            <p className="text-bone-white text-lg font-body">Press SPACE or Arrow Key to Start</p>
            <p className="text-beige/60 text-sm font-body">Use Arrow Keys or WASD to move</p>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        camera={{
          position: [boardCenter + 12, 16, boardCenter + 12],
          fov: 50
        }}
        shadows
      >
        <fog attach="fog" args={['#050505', 35, 70]} />
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
            particlePos={particlePos}
            particleTrigger={particleTrigger}
            deathPos={deathPos}
            showDeathExplosion={showDeathExplosion}
            cameraShake={cameraShake}
          />
        </Suspense>

        <OrbitControls
          target={[boardCenter, 0, boardCenter]}
          enablePan={false}
          minDistance={12}
          maxDistance={35}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.5}
          enableDamping={true}
          dampingFactor={0.05}
          rotateSpeed={0.5}
        />

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
      {/* AAA Arena Components */}
      <ArenaFloor
        gridSize={GAME_CONFIG.board.gridSize}
        floorColor="#1a2128"
        gridColor="#3a4750"
        accentColor={theme.primary}
      />
      <ArenaBorder
        gridSize={GAME_CONFIG.board.gridSize}
        color={theme.primary}
        emissiveIntensity={0.5}
      />

      {/* Aiming Crosshair - targeting lines */}
      {food && (
        <AimingCrosshair
          foodPosition={food}
          gridSize={GAME_CONFIG.board.gridSize}
          color={theme.accent}
          opacity={0.3}
        />
      )}

      {/* Snake Segments with Interpolation + GLB Models */}
      {snake.map((seg, i) => (
        <InterpolatedSegment
          key={i}
          segment={seg}
          index={i}
          isHead={i === 0}
          dynasty={dynasty}
          totalSegments={snake.length}
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
 */
interface InterpolatedSegmentProps {
  segment: Position;
  index: number;
  isHead: boolean;
  dynasty: DynastyId;
  totalSegments: number;
}

function InterpolatedSegment({
  segment,
  index,
  isHead,
  dynasty,
  totalSegments,
}: InterpolatedSegmentProps) {
  const meshRef = useInterpolatedMesh(segment);
  const theme = themeManager.getTheme(dynasty);
  const initialPos = useGridPosition(segment);

  // Use simple box geometry for now - GLB can be added later
  const emissiveIntensity = isHead ? 0.6 : 0.4;
  const size = isHead ? 0.9 : 0.85;

  return (
    <mesh ref={meshRef} position={initialPos} castShadow>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial
        color={theme.primary}
        emissive={theme.secondary}
        emissiveIntensity={emissiveIntensity}
        metalness={0.5}
        roughness={0.3}
      />
    </mesh>
  );
}
