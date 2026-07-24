import type { DynastyId } from '@/shared/types/game';

export const TRAINING_SCENARIO_VERSION = 1 as const;

export const TRAINING_EXERCISE_IDS = [
  'trace',
  'route',
  'tempo',
  'escape',
] as const;

export type TrainingExerciseId = (typeof TRAINING_EXERCISE_IDS)[number];
export type TrainingScenarioKind = 'drill' | 'sandbox';

export const TRAINING_DIFFICULTIES = [
  'foundation',
  'advanced',
  'elite',
] as const;

export type TrainingDifficulty = (typeof TRAINING_DIFFICULTIES)[number];
export type TrainingDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type TrainingGuidance = 'full' | 'next' | 'ghost' | 'none';
export type TrainingMedal = 'none' | 'bronze' | 'silver' | 'gold' | 'prismatic';

export interface TrainingCell {
  x: number;
  z: number;
}

export interface TrainingExerciseDefinition {
  id: TrainingExerciseId;
  name: string;
  skill: string;
  summary: string;
  primaryMetric: string;
  dynasty: DynastyId;
}

export interface TrainingScenarioReference {
  version: typeof TRAINING_SCENARIO_VERSION;
  exercise: TrainingExerciseId;
  difficulty: TrainingDifficulty;
  seed: string;
}

export interface TrainingScenario {
  id: string;
  kind: TrainingScenarioKind;
  reference: TrainingScenarioReference | null;
  exercise: TrainingExerciseId;
  difficulty: TrainingDifficulty;
  seed: string;
  dynasty: DynastyId;
  gridSize: number;
  tickMs: number;
  maxTicks: number;
  optimalTicks: number;
  startSnake: TrainingCell[];
  startDirection: TrainingDirection;
  /** Suggested/required movement line, including the opening head cell. */
  path: TrainingCell[];
  /** Indices into path used for split and corner feedback. */
  checkpointIndices: number[];
  /** Ordered collection targets. Route uses all; other drills use the last. */
  targets: TrainingCell[];
}

export interface SandboxScenarioConfig {
  dynasty: DynastyId;
  tickMs: number;
  startLength: number;
  path: TrainingCell[];
}

export interface TrainingDirectionInput {
  tick: number;
  type: 'direction';
  direction: TrainingDirection;
}

export interface TrainingPauseInput {
  tick: number;
  type: 'pause';
}

/** Ordered control trace. Array order resolves multiple events on one tick. */
export type TrainingInput = TrainingDirectionInput | TrainingPauseInput;

export interface TrainingTracePoint extends TrainingCell {
  tick: number;
}

export interface TrainingSplit {
  checkpoint: number;
  expectedTick: number;
  actualTick: number | null;
  deltaTicks: number | null;
}

export interface TrainingMetrics {
  completed: boolean;
  rating: number;
  medal: TrainingMedal;
  accuracy: number;
  efficiency: number;
  consistency: number;
  ticks: number;
  durationMs: number;
  progress: number;
  progressTotal: number;
  rejectedInputs: number;
  unnecessaryInputs: number;
  meanTimingError: number;
  splits: TrainingSplit[];
  diagnosis: string;
}

export interface TrainingAttemptResult {
  scenario: TrainingScenarioReference | null;
  exercise: TrainingExerciseId;
  difficulty: TrainingDifficulty;
  kind: TrainingScenarioKind;
  metrics: TrainingMetrics;
  inputs: TrainingInput[];
  trace: TrainingTracePoint[];
}

export interface TrainingBestSummary {
  exercise: TrainingExerciseId;
  difficulty: TrainingDifficulty;
  version: typeof TRAINING_SCENARIO_VERSION;
  completed: boolean;
  rating: number;
  medal: TrainingMedal;
  accuracy: number;
  efficiency: number;
  consistency: number;
  ticks: number;
  seed: string;
  trace: TrainingTracePoint[];
  updatedAt: string;
}

export interface TrainingRecentSummary {
  exercise: TrainingExerciseId;
  difficulty: TrainingDifficulty;
  rating: number;
  completed: boolean;
  createdAt: string;
}

export interface TrainingProfile {
  live: boolean;
  bests: TrainingBestSummary[];
  recent: TrainingRecentSummary[];
}

export interface TrainingPreset extends SandboxScenarioConfig {
  id: string;
  name: string;
  updatedAt: string;
}

export interface TrainingAttemptFacts {
  completed: boolean;
  kind: TrainingScenarioKind;
  exercise: TrainingExerciseId;
  tickMs: number;
  ticks: number;
  optimalTicks: number;
  progress: number;
  progressTotal: number;
  pathMatchedTicks: number;
  pathObservedTicks: number;
  rejectedInputs: number;
  unnecessaryInputs: number;
  splits: TrainingSplit[];
}

export function isTrainingExerciseId(value: unknown): value is TrainingExerciseId {
  return TRAINING_EXERCISE_IDS.includes(value as TrainingExerciseId);
}

export function isTrainingDifficulty(value: unknown): value is TrainingDifficulty {
  return TRAINING_DIFFICULTIES.includes(value as TrainingDifficulty);
}

export function isTrainingDirection(value: unknown): value is TrainingDirection {
  return value === 'UP' || value === 'DOWN' || value === 'LEFT' || value === 'RIGHT';
}
