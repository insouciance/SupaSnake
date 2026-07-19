'use client';

import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useEffect, useRef, useCallback, useMemo, useState, Suspense } from 'react';
import { themeManager } from '@/lib/theme/ThemeManager';
import { SnakeGameLogic, Direction, Position, GameOverData } from '@/lib/game/SnakeGameLogic';
import type { FluxPhase } from '@/lib/game/SnakeGameLogic';
import {
  applyOutcomeWithMutations,
  getRuleset,
  normalizeDynastyName,
  outcomeMultipliers,
  rulesetExplainer,
} from '@/shared/game/rulesets';
import { MUTATIONS, isMutationId, type MutationId, type MutationPick } from '@/shared/game/mutations';
import { sanitizeTraits } from '@/shared/game/traits';
import { isAnomalyId, type AnomalyId } from '@/shared/game/anomalies';
import { useGameStore, type GameMode } from '@/lib/store/gameStore';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import type { DynastyId } from '@/shared/types/game';
import { GAME_CONFIG } from '@/shared/config/game';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AccountUpgradeModal } from '@/components/auth/UpgradePrompt';
import { AccountChip } from '@/components/ui/AccountChip';
import { PlayerCard } from '@/components/identity/PlayerCard';
import { HandleClaimModal } from '@/components/identity/HandleClaimModal';
import type { PlayerIdentity } from '@/lib/identity/types';
import Link from 'next/link';
import { EnergyTimer } from '@/components/ui/EnergyTimer';
import { CollectEffect, DeathExplosion } from '@/components/game/Particles';
import { InstancedSnake, InstancedSnakeFallback } from '@/components/game/InstancedSnake';
import { PerfHUD } from '@/components/game/PerfHUD';
import { VirtualDPad } from '@/components/game/VirtualDPad';
import { PauseMenu } from '@/components/game/PauseMenu';
import { DynamicLights } from '@/components/game/DynamicLights';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { AimRenderer } from '@/components/game/AimRenderer';
import type { AimTarget } from '@/components/game/aimUtils';
import { AimSystemSelector } from '@/components/game/AimSystemSelector';
import { RunInsightCard } from '@/components/game/RunInsightCard';
import { CameraRig, DEFAULT_AZIMUTH } from '@/components/game/CameraRig';
import { FlickSurface } from '@/components/game/FlickSurface';
import { InputDebugOverlay } from '@/components/game/InputDebugOverlay';
import { FoodBeacon } from '@/components/game/FoodBeacon';
import { ExitPortal } from '@/components/game/ExitPortal';
import { MutationBeacon } from '@/components/game/MutationBeacon';
import { MutationChoiceOverlay } from '@/components/game/MutationChoiceOverlay';
import { MutationHUD } from '@/components/game/MutationHUD';
import { ModeToggle } from '@/components/game/ModeToggle';
import { AnomalyPanel, type AnomalyBoardView } from '@/components/game/AnomalyPanel';
import { BlackoutMask } from '@/components/game/BlackoutMask';
import {
  createInputDebugState,
  recordDebugEvent,
  type InputDebugState,
} from '@/lib/input/flickControl';
import { audioManager } from '@/lib/audio/AudioManager';
import { haptics } from '@/lib/effects/Haptics';
import { screenShake } from '@/lib/effects/ScreenShake';
import {
  createInterpolationBuffer,
  recordTick,
  resetInterpolationBuffer,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
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

/**
 * First-extraction claim prompt bookkeeping (Identity v1 section 3.3):
 * device-scoped UI state ONLY (never game progress) - shown at most once
 * per device until claimed or dismissed twice.
 */
const HANDLE_PROMPT_KEY = 'handle-claim-prompt-dismissals';

function handlePromptExhausted(): boolean {
  try {
    return Number(window.localStorage.getItem(HANDLE_PROMPT_KEY) ?? '0') >= 2;
  } catch {
    return true;
  }
}

function recordHandlePromptDismissal(claimed: boolean): void {
  try {
    const current = Number(window.localStorage.getItem(HANDLE_PROMPT_KEY) ?? '0');
    window.localStorage.setItem(
      HANDLE_PROMPT_KEY,
      claimed ? '99' : String(current + 1)
    );
  } catch {
    // Storage unavailable - the prompt simply may repeat
  }
}

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
  // Mobile control scheme: flick-anywhere is the default, D-pad the
  // fallback. Client preference, persisted in localStorage.
  const [controlMode, setControlMode] = useState<'flick' | 'dpad'>('flick');
  // Live camera azimuth written per frame by CameraRig; read at flick
  // pointerdown to freeze the gesture's orientation for the whole touch.
  const cameraAzimuthRef = useRef<number>(DEFAULT_AZIMUTH);
  // ?debug=input instrumentation - null unless the flag is present, so the
  // input path records nothing in normal play.
  const inputDebugRef = useRef<InputDebugState | null>(null);
  const [inputDebugEnabled, setInputDebugEnabled] = useState(false);
  // ?perf render-stats overlay (dev builds only)
  const [perfEnabled, setPerfEnabled] = useState(false);
  // Tick-alpha interpolation buffer (fluidity core): written every engine
  // tick, read every animation frame - lives in a ref, NEVER in zustand.
  const interpBufferRef = useRef<InterpolationBuffer | null>(null);
  if (interpBufferRef.current === null) {
    interpBufferRef.current = createInterpolationBuffer();
  }
  const prevQueueLengthRef = useRef(0);
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
  // Free Play (Design v2 §7.4): whether the CURRENT/LAST run was free.
  // Ref for the gameOver closure (registered once on mount), state for UI.
  const freeRunRef = useRef(false);
  const [lastRunFree, setLastRunFree] = useState(false);
  // What the free run WOULD have earned (server recompute x multipliers)
  const [hypotheticalDna, setHypotheticalDna] = useState<number | null>(null);
  // Weekly Anomaly board (Design v2 §7.2): this week's modifier + top 10 +
  // the player's best, for the pre-game entry. null until fetched;
  // { live: false } pre-migration-021 hides the ANOMALY mode chip.
  const [anomalyBoard, setAnomalyBoard] = useState<AnomalyBoardView | null>(null);
  // Per-dynasty mastery (Design v2 §7.1): levels for the pre-game chip
  // (server-read; pre-migration-019 everything reads M0)...
  const [masteryLevels, setMasteryLevels] = useState<Record<string, number>>({});
  // ...and the end-of-run grant for the game-over screen (+XP, level-up)
  const [masteryResult, setMasteryResult] = useState<{
    dynasty: string;
    xpGained: number;
    xp: number;
    level: number;
    leveledUp: boolean;
    unlocks: { level: number; kind: string; label: string }[];
  } | null>(null);
  // Identity v1 (section 4.3): the player's own card on the game-over
  // screen, fetched between runs. null pre-migration-022 (card hidden).
  const [ownIdentity, setOwnIdentity] = useState<PlayerIdentity | null>(null);
  // The first-extraction claim ceremony (section 3.3): offered when the
  // end response says the name is still generated, at most once per
  // device until claimed or dismissed twice.
  const [showHandleClaim, setShowHandleClaim] = useState(false);

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
    foodEaten,
    endReason,
    exitTile,
    exitTile2,
    exitTicksRemaining,
    anomalyRun,
    energy,
    maxEnergy,
    energyRegenAt,
    selectedDynasty,
    snake,
    food,
    direction,
    queuedDirections,
    extraFoods,
    constellationGlyph,
    chainLength,
    comboMultiplier,
    mutationTile,
    mutationTicksRemaining,
    heldMutations,
    choiceOptions,
    phoenixTriggered,
    fluxPhase,
    fluxTelegraph,
    startGame: storeStartGame,
    endGame,
    setSnake,
    setFood,
    setDirection,
    setQueuedDirections,
    setScore,
    setDnaCollected,
    setFoodEaten,
    setExitTile,
    setExitTile2,
    setAnomalyRun,
    setExtraFoods,
    setConstellation,
    setMutationTile,
    setHeldMutations,
    setChoiceOptions,
    setPhoenixTriggered,
    setFlux,
    setSelectedDynasty,
    aimSystem,
    setAimSystem,
    gameMode,
    setGameMode,
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

  // Restore the persisted control-mode preference (default: flick)
  useEffect(() => {
    try {
      if (window.localStorage.getItem('control-mode') === 'dpad') {
        setControlMode('dpad');
      }
    } catch {
      // Storage unavailable (private mode) - keep the flick default
    }
  }, []);

  const handleControlModeChange = useCallback((mode: 'flick' | 'dpad') => {
    setControlMode(mode);
    try {
      window.localStorage.setItem('control-mode', mode);
    } catch {
      // Preference simply won't persist
    }
  }, []);

  // Enable input debug instrumentation only when the URL asks for it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'input') {
      inputDebugRef.current = createInputDebugState();
      setInputDebugEnabled(true);
    }
    // Perf overlay: dev builds only, opt-in via ?perf
    if (process.env.NODE_ENV !== 'production' && params.has('perf')) {
      setPerfEnabled(true);
    }
  }, []);

  const getCameraAzimuth = useCallback(() => cameraAzimuthRef.current, []);

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

  // Weekly Anomaly board (§7.2): fetched between runs so the pre-game
  // entry shows the live modifier + leaderboard. Refreshes after every
  // run (isPlaying flips back) so "your best" is current. Non-fatal.
  useEffect(() => {
    if (!session?.access_token || isPlaying) return;
    let cancelled = false;
    fetch('/api/anomaly', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data?.anomaly) {
          setAnomalyBoard(data as AnomalyBoardView);
        }
      })
      .catch(err => console.error('Failed to fetch anomaly board:', err));
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, isPlaying]);

  // Identity v1: own Player Card for the game-over screen, refreshed
  // between runs. { live: false } (pre-022) hides the card. Non-fatal.
  useEffect(() => {
    if (!session?.access_token || isPlaying) return;
    let cancelled = false;
    fetch('/api/player/identity', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled) {
          setOwnIdentity(data?.live !== false && data?.identity ? data.identity : null);
        }
      })
      .catch(err => console.error('Failed to fetch identity:', err));
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, isPlaying]);

  // Fetch per-dynasty mastery levels for the pre-game chip (non-fatal)
  useEffect(() => {
    if (!session?.access_token) return;
    fetch('/api/mastery', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data?.mastery) return;
        const levels: Record<string, number> = {};
        for (const entry of data.mastery as { dynasty: string; level: number }[]) {
          levels[entry.dynasty] = entry.level;
        }
        setMasteryLevels(levels);
      })
      .catch(err => console.error('Failed to fetch mastery:', err));
  }, [session?.access_token]);

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

  // Dynasty ruleset follows the equipped snake. The engine is constructed
  // on mount (before the collection fetch resolves), so inject the ruleset
  // as soon as the equipped snake is known.
  useEffect(() => {
    if (equippedSnake) {
      gameRef.current?.setRuleset(getRuleset(normalizeDynastyName(equippedSnake.dynasty)));
    }
  }, [equippedSnake]);

  // No playable snake: new player (never picked a starter) or nothing equipped
  const noSnakeAvailable = needsStarterSelection || (collectionLoaded && !equippedSnake);

  // Mutation choice hold: the engine is frozen under the overlay (NOT paused)
  const choiceActive = choiceOptions !== null;

  // The active anomaly run's modifier id (§7.2) - shapes the BANK preview
  // and outcome copy exactly like the server recompute will
  const activeAnomalyId: AnomalyId | null =
    anomalyRun && isAnomalyId(anomalyRun.id) ? anomalyRun.id : null;

  const handleChooseMutation = useCallback((index: 0 | 1) => {
    gameRef.current?.chooseMutation(index);
  }, []);

  const handleDeclineMutation = useCallback(() => {
    gameRef.current?.declineMutation();
  }, []);

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

    gameRef.current.on('extracted', () => {
      // Banked ending: celebratory feedback instead of the death drama
      audioManager.play('collect');
      haptics.medium();
    });

    // Mutation food (Design v2 Phase 2): the engine freezes in its choice
    // hold while the overlay is up - this is NOT the pause state, so the
    // pause menu never renders here.
    gameRef.current.on('mutationChoice', (data: any) => {
      setChoiceOptions(data.options);
      audioManager.play('pause');
      haptics.medium();
    });

    gameRef.current.on('mutationPicked', (data: any) => {
      setHeldMutations(data.held);
      setChoiceOptions(null);
      audioManager.play('uiClick');
    });

    gameRef.current.on('mutationDeclined', () => {
      setChoiceOptions(null);
      audioManager.play('uiClick');
    });

    gameRef.current.on('phoenixTriggered', () => {
      // The one death that wasn't: death drama feedback, but the run lives
      setPhoenixTriggered(true);
      audioManager.play('death');
      haptics.death();
      screenShake.heavy();
      showToast('Phoenix — one death absorbed', 'achievement', 3000);
    });

    // COSMIC Flux: audio cues for the wall-phase telegraph + flip (the
    // ArenaBorder rails carry the visual signal)
    gameRef.current.on('fluxTelegraph', () => {
      audioManager.play('directionChange');
    });
    gameRef.current.on('fluxPhaseChange', () => {
      audioManager.play('uiClick');
    });

    gameRef.current.on('gameOver', async (rawData: unknown) => {
      const data = rawData as GameOverData;
      // Send results to server first (use refs to avoid stale closure)
      const currentSession = sessionRef.current;
      const sessionId = currentSessionIdRef.current;
      if (currentSession?.access_token && sessionId) {
        const gameDuration = Math.floor((Date.now() - gameStartTime.current) / 1000);
        // Identity v1 section 9.5: the run's compact event stream + how
        // it ended. Display/Analyst input only - the server stores it
        // separately from the payout path and validates every bound.
        const runEventRecord = gameRef.current?.getRunEvents() ?? null;
        // If the reward POST can't be delivered, queue it for replay on the
        // next app load so a tab close at death never loses the run's DNA.
        // Phase 2 payload fields shared by the live POST and the outbox
        const cosmicClaim = data.cosmic
          ? {
              combo_dna_bonus: data.cosmic.comboDnaBonus,
              combo_score_bonus: data.cosmic.comboScoreBonus,
              max_chain: data.cosmic.maxChain,
            }
          : undefined;
        const queueForReplay = () => {
          // Free runs pay nothing - there is no reward to protect, so a
          // failed free end is never queued for replay
          if (freeRunRef.current) return;
          enqueueReward({
            sessionId,
            score: data.score,
            dna_earned: data.dnaCollected,
            duration_seconds: gameDuration,
            food_count: data.foodEaten,
            extracted: data.extracted,
            ...(data.mutations.length > 0 ? { mutations: data.mutations } : {}),
            ...(data.phoenixTriggeredAtFood !== null
              ? { phoenix_triggered_at_food: data.phoenixTriggeredAtFood }
              : {}),
            ...(cosmicClaim ? { cosmic: cosmicClaim } : {}),
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
              food_count: data.foodEaten,
              extracted: data.extracted,
              died: !data.extracted,
              victory: false,
              // Design v2 Phase 2: mutation picks + Phoenix + COSMIC combo
              mutations: data.mutations,
              ...(data.phoenixTriggeredAtFood !== null
                ? { phoenix_triggered_at_food: data.phoenixTriggeredAtFood }
                : {}),
              ...(cosmicClaim ? { cosmic: cosmicClaim } : {}),
              // Identity v1 section 9.5: death cause + run events
              ...(data.deathCause ? { death_cause: data.deathCause } : {}),
              ...(runEventRecord && runEventRecord.events.length > 0
                ? { run_events: runEventRecord }
                : {}),
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

            // Free runs: the server reports what the run WOULD have earned
            if (typeof result.hypotheticalDna === 'number') {
              setHypotheticalDna(result.hypotheticalDna);
            }

            // Show daily streak info on the game-over screen
            if (result.streak) {
              setStreakInfo(result.streak);
            }

            // Mastery XP grant (Design v2 §7.1: extracted earning runs
            // only) - powers the +XP line and the level-up moment
            if (result.mastery) {
              setMasteryResult(result.mastery);
              setMasteryLevels((prev) => ({
                ...prev,
                [result.mastery.dynasty]: result.mastery.level,
              }));
            }

            // Show toast for each newly unlocked achievement
            if (result.newAchievements && result.newAchievements.length > 0) {
              setUnlockedAchievements(result.newAchievements);
              result.newAchievements.forEach((name: string) => {
                showToast(`Achievement Unlocked: ${name}`, 'achievement', 5000);
              });
            }

            // Identity v1 section 3.3: the first-extraction claim moment.
            // "That run deserves a name on it" - banked run, generated
            // name, prompt not yet exhausted on this device.
            if (
              result.identity?.isGenerated &&
              result.validation?.extracted &&
              !handlePromptExhausted()
            ) {
              setShowHandleClaim(true);
            }
          }
        } catch (err) {
          console.error('Failed to send game results, queueing for replay:', err);
          queueForReplay();
        }
      }

      endGame(data.score, data.dnaCollected, data.endReason);
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

  }, [endGame, setDnaCollected, setScore, setDeathSequence, setPaused, setChoiceOptions, setHeldMutations, setPhoenixTriggered, showToast]);

  // Sync game state to store
  const syncState = useCallback(() => {
    if (gameRef.current) {
      const state = gameRef.current.getState();
      const queued = gameRef.current.getQueuedDirections();
      // Debug: a queue-length drop in the per-tick sync means this tick
      // consumed a buffered command - record when it executed.
      const debug = inputDebugRef.current;
      if (debug && queued.length < prevQueueLengthRef.current) {
        recordDebugEvent(debug, {
          kind: 'exec',
          dir: state.direction,
          detail: 'tick consumed',
          time: Date.now(),
        });
      }
      prevQueueLengthRef.current = queued.length;
      setSnake(state.snake);
      setFood(state.food);
      setDirection(state.direction);
      setQueuedDirections(queued);
      setFoodEaten(state.foodEaten);
      setExitTile(state.exitTile, state.exitTicksRemaining);
      // Twin Exits (anomaly): the second portal of the pair
      setExitTile2(state.exitTile2);
      // Phase 2 mirrors: extra foods (Splitter/COSMIC groups), the
      // constellation chain, the mutation beacon, and the flux phase
      setExtraFoods(state.foods.slice(1));
      setConstellation(state.constellationGlyph, state.chainLength, state.comboMultiplier);
      setMutationTile(state.mutationTile, state.mutationTicksRemaining);
      setFlux(state.fluxPhase, state.fluxTelegraph);
      // Fluidity core: stamp this tick into the interpolation buffer.
      // getSpeed() AFTER the tick is the exact interval the loop re-arms
      // with - the precise denominator for the render-side alpha.
      recordTick(
        interpBufferRef.current!,
        state.snake,
        gameRef.current.getSpeed(),
        performance.now()
      );
    }
  }, [setSnake, setFood, setDirection, setQueuedDirections, setFoodEaten, setExitTile, setExitTile2, setExtraFoods, setConstellation, setMutationTile, setFlux]);

  // Sync only heading + input buffer - called on every direction input so
  // the aim telegraph reacts on the keypress, not on the next tick
  const syncAim = useCallback(() => {
    if (gameRef.current) {
      const queued = gameRef.current.getQueuedDirections();
      // Keep the debug exec-watch baseline current: inputs only grow the
      // queue, so tracking here prevents false "consumed" reads on ticks.
      prevQueueLengthRef.current = queued.length;
      setDirection(gameRef.current.getState().direction);
      setQueuedDirections(queued);
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

  // Default mode: EARN when energy is available, FREE when it runs out -
  // the zero-energy screen offers practice instead of a wall. (EARN and
  // ANOMALY are disabled in the toggle at 0 energy, so this can't fight
  // the player - anomaly runs are earning runs and cost energy too.)
  useEffect(() => {
    if (
      !isPlaying &&
      (gameMode === 'earn' || gameMode === 'anomaly') &&
      energy < GAME_CONFIG.economy.energy.costPerGame
    ) {
      setGameMode('free');
    }
  }, [energy, isPlaying, gameMode, setGameMode]);

  // Start game - call server API first, then enter ready state
  const handleStart = useCallback(async (modeOverride?: GameMode) => {
    const mode = modeOverride ?? gameMode;
    if (!session?.access_token) {
      setStartError('Please sign in to play');
      return;
    }
    if (!equippedSnake) {
      setStartError('No snake equipped. Choose one in the Lab.');
      return;
    }
    // Free Play bypasses the energy gate (server enforces the same rule)
    if (mode !== 'free' && energy < GAME_CONFIG.economy.energy.costPerGame) return;
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
          mode, // 'free' = practice run: no energy, no rewards (§7.4)
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

      // Sync server state to local (free starts echo energy unchanged)
      syncEnergyFromServer(data.energy, data.energyRegenAt);
      setCurrentSessionId(data.sessionId);
      gameStartTime.current = Date.now();
      freeRunRef.current = mode === 'free';
      setLastRunFree(mode === 'free');
      setHypotheticalDna(null);
      setMasteryResult(null);

      // Trait config from the session-start response (Design v2 Phase 3A):
      // the server read these from the equipped snake's row - the engine
      // applies [P] effects and mirrors [E] math, but the payout authority
      // stays the server recompute.
      gameRef.current?.setTraits(sanitizeTraits(data.traits));

      // Unlocked mutation pool (Design v2 §7.1): server-computed from
      // player_mastery (full pool on Free Play per §7.4). Offer config
      // only - the server validates picks against its own recompute, so
      // a tampered pool can never smuggle un-earned economics. An empty
      // or missing pool falls back to the base ten inside the engine.
      gameRef.current?.setMutationPool(
        Array.isArray(data.mutationPool)
          ? data.mutationPool.filter(isMutationId)
          : []
      );

      // Anomaly runs (§7.2): the server confirms the week's modifier at
      // start - the engine applies its [P] physics and mirrors its [E]
      // math; the payout authority stays the server's session-row
      // recompute. Normal runs explicitly clear any previous anomaly.
      const serverAnomaly =
        mode === 'anomaly' && isAnomalyId(data.anomaly?.id)
          ? (data.anomaly.id as AnomalyId)
          : null;
      gameRef.current?.setAnomaly(serverAnomaly);
      setAnomalyRun(
        serverAnomaly
          ? {
              id: serverAnomaly,
              name: String(data.anomaly.name ?? serverAnomaly),
              effect: String(data.anomaly.effect ?? ''),
              endsAt: String(data.anomaly.endsAt ?? ''),
            }
          : null
      );

      if (data.mastery?.dynasty) {
        setMasteryLevels((prev) => ({
          ...prev,
          [data.mastery.dynasty]: data.mastery.level,
        }));
      }

      // Now start the game locally. Reset the interpolation buffer FIRST
      // so the new run's opening tick never blends against the previous
      // run's final pose.
      resetInterpolationBuffer(interpBufferRef.current!);
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
  }, [session?.access_token, energy, isStarting, equippedSnake, gameMode, syncEnergyFromServer, storeStartGame, setReady, setAnomalyRun, syncState]);

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

      // The mutation choice overlay owns the keyboard while it is open
      // (1/2 pick, Escape declines - handled in the overlay, capture phase)
      if (choiceActive) return;

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
  }, [isPlaying, isGameOver, isPaused, isDeathSequence, isReady, choiceActive, startGameLoop, setReady, syncAim]);

  // Handle direction from D-Pad
  const handleDPadDirection = useCallback((dir: Direction) => {
    if (!isPlaying || isGameOver || isPaused || !gameRef.current) return;
    gameRef.current.setDirection(dir);
    syncAim();
  }, [isPlaying, isGameOver, isPaused, syncAim]);

  // First flick while ready starts the run (FlickSurface calls this once)
  const handleFlickReadyStart = useCallback(() => {
    setReady(false);
    startGameLoop();
  }, [setReady, startGameLoop]);

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
    setHypotheticalDna(null);
    setMasteryResult(null);
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
          {/* Extraction bank preview: what this run pays banked vs crashed
              (mutation-aware: Mirror Wager / Compound Interest / Phoenix
              reshape the outcome multipliers live). Subtle by default;
              pulses while the exit portal is live. */}
          {isPlaying && dnaCollected > 0 && (
            <div
              data-testid="bank-chip"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-arcade border bg-void/70 backdrop-blur-sm text-sm font-body transition-colors ${
                exitTile
                  ? 'border-[#7df9ff]/80 animate-pulse'
                  : 'border-scale-blue-light/50'
              }`}
            >
              <span className="text-[#7df9ff] font-bold">
                BANK {applyOutcomeWithMutations(dnaCollected, true, heldMutations, phoenixTriggered, [], activeAnomalyId)}
              </span>
              <span className="text-beige/40">·</span>
              <span className="text-beige/60">
                crash {applyOutcomeWithMutations(dnaCollected, false, heldMutations, phoenixTriggered, [], activeAnomalyId)}
              </span>
            </div>
          )}
          {/* COSMIC constellation combo chip - visible once a chain is live */}
          {isPlaying && chainLength >= 2 && (
            <div
              data-testid="combo-chip"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-arcade border border-[#f0abfc]/60 bg-void/70 backdrop-blur-sm text-sm font-body"
            >
              <span className="text-[#f0abfc] font-bold">
                ×{comboMultiplier.toFixed(1)}
              </span>
              <span className="text-beige/60">chain {chainLength}</span>
            </div>
          )}
          <div className="flex items-center px-3 py-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/70 backdrop-blur-sm">
            <EnergyTimer
              energy={energy}
              maxEnergy={maxEnergy}
              energyRegenAt={energyRegenAt}
            />
          </div>
          {/* Anomaly run chip - the week's modifier, always visible while
              playing the board (§7.2) */}
          {isPlaying && anomalyRun && (
            <div
              data-testid="anomaly-run-chip"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-arcade border border-[#7df9ff]/60 bg-void/70 backdrop-blur-sm text-sm font-body tracking-widest uppercase"
            >
              <span className="text-[#7df9ff] font-bold">Anomaly</span>
              <span className="text-beige/70">{anomalyRun.name}</span>
            </div>
          )}
          {/* Free Play watermark - subtle but always on during practice
              runs so screenshots/streams are honest about the mode */}
          {isPlaying && lastRunFree && (
            <div
              data-testid="free-play-watermark"
              className="flex items-center px-3 py-1.5 rounded-arcade border border-dashed border-beige/40 bg-void/50 backdrop-blur-sm text-beige/70 text-sm font-body tracking-widest uppercase"
            >
              Free Play
            </div>
          )}
        </div>

        {/* Held mutations strip - the run's build at a glance */}
        {isPlaying && (
          <MutationHUD held={heldMutations} phoenixTriggered={phoenixTriggered} />
        )}

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

      {/* Pause Button (in-game) - hidden during the mutation choice hold */}
      {isPlaying && !isGameOver && !isPaused && !choiceActive && (
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

      {/* Flick-anywhere touch layer (mobile default). Sits in the z-band
          between the canvas and the HUD (z-10+), so HUD buttons stay live.
          Camera touch-orbit is intentionally ceded to flick input while
          playing - the reset-view button remains available. */}
      {isMobile && controlMode === 'flick' && isPlaying && !isGameOver && !isPaused && (
        <FlickSurface
          gameRef={gameRef}
          getAzimuth={getCameraAzimuth}
          isReady={isReady}
          onReadyStart={handleFlickReadyStart}
          onAim={syncAim}
          debugRef={inputDebugRef}
        />
      )}

      {/* Virtual D-Pad (mobile fallback via control-mode toggle). bottom
          offset includes the safe-area inset so the DOWN button clears home
          indicators / browser chrome. */}
      {isMobile && controlMode === 'dpad' && isPlaying && !isGameOver && !isPaused && (
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

      {/* Input instrumentation (?debug=input only) */}
      {inputDebugEnabled && <InputDebugOverlay debugRef={inputDebugRef} />}

      {/* Pause Menu */}
      {isPaused && isPlaying && !isGameOver && (
        <PauseMenu
          dynasty={selectedDynasty}
          score={score}
          dnaCollected={dnaCollected}
          heldMutations={heldMutations}
          phoenixTriggered={phoenixTriggered}
          onResume={handleResume}
          onQuit={handleQuit}
        />
      )}

      {/* Mutation choice-of-2 (engine frozen in its choice hold - never
          concurrent with the pause menu: pause is refused during the hold) */}
      {choiceOptions && isPlaying && !isGameOver && (
        <MutationChoiceOverlay
          options={choiceOptions}
          onChoose={handleChooseMutation}
          onDecline={handleDeclineMutation}
        />
      )}

      {/* Game Over / Start Screen */}
      {!isPlaying && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-void-deep/85 backdrop-blur-sm p-4">
          <div
            className={`panel-elevated p-8 text-center space-y-6 min-w-[320px] max-w-full animate-pop-in ${
              isGameOver
                ? endReason === 'extracted'
                  ? '[--glow:#4ade80]'
                  : '[--glow:#f43f5e]'
                : '[--glow:#22d3ee]'
            }`}
          >
            {isGameOver ? (
              <>
                {lastRunFree ? (
                  <div className="space-y-1">
                    <h2
                      className="heading-display text-4xl text-[#22d3ee] text-glow"
                      data-testid="gameover-practice"
                    >
                      Practice Run
                    </h2>
                    <p className="text-beige/60 font-body text-sm tracking-wide uppercase">
                      {endReason === 'extracted'
                        ? 'Extracted — free play, no rewards'
                        : 'Crashed — free play, no rewards'}
                    </p>
                  </div>
                ) : endReason === 'extracted' ? (
                  <div className="space-y-1">
                    <h2
                      className="heading-display text-4xl text-rarity-uncommon text-glow"
                      data-testid="gameover-extracted"
                    >
                      Extracted
                    </h2>
                    <p className="text-rarity-uncommon/90 font-body text-sm tracking-wide uppercase">
                      Banked +{Math.round((outcomeMultipliers(heldMutations, phoenixTriggered, [], activeAnomalyId).bank - 1) * 100)}%
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <h2
                      className="heading-display text-4xl text-strike-red text-glow"
                      data-testid="gameover-crashed"
                    >
                      Game Over
                    </h2>
                    <p className="text-beige/60 font-body text-sm tracking-wide uppercase">
                      Crashed — salvaged {Math.round(outcomeMultipliers(heldMutations, phoenixTriggered, [], activeAnomalyId).death * 100)}%
                    </p>
                  </div>
                )}
                {/* Identity v1 (section 4.3): your card at the moment of
                    judgment - claim affordance while the name is generated */}
                {ownIdentity && (
                  <PlayerCard
                    identity={ownIdentity}
                    variant="card"
                    isSelf
                    onClaim={() => setShowHandleClaim(true)}
                    className="text-left"
                  />
                )}
                <div className="space-y-2 font-body">
                  <p className="text-2xl text-bone-white">
                    Score: <span className="font-bold text-venom-orange">{score}</span>
                  </p>
                  <p className="text-2xl text-bone-white flex items-center justify-center gap-2">
                    <IconDna size={22} className="text-venom-orange" />
                    DNA:{' '}
                    {lastRunFree ? (
                      // The stakes they practiced for: server-priced when the
                      // end POST succeeded, local recompute as the fallback
                      <span
                        className="font-bold text-beige/80"
                        data-testid="gameover-hypothetical"
                      >
                        would have banked +
                        {hypotheticalDna ??
                          applyOutcomeWithMutations(
                            dnaCollected,
                            endReason === 'extracted',
                            heldMutations,
                            phoenixTriggered
                          )}
                      </span>
                    ) : endReason === 'extracted' ? (
                      <span className="font-bold text-rarity-uncommon">
                        {dnaCollected} → +{applyOutcomeWithMutations(dnaCollected, true, heldMutations, phoenixTriggered)}
                      </span>
                    ) : (
                      <span className="font-bold text-venom-orange text-glow-orange">
                        {dnaCollected} → +{applyOutcomeWithMutations(dnaCollected, false, heldMutations, phoenixTriggered)}
                      </span>
                    )}
                  </p>
                  {/* The run's build: mutations held at the end */}
                  {heldMutations.length > 0 && (
                    <div
                      className="flex flex-wrap gap-2 justify-center pt-1"
                      data-testid="gameover-mutations"
                    >
                      {heldMutations.map((pick: MutationPick) => (
                        <span
                          key={pick.id}
                          title={`${MUTATIONS[pick.id].effect}. Cost: ${MUTATIONS[pick.id].cost}`}
                          className="inline-flex items-center px-2.5 py-1 rounded-arcade border border-[#a855f7]/60 bg-[#a855f7]/10 text-[#c4b5fd] text-sm font-body"
                        >
                          {MUTATIONS[pick.id].name}
                          {pick.id === 'phoenix' && phoenixTriggered ? ' (spent)' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {streakInfo && (
                    <p className="text-lg text-beige flex items-center justify-center gap-1.5">
                      <IconFlame size={18} className="text-venom-orange" />
                      Day <span className="font-bold text-venom-orange">{streakInfo.current}</span> streak
                      {streakInfo.multiplier > 1 && (
                        <span className="text-beige/70"> ({streakInfo.multiplier}x DNA)</span>
                      )}
                    </p>
                  )}
                  {/* Mastery XP (Design v2 §7.1) - banked XP from this
                      extraction + the level-up moment when a rung falls */}
                  {masteryResult && (
                    <div className="space-y-2 pt-1" data-testid="gameover-mastery">
                      <p className="text-lg text-beige flex items-center justify-center gap-1.5">
                        <span className="font-bold text-[#7df9ff]">
                          +{masteryResult.xpGained.toLocaleString()} Mastery XP
                        </span>
                        <span className="text-beige/70">
                          {masteryResult.dynasty} M{masteryResult.level}
                        </span>
                      </p>
                      {masteryResult.leveledUp && (
                        <div
                          className="panel-glow [--glow:#facc15] px-4 py-3 space-y-1 animate-pop-in shadow-glow-sm"
                          data-testid="mastery-levelup"
                        >
                          <p className="heading-display text-xl text-[#facc15] text-glow animate-breathe">
                            Mastery M{masteryResult.level} — {masteryResult.dynasty}
                          </p>
                          {masteryResult.unlocks.map((unlock) => (
                            <p
                              key={unlock.level}
                              className="text-sm font-body text-bone-white"
                            >
                              {unlock.kind === 'mutation' ? (
                                <>
                                  New mutation in your pool:{' '}
                                  <span className="font-bold text-[#c4b5fd]">
                                    {unlock.label}
                                  </span>
                                </>
                              ) : (
                                <>
                                  Unlocked:{' '}
                                  <span className="font-bold">{unlock.label}</span>
                                </>
                              )}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* The Analyst's post-run insight (Identity v1 section 9.2):
                    lazy, additive, never blocks the game-over flow —
                    pre-025/disabled/guest states render nothing */}
                {currentSessionId && session?.access_token && !lastRunFree && (
                  <RunInsightCard
                    sessionId={currentSessionId}
                    accessToken={session.access_token}
                  />
                )}

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
                  <div className="space-y-2">
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
                    <p
                      className="text-beige/80 font-body text-sm"
                      data-testid="ruleset-explainer"
                    >
                      {rulesetExplainer[normalizeDynastyName(equippedSnake.dynasty)]}
                    </p>
                    {/* Dynasty mastery chip (Design v2 §7.1) */}
                    {masteryLevels[normalizeDynastyName(equippedSnake.dynasty)] !== undefined && (
                      <p
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-arcade border border-scale-blue-light/50 bg-void/60 text-sm font-body text-beige"
                        data-testid="mastery-chip"
                      >
                        Mastery{' '}
                        <span className="font-bold text-[#7df9ff]">
                          M{masteryLevels[normalizeDynastyName(equippedSnake.dynasty)]}
                        </span>
                      </p>
                    )}
                    <p className="text-beige/50 font-body text-xs">
                      Exit portal banks +25% — crashing salvages 60%
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

            {/* Run mode: EARN (energy, rewards) vs ANOMALY (weekly board,
                §7.2) vs FREE PLAY (unlimited practice, no rewards - §7.4) */}
            {!noSnakeAvailable && (
              <ModeToggle
                mode={gameMode}
                energy={energy}
                maxEnergy={maxEnergy}
                energyRegenAt={energyRegenAt}
                onSelect={setGameMode}
                anomalyName={
                  anomalyBoard?.live ? anomalyBoard.anomaly.name : null
                }
              />
            )}

            {/* Weekly Anomaly board entry: modifier, timer, your best,
                top 10 - shown while the ANOMALY mode is selected */}
            {!noSnakeAvailable &&
              gameMode === 'anomaly' &&
              anomalyBoard?.live && <AnomalyPanel board={anomalyBoard} />}

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

            {/* Control scheme (touch devices): flick-anywhere default,
                D-pad fallback. Persisted client preference. */}
            {isMobile && !noSnakeAvailable && (
              <div className="space-y-2">
                <p className="label-arcade">Controls</p>
                <div className="flex gap-2 justify-center">
                  {(['flick', 'dpad'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleControlModeChange(mode)}
                      data-testid={`control-mode-${mode}`}
                      aria-pressed={controlMode === mode}
                      className={`px-4 py-2 min-h-[44px] rounded-arcade border font-body text-sm transition-all ${
                        controlMode === mode
                          ? 'border-venom-orange/70 bg-venom-orange/15 text-venom-orange shadow-glow-sm shadow-venom-orange/40'
                          : 'border-scale-blue-light/50 bg-void/50 text-beige hover:text-bone-white'
                      }`}
                    >
                      {mode === 'flick' ? 'FLICK' : 'D-PAD'}
                    </button>
                  ))}
                </div>
                {controlMode === 'flick' && (
                  <p className="text-beige/60 text-xs font-body">
                    Flick anywhere on screen to steer
                  </p>
                )}
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
              ) : gameMode === 'free' ? (
                <button
                  onClick={() => handleStart('free')}
                  disabled={isStarting || !equippedSnake}
                  data-testid="free-play-start"
                  className={`btn-go inline-flex items-center gap-2 px-8 py-4 text-xl min-h-[44px] ${
                    isStarting || !equippedSnake
                      ? 'cursor-wait'
                      : 'animate-glow-pulse shadow-venom-orange/50'
                  }`}
                >
                  {isStarting
                    ? 'Starting...'
                    : isGameOver
                      ? 'Play Again — Free'
                      : 'Free Play'}
                </button>
              ) : energy > 0 ? (
                <button
                  onClick={() => handleStart(gameMode === 'anomaly' ? 'anomaly' : 'earn')}
                  disabled={isStarting || !equippedSnake}
                  data-testid={gameMode === 'anomaly' ? 'anomaly-start' : 'earn-start'}
                  className={`btn-go inline-flex items-center gap-2 px-8 py-4 text-xl min-h-[44px] ${
                    isStarting || !equippedSnake
                      ? 'cursor-wait'
                      : 'animate-glow-pulse shadow-venom-orange/50'
                  }`}
                >
                  {isStarting ? 'Starting...' : (
                    <>
                      {gameMode === 'anomaly'
                        ? isGameOver
                          ? 'Run the Anomaly Again'
                          : 'Run the Anomaly'
                        : isGameOver
                          ? 'Play Again'
                          : 'Play'}
                      <span className="inline-flex items-center gap-0.5 text-base">
                        ({GAME_CONFIG.economy.energy.costPerGame}
                        <IconBolt size={16} />)
                      </span>
                    </>
                  )}
                </button>
              ) : (
                // Fallback (the effect above normally flips to free first):
                // out of energy is an invitation to practice, not a wall
                <div className="space-y-2 font-body">
                  <p className="text-sm text-beige">
                    Out of energy — keep practicing in Free Play or wait for
                    your next <IconBolt size={14} className="inline" />
                  </p>
                  <button
                    onClick={() => {
                      setGameMode('free');
                      handleStart('free');
                    }}
                    disabled={isStarting || !equippedSnake}
                    data-testid="zero-energy-free-play"
                    className="btn-go inline-flex items-center gap-2 px-8 py-3 text-lg min-h-[44px]"
                  >
                    Free Play
                  </button>
                </div>
              )}

              {/* After a practice run, offer the earning path when the
                  player has the energy for it */}
              {isGameOver &&
                lastRunFree &&
                gameMode === 'free' &&
                energy >= GAME_CONFIG.economy.energy.costPerGame && (
                  <button
                    onClick={() => setGameMode('earn')}
                    data-testid="switch-to-earning"
                    className="btn-neutral inline-flex items-center gap-1.5 px-6 py-3 min-h-[44px]"
                  >
                    Switch to Earning
                    <span className="inline-flex items-center gap-0.5 text-sm">
                      ({GAME_CONFIG.economy.energy.costPerGame}
                      <IconBolt size={14} />)
                    </span>
                  </button>
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

      {/* Handle claim ceremony (Identity v1 section 3.3): offered after
          the first banked run while the name is still generated */}
      <HandleClaimModal
        isOpen={showHandleClaim}
        onClose={() => {
          recordHandlePromptDismissal(false);
          setShowHandleClaim(false);
        }}
        onClaimed={(handle) => {
          recordHandlePromptDismissal(true);
          setOwnIdentity((prev) =>
            prev ? { ...prev, handle, displayHandle: handle, isGenerated: false } : prev
          );
          showToast(`You are ${handle} now`, 'achievement', 4000);
        }}
        prompt="That run deserves a name on it."
      />

      {/* Ready State Overlay */}
      {isReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-4 animate-fade-up">
            <h2 className="heading-display text-5xl text-venom-orange text-glow-orange animate-breathe">Ready!</h2>
            {isMobile && controlMode === 'flick' ? (
              <>
                <p className="text-bone-white text-lg font-body">Flick anywhere to start</p>
                <p className="text-beige/60 text-sm font-body">Short flicks steer - chain them for fast turns</p>
              </>
            ) : isMobile ? (
              <>
                <p className="text-bone-white text-lg font-body">Tap a direction to start</p>
                <p className="text-beige/60 text-sm font-body">Use the D-Pad to move</p>
              </>
            ) : (
              <>
                <p className="text-bone-white text-lg font-body">Press SPACE or Arrow Key to Start</p>
                <p className="text-beige/60 text-sm font-body">Use Arrow Keys or WASD to move</p>
              </>
            )}
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
        // Fluidity: cap devicePixelRatio - uncapped retina dpr (3x) was the
        // single largest silent GPU cost on the board
        dpr={isMobile ? [1, 1.5] : [1, 2]}
      >
        {/* Fog in the void family so the arena's far edge melts into the
            page backdrop instead of cutting out against it - lifted and
            pulled back so the board reads bright and premium */}
        <fog attach="fog" args={['#0a0f14', 40, 75]} />
        {/* Premium base rig: cool sky/ground hemisphere carries the
            ambient read (subtle top/bottom shading instead of flat fill) */}
        <hemisphereLight args={['#bcd6e8', '#0b1016', 0.5]} />
        <ambientLight intensity={0.18} />
        {/* Key light - the single shadow caster */}
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.1}
          castShadow
          shadow-mapSize={isMobile ? [1024, 1024] : [2048, 2048]}
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
            bufferRef={interpBufferRef}
            isMobile={isMobile}
            snake={snake}
            food={food}
            extraFoods={extraFoods}
            constellationGlyph={constellationGlyph}
            exitTile={exitTile}
            exitTile2={exitTile2}
            anomalyId={isPlaying ? activeAnomalyId : null}
            exitTicksRemaining={exitTicksRemaining}
            mutationTile={mutationTile}
            mutationTicksRemaining={mutationTicksRemaining}
            fluxPhase={fluxPhase}
            fluxTelegraph={fluxTelegraph}
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

        <CameraRig
          gridSize={GAME_CONFIG.board.gridSize}
          resetToken={viewResetToken}
          azimuthRef={cameraAzimuthRef}
        />

        {/* Dev-only render stats (?perf) */}
        {perfEnabled && <PerfHUD />}

        {/* Bloom postprocessing - desktop only, to protect mobile framerate.
            Threshold 0.35 keeps the lifted floor/grid out of the bloom while
            the emissive identities (snake, food core, portal beam) glow. */}
        {!isMobile && (
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.35}
              luminanceSmoothing={0.9}
              intensity={0.75}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}

/**
 * COSMIC constellation glyph palette - three distinct hues, all outside
 * the violet mutation family and the cyan portal identity. Food color IS
 * the glyph signal: same hue = chainable.
 */
const GLYPH_COLORS = ['#22d3ee', '#f0abfc', '#fbbf24'];

interface GameBoardProps {
  dynasty: DynastyId;
  /** Tick-alpha interpolation buffer - the snake's per-frame position source. */
  bufferRef: { readonly current: InterpolationBuffer | null };
  /** Mobile perf profile (portal draw fallback etc.) */
  isMobile: boolean;
  snake: Position[];
  food: Position | null;
  extraFoods: Position[];
  constellationGlyph: number | null;
  exitTile: Position | null;
  /** Second portal of the Twin Exits anomaly pair (§7.2), null otherwise. */
  exitTile2: Position | null;
  /** Active anomaly modifier while playing (drives the Blackout mask). */
  anomalyId: AnomalyId | null;
  exitTicksRemaining: number;
  mutationTile: Position | null;
  mutationTicksRemaining: number;
  fluxPhase: FluxPhase | null;
  fluxTelegraph: boolean;
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
  bufferRef,
  isMobile,
  snake,
  food,
  extraFoods,
  constellationGlyph,
  exitTile,
  exitTile2,
  anomalyId,
  exitTicksRemaining,
  mutationTile,
  mutationTicksRemaining,
  fluxPhase,
  fluxTelegraph,
  direction,
  queuedDirections,
  aimSystem,
  particlePos,
  particleTrigger,
  deathPos,
  showDeathExplosion,
  cameraShake,
}: GameBoardProps) {
  const theme = themeManager.getTheme(dynasty);
  // COSMIC foods carry their constellation glyph color; other dynasties
  // keep the dynasty accent
  const foodColor =
    constellationGlyph !== null
      ? GLYPH_COLORS[constellationGlyph % GLYPH_COLORS.length]
      : theme.accent;

  // Lockable targets for the aim systems, rebuilt per tick (deadeye lock
  // scan + gridlock alignment). Food outranks portal outranks mutation on
  // ties - the priority lives in aimUtils, this is just the inventory.
  const aimTargets = useMemo<AimTarget[]>(() => {
    const list: AimTarget[] = [];
    if (food) list.push({ x: food.x, z: food.z, kind: 'food' });
    for (const extra of extraFoods) {
      list.push({ x: extra.x, z: extra.z, kind: 'food' });
    }
    if (exitTile) list.push({ x: exitTile.x, z: exitTile.z, kind: 'portal' });
    if (exitTile2) list.push({ x: exitTile2.x, z: exitTile2.z, kind: 'portal' });
    if (mutationTile) {
      list.push({ x: mutationTile.x, z: mutationTile.z, kind: 'mutation' });
    }
    return list;
  }, [food, extraFoods, exitTile, exitTile2, mutationTile]);

  return (
    <group position={cameraShake}>
      {/* Arena - void-family floor with dynasty edge wash, secondary rails.
          On COSMIC the border rails signal the wrap phase. */}
      <ArenaFloor
        gridSize={GAME_CONFIG.board.gridSize}
        floorColor="#101722"
        gridColor="#3b5266"
        majorGridColor="#7fb2d9"
        accentColor={theme.primary}
      />
      <ArenaBorder
        gridSize={GAME_CONFIG.board.gridSize}
        color={theme.secondary}
        accentColor="#22d3ee"
        emissiveIntensity={0.5}
        fluxPhase={fluxPhase}
        fluxTelegraph={fluxTelegraph}
      />

      {/* Aim telegraph - one renderer per selected aim system
          (deadeye/gridlock/pathline/firefly meta-progression) */}
      <AimRenderer
        headPosition={snake[0] ?? null}
        direction={direction}
        queuedDirections={queuedDirections}
        snake={snake}
        gridSize={GAME_CONFIG.board.gridSize}
        aimSystem={aimSystem}
        targets={aimTargets}
        bufferRef={bufferRef}
        color={theme.accent}
        laneColor={theme.primary}
      />

      {/* Snake - one instanced body draw + a head mesh with eyes, both
          reading tick-alpha interpolated positions from the buffer every
          frame (growth never touches React). Box fallback while the GLB
          streams shares the identical Core. */}
      <Suspense
        fallback={
          <InstancedSnakeFallback
            bufferRef={bufferRef}
            dynasty={dynasty}
            direction={direction}
          />
        }
      >
        <InstancedSnake
          bufferRef={bufferRef}
          dynasty={dynasty}
          direction={direction}
        />
      </Suspense>

      {/* Food - clean voxel block; COSMIC tints the whole wave with its
          constellation glyph color (same hue = chainable) */}
      {food && (
        <FoodBeacon
          position={[food.x + 0.5, 0, food.z + 0.5]}
          color={foodColor}
        />
      )}
      {extraFoods.map((extra) => (
        <FoodBeacon
          key={`${extra.x}-${extra.z}`}
          position={[extra.x + 0.5, 0, extra.z + 0.5]}
          color={foodColor}
        />
      ))}

      {/* Exit portal - the champagne extraction beam (categorically
          distinct from food; urgency spin-up/flicker as the window closes) */}
      {exitTile && (
        <ExitPortal
          position={[exitTile.x + 0.5, 0, exitTile.z + 0.5]}
          ticksRemaining={exitTicksRemaining}
          isMobile={isMobile}
        />
      )}
      {/* Twin Exits (anomaly §7.2): the pair's second doorway - same
          shared despawn window, either one banks the run */}
      {exitTile2 && (
        <ExitPortal
          position={[exitTile2.x + 0.5, 0, exitTile2.z + 0.5]}
          ticksRemaining={exitTicksRemaining}
          isMobile={isMobile}
        />
      )}

      {/* Blackout (anomaly §7.2): render-layer visibility mask - the
          world fades to void beyond 6 cells of the head. Never engine
          logic; payout math is untouched. */}
      {anomalyId === 'blackout' && (
        <BlackoutMask
          headPosition={snake[0] ?? null}
          gridSize={GAME_CONFIG.board.gridSize}
        />
      )}

      {/* Mutation food - violet double helix. Part of the deadeye lock
          inventory (lowest priority: food > portal > mutation) but never
          steers pathline/gridlock - it stays an optional detour. */}
      {mutationTile && (
        <MutationBeacon
          position={[mutationTile.x + 0.5, 0, mutationTile.z + 0.5]}
          ticksRemaining={mutationTicksRemaining}
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

