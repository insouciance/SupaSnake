'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { trackEvent } from '@/lib/analytics/posthog';
import { themeManager } from '@/lib/theme/ThemeManager';
import type {
  Direction,
  DirectionInputSource,
  Position,
  SetDirectionResult,
} from '@/lib/game/SnakeGameLogic';
import { TrainingRun, type TrainingRunSnapshot } from '@/lib/game/training/TrainingRun';
import {
  createInterpolationBuffer,
  recordTick,
  resetInterpolationBuffer,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import {
  TRAINING_EXERCISES,
  createCircuitReferences,
  createSandboxScenario,
  createTrainingScenario,
  mergeTrainingProfile,
  newTrainingReference,
  recordVerifiedTrainingAttempt,
  type SandboxScenarioConfig,
  type TrainingAttemptResult,
  type TrainingBestSummary,
  type TrainingDifficulty,
  type TrainingExerciseId,
  type TrainingGuidance,
  type TrainingProfile,
  type TrainingPreset,
  type TrainingScenario,
} from '@/shared/game/training';
import { GameEnvironment } from '@/components/game/screen/GameEnvironment';
import { GAME_SCREEN_COLORS } from '@/components/game/screen/gameScreenTokens';
import { RunCockpit } from '@/components/game/cockpit/RunCockpit';
import type { RunCockpitModel } from '@/components/game/cockpit/types';
import { ArenaAssembly } from '@/components/game/arena/ArenaAssembly';
import { InstancedSnake, InstancedSnakeFallback } from '@/components/game/InstancedSnake';
import { AssetGate } from '@/components/game/AssetGate';
import { FoodBeacon } from '@/components/game/FoodBeacon';
import { DynamicLights } from '@/components/game/DynamicLights';
import {
  CameraRig,
  CANONICAL_POLAR,
  COCKPIT_FIT_SCALE,
  COCKPIT_FRAME_MARGIN,
  COCKPIT_TARGET_Y,
  DEFAULT_AZIMUTH,
} from '@/components/game/CameraRig';
import { CANONICAL_FOV } from '@/components/game/canonicalViewpoint';
import { FlickSurface } from '@/components/game/FlickSurface';
import { TrainingPathRenderer } from '@/components/game/training/TrainingPathRenderer';
import { DEFAULT_SANDBOX_PATH } from '@/components/training/PathComposer';
import { TrainingHub } from '@/components/training/TrainingHub';
import { TrainingRecap } from '@/components/training/TrainingRecap';

const EMPTY_PROFILE: TrainingProfile = { live: false, bests: [], recent: [] };
const DIRECTION_BY_KEY: Record<string, Direction> = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
  W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT',
};

type TrainingView = 'hub' | 'run' | 'recap';
type VerificationState = 'verifying' | 'verified' | 'offline' | 'failed' | 'diagnostic';
type TrainingLaunchSource = 'focus' | 'sandbox' | 'circuit' | 'retry' | 'variant';

const TRAINING_EVENTS = {
  ATTEMPT_STARTED: 'training_attempt_started',
  ATTEMPT_COMPLETED: 'training_attempt_completed',
  ATTEMPT_VERIFIED: 'training_attempt_verified',
  PRESET_SAVED: 'training_preset_saved',
} as const;

interface CircuitState {
  references: ReturnType<typeof createCircuitReferences>;
  index: number;
  completed: TrainingAttemptResult[];
}

interface TrainingBoardProps {
  scenario: TrainingScenario;
  snapshot: TrainingRunSnapshot;
  guidance: TrainingGuidance;
  ghost: TrainingBestSummary['trace'];
  bufferRef: { readonly current: InterpolationBuffer | null };
  azimuthRef: { current: number };
  isMobile: boolean;
}

