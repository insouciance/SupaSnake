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
  type CollisionDiagnostic,
  type DirectionInputTiming,
  type DirectionInputSource,
  type SetDirectionResult,
  type SnakeReplayTrace,
} from '@/lib/game/SnakeGameLogic';
import {
  applyGenomeOutcome,
  applyOutcomeWithMutations,
  getRuleset,
  normalizeDynastyName,
  outcomeMultipliers,
  rulesetExplainer,
} from '@/shared/game/rulesets';
import {
  MUTATION_PHYSICS,
  isMutationId,
  type MutationPick,
} from '@/shared/game/mutations';
import { GENES, GENOME_V2_GENES } from '@/shared/game/genes';
import { sanitizeTraits, TRAIT_STRAINS, type TraitId } from '@/shared/game/traits';
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
import { PlayerCard } from '@/components/identity/PlayerCard';
import { HandleClaimModal } from '@/components/identity/HandleClaimModal';
import type { PlayerIdentity } from '@/lib/identity/types';
import Link from 'next/link';
import { CollectEffect, DeathExplosion } from '@/components/game/Particles';
import { InstancedSnake, InstancedSnakeFallback } from '@/components/game/InstancedSnake';
import { PerfHUD } from '@/components/game/PerfHUD';
import { PauseMenu } from '@/components/game/PauseMenu';
import { AbandonRunDialog } from '@/components/game/AbandonRunDialog';
import { DynamicLights } from '@/components/game/DynamicLights';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { ArenaAssembly } from '@/components/game/arena/ArenaAssembly';
import { GameEnvironment } from '@/components/game/screen/GameEnvironment';
import { GAME_SCREEN_COLORS } from '@/components/game/screen/gameScreenTokens';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';
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
import { TerrainBlocks } from '@/components/game/TerrainBlocks';
import type { TerrainBlock } from '@/shared/game/terrain';
import { GeneChoiceOverlay } from '@/components/game/GeneChoiceOverlay';
import { StrainMeterHUD } from '@/components/game/StrainMeterHUD';
import { ExpressionFlourish } from '@/components/game/ExpressionFlourish';
import { GenomeCommitCallout } from '@/components/game/genome/GenomeCommitCallout';
import { GenomeRuntimeFeedbackCallout } from '@/components/game/genome/GenomeRuntimeFeedbackCallout';
import {
  buildGenomeV2RuntimeSignals,
  latestGenomeV2BoardFeedback,
  projectGenomeV2Board,
  type GenomeV2BoardFeedback,
  type GenomeV2BoardProjection,
} from '@/components/game/genome/genomeV2BoardPresentation';
import {
  PortalChoiceOverlay,
  StrainSurgeOverlay,
} from '@/components/game/PortalChoiceOverlay';
import { GenomeCard } from '@/components/game/GenomeCard';
import { StrainChip } from '@/components/traits/StrainChip';
import { ModeToggle } from '@/components/game/ModeToggle';
import { EnergyCommitmentSelector } from '@/components/game/EnergyCommitmentSelector';
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
import {
  enqueueReward,
  readOutbox,
  replayRewardOutbox,
} from '@/lib/outbox/rewardOutbox';
import {
  isDurablyPendingSettlement,
  parseFreePlaySettlementResult,
  type FreePlaySettlementResult,
} from '@/lib/game/settlementResponse';
import {
  isSessionEndReason,
  SETTLED_END_REASON,
} from '@/lib/session/lifecycle';
import { useCodexStore } from '@/lib/stores/codexStore';
import {
  NOTIFICATION_TARGETS,
  requestAttentionRefresh,
  useNotificationStore,
} from '@/lib/stores/notificationStore';
import {
  consumeLaunchHandoff,
  type GameSessionStartPayload,
} from '@/lib/ftue/launchFlow';
import { HUD_COCKPIT_V1_ENABLED } from '@/lib/features/cockpit';
import { RUN_FLOW_V1_ENABLED } from '@/lib/features/runFlow';
import { LADDER_ENABLED } from '@/lib/features/ladder';
import { CAREER_SPINE_V1_ENABLED } from '@/lib/features/careerSpine';
import { GENOME_V2_ENABLED } from '@/lib/features/genomeV2';
import { WORKBENCH_V1_ENABLED } from '@/lib/features/workbench';
import { genomeResearchHref } from '@/lib/game/genomeResearchLink';
import {
  DEFAULT_LADDER_RUNG,
  LADDER_RUNGS,
  ladderCadence,
  ladderRung as ladderRungDefinition,
  resolveLadderRung,
} from '@/shared/game/ladder';
import {
  baseGrowthForFood,
  resolveGrowthProfile,
} from '@/shared/game/growth';
import {
  RunRateCallout,
  speedMultiplierBand,
} from '@/components/game/RunRateCallout';
import {
  challengeRunNote,
  challengeRunRng,
  readChallengeRun,
  type ChallengeRun,
} from '@/lib/game/challengeRun';
import {
  buildLabSetupHref,
  readRunSetupDraft,
} from '@/lib/game/runSetupDraft';
import {
  RunResults,
  type RunResultsClanBattle,
} from '@/components/game/RunResults';
import { RunSetupPanel } from '@/components/game/RunSetupPanel';
import {
  favoriteSetupSnakesByDynasty,
  SnakePickerSheet,
  type SetupDynasty,
} from '@/components/game/SnakePickerSheet';
import { HeirloomSummary } from '@/components/game/HeirloomSummary';
import {
  collectDailyTake,
  parseDailyTake,
  type DailyTakeSlot,
} from '@/lib/game/dailyTake';
import { chooseNextAction } from '@/lib/game/resultsNextAction';
import type { FtueBootstrapSnake } from '@/lib/ftue/types';
import type {
  CollectionResponse,
  EquipResponse,
  FavoriteResponse,
  OwnedSnake,
} from '@/shared/types/snake-data-model';
import {
  ascendanceYieldBreakdown,
  formatYieldMultiplier,
  type AscendanceYieldBreakdown,
} from '@/shared/game/ascendance';
import {
  CURRENT_GENOME_V2_INTERACTION_VERSION,
  GENOME_V2_SPLICES,
  GENOME_V2_STRAIN_THRESHOLDS,
  projectGenomeV2Ladders,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import {
  buildGenomeV2PortalPresentation,
  buildGenomeV2OutcomePresentation,
  buildGenomeV2TacticalLoomModel,
  type GenomeV2ActivationPresentation,
} from '@/components/game/genome/genomeV2PresentationAdapter';
import {
  genomeV2RuntimeBridge,
  parseAscendanceRunPresentationStamp,
  parseGenomeV2ActivationPresentation,
  parseLegacyHeldGenes,
  parseGenomeV2State,
  buildGenomeV2OverclockPresentation,
  type AscendanceRunPresentationStamp,
  type GenomeV2OverclockSource,
} from '@/components/game/genome/genomeV2RuntimeAdapter';
import {
  buildGenomeV2YieldRecap,
  parseGenomeV2RunRecord,
} from '@/components/game/genome/genomeV2ResultsAdapter';
import type { GenomeYieldRecapModel } from '@/components/game/genome/GenomeYieldRecap';
import {
  buildGenomeV2CommitPresentation,
  type GenomeV2CommitPresentation,
} from '@/components/game/genome/genomeV2CommitPresentation';
import { buildAscendanceProgressionModel } from '@/components/progression/ascendancePresentationAdapter';
import { applyEnergyHarvestMultiplier } from '@/shared/game/energyEnvelope';
import {
  buildGenomeCardModel,
  type GenomeCardModel,
} from '@/lib/share/genomeCardImage';
import { getAimSystem, isAimSystemId, type AimSystemId } from '@/lib/game/aimSystems';
import {
  advancePendingRunImpact,
  parseImpactFromSettlement,
  recoverPendingRunImpactBounded,
  recoverRunImpact,
  type RunImpactEnvelope,
} from '@/lib/game/runImpactClient';
import {
  activatePreparedRun,
  buildTerminalReplayProof,
  classifyActiveCheckpointFailure,
  classifyActiveCheckpointReceipt,
  classifyTerminalRecoveryResponse,
  createRunStartRequestId,
  fetchActiveRun,
  LatestOnlyAsyncQueue,
  matchesContinuityAuthority,
  resumeCheckpointedRun,
  retryPreparingRunStart,
  saveActiveRunCheckpoint,
  type ActiveRunView,
} from '@/lib/game/runContinuityClient';
import { startTerminalRecoveryLoop } from '@/lib/game/terminalRecoveryLoop';
import {
  useRunContinuityWatchdog,
  type RunContinuityHeartbeat,
} from '@/hooks/useRunContinuityWatchdog';
import {
  IconBolt,
  IconDna,
  IconFlame,
  IconFlask,
  IconHome,
  IconReset,
  IconSnake,
} from '@/components/ui/icons';

function collisionDiagnosticLabel(
  diagnostic: CollisionDiagnostic | null
): string | null {
  if (!diagnostic) return null;
  const coordinate = `${diagnostic.cell.x},${diagnostic.cell.z}`;
  if (diagnostic.contact === 'border') {
    return `Recorded impact: outer border · cell ${coordinate}`;
  }
  if (diagnostic.contact === 'self') {
    return `Recorded impact: own body · cell ${coordinate}`;
  }
  const source = diagnostic.terrainSource === 'phase_gate_scar'
    ? 'Phase Gate Scar'
    : diagnostic.terrainSource === 'coilkeeper_seal'
      ? 'Coilkeeper Seal'
      : diagnostic.terrainSource === 'cyber'
        ? 'CYBER arena block'
        : diagnostic.terrainSource === 'cosmic'
          ? 'COSMIC calcification'
          : diagnostic.terrainSource === 'fortress'
            ? 'FERAL Fortress block'
            : 'solid terrain';
  return `Recorded impact: ${source} · cell ${coordinate}`;
}

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

const ACTIVE_RUN_CHECKPOINT_INTERVAL_MS = 3_000;
const ACTIVE_RUN_CONNECTION_HOLD_MS = 10_000;
const TERMINAL_CLIENT_DEADLINE_MS = 8_000;
/**
 * Recovering a stranded terminal run re-enters the server's full earning
 * settlement, which `/api/game/session` budgets `maxDuration = 300` for. The
 * 8s deadline above is a *live gameplay* latency budget — applying it to the
 * recovery fold aborted every attempt slower than a cold start, and because
 * nothing else drives that fold the run stayed locked forever.
 */
const TERMINAL_RECOVERY_DEADLINE_MS = 60_000;

function withClientDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

interface ActiveCheckpointProposal {
  sessionId: string;
  accessToken: string;
  userId: string;
  leaseToken: string;
  checkpoint: ReturnType<SnakeGameLogic['exportCheckpoint']>;
  keepalive: boolean;
}

interface EquippedSnakeView {
  id: string;
  name: string;
  generation: number;
  dynasty: string;
  traits: TraitId[];
  /** Slots the snake's rarity + generation unlock (API-derived, §6.1). */
  traitSlots?: number;
  lineage: Lineage | null;
}

function equippedViewFromOwnedSnake(snake: OwnedSnake): EquippedSnakeView {
  return {
    id: snake.id,
    name: snake.variantName ?? snake.variantId ?? 'Snake',
    generation: snake.generation,
    dynasty: (snake.dynastyName ?? 'PRIMAL').toUpperCase(),
    traits: sanitizeTraits(snake.traits),
    traitSlots: snake.traitSlots,
    lineage: sanitizeLineage(snake.lineage),
  };
}

function equippedViewFromRunManifest(
  payload: GameSessionStartPayload
): EquippedSnakeView | null {
  const snake = payload.runSnake;
  if (
    !snake ||
    typeof snake.id !== 'string' ||
    typeof snake.dynasty !== 'string' ||
    !Number.isInteger(snake.generation)
  ) {
    return null;
  }
  return {
    id: snake.id,
    name: typeof snake.name === 'string' && snake.name.length > 0
      ? snake.name
      : 'Snake',
    generation: snake.generation,
    dynasty: snake.dynasty.toUpperCase(),
    traits: sanitizeTraits(snake.traits),
    traitSlots: Number.isInteger(snake.traitSlots) ? snake.traitSlots : undefined,
    lineage: sanitizeLineage(snake.lineage),
  };
}

interface BoardViewportShellProps {
  cockpitEnabled: boolean;
  isPlaying: boolean;
  model: RunCockpitModel;
  onPause: () => void;
  onAbandon?: () => void;
  onResetView: () => void;
  onOverclock?: (source: GenomeV2OverclockSource) => void;
  pauseDisabled: boolean;
  showPause: boolean;
  showAbandon?: boolean;
  pauseLabel: string;
  decisionDock?: ReactNode;
  eventCallout?: ReactNode;
  rateCallout?: ReactNode;
  children: ReactNode;
}

function BoardViewportShell({
  cockpitEnabled,
  isPlaying,
  model,
  onPause,
  onAbandon,
  onResetView,
  onOverclock,
  pauseDisabled,
  showPause,
  showAbandon,
  pauseLabel,
  decisionDock,
  eventCallout,
  rateCallout,
  children,
}: BoardViewportShellProps) {
  if (cockpitEnabled && isPlaying) {
    return (
      <RunCockpit
        model={model}
        onPause={onPause}
        onAbandon={onAbandon}
        onResetView={onResetView}
        onOverclock={onOverclock}
        pauseDisabled={pauseDisabled}
        showPause={showPause}
        showAbandon={showAbandon}
        pauseLabel={pauseLabel}
        decisionDock={decisionDock}
        eventCallout={eventCallout}
        rateCallout={rateCallout}
      >
        {children}
      </RunCockpit>
    );
  }

  if (!isPlaying) {
    return (
      <div className="absolute inset-0" data-testid="game-board-viewport">
        {children}
      </div>
    );
  }

  // Rollback HUD parity: reserve the same camera-independent event rail even
  // when the cockpit flag is off, so a callout never moves or covers the board.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex h-10 shrink-0 items-center justify-center overflow-hidden px-3">
        {eventCallout ?? rateCallout}
      </div>
      <div className="relative min-h-0 flex-1" data-testid="game-board-viewport">
        {children}
      </div>
    </div>
  );
}

function normalizeStrainTier(value: number | undefined): StrainTier {
  if (value === 3) return 3;
  if (value === 2) return 2;
  if (value === 1) return 1;
  return 0;
}

