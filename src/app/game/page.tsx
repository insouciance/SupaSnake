'use client';

import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useEffect, useRef, useCallback, useMemo, useState, Suspense, type ReactNode } from 'react';
import { themeManager } from '@/lib/theme/ThemeManager';
import {
  SnakeGameLogic,
  Direction,
  Position,
  GameOverData,
  type SetDirectionResult,
} from '@/lib/game/SnakeGameLogic';
import type { FluxPhase } from '@/lib/game/SnakeGameLogic';
import {
  applyGenomeOutcome,
  applyOutcomeWithMutations,
  getRuleset,
  normalizeDynastyName,
  outcomeMultipliers,
  rulesetExplainer,
} from '@/shared/game/rulesets';
import { isMutationId, type MutationPick } from '@/shared/game/mutations';
import { GENES } from '@/shared/game/genes';
import { sanitizeTraits, TRAITS, TRAIT_STRAINS, type TraitId } from '@/shared/game/traits';
import { sanitizeLineage, startingStrainPoints, type Lineage } from '@/shared/game/lineage';
import {
  STRAINS,
  STRAIN_IDS,
  isStrainId,
  type StrainId,
  type StrainTier,
} from '@/shared/game/strains';
import { SPLICES, isSpliceId, type SpliceId } from '@/shared/game/splices';
import {
  sanitizeGenomeCapability,
  sanitizeGenomeFtue,
  type GenomeFtueCapability,
} from '@/lib/game/genomeCapability';
import {
  codexEntryName,
  sanitizeCodexDiscoveryResult,
  type CodexDiscovery,
} from '@/shared/game/codex';
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
import { CollectEffect, DeathExplosion } from '@/components/game/Particles';
import { InstancedSnake, InstancedSnakeFallback } from '@/components/game/InstancedSnake';
import { PerfHUD } from '@/components/game/PerfHUD';
import { VirtualDPad } from '@/components/game/VirtualDPad';
import { PauseMenu } from '@/components/game/PauseMenu';
import { AbandonRunDialog } from '@/components/game/AbandonRunDialog';
import { DynamicLights } from '@/components/game/DynamicLights';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { ArenaAssembly } from '@/components/game/arena/ArenaAssembly';
import { GameEnvironment } from '@/components/game/screen/GameEnvironment';
import { GAME_SCREEN_COLORS } from '@/components/game/screen/gameScreenTokens';
import { RunCockpit } from '@/components/game/cockpit/RunCockpit';
import type { RunCockpitModel } from '@/components/game/cockpit/types';
import { AimRenderer } from '@/components/game/AimRenderer';
import type { AimTarget } from '@/components/game/aimUtils';
import { AimSystemSelector } from '@/components/game/AimSystemSelector';
import { RunInsightCard } from '@/components/game/RunInsightCard';
import {
  CameraRig,
  COCKPIT_DEFAULT_POLAR,
  COCKPIT_FIT_SCALE,
  COCKPIT_FRAME_MARGIN,
  COCKPIT_TARGET_Y,
  DEFAULT_AZIMUTH,
} from '@/components/game/CameraRig';
import { FlickSurface } from '@/components/game/FlickSurface';
import { InputDebugOverlay } from '@/components/game/InputDebugOverlay';
import { FoodBeacon } from '@/components/game/FoodBeacon';
import { ExitPortal } from '@/components/game/ExitPortal';
import { MutationBeacon } from '@/components/game/MutationBeacon';
import { MutationChoiceOverlay } from '@/components/game/MutationChoiceOverlay';
import { MutationHUD } from '@/components/game/MutationHUD';
import { GenomeBoardEffects } from '@/components/game/GenomeBoardEffects';
import { GeneChoiceOverlay } from '@/components/game/GeneChoiceOverlay';
import { StrainMeterHUD } from '@/components/game/StrainMeterHUD';
import { ExpressionFlourish } from '@/components/game/ExpressionFlourish';
import {
  PortalChoiceOverlay,
  StrainSurgeOverlay,
} from '@/components/game/PortalChoiceOverlay';
import { GenomeCard } from '@/components/game/GenomeCard';
import { StrainChip } from '@/components/traits/StrainChip';
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
import { useCodexStore } from '@/lib/stores/codexStore';
import { useNotificationStore } from '@/lib/stores/notificationStore';
import {
  consumeLaunchHandoff,
  type GameSessionStartPayload,
} from '@/lib/ftue/launchFlow';
import { HUD_COCKPIT_V1_ENABLED } from '@/lib/features/cockpit';
import type { FtueBootstrapSnake } from '@/lib/ftue/types';
import {
  buildGenomeCardModel,
  type GenomeCardModel,
} from '@/lib/share/genomeCardImage';
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
const DIRECTION_BY_KEY: Record<string, Direction> = {
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

interface EquippedSnakeView {
  id: string;
  name: string;
  generation: number;
  dynasty: string;
  traits: TraitId[];
  lineage: Lineage | null;
}

interface BoardViewportShellProps {
  cockpitEnabled: boolean;
  isPlaying: boolean;
  model: RunCockpitModel;
  onPause: () => void;
  onAbandon?: () => void;
  onResetView: () => void;
  pauseDisabled: boolean;
  showPause: boolean;
  showAbandon?: boolean;
  pauseLabel: string;
  inputDock?: ReactNode;
  decisionDock?: ReactNode;
  eventCallout?: ReactNode;
  children: ReactNode;
}

function BoardViewportShell({
  cockpitEnabled,
  isPlaying,
  model,
  onPause,
  onAbandon,
  onResetView,
  pauseDisabled,
  showPause,
  showAbandon,
  pauseLabel,
  inputDock,
  decisionDock,
  eventCallout,
  children,
}: BoardViewportShellProps) {
  if (cockpitEnabled && isPlaying) {
    return (
      <RunCockpit
        model={model}
        onPause={onPause}
        onAbandon={onAbandon}
        onResetView={onResetView}
        pauseDisabled={pauseDisabled}
        showPause={showPause}
        showAbandon={showAbandon}
        pauseLabel={pauseLabel}
        inputDock={inputDock}
        decisionDock={decisionDock}
        eventCallout={eventCallout}
      >
        {children}
      </RunCockpit>
    );
  }

  return (
    <div
      className={isPlaying ? 'relative min-h-0 flex-1' : 'absolute inset-0'}
      data-testid="game-board-viewport"
    >
      {children}
    </div>
  );
}

function normalizeStrainTier(value: number | undefined): StrainTier {
  if (value === 3) return 3;
  if (value === 2) return 2;
  if (value === 1) return 1;
  return 0;
}

function directionCanRelease(result: SetDirectionResult): boolean {
  return result === 'accepted' || result === 'duplicate';
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
  // A pause or build decision never releases directly into movement. The
  // engine stays frozen until the player's next deliberate direction input.
  const [awaitingResumeInput, setAwaitingResumeInput] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [pauseRearming, setPauseRearming] = useState(false);
  const pauseRearmingRef = useRef(false);
  const pauseRearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // Every /game entry resolves whether it carries Home's consume-once run
  // before rendering a second Play action. Direct navigation resolves to the
  // existing voluntary pre-run screen; FTUE launch proceeds straight to board.
  const [routeInitializing, setRouteInitializing] = useState(true);
  const [requiresDirectionalStart, setRequiresDirectionalStart] = useState(false);
  const [minimalFirstRunPrompt, setMinimalFirstRunPrompt] = useState(false);
  const [showFirstResultDiscovery, setShowFirstResultDiscovery] = useState(false);
  const [hasCompletedFirstRun, setHasCompletedFirstRun] = useState(false);
  // Post-run save-progress prompt for guests (never shown on the way INTO
  // a game - account nudges belong after a run, not before it)
  const [showSaveProgress, setShowSaveProgress] = useState(false);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [equippedSnake, setEquippedSnake] = useState<EquippedSnakeView | null>(null);
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
  const [genomeFtue, setGenomeFtue] = useState<GenomeFtueCapability | null>(null);
  const [portalCanInfuse, setPortalCanInfuse] = useState(false);
  const [expressionFlourish, setExpressionFlourish] = useState<{
    strain: StrainId;
    tier: 2 | 3;
  } | null>(null);
  const [lastGenomeCard, setLastGenomeCard] = useState<GenomeCardModel | null>(null);
  const [codexDiscoveries, setCodexDiscoveries] = useState<CodexDiscovery[]>([]);
  const { data: codexData, fetchCodex } = useCodexStore();

  // Refs to hold current values for use in event handlers (avoids stale closure)
  const sessionRef = useRef(session);
  const currentSessionIdRef = useRef(currentSessionId);
  const equippedSnakeRef = useRef(equippedSnake);
  const firstRunAtStartRef = useRef(false);
  const handoffAttemptedRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    equippedSnakeRef.current = equippedSnake;
  }, [equippedSnake]);

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
    genomeRun,
    strainCounts,
    strainTiers,
    gildedCells,
    bonusFoods,
    choiceSource,
    portalChoicePending,
    surgeChoicePending,
    infusesCount,
    revive,
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
    setGenomeRun,
    setStrains,
    setFusedSplices,
    setGildedCells,
    setBonusFoods,
    setInfusesCount,
    setPortalChoicePending,
    setSurgeChoicePending,
    setRevive,
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

  /**
   * Bank/crash preview for the HUD chip and game-over screen. Genome
   * runs price the full outcome pipeline (fused wagers, infuse deltas,
   * strain deltas, clamps) via applyGenomeOutcome; legacy runs keep the
   * mutation-era math. Display-only - the server prices the real payout.
   */
  const previewOutcome = useCallback(
    (extracted: boolean, anomaly: AnomalyId | null = null): number => {
      if (genomeRun) {
        const liveState = gameRef.current?.getState();
        const capability = gameRef.current?.getGenome();
        const ftue = capability?.ftue;
        return applyGenomeOutcome(
          dnaCollected,
          extracted,
          {
            picks: heldMutations,
            heirloom: capability?.heirloom ?? {},
            surges: liveState?.surges ?? [],
            infuses: liveState?.infuses ?? [],
            revive: liveState?.revive ?? revive,
            prevRunDied: capability?.prevRunDied,
            lossEvents: liveState?.lossEvents ?? [],
            tierCap: ftue
              ? !ftue.expressionsUnlocked
                ? 1
                : !ftue.apexesUnlocked
                  ? 2
                  : 3
              : 3,
            suppressedStrains: capability?.suppressedStrains ?? [],
            splicesEnabled: ftue?.splicesUnlocked !== false,
          },
          equippedSnake?.traits ?? [],
          anomaly
        );
      }
      return applyOutcomeWithMutations(
        dnaCollected,
        extracted,
        heldMutations.filter((m): m is MutationPick => isMutationId(m.id)),
        phoenixTriggered,
        [],
        anomaly
      );
    },
    [genomeRun, dnaCollected, heldMutations, revive, phoenixTriggered, equippedSnake?.traits]
  );

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => () => {
    if (pauseRearmTimerRef.current) clearTimeout(pauseRearmTimerRef.current);
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
    if (!session?.access_token || isPlaying) return;

    fetch('/api/player', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.player) {
          syncEnergyFromServer(data.player.energy, data.player.energy_regen_at);
          setHasCompletedFirstRun(
            data.hasCompletedFirstRun === true ||
              Number(data.player.total_games_played ?? 0) > 0
          );
        }
        setNeedsStarterSelection(Boolean(data.needsStarterSelection));
        // Aim system meta-progression: server-stored selection + unlock stats
        if (isAimSystemId(data.aimSystem)) {
          setAimSystem(data.aimSystem);
        }
        if (data.aimStats) {
          setAimStats(data.aimStats);
        }
        if (data.genomeFtue) {
          setGenomeFtue(sanitizeGenomeFtue(data.genomeFtue));
        }
      })
      .catch(err => console.error('Failed to fetch player data:', err));
  }, [session?.access_token, isPlaying, syncEnergyFromServer, setAimSystem]);

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
          traits?: unknown;
          lineage?: unknown;
        }> = data.snakes ?? [];

        const equipped = snakes.find((s) => s.isEquipped) ?? null;
        if (equipped) {
          const dynastyName = (equipped.dynastyName ?? 'PRIMAL').toUpperCase();
          setEquippedSnake({
            id: equipped.id,
            name: equipped.variantName ?? equipped.variantId ?? 'Snake',
            generation: equipped.generation,
            dynasty: dynastyName,
            traits: sanitizeTraits(equipped.traits),
            lineage: sanitizeLineage(equipped.lineage),
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

  // Splice hints reveal names only after the player has discovered them.
  // The Codex remains free, but its in-run integration follows the FTUE
  // splice gate and refreshes between runs after new discoveries land.
  useEffect(() => {
    if (
      !session?.access_token ||
      isPlaying ||
      !genomeFtue?.splicesUnlocked
    ) return;
    void fetchCodex(session.access_token);
  }, [session?.access_token, isPlaying, genomeFtue?.splicesUnlocked, fetchCodex]);

  const discoveredSplices = useMemo<SpliceId[]>(
    () => codexData?.splices.filter((splice) => splice.discovered).map((splice) => splice.id) ?? [],
    [codexData]
  );

  const buildSeedPoints = useMemo(
    () => equippedSnake
      ? startingStrainPoints(equippedSnake.lineage, equippedSnake.traits)
      : {},
    [equippedSnake]
  );
  const buildSeedStrains = useMemo(() => {
    if (!equippedSnake) return [];
    return Array.from(new Set<StrainId>([
      ...(equippedSnake.lineage?.strains ?? []),
      ...equippedSnake.traits.map((trait) => TRAIT_STRAINS[trait]),
    ]));
  }, [equippedSnake]);
  const snakeStrainBands = useMemo<StrainId[]>(
    () => genomeRun && genomeFtue?.strainTagsUnlocked
      ? heldMutations.map((pick) => GENES[pick.id].strains[0])
      : [],
    [genomeRun, genomeFtue?.strainTagsUnlocked, heldMutations]
  );

  const theme = themeManager.getTheme(selectedDynasty);

  // Dynasty ruleset follows the equipped snake. The engine is constructed
  // on mount (before the collection fetch resolves), so inject the ruleset
  // as soon as the equipped snake is known.
  useEffect(() => {
    if (equippedSnake) {
      gameRef.current?.setRuleset(getRuleset(normalizeDynastyName(equippedSnake.dynasty)));
    }
  }, [equippedSnake]);

  // Under FTUE v2, no playable snake is a critical bootstrap/load failure.
  // The recovery path returns to Home Retry; it never makes Lab mandatory.
  const noSnakeAvailable = needsStarterSelection || (collectionLoaded && !equippedSnake);

  // Engine choice holds are frozen but not paused. All input surfaces and
  // the pause button stay disabled until the active decision resolves.
  const choiceActive =
    choiceOptions !== null || portalChoicePending || surgeChoicePending;
  const blockingOverlayActive = choiceActive || showAbandonConfirm;

  // The active anomaly run's modifier id (§7.2) - shapes the BANK preview
  // and outcome copy exactly like the server recompute will
  const activeAnomalyId: AnomalyId | null =
    anomalyRun && isAnomalyId(anomalyRun.id) ? anomalyRun.id : null;

  const beginPauseRearm = useCallback(() => {
    if (pauseRearmTimerRef.current) clearTimeout(pauseRearmTimerRef.current);
    pauseRearmingRef.current = true;
    setPauseRearming(true);
    pauseRearmTimerRef.current = setTimeout(() => {
      pauseRearmingRef.current = false;
      setPauseRearming(false);
      pauseRearmTimerRef.current = null;
    }, 600);
  }, []);

  const cancelPauseRearm = useCallback(() => {
    if (pauseRearmTimerRef.current) {
      clearTimeout(pauseRearmTimerRef.current);
      pauseRearmTimerRef.current = null;
    }
    pauseRearmingRef.current = false;
    setPauseRearming(false);
  }, []);

  const releaseResumeGate = useCallback((dir?: Direction): SetDirectionResult | null => {
    const game = gameRef.current;
    if (!game || !awaitingResumeInput) return 'inactive';
    const result = dir ? game.resumeWithDirection(dir) : null;
    if (!dir) game.resume();
    if (game.isPaused) return result;
    setAwaitingResumeInput(false);
    beginPauseRearm();
    return result;
  }, [awaitingResumeInput, beginPauseRearm]);

  const armResumeAfterDecision = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const state = game.getState();
    if (
      !state.isPlaying ||
      state.isGameOver ||
      state.pendingChoice !== null ||
      state.pendingPortalChoice !== null ||
      state.pendingSurgeChoice
    ) {
      return;
    }
    game.pause();
    setAwaitingResumeInput(true);
  }, []);

  const handleChooseMutation = useCallback((index: 0 | 1) => {
    gameRef.current?.chooseMutation(index);
  }, []);

  const handleDeclineMutation = useCallback(() => {
    gameRef.current?.declineMutation();
  }, []);

  const handlePortalChoice = useCallback((choice: 'bank' | 'pass' | 'infuse') => {
    if (gameRef.current?.resolvePortalChoice(choice)) {
      setPortalChoicePending(false);
      audioManager.play('uiClick');
      armResumeAfterDecision();
    }
  }, [armResumeAfterDecision, setPortalChoicePending]);

  const handleSurgeChoice = useCallback((strain: StrainId) => {
    if (gameRef.current?.chooseSurge(strain)) {
      const state = gameRef.current.getState();
      setSurgeChoicePending(false);
      setStrains(state.strainCounts, state.strainTiers);
      audioManager.play('uiClick');
      armResumeAfterDecision();
    }
  }, [armResumeAfterDecision, setStrains, setSurgeChoicePending]);

  const handleFlourishDone = useCallback(() => {
    setExpressionFlourish(null);
  }, []);

  // Calculate board center for camera
  const boardCenter = GAME_CONFIG.board.gridSize / 2;

  // Initialize game logic
  useEffect(() => {
    gameRef.current = new SnakeGameLogic({ gridSize: GAME_CONFIG.board.gridSize });

    const mirrorGenomeState = () => {
      const state = gameRef.current?.getState();
      if (!state) return;
      setStrains(state.strainCounts, state.strainTiers);
      setFusedSplices(state.fusedSplices);
      setGildedCells(state.gildedCells);
      setBonusFoods(state.bonusFoods);
      setInfusesCount(state.infuses.length);
      setRevive(state.revive);
    };

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
      setAwaitingResumeInput(false);
      setChoiceOptions(data.options, data.source ?? 'gene_food');
      audioManager.play('pause');
      haptics.medium();
    });

    gameRef.current.on('mutationPicked', (data: any) => {
      setHeldMutations(data.held);
      setChoiceOptions(null);
      mirrorGenomeState();
      audioManager.play('uiClick');
      armResumeAfterDecision();
    });

    gameRef.current.on('mutationDeclined', () => {
      setChoiceOptions(null);
      audioManager.play('uiClick');
      armResumeAfterDecision();
    });

    gameRef.current.on('portalChoice', (data: any) => {
      setAwaitingResumeInput(false);
      setPortalCanInfuse(data?.canInfuse === true);
      setPortalChoicePending(true);
      audioManager.play('pause');
      haptics.medium();
    });

    gameRef.current.on('infused', () => {
      setPortalChoicePending(false);
      mirrorGenomeState();
      showToast('Portal infused — body became build power', 'achievement', 2600);
    });

    gameRef.current.on('surgeChoice', () => {
      setAwaitingResumeInput(false);
      setSurgeChoicePending(true);
    });

    gameRef.current.on('surged', () => {
      setSurgeChoicePending(false);
      mirrorGenomeState();
    });

    gameRef.current.on('spliceFused', (data: any) => {
      mirrorGenomeState();
      const spliceId: unknown = data?.id;
      if (isSpliceId(spliceId)) {
        showToast(`Splice fused: ${SPLICES[spliceId].name}`, 'achievement', 3500);
      }
    });

    gameRef.current.on('expressionActivated', (data: any) => {
      mirrorGenomeState();
      if (isStrainId(data?.strain) && (data?.tier === 2 || data?.tier === 3)) {
        setExpressionFlourish({ strain: data.strain, tier: data.tier });
      }
    });

    gameRef.current.on('reviveTriggered', () => {
      mirrorGenomeState();
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
            ...(data.genome ? { genome: data.genome } : {}),
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
              ...(data.genome ? { genome: data.genome } : {}),
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

            const snakeMeta = equippedSnakeRef.current;
            if (snakeMeta) {
              setLastGenomeCard(buildGenomeCardModel(result, {
                snakeName: snakeMeta.name,
                dynasty: snakeMeta.dynasty,
                generation: snakeMeta.generation,
                score: data.score,
                foods: data.foodEaten,
              }));
            }

            if (result.codex) {
              const discoveryResult = sanitizeCodexDiscoveryResult(result.codex);
              setCodexDiscoveries(discoveryResult.discoveries);
              for (const discovery of discoveryResult.discoveries) {
                const worldFirst = discovery.worldFirst ? ' · WORLD FIRST' : '';
                const reward = discovery.rewardDna > 0
                  ? ` · +${discovery.rewardDna} DNA`
                  : '';
                showToast(
                  `Codex: ${codexEntryName(discovery.type, discovery.entryId)}${reward}${worldFirst}`,
                  'achievement',
                  5000
                );
              }
              if (discoveryResult.genomeWeaverUnlocked) {
                showToast('Genome Weaver unlocked', 'achievement', 5000);
              }
              if (
                discoveryResult.discoveries.length > 0 ||
                discoveryResult.genomeWeaverUnlocked
              ) {
                // Refresh after the recorder commits so the next run's
                // offer cards reveal newly known splice names immediately.
                void fetchCodex(currentSession.access_token);
              }
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

            // Identity discovery is persistent and player-pulled. The result
            // still exposes the PlayerCard claim action, while the global
            // notification replaces the former automatic ceremony modal.
            if (
              result.identity?.isGenerated &&
              result.validation?.extracted
            ) {
              useNotificationStore.getState().publish({
                id: 'claim-handle',
                title: 'Claim your player name',
                description: 'Your generated identity is ready to personalize whenever you want.',
                destination: 'identity',
                badgeKind: 'exclamation',
                href: '/profile',
                actionLabel: 'View player card',
              });
            }
          }
        } catch (err) {
          console.error('Failed to send game results, queueing for replay:', err);
          queueForReplay();
        }
      }

      // The first completed result is the earliest point where meta systems
      // may introduce themselves. Keep that discovery contextual here and
      // persistent elsewhere; never open Lab, contracts, or account UI.
      if (firstRunAtStartRef.current) {
        firstRunAtStartRef.current = false;
        setHasCompletedFirstRun(true);
        setShowFirstResultDiscovery(true);
        const notifications = useNotificationStore.getState();
        notifications.publish({
          id: 'lab-discovery',
          title: 'The Lab is ready',
          description: 'Discover more snakes when you feel like changing your run.',
          destination: 'lab',
          badgeKind: 'exclamation',
          href: '/lab',
          actionLabel: 'Visit the Lab',
        });
        if (currentSession?.user?.is_anonymous === true) {
          notifications.publish({
            id: 'save-progress',
            title: 'Keep your progress',
            description: 'Add an email whenever you want to play on another device.',
            destination: 'account',
            badgeKind: 'exclamation',
            href: '/#save-progress',
            actionLabel: 'Save progress',
          });
        }
      }

      endGame(data.score, data.dnaCollected, data.endReason);
      setAwaitingResumeInput(false);
      setDeathSequence(false);
      setShowDeathExplosion(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    });

    gameRef.current.on('pause', () => {
      setPaused(true);
      setQueuedDirections([]);
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

  }, [
    endGame,
    setBonusFoods,
    setChoiceOptions,
    setDeathSequence,
    setDnaCollected,
    setFusedSplices,
    setGildedCells,
    setHeldMutations,
    setInfusesCount,
    setPaused,
    setPhoenixTriggered,
    setPortalChoicePending,
    setRevive,
    setScore,
    setStrains,
    setSurgeChoicePending,
    setQueuedDirections,
    fetchCodex,
    armResumeAfterDecision,
    showToast,
  ]);

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
      setScore(state.score);
      setDnaCollected(state.dnaCollected);
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
      if (gameRef.current.getGenome()) {
        setStrains(state.strainCounts, state.strainTiers);
        setFusedSplices(state.fusedSplices);
        setGildedCells(state.gildedCells);
        setBonusFoods(state.bonusFoods);
        setInfusesCount(state.infuses.length);
        setPortalChoicePending(state.pendingPortalChoice !== null);
        setSurgeChoicePending(state.pendingSurgeChoice);
        setRevive(state.revive);
      }
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
  }, [setSnake, setFood, setScore, setDnaCollected, setDirection, setQueuedDirections, setFoodEaten, setExitTile, setExitTile2, setExtraFoods, setConstellation, setMutationTile, setFlux, setStrains, setFusedSplices, setGildedCells, setBonusFoods, setInfusesCount, setPortalChoicePending, setSurgeChoicePending, setRevive]);

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

  /**
   * Apply the server-authoritative start response to the local engine. Both
   * the voluntary pre-run button and Home's one-click handoff use this exact
   * path, so a prepared run is never charged or created a second time.
   */
  const applyStartedRun = useCallback((
    data: GameSessionStartPayload,
    mode: GameMode,
    snakeMeta: EquippedSnakeView
  ) => {
    const game = gameRef.current;
    if (!game) throw new Error('The game board is not ready');

    const dynasty = normalizeDynastyName(snakeMeta.dynasty);
    game.setRuleset(getRuleset(dynasty));
    setSelectedDynasty(dynasty);
    setGameMode(mode);

    // Sync server state to local (free starts echo energy unchanged).
    syncEnergyFromServer(data.energy, data.energyRegenAt);
    setCurrentSessionId(data.sessionId);
    gameStartTime.current = Date.now();
    freeRunRef.current = mode === 'free';
    setLastRunFree(mode === 'free');
    setHypotheticalDna(null);
    setMasteryResult(null);
    setLastGenomeCard(null);
    setCodexDiscoveries([]);
    setExpressionFlourish(null);
    setShowAbandonConfirm(false);
    setPortalChoicePending(false);
    setSurgeChoicePending(false);
    setShowFirstResultDiscovery(false);

    // Trait config comes from the server-owned equipped snake row.
    game.setTraits(sanitizeTraits(data.traits));

    // The server capability is the only Genome switch. Missing or malformed
    // capability data resets the engine cleanly to the legacy rules.
    const genomeCapability = sanitizeGenomeCapability(data.genome);
    game.setGenome(genomeCapability);
    setGenomeRun(genomeCapability !== null);
    setGenomeFtue(genomeCapability?.ftue ?? null);

    game.setMutationPool(
      Array.isArray(data.mutationPool)
        ? data.mutationPool.filter(isMutationId)
        : []
    );

    const anomalyData =
      data.anomaly && typeof data.anomaly === 'object'
        ? (data.anomaly as Record<string, unknown>)
        : null;
    const serverAnomaly =
      mode === 'anomaly' && isAnomalyId(anomalyData?.id)
        ? anomalyData.id
        : null;
    game.setAnomaly(serverAnomaly);
    setAnomalyRun(
      serverAnomaly
        ? {
            id: serverAnomaly,
            name: String(anomalyData?.name ?? serverAnomaly),
            effect: String(anomalyData?.effect ?? ''),
            endsAt: String(anomalyData?.endsAt ?? ''),
          }
        : null
    );

    const masteryData =
      data.mastery && typeof data.mastery === 'object'
        ? (data.mastery as Record<string, unknown>)
        : null;
    if (
      typeof masteryData?.dynasty === 'string' &&
      typeof masteryData.level === 'number'
    ) {
      setMasteryLevels((prev) => ({
        ...prev,
        [masteryData.dynasty as string]: masteryData.level as number,
      }));
    }

    // Reset interpolation before the opening pose, then hold the engine at
    // Ready. The input work already guarantees no tick occurs until the
    // player's accepted first direction.
    resetInterpolationBuffer(interpBufferRef.current!);
    storeStartGame();
    setAwaitingResumeInput(false);
    setReady(true);
    game.start();
    syncState();
  }, [
    setAnomalyRun,
    setGameMode,
    setGenomeRun,
    setPortalChoicePending,
    setReady,
    setSelectedDynasty,
    setSurgeChoicePending,
    storeStartGame,
    syncEnergyFromServer,
    syncState,
  ]);

  // Start game from the voluntary pre-run screen. Home/Lab handoffs bypass
  // this request because their server session already exists.
  const handleStart = useCallback(async (modeOverride?: GameMode) => {
    const mode = modeOverride ?? gameMode;
    if (!session?.access_token) {
      setStartError('Please sign in to play');
      return;
    }
    if (!equippedSnake) {
      setStartError('No snake is equipped. Return Home and Retry setup.');
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

      const firstRun = !hasCompletedFirstRun;
      firstRunAtStartRef.current = firstRun;
      setRequiresDirectionalStart(firstRun);
      setMinimalFirstRunPrompt(firstRun);
      applyStartedRun(data as GameSessionStartPayload, mode, equippedSnake);
    } catch (err) {
      console.error('Failed to start game:', err);
      setStartError('Network error. Please try again.');
    } finally {
      setIsStarting(false);
    }
  }, [
    applyStartedRun,
    energy,
    equippedSnake,
    gameMode,
    hasCompletedFirstRun,
    isStarting,
    session?.access_token,
  ]);

  // Consume Home/Lab's prepared run once. This effect is declared after the
  // engine initialization effect, so the local board exists before the
  // handoff is applied. Invalid/expired handoffs remain on this screen with a
  // recoverable Retry path; initialization failures never redirect to Lab.
  useEffect(() => {
    if (authLoading) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('launch') !== 'ftue-v2') {
      setRouteInitializing(false);
      return;
    }
    if (handoffAttemptedRef.current) return;
    if (!session?.user?.id || !gameRef.current) {
      setRouteInitializing(false);
      return;
    }

    handoffAttemptedRef.current = true;
    const handoff = consumeLaunchHandoff(session.user.id);
    params.delete('launch');
    params.delete('source');
    const cleanUrl = `${window.location.pathname}${params.size > 0 ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', cleanUrl);

    if (!handoff) {
      setStartError('The prepared run expired. Retry when you are ready.');
      setRouteInitializing(false);
      return;
    }

    const bootstrapSnake: FtueBootstrapSnake = handoff.bootstrap.equippedSnake;
    const snakeMeta: EquippedSnakeView = {
      id: bootstrapSnake.id,
      name: bootstrapSnake.name,
      generation: bootstrapSnake.generation,
      dynasty: bootstrapSnake.dynasty,
      traits: sanitizeTraits(bootstrapSnake.traits),
      lineage: sanitizeLineage(bootstrapSnake.lineage),
    };
    const firstRun = !handoff.bootstrap.onboarding.hasCompletedFirstRun;

    try {
      setEquippedSnake(snakeMeta);
      equippedSnakeRef.current = snakeMeta;
      setCollectionLoaded(true);
      setNeedsStarterSelection(false);
      setHasCompletedFirstRun(!firstRun);
      firstRunAtStartRef.current = firstRun;
      setRequiresDirectionalStart(firstRun);
      setMinimalFirstRunPrompt(firstRun);
      applyStartedRun(handoff.run, handoff.mode, snakeMeta);
    } catch (error) {
      console.error('Failed to apply prepared run:', error);
      setStartError('The board could not load the prepared run. Retry when you are ready.');
    } finally {
      setRouteInitializing(false);
    }
  }, [applyStartedRun, authLoading, session?.user?.id]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Strategic choices and destructive confirmation own the keyboard in
      // capture phase. Movement, pause, and camera shortcuts cannot leak.
      if (blockingOverlayActive) return;

      // Handle ready state - first input starts movement
      if ((isReady && !intervalRef.current) || awaitingResumeInput) {
        const dir = DIRECTION_BY_KEY[e.key];
        // FTUE's opening board requires an intentional movement direction;
        // Space remains a convenience on later ready/resume screens.
        if (dir || (e.key === ' ' && !requiresDirectionalStart)) {
          e.preventDefault();
          if (dir && gameRef.current) {
            const result = awaitingResumeInput
              ? releaseResumeGate(dir)
              : gameRef.current.setDirection(dir);
            if (!result || !directionCanRelease(result)) return;
            if (!awaitingResumeInput) {
              setRequiresDirectionalStart(false);
              setReady(false);
              startGameLoop();
            }
            syncAim();
          } else if (awaitingResumeInput) {
            releaseResumeGate();
          } else {
            setReady(false);
            startGameLoop();
          }
          return;
        }
      }

      // Handle pause toggle
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && isPlaying && !isGameOver && !isDeathSequence && !isReady) {
        e.preventDefault();
        if (HUD_COCKPIT_V1_ENABLED) {
          if (!isPaused && !pauseRearmingRef.current) {
            gameRef.current?.pause();
            setAwaitingResumeInput(true);
          }
        } else if (isPaused) {
          setAwaitingResumeInput((armed) => !armed);
        } else if (!pauseRearmingRef.current) {
          gameRef.current?.pause();
        }
        return;
      }

      // Existing direction logic (only when game is running)
      if (!isPlaying || isGameOver || isPaused || isReady) return;

      const dir = DIRECTION_BY_KEY[e.key];
      if (dir && gameRef.current) {
        e.preventDefault();
        gameRef.current.setDirection(dir);
        syncAim();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isGameOver, isPaused, isDeathSequence, isReady, blockingOverlayActive, awaitingResumeInput, releaseResumeGate, requiresDirectionalStart, startGameLoop, setReady, syncAim]);

  // Handle direction from D-Pad
  const handleDPadDirection = useCallback((dir: Direction) => {
    if (!isPlaying || isGameOver || (isPaused && !awaitingResumeInput) || !gameRef.current) return;
    if (awaitingResumeInput) {
      const result = releaseResumeGate(dir);
      if (!result || !directionCanRelease(result)) return;
    } else if (isReady) {
      const result = gameRef.current.setDirection(dir);
      if (!directionCanRelease(result)) return;
      setRequiresDirectionalStart(false);
      setReady(false);
      startGameLoop();
    } else {
      gameRef.current.setDirection(dir);
    }
    syncAim();
  }, [isPlaying, isGameOver, isPaused, isReady, awaitingResumeInput, releaseResumeGate, setReady, startGameLoop, syncAim]);

  // FlickSurface delegates its first direction here so validation, queuing,
  // and release/start happen atomically before any engine tick.
  const handleReadyDirection = useCallback((dir: Direction): SetDirectionResult => {
    if (awaitingResumeInput) {
      return releaseResumeGate(dir) ?? 'inactive';
    }
    const game = gameRef.current;
    if (!game) return 'inactive';
    const result = game.setDirection(dir);
    if (!directionCanRelease(result)) return result;
    setRequiresDirectionalStart(false);
    setReady(false);
    startGameLoop();
    return result;
  }, [awaitingResumeInput, releaseResumeGate, setReady, startGameLoop]);

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
    if (awaitingResumeInput) {
      if (!HUD_COCKPIT_V1_ENABLED) setAwaitingResumeInput(false);
      return;
    }
    if (pauseRearmingRef.current) return;
    gameRef.current?.pause();
    if (HUD_COCKPIT_V1_ENABLED) setAwaitingResumeInput(true);
  }, [awaitingResumeInput]);

  const handleResume = useCallback(() => {
    setAwaitingResumeInput(true);
  }, []);

  const handleQuit = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setShowAbandonConfirm(false);
    setAwaitingResumeInput(false);
    cancelPauseRearm();
    setCurrentSessionId(null);
    resetGame();
  }, [cancelPauseRearm, resetGame]);

  // Restart
  const handleRestart = useCallback(() => {
    resetGame();
    setCurrentSessionId(null);
    setUnlockedAchievements([]);
    setStreakInfo(null);
    setHypotheticalDna(null);
    setMasteryResult(null);
    setMinimalFirstRunPrompt(false);
    setRequiresDirectionalStart(false);
    setShowAbandonConfirm(false);
    setAwaitingResumeInput(false);
    cancelPauseRearm();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [cancelPauseRearm, resetGame]);

  // Resolve authentication and any consume-once launch handoff before a
  // second Play action can appear.
  if (authLoading || routeInitializing) {
    return (
      <div className="consent-safe-viewport w-screen h-dvh app-bg flex items-center justify-center">
        <div className="text-center space-y-4 animate-fade-up">
          <div className="animate-spin w-12 h-12 border-4 border-t-transparent border-venom-orange rounded-full mx-auto" />
          <p className="text-beige font-body">Preparing board...</p>
        </div>
      </div>
    );
  }

  // Prompt sign-in if not authenticated (anonymous auth should auto-sign in)
  if (!isAuthenticated) {
    return (
      <div className="consent-safe-viewport w-screen h-dvh app-bg flex items-center justify-center p-4">
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

  const cockpitGenomeVisible = heldMutations.length > 0 || (
    genomeRun && genomeFtue?.strainTagsUnlocked === true
  );
  const suppressedStrains = new Set(
    gameRef.current?.getGenome()?.suppressedStrains ?? []
  );
  const cockpitState: RunCockpitModel['state'] = isReady
    ? 'ready'
    : awaitingResumeInput
      ? 'held'
      : expressionFlourish?.tier === 3
        ? 'apex'
        : exitTile
          ? 'portal'
          : 'active';
  const cockpitMode: RunCockpitModel['mode'] = anomalyRun
    ? 'anomaly'
    : lastRunFree
      ? 'free'
      : 'standard';
  const cockpitStatus = minimalFirstRunPrompt && isReady
    ? 'Swipe or press an arrow to move'
    : awaitingResumeInput
      ? isMobile
        ? `Tactical hold · ${controlMode === 'flick' ? 'flick' : 'tap'} a safe direction to resume`
        : 'Tactical hold · press a safe direction to resume'
      : isReady
        ? isMobile
          ? `${controlMode === 'flick' ? 'Flick' : 'Tap'} a direction to start`
          : 'Press Space or a direction to start'
        : choiceActive
          ? 'Run held for your decision'
          : expressionFlourish
            ? `${STRAINS[expressionFlourish.strain].name} ${expressionFlourish.tier === 3 ? 'apex' : 'expression'} online`
            : exitTile
              ? 'Extraction window open'
              : 'Run stable';
  const cockpitModel: RunCockpitModel = {
    dynasty: selectedDynasty,
    state: cockpitState,
    mode: cockpitMode,
    modeLabel: anomalyRun?.name ?? (lastRunFree ? 'Free play' : selectedDynasty),
    modeDetail: awaitingResumeInput
      ? 'Tactical hold'
      : isReady
        ? 'Board held'
        : genomeRun
          ? 'Genome run'
          : 'Classic run',
    statusText: cockpitStatus,
    isFirstMovementPrompt: minimalFirstRunPrompt && isReady,
    score,
    dna: dnaCollected,
    energy,
    maxEnergy,
    bankDna: previewOutcome(true, activeAnomalyId),
    crashDna: previewOutcome(false, activeAnomalyId),
    comboMultiplier,
    chainLength,
    genes: heldMutations.slice(0, 6).map((pick) => ({
      id: pick.id,
      name: GENES[pick.id].name,
      strains: GENES[pick.id].strains,
      spent: pick.id === 'phoenix' && phoenixTriggered,
    })),
    strains: STRAIN_IDS.map((id) => ({
      id,
      name: STRAINS[id].name,
      color: STRAINS[id].color,
      points: strainCounts[id] ?? 0,
      tier: normalizeStrainTier(strainTiers[id]),
      suppressed: suppressedStrains.has(id),
    })),
    showGenome: cockpitGenomeVisible,
    portalLive: Boolean(exitTile),
    portalTicksRemaining: Math.max(0, exitTicksRemaining),
  };
  const cockpitDecisionDock: ReactNode = !HUD_COCKPIT_V1_ENABLED
    ? undefined
    : showAbandonConfirm && isPlaying && !isGameOver
      ? (
          <AbandonRunDialog
            score={score}
            dnaCollected={dnaCollected}
            costsEnergy={!lastRunFree}
            onCancel={() => setShowAbandonConfirm(false)}
            onConfirm={handleQuit}
          />
        )
      : choiceOptions && isPlaying && !isGameOver && genomeRun
        ? (
            <GeneChoiceOverlay
              options={choiceOptions}
              held={heldMutations}
              strainCounts={strainCounts}
              source={choiceSource}
              showStrains={genomeFtue?.strainTagsUnlocked === true}
              splicesUnlocked={genomeFtue?.splicesUnlocked === true}
              discoveredSplices={discoveredSplices}
              onChoose={handleChooseMutation}
              onDecline={handleDeclineMutation}
            />
          )
        : choiceOptions && isPlaying && !isGameOver
          ? (
              <MutationChoiceOverlay
                options={choiceOptions}
                onChoose={handleChooseMutation}
                onDecline={handleDeclineMutation}
              />
            )
          : portalChoicePending && isPlaying && !isGameOver
            ? (
                <PortalChoiceOverlay
                  canInfuse={portalCanInfuse}
                  infusesUsed={infusesCount}
                  snakeLength={snake.length}
                  bankDna={previewOutcome(true, activeAnomalyId)}
                  crashDna={previewOutcome(false, activeAnomalyId)}
                  onBank={() => handlePortalChoice('bank')}
                  onPass={() => handlePortalChoice('pass')}
                  onInfuse={() => handlePortalChoice('infuse')}
                />
              )
            : surgeChoicePending && isPlaying && !isGameOver
              ? (
                  <StrainSurgeOverlay
                    strains={Array.from(
                      new Set(heldMutations.flatMap((pick) => GENES[pick.id].strains))
                    )}
                    onChoose={handleSurgeChoice}
                  />
                )
              : undefined;
  const cockpitEventCallout = HUD_COCKPIT_V1_ENABLED && expressionFlourish && isPlaying
    ? (
        <ExpressionFlourish
          strain={expressionFlourish.strain}
          tier={expressionFlourish.tier}
          onDone={handleFlourishDone}
          presentation="cockpit"
        />
      )
    : undefined;

  return (
    <div
      className={`consent-safe-viewport w-screen h-dvh flex flex-col overflow-hidden app-bg ${
        HUD_COCKPIT_V1_ENABLED ? 'cockpit-game-viewport' : 'relative'
      }`}
    >
      {HUD_COCKPIT_V1_ENABLED && isPlaying ? (
        <GameEnvironment dynasty={selectedDynasty} />
      ) : (
        <>
          {/* Released environment remains the default and rollback path. */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 90% 70% at 50% 45%, ${theme.ambient} 0%, transparent 70%)`,
              opacity: 0.55,
            }}
          />
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
        </>
      )}
      {/* The released HUD remains the complete rollback path and pre-run HUD. */}
      {(!HUD_COCKPIT_V1_ENABLED || !isPlaying) && (
        <div
        data-testid="game-hud"
        className={`pointer-events-none inset-x-0 z-10 shrink-0 px-3 text-bone-white sm:px-4 ${
          isPlaying ? 'relative' : 'absolute'
        }`}
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          paddingBottom: isPlaying ? '8px' : undefined,
        }}
      >
        <div
          className={`mx-auto max-w-5xl pr-14 sm:pr-16 ${
            isPlaying ? 'game-hud-deck' : 'space-y-1.5'
          }`}
        >
          <div className="game-hud-brand flex h-6 items-center gap-2">
            <h1 className="heading-display shrink-0 text-base tracking-[0.16em] text-venom-orange text-glow-orange sm:text-xl">
              SupaSnake
            </h1>
            <div className="h-px flex-1 bg-gradient-to-r from-scale-blue-light/45 to-transparent" />
            {isPlaying && (
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-beige/45">
                Run telemetry
              </span>
            )}
          </div>

          {/* Three equal telemetry cells never reflow as values change. */}
          <div className="game-hud-telemetry grid grid-cols-3 gap-1.5 font-body">
            <div className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/80 px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_18px_rgba(0,0,0,0.2)] backdrop-blur-md">
              <span className="truncate text-[9px] uppercase tracking-wider text-beige/65 sm:text-[10px]">Score</span>
              <span className="font-mono text-sm font-bold tabular-nums text-bone-white sm:text-base">{score}</span>
            </div>
            <div className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/80 px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_18px_rgba(0,0,0,0.2)] backdrop-blur-md">
              <IconDna size={13} className="shrink-0 text-venom-orange" />
              <span className="truncate text-[9px] uppercase tracking-wider text-beige/65 sm:text-[10px]">DNA</span>
              <span className="font-mono text-sm font-bold tabular-nums text-venom-orange sm:text-base">{dnaCollected}</span>
            </div>
            <div className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/80 px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_18px_rgba(0,0,0,0.2)] backdrop-blur-md">
              <IconBolt size={13} className="shrink-0 text-venom-orange" />
              <span className="truncate text-[9px] uppercase tracking-wider text-beige/65 sm:text-[10px]">
                <span className="lg:hidden">NRG</span>
                <span className="hidden lg:inline">Energy</span>
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-venom-orange sm:text-base">{energy}/{maxEnergy}</span>
            </div>
          </div>

          {/* Stable one-line run ticker: the row exists from tick zero, so
              earning the first food never moves or resizes the board. */}
          {isPlaying && (
            <div className="game-hud-ticker flex h-7 items-center gap-1.5 overflow-hidden font-body text-[10px] sm:text-xs">
          {/* Extraction bank preview: what this run pays banked vs crashed
              (mutation-aware: Mirror Wager / Compound Interest / Phoenix
              reshape the outcome multipliers live). Subtle by default;
              pulses while the exit portal is live. */}
          {isPlaying && dnaCollected > 0 && (
            <div
              data-testid="bank-chip"
              className={`flex h-7 shrink-0 items-center gap-1 px-2 rounded-arcade border bg-void/80 backdrop-blur-md transition-colors ${
                exitTile
                  ? 'border-[#7df9ff]/80 animate-pulse'
                  : 'border-scale-blue-light/50'
              }`}
            >
              <span className="text-[#7df9ff] font-bold">
                <span className="hidden sm:inline">BANK </span>{previewOutcome(true, activeAnomalyId)}
              </span>
              <span className="text-beige/40">·</span>
              <span className="text-beige/60">
                <span className="hidden sm:inline">crash </span>{previewOutcome(false, activeAnomalyId)}
              </span>
            </div>
          )}
          {/* COSMIC constellation combo chip - visible once a chain is live */}
          {isPlaying && chainLength >= 2 && (
            <div
              data-testid="combo-chip"
              className="flex h-7 shrink-0 items-center gap-1 px-2 rounded-arcade border border-[#f0abfc]/60 bg-void/80 backdrop-blur-md"
            >
              <span className="text-[#f0abfc] font-bold">
                ×{comboMultiplier.toFixed(1)}
              </span>
              <span className="text-beige/60">chain {chainLength}</span>
            </div>
          )}
          {/* Anomaly run chip - the week's modifier, always visible while
              playing the board (§7.2) */}
          {isPlaying && anomalyRun && (
            <div
              data-testid="anomaly-run-chip"
              className="flex h-7 min-w-0 shrink items-center gap-1 px-2 rounded-arcade border border-[#7df9ff]/60 bg-void/80 backdrop-blur-md tracking-wider uppercase"
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
              className="flex h-7 shrink-0 items-center px-2 rounded-arcade border border-dashed border-beige/40 bg-void/60 backdrop-blur-md text-beige/70 tracking-wider uppercase"
            >
              Free Play
            </div>
          )}
            </div>
          )}

        {/* Held mutations strip - the run's build at a glance */}
        {isPlaying && (
          <div className="game-hud-build flex h-7 min-w-0 items-center gap-2 overflow-hidden">
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-beige/45">Build</span>
            {heldMutations.length > 0 ? (
              <MutationHUD
                held={heldMutations}
                phoenixTriggered={phoenixTriggered}
                splicesEnabled={
                  genomeRun && genomeFtue?.splicesUnlocked === true
                }
              />
            ) : (
              <span className="font-mono text-[9px] uppercase tracking-wider text-beige/30">No genes acquired</span>
            )}
          </div>
        )}
        {isPlaying && genomeRun && genomeFtue?.strainTagsUnlocked && (
          <div className="game-hud-strains min-w-0">
            <StrainMeterHUD
              counts={strainCounts}
              tiers={strainTiers}
              suppressed={gameRef.current?.getGenome()?.suppressedStrains ?? []}
            />
          </div>
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
        </div>
      )}

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
      {!HUD_COCKPIT_V1_ENABLED && isPlaying && !isGameOver && !isReady && (!isPaused || awaitingResumeInput) && !choiceActive && (
        <button
          onClick={handlePause}
          disabled={pauseRearming && !awaitingResumeInput}
          className={`absolute right-4 z-10 flex items-center justify-center w-11 h-11 rounded-arcade border bg-void/80 backdrop-blur-md transition-all text-bone-white ${
            pauseRearming && !awaitingResumeInput
              ? 'cursor-not-allowed border-scale-blue-light/30 opacity-45'
              : 'border-scale-blue-light/60 hover:border-venom-orange/70'
          }`}
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          aria-label={awaitingResumeInput ? 'Return to pause menu' : 'Pause game'}
          title={pauseRearming ? 'Pause rearming' : undefined}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        </button>
      )}

      {/* Controls Info (desktop) */}
      {!isMobile && !isPlaying && (
        <div className="absolute bottom-4 left-4 z-10 text-beige/60 text-sm font-body space-y-0.5">
          <p>Controls: Arrow Keys or WASD</p>
          <p>Pause: ESC or P</p>
          <p>Orbit: Mouse drag (snaps to sides) | Zoom: Scroll</p>
        </div>
      )}

      {/* Reset view - restores the default side-aligned camera */}
      {(!HUD_COCKPIT_V1_ENABLED || !isPlaying) && (
        <button
        onClick={() => setViewResetToken((t) => t + 1)}
        className="absolute right-4 z-10 flex items-center justify-center w-11 h-11 rounded-arcade border border-scale-blue-light/60 bg-void/70 backdrop-blur-sm hover:border-venom-orange/70 transition-all text-beige hover:text-bone-white"
        style={isPlaying
          ? { top: 'calc(env(safe-area-inset-top, 0px) + 62px)' }
          : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        title="Reset view"
        aria-label="Reset view"
      >
        <IconReset size={20} />
        </button>
      )}

      {/* Flick-anywhere touch layer (mobile default). Sits in the z-band
          between the canvas and the HUD (z-10+), so HUD buttons stay live.
          Camera touch-orbit is intentionally ceded to flick input while
          playing - the reset-view button remains available. */}
      {isMobile && controlMode === 'flick' && isPlaying && !isGameOver && (!isPaused || awaitingResumeInput) && !blockingOverlayActive && (
        <FlickSurface
          gameRef={gameRef}
          getAzimuth={getCameraAzimuth}
          isReady={isReady || awaitingResumeInput}
          onReadyDirection={handleReadyDirection}
          onAim={syncAim}
          debugRef={inputDebugRef}
        />
      )}

      {/* Virtual D-Pad (mobile fallback via control-mode toggle). bottom
          offset includes the safe-area inset so the DOWN button clears home
          indicators / browser chrome. */}
      {!HUD_COCKPIT_V1_ENABLED && isMobile && controlMode === 'dpad' && isPlaying && !isGameOver && (!isPaused || awaitingResumeInput) && !blockingOverlayActive && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <VirtualDPad
            onDirectionChange={handleDPadDirection}
            disabled={!isPlaying || isGameOver || (isPaused && !awaitingResumeInput) || blockingOverlayActive}
          />
        </div>
      )}

      {/* Input instrumentation (?debug=input only) */}
      {inputDebugEnabled && <InputDebugOverlay debugRef={inputDebugRef} />}

      {/* Pause Menu */}
      {!HUD_COCKPIT_V1_ENABLED && isPaused && !awaitingResumeInput && isPlaying && !isGameOver && (
        <PauseMenu
          dynasty={selectedDynasty}
          score={score}
          dnaCollected={dnaCollected}
          heldMutations={heldMutations}
          phoenixTriggered={phoenixTriggered}
          bankDna={previewOutcome(true, activeAnomalyId)}
          crashDna={previewOutcome(false, activeAnomalyId)}
          onResume={handleResume}
          onQuit={handleQuit}
        />
      )}

      {/* Mutation choice-of-2 (engine frozen in its choice hold - never
          concurrent with the pause menu: pause is refused during the hold) */}
      {!HUD_COCKPIT_V1_ENABLED && (choiceOptions && isPlaying && !isGameOver && genomeRun ? (
        <GeneChoiceOverlay
          options={choiceOptions}
          held={heldMutations}
          strainCounts={strainCounts}
          source={choiceSource}
          showStrains={genomeFtue?.strainTagsUnlocked === true}
          splicesUnlocked={genomeFtue?.splicesUnlocked === true}
          discoveredSplices={discoveredSplices}
          onChoose={handleChooseMutation}
          onDecline={handleDeclineMutation}
        />
      ) : choiceOptions && isPlaying && !isGameOver ? (
        <MutationChoiceOverlay
          options={choiceOptions}
          onChoose={handleChooseMutation}
          onDecline={handleDeclineMutation}
        />
      ) : null)}

      {!HUD_COCKPIT_V1_ENABLED && portalChoicePending && isPlaying && !isGameOver && (
        <PortalChoiceOverlay
          canInfuse={portalCanInfuse}
          infusesUsed={infusesCount}
          snakeLength={snake.length}
          bankDna={previewOutcome(true, activeAnomalyId)}
          crashDna={previewOutcome(false, activeAnomalyId)}
          onBank={() => handlePortalChoice('bank')}
          onPass={() => handlePortalChoice('pass')}
          onInfuse={() => handlePortalChoice('infuse')}
        />
      )}

      {!HUD_COCKPIT_V1_ENABLED && surgeChoicePending && isPlaying && !isGameOver && (
        <StrainSurgeOverlay
          strains={Array.from(
            new Set(heldMutations.flatMap((pick) => GENES[pick.id].strains))
          )}
          onChoose={handleSurgeChoice}
        />
      )}

      {!HUD_COCKPIT_V1_ENABLED && expressionFlourish && isPlaying && (
        <ExpressionFlourish
          strain={expressionFlourish.strain}
          tier={expressionFlourish.tier}
          onDone={handleFlourishDone}
        />
      )}

      {/* Game Over / Start Screen */}
      {!isPlaying && (
        <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-void-deep/85 backdrop-blur-sm p-4">
          <div
            className={`panel-elevated my-auto w-full p-8 text-center space-y-6 min-w-[320px] max-w-2xl animate-pop-in ${
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
                      Banked +{Math.round((outcomeMultipliers(heldMutations.filter((m): m is MutationPick => isMutationId(m.id)), phoenixTriggered, [], activeAnomalyId).bank - 1) * 100)}%
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
                      Crashed — salvaged {Math.round(outcomeMultipliers(heldMutations.filter((m): m is MutationPick => isMutationId(m.id)), phoenixTriggered, [], activeAnomalyId).death * 100)}%
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
                        {hypotheticalDna ?? previewOutcome(endReason === 'extracted')}
                      </span>
                    ) : endReason === 'extracted' ? (
                      <span className="font-bold text-rarity-uncommon">
                        {dnaCollected} → +{previewOutcome(true)}
                      </span>
                    ) : (
                      <span className="font-bold text-venom-orange text-glow-orange">
                        {dnaCollected} → +{previewOutcome(false)}
                      </span>
                    )}
                  </p>
                  {/* The run's build: mutations held at the end */}
                  {heldMutations.length > 0 && (
                    <div
                      className="flex flex-wrap gap-2 justify-center pt-1"
                      data-testid="gameover-mutations"
                    >
                      {heldMutations.map((pick) => (
                        <span
                          key={pick.id}
                          title={`${GENES[pick.id].effect}. Cost: ${GENES[pick.id].cost}`}
                          className="inline-flex items-center px-2.5 py-1 rounded-arcade border border-[#a855f7]/60 bg-[#a855f7]/10 text-[#c4b5fd] text-sm font-body"
                        >
                          {GENES[pick.id].name}
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

                {showFirstResultDiscovery && (
                  <div
                    className="panel-glow [--glow:#22d3ee] mx-auto max-w-lg space-y-2 px-5 py-4 text-left animate-fade-up"
                    data-testid="first-result-discovery"
                  >
                    <p className="heading-display text-xl text-[#7df9ff]">
                      {lastRunFree ? 'Your first run is complete.' : 'You earned DNA.'}
                    </p>
                    <p className="font-body text-sm text-beige/80">
                      Visit the Lab to discover more snakes, or keep playing with{' '}
                      {equippedSnake?.name ?? 'your current snake'}.
                    </p>
                    <Link
                      href="/lab"
                      className="inline-flex min-h-[44px] items-center gap-2 text-sm font-body font-bold text-venom-orange underline hover:text-venom-orange-light"
                    >
                      <IconFlask size={17} />
                      Visit the Lab
                    </Link>
                  </div>
                )}

                {lastGenomeCard && <GenomeCard model={lastGenomeCard} />}

                {codexDiscoveries.length > 0 && (
                  <div className="panel p-3 text-left" data-testid="codex-discoveries">
                    <p className="label-arcade mb-2 text-cosmic">New Codex discoveries</p>
                    <div className="flex flex-wrap gap-2">
                      {codexDiscoveries.map((discovery) => (
                        <span
                          key={`${discovery.type}:${discovery.entryId}`}
                          className="rounded-arcade border border-cosmic/50 bg-cosmic/10 px-2 py-1 text-xs font-body text-bone-white"
                        >
                          {codexEntryName(discovery.type, discovery.entryId)}
                          {discovery.worldFirst ? ' · WORLD FIRST' : ''}
                          {discovery.rewardDna > 0 ? ` · +${discovery.rewardDna} DNA` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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
                    {GAME_CONFIG.features.genome && genomeFtue?.spawnPointsUnlocked && (
                      <div
                        className="panel mx-auto max-w-lg space-y-2 p-3 text-left"
                        data-testid="build-seed"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="label-arcade text-cosmic">Build Seed</p>
                          {genomeFtue.splicesUnlocked && (
                            <Link href="/codex" className="text-xs font-body text-cosmic underline">
                              Open Codex
                            </Link>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {buildSeedStrains.length > 0 ? buildSeedStrains.map((strain) => (
                            <StrainChip
                              key={strain}
                              strain={strain}
                              points={buildSeedPoints[strain]}
                              size="md"
                            />
                          )) : (
                            <span className="text-xs font-body text-beige/55">No inherited strain affinity</span>
                          )}
                        </div>
                        {equippedSnake.traits.length > 0 && (
                          <p className="text-xs font-body text-beige/60">
                            Heirlooms: {equippedSnake.traits.map((trait) => TRAITS[trait].name).join(' · ')}
                          </p>
                        )}
                        {equippedSnake.lineage && (
                          <p className="text-xs font-body text-beige/60">
                            Lineage strength {equippedSnake.lineage.strength}
                            {equippedSnake.lineage.primary ? ` · ${equippedSnake.lineage.primary} primary` : ''}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-beige/50 font-body text-xs">
                      Exit portal banks +25% — crashing salvages 60%
                    </p>
                  </div>
                ) : noSnakeAvailable ? (
                  <p className="text-beige font-body">
                    We couldn&apos;t prepare your snake. Return Home and Retry.
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
                anomalyStrain={
                  anomalyBoard?.live ? anomalyBoard.anomaly.strainBias : null
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
                  href="/"
                  className="btn-go inline-flex items-center gap-2 px-8 py-3 text-lg min-h-[44px]"
                >
                  <IconHome size={20} />
                  Return Home to Retry
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

      {/* 3D Canvas - initial position approximates CameraRig's default
          south-side 70-degree view to avoid a first-frame jump */}
      <BoardViewportShell
        cockpitEnabled={HUD_COCKPIT_V1_ENABLED}
        isPlaying={isPlaying}
        model={cockpitModel}
        onPause={handlePause}
        onAbandon={() => setShowAbandonConfirm(true)}
        onResetView={() => setViewResetToken((token) => token + 1)}
        pauseDisabled={pauseRearming && !awaitingResumeInput}
        showPause={!isGameOver && !isReady && !isPaused && !blockingOverlayActive}
        showAbandon={awaitingResumeInput && !showAbandonConfirm}
        pauseLabel="Pause game"
        inputDock={
          isMobile && controlMode === 'dpad' && !isGameOver && (!isPaused || awaitingResumeInput) && !blockingOverlayActive ? (
            <VirtualDPad
              density="cockpit"
              onDirectionChange={handleDPadDirection}
              disabled={!isPlaying || isGameOver || (isPaused && !awaitingResumeInput) || blockingOverlayActive}
            />
          ) : undefined
        }
        decisionDock={cockpitDecisionDock}
        eventCallout={cockpitEventCallout}
      >
      {/* The rollback HUD keeps its legacy Ready/tactical-hold presentation.
          FTUE replaces Ready with one minimal movement line. */}
      {!HUD_COCKPIT_V1_ENABLED && (isReady || awaitingResumeInput) && (
        <div
          className={`absolute inset-0 z-20 flex pointer-events-none ${
            awaitingResumeInput
              ? 'items-start justify-center pt-2'
              : 'items-center justify-center'
          }`}
        >
          {awaitingResumeInput ? (
            <div
              className="mx-3 flex max-w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-arcade border border-scale-blue-light/40 bg-void-deep/82 px-3 py-2 text-center shadow-[0_0_24px_rgba(34,211,238,0.12)] backdrop-blur-md animate-fade-up sm:gap-4 sm:px-4"
              data-testid="resume-gate"
            >
              <h2 className="heading-display shrink-0 text-lg text-venom-orange text-glow-orange sm:text-xl">
                Choose Your Line
              </h2>
              <p className="max-w-60 font-mono text-[8px] leading-tight uppercase tracking-[0.14em] text-[#7df9ff] sm:text-[9px]">
                Board held · next direction resumes
              </p>
            </div>
          ) : (
            <div
              className="mx-4 rounded-arcade border border-scale-blue-light/40 bg-void-deep/75 px-6 py-5 text-center shadow-[0_0_32px_rgba(34,211,238,0.12)] backdrop-blur-md space-y-3 animate-fade-up"
              data-testid="resume-gate"
            >
              {minimalFirstRunPrompt ? (
                <p
                  className="text-bone-white text-lg font-body"
                  data-testid="first-movement-prompt"
                >
                  Swipe or press an arrow to move
                </p>
              ) : (
                <>
                  <h2 className="heading-display text-3xl text-venom-orange text-glow-orange animate-breathe sm:text-5xl">
                    Ready!
                  </h2>
                  {isMobile && controlMode === 'flick' ? (
                    <>
                      <p className="text-bone-white text-lg font-body">Flick a safe direction to start</p>
                      <p className="text-beige/60 text-sm font-body">Short flicks steer - chain them for fast turns</p>
                    </>
                  ) : isMobile ? (
                    <>
                      <p className="text-bone-white text-lg font-body">Tap a safe direction to start</p>
                      <p className="text-beige/60 text-sm font-body">Use the D-Pad to move</p>
                    </>
                  ) : (
                    <>
                      <p className="text-bone-white text-lg font-body">Press SPACE or a direction to start</p>
                      <p className="text-beige/60 text-sm font-body">Use Arrow Keys or WASD to move</p>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      <Canvas
        camera={{
          position: [boardCenter, boardCenter * 2.4, boardCenter * 1.9],
          fov: HUD_COCKPIT_V1_ENABLED ? 44 : 50
        }}
        shadows
        // Fluidity: cap devicePixelRatio - uncapped retina dpr (3x) was the
        // single largest silent GPU cost on the board
        dpr={isMobile ? [1, 1.5] : [1, 2]}
      >
        {/* Fog in the void family so the arena's far edge melts into the
            page backdrop instead of cutting out against it - lifted and
            pulled back so the board reads bright and premium */}
        <fog
          attach="fog"
          args={HUD_COCKPIT_V1_ENABLED
            ? [GAME_SCREEN_COLORS.void, 39, 72]
            : ['#0a0f14', 40, 75]}
        />
        {/* Premium base rig: cool sky/ground hemisphere carries the
            ambient read (subtle top/bottom shading instead of flat fill) */}
        <hemisphereLight
          args={HUD_COCKPIT_V1_ENABLED
            ? ['#a9c3d5', GAME_SCREEN_COLORS.graphiteDeep, 0.42]
            : ['#bcd6e8', '#0b1016', 0.5]}
        />
        <ambientLight intensity={HUD_COCKPIT_V1_ENABLED ? 0.12 : 0.18} />
        {/* Key light - the single shadow caster */}
        <directionalLight
          position={[10, 20, 10]}
          intensity={HUD_COCKPIT_V1_ENABLED ? 0.92 : 1.1}
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
          intensityScale={HUD_COCKPIT_V1_ENABLED ? 0.62 : 1}
        />

        <Suspense fallback={null}>
          <GameBoard
            dynasty={selectedDynasty}
            bufferRef={interpBufferRef}
            isMobile={isMobile}
            snake={snake}
            strainBands={snakeStrainBands}
            food={food}
            extraFoods={extraFoods}
            gildedCells={gildedCells}
            bonusFoods={bonusFoods}
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
          frameMargin={HUD_COCKPIT_V1_ENABLED ? COCKPIT_FRAME_MARGIN : 1}
          fitScale={HUD_COCKPIT_V1_ENABLED ? COCKPIT_FIT_SCALE : 1}
          defaultPolar={HUD_COCKPIT_V1_ENABLED
            ? COCKPIT_DEFAULT_POLAR
            : undefined}
          targetY={HUD_COCKPIT_V1_ENABLED ? COCKPIT_TARGET_Y : undefined}
        />

        {/* Dev-only render stats (?perf) */}
        {perfEnabled && <PerfHUD />}

        {/* Bloom postprocessing - desktop only, to protect mobile framerate.
            Threshold 0.35 keeps the lifted floor/grid out of the bloom while
            the emissive identities (snake, food core, portal beam) glow. */}
        {!isMobile && (
          <EffectComposer>
            <Bloom
              luminanceThreshold={HUD_COCKPIT_V1_ENABLED ? 0.55 : 0.35}
              luminanceSmoothing={HUD_COCKPIT_V1_ENABLED ? 0.88 : 0.9}
              intensity={HUD_COCKPIT_V1_ENABLED ? 0.58 : 0.75}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </Canvas>
      </BoardViewportShell>
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
  strainBands: readonly StrainId[];
  food: Position | null;
  extraFoods: Position[];
  gildedCells: readonly { x: number; z: number; ticks: number }[];
  bonusFoods: readonly { x: number; z: number; kind: 'molt' | 'heartwood' }[];
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
  strainBands,
  food,
  extraFoods,
  gildedCells,
  bonusFoods,
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
    for (const bonus of bonusFoods) {
      list.push({ x: bonus.x, z: bonus.z, kind: 'food' });
    }
    if (exitTile) list.push({ x: exitTile.x, z: exitTile.z, kind: 'portal' });
    if (exitTile2) list.push({ x: exitTile2.x, z: exitTile2.z, kind: 'portal' });
    if (mutationTile) {
      list.push({ x: mutationTile.x, z: mutationTile.z, kind: 'mutation' });
    }
    return list;
  }, [food, extraFoods, bonusFoods, exitTile, exitTile2, mutationTile]);

  return (
    <group position={cameraShake}>
      {/* The released arena remains byte-for-byte the default rollback. */}
      {HUD_COCKPIT_V1_ENABLED ? (
        <ArenaAssembly
          gridSize={GAME_CONFIG.board.gridSize}
          dynasty={dynasty}
          fluxPhase={fluxPhase}
          fluxTelegraph={fluxTelegraph}
        />
      ) : (
        <>
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
        </>
      )}

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

      <GenomeBoardEffects gildedCells={gildedCells} bonusFoods={bonusFoods} />

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
            strainBands={strainBands}
          />
        }
      >
        <InstancedSnake
          bufferRef={bufferRef}
          dynasty={dynasty}
          direction={direction}
          strainBands={strainBands}
        />
      </Suspense>

      {/* Food - clean voxel block; COSMIC tints the whole wave with its
          constellation glyph color (same hue = chainable) */}
      {food && (
        <FoodBeacon
          position={[food.x + 0.5, 0, food.z + 0.5]}
          color={foodColor}
          visualScale={HUD_COCKPIT_V1_ENABLED ? 1.12 : 1}
        />
      )}
      {extraFoods.map((extra) => (
        <FoodBeacon
          key={`${extra.x}-${extra.z}`}
          position={[extra.x + 0.5, 0, extra.z + 0.5]}
          color={foodColor}
          visualScale={HUD_COCKPIT_V1_ENABLED ? 1.12 : 1}
        />
      ))}

      {/* Exit portal - the champagne extraction beam (categorically
          distinct from food; urgency spin-up/flicker as the window closes) */}
      {exitTile && (
        <ExitPortal
          position={[exitTile.x + 0.5, 0, exitTile.z + 0.5]}
          ticksRemaining={exitTicksRemaining}
          isMobile={isMobile}
          visualScale={HUD_COCKPIT_V1_ENABLED ? 1.08 : 1}
        />
      )}
      {/* Twin Exits (anomaly §7.2): the pair's second doorway - same
          shared despawn window, either one banks the run */}
      {exitTile2 && (
        <ExitPortal
          position={[exitTile2.x + 0.5, 0, exitTile2.z + 0.5]}
          ticksRemaining={exitTicksRemaining}
          isMobile={isMobile}
          visualScale={HUD_COCKPIT_V1_ENABLED ? 1.08 : 1}
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
          visualScale={HUD_COCKPIT_V1_ENABLED ? 1.3 : 1}
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