function TrainingBoard({
  scenario,
  snapshot,
  guidance,
  ghost,
  bufferRef,
  azimuthRef,
  isMobile,
}: TrainingBoardProps) {
  const theme = themeManager.getTheme(scenario.dynasty);
  const target = snapshot.target;
  const foodPosition: Position | null = target ? { ...target, y: 0 } : null;
  const cameraCenter = scenario.gridSize / 2;

  return (
    <Canvas
      camera={{
        position: [cameraCenter, cameraCenter * 2.4, cameraCenter * 1.9],
        fov: CANONICAL_FOV,
      }}
      shadows
      dpr={isMobile ? [1, 1.5] : [1, 2]}
    >
      <fog attach="fog" args={[GAME_SCREEN_COLORS.void, 39, 72]} />
      <hemisphereLight args={['#a9c3d5', GAME_SCREEN_COLORS.graphiteDeep, 0.42]} />
      <ambientLight intensity={0.12} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={0.92}
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
        dynasty={scenario.dynasty}
        score={snapshot.progress}
        isDeathSequence={snapshot.state.isDeathSequence}
        foodPositions={foodPosition ? [foodPosition] : []}
        gridSize={scenario.gridSize}
        intensityScale={0.62}
      />
      <Suspense fallback={null}>
        <ArenaAssembly
          gridSize={scenario.gridSize}
          dynasty={scenario.dynasty}
          torus={scenario.dynasty === 'COSMIC'}
        />
        <TrainingPathRenderer
          scenario={scenario}
          guidance={guidance}
          tick={snapshot.tick}
          progress={snapshot.progress}
          head={snapshot.state.snake[0] ?? null}
          ghost={ghost}
        />
        {/* A missing GLB throws past Suspense; the drill keeps its snake
            either way. See FM-13. */}
        <AssetGate
          label="the snake model"
          fallback={
            <InstancedSnakeFallback
              bufferRef={bufferRef}
              dynasty={scenario.dynasty}
              direction={snapshot.state.direction}
            />
          }
        >
          <InstancedSnake
            bufferRef={bufferRef}
            dynasty={scenario.dynasty}
            direction={snapshot.state.direction}
          />
        </AssetGate>
        {target && (
          <FoodBeacon
            position={[target.x + 0.5, 0, target.z + 0.5]}
            color={theme.accent}
            visualScale={1.12}
          />
        )}
      </Suspense>
      {/*
        ET-5: the Training Lab is deliberate practice for the competitive
        board, so it is framed by the same ratified viewpoint. A drill read
        from a different camera trains the wrong reflex.
      */}
      <CameraRig
        gridSize={scenario.gridSize}
        azimuthRef={azimuthRef}
        frameMargin={COCKPIT_FRAME_MARGIN}
        fitScale={COCKPIT_FIT_SCALE}
        defaultPolar={CANONICAL_POLAR}
        targetY={COCKPIT_TARGET_Y}
      />
    </Canvas>
  );
}

function profileBest(
  profile: TrainingProfile,
  exercise: TrainingExerciseId,
  difficulty: TrainingDifficulty
): TrainingBestSummary | null {
  return profile.bests.find(
    (best) => best.exercise === exercise && best.difficulty === difficulty
  ) ?? null;
}