function parseAscendanceBreakdown(
  value: unknown
): AscendanceYieldBreakdown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    !Number.isInteger(raw.generation) ||
    (raw.generation as number) < 1 ||
    !Number.isInteger(raw.baseYield) ||
    (raw.baseYield as number) < 0 ||
    typeof raw.multiplier !== 'number' ||
    !Number.isFinite(raw.multiplier) ||
    raw.multiplier < 1 ||
    !Number.isInteger(raw.bonusYield) ||
    (raw.bonusYield as number) < 0 ||
    !Number.isInteger(raw.totalYield) ||
    (raw.totalYield as number) < 0 ||
    (raw.baseYield as number) + (raw.bonusYield as number) !== raw.totalYield
  ) {
    return null;
  }
  const curveVersion = raw.curveVersion === 2 ? 2 : 1;
  const multiplierBps = Number.isSafeInteger(raw.multiplierBps)
    && (raw.multiplierBps as number) >= 10_000
    ? raw.multiplierBps as number
    : Math.round((raw.multiplier as number) * 10_000);
  return {
    generation: raw.generation as number,
    curveVersion,
    baseYield: raw.baseYield as number,
    multiplierBps,
    multiplier: raw.multiplier as number,
    bonusYield: raw.bonusYield as number,
    totalYield: raw.totalYield as number,
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function directionCanRelease(result: SetDirectionResult): boolean {
  return result === 'accepted' || result === 'duplicate';
}

export default function GamePage() {
  const { session, isAuthenticated, isAnonymous, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  /**
   * A challenge link (§11.3) arrives as `/game?seed=…&target=…`. It is read
   * from `window.location` rather than `useSearchParams` deliberately: this
   * page must not opt the whole route into the search-params Suspense
   * bailout for a feature that is off by default, and the value is needed
   * once, at mount, before the engine is constructed.
   *
   * Its only mechanical effect is the engine's rng seed. The target is
   * display-only and is never sent anywhere (see `challengeRun.ts`).
   */
  const [challengeRun] = useState<ChallengeRun | null>(() =>
    typeof window === 'undefined' ? null : readChallengeRun(window.location.search)
  );
  // Navigation-only Setup choices live in the URL while the player visits the
  // Lab. They are never run, reward, or economy authority; the session start
  // endpoint revalidates every choice when Play is pressed.
  const [setupCurrentSearch, setSetupCurrentSearch] = useState('');
  const gameRef = useRef<SnakeGameLogic | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startGameLoopRef = useRef<() => void>(() => {});
  const [particlePos, setParticlePos] = useState<[number, number, number] | null>(null);
  /**
   * The D2 ladder rung the player asked for (WP-3.12). A REQUEST only: the
   * server reads the player's records, clamps the ask to what they have
   * unlocked, stamps the result into `run_context` and echoes back what it
   * actually chose - which is what the engine then adopts.
   */
  const [ladderRung, setLadderRung] = useState<number>(DEFAULT_LADDER_RUNG);
  /**
   * The highest rung this player may attempt, from `/api/player`. Zero until
   * the profile read answers, and zero forever when migration 057 has not been
   * applied - which renders as no selector at all rather than as a selector
   * whose every option the server would refuse.
   */
  const [ladderAttemptable, setLadderAttemptable] = useState<number>(
    DEFAULT_LADDER_RUNG
  );
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
  const [showInterruptedAbandonConfirm, setShowInterruptedAbandonConfirm] = useState(false);
  const [pauseRearming, setPauseRearming] = useState(false);
  // The run's tactical-hold budget, mirrored from the engine (which owns it).
  // Two plain numbers rather than an object so the per-tick sync bails out on
  // an unchanged value instead of re-rendering the HUD every frame.
  const [holdsUsed, setHoldsUsed] = useState(0);
  const [holdsTotal, setHoldsTotal] = useState<number>(
    GAME_CONFIG.session.holds.base
  );
  // What passing the live gene offer buys, derived by the engine from the
  // offer stream. Null means the generic consequence line applies.
  const [choicePityStrain, setChoicePityStrain] = useState<StrainId | null>(null);
  const pauseRearmingRef = useRef(false);
  const pauseRearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // Setup defaults conservatively to one. The active values are copied from
  // the server's immutable session snapshot and drive previews/results.
  const [energyCommitment, setEnergyCommitment] = useState(1);
  const [activeEnergyCommitted, setActiveEnergyCommitted] = useState(0);
  const [activeEnergyMultiplierBps, setActiveEnergyMultiplierBps] = useState(10_000);
  const [clanBattleResult, setClanBattleResult] = useState<RunResultsClanBattle | null>(null);
  const [clanBattleSetup, setClanBattleSetup] = useState<{
    active: boolean;
    fifthBestToBeat: number;
  } | null>(null);
  // Every /game entry resolves whether it carries Home's consume-once run
  // before rendering a second Play action. Direct navigation resolves to the
  // existing voluntary pre-run screen; FTUE launch proceeds straight to board.
  const [routeInitializing, setRouteInitializing] = useState(true);
  const [runContinuityPhase, setRunContinuityPhase] = useState<
    'none' | 'prepared' | 'activating' | 'active'
  >('none');
  const [interruptedRun, setInterruptedRun] = useState<ActiveRunView | null>(null);
  const [settlingRecoveryState, setSettlingRecoveryState] = useState<
    'idle' | 'polling' | 'retry'
  >('idle');
  const [continuitySafetyHold, setContinuitySafetyHold] = useState<
    'connection' | 'stale' | 'integrity' | null
  >(null);
  // Nonterminal save failures never block play. Once physics has actually
  // ended, however, the board must wait for one canonical terminal receipt or
  // offer recovery from the last accepted checkpoint instead of pretending it
  // can still move.
  const [terminalRecoveryState, setTerminalRecoveryState] = useState<
    'idle' | 'submitting' | 'retrying' | 'recover'
  >('idle');
  // A simulation invariant failure is neither a death nor a connection
  // problem. Stop before a partially-mutated engine can create a phantom
  // collision, and return to the last server-accepted checkpoint instead.
  const [runEngineFault, setRunEngineFault] = useState(false);
  const [continuityHeartbeat, setContinuityHeartbeat] =
    useState<RunContinuityHeartbeat | null>(null);
  const [requiresDirectionalStart, setRequiresDirectionalStart] = useState(false);
  const [minimalFirstRunPrompt, setMinimalFirstRunPrompt] = useState(false);
  const [showFirstResultDiscovery, setShowFirstResultDiscovery] = useState(false);
  const [hasCompletedFirstRun, setHasCompletedFirstRun] = useState(false);
  // Post-run save-progress prompt for guests (never shown on the way INTO
  // a game - account nudges belong after a run, not before it)
  const [showSaveProgress, setShowSaveProgress] = useState(false);
  const [equippedSnake, setEquippedSnake] = useState<EquippedSnakeView | null>(null);
  const [collectionSnakes, setCollectionSnakes] = useState<OwnedSnake[]>([]);
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [snakePickerOpen, setSnakePickerOpen] = useState(false);
  const [favoritePickerDynasty, setFavoritePickerDynasty] = useState<SetupDynasty | null>(null);
  const [selectingSnakeId, setSelectingSnakeId] = useState<string | null>(null);
  const [snakePickerError, setSnakePickerError] = useState<string | null>(null);
  const [needsStarterSelection, setNeedsStarterSelection] = useState(false);
  const [streakInfo, setStreakInfo] = useState<{
    current: number;
    longest: number;
    graceConsumed: boolean;
  } | null>(null);
  const gameStartTime = useRef<number>(0);
  // Free Play (Design v2 §7.4): whether the CURRENT/LAST run was free.
  // Ref for the gameOver closure (registered once on mount), state for UI.
  const freeRunRef = useRef(false);
  const [lastRunFree, setLastRunFree] = useState(false);
  const [collisionDiagnostic, setCollisionDiagnostic] =
    useState<CollisionDiagnostic | null>(null);
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
  const [genomeRulesVersion, setGenomeRulesVersion] = useState<1 | 2>(1);
  const [genomeV2State, setGenomeV2State] = useState<GenomeV2State | null>(null);
  const [genomeV2SimulationTick, setGenomeV2SimulationTick] = useState(0);
  const [genomeV2BoardFeedback, setGenomeV2BoardFeedback] =
    useState<GenomeV2BoardFeedback | null>(null);
  const [genomeV2Activation, setGenomeV2Activation] =
    useState<GenomeV2ActivationPresentation | null>(null);
  const [activeAscendanceStamp, setActiveAscendanceStamp] =
    useState<AscendanceRunPresentationStamp | null>(null);
  const [portalCanInfuse, setPortalCanInfuse] = useState(false);
  const [expressionFlourish, setExpressionFlourish] = useState<{
    strain: StrainId;
    tier: 2 | 3;
  } | null>(null);
  const [genomeV2CommitCallout, setGenomeV2CommitCallout] =
    useState<GenomeV2CommitPresentation | null>(null);
  const [lastGenomeCard, setLastGenomeCard] = useState<GenomeCardModel | null>(null);
  const [codexDiscoveries, setCodexDiscoveries] = useState<CodexDiscovery[]>([]);
  const {
    ownerId: codexOwnerId,
    data: storedCodexData,
    fetchCodex,
    reset: resetCodex,
  } = useCodexStore();
  const authOwnerId = typeof session?.user?.id === 'string' && session.user.id.length > 0
    ? session.user.id
    : null;
  const codexData = authOwnerId && codexOwnerId === authOwnerId
    ? storedCodexData
    : null;

  // ---------------------------------------------------------------------
  // WP-1.06 / Constitution §5: Results state. All of it is inert with
  // RUN_FLOW_V1 off - the shipped game-over screen reads none of it.
  // ---------------------------------------------------------------------
  // Layer 1 personal-best truth comes only from the immutable server receipt.
  // The client never compares account snapshots to manufacture recognition.
  // Layer 1: the Daily Take slot. `null` until WP-1.04's settlement says
  // this was the day's first run (see lib/game/dailyTake.ts).
  const [dailyTake, setDailyTake] = useState<DailyTakeSlot | null>(null);
  const [takeState, setTakeState] = useState<
    'idle' | 'collecting' | 'collected' | 'unavailable' | 'error'
  >('idle');
  // Layer 2: the two numbers, as the server settled them.
  const [settledYield, setSettledYield] = useState<number | null>(null);
  const [settledCredited, setSettledCredited] = useState<number | null>(null);
  const [settledYieldBreakdown, setSettledYieldBreakdown] =
    useState<AscendanceYieldBreakdown | null>(null);
  const [settledGenomeRecap, setSettledGenomeRecap] =
    useState<GenomeYieldRecapModel | null>(null);
  const [runImpact, setRunImpact] = useState<RunImpactEnvelope | null>(null);
  const [settlementSecuredPending, setSettlementSecuredPending] = useState(false);
  // Results → SETUP reopens the setup page over a finished run (§5). REPLAY
  // skips it entirely.
  const [setupReopened, setSetupReopened] = useState(false);

  // Refs to hold current values for use in event handlers (avoids stale closure)
  const sessionRef = useRef(session);
  const currentSessionIdRef = useRef(currentSessionId);
  const equippedSnakeRef = useRef(equippedSnake);
  const firstRunAtStartRef = useRef(false);
  const genomeV2FeedbackRunSeedRef = useRef<string | null>(null);
  const genomeV2FeedbackEventRef = useRef<string | null>(null);
  const genomeV2RevisionRef = useRef(-1);
  const handoffAttemptedRef = useRef(false);
  const continuityCheckedRef = useRef(false);
  const continuityUserIdRef = useRef<string | null>(null);
  const startRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);
  // Exclusive server-issued run lease and checkpoint cursor. Both are
  // document-memory only: reload recovery rotates the lease from server truth.
  const runLeaseRef = useRef<string | null>(null);
  const checkpointRevisionRef = useRef(0);
  const acceptedReplayRef = useRef<SnakeReplayTrace | null>(null);
  const checkpointBarrierRef = useRef<Promise<void>>(Promise.resolve());
  const checkpointFailureSinceRef = useRef<number | null>(null);
  const continuitySafetyHoldRef = useRef(continuitySafetyHold);
  const pendingTerminalPresentationRef = useRef<Pick<
    GameOverData,
    'score' | 'dnaCollected' | 'endReason'
  > & {
    presentationReady: Promise<void>;
    userId: string | null;
    sessionId: string | null;
  } | null>(null);
  const terminalRetryInFlightRef = useRef<Promise<boolean> | null>(null);
  const checkpointWriterRef = useRef<
    (proposal: ActiveCheckpointProposal) => Promise<void>
  >(async () => undefined);
  const checkpointQueueRef = useRef<LatestOnlyAsyncQueue<ActiveCheckpointProposal> | null>(null);
  if (checkpointQueueRef.current === null) {
    checkpointQueueRef.current = new LatestOnlyAsyncQueue((proposal) =>
      checkpointWriterRef.current(proposal)
    );
  }
  // Set synchronously before activation performs any await. React state is a
  // display mirror, not a mutex: two first inputs in one event turn must share
  // exactly one prepared→active request and opening checkpoint.
  const activationPromiseRef = useRef<Promise<boolean> | null>(null);
  const deathPresentationRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
  } | null>(null);
  const continuityPhaseRef = useRef(runContinuityPhase);
  const checkpointNowRef = useRef<(
    options?: { required?: boolean; keepalive?: boolean }
  ) => Promise<void>>(() => Promise.resolve());

  // Async gameplay callbacks must see a newly rendered account/session before
  // passive effects run. Updating latest-value refs during render closes the
  // render→effect window in which an old settlement could otherwise mutate a
  // newly signed-in account or a newer run.
  sessionRef.current = session;
  currentSessionIdRef.current = currentSessionId;
  continuityPhaseRef.current = runContinuityPhase;
  continuitySafetyHoldRef.current = continuitySafetyHold;

  const recordContinuityReceipt = useCallback(() => {
    const acceptedAt = Date.now();
    setContinuityHeartbeat({ acceptedAt });
  }, []);

  // A frozen resume/decision board creates no new rollback exposure. Start a
  // fresh local safety window only when movement is deliberately released;
  // the next accepted checkpoint replaces this anchor with server time.
  const armContinuityMovementWindow = useCallback(() => {
    setContinuityHeartbeat({ acceptedAt: Date.now() });
  }, []);

  // Retry an undelivered settlement when this tab regains connectivity. The
  // queue is memory-only; a settled duplicate recovers its canonical receipt.
  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    const replay = () => {
      // A terminal board needs to consume the retry result in-place so it can
      // distinguish canonical settlement from lease loss or invalid proof.
      // The dedicated terminal recovery loop below owns that queue entry.
      if (pendingTerminalPresentationRef.current) return;
      void replayRewardOutbox(token, fetch, session?.user?.id)
        .then((result) => {
          if (!matchesContinuityAuthority(
            token,
            sessionRef.current?.access_token,
            undefined,
            undefined,
            session?.user?.id,
            sessionRef.current?.user?.id
          )) return;
          const current = result.impacts.find(
            (impact) => impact.sessionId === currentSessionIdRef.current
          );
          if (current) {
            setRunImpact(current);
            setSettledYield(current.receipt.yieldDna);
            setSettledCredited(current.receipt.dnaCredited);
          }
          if (
            currentSessionIdRef.current &&
            result.securedPendingSessionIds.includes(currentSessionIdRef.current)
          ) {
            setSettlementSecuredPending(true);
            setRunImpact(null);
            setSettledYield(null);
            setSettledCredited(null);
            setSettledYieldBreakdown(null);
            setClanBattleResult(null);
          }
          if (result.impacts.length > 0) requestAttentionRefresh();
        })
        .catch((error) => console.error('Settlement retry failed:', error));
    };
    window.addEventListener('online', replay);
    return () => window.removeEventListener('online', replay);
  }, [session?.access_token, session?.user?.id]);

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
    runCondition,
    charge,
    selectedDynasty,
    snake,
    food,
    direction,
    queuedDirections,
    extraFoods,
    constellationGlyph,
    constellationTicksRemaining,
    constellationWindowTicks,
    mutationTile,
    mutationTicksRemaining,
    heldMutations,
    choiceOptions,
    phoenixTriggered,
    torus,
    genomeRun,
    strainCounts,
    strainTiers,
    gildedCells,
    terrain,
    setTerrain,
    choiceSource,
    portalChoicePending,
    surgeChoicePending,
    infusesCount,
    revive,
    revivePhaseTicksRemaining,
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
    setRunCondition,
    setExtraFoods,
    setConstellation,
    setMutationTile,
    setHeldMutations,
    setChoiceOptions,
    setPhoenixTriggered,
    setTorus,
    setGenomeRun,
    setStrains,
    setFusedSplices,
    setGildedCells,
    setInfusesCount,
    setPortalChoicePending,
    setSurgeChoicePending,
    setRevive,
    setRevivePhaseTicks,
    setSelectedDynasty,
    aimSystem,
    setAimSystem,
    gameMode,
    setGameMode,
    resetGame,
    setPaused,
    setDeathSequence,
    setReady,
    syncChargeFromServer,
  } = useGameStore();

  const applyFreePlaySettlement = useCallback((
    result: FreePlaySettlementResult
  ): void => {
    freeRunRef.current = true;
    setLastRunFree(true);
    setSettlementSecuredPending(false);
    setRunImpact(null);
    setHypotheticalDna(result.hypotheticalDna);
    setSettledYield(result.yieldDna);
    setSettledCredited(0);
    setSettledYieldBreakdown(parseAscendanceBreakdown(result.ascendance));
    const genomeRecord = parseGenomeV2RunRecord(result.genome);
    setSettledGenomeRecap(
      genomeRecord ? buildGenomeV2YieldRecap(genomeRecord) : null
    );
    setClanBattleResult(null);
    setDailyTake(null);
    setTakeState('idle');
    if (result.playerDna !== null) {
      useCollectionStore.getState().setDnaBalance(result.playerDna);
    }
  }, []);

  const finalizeTerminalPresentation = useCallback(async (
    canonicalImpact: RunImpactEnvelope | null = null,
    canonicalFreePlay: FreePlaySettlementResult | null = null
  ): Promise<boolean> => {
    const pending = pendingTerminalPresentationRef.current;
    if (!pending) return false;
    await pending.presentationReady;
    if (
      pendingTerminalPresentationRef.current !== pending ||
      pending.userId !== (sessionRef.current?.user?.id ?? null) ||
      pending.sessionId !== currentSessionIdRef.current
    ) return false;
    pendingTerminalPresentationRef.current = null;
    setTerminalRecoveryState('idle');
    continuitySafetyHoldRef.current = null;
    setContinuitySafetyHold(null);
    setStartError(null);
    const boundImpact = canonicalImpact?.sessionId === pending.sessionId
      ? canonicalImpact
      : null;
    const boundFreePlay = canonicalFreePlay?.sessionId === pending.sessionId
      ? canonicalFreePlay
      : null;
    const canonicalEndReason = boundImpact?.outcome === 'extracted'
      ? 'extracted'
      : boundImpact?.outcome === 'crashed'
        ? 'died'
        : boundFreePlay?.outcome === 'extracted'
          ? 'extracted'
          : boundFreePlay?.outcome === 'crashed'
            ? 'died'
            : pending.endReason;
    endGame(
      boundImpact?.receipt.score ?? boundFreePlay?.score ?? pending.score,
      boundImpact?.receipt.dnaCredited ?? boundFreePlay?.dnaCredited ?? pending.dnaCollected,
      canonicalEndReason
    );
    setAwaitingResumeInput(false);
    if (canonicalEndReason === 'extracted') {
      setDeathSequence(false);
      setShowDeathExplosion(false);
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return true;
  }, [endGame, setDeathSequence]);

  const completeFirstRunDiscovery = useCallback(() => {
    if (!firstRunAtStartRef.current) return;
    firstRunAtStartRef.current = false;
    setHasCompletedFirstRun(true);
    setShowFirstResultDiscovery(true);
    if (RUN_FLOW_V1_ENABLED) return;
    const notifications = useNotificationStore.getState();
    notifications.publish({
      id: 'lab-discovery',
      title: 'The Lab is ready',
      description: 'Discover more snakes when you feel like changing your run.',
      ...NOTIFICATION_TARGETS.lab,
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
      actionLabel: 'Visit the Lab',
    });
    if (sessionRef.current?.user?.is_anonymous === true) {
      notifications.publish({
        id: 'save-progress',
        title: 'Protect your account',
        description: 'Your progress is secured. Add an email to recover this account on another device.',
        ...NOTIFICATION_TARGETS.saveProgress,
        badgeKind: 'exclamation',
        attentionReason: 'action-required',
        actionLabel: 'Add recovery',
      });
    }
  }, []);

  const setupLabHref = buildLabSetupHref({
    currentSearch: setupCurrentSearch,
    mode: gameMode,
    energyCommitment,
    ladderRung,
  });

  // Apply the URL draft only after hydration so the server and first client
  // render share one stable Setup shell. The fresh player read below then
  // clamps Energy and Ladder against current server authority.
  useEffect(() => {
    const currentSearch = window.location.search;
    setSetupCurrentSearch(currentSearch);
    const initialSetupDraft = readRunSetupDraft(window.location.search);
    if (initialSetupDraft.mode !== null) {
      setGameMode(initialSetupDraft.mode);
    }
    if (initialSetupDraft.energyCommitment !== null) {
      setEnergyCommitment(initialSetupDraft.energyCommitment);
    }
    if (initialSetupDraft.ladderRung !== null) {
      setLadderRung(initialSetupDraft.ladderRung);
    }
  }, [setGameMode]);

  // A game route may survive sign-out/sign-in without a document reload.
  // Reset the one-shot recovery gates and every in-memory run capability when
  // the account id changes; otherwise the second account inherits the first
  // account's "already checked" bit and can never discover its own run.
  useEffect(() => {
    const nextUserId = session?.user?.id ?? null;
    if (continuityUserIdRef.current === nextUserId) return;
    continuityUserIdRef.current = nextUserId;
    continuityCheckedRef.current = false;
    handoffAttemptedRef.current = false;
    activationPromiseRef.current = null;
    runLeaseRef.current = null;
    checkpointRevisionRef.current = 0;
    acceptedReplayRef.current = null;
    checkpointBarrierRef.current = Promise.resolve();
    checkpointFailureSinceRef.current = null;
    continuitySafetyHoldRef.current = null;
    pendingTerminalPresentationRef.current = null;
    terminalRetryInFlightRef.current = null;
    currentSessionIdRef.current = null;
    continuityPhaseRef.current = 'none';
    setCurrentSessionId(null);
    setInterruptedRun(null);
    setRunContinuityPhase('none');
    setContinuitySafetyHold(null);
    setTerminalRecoveryState('idle');
    setRunEngineFault(false);
    setContinuityHeartbeat(null);
    setSettlingRecoveryState('idle');
    setSettlementSecuredPending(false);
    setStartError(null);
    setIsStarting(false);
    firstRunAtStartRef.current = false;
    setHasCompletedFirstRun(false);
    setShowFirstResultDiscovery(false);
    const notifications = useNotificationStore.getState();
    notifications.clear('lab-discovery');
    notifications.clear('save-progress');
    resetGame();
    setRouteInitializing(nextUserId !== null);
  }, [resetGame, session?.user?.id]);

  // A durable 202 transfers all recovery responsibility to the server. Poll
  // only while this Results screen remains open so the recognition can appear
  // as soon as its canonical receipt exists; closing the tab loses nothing.
  useEffect(() => {
    const token = session?.access_token;
    const userId = session?.user?.id;
    const sessionId = currentSessionId;
    if (!settlementSecuredPending || !token || !userId || !sessionId) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let activeController: AbortController | null = null;
    let attempt = 0;
    const poll = async () => {
      try {
        const controller = new AbortController();
        activeController = controller;
        const requestTimeout = window.setTimeout(
          () => controller.abort(),
          TERMINAL_CLIENT_DEADLINE_MS
        );
        let recovered: RunImpactEnvelope | null;
        try {
          recovered = await advancePendingRunImpact(
            sessionId,
            token,
            fetch,
            controller.signal
          );
        } finally {
          window.clearTimeout(requestTimeout);
          if (activeController === controller) activeController = null;
        }
        if (
          cancelled ||
          !matchesContinuityAuthority(
            token,
            sessionRef.current?.access_token,
            sessionId,
            currentSessionIdRef.current,
            userId,
            sessionRef.current?.user?.id
          )
        ) return;
        if (!recovered || recovered.sessionId !== sessionId) {
          throw new Error('Run impact is still pending');
        }
        setRunImpact(recovered);
        setSettledYield(recovered.receipt.yieldDna);
        setSettledCredited(recovered.receipt.dnaCredited);
        setActiveEnergyCommitted(recovered.receipt.energyCommitted);
        setActiveEnergyMultiplierBps(recovered.receipt.commitmentMultiplierBps);
        setSettlementSecuredPending(false);
        endGame(
          recovered.receipt.score,
          recovered.receipt.dnaCredited,
          recovered.outcome === 'crashed' ? 'died' : 'extracted'
        );
        requestAttentionRefresh();
        void fetch('/api/player', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`/api/player responded ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            if (!matchesContinuityAuthority(
              token,
              sessionRef.current?.access_token,
              sessionId,
              currentSessionIdRef.current,
              userId,
              sessionRef.current?.user?.id
            )) return;
            if (typeof data.player?.dna === 'number') {
              useCollectionStore.getState().setDnaBalance(data.player.dna);
            }
          })
          .catch((error) => {
            console.error('Failed to refresh player after settlement:', error);
          });
      } catch {
        if (cancelled) return;
        attempt += 1;
        timeout = setTimeout(poll, Math.min(30_000, 2_000 * (2 ** attempt)));
      }
    };
    timeout = setTimeout(poll, 2_000);
    return () => {
      cancelled = true;
      if (timeout !== null) clearTimeout(timeout);
      activeController?.abort();
    };
  }, [
    currentSessionId,
    endGame,
    session?.access_token,
    session?.user?.id,
    settlementSecuredPending,
  ]);

  /**
   * Bank/crash preview for the HUD chip and game-over screen. Genome
   * runs price the full outcome pipeline (fused wagers, infuse deltas,
   * strain deltas, clamps) via applyGenomeOutcome; legacy runs keep the
   * mutation-era math. Display-only - the server prices the real payout.
   */
  const previewOutcome = useCallback(
    (extracted: boolean, anomaly: AnomalyId | null = null): number => {
      const priceCommittedHarvest = (runYieldBase: number): number => {
        const fullYield = ascendanceYieldBreakdown(
          runYieldBase,
          equippedSnake?.generation ?? 1
        ).totalYield;
        return applyEnergyHarvestMultiplier(
          fullYield,
          activeEnergyMultiplierBps,
          activeEnergyCommitted > 0
            ? 'charged'
            : activeEnergyMultiplierBps < 10_000
              ? 'lean'
              : 'exempt'
        );
      };
      if (genomeRun) {
        const liveState = gameRef.current?.getState();
        const capability = gameRef.current?.getGenome();
        const ftue = capability?.ftue;
        return priceCommittedHarvest(applyGenomeOutcome(
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
            pressureEvents: liveState?.pressureEvents ?? [],
            tierCap: ftue
              ? !ftue.expressionsUnlocked
                ? 1
                : !ftue.apexesUnlocked
                  ? 2
                  : 3
              : 3,
            suppressedStrains: capability?.suppressedStrains ?? [],
            splicesEnabled: ftue?.splicesUnlocked !== false,
            // THE CARRY (WP-3.10), display side. Banking spends the door the
            // player is standing on, so it prices at one fewer passed door
            // than crashing does — which is the whole tension the portal card
            // has to show. The server derives the real number from the seeded
            // schedule and never reads this; a wrong preview misleads the
            // player but cannot move a payout.
            portalsPassed: Math.max(
              0,
              (gameRef.current?.getPortalsMet() ?? 0) -
                (liveState?.infuses.length ?? 0) -
                (extracted ? 1 : 0)
            ),
            // WP-3.12: the rung read off the ENGINE, not off the selector.
            // This preview runs mid-run, and the engine holds the rung the
            // server stamped - which is the one the settlement will fold. A
            // preview priced at a rung the run is not being played at is the
            // readout-that-lies failure, and this one sits on the HUD chip.
            ladderRung: gameRef.current?.getLadderRung() ?? 0,
          },
          equippedSnake?.traits ?? [],
          anomaly
        ));
      }
      return priceCommittedHarvest(applyOutcomeWithMutations(
        dnaCollected,
        extracted,
        heldMutations.filter((m): m is MutationPick => isMutationId(m.id)),
        phoenixTriggered,
        [],
        anomaly
      ));
    },
    [
      activeEnergyCommitted,
      activeEnergyMultiplierBps,
      genomeRun,
      dnaCollected,
      heldMutations,
      revive,
      phoenixTriggered,
      equippedSnake?.generation,
      equippedSnake?.traits,
    ]
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
      // FINDING F-24 (WP-1.06): this was a bare `res.json()`. A 401 or a 500
      // returns a body that parses to something without `player`, so the
      // screen silently kept its defaults instead of reporting a failure.
      .then(res => {
        if (!res.ok) throw new Error(`/api/player responded ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.player) {
          const serverEnergy = data.energy ?? data.charge ?? null;
          syncChargeFromServer(serverEnergy);
          if (serverEnergy) {
            const available = Math.max(0, Number(serverEnergy.available ?? serverEnergy.remaining) || 0);
            setEnergyCommitment((current) =>
              current > available ? (available > 0 ? 1 : 0) : current
            );
          }
          setHasCompletedFirstRun(
            data.hasCompletedFirstRun === true ||
              Number(data.player.total_games_played ?? 0) > 0
          );
        }
        setNeedsStarterSelection(Boolean(data.needsStarterSelection));
        // Aim system: the server-stored preference. No unlock stats - all
        // four systems are settings from run 1 (Constitution §6.1).
        if (isAimSystemId(data.aimSystem)) {
          setAimSystem(data.aimSystem);
        }
        if (data.genomeFtue) {
          setGenomeFtue(sanitizeGenomeFtue(data.genomeFtue));
        }
        // WP-3.12: the ladder ceiling. `available: false` means migration 057
        // has not applied here, and the selector stays dark - the ladder is
        // never offered on a promise the server cannot keep.
        const ladderInfo = data.ladder as Record<string, unknown> | undefined;
        const attemptable = ladderInfo?.available === true
          ? resolveLadderRung(ladderInfo.attemptable)
          : DEFAULT_LADDER_RUNG;
        setLadderAttemptable(attemptable);
        setLadderRung((current) => Math.min(current, attemptable));
      })
      .catch(err => console.error('Failed to fetch player data:', err));
  }, [session?.access_token, isPlaying, syncChargeFromServer, setAimSystem]);

  // A player may leave Run Setup open across a recovery boundary. Schedule
  // from the server's two timestamps—not Date.now()—then re-read authority so
  // the selector gains the recovered unit without a reload. This timer never
  // mutates stock locally and cannot be accelerated by the device clock.
  useEffect(() => {
    const accessToken = session?.access_token;
    const available = charge?.available ?? charge?.remaining ?? 0;
    const capacity = charge?.capacity ?? charge?.perDay ?? 0;
    const nextAt = charge?.nextRecoveryAt ?? charge?.refillsAt;
    const serverNow = charge?.serverNow;
    if (isPlaying || !accessToken || !nextAt || !serverNow || available >= capacity) {
      return;
    }

    const delay = Math.max(
      250,
      new Date(nextAt).getTime() - new Date(serverNow).getTime() + 250
    );
    const timer = window.setTimeout(() => {
      void fetch('/api/player', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((response) => {
          if (!response.ok) throw new Error(`/api/player responded ${response.status}`);
          return response.json();
        })
        .then((data) => {
          const serverEnergy = data.energy ?? data.charge ?? null;
          syncChargeFromServer(serverEnergy);
          if (serverEnergy) {
            const recovered = Math.max(
              0,
              Number(serverEnergy.available ?? serverEnergy.remaining) || 0
            );
            setEnergyCommitment((current) =>
              current > recovered ? (recovered > 0 ? 1 : 0) : current
            );
          }
        })
        .catch((error) => console.error('Failed to refresh recovered Energy:', error));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    charge?.available,
    charge?.capacity,
    charge?.nextRecoveryAt,
    charge?.perDay,
    charge?.refillsAt,
    charge?.remaining,
    charge?.serverNow,
    isPlaying,
    session?.access_token,
    syncChargeFromServer,
  ]);

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

  // Automatic clan-battle context for the commitment decision. Attempt-level
  // detail is only the viewer's own; team/opponent are aggregate totals.
  useEffect(() => {
    if (!session?.access_token || isPlaying) return;
    let cancelled = false;
    fetch('/api/clan/energy-battle', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setClanBattleSetup(
          data?.active === true && data?.eligible === true
            ? {
                active: true,
                fifthBestToBeat: Number(data.you?.fifthBest ?? 0) || 0,
              }
            : null
        );
      })
      .catch((error) => {
        console.error('Failed to fetch Clan Energy Battle:', error);
        if (!cancelled) setClanBattleSetup(null);
      });
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

  /** Adopt one server collection snapshot for both setup summary and chooser. */
  const applyCollectionSnapshot = useCallback((snakes: OwnedSnake[]) => {
    setCollectionSnakes(snakes);
    const equipped = snakes.find((snake) => snake.isEquipped) ?? null;
    setEquippedSnake(equipped ? equippedViewFromOwnedSnake(equipped) : null);
    if (equipped) {
      const dynastyName = (equipped.dynastyName ?? 'PRIMAL').toUpperCase();
      if (dynastyName === 'CYBER' || dynastyName === 'PRIMAL' || dynastyName === 'COSMIC') {
        setSelectedDynasty(dynastyName as DynastyId);
      }
    }
    setCollectionLoaded(true);
  }, [setSelectedDynasty]);

  // Fetch the server-owned collection. The picker filters this snapshot to
  // active top generations; lower generations remain pedigree, never setup
  // choices.
  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;

    fetch('/api/collection', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      // FINDING F-24 (WP-1.06): unguarded `res.json()` turned a 500 into an
      // empty collection, which reads on screen as "no snake available".
      .then((response) => {
        if (!response.ok) {
          throw new Error(`/api/collection responded ${response.status}`);
        }
        return response.json() as Promise<CollectionResponse>;
      })
      .then((data) => {
        if (!cancelled) applyCollectionSnapshot(data.snakes ?? []);
      })
      .catch((error) => {
        console.error('Failed to fetch collection:', error);
        if (!cancelled) setCollectionLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [applyCollectionSnapshot, session?.access_token]);

  /**
   * Equip from Run Setup without creating or charging a run. The collection
   * endpoint is the only mutation here; `/api/game/session` remains owned by
   * the explicit Play action below.
   */
  const handleChooseSetupSnake = useCallback(async (snake: OwnedSnake) => {
    const token = session?.access_token;
    if (!token || selectingSnakeId !== null) return;
    setSnakePickerError(null);

    if (snake.id === equippedSnake?.id) {
      setSnakePickerOpen(false);
      return;
    }

    setSelectingSnakeId(snake.id);
    try {
      const response = await fetch('/api/collection/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ snakeId: snake.id }),
      });
      const data = await response.json() as EquipResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Could not equip that snake');
      }

      if (data.equippedSnake) {
        const serverSnake = data.equippedSnake;
        applyCollectionSnapshot(
          collectionSnakes.map((owned) =>
            owned.id === serverSnake.id
              ? serverSnake
              : { ...owned, isEquipped: false }
          )
        );
      } else {
        // A successful mutation with no returned row is unusual but valid;
        // re-read instead of inventing authoritative equipment client-side.
        const collectionResponse = await fetch('/api/collection', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!collectionResponse.ok) {
          throw new Error('Snake equipped, but the collection could not refresh');
        }
        const collection = await collectionResponse.json() as CollectionResponse;
        applyCollectionSnapshot(collection.snakes ?? []);
      }
      setSnakePickerOpen(false);
    } catch (error) {
      setSnakePickerError(
        error instanceof Error ? error.message : 'Could not equip that snake'
      );
    } finally {
      setSelectingSnakeId(null);
    }
  }, [
    applyCollectionSnapshot,
    collectionSnakes,
    equippedSnake?.id,
    selectingSnakeId,
    session?.access_token,
  ]);

  /**
   * Fill an empty dynasty dock through the existing server-backed favourite
   * preference, then equip that same authoritative collection row. The run is
   * still created only by Play; choosing a favourite can never spend Energy.
   */
  const handleChooseSetupFavorite = useCallback(async (snake: OwnedSnake) => {
    const token = session?.access_token;
    if (!token || selectingSnakeId !== null || favoritePickerDynasty === null) return;
    setSnakePickerError(null);
    setSelectingSnakeId(snake.id);

    const refreshCollection = async () => {
      const response = await fetch('/api/collection', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Favorite saved, but the collection could not refresh');
      }
      const collection = await response.json() as CollectionResponse;
      applyCollectionSnapshot(collection.snakes ?? []);
    };

    let favoriteSaved = false;
    try {
      const favoriteResponse = await fetch('/api/collection/favorite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ snakeId: snake.id, favorited: true }),
      });
      const favorite = await favoriteResponse.json() as FavoriteResponse;
      if (!favoriteResponse.ok || !favorite.success || favorite.favorited !== true) {
        throw new Error(favorite.error ?? 'Could not save that favorite');
      }
      favoriteSaved = true;

      if (snake.id !== equippedSnake?.id) {
        const equipResponse = await fetch('/api/collection/equip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ snakeId: snake.id }),
        });
        const equipped = await equipResponse.json() as EquipResponse;
        if (!equipResponse.ok || !equipped.success) {
          throw new Error(equipped.error ?? 'Favorite saved, but the snake could not equip');
        }
      }

      await refreshCollection();
      setFavoritePickerDynasty(null);
      setSnakePickerOpen(false);
    } catch (error) {
      // If the first mutation committed, re-read rather than hiding the saved
      // preference behind stale client state after a later request failed.
      if (favoriteSaved) {
        try {
          await refreshCollection();
        } catch (refreshError) {
          console.error('Failed to refresh collection after favorite:', refreshError);
        }
      }
      setSnakePickerError(
        error instanceof Error ? error.message : 'Could not save that favorite'
      );
    } finally {
      setSelectingSnakeId(null);
    }
  }, [
    applyCollectionSnapshot,
    equippedSnake?.id,
    favoritePickerDynasty,
    selectingSnakeId,
    session?.access_token,
  ]);

  // Discovery decorates authentic history/prestige; tactical rules remain
  // visible. Refresh between runs so newly archived Splices are recognized.
  useEffect(() => {
    if (
      !session?.access_token ||
      !authOwnerId ||
      (codexOwnerId !== null && codexOwnerId !== authOwnerId)
    ) {
      resetCodex();
    }
  }, [authOwnerId, codexOwnerId, resetCodex, session?.access_token]);

  useEffect(() => {
    if (
      !session?.access_token ||
      !authOwnerId ||
      isPlaying ||
      !genomeFtue?.splicesUnlocked
    ) return;
    void fetchCodex(authOwnerId, session.access_token);
  }, [
    authOwnerId,
    session?.access_token,
    isPlaying,
    genomeFtue?.splicesUnlocked,
    fetchCodex,
  ]);

  const holdBudget = useMemo(
    () => ({ remaining: Math.max(0, holdsTotal - holdsUsed), total: holdsTotal }),
    [holdsUsed, holdsTotal]
  );

  const discoveredSplices = useMemo<SpliceId[]>(
    () => {
      const ids: SpliceId[] = [];
      for (const splice of codexData?.splices ?? []) {
        if (splice.discovered && isSpliceId(splice.id)) ids.push(splice.id);
      }
      return ids;
    },
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
    () => {
      if (!genomeRun) return [];
      if (genomeRulesVersion === 2 && genomeV2State) {
        return Object.values(genomeV2State.instances)
          .filter((instance) => instance.status === 'active')
          .map((instance) => GENOME_V2_GENES[instance.geneId].strains[0]);
      }
      return genomeFtue?.strainTagsUnlocked
        ? heldMutations.map((pick) => GENES[pick.id].strains[0])
        : [];
    },
    [genomeFtue?.strainTagsUnlocked, genomeRulesVersion, genomeRun, genomeV2State, heldMutations]
  );

  /**
   * The whole food wave, for the spotlight rig.
   *
   * The store splits a wave into `food` (the first) and `extraFoods` (the
   * rest), and `DynamicLights` used to be handed only the first — so on
   * COSMIC, whose constellation group of 3 IS the combo mechanic, two of the
   * three glyphs were unlit. Rejoin them here rather than teaching the light
   * rig about the split.
   */
  const litFoods = useMemo(
    () => [food, ...extraFoods].filter((cell) => cell != null),
    [food, extraFoods]
  );
  const genomeV2Board = useMemo(
    () => projectGenomeV2Board(
      genomeRulesVersion === 2 ? genomeV2State : null,
      litFoods,
      genomeV2SimulationTick
    ),
    [genomeRulesVersion, genomeV2SimulationTick, genomeV2State, litFoods]
  );
  const genomeV2RuntimeSignals = useMemo(
    () => buildGenomeV2RuntimeSignals(
      genomeRulesVersion === 2 ? genomeV2State : null,
      genomeV2Board
    ),
    [genomeRulesVersion, genomeV2Board, genomeV2State]
  );

  // Reconnects baseline their restored journal silently; only events that
  // happen after this client sees the run receive a short acknowledgement.
  useEffect(() => {
    if (!genomeV2State || genomeRulesVersion !== 2) {
      genomeV2FeedbackRunSeedRef.current = null;
      genomeV2FeedbackEventRef.current = null;
      setGenomeV2BoardFeedback(null);
      return;
    }
    if (genomeV2FeedbackRunSeedRef.current !== genomeV2State.runSeed) {
      genomeV2FeedbackRunSeedRef.current = genomeV2State.runSeed;
      genomeV2FeedbackEventRef.current = genomeV2State.journal.at(-1)?.eventId ?? null;
      setGenomeV2BoardFeedback(null);
      return;
    }
    const feedback = latestGenomeV2BoardFeedback(
      genomeV2State,
      genomeV2FeedbackEventRef.current
    );
    if (!feedback) return;
    genomeV2FeedbackEventRef.current = feedback.eventId;
    setGenomeV2BoardFeedback(feedback);
  }, [genomeRulesVersion, genomeV2State]);

  const theme = themeManager.getTheme(selectedDynasty);

  /**
   * The carry's display inputs (WP-3.10).
   *
   * `getPortalsMet()` counts the door the player is standing on, so the doors
   * they have ALREADY passed is one fewer — and infuses spent doors too. The
   * portal card prices both branches from this, so an off-by-one here is a lie
   * told at the most consequential moment in the game.
   */
  const activeRuleset = getRuleset(normalizeDynastyName(selectedDynasty));
  const genomeV2Spatial = useMemo(() => ({
    bodyLength: snake.length,
    occupiedSpace: `${snake.length + terrain.length} / ${GAME_CONFIG.board.gridSize ** 2} cells`,
  }), [snake.length, terrain.length]);
  const genomeV2OfferPresentation = useMemo(() => {
    if (
      genomeRulesVersion !== 2
      || !genomeV2State?.offer
      || genomeV2State.offer.source === 'portal'
      || !genomeV2Activation
    ) {
      return null;
    }
    return buildGenomeV2TacticalLoomModel({
      state: genomeV2State,
      activation: genomeV2Activation,
      spatial: genomeV2Spatial,
      sourceLabel: `Cadence offer · ${genomeV2State.offer.openedAtFood} foods`,
    });
  }, [genomeRulesVersion, genomeV2Activation, genomeV2Spatial, genomeV2State]);
  const genomeV2PortalPresentation = useMemo(() => {
    if (
      genomeRulesVersion !== 2
      || !genomeV2State?.portal
      || !genomeV2Activation
    ) {
      return null;
    }
    const presentation = buildGenomeV2PortalPresentation({
      state: genomeV2State,
      activation: genomeV2Activation,
      spatial: genomeV2Spatial,
      sourceLabel: `Portal Genome offer · ${genomeV2State.portal.openedAtFood} foods`,
    });
    if (!activeAscendanceStamp) return presentation;
    return {
      ...presentation,
      outcomeProjection: {
        ...presentation.outcomeProjection,
        label: `${presentation.outcomeProjection.label}; stamped Ascendance ${activeAscendanceStamp.legacy ? 'v1 legacy' : 'v2'} ×${formatYieldMultiplier(activeAscendanceStamp.multiplierBps / 10_000)} and Energy ×${formatYieldMultiplier(activeEnergyMultiplierBps / 10_000)} settle server-side`,
      },
    };
  }, [
    activeAscendanceStamp,
    activeEnergyMultiplierBps,
    genomeRulesVersion,
    genomeV2Activation,
    genomeV2Spatial,
    genomeV2State,
  ]);
  const genomeV2LiveOutcome = useMemo(
    () => genomeRulesVersion === 2 && genomeV2State
      ? buildGenomeV2OutcomePresentation(genomeV2State)
      : null,
    [genomeRulesVersion, genomeV2State]
  );
  const genomeV2Overclock = useMemo(
    () => genomeRulesVersion === 2 && genomeV2State
      ? buildGenomeV2OverclockPresentation(genomeV2State)
      : null,
    [genomeRulesVersion, genomeV2State]
  );
  /**
   * The portal cadence the run is actually played under (WP-3.12): the
   * dynasty's, shifted by the ladder's "Long Walk" rung.
   *
   * The portal card quotes the interval to the NEXT door on its PASS line, and
   * quoting the unshifted one at a rung that moved the doors would be a readout
   * that lies. `ladderCadence` is the same function the engine and the
   * settlement walk, so all three agree by construction.
   */
  const activeLadderCadence = ladderCadence(activeRuleset.extraction, ladderRung);
  const portalDoorsPassed = Math.max(
    0,
    (gameRef.current?.getPortalsMet() ?? 0) - infusesCount - 1
  );

  // Dynasty ruleset follows the equipped snake. The engine is constructed
  // on mount (before the collection fetch resolves), so inject the ruleset
  // as soon as the equipped snake is known.
  useEffect(() => {
    if (equippedSnake) {
      const ruleset = getRuleset(normalizeDynastyName(equippedSnake.dynasty));
      gameRef.current?.setRuleset(ruleset);
      // The rails read this: on a torus they are drawn as barely there,
      // permanently, because that is what they are.
      setTorus(ruleset.torus === true);
    }
  }, [equippedSnake, setTorus]);

  // Under FTUE v2, no playable snake is a critical bootstrap/load failure.
  // The recovery path returns to Home Retry; it never makes Lab mandatory.
  const noSnakeAvailable = needsStarterSelection || (collectionLoaded && !equippedSnake);

  // Engine choice holds are frozen but not paused. All input surfaces and
  // the pause button stay disabled until the active decision resolves.
  const choiceActive =
    (genomeRulesVersion === 2 && Boolean(genomeV2State?.offer))
    || genomeV2OfferPresentation !== null
    || choiceOptions !== null
    || portalChoicePending
    || surgeChoicePending;
  const blockingOverlayActive =
    choiceActive ||
    showAbandonConfirm ||
    runEngineFault ||
    continuitySafetyHold === 'stale' ||
    terminalRecoveryState !== 'idle';

  // The run's world condition (§7.2, §7.3) - shapes the BANK preview and the
  // outcome copy exactly like the server recompute will. Read from the store
  // rather than from `anomalyRun`, because a Serpent or Signal run is under a
  // condition without being an anomaly-board run: deriving it from the board
  // context is what left the preview quoting x1.25 on a Twin Exits week the
  // server settles at x1.15.
  const activeAnomalyId: AnomalyId | null = runCondition;

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

  const withTickTiming = useCallback((
    timing: DirectionInputTiming
  ): DirectionInputTiming => {
    const buffer = interpBufferRef.current;
    if (!intervalRef.current || !buffer?.initialized || buffer.tickInterval <= 0) {
      return timing;
    }
    const elapsed = performance.now() - buffer.tickAt;
    return {
      ...timing,
      nextTickInMs: Math.max(0, Math.min(buffer.tickInterval, buffer.tickInterval - elapsed)),
    };
  }, []);

  const releaseResumeGate = useCallback((
    dir?: Direction,
    source: DirectionInputSource = 'standard',
    timing?: DirectionInputTiming
  ): SetDirectionResult | null => {
    const game = gameRef.current;
    if (!game || !awaitingResumeInput) return 'inactive';

    const result = dir
      ? game.resumeWithDirection(
          dir,
          source,
          timing ? withTickTiming(timing) : undefined
        )
      : null;
    if (!dir) game.resume();
    if (game.isPaused) return result;
    armContinuityMovementWindow();
    setAwaitingResumeInput(false);
    startGameLoopRef.current();
    beginPauseRearm();
    return result;
  }, [armContinuityMovementWindow, awaitingResumeInput, beginPauseRearm, withTickTiming]);

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
    // 'decision': the board is being re-armed around the run's OWN choice
    // (gene / portal / surge). Rule 1 protects those, so they never spend a
    // tactical hold - and this hold is not refusable either.
    game.pause('decision');
    setAwaitingResumeInput(true);
  }, []);

  const handlePause = useCallback(() => {
    if (awaitingResumeInput) {
      if (!HUD_COCKPIT_V1_ENABLED) setAwaitingResumeInput(false);
      return;
    }
    if (pauseRearmingRef.current) return;
    const held = gameRef.current?.pause() ?? false;
    if (HUD_COCKPIT_V1_ENABLED && held) {
      setAwaitingResumeInput(true);
      haptics.medium();
    }
  }, [awaitingResumeInput]);

  const syncGenomeV2Mirror = useCallback(() => {
    const bridge = genomeV2RuntimeBridge(gameRef.current);
    const next = bridge ? parseGenomeV2State(bridge.getState().genomeV2) : null;
    setGenomeV2State(next);
    setGenomeV2SimulationTick(gameRef.current?.getSimulationTick() ?? 0);
    return next;
  }, []);

  const revealGenomeV2Commit = useCallback((
    before: GenomeV2State | null,
    after: GenomeV2State | null
  ) => {
    if (!before || !after || !genomeV2Activation) return;
    setGenomeV2CommitCallout(
      buildGenomeV2CommitPresentation(before, after, genomeV2Activation)
    );
  }, [genomeV2Activation]);

  const handleChooseMutation = useCallback((index: 0 | 1) => {
    gameRef.current?.chooseMutation(index);
  }, []);

  const handleDeclineMutation = useCallback(() => {
    gameRef.current?.declineMutation();
  }, []);

  const handleGenomeV2OfferChoose = useCallback((
    candidateIndex: 0 | 1,
    replacementSlot?: number
  ) => {
    const offerId = genomeV2State?.offer?.offerId;
    const bridge = genomeV2RuntimeBridge(gameRef.current);
    if (!offerId || !bridge) return;
    const before = parseGenomeV2State(bridge.getState().genomeV2);
    if (bridge.resolveGenomeV2Offer({
      action: 'choose',
      offerId,
      candidateIndex,
      ...(replacementSlot !== undefined ? { replacementSlot } : {}),
    })) {
      setChoiceOptions(null);
      revealGenomeV2Commit(before, syncGenomeV2Mirror());
      audioManager.play('uiClick');
      armResumeAfterDecision();
    }
  }, [armResumeAfterDecision, genomeV2State?.offer?.offerId, revealGenomeV2Commit, setChoiceOptions, syncGenomeV2Mirror]);

  const handleGenomeV2OfferDecline = useCallback((pinCandidateIndex?: 0 | 1) => {
    const offerId = genomeV2State?.offer?.offerId;
    const bridge = genomeV2RuntimeBridge(gameRef.current);
    if (!offerId || !bridge) return;
    const before = parseGenomeV2State(bridge.getState().genomeV2);
    if (bridge.resolveGenomeV2Offer({
      action: 'decline',
      offerId,
      ...(pinCandidateIndex !== undefined ? { pinCandidateIndex } : {}),
    })) {
      setChoiceOptions(null);
      revealGenomeV2Commit(before, syncGenomeV2Mirror());
      audioManager.play('uiClick');
      armResumeAfterDecision();
    }
  }, [armResumeAfterDecision, genomeV2State?.offer?.offerId, revealGenomeV2Commit, setChoiceOptions, syncGenomeV2Mirror]);

  const handlePortalChoice = useCallback((choice: 'bank' | 'pass' | 'infuse') => {
    if (gameRef.current?.resolvePortalChoice(choice)) {
      setPortalChoicePending(false);
      audioManager.play('uiClick');
      armResumeAfterDecision();
      if (choice !== 'bank') {
        queueMicrotask(() => {
          void checkpointNowRef.current();
        });
      }
    }
  }, [armResumeAfterDecision, setPortalChoicePending]);

  const handleGenomeV2PortalBank = useCallback(() => {
    const portalId = genomeV2State?.portal?.portalId;
    const bridge = genomeV2RuntimeBridge(gameRef.current);
    if (!portalId || !bridge) return;
    if (bridge.resolveGenomeV2Portal({ action: 'bank', portalId })) {
      syncGenomeV2Mirror();
      audioManager.play('uiClick');
    }
  }, [genomeV2State?.portal?.portalId, syncGenomeV2Mirror]);

  const handleGenomeV2PortalContinue = useCallback((activateMirror = false) => {
    const portalId = genomeV2State?.portal?.portalId;
    const bridge = genomeV2RuntimeBridge(gameRef.current);
    if (!portalId || !bridge) return;
    const before = parseGenomeV2State(bridge.getState().genomeV2);
    if (bridge.resolveGenomeV2Portal({
      action: 'continue',
      portalId,
      activateMirror,
    })) {
      setPortalChoicePending(false);
      revealGenomeV2Commit(before, syncGenomeV2Mirror());
      audioManager.play('uiClick');
      armResumeAfterDecision();
      queueMicrotask(() => void checkpointNowRef.current());
    }
  }, [armResumeAfterDecision, genomeV2State?.portal?.portalId, revealGenomeV2Commit, setPortalChoicePending, syncGenomeV2Mirror]);

  const handleGenomeV2PortalMutate = useCallback((
    candidateIndex: 0 | 1,
    replacementSlot?: number
  ) => {
    const portalId = genomeV2State?.portal?.portalId;
    const bridge = genomeV2RuntimeBridge(gameRef.current);
    if (!portalId || !bridge) return;
    const before = parseGenomeV2State(bridge.getState().genomeV2);
    if (bridge.resolveGenomeV2Portal({
      action: 'mutate',
      portalId,
      candidateIndex,
      ...(replacementSlot !== undefined ? { replacementSlot } : {}),
    })) {
      setPortalChoicePending(false);
      revealGenomeV2Commit(before, syncGenomeV2Mirror());
      audioManager.play('uiClick');
      armResumeAfterDecision();
    }
  }, [armResumeAfterDecision, genomeV2State?.portal?.portalId, revealGenomeV2Commit, setPortalChoicePending, syncGenomeV2Mirror]);

  const handleGenomeV2Overclock = useCallback((source: GenomeV2OverclockSource) => {
    const bridge = genomeV2RuntimeBridge(gameRef.current);
    if (!bridge) return;
    if (bridge.activateGenomeV2Overclock({ source })) {
      syncGenomeV2Mirror();
      audioManager.play('uiClick');
      queueMicrotask(() => void checkpointNowRef.current());
    }
  }, [syncGenomeV2Mirror]);

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

  const handleGenomeV2CommitCalloutDone = useCallback(() => {
    setGenomeV2CommitCallout(null);
  }, []);

  const handleGenomeV2BoardFeedbackDone = useCallback(() => {
    setGenomeV2BoardFeedback(null);
  }, []);

  // Calculate board center for camera
  const boardCenter = GAME_CONFIG.board.gridSize / 2;

  // Initialize game logic
  useEffect(() => {
    // A challenge link seeds the engine so the visitor plays the exact board
    // the sharer played (§11.3). Without one the engine keeps its default
    // rng, which is `Math.random` — an ordinary run is still random.
    gameRef.current = new SnakeGameLogic({
      gridSize: GAME_CONFIG.board.gridSize,
      ...(challengeRun ? { rng: challengeRunRng(challengeRun) } : {}),
    });
    genomeV2RevisionRef.current = -1;

    // Events fire from inside a simulation mutation. Coalesce their checkpoint
    // capture behind the next paint: the fully resolved boundary is retained,
    // while cloning and serializing a long snake can no longer steal the frame
    // in which the player must see the eat and enter the next direction.
    let boundaryFrame: number | null = null;
    let boundaryTimer: number | null = null;
    const secureRunBoundary = () => {
      if (
        continuityPhaseRef.current !== 'active' ||
        boundaryFrame !== null ||
        boundaryTimer !== null
      ) return;
      boundaryFrame = window.requestAnimationFrame(() => {
        boundaryFrame = null;
        boundaryTimer = window.setTimeout(() => {
          boundaryTimer = null;
          if (continuityPhaseRef.current === 'active') {
            void checkpointNowRef.current();
          }
        }, 0);
      });
    };

    const mirrorGenomeState = () => {
      const state = gameRef.current?.getState();
      if (!state) return;
      setGenomeV2State(parseGenomeV2State(
        (state as typeof state & { genomeV2?: unknown }).genomeV2
      ));
      setGenomeV2SimulationTick(gameRef.current?.getSimulationTick() ?? 0);
      setStrains(state.strainCounts, state.strainTiers);
      setFusedSplices(state.fusedSplices);
      setGildedCells(state.gildedCells);
      setInfusesCount(state.infuses.length);
      setRevive(state.revive);
      setRevivePhaseTicks(state.revivePhaseTicksRemaining);
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
      // Food is routine simulation, covered by the <=3 s cadence. Exporting a
      // full checkpoint after every meal competes with the next steering frame
      // in exactly the dense/high-speed states where input latency is lethal.
      // Decisions, pause/resume, lifecycle exits, and terminalization retain
      // their explicit priority boundaries below.
    });

    gameRef.current.on('deathSequence', (data: any) => {
      let resolvePresentation: () => void = () => {};
      const promise = new Promise<void>((resolve) => {
        resolvePresentation = resolve;
      });
      deathPresentationRef.current = {
        promise,
        resolve: resolvePresentation,
      };
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

    gameRef.current.on('deathSequenceComplete', () => {
      // Presentation-only timer. The engine already emitted the terminal
      // gameOver event synchronously at collision so settlement cannot be
      // escaped by refreshing during this flourish.
      setDeathSequence(false);
      setShowDeathExplosion(false);
      deathPresentationRef.current?.resolve();
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
      const liveState = gameRef.current?.getState();
      const liveGenomeV2 = parseGenomeV2State(
        (liveState as (typeof liveState & { genomeV2?: unknown }) | undefined)?.genomeV2
      );
      setGenomeV2State(liveGenomeV2);
      if (liveGenomeV2?.offer) {
        setChoiceOptions(null);
      } else {
        setChoiceOptions(data.options, data.source ?? 'gene_food');
      }
      // Alongside the options, not on the next tick: the overlay must never
      // render its consequence line from a stale forecast.
      setChoicePityStrain(gameRef.current?.getState().pendingChoicePity ?? null);
      audioManager.play('pause');
      haptics.medium();
      secureRunBoundary();
    });

    gameRef.current.on('mutationPicked', (data: any) => {
      const legacyHeld = parseLegacyHeldGenes(data?.held);
      if (legacyHeld) setHeldMutations(legacyHeld);
      setChoiceOptions(null);
      mirrorGenomeState();
      audioManager.play('uiClick');
      armResumeAfterDecision();
      secureRunBoundary();
    });

    gameRef.current.on('mutationDeclined', () => {
      setChoiceOptions(null);
      audioManager.play('uiClick');
      armResumeAfterDecision();
      secureRunBoundary();
    });

    gameRef.current.on('portalChoice', (data: any) => {
      setAwaitingResumeInput(false);
      const liveState = gameRef.current?.getState();
      setGenomeV2State(parseGenomeV2State(
        (liveState as (typeof liveState & { genomeV2?: unknown }) | undefined)?.genomeV2
      ));
      setPortalCanInfuse(data?.canInfuse === true);
      setPortalChoicePending(true);
      audioManager.play('pause');
      haptics.medium();
      secureRunBoundary();
    });

    gameRef.current.on('infused', () => {
      setPortalChoicePending(false);
      mirrorGenomeState();
      showToast('Portal infused — body became build power', 'triumph', 2600);
      secureRunBoundary();
    });

    gameRef.current.on('surgeChoice', () => {
      setAwaitingResumeInput(false);
      setSurgeChoicePending(true);
      secureRunBoundary();
    });

    gameRef.current.on('surged', () => {
      setSurgeChoicePending(false);
      mirrorGenomeState();
      secureRunBoundary();
    });

    gameRef.current.on('spliceFused', (data: any) => {
      mirrorGenomeState();
      const spliceId: unknown = data?.id;
      if (isSpliceId(spliceId)) {
        showToast(`Splice fused: ${SPLICES[spliceId].name}`, 'triumph', 3500);
      }
    });

    gameRef.current.on('expressionActivated', (data: any) => {
      mirrorGenomeState();
      if (isStrainId(data?.strain) && (data?.tier === 2 || data?.tier === 3)) {
        setExpressionFlourish({ strain: data.strain, tier: data.tier });
      }
    });

    gameRef.current.on('reviveTriggered', (data: any) => {
      mirrorGenomeState();
      if (data?.kind && data.kind !== 'phoenix') {
        const name =
          data.kind === 'second_sun'
            ? 'Second Sun'
            : data.kind === 'styx'
              ? 'Styx Contract'
              : 'Molted Rebirth';
        showToast(
          `${name} — body + edge phase for ${MUTATION_PHYSICS.revivePhaseTicks} moves`,
          'triumph',
          3200
        );
      }
    });

    gameRef.current.on('phoenixTriggered', () => {
      // The one death that wasn't: death drama feedback, but the run lives
      setPhoenixTriggered(true);
      audioManager.play('death');
      haptics.death();
      screenShake.heavy();
      showToast(
        `Phoenix — body + edge phase for ${MUTATION_PHYSICS.revivePhaseTicks} moves`,
        'triumph',
        3200
      );
    });

    // COSMIC: the constellation window closed and its survivors calcified.
    // The blocks themselves are drawn by TerrainBlocks; this is the moment
    // of it, which is otherwise silent - and the moment is the feedback.
    gameRef.current.on('constellationCalcified', () => {
      audioManager.play('uiClick');
    });

    gameRef.current.on('gameOver', async (rawData: unknown) => {
      const data = rawData as GameOverData;
      setTerminalRecoveryState('submitting');
      // A prior nonblocking save warning is no longer the relevant state once
      // physics has ended. Preserve only a proven newer-lease conflict.
      if (continuitySafetyHoldRef.current !== 'stale') {
        continuitySafetyHoldRef.current = null;
        setContinuitySafetyHold(null);
      }
      setCollisionDiagnostic(data.collisionDiagnostic ?? null);
      // Freeze the cumulative play clock at the terminal simulation boundary.
      // Awaiting an in-flight checkpoint or settlement request must not turn
      // network time into run time. Resumes backdate this ref only by the last
      // accepted active elapsed value, so offline time is absent as well.
      const terminalActiveElapsedMs = Math.max(
        0,
        Math.floor(Date.now() - gameStartTime.current)
      );
      // The terminal tick is final locally. Cancel the interval immediately;
      // any checkpoint already queued is allowed to finish below, but no new
      // simulation boundary can be scheduled behind terminalization.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const presentationReady = data.endReason === 'died'
        ? deathPresentationRef.current?.promise ?? Promise.resolve()
        : Promise.resolve();
      const currentSession = sessionRef.current;
      const sessionId = currentSessionIdRef.current;
      pendingTerminalPresentationRef.current = {
        score: data.score,
        dnaCollected: data.dnaCollected,
        endReason: data.endReason,
        presentationReady,
        userId: currentSession?.user?.id ?? null,
        sessionId,
      };
      // Send results to server first (use refs to avoid stale closure)
      const settlementUserId = currentSession?.user?.id;
      const terminalNeedsServerAuthority =
        continuityPhaseRef.current === 'active' || !freeRunRef.current;
      const hasSettlementCapability = Boolean(
        currentSession?.access_token && settlementUserId && sessionId
      );
      const settlementAuthorityCurrent = () =>
        !currentSession?.access_token || !settlementUserId || !sessionId
          ? !terminalNeedsServerAuthority
          : matchesContinuityAuthority(
              currentSession.access_token,
              sessionRef.current?.access_token,
              sessionId,
              currentSessionIdRef.current,
              settlementUserId,
              sessionRef.current?.user?.id
            );
      if (terminalNeedsServerAuthority && !hasSettlementCapability) {
        setTerminalRecoveryState('recover');
        setStartError(
          'The run ended without a complete settlement capability. Reload the server-secured run; no local result will replace it.'
        );
        return;
      }
      let acknowledgedImpact: RunImpactEnvelope | null = null;
      let acknowledgedFreePlay: FreePlaySettlementResult | null = null;
      if (currentSession?.access_token && sessionId) {
        // Serialize terminal proof construction behind every checkpoint that
        // was already captured. The accepted revision/prefix read below is
        // therefore the exact database base, not a stale render-time cursor.
        try {
          await withClientDeadline(
            checkpointBarrierRef.current,
            TERMINAL_CLIENT_DEADLINE_MS,
            'Checkpoint barrier timed out before terminalization'
          );
        } catch (error) {
          // The server terminal path can safely rebase an overlapping proof if
          // the checkpoint committed after its response was lost. Never let a
          // hung browser fetch pin the already-finished board forever.
          console.error('Terminal checkpoint barrier deferred:', error);
        }
        if (!settlementAuthorityCurrent()) return;
        const leaseToken = runLeaseRef.current;
        const expectedRevision = checkpointRevisionRef.current;
        const acceptedReplay = acceptedReplayRef.current;
        const terminalTrace = gameRef.current?.getReplayTrace() ?? null;
        const terminalReplay = acceptedReplay && terminalTrace
          ? buildTerminalReplayProof(
              acceptedReplay,
              terminalTrace,
              terminalActiveElapsedMs
            )
          : null;
        const requiresReplayTerminal = continuityPhaseRef.current === 'active';
        const replayTerminal =
          requiresReplayTerminal &&
          leaseToken !== null &&
          expectedRevision >= 1 &&
          terminalReplay !== null;
        const requiresTerminalAcknowledgement = terminalNeedsServerAuthority;
        let terminalAcknowledged = !requiresTerminalAcknowledgement;
        if (requiresReplayTerminal && !replayTerminal) {
          setTerminalRecoveryState('recover');
          setStartError(
            continuitySafetyHoldRef.current === 'stale'
              ? 'This run continued in another window. Load the secured version.'
              : 'The outcome proof could not be verified. Load the last secured position.'
          );
          return;
        }
        const gameDuration = Math.floor(terminalActiveElapsedMs / 1000);
        // Identity v1 section 9.5: the run's compact event stream + how
        // it ended. Display/Analyst input only - the server stores it
        // separately from the payout path and validates every bound.
        const runEventRecord = gameRef.current?.getRunEvents() ?? null;
        let terminalNeedsRecovery = false;
        // If the settlement POST cannot be delivered, keep a tab-memory retry
        // while this runtime survives. No progress payload is written to
        // browser storage. Durable recovery begins once the server accepts
        // and freezes this result; an undelivered client claim is not yet an
        // earned settlement and cannot be reconstructed authoritatively.
        // Phase 2 payload fields shared by the live POST and retry queue.
        const queueForReplay = () => {
          // Free runs pay nothing - there is no reward to protect, so a
          // failed free end is never queued for replay
          if (freeRunRef.current && !replayTerminal) return;
          enqueueReward({
            ownerId: currentSession.user.id,
            sessionId,
            score: data.score,
            dna_earned: data.dnaCollected,
            duration_seconds: gameDuration,
            food_count: data.foodEaten,
            extracted: data.extracted,
            freePlay: freeRunRef.current,
            ...(data.mutations.length > 0 ? { mutations: data.mutations } : {}),
            ...(data.phoenixTriggeredAtFood !== null
              ? { phoenix_triggered_at_food: data.phoenixTriggeredAtFood }
              : {}),
            ...(data.genome ? { genome: data.genome } : {}),
            ...(leaseToken ? { leaseToken } : {}),
            ...(replayTerminal && terminalReplay
              ? { replay: terminalReplay, expectedRevision }
              : {}),
            timestamp: Date.now(),
          });
        };
        try {
          const settlementController = new AbortController();
          const settlementTimeout = window.setTimeout(
            () => settlementController.abort(),
            8_000
          );
          let response: Response;
          let responseBody: unknown = null;
          try {
            const requestPayload = replayTerminal && terminalReplay
              ? {
                  action: 'terminal',
                  sessionId,
                  replay: terminalReplay,
                  expectedRevision,
                  leaseToken,
                }
              : {
                  action: 'end',
                  sessionId,
                  score: data.score,
                  dna_earned: data.dnaCollected,
                  duration_seconds: gameDuration,
                  food_count: data.foodEaten,
                  extracted: data.extracted,
                  died: !data.extracted,
                  victory: false,
                  mutations: data.mutations,
                  ...(data.phoenixTriggeredAtFood !== null
                    ? { phoenix_triggered_at_food: data.phoenixTriggeredAtFood }
                    : {}),
                  ...(data.genome ? { genome: data.genome } : {}),
                  ...(data.deathCause ? { death_cause: data.deathCause } : {}),
                  ...(runEventRecord && runEventRecord.events.length > 0
                    ? { run_events: runEventRecord }
                    : {}),
                  ...(leaseToken ? { leaseToken } : {}),
                };
            response = await fetch('/api/game/session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`,
              },
              // keepalive lets the browser finish this request even if the
              // tab is closed immediately after death
              keepalive: true,
              signal: settlementController.signal,
              body: JSON.stringify(requestPayload),
            });
            // Keep the same deadline armed while the body is read. Fetch may
            // resolve after headers while a broken proxy stalls JSON forever.
            responseBody = await response.json().catch(() => null);
          } finally {
            window.clearTimeout(settlementTimeout);
          }
          if (!settlementAuthorityCurrent()) return;

          if (!response.ok) {
            if (response.status === 409) {
              // A delivered settlement whose response was lost is not allowed
              // to lose its recognition. New servers return `impact` on the
              // duplicate itself; recovery covers older/empty 409 bodies.
              const duplicateBody = responseBody;
              if (!settlementAuthorityCurrent()) return;
              const duplicateRecord =
                duplicateBody && typeof duplicateBody === 'object'
                  ? duplicateBody as Record<string, unknown>
                  : {};
              const duplicateFreePlay = parseFreePlaySettlementResult(
                duplicateBody,
                sessionId
              );
              const duplicateDisposition = classifyTerminalRecoveryResponse(
                response.status,
                duplicateBody,
                sessionId,
                freeRunRef.current
              );
              if (duplicateRecord.reason === 'lease_conflict') {
                // Another tab explicitly resumed this run and now owns its
                // terminal authority. This stale simulation cannot settle or
                // overwrite it; route the player back to the accepted server
                // checkpoint instead of pretending this death counted.
                runLeaseRef.current = null;
                checkpointRevisionRef.current = 0;
                const secured = await withClientDeadline(
                  fetchActiveRun(currentSession.access_token),
                  TERMINAL_CLIENT_DEADLINE_MS,
                  'Secured-run lookup timed out'
                ).catch(() => null);
                if (!settlementAuthorityCurrent()) return;
                if (secured) {
                  setInterruptedRun(secured);
                  setRunContinuityPhase(
                    secured.phase === 'active' ? 'active' : 'none'
                  );
                }
                terminalNeedsRecovery = true;
                setStartError('This run continued in another window. Resume the secured version here.');
              } else if (
                duplicateRecord.alreadyEnded === true &&
                duplicateRecord.sessionId === sessionId &&
                isSessionEndReason(duplicateRecord.endReason) &&
                duplicateRecord.endReason !== SETTLED_END_REASON
              ) {
                // The server conclusively closed this lifecycle without a
                // payout. Retrying the local ending can never change that;
                // recover server truth instead of spinning forever.
                terminalNeedsRecovery = true;
                setStartError(
                  'This local ending was superseded by the server-secured run lifecycle. Load the verified state.'
                );
              } else {
                const duplicateImpact = parseImpactFromSettlement(duplicateBody);
                const recoveredCandidate =
                  (duplicateImpact?.sessionId === sessionId
                    ? duplicateImpact
                    : null) ?? await withClientDeadline(
                    recoverRunImpact(
                      sessionId,
                      currentSession.access_token
                    ),
                    TERMINAL_CLIENT_DEADLINE_MS,
                    'Run-impact recovery timed out'
                  ).catch((error) => {
                    console.error('Failed to recover settled run impact:', error);
                    return null;
                  });
                const recovered = recoveredCandidate?.sessionId === sessionId
                  ? recoveredCandidate
                  : null;
                if (!settlementAuthorityCurrent()) return;
                if (recovered) {
                  acknowledgedImpact = recovered;
                  setRunImpact(recovered);
                  setSettledYield(recovered.receipt.yieldDna);
                  setSettledCredited(recovered.receipt.dnaCredited);
                  setActiveEnergyCommitted(recovered.receipt.energyCommitted);
                  setActiveEnergyMultiplierBps(
                    recovered.receipt.commitmentMultiplierBps
                  );
                  requestAttentionRefresh();
                }
                if (duplicateFreePlay) {
                  acknowledgedFreePlay = duplicateFreePlay;
                  applyFreePlaySettlement(duplicateFreePlay);
                }
                const completedThisSession =
                  duplicateDisposition === 'completed' &&
                  duplicateRecord.sessionId === sessionId &&
                  (!freeRunRef.current || duplicateFreePlay !== null);
                if (completedThisSession || recovered) {
                  if (
                    completedThisSession &&
                    !recovered &&
                    !freeRunRef.current
                  ) {
                    setSettlementSecuredPending(true);
                    setRunImpact(null);
                    setSettledYield(null);
                    setSettledCredited(null);
                    setSettledYieldBreakdown(null);
                    setSettledGenomeRecap(null);
                    setClanBattleResult(null);
                  }
                  runLeaseRef.current = null;
                  checkpointRevisionRef.current = 0;
                  terminalAcknowledged = true;
                } else {
                  // No canonical terminal acknowledgement exists. Retain the
                  // proof in tab memory and keep Results closed. A generic
                  // 409, including an abandoned run observed by a stale tab,
                  // is not an idempotent settlement receipt.
                  queueForReplay();
                }
              }
            } else {
              console.error(`Game end rejected (status ${response.status}), queueing for replay`);
              queueForReplay();
            }
          } else {
            if (!settlementAuthorityCurrent()) return;
            const resultRecord = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
              ? responseBody as Record<string, unknown>
              : null;
            const responseSessionMatches = resultRecord?.sessionId === sessionId;
            const durablePending =
              response.status === 202 &&
              responseSessionMatches &&
              isDurablyPendingSettlement(resultRecord);
            const parsedImpact = parseImpactFromSettlement(resultRecord);
            const impactEnvelope = parsedImpact?.sessionId === sessionId
              ? parsedImpact
              : null;
            const freePlayResult = parseFreePlaySettlementResult(
              resultRecord,
              sessionId
            );
            const canonicalSuccess =
              durablePending ||
              (resultRecord?.success === true &&
                ((freeRunRef.current &&
                  freePlayResult !== null) ||
                  impactEnvelope !== null));
            if (!canonicalSuccess) {
              // HTTP success alone is not settlement authority. A stale
              // deployment, proxy, or malformed body must retain the proof so
              // an idempotent retry can recover the canonical receipt.
              console.error(
                'Game end returned no canonical settlement authority; queueing for replay'
              );
              queueForReplay();
            } else {
              terminalAcknowledged = true;
              runLeaseRef.current = null;
              checkpointRevisionRef.current = 0;
            if (durablePending) {
              // The immutable server envelope is now the recovery authority.
              // Do not display predicted DNA or retain a client retry copy.
              setSettlementSecuredPending(true);
              setRunImpact(null);
              setSettledYield(null);
              setSettledCredited(null);
              setSettledYieldBreakdown(null);
              setSettledGenomeRecap(null);
              setClanBattleResult(null);
            } else {
            acknowledgedImpact = impactEnvelope;
            acknowledgedFreePlay = freePlayResult;
            if (freePlayResult) applyFreePlaySettlement(freePlayResult);
            setRunImpact(impactEnvelope);
            if (impactEnvelope) requestAttentionRefresh();

            // Sync DNA balance to collection store (server authority)
            const playerRecord = recordValue(resultRecord?.player);
            if (typeof playerRecord?.dna === 'number') {
              useCollectionStore.getState().setDnaBalance(playerRecord.dna);
            }

            // Free runs: the server reports what the run WOULD have earned
            if (typeof resultRecord?.hypotheticalDna === 'number') {
              setHypotheticalDna(resultRecord.hypotheticalDna);
            }

            // ----- Results Layers 1 & 2 (Constitution §5, §6) -----
            // Yield is the run's full-strength worth; adjustedDna is what it
            // actually paid. Free Play settles adjustedDna = 0 and reports
            // the worth as hypotheticalDna, so Layer 2 reads Yield in both.
            const validation = recordValue(resultRecord?.validation) ?? {};
            setSettledYield(
              typeof validation.yieldDna === 'number' ? validation.yieldDna : null
            );
            setSettledYieldBreakdown(
              parseAscendanceBreakdown(validation.ascendance)
            );
            const genomeV2Record = parseGenomeV2RunRecord(
              recordValue(resultRecord?.genome)?.v === 2
                ? resultRecord?.genome
                : null
            );
            setSettledGenomeRecap(
              genomeV2Record ? buildGenomeV2YieldRecap(genomeV2Record) : null
            );
            setSettledCredited(
              typeof validation.adjustedDna === 'number'
                ? validation.adjustedDna
                : null
            );
            setClanBattleResult(
              resultRecord?.clanBattle && typeof resultRecord.clanBattle === 'object'
                ? (resultRecord.clanBattle as RunResultsClanBattle)
                : null
            );
            // The Take slot: present only when the server says this was the
            // day's first run. WP-1.04 owns that answer; until it ships the
            // field is absent and the slot never renders.
            setDailyTake(parseDailyTake(resultRecord));
            setTakeState('idle');

            const snakeMeta = equippedSnakeRef.current;
            if (snakeMeta) {
              setLastGenomeCard(buildGenomeCardModel(resultRecord, {
                snakeName: snakeMeta.name,
                dynasty: snakeMeta.dynasty,
                generation: snakeMeta.generation,
                score: data.score,
                foods: data.foodEaten,
              }));
            }

            if (resultRecord?.codex) {
              const discoveryResult = sanitizeCodexDiscoveryResult(resultRecord.codex);
              setCodexDiscoveries(discoveryResult.discoveries);
              // §5 toast consolidation: with Run Flow v1 the discoveries are
              // reported inside the Results Layer 3 digest, so the run end
              // fires no toast at all. One codex-heavy run used to raise five.
              if (!RUN_FLOW_V1_ENABLED) {
                for (const discovery of discoveryResult.discoveries) {
                  const worldFirst = discovery.worldFirst ? ' · WORLD FIRST' : '';
                  const reward = discovery.rewardDna > 0
                    ? ` · +${discovery.rewardDna} DNA`
                    : '';
                  showToast(
                    `Genome discovery: ${codexEntryName(discovery.type, discovery.entryId, discovery.rulesVersion)}${reward}${worldFirst}`,
                    'triumph',
                    5000
                  );
                }
                if (discoveryResult.genomeWeaverUnlocked) {
                  showToast('Genome Weaver unlocked', 'triumph', 5000);
                }
              }
              if (
                discoveryResult.discoveries.length > 0 ||
                discoveryResult.genomeWeaverUnlocked
              ) {
                // Refresh after the recorder commits so the next run's
                // offer cards reveal newly known splice names immediately.
                void fetchCodex(currentSession.user.id, currentSession.access_token);
              }
            }

            // Show daily streak info on the game-over screen
            const streakRecord = recordValue(resultRecord?.streak);
            if (
              typeof streakRecord?.current === 'number' &&
              typeof streakRecord.longest === 'number' &&
              typeof streakRecord.graceConsumed === 'boolean'
            ) {
              setStreakInfo({
                current: streakRecord.current,
                longest: streakRecord.longest,
                graceConsumed: streakRecord.graceConsumed,
              });
            }

            // Mastery XP grant (Design v2 §7.1: extracted earning runs
            // only) - powers the +XP line and the level-up moment
            const masteryRecord = recordValue(resultRecord?.mastery);
            if (
              typeof masteryRecord?.dynasty === 'string' &&
              typeof masteryRecord.xpGained === 'number' &&
              typeof masteryRecord.xp === 'number' &&
              typeof masteryRecord.level === 'number' &&
              typeof masteryRecord.leveledUp === 'boolean' &&
              Array.isArray(masteryRecord.unlocks)
            ) {
              const masteryDynasty = masteryRecord.dynasty;
              const masteryLevel = masteryRecord.level;
              const unlocks = masteryRecord.unlocks.flatMap((value) => {
                const unlock = recordValue(value);
                return unlock &&
                  typeof unlock.level === 'number' &&
                  typeof unlock.kind === 'string' &&
                  typeof unlock.label === 'string'
                  ? [{
                      level: unlock.level,
                      kind: unlock.kind,
                      label: unlock.label,
                    }]
                  : [];
              });
              setMasteryResult({
                dynasty: masteryDynasty,
                xpGained: masteryRecord.xpGained,
                xp: masteryRecord.xp,
                level: masteryLevel,
                leveledUp: masteryRecord.leveledUp,
                unlocks,
              });
              setMasteryLevels((prev) => ({
                ...prev,
                [masteryDynasty]: masteryLevel,
              }));
            }

            // Identity discovery is persistent and player-pulled. The result
            // still exposes the PlayerCard claim action, while the global
            // notification replaces the former automatic ceremony modal.
            // §5 notification consolidation: with Run Flow v1 the claim is
            // Results Layer 3's recommended next action when it is the most
            // useful one, so the global notification is not also published.
            const identityRecord = recordValue(resultRecord?.identity);
            if (
              !RUN_FLOW_V1_ENABLED &&
              identityRecord?.isGenerated === true &&
              validation.extracted === true
            ) {
              useNotificationStore.getState().publish({
                id: 'claim-handle',
                title: 'Claim your player name',
                description: 'Your generated identity is ready to personalize whenever you want.',
                ...NOTIFICATION_TARGETS.identity,
                badgeKind: 'exclamation',
                attentionReason: 'progression-opportunity',
                actionLabel: 'View player card',
              });
            }
            }
            }
          }
        } catch (err) {
          if (!settlementAuthorityCurrent()) return;
          console.error('Failed to send game results, queueing for replay:', err);
          queueForReplay();
        }

        if (requiresTerminalAcknowledgement && !terminalAcknowledged) {
          // Never turn an unacknowledged local collision/bank into Results.
          // The in-memory replay queue keeps retrying; a delivered keepalive
          // can also be rediscovered as terminal/settling after reload.
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setAwaitingResumeInput(false);
          setTerminalRecoveryState(
            terminalNeedsRecovery ? 'recover' : 'retrying'
          );
          if (!terminalNeedsRecovery) {
            setStartError('Securing this outcome with the server. Retrying automatically.');
          }
          return;
        }
      }

      if (!settlementAuthorityCurrent()) return;

      // The terminal claim can settle while the authored animation plays, but
      // a fast response never cuts the 800 ms flourish short. The request has
      // its own timeout above, so a dead connection cannot pin this board.
      await presentationReady;
      if (!settlementAuthorityCurrent()) return;
      if (await finalizeTerminalPresentation(
        acknowledgedImpact,
        acknowledgedFreePlay
      )) {
        // Recognition belongs to the same user/session authority that opened
        // Results. A settlement for an account switched during the flourish
        // must not publish another player's first-run discovery badges.
        completeFirstRunDiscovery();
      }
    });

    gameRef.current.on('pause', () => {
      setPaused(true);
      setQueuedDirections([]);
      audioManager.play('pause');
      secureRunBoundary();
    });

    gameRef.current.on('resume', () => {
      setPaused(false);
      secureRunBoundary();
    });

    return () => {
      if (boundaryFrame !== null) window.cancelAnimationFrame(boundaryFrame);
      if (boundaryTimer !== null) window.clearTimeout(boundaryTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // Note: session, currentSessionId, and showToast are accessed via closure

  }, [
    endGame,
    applyFreePlaySettlement,
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
    setRevivePhaseTicks,
    setRevive,
    setScore,
    setStrains,
    setSurgeChoicePending,
    setQueuedDirections,
    fetchCodex,
    armResumeAfterDecision,
    completeFirstRunDiscovery,
    finalizeTerminalPresentation,
    showToast,
    // Read once at mount and never reassigned; listed so the dependency
    // rule stays honest rather than suppressed.
    challengeRun,
  ]);

  // Sync game state to store
  const syncState = useCallback(() => {
    if (gameRef.current) {
      const state = gameRef.current.getState({ includeGenomeV2: false });
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
      setHoldsUsed(state.holdsUsed);
      setHoldsTotal(state.holdBudget);
      setChoicePityStrain(state.pendingChoicePity);
      setExitTile(state.exitTile, state.exitTicksRemaining);
      // Twin Exits (anomaly): the second portal of the pair
      setExitTile2(state.exitTile2);
      // Phase 2 mirrors: extra foods (Splitter pairs, COSMIC's other stars),
      // the constellation window, and the mutation beacon
      setExtraFoods(state.foods.slice(1));
      setConstellation(
        state.constellationGlyph,
        state.constellationTicksRemaining,
        state.constellationWindowTicks
      );
      setMutationTile(state.mutationTile, state.mutationTicksRemaining);
      // WP-3.05: OUTSIDE the genome gate on purpose. Terrain belongs to a
      // ruleset's arena, not to buildcraft, so gating it here would recreate
      // the invisible-block bug for every non-genome run.
      setTerrain(state.terrain);
      setRevivePhaseTicks(state.revivePhaseTicksRemaining);
      const genomeRevision = gameRef.current.getGenomeV2Revision();
      if (genomeV2RevisionRef.current !== genomeRevision) {
        genomeV2RevisionRef.current = genomeRevision;
        setGenomeV2State(parseGenomeV2State(
          gameRef.current.getGenomeV2State()
        ));
      }
      setGenomeV2SimulationTick(gameRef.current.getSimulationTick());
      if (gameRef.current.hasGenome()) {
        setStrains(state.strainCounts, state.strainTiers);
        setFusedSplices(state.fusedSplices);
        setGildedCells(state.gildedCells);
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
  }, [setSnake, setFood, setScore, setDnaCollected, setDirection, setQueuedDirections, setFoodEaten, setExitTile, setExitTile2, setExtraFoods, setConstellation, setMutationTile, setStrains, setFusedSplices, setGildedCells, setInfusesCount, setPortalChoicePending, setSurgeChoicePending, setRevive, setRevivePhaseTicks, setTerrain]);

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

    let armedSpeed = gameRef.current?.getSpeed() || 200;

    const tick = () => {
      if (gameRef.current && !gameRef.current.isGameOver()) {
        try {
          gameRef.current.tick();
          syncState();
        } catch (error) {
          // Never continue from an engine that may have mutated before an
          // invariant threw. That is how a hidden position change becomes an
          // apparently collision-free death on the following interval.
          console.error('Run simulation stopped before an unsafe tick:', error);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setAwaitingResumeInput(false);
          setRunEngineFault(true);
          return;
        }

        // Re-arm only when the actual tick interval changes. Rebuilding the
        // browser timer after every ordinary tick caused avoidable cadence
        // churn precisely when COSMIC and CYBER were busiest.
        const newSpeed = gameRef.current.getSpeed();
        if (intervalRef.current && newSpeed !== armedSpeed) {
          clearInterval(intervalRef.current);
          armedSpeed = newSpeed;
          intervalRef.current = setInterval(tick, newSpeed);
        }
      }
    };

    intervalRef.current = setInterval(tick, armedSpeed);
  }, [syncState]);
  startGameLoopRef.current = startGameLoop;

  // NOTE: the effect that used to demote EARN/ANOMALY to FREE at zero
  // energy is deliberately gone (Constitution §8.6). Running out of the
  // stored Energy no longer changes what the player may do - it changes
  // only what the run harvests. Silently switching their mode would be the
  // "second-class run" the Constitution abolished, and would also take a
  // choice away from them without asking.

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
    const ruleset = getRuleset(dynasty);
    game.setRuleset(ruleset);
    setTorus(ruleset.torus === true);
    setSelectedDynasty(dynasty);
    setGameMode(mode);

    // Sync server state to local. The server has already decided and
    // stamped how this run settles; the client only mirrors it.
    const startedEnergy = data.energy ?? data.charge ?? null;
    syncChargeFromServer(startedEnergy);
    const committed = Math.max(0, Number(startedEnergy?.committed ?? 0) || 0);
    const multiplierBps = Math.max(
      0,
      Number(startedEnergy?.commitmentMultiplierBps ?? 10_000) || 10_000
    );
    setActiveEnergyCommitted(committed);
    setActiveEnergyMultiplierBps(multiplierBps);
    setEnergyCommitment((startedEnergy?.available ?? 0) > 0 ? 1 : 0);
    setCurrentSessionId(data.sessionId);
    runLeaseRef.current = null;
    checkpointRevisionRef.current = 0;
    acceptedReplayRef.current = null;
    checkpointBarrierRef.current = Promise.resolve();
    deathPresentationRef.current?.resolve();
    deathPresentationRef.current = null;
    checkpointFailureSinceRef.current = null;
    continuitySafetyHoldRef.current = null;
    pendingTerminalPresentationRef.current = null;
    terminalRetryInFlightRef.current = null;
    setContinuitySafetyHold(null);
    setTerminalRecoveryState('idle');
    setRunEngineFault(false);
    setContinuityHeartbeat(null);
    setInterruptedRun(null);
    gameStartTime.current = 0;
    freeRunRef.current = mode === 'free';
    setLastRunFree(mode === 'free');
    setCollisionDiagnostic(null);
    setHypotheticalDna(null);
    setMasteryResult(null);
    setLastGenomeCard(null);
    setCodexDiscoveries([]);
    setExpressionFlourish(null);
    setGenomeV2CommitCallout(null);
    setShowAbandonConfirm(false);
    setShowInterruptedAbandonConfirm(false);
    setPortalChoicePending(false);
    setSurgeChoicePending(false);
    setShowFirstResultDiscovery(false);
    // WP-1.06: Results state belongs to the run that just ended. A new run
    // clears all of it before the board appears (Rule 1 - nothing from the
    // last run renders over this one).
    setDailyTake(null);
    setTakeState('idle');
    setSettledYield(null);
    setSettledCredited(null);
    setSettledYieldBreakdown(null);
    setSettledGenomeRecap(null);
    setClanBattleResult(null);
    setRunImpact(null);
    setSettlementSecuredPending(false);
    setSetupReopened(false);

    // Trait config comes from the server-owned equipped snake row.
    game.setTraits(sanitizeTraits(data.traits));

    // The server capability is the only Genome switch. Missing or malformed
    // capability data resets the engine cleanly to the legacy rules.
    // WP-3.02: the growth profile the SERVER stamped. Adopted FIRST, because
    // it decides the starting body and therefore the initial state every
    // other setter below writes into.
    game.setGrowthProfile((data as Record<string, unknown>).growthProfile);
    // WP-3.12: the rung the SERVER stamped. Adopted alongside the profile and
    // before the genome, because it decides where the first door stands and the
    // opening hold budget - both of which are fixed at state creation. An
    // absent block is rung 0, the shipped game.
    const startedLadder = (data as Record<string, unknown>).ladder as
      | Record<string, unknown>
      | undefined;
    game.setLadderRung(startedLadder?.rung);
    // Snap the SELECTION back to what the server chose. If the ask was clamped
    // - a stale tab, a rung since re-locked - the setup screen must not go on
    // showing a rung the player did not play. "The client never decides this,
    // it only learns it" has to be visible in the UI, not just true in the
    // request.
    setLadderRung(resolveLadderRung(startedLadder?.rung));

    const rawGenome = recordValue(data.genome);
    const startedRulesVersion = rawGenome?.rulesVersion === 2 ? 2 : 1;
    const startedActivation = startedRulesVersion === 2
      ? parseGenomeV2ActivationPresentation(rawGenome?.ftuePresentation)
      : null;
    setGenomeRulesVersion(startedRulesVersion);
    setGenomeV2Activation(startedActivation);
    setGenomeV2State(null);
    setGenomeV2SimulationTick(0);
    setGenomeV2BoardFeedback(null);
    genomeV2FeedbackRunSeedRef.current = null;
    genomeV2FeedbackEventRef.current = null;
    const runContext = recordValue(data.runContext);
    const runContextSnake = recordValue(runContext?.snake);
    setActiveAscendanceStamp(parseAscendanceRunPresentationStamp(
      runContextSnake?.ascendance,
      snakeMeta.generation
    ));

    const genomeCapability = sanitizeGenomeCapability(data.genome);
    game.setGenome(genomeCapability);
    setGenomeRun(genomeCapability !== null);
    setGenomeFtue(genomeCapability?.ftue ?? null);

    game.setMutationPool(
      Array.isArray(data.mutationPool)
        ? data.mutationPool.filter(isMutationId)
        : []
    );

    const simulation = data.simulation;
    const hasRecoverableOpening =
      simulation?.version === 1 &&
      typeof simulation.seed === 'string' &&
      simulation.seed.length > 0;
    if (hasRecoverableOpening) {
      game.setSimulationSeed(simulation.seed);
    }

    const anomalyData =
      data.anomaly && typeof data.anomaly === 'object'
        ? (data.anomaly as Record<string, unknown>)
        : null;
    const serverAnomaly =
      mode === 'anomaly' && isAnomalyId(anomalyData?.id)
        ? anomalyData.id
        : null;
    // The run's world condition, resolved SERVER-SIDE (§7.2, §7.3): the
    // Anomaly board's weekly modifier, the Serpent week's condition-set, or
    // the Signal day's condition. One field, because the server resolved it -
    // the client never derives a condition from its own `mode`.
    //
    // The engine plays under exactly the id settlement recomputes with, which
    // is the whole point: a condition that changed the payout without having
    // changed the run would flag every run under it as a claim mismatch.
    const serverCondition = isAnomalyId(data.condition)
      ? data.condition
      : serverAnomaly;
    game.setAnomaly(serverCondition);
    setRunCondition(serverCondition);
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
    if (hasRecoverableOpening) {
      game.prepare();
    } else {
      game.start();
      gameStartTime.current = Date.now();
    }
    setRunContinuityPhase(hasRecoverableOpening ? 'prepared' : 'active');
    syncState();
  }, [
    setAnomalyRun,
    setRunCondition,
    setGameMode,
    setGenomeRun,
    setPortalChoicePending,
    setReady,
    setSelectedDynasty,
    setSurgeChoicePending,
    setTorus,
    storeStartGame,
    syncChargeFromServer,
    syncState,
  ]);

  // Start game from the voluntary pre-run screen. Choosing a snake never
  // enters this path; only the explicit Play action creates a session.
  const handleStart = useCallback(async (
    modeOverride?: GameMode,
    commitmentOverride?: number
  ) => {
    const mode = modeOverride ?? gameMode;
    const commitment = mode === 'free'
      ? 0
      : commitmentOverride ?? energyCommitment;
    if (!session?.access_token) {
      setStartError('Please sign in to play');
      return;
    }
    if (!equippedSnake) {
      setStartError('No snake is equipped. Return Home and Retry setup.');
      return;
    }
    // NO ENERGY GATE (Constitution §8.6). Every run starts. The server
    // decides whether it harvests full or lean; neither answer stops it.
    if (isStarting) return;

    setIsStarting(true);
    setStartError(null);

    const startFingerprint = JSON.stringify({
      mode,
      snakeId: equippedSnake.id,
      commitment,
      ladderRung: LADDER_ENABLED ? ladderRung : null,
      genomeInteractionVersion: CURRENT_GENOME_V2_INTERACTION_VERSION,
    });
    if (startRequestRef.current?.fingerprint !== startFingerprint) {
      startRequestRef.current = {
        fingerprint: startFingerprint,
        id: createRunStartRequestId(),
      };
    }
    const startRequestId = startRequestRef.current.id;

    try {
      const requestBody = JSON.stringify({
        action: 'start',
        startRequestId,
        mode, // 'free' = rewardless practice run (§7.4)
        snake_id: equippedSnake.id, // Server validates ownership + equipped
        energyCommitment: commitment,
        genomeInteractionVersion: CURRENT_GENOME_V2_INTERACTION_VERSION,
        ...(commitment === GAME_CONFIG.economy.energy.capacity
          ? { confirmMaxEnergy: true }
          : {}),
        // WP-3.12: a REQUEST, never a decision. The server checks the ask
        // against `player_ladders`, clamps it to what this player has
        // unlocked, stamps it and echoes back the rung it chose.
        ...(LADDER_ENABLED ? { ladderRung } : {}),
      });
      let response: Response | null = null;
      let data: Record<string, unknown> = {};
      for (let attempt = 0; attempt < 4; attempt += 1) {
        response = await fetch('/api/game/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: requestBody,
        });
        data = await response.json();
        if (response.status !== 202 || data.preparing !== true) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
      if (!response) throw new Error('Run start returned no response');

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfterMs = typeof data.retryAfterMs === 'number'
            ? data.retryAfterMs
            : 5_000;
          setStartError(`Rate limited. Wait ${Math.ceil(retryAfterMs / 1000)}s`);
        } else {
          setStartError(
            typeof data.error === 'string' ? data.error : 'Failed to start game'
          );
        }
        return;
      }
      if (data.preparing === true || typeof data.sessionId !== 'string') {
        // A process failure can leave only the idempotency shell: no Energy
        // moved and no browser state may be used to reconstruct the manifest.
        // Discover that server row now so the player gets explicit Check again
        // / Abandon controls instead of an endless 202 message.
        const preparingRun = await fetchActiveRun(session.access_token).catch(
          (error) => {
            console.error('Failed to inspect preparing run:', error);
            return null;
          }
        );
        if (!matchesContinuityAuthority(
          session.access_token,
          sessionRef.current?.access_token,
          undefined,
          undefined,
          session.user.id,
          sessionRef.current?.user?.id
        )) return;
        if (
          preparingRun &&
          (typeof data.sessionId !== 'string' ||
            preparingRun.sessionId === data.sessionId)
        ) {
          setCurrentSessionId(preparingRun.sessionId);
          setActiveEnergyCommitted(preparingRun.energyCommitted);
          setInterruptedRun(preparingRun);
          setRunContinuityPhase(
            preparingRun.phase === 'active' ? 'active' : 'none'
          );
        }
        setStartError(
          preparingRun?.phase === 'preparing'
            ? 'Launch preparation was interrupted. No Energy was used; check again or release it and launch anew.'
            : 'Your run is secured and still preparing. Retry to continue it.'
        );
        return;
      }

      startRequestRef.current = null;

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
    equippedSnake,
    energyCommitment,
    gameMode,
    // WP-3.12: the same scar, one line down. `handleStart` is a useCallback, so
    // omitting the rung would capture rung 0 forever and every ladder run would
    // silently play Ground while the selector said otherwise - the WP-3.02
    // defect, reproduced exactly. No unit test can catch it: none go through
    // React. The e2e run-flow spec is what stands here.
    ladderRung,
    hasCompletedFirstRun,
    isStarting,
    session?.access_token,
    session?.user?.id,
  ]);

  const holdForContinuity = useCallback((
    kind: 'connection' | 'stale' | 'integrity'
  ) => {
    if (kind === 'stale') {
      runLeaseRef.current = null;
      checkpointRevisionRef.current = 0;
      // A newer lease proves that another window owns this run. This is the
      // only checkpoint condition allowed to stop this copy of the board.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setAwaitingResumeInput(false);
    }
    continuitySafetyHoldRef.current = kind;
    setContinuitySafetyHold(kind);
  }, []);

  // One in flight + one replaceable latest snapshot. The same request is
  // retried after a lost response, allowing the row-locked RPC's digest
  // idempotency to answer without inventing a new revision.
  checkpointWriterRef.current = async (proposal) => {
    const classifyReceipt = () => classifyActiveCheckpointReceipt(
      proposal,
      {
        accessToken: sessionRef.current?.access_token,
        userId: sessionRef.current?.user?.id,
        sessionId: currentSessionIdRef.current,
        leaseToken: runLeaseRef.current,
      },
      continuitySafetyHoldRef.current
    );
    if (classifyReceipt() === 'ignored') return;
    const expectedRevision = checkpointRevisionRef.current;
    const saveOnce = async () => {
      const controller = proposal.keepalive ? null : new AbortController();
      const timeout = controller
        ? window.setTimeout(() => controller.abort(), 4_500)
        : null;
      try {
        return await saveActiveRunCheckpoint(
          proposal.accessToken,
          proposal.sessionId,
          expectedRevision,
          proposal.checkpoint,
          proposal.leaseToken,
          {
            keepalive: proposal.keepalive,
            ...(controller ? { signal: controller.signal } : {}),
          }
        );
      } finally {
        if (timeout !== null) window.clearTimeout(timeout);
      }
    };
    try {
      let receipt;
      try {
        receipt = await saveOnce();
      } catch (error) {
        if (classifyActiveCheckpointFailure(error) !== 'retryable_transport') {
          throw error;
        }
        receipt = await saveOnce();
      }
      const receiptDisposition = classifyReceipt();
      if (receiptDisposition === 'ignored') return;
      checkpointRevisionRef.current = receipt.revision;
      acceptedReplayRef.current = proposal.checkpoint.privateState.replay;
      recordContinuityReceipt();
      checkpointFailureSinceRef.current = null;
      if (receiptDisposition === 'connection_recovered') {
        continuitySafetyHoldRef.current = null;
        setContinuitySafetyHold(null);
      }
    } catch (error) {
      if (classifyReceipt() === 'ignored') return;
      const failure = classifyActiveCheckpointFailure(error);
      if (failure === 'stale_lease') {
        holdForContinuity('stale');
      } else if (failure === 'deterministic_rejection') {
        holdForContinuity('integrity');
      } else {
        checkpointFailureSinceRef.current ??= Date.now();
        if (
          Date.now() - checkpointFailureSinceRef.current >=
            ACTIVE_RUN_CONNECTION_HOLD_MS
        ) {
          holdForContinuity('connection');
        }
      }
      throw error;
    }
  };

  /** Capture one bounded latest proposal; no browser persistence is used. */
  const queueActiveCheckpoint = useCallback((options: {
    required?: boolean;
    keepalive?: boolean;
  } = {}): Promise<void> => {
    const game = gameRef.current;
    const authority = sessionRef.current;
    const token = authority?.access_token;
    const userId = authority?.user?.id;
    const sessionId = currentSessionIdRef.current;
    const leaseToken = runLeaseRef.current;
    if (!game || !token || !userId || !sessionId || !leaseToken) {
      return options.required
        ? Promise.reject(new Error('The active run has no checkpoint lease'))
        : Promise.resolve();
    }

    let checkpoint: ReturnType<SnakeGameLogic['exportCheckpoint']>;
    try {
      checkpoint = game.exportCheckpoint();
    } catch (error) {
      return options.required ? Promise.reject(error) : Promise.resolve();
    }
    const task = checkpointQueueRef.current!.enqueue({
      sessionId,
      accessToken: token,
      userId,
      leaseToken,
      checkpoint,
      keepalive:
        options.keepalive === true && JSON.stringify(checkpoint).length < 55_000,
    });
    // Terminalization awaits this barrier before reading its revision/base.
    // A checkpoint already accepted by PostgreSQL can therefore never race a
    // stale terminal proof, and no queued proposal remains after the barrier.
    checkpointBarrierRef.current = task.catch(() => undefined);
    if (!options.required) {
      void task.catch((error) => {
        // The prior accepted checkpoint remains valid. A lease conflict means
        // another tab deliberately resumed this run; its next terminal request
        // is the only one the server will accept.
        console.error('Run checkpoint deferred:', error);
      });
    }
    return task;
  }, []);

  // Make the current writer available to simulation event handlers without
  // coupling the engine-initialization effect to a later callback declaration.
  useEffect(() => {
    checkpointNowRef.current = queueActiveCheckpoint;
    return () => {
      checkpointNowRef.current = () => Promise.resolve();
    };
  }, [queueActiveCheckpoint]);

  const retryTerminalSettlement = useCallback((): Promise<boolean> => {
    if (terminalRetryInFlightRef.current) {
      return terminalRetryInFlightRef.current;
    }
    const task = (async (): Promise<boolean> => {
      const authority = sessionRef.current;
      const token = authority?.access_token;
      const userId = authority?.user?.id;
      const sessionId = currentSessionIdRef.current;
      if (!token || !userId || !sessionId) {
        setTerminalRecoveryState('recover');
        setStartError('Reload to recover the server-secured run.');
        return true;
      }
      const stillOwnsRecovery = () => matchesContinuityAuthority(
        token,
        sessionRef.current?.access_token,
        sessionId,
        currentSessionIdRef.current,
        userId,
        sessionRef.current?.user?.id
      );
      const hadPendingProof = readOutbox().some(
        (entry) => entry.sessionId === sessionId && entry.ownerId === userId
      );
      if (!hadPendingProof) {
        if (stillOwnsRecovery()) {
          setTerminalRecoveryState('recover');
          setStartError('Load the last server-secured position to continue safely.');
        }
        return true;
      }
      try {
        const result = await withClientDeadline(
          replayRewardOutbox(token, fetch, userId, sessionId),
          TERMINAL_CLIENT_DEADLINE_MS + 1_000,
          'Terminal settlement retry timed out'
        );
        if (!stillOwnsRecovery()) return true;
        if (
          result.leaseConflictSessionIds.includes(sessionId) ||
          result.permanentlyRejectedSessionIds.includes(sessionId)
        ) {
          setTerminalRecoveryState('recover');
          setStartError(
            result.leaseConflictSessionIds.includes(sessionId)
              ? 'This run continued elsewhere. Load the secured version.'
              : 'The outcome proof was rejected. Load the last secured position.'
          );
          return true;
        }

        const impact = result.impacts.find(
          (candidate) => candidate.sessionId === sessionId
        );
        const freePlayResult = result.freePlayResults.find(
          (candidate) => candidate.sessionId === sessionId
        ) ?? null;
        if (impact) {
          setRunImpact(impact);
          setSettledYield(impact.receipt.yieldDna);
          setSettledCredited(impact.receipt.dnaCredited);
          setActiveEnergyCommitted(impact.receipt.energyCommitted);
          setActiveEnergyMultiplierBps(
            impact.receipt.commitmentMultiplierBps
          );
          requestAttentionRefresh();
        }
        if (freePlayResult) {
          applyFreePlaySettlement(freePlayResult);
        }
        const securedPending =
          result.securedPendingSessionIds.includes(sessionId);
        const completedWithoutImpact =
          result.completedWithoutImpactSessionIds.includes(sessionId);
        const earningCompletedWithoutImpact =
          completedWithoutImpact && !freeRunRef.current;
        if (
          securedPending ||
          earningCompletedWithoutImpact
        ) {
          setSettlementSecuredPending(true);
          setRunImpact(null);
          setSettledYield(null);
          setSettledCredited(null);
          setSettledYieldBreakdown(null);
          setSettledGenomeRecap(null);
          setClanBattleResult(null);
        }
        const stillQueued = readOutbox().some(
          (entry) => entry.sessionId === sessionId && entry.ownerId === userId
        );
        if (stillQueued) return false;
        if (
          !impact &&
          !freePlayResult &&
          !securedPending &&
          !earningCompletedWithoutImpact
        ) {
          // Queue disappearance is not authority: an expired/pruned proof or
          // a concurrent consumer that returned no receipt must recover from
          // server lifecycle state rather than open locally predicted Results.
          setTerminalRecoveryState('recover');
          setStartError(
            'Settlement authority could not be confirmed. Load the server-secured run.'
          );
          return true;
        }

        void fetch('/api/player', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((response) => response.ok ? response.json() : null)
          .then((data) => {
            if (!stillOwnsRecovery()) return;
            if (typeof data?.player?.dna === 'number') {
              useCollectionStore.getState().setDnaBalance(data.player.dna);
            }
          })
          .catch((error) => {
            console.error('Player refresh after terminal retry deferred:', error);
          });
        if (await finalizeTerminalPresentation(impact, freePlayResult)) {
          completeFirstRunDiscovery();
        }
        return true;
      } catch (error) {
        console.error('Terminal settlement retry deferred:', error);
        return false;
      }
    })();
    terminalRetryInFlightRef.current = task;
    void task.finally(() => {
      if (terminalRetryInFlightRef.current === task) {
        terminalRetryInFlightRef.current = null;
      }
    });
    return task;
  }, [
    applyFreePlaySettlement,
    completeFirstRunDiscovery,
    finalizeTerminalPresentation,
  ]);

  useEffect(() => {
    if (terminalRecoveryState !== 'retrying') return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const retry = async () => {
      const finished = await retryTerminalSettlement();
      if (cancelled || finished) return;
      attempt += 1;
      timeout = setTimeout(
        retry,
        Math.min(15_000, 1_000 * (2 ** attempt))
      );
    };
    timeout = setTimeout(retry, 1_000);
    return () => {
      cancelled = true;
      if (timeout !== null) clearTimeout(timeout);
    };
  }, [retryTerminalSettlement, terminalRecoveryState]);

  const handleTerminalRecoveryAction = useCallback(() => {
    if (terminalRecoveryState === 'recover') {
      window.location.reload();
      return;
    }
    void retryTerminalSettlement();
  }, [retryTerminalSettlement, terminalRecoveryState]);

  const retryContinuityCheckpoint = useCallback(() => {
    if (continuitySafetyHold === 'stale') {
      window.location.reload();
      return;
    }
    void queueActiveCheckpoint({ required: true }).catch((error) => {
      console.error('Run continuity retry deferred:', error);
    });
  }, [continuitySafetyHold, queueActiveCheckpoint]);

  useEffect(() => {
    if (continuitySafetyHold !== 'connection') return;
    window.addEventListener('online', retryContinuityCheckpoint);
    return () => window.removeEventListener('online', retryContinuityCheckpoint);
  }, [continuitySafetyHold, retryContinuityCheckpoint]);

  // The safety bound is measured from the latest server receipt, independent
  // of an individual fetch timeout or retry. Resume lease rotation and every
  // accepted checkpoint explicitly re-arm the deadline; failed writes do not.
  useRunContinuityWatchdog({
    enabled:
      runContinuityPhase === 'active' &&
      isPlaying &&
      !isGameOver &&
      continuitySafetyHold === null &&
      !awaitingResumeInput &&
      !choiceActive &&
      runLeaseRef.current !== null,
    heartbeat: continuityHeartbeat,
    budgetMs: ACTIVE_RUN_CONNECTION_HOLD_MS,
    onExpired: () => holdForContinuity('connection'),
  });

  // A bounded cadence limits rollback while the simulation is moving. Frozen
  // resume and decision states create no new tick exposure, so they suspend
  // only this periodic work—not lifecycle protection below.
  useEffect(() => {
    if (
      runContinuityPhase !== 'active' ||
      !isPlaying ||
      isGameOver ||
      awaitingResumeInput ||
      choiceActive ||
      runEngineFault ||
      !runLeaseRef.current
    ) return;

    let idleId: number | null = null;
    let frameId: number | null = null;
    let deferredTimer: number | null = null;
    const captureAfterPaint = () => {
      if (idleId !== null || frameId !== null || deferredTimer !== null) return;
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => {
          idleId = null;
          void queueActiveCheckpoint();
        }, { timeout: 400 });
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        deferredTimer = window.setTimeout(() => {
          deferredTimer = null;
          void queueActiveCheckpoint();
        }, 0);
      });
    };
    const intervalId = window.setInterval(
      captureAfterPaint,
      ACTIVE_RUN_CHECKPOINT_INTERVAL_MS
    );
    return () => {
      window.clearInterval(intervalId);
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (deferredTimer !== null) window.clearTimeout(deferredTimer);
    };
  }, [awaitingResumeInput, choiceActive, isGameOver, isPlaying, queueActiveCheckpoint, runContinuityPhase, runEngineFault]);

  // Page closure can happen while a Loom, portal, pause gate, or the deferred
  // post-paint boundary capture is open. Keep lifecycle flushing armed for
  // every active nonterminal lease even when routine cadence is suspended.
  useEffect(() => {
    if (
      runContinuityPhase !== 'active' ||
      !isPlaying ||
      isGameOver ||
      runEngineFault ||
      !runLeaseRef.current
    ) return;

    const secureBeforeLeaving = () => {
      void queueActiveCheckpoint({ keepalive: true });
    };
    const secureWhenHidden = () => {
      if (document.visibilityState === 'hidden') secureBeforeLeaving();
    };

    window.addEventListener('pagehide', secureBeforeLeaving);
    document.addEventListener('visibilitychange', secureWhenHidden);
    return () => {
      window.removeEventListener('pagehide', secureBeforeLeaving);
      document.removeEventListener('visibilitychange', secureWhenHidden);
    };
  }, [isGameOver, isPlaying, queueActiveCheckpoint, runContinuityPhase, runEngineFault]);

  /**
   * Cross the prepared→active boundary immediately before movement begins.
   * A direction may already be queued in the held engine, but no tick is
   * scheduled until this authoritative transition succeeds. On failure the
   * seeded opening is rebuilt, so a stale queued gesture can never fire on a
   * later retry.
   */
  const releaseReadyBoard = useCallback((): Promise<boolean> => {
    if (activationPromiseRef.current) return activationPromiseRef.current;
    const task = (async (): Promise<boolean> => {
      const game = gameRef.current;
      if (!game) return false;

      if (continuityPhaseRef.current === 'prepared') {
        const authority = sessionRef.current;
        const token = authority?.access_token;
        const userId = authority?.user?.id;
        const sessionId = currentSessionIdRef.current;
        if (!token || !userId || !sessionId) {
          setStartError('The prepared run could not be verified.');
          return false;
        }
        const stillOwnsActivation = () => matchesContinuityAuthority(
          token,
          sessionRef.current?.access_token,
          sessionId,
          currentSessionIdRef.current,
          userId,
          sessionRef.current?.user?.id
        );
        let openingCheckpoint: ReturnType<SnakeGameLogic['exportCheckpoint']>;
        try {
          openingCheckpoint = game.exportCheckpoint();
        } catch {
          setStartError('The prepared opening could not be secured.');
          return false;
        }
        continuityPhaseRef.current = 'activating';
        setRunContinuityPhase('activating');
        try {
          const activated = await activatePreparedRun(
            token,
            sessionId,
            openingCheckpoint
          );
          if (!stillOwnsActivation()) return false;
          if (!activated.leaseToken || !activated.checkpoint) {
            throw new Error('Run activation returned no secured opening lease');
          }
          runLeaseRef.current = activated.leaseToken;
          checkpointRevisionRef.current = activated.checkpointRevision;
          acceptedReplayRef.current = activated.checkpoint.privateState.replay;
          recordContinuityReceipt();
          checkpointFailureSinceRef.current = null;
          setContinuitySafetyHold(null);
          game.activatePrepared();
          gameStartTime.current = Date.now();
          continuityPhaseRef.current = 'active';
          setRunContinuityPhase('active');
        } catch (error) {
          if (!stillOwnsActivation()) return false;
          console.error('Failed to activate prepared run:', error);
          const secured = await fetchActiveRun(token).catch(() => null);
          if (!stillOwnsActivation()) return false;
          if (
            secured?.phase === 'active' &&
            secured.canContinue &&
            secured.checkpoint
          ) {
            setInterruptedRun(secured);
            continuityPhaseRef.current = 'active';
            setRunContinuityPhase('active');
            setReady(false);
            return false;
          }
          runLeaseRef.current = null;
          checkpointRevisionRef.current = 0;
          continuityPhaseRef.current = 'prepared';
          setRunContinuityPhase('prepared');
          setStartError('The run is still secured. Check the connection and try again.');
          game.prepare();
          syncState();
          setReady(true);
          return false;
        }
      }

      setRequiresDirectionalStart(false);
      setReady(false);
      startGameLoop();
      return true;
    })();
    activationPromiseRef.current = task;
    void task.finally(() => {
      if (activationPromiseRef.current === task) activationPromiseRef.current = null;
    });
    return task;
  }, [recordContinuityReceipt, setReady, startGameLoop, syncState]);

  const applyCheckpointedRun = useCallback((active: ActiveRunView): void => {
    if (!active.manifest || !active.checkpoint || !active.leaseToken) {
      throw new Error('Run resume is missing its secured state');
    }
    const snakeMeta = equippedViewFromRunManifest(active.manifest);
    if (!snakeMeta) throw new Error('Run resume is missing its snake snapshot');
    const mode: GameMode = active.manifest.freePlay
      ? 'free'
      : active.manifest.anomaly
        ? 'anomaly'
        : 'earn';

    setEquippedSnake(snakeMeta);
    equippedSnakeRef.current = snakeMeta;
    setCollectionLoaded(true);
    setNeedsStarterSelection(false);
    applyStartedRun(active.manifest, mode, snakeMeta);

    const game = gameRef.current;
    if (!game) throw new Error('The game board is not ready');
    game.restoreCheckpoint(active.checkpoint, Date.now(), {
      replacePreparedOpening: true,
    });
    const state = game.getState();
    runLeaseRef.current = active.leaseToken;
    checkpointRevisionRef.current = active.checkpointRevision;
    acceptedReplayRef.current = active.checkpoint.privateState.replay;
    recordContinuityReceipt();
    checkpointFailureSinceRef.current = null;
    continuitySafetyHoldRef.current = null;
    setContinuitySafetyHold(null);
    gameStartTime.current = Date.now() - active.checkpoint.privateState.elapsedMs;
    setCurrentSessionId(active.sessionId);
    setActiveEnergyCommitted(active.energyCommitted);
    const restoredGenomeV2 = parseGenomeV2State(
      (state as typeof state & { genomeV2?: unknown }).genomeV2
    );
    setGenomeV2State(restoredGenomeV2);
    setGenomeV2SimulationTick(game.getSimulationTick());
    setChoiceOptions(
      restoredGenomeV2?.offer ? null : state.pendingChoice,
      restoredGenomeV2?.offer ? null : state.choiceSource
    );
    setHeldMutations(state.heldMutations);
    setPortalCanInfuse(state.pendingPortalChoice?.canInfuse === true);
    setPortalChoicePending(state.pendingPortalChoice !== null);
    setSurgeChoicePending(state.pendingSurgeChoice);
    setChoicePityStrain(state.pendingChoicePity);
    setPaused(state.isPaused);
    setReady(false);
    setRequiresDirectionalStart(false);
    setMinimalFirstRunPrompt(false);
    setInterruptedRun(null);
    setRunContinuityPhase('active');
    syncState();

    const decisionPending =
      state.pendingChoice !== null ||
      state.pendingPortalChoice !== null ||
      state.pendingSurgeChoice ||
      restoredGenomeV2?.offer != null ||
      restoredGenomeV2?.portal != null;
    setAwaitingResumeInput(!decisionPending);
    // The resume gate is UI-owned. Preserve the canonical engine pause bit
    // exactly and do not create a dormant interval: the first deliberate
    // direction both releases this gate and starts the loop, so not one
    // pre-accept simulation tick can occur after reload.
  }, [
    applyStartedRun,
    recordContinuityReceipt,
    setChoiceOptions,
    setHeldMutations,
    setPaused,
    setPortalChoicePending,
    setReady,
    setSurgeChoicePending,
    syncState,
  ]);

  const continueInterruptedRun = useCallback(async (): Promise<void> => {
    const authority = sessionRef.current;
    const token = authority?.access_token;
    const userId = authority?.user?.id;
    const run = interruptedRun;
    if (!token || !userId || !run) {
      throw new Error('No interrupted run is available');
    }
    const resumed = await resumeCheckpointedRun(token, run.sessionId);
    if (!matchesContinuityAuthority(
      token,
      sessionRef.current?.access_token,
      run.sessionId,
      currentSessionIdRef.current,
      userId,
      sessionRef.current?.user?.id
    )) return;
    applyCheckpointedRun(resumed);
  }, [applyCheckpointedRun, interruptedRun]);

  const repairInterruptedStart = useCallback(async (): Promise<boolean> => {
    const authority = sessionRef.current;
    const token = authority?.access_token;
    const userId = authority?.user?.id;
    const run = interruptedRun;
    if (!token || !userId || !run?.startIntent) return false;
    const manifest = await retryPreparingRunStart(
      token,
      run.startIntent
    );
    if (!matchesContinuityAuthority(
      token,
      sessionRef.current?.access_token,
      run.sessionId,
      currentSessionIdRef.current,
      userId,
      sessionRef.current?.user?.id
    )) return false;
    const snakeMeta = equippedViewFromRunManifest(manifest);
    if (!snakeMeta) throw new Error('Repaired run is missing its snake snapshot');
    const mode: GameMode = manifest.freePlay
      ? 'free'
      : manifest.anomaly
        ? 'anomaly'
        : 'earn';
    setEquippedSnake(snakeMeta);
    equippedSnakeRef.current = snakeMeta;
    setCollectionLoaded(true);
    setNeedsStarterSelection(false);
    applyStartedRun(manifest, mode, snakeMeta);
    return true;
  }, [applyStartedRun, interruptedRun]);

  const recoverServerRun = useCallback(async (): Promise<boolean> => {
    const authority = sessionRef.current;
    const token = authority?.access_token;
    const userId = authority?.user?.id;
    if (!token || !userId || !gameRef.current) return false;
    const activeRunController = new AbortController();
    const activeRunTimeout = window.setTimeout(
      () => activeRunController.abort(),
      TERMINAL_CLIENT_DEADLINE_MS
    );
    let active: ActiveRunView | null;
    try {
      active = await fetchActiveRun(
        token,
        fetch,
        activeRunController.signal
      );
    } finally {
      window.clearTimeout(activeRunTimeout);
    }
    if (!matchesContinuityAuthority(
      token,
      sessionRef.current?.access_token,
      undefined,
      undefined,
      userId,
      sessionRef.current?.user?.id
    )) {
      return false;
    }
    if (!active) {
      setInterruptedRun(null);
      setRunContinuityPhase('none');
      setCurrentSessionId(null);
      return false;
    }

    let recoveredActive = active;
    let terminalFreePlayResult: FreePlaySettlementResult | null = null;
    let terminalClosedWithoutSettlement = false;
    if (active.phase === 'terminal') {
      // The replay-derived outcome is already immutable. Re-enter the normal
      // settlement fold without any client-authored facts; a process/tab loss
      // between terminalization and the pending envelope can only delay it.
      try {
        const terminalController = new AbortController();
        const terminalTimeout = window.setTimeout(
          () => terminalController.abort(),
          TERMINAL_RECOVERY_DEADLINE_MS
        );
        let response: Response;
        let responseBody: unknown;
        try {
          response = await fetch('/api/game/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            signal: terminalController.signal,
            body: JSON.stringify({ action: 'end', sessionId: active.sessionId }),
          });
          responseBody = await response.json().catch(() => null);
        } finally {
          window.clearTimeout(terminalTimeout);
        }
        const disposition = classifyTerminalRecoveryResponse(
          response.status,
          responseBody,
          active.sessionId,
          active.freePlay
        );
        if (disposition === 'settling') {
          recoveredActive = { ...active, phase: 'settling' };
        } else if (disposition === 'completed') {
          if (active.freePlay) {
            terminalFreePlayResult = parseFreePlaySettlementResult(
              responseBody,
              active.sessionId
            );
          } else {
            // Completion is canonical, but its detailed impact receipt is not
            // readable yet. Preserve a settling surface and keep polling.
            recoveredActive = { ...active, phase: 'settling' };
          }
        } else if (disposition === 'recover') {
          terminalClosedWithoutSettlement = true;
        }
      } catch (error) {
        console.error('Terminal run settlement remains secured:', error);
      }
    }

    setCurrentSessionId(recoveredActive.sessionId);
    currentSessionIdRef.current = recoveredActive.sessionId;
    setActiveEnergyCommitted(recoveredActive.energyCommitted);
    if (terminalFreePlayResult) {
      setInterruptedRun(null);
      continuityPhaseRef.current = 'none';
      setRunContinuityPhase('none');
      setTerminalRecoveryState('idle');
      setSetupReopened(false);
      setCollisionDiagnostic(null);
      applyFreePlaySettlement(terminalFreePlayResult);
      endGame(
        terminalFreePlayResult.score,
        terminalFreePlayResult.dnaCredited,
        terminalFreePlayResult.outcome === 'extracted' ? 'extracted' : 'died'
      );
      return true;
    }
    if (terminalClosedWithoutSettlement) {
      setInterruptedRun(null);
      continuityPhaseRef.current = 'none';
      setRunContinuityPhase('none');
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
      setStartError(
        'The server already closed this run without settlement. Its local ending was not applied.'
      );
      return false;
    }
    if (recoveredActive.phase === 'prepared' && recoveredActive.canContinue && recoveredActive.manifest) {
      const snakeMeta = equippedViewFromRunManifest(recoveredActive.manifest);
      if (!snakeMeta) {
        throw new Error('Prepared run is missing its snake snapshot');
      }
      setEquippedSnake(snakeMeta);
      equippedSnakeRef.current = snakeMeta;
      setCollectionLoaded(true);
      setNeedsStarterSelection(false);
      const mode: GameMode = recoveredActive.manifest.freePlay
        ? 'free'
        : recoveredActive.manifest.anomaly
          ? 'anomaly'
          : 'earn';
      applyStartedRun(recoveredActive.manifest, mode, snakeMeta);
      return true;
    }

    // An activated run is never resumed merely because a route mounted. The
    // player sees its stake, then Continue rotates an exclusive server lease
    // before the accepted checkpoint enters the engine.
    setInterruptedRun(recoveredActive);
    setRunContinuityPhase(recoveredActive.phase === 'active' ? 'active' : 'none');
    return true;
  }, [applyFreePlaySettlement, applyStartedRun, endGame]);

  const refreshRecoveredWallet = useCallback(async (
    token: string,
    userId: string,
    sessionId: string
  ): Promise<void> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch('/api/player', {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`/api/player responded ${response.status}`);
      }
      const data = await response.json();
      if (!matchesContinuityAuthority(
        token,
        sessionRef.current?.access_token,
        sessionId,
        currentSessionIdRef.current,
        userId,
        sessionRef.current?.user?.id
      )) return;
      if (typeof data.player?.dna === 'number') {
        useCollectionStore.getState().setDnaBalance(data.player.dna);
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const applyRecoveredSettlingResult = useCallback((
    impact: RunImpactEnvelope,
    authority?: { token: string; userId: string }
  ): void => {
    setRunImpact(impact);
    setSettledYield(impact.receipt.yieldDna);
    setSettledCredited(impact.receipt.dnaCredited);
    setActiveEnergyCommitted(impact.receipt.energyCommitted);
    setActiveEnergyMultiplierBps(impact.receipt.commitmentMultiplierBps);
    setSettlementSecuredPending(false);
    setInterruptedRun(null);
    endGame(
      impact.receipt.score,
      impact.receipt.dnaCredited,
      impact.outcome === 'crashed' ? 'died' : 'extracted'
    );
    requestAttentionRefresh();
    if (authority) {
      void refreshRecoveredWallet(
        authority.token,
        authority.userId,
        impact.sessionId
      ).catch((error) => {
        console.error('Failed to refresh recovered run wallet:', error);
      });
    }
  }, [endGame, refreshRecoveredWallet]);

  const recoverSettlingResult = useCallback(async (): Promise<boolean> => {
    const authority = sessionRef.current;
    const token = authority?.access_token;
    const userId = authority?.user?.id;
    const run = interruptedRun;
    if (!token || !userId || !run || run.phase !== 'settling') return false;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      TERMINAL_CLIENT_DEADLINE_MS
    );
    let impact: RunImpactEnvelope | null;
    try {
      impact = await advancePendingRunImpact(
        run.sessionId,
        token,
        fetch,
        controller.signal
      );
    } finally {
      window.clearTimeout(timeout);
    }
    if (!matchesContinuityAuthority(
      token,
      sessionRef.current?.access_token,
      run.sessionId,
      currentSessionIdRef.current,
      userId,
      sessionRef.current?.user?.id
    )) return false;
    if (!impact || impact.sessionId !== run.sessionId) return false;
    applyRecoveredSettlingResult(impact, { token, userId });
    return true;
  }, [applyRecoveredSettlingResult, interruptedRun]);

  // Reopening after a durable 202 should feel like returning to the Results
  // ceremony, not like landing in a maintenance screen. Give the server a
  // bounded automatic window, then reveal a manual retry only if it remains
  // unavailable. The secured run itself never becomes abandonable here.
  useEffect(() => {
    const run = interruptedRun;
    const token = session?.access_token;
    const userId = session?.user?.id;
    if (!run || run.phase !== 'settling' || !token || !userId) {
      setSettlingRecoveryState('idle');
      return;
    }
    const controller = new AbortController();
    setStartError(null);
    setSettlingRecoveryState('polling');
    void recoverPendingRunImpactBounded(run.sessionId, token, {
      signal: controller.signal,
    })
      .then((impact) => {
        if (controller.signal.aborted) return;
        if (!matchesContinuityAuthority(
          token,
          sessionRef.current?.access_token,
          run.sessionId,
          currentSessionIdRef.current,
          userId,
          sessionRef.current?.user?.id
        )) return;
        if (impact?.sessionId === run.sessionId) {
          applyRecoveredSettlingResult(impact, { token, userId });
          return;
        }
        setSettlingRecoveryState('retry');
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          !matchesContinuityAuthority(
            token,
            sessionRef.current?.access_token,
            run.sessionId,
            currentSessionIdRef.current,
            userId,
            sessionRef.current?.user?.id
          )
        ) return;
        console.error('Automatic result recovery failed:', error);
        setSettlingRecoveryState('retry');
      });
    return () => controller.abort();
  }, [
    applyRecoveredSettlingResult,
    interruptedRun,
    session?.access_token,
    session?.user?.id,
  ]);

  // Depend on the identity of the stranded run, never on the view object.
  // `recoverServerRun` rebuilds that object on every attempt, so an object
  // dependency would tear the retry loop down and restart its backoff on each
  // pass.
  const strandedTerminalSessionId =
    interruptedRun?.phase === 'terminal' ? interruptedRun.sessionId : null;

  // A terminal run is an outcome the server has already locked but not yet
  // folded, and this client is its ONLY driver: `expire_stale_game_sessions`
  // skips continuity rows, and both pending-settlement sweeps require a durable
  // envelope this run never staged. The shipped recovery took exactly one shot
  // per page load, so a single slow or failed fold left the row open forever —
  // and an open row makes `action: 'start'` answer 409 on every device, which
  // is how one interrupted run became an account that could not play at all.
  // Keep asking, with backoff, for as long as this surface is open.
  useEffect(() => {
    const token = session?.access_token;
    const userId = session?.user?.id;
    if (!strandedTerminalSessionId || !token || !userId) return;
    return startTerminalRecoveryLoop(() => recoverServerRun(), {
      onError: (error) => {
        console.error('Terminal settlement retry failed:', error);
      },
    });
  }, [
    recoverServerRun,
    session?.access_token,
    session?.user?.id,
    strandedTerminalSessionId,
  ]);

  // Consume Home/Lab's prepared run once. This effect is declared after the
  // engine initialization effect, so the local board exists before the
  // handoff is applied. Invalid/expired handoffs remain on this screen with a
  // recoverable Retry path; initialization failures never redirect to Lab.
  useEffect(() => {
    if (authLoading) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('launch') !== 'ftue-v2') {
      if (continuityCheckedRef.current) return;
      if (!session?.access_token || !gameRef.current) {
        setRouteInitializing(false);
        return;
      }
      continuityCheckedRef.current = true;
      let cancelled = false;
      let settled = false;
      void recoverServerRun()
        .catch((error) => {
          if (cancelled) return;
          console.error('Failed to inspect active run:', error);
          setStartError('Could not check for an interrupted run. Retry in a moment.');
        })
        .finally(() => {
          settled = true;
          if (!cancelled) setRouteInitializing(false);
        });
      return () => {
        cancelled = true;
        // React StrictMode deliberately tears down and replays effects. Do not
        // leave the replay believing a cancelled request completed the one
        // continuity check responsible for releasing "Preparing board…".
        if (!settled) continuityCheckedRef.current = false;
      };
    }
    if (handoffAttemptedRef.current) {
      return;
    }
    if (!session?.user?.id || !gameRef.current) {
      setRouteInitializing(false);
      return;
    }

    handoffAttemptedRef.current = true;
    continuityCheckedRef.current = true;
    const handoff = consumeLaunchHandoff(session.user.id);
    params.delete('launch');
    params.delete('source');
    const cleanUrl = `${window.location.pathname}${params.size > 0 ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', cleanUrl);

    if (!handoff) {
      // Reload/navigation can erase the page-memory handoff without erasing
      // the run. Ask the server for the same prepared manifest before ever
      // presenting a second Play action.
      let cancelled = false;
      let settled = false;
      void recoverServerRun()
        .then((recovered) => {
          if (!cancelled && !recovered) {
            setStartError('The prepared run expired. Retry when you are ready.');
          }
        })
        .catch((error) => {
          if (cancelled) return;
          console.error('Failed to recover prepared run:', error);
          setStartError('Could not recover the prepared run. Retry in a moment.');
        })
        .finally(() => {
          settled = true;
          if (!cancelled) setRouteInitializing(false);
        });
      return () => {
        cancelled = true;
        if (!settled) {
          handoffAttemptedRef.current = false;
          continuityCheckedRef.current = false;
        }
      };
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
  }, [
    applyStartedRun,
    authLoading,
    recoverServerRun,
    session?.access_token,
    session?.user?.id,
  ]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Strategic choices and destructive confirmation own the keyboard in
      // capture phase. Movement, pause, and camera shortcuts cannot leak.
      if (blockingOverlayActive) return;

      const isPauseKey =
        e.code === 'Space' ||
        e.key === 'Escape' ||
        e.key === 'p' ||
        e.key === 'P';
      // A held Space must not pause and then auto-repeat into an immediate
      // resume. Every pause/resume action requires a fresh physical press.
      if (isPauseKey && e.repeat) {
        e.preventDefault();
        return;
      }

      // Handle ready state - first input starts movement
      if ((isReady && !intervalRef.current) || awaitingResumeInput) {
        if (runContinuityPhase === 'activating') {
          e.preventDefault();
          return;
        }
        const dir = DIRECTION_BY_KEY[e.key];
        // FTUE's opening board requires an intentional movement direction;
        // Space remains a convenience on later ready/resume screens.
        if (dir || (e.code === 'Space' && !requiresDirectionalStart)) {
          e.preventDefault();
          if (dir && gameRef.current) {
            const timing = { inputTimeMs: e.timeStamp };
            const result = awaitingResumeInput
              ? releaseResumeGate(dir, 'standard', timing)
              : gameRef.current.setDirection(dir, 'standard', withTickTiming(timing));
            if (!result || !directionCanRelease(result)) return;
            if (!awaitingResumeInput) {
              void releaseReadyBoard();
            }
            syncAim();
          } else if (awaitingResumeInput) {
            releaseResumeGate();
          } else {
            void releaseReadyBoard();
          }
          return;
        }
      }

      // Handle pause toggle
      if (isPauseKey && isPlaying && !isGameOver && !isDeathSequence && !isReady) {
        e.preventDefault();
        if (HUD_COCKPIT_V1_ENABLED) {
          handlePause();
        } else if (isPaused) {
          setAwaitingResumeInput((armed) => !armed);
        } else if (!pauseRearmingRef.current) {
          gameRef.current?.pause();
        }
        return;
      }

      if (
        (e.key === 'r' || e.key === 'R')
        && !e.repeat
        && isPlaying
        && !isGameOver
        && !isPaused
        && !isReady
        && !genomeV2Overclock?.active
      ) {
        const source = e.shiftKey
          ? genomeV2Overclock?.available[1] ?? genomeV2Overclock?.available[0]
          : genomeV2Overclock?.available[0];
        if (source) {
          e.preventDefault();
          handleGenomeV2Overclock(source.source);
          return;
        }
      }

      // Existing direction logic (only when game is running)
      if (!isPlaying || isGameOver || isPaused || isReady) return;

      const dir = DIRECTION_BY_KEY[e.key];
      if (dir && gameRef.current) {
        e.preventDefault();
        gameRef.current.setDirection(
          dir,
          'standard',
          withTickTiming({ inputTimeMs: e.timeStamp })
        );
        syncAim();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isGameOver, isPaused, isDeathSequence, isReady, blockingOverlayActive, awaitingResumeInput, genomeV2Overclock, handleGenomeV2Overclock, handlePause, releaseReadyBoard, releaseResumeGate, requiresDirectionalStart, runContinuityPhase, syncAim, withTickTiming]);

  // FlickSurface delegates every direction here. Ready/resume admission is
  // atomic, and active flicks use the two-unresolved-turn mobile buffer while
  // keyboard input keeps the engine's three-turn planning depth.
  const handleFlickDirection = useCallback((
    dir: Direction,
    timing: DirectionInputTiming
  ): SetDirectionResult => {
    if (runContinuityPhase === 'activating') return 'inactive';
    if (awaitingResumeInput) {
      return releaseResumeGate(dir, 'flick', timing) ?? 'inactive';
    }
    const game = gameRef.current;
    if (!game) return 'inactive';
    const result = game.setDirection(dir, 'flick', withTickTiming(timing));
    if (isReady && directionCanRelease(result)) {
      void releaseReadyBoard();
    }
    return result;
  }, [awaitingResumeInput, isReady, releaseReadyBoard, releaseResumeGate, runContinuityPhase, withTickTiming]);

  // Select an aim system - optimistic with rollback. Nothing to authorize:
  // the server validates the id only (§6.1, §15 overturn 10).
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

  // Legacy pause-menu resume enters the same deliberate movement gate.
  const handleResume = useCallback(() => {
    setAwaitingResumeInput(true);
  }, []);

  const handleQuit = useCallback(async () => {
    const token = sessionRef.current?.access_token;
    const sessionId = currentSessionIdRef.current;
    if (token && sessionId) {
      // Energy was consumed at START, so this request never decides a refund.
      // It closes the authoritative session promptly for telemetry and makes
      // it impossible for an abandoned attempt to be submitted later.
      try {
        let leaseToken = runLeaseRef.current;
        if (
          !leaseToken &&
          interruptedRun?.sessionId === sessionId &&
          interruptedRun.phase === 'active'
        ) {
          // The read-only recovery envelope never exposes a lease. A deliberate
          // confirmed abandonment first claims the same exclusive authority a
          // continuation would claim, so a stale tab cannot end the run later.
          if (!interruptedRun.canContinue) {
            throw new Error('The active run has no resumable checkpoint');
          }
          const claimed = await resumeCheckpointedRun(token, sessionId);
          leaseToken = claimed.leaseToken;
          runLeaseRef.current = leaseToken;
          checkpointRevisionRef.current = claimed.checkpointRevision;
        }

        const response = await fetch('/api/game/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          keepalive: true,
          body: JSON.stringify({
            action: 'abandon',
            sessionId,
            reason: 'abandoned',
            ...(leaseToken ? { leaseToken } : {}),
          }),
        });
        const body = await response.json().catch(() => null);
        const record = body && typeof body === 'object'
          ? body as Record<string, unknown>
          : {};
        if (!response.ok && !(response.status === 409 && record.alreadyEnded === true)) {
          if (record.reason === 'lease_conflict') {
            const secured = await fetchActiveRun(token).catch(() => null);
            if (secured) {
              setInterruptedRun(secured);
              setRunContinuityPhase(
                secured.phase === 'active' ? 'active' : 'none'
              );
            }
            setStartError('This run is active in another window. Continue its secured state before abandoning it here.');
          } else {
            setStartError('The run is still secured. Abandonment was not confirmed; retry when connected.');
          }
          setShowAbandonConfirm(false);
          setShowInterruptedAbandonConfirm(false);
          return;
        }
      } catch (error) {
        console.error('Failed to close abandoned run:', error);
        setStartError('The run is still secured. Abandonment was not confirmed; retry when connected.');
        setShowAbandonConfirm(false);
        setShowInterruptedAbandonConfirm(false);
        return;
      }
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setShowAbandonConfirm(false);
    setShowInterruptedAbandonConfirm(false);
    setAwaitingResumeInput(false);
    cancelPauseRearm();
    runLeaseRef.current = null;
    checkpointRevisionRef.current = 0;
    startRequestRef.current = null;
    setCurrentSessionId(null);
    setInterruptedRun(null);
    setRunContinuityPhase('none');
    resetGame();
  }, [cancelPauseRearm, interruptedRun, resetGame]);

  // Restart
  const handleRestart = useCallback(() => {
    resetGame();
    runLeaseRef.current = null;
    checkpointRevisionRef.current = 0;
    setCurrentSessionId(null);
    setInterruptedRun(null);
    setRunContinuityPhase('none');
    setStreakInfo(null);
    setHypotheticalDna(null);
    setMasteryResult(null);
    setMinimalFirstRunPrompt(false);
    setRequiresDirectionalStart(false);
    setShowAbandonConfirm(false);
    setShowInterruptedAbandonConfirm(false);
    setAwaitingResumeInput(false);
    cancelPauseRearm();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [cancelPauseRearm, resetGame]);

  // ---------------------------------------------------------------------
  // Results actions (Constitution §5)
  // ---------------------------------------------------------------------
  // REPLAY keeps the rules/build but deliberately never repeats a large
  // stake. It uses one Energy when available, otherwise a lean run.
  const handleReplay = useCallback(() => {
    void handleStart(gameMode, (charge?.available ?? 0) > 0 ? 1 : 0);
  }, [charge?.available, gameMode, handleStart]);

  // SETUP: reopen the setup page over the finished run. The run's numbers
  // stay settled; only the surface changes.
  const handleOpenSetup = useCallback(() => {
    setSetupReopened(true);
  }, []);

  // The game's ONE sanctioned collect (§7.2). WP-1.04 owns the endpoint; its
  // absence resolves to a quiet `unavailable`, never an error state.
  const handleCollectTake = useCallback(async () => {
    const token = sessionRef.current?.access_token;
    if (!token || !dailyTake || dailyTake.collected) return;
    setTakeState('collecting');
    const outcome = await collectDailyTake(token);
    setTakeState(outcome.status === 'collected' ? 'collected' : outcome.status);
    if (outcome.status === 'collected') {
      setDailyTake((prev) => (prev ? { ...prev, collected: true } : prev));
    }
  }, [dailyTake]);

  // Layer 3's single recommended next action, when it opens a modal rather
  // than navigating.
  const resultsNextAction = useMemo(
    () =>
      chooseNextAction({
        isAnonymous,
        extracted: endReason === 'extracted',
        handleIsGenerated: ownIdentity?.isGenerated === true,
        isFirstCompletedRun: showFirstResultDiscovery,
        codexDiscoveries: codexDiscoveries.length,
        practice: lastRunFree,
        impactAction: CAREER_SPINE_V1_ENABLED
          ? runImpact?.recommendedAction ?? null
          : null,
      }),
    [
      codexDiscoveries.length,
      endReason,
      isAnonymous,
      lastRunFree,
      ownIdentity?.isGenerated,
      runImpact?.recommendedAction,
      showFirstResultDiscovery,
    ]
  );
  const settledAscendanceProgression = useMemo(
    () => settledYieldBreakdown
      ? buildAscendanceProgressionModel({
          generation: settledYieldBreakdown.generation,
          curveVersion: settledYieldBreakdown.curveVersion,
          frozenMultiplierBps: settledYieldBreakdown.multiplierBps,
        })
      : null,
    [settledYieldBreakdown]
  );

  const handleResultsNextAction = useCallback(() => {
    if (resultsNextAction.id === 'save-progress') setShowSaveProgress(true);
    if (resultsNextAction.id === 'claim-handle') setShowHandleClaim(true);
  }, [resultsNextAction.id]);

  // ---------------------------------------------------------------------
  // EVENT-ONLY RUN RATES.
  //
  // Growth no longer competes with charge and tactical holds in the HUD. The
  // fixed event rail states the opening rate after the first deliberate move,
  // then only speaks again when PRIMAL crosses a length-indexed stage. CYBER uses the
  // same visual grammar for speed, quantized into 0.2x bands so its per-food
  // curve does not become per-food visual noise.
  // ---------------------------------------------------------------------
  const activeGrowth = resolveGrowthProfile(
    gameRef.current?.getGrowthProfileId()
  );
  const activeDynasty = normalizeDynastyName(selectedDynasty);
  const growthFoodIndex = Math.max(1, foodEaten + 1);
  const modelledLength =
    gameRef.current?.getModelledLength() ?? Math.max(3, snake.length);
  const growthPerFood = baseGrowthForFood(
    activeGrowth,
    growthFoodIndex,
    activeDynasty,
    modelledLength
  );
  const cyberSpeedBand =
    activeDynasty === 'CYBER'
      ? speedMultiplierBand(
          gameRef.current?.getSpeed() ?? activeRuleset.speedForFood(foodEaten),
          activeRuleset.speedForFood(0)
        )
      : null;

  const [runRateCallout, setRunRateCallout] = useState<{
    id: number;
    growthRate?: number;
    speedMultiplier?: number;
  } | null>(null);
  const runRateEventIdRef = useRef(0);
  const runRateStartedRef = useRef(false);
  const lastGrowthRateRef = useRef<number | null>(null);
  const lastCyberSpeedBandRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || isGameOver) {
      runRateStartedRef.current = false;
      lastGrowthRateRef.current = null;
      lastCyberSpeedBandRef.current = null;
      setRunRateCallout(null);
      return;
    }

    // Ready and decision states own the board. Keep the rate queued until the
    // player is moving again, and never layer it over a run decision.
    if (isReady || blockingOverlayActive) {
      setRunRateCallout(null);
      return;
    }

    let growthRate: number | undefined;
    let speedMultiplier: number | undefined;

    if (!runRateStartedRef.current) {
      runRateStartedRef.current = true;
      growthRate = growthPerFood;
      if (cyberSpeedBand !== null) speedMultiplier = cyberSpeedBand;
    } else {
      if (lastGrowthRateRef.current !== growthPerFood) {
        growthRate = growthPerFood;
      }
      if (
        cyberSpeedBand !== null &&
        lastCyberSpeedBandRef.current !== cyberSpeedBand
      ) {
        speedMultiplier = cyberSpeedBand;
      }
    }

    lastGrowthRateRef.current = growthPerFood;
    lastCyberSpeedBandRef.current = cyberSpeedBand;

    if (growthRate === undefined && speedMultiplier === undefined) return;
    runRateEventIdRef.current += 1;
    setRunRateCallout({
      id: runRateEventIdRef.current,
      ...(growthRate === undefined ? {} : { growthRate }),
      ...(speedMultiplier === undefined ? {} : { speedMultiplier }),
    });
  }, [
    blockingOverlayActive,
    cyberSpeedBand,
    growthPerFood,
    isGameOver,
    isPlaying,
    isReady,
  ]);

  const handleRunRateCalloutDone = useCallback(
    () => setRunRateCallout(null),
    []
  );

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
          <p className="text-beige font-body">Sign in to play and access your account</p>
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

  const cockpitGenomeVisible = genomeRulesVersion === 2
    ? genomeV2State !== null
    : heldMutations.length > 0 || (
        genomeRun && genomeFtue?.strainTagsUnlocked === true
      );
  const suppressedStrains = new Set(
    gameRef.current?.getSuppressedStrains() ?? []
  );
  const cockpitState: RunCockpitModel['state'] = isReady
    ? 'ready'
    : runEngineFault || terminalRecoveryState !== 'idle'
      ? 'held'
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
  const cockpitStatus = runContinuityPhase === 'activating'
    ? 'Securing Energy commitment · direction held'
    : runEngineFault
      ? 'Simulation protected · secured recovery available'
    : terminalRecoveryState === 'submitting'
      ? 'Run complete · verifying outcome'
      : terminalRecoveryState === 'retrying'
        ? 'Run complete · securing outcome'
        : terminalRecoveryState === 'recover'
          ? 'Run complete · secured recovery available'
    : minimalFirstRunPrompt && isReady
    ? 'Swipe or press an arrow to move'
    : awaitingResumeInput
      ? isMobile
        ? 'Tactical hold · flick a safe direction to resume'
        : 'Tactical hold · press a safe direction to resume'
      : isReady
        ? isMobile
          ? 'Flick a direction to start'
          : 'Press Space or a direction to start'
        : continuitySafetyHold === 'connection'
          ? 'Save catching up · play continues'
          : continuitySafetyHold === 'integrity'
            ? 'Latest position pending verification · play continues'
            : choiceActive
              ? 'Run held for your decision'
              : expressionFlourish
                ? `${STRAINS[expressionFlourish.strain].name} ${expressionFlourish.tier === 3 ? 'apex' : 'expression'} online`
                : exitTile
                  ? 'Extraction window open'
                  : genomeV2RuntimeSignals.length > 0
                    ? genomeV2RuntimeSignals.map((signal) => signal.label).join(' · ')
                    : 'Run stable';
  const cockpitGenes = genomeRulesVersion === 2 && genomeV2State
    ? genomeV2State.slots.flatMap((slot): RunCockpitModel['genes'][number][] => {
        const occupant = slot.occupant;
        if (!occupant) return [];
        if (occupant.kind === 'ash') {
          return [{ id: 'phoenix', name: 'Ash', strains: [], spent: true }];
        }
        if (occupant.kind === 'gene') {
          const instance = genomeV2State.instances[occupant.instanceId];
          if (!instance) return [];
          const gene = GENOME_V2_GENES[instance.geneId];
          return [{
            id: instance.geneId,
            name: gene.name,
            strains: gene.strains,
            spent: instance.status === 'ash',
          }];
        }
        const splice = GENOME_V2_SPLICES[occupant.spliceId];
        const strains = Array.from(new Set(
          occupant.parentInstanceIds.flatMap((instanceId) => {
            const instance = genomeV2State.instances[instanceId];
            return instance ? GENOME_V2_GENES[instance.geneId].strains : [];
          })
        ));
        return [{
          id: occupant.spliceId,
          name: splice.name,
          strains,
        }];
      })
    : heldMutations.slice(0, 6).map((pick) => ({
        id: pick.id,
        name: GENES[pick.id].name,
        strains: GENES[pick.id].strains,
        spent: pick.id === 'phoenix' && phoenixTriggered,
      }));
  const cockpitGenomeV2Ladders = genomeRulesVersion === 2 && genomeV2State
    ? projectGenomeV2Ladders(genomeV2State)
    : null;
  const cockpitStrainApexTargets = cockpitGenomeV2Ladders
    ? Object.fromEntries(
        STRAIN_IDS.map((id) => [
          id,
          cockpitGenomeV2Ladders[id].tiers.find(
            (tier) => tier.points === GENOME_V2_STRAIN_THRESHOLDS.apex
          )?.effectivePoints ?? GENOME_V2_STRAIN_THRESHOLDS.apex,
        ])
      ) as Partial<Record<StrainId, number>>
    : undefined;
  const cockpitModel: RunCockpitModel = {
    dynasty: selectedDynasty,
    state: cockpitState,
    mode: cockpitMode,
    modeLabel: anomalyRun?.name ?? (lastRunFree ? 'Free play' : selectedDynasty),
    modeDetail: runContinuityPhase === 'activating'
      ? 'Verifying run'
      : awaitingResumeInput
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
    charge,
    energyCommitment: lastRunFree
      ? null
      : {
          committed: activeEnergyCommitted,
          multiplierBps: activeEnergyMultiplierBps,
          state:
            activeEnergyCommitted > 0
              ? 'charged'
              : activeEnergyMultiplierBps < 10_000
                ? 'lean'
                : 'exempt',
        },
    holds: isPlaying ? holdBudget : null,
    overclock: genomeV2Overclock,
    bankDna: genomeRulesVersion === 2 ? 0 : previewOutcome(true, activeAnomalyId),
    crashDna: genomeRulesVersion === 2 ? 0 : previewOutcome(false, activeAnomalyId),
    bankOutcomeLabel: genomeV2LiveOutcome?.bank.replace(' Yield', 'Y'),
    crashOutcomeLabel: genomeV2LiveOutcome?.crash.replace(' Yield', 'Y'),
    outcomeUnitLabel: genomeV2LiveOutcome?.label,
    constellation:
      isPlaying && constellationWindowTicks > 0
        ? {
            stars: 1 + extraFoods.length,
            fraction: constellationTicksRemaining / constellationWindowTicks,
          }
        : null,
    genes: cockpitGenes,
    strains: STRAIN_IDS.map((id) => ({
      id,
      name: STRAINS[id].name,
      color: STRAINS[id].color,
      points: strainCounts[id] ?? 0,
      tier: normalizeStrainTier(strainTiers[id]),
      suppressed: suppressedStrains.has(id),
      apexTarget: cockpitStrainApexTargets?.[id],
    })),
    showGenome: cockpitGenomeVisible,
    portalLive: Boolean(exitTile),
    portalTicksRemaining: Math.max(0, exitTicksRemaining),
  };
  const genomeV2OfferNode = genomeV2OfferPresentation && isPlaying && !isGameOver
    ? (
        <GeneChoiceOverlay
          presentation={genomeV2OfferPresentation}
          onChoose={handleGenomeV2OfferChoose}
          onRecode={handleGenomeV2OfferChoose}
          onDecline={handleGenomeV2OfferDecline}
        />
      )
    : null;
  const genomeV2PortalNode = genomeV2PortalPresentation
    && portalChoicePending
    && isPlaying
    && !isGameOver
    ? (
        <PortalChoiceOverlay
          canInfuse={genomeV2PortalPresentation.mutateState.unlocked}
          infusesUsed={genomeV2State?.portalGenomeActions ?? 0}
          snakeLength={snake.length}
          bankDna={0}
          crashDna={0}
          bankOutcomeLabel={genomeV2PortalPresentation.outcomeProjection.bank}
          crashOutcomeLabel={genomeV2PortalPresentation.outcomeProjection.crash}
          outcomeUnitLabel={genomeV2PortalPresentation.outcomeProjection.label}
          doorsPassed={genomeV2State?.carryPasses ?? 0}
          cadence={activeLadderCadence}
          ladderRung={ladderRung}
          rulesVersion={2}
          continueState={genomeV2PortalPresentation.continueState}
          mutateState={genomeV2PortalPresentation.mutateState}
          carryProjection={genomeV2PortalPresentation.carryProjection}
          mutationTerms={genomeV2PortalPresentation.mutationTerms}
          mirrorChoice={genomeV2PortalPresentation.mirrorChoice ?? undefined}
          mutationLoom={genomeV2PortalPresentation.mutationLoom
            ? {
                model: genomeV2PortalPresentation.mutationLoom,
                onCommit: handleGenomeV2PortalMutate,
              }
            : undefined}
          onBank={handleGenomeV2PortalBank}
          onPass={handleGenomeV2PortalContinue}
        />
      )
    : null;
  const cockpitDecisionDock: ReactNode = !HUD_COCKPIT_V1_ENABLED
    ? undefined
    : runEngineFault && isPlaying && !isGameOver
      ? (
          <div
            className="mx-auto w-full max-w-md space-y-3 rounded-arcade border border-venom-orange/70 bg-[linear-gradient(145deg,rgba(10,18,35,0.98),rgba(48,20,31,0.98))] p-4 text-center shadow-[0_0_34px_rgba(255,159,67,0.2)]"
            role="alert"
            data-testid="engine-recovery"
          >
            <p className="label-arcade text-venom-orange">
              Secured recovery available
            </p>
            <p className="font-body text-sm text-beige/85">
              The simulation stopped before an unsafe move could count. Load the last verified position; your committed Energy remains attached to this run.
            </p>
            <button
              type="button"
              className="btn-go min-h-[44px] px-5"
              onClick={() => window.location.reload()}
            >
              Load secured run
            </button>
          </div>
        )
    : terminalRecoveryState !== 'idle' && isPlaying && !isGameOver
      ? (
          <div
            className="mx-auto w-full max-w-md space-y-3 rounded-arcade border border-scale-blue-light/70 bg-[linear-gradient(145deg,rgba(10,18,35,0.98),rgba(33,18,61,0.98))] p-4 text-center shadow-[0_0_34px_rgba(82,190,255,0.22)]"
            role="status"
            aria-live="polite"
            data-testid="terminal-recovery"
          >
            <p className="label-arcade text-scale-blue-light">
              {terminalRecoveryState === 'recover'
                ? 'Secured run available'
                : 'Securing your outcome'}
            </p>
            <p className="font-body text-sm text-beige/85">
              {terminalRecoveryState === 'recover'
                ? 'This local ending could not become server truth. Return to the last verified position; your committed Energy remains attached to the run.'
                : 'The run is over locally. We are verifying the bank or crash before showing Results.'}
            </p>
            {terminalRecoveryState !== 'submitting' && (
              <button
                type="button"
                className="btn-go min-h-[44px] px-5"
                onClick={handleTerminalRecoveryAction}
              >
                {terminalRecoveryState === 'recover'
                  ? 'Load secured run'
                  : 'Retry now'}
              </button>
            )}
          </div>
        )
    : continuitySafetyHold === 'stale' && isPlaying && !isGameOver
      ? (
          <div
            className="mx-auto max-w-md space-y-3 rounded-arcade border border-venom-orange/70 bg-void-deep/95 p-4 text-center shadow-[0_0_30px_rgba(245,158,11,0.2)]"
            role="alert"
            data-testid="continuity-safety-hold"
          >
            <p className="label-arcade text-venom-orange">Run held safely</p>
            <p className="font-body text-sm text-beige/80">
              This run continued in another window. This copy cannot move or settle.
            </p>
            <button
              type="button"
              className="btn-go min-h-[44px] px-5"
              onClick={retryContinuityCheckpoint}
            >
              Load secured run
            </button>
          </div>
        )
    : showAbandonConfirm && isPlaying && !isGameOver
      ? (
          <AbandonRunDialog
            score={score}
            dnaCollected={dnaCollected}
            costsCharge={!lastRunFree}
            energyCommitted={activeEnergyCommitted}
            onCancel={() => setShowAbandonConfirm(false)}
            onConfirm={handleQuit}
          />
        )
      : genomeV2OfferNode
        ? genomeV2OfferNode
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
              pityStrain={choicePityStrain}
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
          : genomeV2PortalNode
            ? genomeV2PortalNode
          : genomeRulesVersion === 1 && portalChoicePending && isPlaying && !isGameOver
            ? (
                <PortalChoiceOverlay
                  canInfuse={portalCanInfuse}
                  infusesUsed={infusesCount}
                  snakeLength={snake.length}
                  bankDna={previewOutcome(true, activeAnomalyId)}
                  crashDna={previewOutcome(false, activeAnomalyId)}
                  doorsPassed={portalDoorsPassed}
                  cadence={activeLadderCadence}
                  ladderRung={ladderRung}
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
  const cockpitEventCallout = genomeV2CommitCallout && isPlaying
    ? (
        <GenomeCommitCallout
          model={genomeV2CommitCallout}
          held={awaitingResumeInput}
          onDone={handleGenomeV2CommitCalloutDone}
        />
      )
      : HUD_COCKPIT_V1_ENABLED && expressionFlourish && isPlaying
      ? (
        <ExpressionFlourish
          strain={expressionFlourish.strain}
          tier={expressionFlourish.tier}
          onDone={handleFlourishDone}
          presentation="cockpit"
        />
        )
      : genomeV2BoardFeedback && isPlaying
        ? (
            <GenomeRuntimeFeedbackCallout
              feedback={genomeV2BoardFeedback}
              onDone={handleGenomeV2BoardFeedbackDone}
            />
          )
      : undefined;

  const runRateCalloutNode: ReactNode =
    isPlaying && !blockingOverlayActive && runRateCallout ? (
      <RunRateCallout
        key={runRateCallout.id}
        growthRate={runRateCallout.growthRate}
        speedMultiplier={runRateCallout.speedMultiplier}
        onDone={handleRunRateCalloutDone}
      />
    ) : null;

  // ---------------------------------------------------------------------
  // Run Setup controls (Constitution §5). Hoisted so the one consolidated
  // setup surface and the shipped rollback screen render exactly the same
  // controls - Run Flow v1 changes where they sit, never what they are.
  // ---------------------------------------------------------------------
  /* Run mode: EARN (rewards) vs ANOMALY (weekly board, §7.2) vs FREE PLAY
     (unlimited practice, no rewards - §7.4) */
  const modeToggleNode = !noSnakeAvailable ? (
    <ModeToggle
      mode={gameMode}
      charge={charge}
      onSelect={setGameMode}
      anomalyName={anomalyBoard?.live ? anomalyBoard.anomaly.name : null}
      anomalyStrain={anomalyBoard?.live ? anomalyBoard.anomaly.strainBias : null}
    />
  ) : null;

  const energySelectorNode =
    !noSnakeAvailable && gameMode !== 'free' ? (
      <EnergyCommitmentSelector
        energy={charge}
        value={energyCommitment}
        onChange={setEnergyCommitment}
        clanBattle={clanBattleSetup}
      />
    ) : null;

  /* Weekly Anomaly board entry: modifier, timer, your best, top 10 */
  const anomalyPanelNode =
    !noSnakeAvailable && gameMode === 'anomaly' && anomalyBoard?.live ? (
      <AnomalyPanel board={anomalyBoard} />
    ) : null;

  /* Aim system picker - all four selectable from run 1 (§6.1). */
  const aimSelectorNode = !noSnakeAvailable ? (
    <div className="space-y-2">
      <p className="label-arcade">Aim System</p>
      <AimSystemSelector selected={aimSystem} onSelect={handleSelectAimSystem} />
    </div>
  ) : null;

  /* What the equipped snake brings to this run. Traits are live from the
     first food of every run (settlement reads them off the snake row
     unconditionally), so this block is NOT behind the spawn-point gate -
     only the strain pips below are, because below that gate deriveHeirloom
     really does return an empty heirloom. */
  const heirloomNode = equippedSnake ? (
    <HeirloomSummary
      traits={equippedSnake.traits}
      slots={equippedSnake.traitSlots}
    />
  ) : null;

  /* The inherited build: strains, heirlooms, lineage. */
  const buildSeedNode =
    equippedSnake &&
    GAME_CONFIG.features.genome &&
    genomeFtue?.spawnPointsUnlocked ? (
      <div className="panel mx-auto max-w-lg space-y-2 p-3 text-left" data-testid="build-seed">
        <div className="flex items-center justify-between gap-3">
          <p className="label-arcade text-cosmic">Build Seed</p>
          {genomeFtue.splicesUnlocked && (
            <Link href="/codex" className="text-xs font-body text-cosmic underline">
              Open Genome Research
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {buildSeedStrains.length > 0 ? (
            buildSeedStrains.map((strain) => (
              <StrainChip
                key={strain}
                strain={strain}
                points={buildSeedPoints[strain]}
                size="md"
              />
            ))
          ) : (
            <span className="text-xs font-body text-beige/55">
              No inherited strain affinity
            </span>
          )}
        </div>
        {/* The heirloom traits themselves moved out of this gated block and
            into HeirloomSummary above: they are live from run 1, and a
            name-only list explained nothing. Only the spawn points below
            genuinely depend on the gate. */}
        {equippedSnake.lineage && (
          <p className="text-xs font-body text-beige/60">
            Lineage strength {equippedSnake.lineage.strength}
            {equippedSnake.lineage.primary
              ? ` · ${equippedSnake.lineage.primary} primary`
              : ''}
          </p>
        )}
      </div>
    ) : null;

  /**
   * The always-visible ladder readout (WP-3.12).
   *
   * NOT gated on the ladder flag, on purpose: with the flag off this must still
   * say "Ground - the game as it shipped", which makes it a diagnostic rather
   * than decoration. The status doc records two playtests distorted by hidden
   * configuration in this wave alone.
   *
   * It reads the SELECTION because this is the PRE-run screen: that is what the
   * start request will ask for. The server still decides, and `applyStartedRun`
   * snaps this state back to the rung it chose, so a clamped ask corrects itself
   * the moment the run begins.
   */
  const activeRung = ladderRungDefinition(ladderRung);
  const ladderNoteNode = (
    <p className="font-body text-sm text-beige/70" data-testid="ladder-readout">
      Ladder:{' '}
      <span className="text-bone-white">
        Rung {activeRung.rung} · {activeRung.name}
      </span>
      {' · '}
      <span className="text-venom-orange">{activeRung.rule}</span>
    </p>
  );

  /**
   * The rung selector (WP-3.12) remains inside the setup disclosure rather than
   * adding another top-level tap, which is how the 3-tap law survives.
   *
   * Null when the flag is off, and null when the player has nothing above
   * Ground unlocked: a one-option selector is a control that teaches nothing
   * and still costs screen. Rungs above `ladderAttemptable` are rendered
   * DISABLED rather than hidden, because the point of a ladder is that you can
   * see the next step and the ones after it.
   */
  const ladderSelectorNode =
    LADDER_ENABLED && ladderAttemptable > DEFAULT_LADDER_RUNG ? (
      <div data-testid="ladder-selector">
        <p className="label-arcade mb-2 text-cosmic">Difficulty ladder</p>
        <div className="flex flex-wrap gap-2">
          {LADDER_RUNGS.map((rung) => {
            const active = ladderRung === rung.rung;
            const locked = rung.rung > ladderAttemptable;
            return (
              <button
                key={rung.rung}
                type="button"
                onClick={() => setLadderRung(rung.rung)}
                disabled={locked}
                aria-pressed={active}
                data-testid={`ladder-rung-${rung.rung}`}
                data-locked={locked ? 'true' : 'false'}
                className={`rounded-arcade border px-3 py-2 text-left font-body text-xs transition-all ${
                  locked
                    ? 'cursor-not-allowed border-scale-blue-light/20 bg-scale-blue/20 text-beige/30'
                    : active
                      ? 'border-venom-orange/70 bg-venom-orange/15 text-bone-white'
                      : 'border-scale-blue-light/40 bg-scale-blue/40 text-beige/80 hover:border-venom-orange/50'
                }`}
              >
                <span className="block font-semibold">
                  {rung.rung}. {rung.name}
                </span>
                <span className="block text-beige/60">{rung.rule}</span>
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  const startTestId =
    gameMode === 'free'
      ? 'free-play-start'
      : gameMode === 'anomaly'
        ? 'anomaly-start'
        : 'earn-start';

  // Run Flow v1 shows Results until the player asks for SETUP.
  const showResultsLayers = RUN_FLOW_V1_ENABLED && isGameOver && !setupReopened;

  const setupFavoriteRows = favoriteSetupSnakesByDynasty(
    collectionSnakes,
    equippedSnake?.id ?? null
  );
  const setupFavorites: Record<SetupDynasty, EquippedSnakeView | null> = {
    CYBER: setupFavoriteRows.CYBER
      ? equippedViewFromOwnedSnake(setupFavoriteRows.CYBER)
      : null,
    PRIMAL: setupFavoriteRows.PRIMAL
      ? equippedViewFromOwnedSnake(setupFavoriteRows.PRIMAL)
      : null,
    COSMIC: setupFavoriteRows.COSMIC
      ? equippedViewFromOwnedSnake(setupFavoriteRows.COSMIC)
      : null,
  };

  return (
    <div
      className={`consent-safe-viewport w-screen h-dvh flex flex-col overflow-hidden app-bg ${
        HUD_COCKPIT_V1_ENABLED ? 'cockpit-game-viewport' : 'relative'
      }`}
      /* The run's provenance, when it came from a challenge link: the seed
         the engine's rng was actually constructed with (§11.3). Absent on an
         ordinary run, which has no seed to report. */
      data-run-seed={challengeRun?.seed}
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
              <span className="font-mono text-sm font-bold tabular-nums text-bone-white sm:text-base">{Math.round(score).toLocaleString()}</span>
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
              <span className="font-mono text-sm font-bold tabular-nums text-venom-orange sm:text-base">{charge ? `${charge.available}/${charge.capacity}` : '—'}</span>
            </div>
          </div>

          {/* Stable one-line run ticker: the row exists from tick zero, so
              earning the first food never moves or resizes the board. */}
          {isPlaying && (
            <div className="game-hud-ticker flex h-7 items-center gap-1.5 overflow-hidden font-body text-[10px] sm:text-xs">
          {/* Tactical holds. Always present while a run is live, never only
              once it is spent - a budget you discover by hitting it is a
              trap, and the whole point of the cost being stated. */}
          <div
            data-testid="hold-budget"
            data-spent={holdBudget.remaining === 0 ? 'true' : 'false'}
            aria-label={`Tactical holds ${holdBudget.remaining} of ${holdBudget.total}`}
            className={`flex h-7 shrink-0 items-center gap-1 px-2 rounded-arcade border bg-void/80 backdrop-blur-md ${
              holdBudget.remaining === 0
                ? 'border-strike-red/60 text-strike-red'
                : 'border-scale-blue-light/50 text-beige/70'
            }`}
          >
            <span className="uppercase tracking-wider">Holds</span>
            <span className="font-mono font-bold tabular-nums">
              {holdBudget.remaining}/{holdBudget.total}
            </span>
          </div>
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
                <span className="hidden sm:inline">BANK </span>{genomeV2LiveOutcome?.bank.replace(' Yield', 'Y') ?? previewOutcome(true, activeAnomalyId)}
              </span>
              <span className="text-beige/40">·</span>
              <span className="text-beige/60">
                <span className="hidden sm:inline">crash </span>{genomeV2LiveOutcome?.crash.replace(' Yield', 'Y') ?? previewOutcome(false, activeAnomalyId)}
              </span>
            </div>
          )}
          {/* COSMIC constellation window - stars left, and how long they
              have before they calcify where they sit. Always visible on
              COSMIC while playing: the abandonment has to be a CHOICE. */}
          {isPlaying && constellationWindowTicks > 0 && (
            <div
              data-testid="constellation-chip"
              className="flex h-7 shrink-0 items-center gap-1 px-2 rounded-arcade border border-[#f0abfc]/60 bg-void/80 backdrop-blur-md"
            >
              <span className="text-[#f0abfc] font-bold">
                ★{1 + extraFoods.length}
              </span>
              <span className="text-beige/60">
                {Math.max(
                  0,
                  Math.round(
                    (constellationTicksRemaining / constellationWindowTicks) * 100
                  )
                )}
                %
              </span>
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
              suppressed={gameRef.current?.getSuppressedStrains() ?? []}
              apexTargets={cockpitStrainApexTargets}
            />
          </div>
        )}

        </div>
        </div>
      )}

      {/* The run stack is immersive. One stable exit remains available above
          Setup and Results; the application-wide rail never enters `/game`. */}
      {!isPlaying && (
        <div
          className="absolute right-4 z-30"
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
        </div>
      )}

      <SnakePickerSheet
        isOpen={snakePickerOpen}
        snakes={collectionSnakes}
        equippedSnakeId={equippedSnake?.id ?? null}
        selectingSnakeId={selectingSnakeId}
        error={snakePickerError}
        favoriteDynasty={favoritePickerDynasty}
        labHref={setupLabHref}
        onSelect={(snake) => {
          if (favoritePickerDynasty) {
            void handleChooseSetupFavorite(snake);
          } else {
            void handleChooseSetupSnake(snake);
          }
        }}
        onClose={() => {
          if (selectingSnakeId === null) {
            setSnakePickerError(null);
            setFavoritePickerDynasty(null);
            setSnakePickerOpen(false);
          }
        }}
      />

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
          <p>Pause: SPACE (P or ESC)</p>
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
      {isMobile && isPlaying && !isGameOver && (!isPaused || awaitingResumeInput) && !blockingOverlayActive && (
        <FlickSurface
          getAzimuth={getCameraAzimuth}
          onDirection={handleFlickDirection}
          onAim={syncAim}
          debugRef={inputDebugRef}
        />
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
          bankDna={genomeRulesVersion === 2 ? 0 : previewOutcome(true, activeAnomalyId)}
          crashDna={genomeRulesVersion === 2 ? 0 : previewOutcome(false, activeAnomalyId)}
          bankOutcomeLabel={genomeV2LiveOutcome?.bank}
          crashOutcomeLabel={genomeV2LiveOutcome?.crash}
          outcomeUnitLabel={genomeV2LiveOutcome?.label}
          onResume={handleResume}
          onQuit={handleQuit}
        />
      )}

      {/* Mutation choice-of-2 (engine frozen in its choice hold - never
          concurrent with the pause menu: pause is refused during the hold) */}
      {!HUD_COCKPIT_V1_ENABLED && genomeV2OfferNode}

      {!HUD_COCKPIT_V1_ENABLED && !genomeV2OfferNode && (choiceOptions && isPlaying && !isGameOver && genomeRun ? (
        <GeneChoiceOverlay
          options={choiceOptions}
          held={heldMutations}
          strainCounts={strainCounts}
          source={choiceSource}
          showStrains={genomeFtue?.strainTagsUnlocked === true}
          splicesUnlocked={genomeFtue?.splicesUnlocked === true}
          discoveredSplices={discoveredSplices}
          pityStrain={choicePityStrain}
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

      {!HUD_COCKPIT_V1_ENABLED && genomeV2PortalNode}

      {!HUD_COCKPIT_V1_ENABLED && !genomeV2PortalNode && genomeRulesVersion === 1 && portalChoicePending && isPlaying && !isGameOver && (
        <PortalChoiceOverlay
          canInfuse={portalCanInfuse}
          infusesUsed={infusesCount}
          snakeLength={snake.length}
          bankDna={previewOutcome(true, activeAnomalyId)}
          crashDna={previewOutcome(false, activeAnomalyId)}
          doorsPassed={portalDoorsPassed}
          cadence={activeLadderCadence}
          ladderRung={ladderRung}
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
        <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-void-deep/85 p-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur-sm sm:p-4 sm:pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <div
            className={`panel-elevated my-auto min-w-0 w-full max-w-3xl space-y-6 p-2 text-center animate-pop-in sm:p-8 ${
              isGameOver
                ? endReason === 'extracted'
                  ? '[--glow:#4ade80]'
                  : '[--glow:#f43f5e]'
                : '[--glow:#22d3ee]'
            }`}
          >
            {/* Constitution §5 / WP-1.06: one consolidated Run Setup page and
                a three-layer Results screen. The shipped screen below is the
                rollback path and is reached with NEXT_PUBLIC_RUN_FLOW_V1 off. */}
            {interruptedRun ? (
              <section
                className="space-y-5 text-left"
                data-testid="interrupted-run-recovery"
              >
                <div className="space-y-2">
                  <p className="label-arcade text-[#7df9ff]">Run secured</p>
                  <h2 className="heading-display text-3xl text-bone-white">
                    {interruptedRun.phase === 'settling' || interruptedRun.phase === 'terminal'
                      ? 'Result secured'
                      : interruptedRun.phase === 'incompatible'
                        ? 'Run needs an update'
                        : 'Continue your run'}
                  </h2>
                  <p className="font-body text-beige/75">
                    {interruptedRun.phase === 'settling' || interruptedRun.phase === 'terminal'
                      ? 'The server has locked this outcome and is finishing its progression rewards.'
                      : interruptedRun.phase === 'preparing'
                        ? 'Launch preparation stopped before Energy was committed. The server kept the request receipt so retrying could never charge twice.'
                      : interruptedRun.phase === 'incompatible'
                        ? 'This run belongs to an older gameplay version and cannot be resumed safely. Its committed Energy remains attached until you explicitly release it.'
                        : 'This unfinished run still owns its committed Energy. A new run cannot replace it, and nothing has been silently forfeited.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-arcade border border-scale-blue-light/40 bg-void/55 p-4">
                  <div>
                    <p className="label-arcade">Committed</p>
                    <p className="font-mono text-xl text-venom-orange">
                      {interruptedRun.energyCommitted} Energy
                    </p>
                  </div>
                  <div>
                    <p className="label-arcade">State</p>
                    <p className="font-display uppercase text-bone-white">
                      {interruptedRun.phase === 'settling' || interruptedRun.phase === 'terminal'
                        ? settlingRecoveryState === 'retry'
                          ? 'Safe · retry ready'
                          : 'Opening results'
                        : interruptedRun.phase === 'incompatible'
                          ? 'Update required'
                          : interruptedRun.phase === 'legacy'
                          ? 'Legacy run open'
                          : interruptedRun.canContinue
                            ? 'Ready to continue'
                            : 'Securing checkpoint'}
                    </p>
                  </div>
                </div>
                {!interruptedRun.canContinue &&
                  interruptedRun.phase !== 'settling' &&
                  interruptedRun.phase !== 'terminal' &&
                  interruptedRun.phase !== 'incompatible' && (
                  <p className="font-body text-sm text-beige/60">
                    The latest server-verified continuation is not available yet.
                    Retry when the connection is stable, or explicitly abandon the run.
                  </p>
                )}
                {(interruptedRun.phase === 'settling' || interruptedRun.phase === 'terminal') && (
                  <p className="font-body text-sm text-beige/70">
                    Your result is locked on the server. It cannot be abandoned
                    or replayed while progression finishes. Results will open
                    automatically when its canonical receipt is ready, and you
                    can start a new run in the meantime — this one is safe.
                  </p>
                )}
                {showInterruptedAbandonConfirm &&
                interruptedRun.phase !== 'settling' &&
                interruptedRun.phase !== 'terminal' ? (
                  <div
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="interrupted-abandon-title"
                    className="space-y-3 rounded-arcade border border-strike-red/70 bg-strike-red/10 p-4"
                  >
                    <p id="interrupted-abandon-title" className="font-display text-bone-white">
                      Abandon this run?
                    </p>
                    <p className="font-body text-sm text-beige/70">
                      {interruptedRun.phase === 'preparing'
                        ? 'No Energy was consumed. This releases only the interrupted launch receipt so you can launch anew.'
                        : 'This is the only action that forfeits the unfinished run. Committed Energy is not refunded.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-danger min-h-[44px] px-5" onClick={handleQuit}>
                        Abandon run
                      </button>
                      <button
                        type="button"
                        className="btn-neutral min-h-[44px] px-5"
                        onClick={() => setShowInterruptedAbandonConfirm(false)}
                      >
                        Keep run
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-go min-h-[44px] px-6"
                      disabled={
                        isStarting ||
                        (interruptedRun.phase === 'settling' &&
                          settlingRecoveryState !== 'retry')
                      }
                      onClick={() => {
                        setIsStarting(true);
                        setStartError(null);
                        const continueAction = interruptedRun.phase === 'settling'
                          ? recoverSettlingResult()
                          : interruptedRun.phase === 'terminal'
                            ? recoverServerRun()
                          : interruptedRun.phase === 'preparing' && interruptedRun.startIntent
                            ? repairInterruptedStart()
                          : interruptedRun.canContinue
                            ? continueInterruptedRun()
                            : recoverServerRun();
                        void continueAction
                          .then((resolved) => {
                            if (
                              (interruptedRun.phase === 'settling' ||
                                interruptedRun.phase === 'terminal') &&
                              resolved === false
                            ) {
                              setStartError(
                                'The result is still secured. Retry in a moment.'
                              );
                            }
                          })
                          .catch((error) => {
                            console.error('Failed to retry run recovery:', error);
                            setStartError('The run is still secured. Retry when the connection returns.');
                          })
                          .finally(() => setIsStarting(false));
                      }}
                    >
                      {isStarting
                        ? 'Checking…'
                        : interruptedRun.phase === 'settling'
                          ? settlingRecoveryState === 'retry'
                            ? 'Retry result'
                            : 'Opening results…'
                          : interruptedRun.phase === 'terminal'
                            ? 'Retry result'
                          : interruptedRun.canContinue
                          ? 'Continue run'
                          : 'Check again'}
                    </button>
                    {/* A secured PAST outcome is not a reason to withhold the
                        next run. Its value is already server-locked and cannot
                        be lost, so this surface reports progress instead of
                        holding the account hostage — the same philosophy the
                        checkpoint path applies when it lets play continue. The
                        start itself stays server-authoritative: the route folds
                        the stranded outcome first and only then opens the new
                        run, so nothing here can skip a settlement. */}
                    {(interruptedRun.phase === 'settling' ||
                      interruptedRun.phase === 'terminal') && (
                      <button
                        type="button"
                        data-testid="interrupted-run-start-new"
                        className="min-h-[44px] px-4 font-body text-sm text-scale-blue-light underline"
                        disabled={isStarting || !equippedSnake}
                        onClick={() => {
                          void handleStart(gameMode);
                        }}
                      >
                        Start a new run
                      </button>
                    )}
                    {interruptedRun.phase !== 'settling' &&
                    interruptedRun.phase !== 'terminal' && (
                      <button
                        type="button"
                        className="min-h-[44px] px-4 font-body text-sm text-strike-red"
                        onClick={() => setShowInterruptedAbandonConfirm(true)}
                      >
                        Abandon…
                      </button>
                    )}
                  </div>
                )}
                {startError && <p className="font-body text-sm text-strike-red">{startError}</p>}
              </section>
            ) : RUN_FLOW_V1_ENABLED ? (
              showResultsLayers ? (
                <RunResults
                  outcome={endReason === 'extracted' ? 'extracted' : 'crashed'}
                  practice={lastRunFree}
                  score={score}
                  dnaCredited={settledCredited}
                  yieldDna={settledYield ?? hypotheticalDna}
                  yieldBreakdown={settledYieldBreakdown}
                  energyCommitted={activeEnergyCommitted}
                  commitmentMultiplierBps={activeEnergyMultiplierBps}
                  clanBattle={clanBattleResult}
                  take={dailyTake}
                  takeState={takeState}
                  onCollectTake={() => {
                    void handleCollectTake();
                  }}
                  impact={runImpact}
                  settlementPending={settlementSecuredPending}
                  nextAction={resultsNextAction}
                  onNextAction={handleResultsNextAction}
                  onReplay={handleReplay}
                  onSetup={handleOpenSetup}
                  replayPending={isStarting}
                  replayDisabled={isStarting || !equippedSnake}
                  replayEnergy={(charge?.available ?? 0) > 0 ? 1 : 0}
                  shareArtifact={
                    lastGenomeCard ? <GenomeCard model={lastGenomeCard} /> : null
                  }
                  genomeRecap={settledGenomeRecap}
                  studyGenomeHref={genomeResearchHref({
                    genomeV2Enabled: GENOME_V2_ENABLED,
                    workbenchEnabled: WORKBENCH_V1_ENABLED,
                    sessionId: currentSessionId,
                    hasGenomeRecap: settledGenomeRecap !== null,
                    practice: lastRunFree,
                    settlementPending: settlementSecuredPending,
                  })}
                  ascendanceProgression={settledAscendanceProgression}
                  collisionDetail={collisionDiagnosticLabel(collisionDiagnostic)}
                />
              ) : (
                <RunSetupPanel
                  labHref={setupLabHref}
                  snake={
                    equippedSnake
                      ? {
                          id: equippedSnake.id,
                          name: equippedSnake.name,
                          generation: equippedSnake.generation,
                          dynasty: normalizeDynastyName(equippedSnake.dynasty),
                        }
                      : null
                  }
                  noSnakeAvailable={noSnakeAvailable}
                  rulesetExplainer={
                    equippedSnake
                      ? rulesetExplainer[normalizeDynastyName(equippedSnake.dynasty)]
                      : ''
                  }
                  masteryLevel={
                    equippedSnake
                      ? masteryLevels[normalizeDynastyName(equippedSnake.dynasty)] ?? null
                      : null
                  }
                  modeLabel={
                    gameMode === 'free'
                      ? 'Free Play'
                      : gameMode === 'anomaly'
                        ? 'Anomaly run'
                        : 'Earning run'
                  }
                  aimLabel={getAimSystem(aimSystem).name}
                  challengeNote={challengeRun ? challengeRunNote(challengeRun) : null}
                  startLabel={
                    gameMode === 'free'
                      ? 'Free Play'
                      : gameMode === 'anomaly'
                        ? `Run the Anomaly · ${energyCommitment > 0 ? `${energyCommitment} Energy` : 'Lean'}`
                        : `Play · ${energyCommitment > 0 ? `${energyCommitment} Energy` : 'Lean'}`
                  }
                  startTestId={startTestId}
                  isStarting={isStarting}
                  onChooseSnake={() => {
                    setSnakePickerError(null);
                    setFavoritePickerDynasty(null);
                    setSnakePickerOpen(true);
                  }}
                  favorites={setupFavorites}
                  favoriteBusyId={selectingSnakeId}
                  onFavoriteDock={(dynasty, favorite) => {
                    if (favorite?.id) {
                      const owned = collectionSnakes.find((row) => row.id === favorite.id);
                      if (owned) void handleChooseSetupSnake(owned);
                      return;
                    }
                    setSnakePickerError(null);
                    setFavoritePickerDynasty(dynasty);
                    setSnakePickerOpen(true);
                  }}
                  onStart={() => {
                    void handleStart(gameMode);
                  }}
                  startError={startError}
                  heirloom={heirloomNode}
                  energySelector={energySelectorNode}
                  modeToggle={modeToggleNode}
                  ladderNote={ladderNoteNode}
                  ladderSelector={ladderSelectorNode}
                  anomalyPanel={anomalyPanelNode}
                  aimSelector={aimSelectorNode}
                  buildSeed={buildSeedNode}
                />
              )
            ) : (
              <>
            {isGameOver ? (
              <>
                {settlementSecuredPending && !lastRunFree ? (
                  <div className="space-y-1">
                    <h2
                      className="heading-display text-4xl text-[#7df9ff] text-glow"
                      data-testid="gameover-finalizing"
                    >
                      Run Secured
                    </h2>
                    <p className="text-beige/60 font-body text-sm tracking-wide uppercase">
                      Outcome finalizing on the server
                    </p>
                  </div>
                ) : lastRunFree ? (
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
                    {collisionDiagnosticLabel(collisionDiagnostic) ? (
                      <p
                        className="font-mono text-xs text-beige/75"
                        data-testid="gameover-collision-diagnostic"
                      >
                        {collisionDiagnosticLabel(collisionDiagnostic)}
                      </p>
                    ) : null}
                  </div>
                )}
                {settlementSecuredPending && !lastRunFree ? (
                  <div
                    className="panel-glow [--glow:#22d3ee] mx-auto max-w-lg px-5 py-4 text-left"
                    data-testid="legacy-results-settlement-pending"
                    role="status"
                  >
                    <p className="label-arcade text-[#7df9ff]">Run secured</p>
                    <p className="mt-1 font-body text-sm text-beige/85">
                      DNA and Career progress are finalizing on the server. You can safely leave this screen.
                    </p>
                  </div>
                ) : null}
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
                    Score:{' '}
                    <span className="font-bold text-venom-orange">
                      {settlementSecuredPending && !lastRunFree
                        ? 'Finalizing…'
                        : Math.round(score).toLocaleString()}
                    </span>
                  </p>
                  <p className="text-2xl text-bone-white flex items-center justify-center gap-2">
                    <IconDna size={22} className="text-venom-orange" />
                    DNA:{' '}
                    {settlementSecuredPending && !lastRunFree ? (
                      <span className="font-bold text-[#7df9ff]">Finalizing…</span>
                    ) : lastRunFree ? (
                      // The stakes they practiced for: server-priced when the
                      // end POST succeeded, local recompute as the fallback
                      <span
                        className="font-bold text-beige/80"
                        data-testid="gameover-hypothetical"
                      >
                        would have banked +
                        {hypotheticalDna ?? (genomeRulesVersion === 2
                          ? (endReason === 'extracted'
                              ? genomeV2LiveOutcome?.bank
                              : genomeV2LiveOutcome?.crash) ?? 'settling'
                          : previewOutcome(endReason === 'extracted'))}
                      </span>
                    ) : endReason === 'extracted' ? (
                      <span className="font-bold text-rarity-uncommon">
                        {genomeRulesVersion === 2
                          ? genomeV2LiveOutcome?.bank ?? 'Genome Yield settling'
                          : `${dnaCollected} → +${previewOutcome(true)}`}
                      </span>
                    ) : (
                      <span className="font-bold text-venom-orange text-glow-orange">
                        {genomeRulesVersion === 2
                          ? genomeV2LiveOutcome?.crash ?? 'Genome Yield settling'
                          : `${dnaCollected} → +${previewOutcome(false)}`}
                      </span>
                    )}
                  </p>
                  {/* The run's build: mutations held at the end */}
                  {!settlementSecuredPending && heldMutations.length > 0 && (
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
                  {!settlementSecuredPending && streakInfo && (
                    <p className="text-lg text-beige flex items-center justify-center gap-1.5">
                      <IconFlame size={18} className="text-venom-orange" />
                      Day <span className="font-bold text-venom-orange">{streakInfo.current}</span> streak
                    </p>
                  )}
                  {/* Mastery XP (Design v2 §7.1) - banked XP from this
                      extraction + the level-up moment when a rung falls */}
                  {!settlementSecuredPending && masteryResult && (
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
                      {lastRunFree
                        ? 'Your first run is complete.'
                        : settlementSecuredPending
                          ? 'Your first run is secured.'
                          : 'You earned DNA.'}
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

                {!settlementSecuredPending && lastGenomeCard && (
                  <GenomeCard model={lastGenomeCard} />
                )}

                {codexDiscoveries.length > 0 && (
                  <div className="panel p-3 text-left" data-testid="codex-discoveries">
                    <p className="label-arcade mb-2 text-cosmic">New Genome discoveries</p>
                    <div className="flex flex-wrap gap-2">
                      {codexDiscoveries.map((discovery) => (
                        <span
                          key={`${discovery.type}:${discovery.entryId}`}
                          className="rounded-arcade border border-cosmic/50 bg-cosmic/10 px-2 py-1 text-xs font-body text-bone-white"
                        >
                          {codexEntryName(discovery.type, discovery.entryId, discovery.rulesVersion)}
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
                {currentSessionId && session?.access_token && !lastRunFree && !settlementSecuredPending && (
                  <RunInsightCard
                    sessionId={currentSessionId}
                    accessToken={session.access_token}
                  />
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
                    {heirloomNode}
                    {buildSeedNode}
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

            {modeToggleNode}
            {energySelectorNode}
            {anomalyPanelNode}
            {aimSelectorNode}

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
              ) : (
                /* The earning start button. There is no longer a
                   zero-energy branch beside it: an empty allotment does not
                   remove this button, disable it, or replace it with an
                   invitation to practice (Constitution §8.6). The run
                   starts either way; only the harvest differs, and the
                   ModeToggle says so above. */
                <button
                  onClick={() => handleStart(gameMode === 'anomaly' ? 'anomaly' : 'earn')}
                  disabled={isStarting || !equippedSnake || settlementSecuredPending}
                  data-testid={gameMode === 'anomaly' ? 'anomaly-start' : 'earn-start'}
                  className={`btn-go inline-flex items-center gap-2 px-8 py-4 text-xl min-h-[44px] ${
                    isStarting || !equippedSnake || settlementSecuredPending
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
                      <span className="inline-flex items-center gap-1 text-base">
                        <IconBolt size={16} />
                        {energyCommitment > 0 ? `${energyCommitment} Energy` : 'Lean'}
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* After a practice run, the earning path is always offered —
                  it is never conditioned on stored Energy. */}
              {isGameOver && lastRunFree && gameMode === 'free' && (
                <button
                  onClick={() => setGameMode('earn')}
                  data-testid="switch-to-earning"
                  className="btn-neutral inline-flex items-center gap-1.5 px-6 py-3 min-h-[44px]"
                >
                  Switch to Earning
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

            {/* Guests: secondary post-run CTA for account recovery — progress
                is already server-secured, and this never interrupts a run. */}
            {isGameOver && isAnonymous && (
              <button
                onClick={() => setShowSaveProgress(true)}
                data-testid="gameover-save-progress"
                className="block mx-auto text-sm font-body text-venom-orange underline hover:text-venom-orange-light transition-colors min-h-[44px]"
              >
                Playing as guest — add recovery for this account
              </button>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Account-recovery modal (internal legacy ID: save-progress). */}
      <AccountUpgradeModal
        isOpen={showSaveProgress}
        onClose={() => setShowSaveProgress(false)}
      />

      {!HUD_COCKPIT_V1_ENABLED && runEngineFault && isPlaying && !isGameOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-transparent p-4">
          <div
            className="max-w-sm space-y-3 rounded-arcade border border-venom-orange/70 bg-[linear-gradient(145deg,rgba(10,18,35,0.98),rgba(48,20,31,0.98))] p-5 text-center shadow-[0_0_34px_rgba(255,159,67,0.2)]"
            role="alert"
            data-testid="engine-recovery"
          >
            <p className="font-display text-venom-orange">Secured recovery available</p>
            <p className="font-body text-sm text-beige/85">
              The simulation stopped before an unsafe move could count. Load the last verified position; your committed Energy remains attached to this run.
            </p>
            <button
              type="button"
              className="btn-go min-h-[44px] px-5"
              onClick={() => window.location.reload()}
            >
              Load secured run
            </button>
          </div>
        </div>
      )}

      {!HUD_COCKPIT_V1_ENABLED && terminalRecoveryState !== 'idle' && isPlaying && !isGameOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-transparent p-4">
          <div
            className="max-w-sm space-y-3 rounded-arcade border border-scale-blue-light/70 bg-[linear-gradient(145deg,rgba(10,18,35,0.98),rgba(33,18,61,0.98))] p-5 text-center shadow-[0_0_34px_rgba(82,190,255,0.22)]"
            role="status"
            data-testid="terminal-recovery"
          >
            <p className="font-display text-scale-blue-light">
              {terminalRecoveryState === 'recover'
                ? 'Secured run available'
                : 'Securing your outcome'}
            </p>
            <p className="font-body text-sm text-beige/85">
              {terminalRecoveryState === 'recover'
                ? 'Load the last verified position. Your committed Energy remains attached to the run.'
                : 'The local run is complete; Results open after server verification.'}
            </p>
            {terminalRecoveryState !== 'submitting' && (
              <button type="button" className="btn-go min-h-[44px] px-5" onClick={handleTerminalRecoveryAction}>
                {terminalRecoveryState === 'recover' ? 'Load secured run' : 'Retry now'}
              </button>
            )}
          </div>
        </div>
      )}

      {!HUD_COCKPIT_V1_ENABLED && terminalRecoveryState === 'idle' && continuitySafetyHold === 'stale' && isPlaying && !isGameOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-void-deep/70 p-4 backdrop-blur-sm">
          <div className="max-w-sm space-y-3 rounded-arcade border border-venom-orange/70 bg-void-deep p-5 text-center">
            <p className="font-display text-venom-orange">Run held safely</p>
            <p className="font-body text-sm text-beige/80">
              This run continued in another window.
            </p>
            <button type="button" className="btn-go min-h-[44px] px-5" onClick={retryContinuityCheckpoint}>
              Load secured run
            </button>
          </div>
        </div>
      )}

      {/* Handle claim ceremony (Identity v1 section 3.3): offered after
          the first banked run while the name is still generated */}
      <HandleClaimModal
        isOpen={showHandleClaim}
        onClose={() => {
          setShowHandleClaim(false);
        }}
        onClaimed={(handle) => {
          setOwnIdentity((prev) =>
            prev ? { ...prev, handle, displayHandle: handle, isGenerated: false } : prev
          );
          showToast(`You are ${handle} now`, 'triumph', 4000);
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
        onOverclock={handleGenomeV2Overclock}
        pauseDisabled={pauseRearming && !awaitingResumeInput}
        showPause={!isGameOver && !isReady && !isPaused && !blockingOverlayActive}
        showAbandon={awaitingResumeInput && !showAbandonConfirm}
        pauseLabel="Pause game (Space)"
        decisionDock={cockpitDecisionDock}
        eventCallout={cockpitEventCallout}
        rateCallout={runRateCalloutNode}
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
              {runContinuityPhase === 'activating' ? (
                <>
                  <h2 className="heading-display text-3xl text-[#7df9ff] sm:text-5xl">
                    Securing run…
                  </h2>
                  <p className="text-beige/70 text-sm font-body">
                    Your direction is held until the Energy commitment is verified.
                  </p>
                </>
              ) : minimalFirstRunPrompt ? (
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
                  {isMobile ? (
                    <>
                      <p className="text-bone-white text-lg font-body">Flick a safe direction to start</p>
                      <p className="text-beige/60 text-sm font-body">Short flicks steer - chain them for fast turns</p>
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
          foodPositions={litFoods}
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
            genomeV2Board={genomeV2Board}
            terrain={terrain}
            revivePhaseTicksRemaining={revivePhaseTicksRemaining}
            constellationGlyph={constellationGlyph}
            exitTile={exitTile}
            exitTile2={exitTile2}
            anomalyId={isPlaying ? activeAnomalyId : null}
            exitTicksRemaining={exitTicksRemaining}
            mutationTile={mutationTile}
            mutationTicksRemaining={mutationTicksRemaining}
            torus={torus}
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
 * COSMIC constellation palette - three distinct hues, all outside the violet
 * mutation family and the cyan portal identity. The whole wave shares one
 * hue, so a constellation reads as ONE object with a shared deadline rather
 * than as three unrelated foods. It used to mean "same hue = chainable";
 * WP-3.13 deleted the chain and left the glyph what it always visually was.
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
  genomeV2Board: GenomeV2BoardProjection;
  terrain: readonly TerrainBlock[];
  revivePhaseTicksRemaining: number;
  constellationGlyph: number | null;
  exitTile: Position | null;
  /** Second portal of the Twin Exits anomaly pair (§7.2), null otherwise. */
  exitTile2: Position | null;
  /** Active anomaly modifier while playing (drives the Blackout mask). */
  anomalyId: AnomalyId | null;
  exitTicksRemaining: number;
  mutationTile: Position | null;
  mutationTicksRemaining: number;
  /** True on a dynasty whose edges wrap instead of killing (COSMIC). */
  torus: boolean;
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
  genomeV2Board,
  terrain,
  revivePhaseTicksRemaining,
  constellationGlyph,
  exitTile,
  exitTile2,
  anomalyId,
  exitTicksRemaining,
  mutationTile,
  mutationTicksRemaining,
  torus,
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
  const materialProfile = getGameMaterialProfile(dynasty);
  // COSMIC foods carry their constellation glyph color; other dynasties
  // keep the dynasty accent
  const foodColor =
    constellationGlyph !== null
      ? GLYPH_COLORS[constellationGlyph % GLYPH_COLORS.length]
      : HUD_COCKPIT_V1_ENABLED
        ? materialProfile.lighting.objectiveColor
        : theme.accent;

  // Target-bearing cells for the aim systems, rebuilt per tick (Gridlock
  // alignment + Firefly pursuit). Food outranks portal outranks mutation
  // on Gridlock ties - the priority lives in aimUtils; this is inventory.
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
  const snakeTerrain = useMemo<TerrainBlock[]>(() => {
    const cells = new Set(terrain.map((cell) => `${cell.x}:${cell.z}`));
    const combined = [...terrain];
    for (const cell of genomeV2Board.occupiedCells) {
      const key = `${cell.x}:${cell.z}`;
      if (cells.has(key)) continue;
      cells.add(key);
      combined.push({
        x: cell.x,
        z: cell.z,
        source: 'ladder',
        formingTicks: 0,
        formingTotal: 0,
        solid: true,
      });
    }
    return combined;
  }, [genomeV2Board.occupiedCells, terrain]);
  const aimObstacles = useMemo(
    () => snakeTerrain
      .filter((cell) => cell.solid)
      .map((cell) => ({ x: cell.x, z: cell.z })),
    [snakeTerrain]
  );

  return (
    <group position={cameraShake}>
      {/* The released arena remains byte-for-byte the default rollback. */}
      {HUD_COCKPIT_V1_ENABLED ? (
        <ArenaAssembly
          gridSize={GAME_CONFIG.board.gridSize}
          dynasty={dynasty}
          torus={torus}
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
            torus={torus}
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
        obstacles={aimObstacles}
        gridSize={GAME_CONFIG.board.gridSize}
        aimSystem={aimSystem}
        targets={aimTargets}
        bufferRef={bufferRef}
        color={HUD_COCKPIT_V1_ENABLED
          ? materialProfile.lighting.objectiveColor
          : theme.accent}
        laneColor={HUD_COCKPIT_V1_ENABLED
          ? materialProfile.arena.rimColor
          : theme.primary}
      />

      <GenomeBoardEffects gildedCells={gildedCells} genomeV2={genomeV2Board} />
      <TerrainBlocks terrain={terrain} />

      {/* Snake - one instanced body draw + a head mesh with eyes, both
          reading tick-alpha interpolated positions from the buffer every
          frame (growth never touches React). Box fallback while the GLB
          streams shares the identical Core.

          `terrain` and `wrapActive` feed the trail's earned-fusion metric
          (WP-3.07): solid blocks pack like walls, and a WRAPPING edge must
          not, or the readout pays out for hugging a seam that is not actually
          spending any space. Both fallback and GLB variants get them - the
          Suspense swap must never change what the body is saying.

          WP-3.13 fed this from `torus` instead of `fluxPhase === 'open'`. On
          COSMIC the answer is now permanently true rather than true for 75
          ticks in every 125: a torus has no walls, so its edges are NEVER
          packing neighbours. Left reading a deleted phase this would have
          defaulted to false and quietly paid the player for coiling along a
          seam that costs them nothing. */}
      <Suspense
        fallback={
          <InstancedSnakeFallback
            bufferRef={bufferRef}
            dynasty={dynasty}
            direction={direction}
            strainBands={strainBands}
            terrain={snakeTerrain}
            wrapActive={torus}
            revivePhaseActive={revivePhaseTicksRemaining > 0}
          />
        }
      >
        <InstancedSnake
          bufferRef={bufferRef}
          dynasty={dynasty}
          direction={direction}
          strainBands={strainBands}
          terrain={snakeTerrain}
          wrapActive={torus}
          revivePhaseActive={revivePhaseTicksRemaining > 0}
        />
      </Suspense>

      {/* Food - clean voxel block; COSMIC tints the whole wave with its
          constellation hue, so the wave reads as one object */}
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

      {/* Mutation food - violet double helix. It participates in Gridlock's
          alignment inventory at the lowest priority, but never steers
          Deadeye or Pathline - it stays an optional detour. */}
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