export default function TrainingPage() {
  const { session, isAuthenticated, isLoading: authLoading } = useAuth();
  const [view, setView] = useState<TrainingView>('hub');
  const [difficulty, setDifficulty] = useState<TrainingDifficulty>('foundation');
  const [guidance, setGuidance] = useState<TrainingGuidance>('full');
  const [activeGuidance, setActiveGuidance] = useState<TrainingGuidance>('full');
  const [sandbox, setSandbox] = useState<SandboxScenarioConfig>({
    dynasty: 'PRIMAL',
    tickMs: 175,
    startLength: 3,
    path: DEFAULT_SANDBOX_PATH.map((cell) => ({ ...cell })),
  });
  const [profile, setProfile] = useState<TrainingProfile>(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(true);
  const [presets, setPresets] = useState<TrainingPreset[]>([]);
  const [presetsLive, setPresetsLive] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<TrainingScenario | null>(null);
  const [snapshot, setSnapshot] = useState<TrainingRunSnapshot | null>(null);
  const [result, setResult] = useState<TrainingAttemptResult | null>(null);
  const [verification, setVerification] = useState<VerificationState>('offline');
  const [circuit, setCircuit] = useState<CircuitState | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const runRef = useRef<TrainingRun | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interpolationRef = useRef<InterpolationBuffer>(createInterpolationBuffer());
  const cameraAzimuthRef = useRef(DEFAULT_AZIMUTH);
  const seedCounterRef = useRef(0);
  const verificationTokenRef = useRef(0);

  const stopLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => stopLoop, [stopLoop]);

  useEffect(() => {
    const update = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    // Session-only training evidence must never bleed between players.
    setProfile(EMPTY_PROFILE);
    setPresets([]);
    setPresetsLive(false);
  }, [session?.user.id]);

  const refreshProfile = useCallback(async () => {
    if (!session?.access_token) {
      setProfile(EMPTY_PROFILE);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const response = await fetch('/api/training', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('profile request failed');
      const payload = await response.json() as Partial<TrainingProfile>;
      setProfile((current) => mergeTrainingProfile(current, payload));
    } catch {
      setProfile((current) => ({ ...current, live: false }));
    } finally {
      setProfileLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const refreshPresets = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch('/api/training/presets', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('preset request failed');
      const payload = await response.json() as { live?: boolean; presets?: TrainingPreset[] };
      setPresetsLive(payload.live === true);
      setPresets(Array.isArray(payload.presets) ? payload.presets : []);
    } catch {
      setPresetsLive(false);
      setPresets([]);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void refreshPresets();
  }, [refreshPresets]);

  const savePreset = useCallback(async (name: string) => {
    if (!session?.access_token || !name) return;
    setHubError(null);
    try {
      const response = await fetch('/api/training/presets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, config: sandbox }),
      });
      const payload = await response.json() as { live?: boolean; preset?: TrainingPreset; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Preset could not be saved.');
      if (!payload.live || !payload.preset) {
        setHubError('Cross-device preset storage is temporarily unavailable.');
        return;
      }
      setPresets((current) => [payload.preset!, ...current]);
      trackEvent(TRAINING_EVENTS.PRESET_SAVED, {
        category: 'gameplay',
        dynasty: payload.preset.dynasty,
        path_cells: payload.preset.path.length,
      });
    } catch (error) {
      setHubError(error instanceof Error ? error.message : 'Preset could not be saved.');
    }
  }, [sandbox, session?.access_token]);

  const deletePreset = useCallback(async (id: string) => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(`/api/training/presets?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('Preset could not be deleted.');
      setPresets((current) => current.filter((preset) => preset.id !== id));
    } catch (error) {
      setHubError(error instanceof Error ? error.message : 'Preset could not be deleted.');
    }
  }, [session?.access_token]);

  const verifyAttempt = useCallback(async (
    localResult: TrainingAttemptResult,
    token: number,
    completedAt: string
  ) => {
    if (localResult.kind === 'sandbox') {
      if (verificationTokenRef.current === token) setVerification('diagnostic');
      return;
    }
    if (!session?.access_token || !localResult.scenario) {
      if (verificationTokenRef.current === token) setVerification('failed');
      return;
    }
    if (verificationTokenRef.current === token) setVerification('verifying');
    try {
      const response = await fetch('/api/training', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenario: localResult.scenario,
          inputs: localResult.inputs,
          endedAtTick: localResult.metrics.ticks,
        }),
      });
      if (!response.ok) throw new Error('verification failed');
      const payload = await response.json() as {
        result?: TrainingAttemptResult;
        best?: TrainingBestSummary | null;
        persisted?: boolean;
      };
      if (!payload.result) throw new Error('missing verified result');
      if (verificationTokenRef.current === token) {
        setResult(payload.result);
        setVerification(payload.persisted ? 'verified' : 'offline');
      }
      trackEvent(TRAINING_EVENTS.ATTEMPT_VERIFIED, {
        category: 'gameplay',
        exercise: payload.result.exercise,
        difficulty: payload.result.difficulty,
        completed: payload.result.metrics.completed,
        rating: payload.result.metrics.rating,
        persisted: payload.persisted === true,
      });
      const nextRecent = {
        exercise: payload.result.exercise,
        difficulty: payload.result.difficulty,
        rating: payload.result.metrics.rating,
        completed: payload.result.metrics.completed,
        createdAt: completedAt,
      };
      setProfile((current) => recordVerifiedTrainingAttempt(
        current,
        payload.best ?? null,
        nextRecent,
        payload.persisted === true
      ));
    } catch {
      if (verificationTokenRef.current === token) setVerification('failed');
    }
  }, [session?.access_token]);

  const finishAttempt = useCallback((attempt: TrainingAttemptResult) => {
    stopLoop();
    const verificationToken = ++verificationTokenRef.current;
    const completedAt = new Date().toISOString();
    setResult(attempt);
    setView('recap');
    trackEvent(TRAINING_EVENTS.ATTEMPT_COMPLETED, {
      category: 'gameplay',
      exercise: attempt.exercise,
      difficulty: attempt.difficulty,
      kind: attempt.kind,
      completed: attempt.metrics.completed,
      rating: attempt.metrics.rating,
      accuracy: attempt.metrics.accuracy,
      efficiency: attempt.metrics.efficiency,
      consistency: attempt.metrics.consistency,
      ticks: attempt.metrics.ticks,
    });
    void verifyAttempt(attempt, verificationToken, completedAt);
  }, [stopLoop, verifyAttempt]);

  const launchScenario = useCallback((
    nextScenario: TrainingScenario,
    nextGuidance: TrainingGuidance,
    source: TrainingLaunchSource
  ) => {
    stopLoop();
    verificationTokenRef.current += 1;
    const run = new TrainingRun(nextScenario);
    const initial = run.snapshot();
    runRef.current = run;
    resetInterpolationBuffer(interpolationRef.current);
    recordTick(
      interpolationRef.current,
      initial.state.snake,
      nextScenario.tickMs,
      performance.now()
    );
    setScenario(nextScenario);
    setSnapshot(initial);
    setResult(null);
    setActiveGuidance(nextGuidance);
    setView('run');
    setViewResetToken((token) => token + 1);
    trackEvent(TRAINING_EVENTS.ATTEMPT_STARTED, {
      category: 'gameplay',
      source,
      exercise: nextScenario.exercise,
      difficulty: nextScenario.difficulty,
      kind: nextScenario.kind,
      guidance: nextGuidance,
      tick_ms: nextScenario.tickMs,
    });

    intervalRef.current = setInterval(() => {
      const active = runRef.current;
      if (!active || active.isDone || active.engine.isPaused) return;
      const next = active.advance();
      recordTick(
        interpolationRef.current,
        next.state.snake,
        nextScenario.tickMs,
        performance.now()
      );
      setSnapshot(next);
      if (next.done && next.result) finishAttempt(next.result);
    }, nextScenario.tickMs);
  }, [finishAttempt, stopLoop]);

  const nextSeed = useCallback((prefix: string) => {
    seedCounterRef.current += 1;
    return `${prefix}-${Date.now().toString(36)}-${seedCounterRef.current}`;
  }, []);

  const startExercise = useCallback((exercise: TrainingExerciseId) => {
    setHubError(null);
    setCircuit(null);
    const priorBest = profileBest(profile, exercise, difficulty);
    const canRaceGhost = guidance === 'ghost' && Boolean(priorBest && priorBest.trace.length > 1);
    const resolvedGuidance = guidance === 'ghost' && !canRaceGhost ? 'next' : guidance;
    launchScenario(
      createTrainingScenario(canRaceGhost ? {
        version: priorBest!.version,
        exercise,
        difficulty,
        seed: priorBest!.seed,
      } : newTrainingReference(exercise, difficulty, nextSeed(exercise))),
      resolvedGuidance,
      'focus'
    );
  }, [difficulty, guidance, launchScenario, nextSeed, profile]);

  const startSandbox = useCallback(() => {
    setHubError(null);
    setCircuit(null);
    try {
      // PB ghosts belong to standardized scenario seeds. A custom route has
      // no equivalent trace, so retain useful authored guidance instead of
      // silently presenting an empty board.
      launchScenario(
        createSandboxScenario(sandbox),
        guidance === 'ghost' ? 'full' : guidance,
        'sandbox'
      );
    } catch (error) {
      setHubError(error instanceof Error ? error.message : 'The custom path is not playable.');
    }
  }, [guidance, launchScenario, sandbox]);

  const startCircuit = useCallback(() => {
    const references = createCircuitReferences(difficulty, nextSeed('circuit'));
    setCircuit({ references, index: 0, completed: [] });
    launchScenario(createTrainingScenario(references[0]), 'none', 'circuit');
  }, [difficulty, launchScenario, nextSeed]);

  const getCameraAzimuth = useCallback(() => cameraAzimuthRef.current, []);

  const handleInput = useCallback((
    direction: Direction,
    source: DirectionInputSource = 'standard'
  ): SetDirectionResult => {
    const active = runRef.current;
    if (!active || active.isDone) return 'inactive';
    const result = active.input(direction, source);
    setSnapshot(active.snapshot());
    return result;
  }, []);

  const handleFlickInput = useCallback(
    (direction: Direction) => handleInput(direction, 'flick'),
    [handleInput]
  );

  useEffect(() => {
    if (view !== 'run') return;
    const handleKey = (event: KeyboardEvent) => {
      const direction = DIRECTION_BY_KEY[event.key];
      if (direction) {
        event.preventDefault();
        handleInput(direction);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        const active = runRef.current;
        if (active && !active.engine.isPaused) {
          active.pause();
          setSnapshot(active.snapshot());
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleInput, view]);

  const handlePause = useCallback(() => {
    const active = runRef.current;
    if (!active) return;
    active.pause();
    setSnapshot(active.snapshot());
  }, []);

  const handleAbandon = useCallback(() => {
    const active = runRef.current;
    if (!active) return;
    finishAttempt(active.stop());
  }, [finishAttempt]);

  const retry = useCallback(() => {
    if (scenario) launchScenario(scenario, activeGuidance, 'retry');
  }, [activeGuidance, launchScenario, scenario]);

  const nextVariant = useCallback(() => {
    if (!scenario || scenario.kind === 'sandbox') {
      startSandbox();
      return;
    }
    launchScenario(
      createTrainingScenario(newTrainingReference(
        scenario.exercise,
        scenario.difficulty,
        nextSeed(scenario.exercise)
      )),
      activeGuidance === 'ghost' ? 'next' : activeGuidance,
      'variant'
    );
  }, [activeGuidance, launchScenario, nextSeed, scenario, startSandbox]);

  const continueCircuit = useCallback(() => {
    if (!circuit || !result) return;
    const nextIndex = circuit.index + 1;
    if (nextIndex >= circuit.references.length) return;
    const completed = [...circuit.completed, result];
    setCircuit({ ...circuit, index: nextIndex, completed });
    launchScenario(createTrainingScenario(circuit.references[nextIndex]), 'none', 'circuit');
  }, [circuit, launchScenario, result]);

  const exitToHub = useCallback(() => {
    stopLoop();
    verificationTokenRef.current += 1;
    runRef.current = null;
    setScenario(null);
    setSnapshot(null);
    setResult(null);
    setCircuit(null);
    setView('hub');
    void refreshProfile();
  }, [refreshProfile, stopLoop]);

  if (authLoading) {
    return (
      <div className="consent-safe-viewport min-h-dvh app-bg grid place-items-center text-beige">
        <p className="font-body">Preparing Training Lab…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="consent-safe-viewport min-h-dvh app-bg grid place-items-center px-4">
        <div className="panel-elevated max-w-sm space-y-5 p-8 text-center">
          <h1 className="heading-display text-3xl text-venom-orange">Training Lab</h1>
          <p className="font-body text-beige">Sign in to verify attempts and keep your skill profile.</p>
          <Link href="/login" className="btn-go inline-flex min-h-11 items-center px-7">Sign In</Link>
        </div>
      </div>
    );
  }

  if (view === 'hub') {
    return (
      <>
        <TrainingHub
          profile={profile}
          profileLoading={profileLoading}
          difficulty={difficulty}
          guidance={guidance}
          sandbox={sandbox}
          presets={presets}
          presetsLive={presetsLive}
          onDifficulty={setDifficulty}
          onGuidance={setGuidance}
          onSandbox={setSandbox}
          onStartExercise={startExercise}
          onStartCircuit={startCircuit}
          onStartSandbox={startSandbox}
          onSavePreset={savePreset}
          onLoadPreset={(preset) => setSandbox({
            dynasty: preset.dynasty,
            tickMs: preset.tickMs,
            startLength: preset.startLength,
            path: preset.path.map((cell) => ({ ...cell })),
          })}
          onDeletePreset={deletePreset}
        />
        {hubError && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-arcade border border-strike-red/70 bg-void-deep px-5 py-3 font-body text-strike-red" role="alert">
            {hubError}
          </div>
        )}
      </>
    );
  }

  if (view === 'recap' && result) {
    const remaining = circuit ? circuit.references.length - circuit.index - 1 : undefined;
    return (
      <TrainingRecap
        result={result}
        best={profileBest(profile, result.exercise, result.difficulty)}
        verification={verification}
        circuitResults={circuit?.completed}
        circuitRemaining={remaining}
        onRetry={retry}
        onNextVariant={circuit ? undefined : nextVariant}
        onContinueCircuit={circuit && remaining && remaining > 0 ? continueCircuit : undefined}
        onExit={exitToHub}
      />
    );
  }

  if (!scenario || !snapshot) return null;

  const definition = TRAINING_EXERCISES[scenario.exercise];
  const best = profileBest(profile, scenario.exercise, scenario.difficulty);
  const ghost = best && best.version === scenario.reference?.version && best.seed === scenario.seed
    ? best.trace
    : [];
  const state = !runRef.current?.isStarted
    ? 'ready'
    : snapshot.state.isPaused ? 'held' : 'active';
  const status = !runRef.current?.isStarted
    ? isMobile
      ? 'Flick a direction to begin the attempt'
      : 'Choose a direction to begin the attempt'
    : snapshot.state.isPaused
      ? isMobile
        ? 'Tactical hold · move to resume · flick a safe direction'
        : 'Tactical hold · move to resume · choose a safe direction'
      : `${definition.primaryMetric} · ${snapshot.progress} of ${snapshot.progressTotal}`;
  const cockpitModel: RunCockpitModel = {
    dynasty: scenario.dynasty,
    state,
    mode: 'training',
    modeLabel: `Training · ${definition.name}`,
    modeDetail: circuit ? `Circuit ${circuit.index + 1}/4` : scenario.kind === 'sandbox' ? 'Open sandbox' : scenario.difficulty,
    statusText: status,
    isFirstMovementPrompt: false,
    // Training is a driven run: never metered, so never shown a budget.
    holds: null,
    score: snapshot.progress,
    dna: 0,
    // Training never touches the envelope (§5: its rewardless contract),
    // so it reports no charge status and the readout does not render.
    charge: null,
    bankDna: 0,
    crashDna: 0,
    // Training scenarios run no constellation window.
    constellation: null,
    genes: [],
    strains: [],
    showGenome: true,
    portalLive: false,
    portalTicksRemaining: 0,
    training: {
      primaryLabel: scenario.exercise === 'route' ? 'Targets' : scenario.exercise === 'escape' ? 'Safety' : 'Gates',
      primaryValue: `${snapshot.progress}/${snapshot.progressTotal}`,
      secondaryLabel: 'Tick',
      secondaryValue: `${snapshot.tick}/${scenario.maxTicks}`,
      progressLabel: definition.primaryMetric,
      progress: snapshot.progress,
      progressTotal: snapshot.progressTotal,
      metrics: [
        { label: 'Pace', value: `${scenario.tickMs}ms` },
        { label: 'Guide', value: activeGuidance === 'none' ? 'Off' : activeGuidance },
        { label: 'Level', value: scenario.kind === 'sandbox' ? 'Custom' : scenario.difficulty },
      ],
      comparison: best ? `PB ${best.rating}` : 'NO PB',
    },
  };

  return (
    <div className="consent-safe-viewport relative flex h-dvh w-screen flex-col overflow-hidden app-bg">
      <GameEnvironment dynasty={scenario.dynasty} />
      <RunCockpit
        model={cockpitModel}
        onPause={handlePause}
        onAbandon={handleAbandon}
        showPause={!snapshot.state.isPaused}
        showAbandon={snapshot.state.isPaused}
        pauseLabel="Pause training"
      >
        <TrainingBoard
          scenario={scenario}
          snapshot={snapshot}
          guidance={activeGuidance}
          ghost={ghost}
          bufferRef={interpolationRef}
          azimuthRef={cameraAzimuthRef}
          isMobile={isMobile}
        />
      </RunCockpit>
      {isMobile && !snapshot.done && (
        <FlickSurface
          getAzimuth={getCameraAzimuth}
          onDirection={handleFlickInput}
          showQueuedTurns={false}
        />
      )}
    </div>
  );
}
