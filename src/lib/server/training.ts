import { replayTrainingAttempt } from '@/lib/game/training/TrainingRun';
import {
  TRAINING_SCENARIO_VERSION,
  createSandboxScenario,
  createTrainingScenario,
  isTrainingDifficulty,
  isTrainingDirection,
  isTrainingExerciseId,
  type TrainingAttemptResult,
  type TrainingBestSummary,
  type TrainingInput,
  type TrainingMedal,
  type TrainingRecentSummary,
  type SandboxScenarioConfig,
  type TrainingPreset,
  type TrainingScenarioReference,
  type TrainingTracePoint,
} from '@/shared/game/training';

const SEED_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

export function isMissingTrainingInfra(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string } | null;
  const text = `${candidate?.message ?? ''} ${candidate?.details ?? ''}`;
  return candidate?.code === '42P01' || candidate?.code === 'PGRST202' ||
    /training_(attempts|bests|presets)|record_training_attempt|save_training_preset/i.test(text) &&
    /does not exist|schema cache|not find|unknown/i.test(text);
}

export function sanitizeTrainingReference(value: unknown): TrainingScenarioReference | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.version !== TRAINING_SCENARIO_VERSION ||
    !isTrainingExerciseId(raw.exercise) ||
    !isTrainingDifficulty(raw.difficulty) ||
    typeof raw.seed !== 'string' ||
    !SEED_PATTERN.test(raw.seed)
  ) return null;
  return {
    version: TRAINING_SCENARIO_VERSION,
    exercise: raw.exercise,
    difficulty: raw.difficulty,
    seed: raw.seed,
  };
}

export function sanitizeTrainingInputs(
  value: unknown,
  maxTicks: number,
  endedAtTick = maxTicks
): TrainingInput[] | null {
  if (!Array.isArray(value) || value.length > maxTicks * 4 + 8) {
    return null;
  }
  const inputs: TrainingInput[] = [];
  let previousTick = -1;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const raw = entry as Record<string, unknown>;
    if (
      !Number.isInteger(raw.tick) ||
      (raw.tick as number) < 0 ||
      (raw.tick as number) > maxTicks || (raw.tick as number) > endedAtTick ||
      (raw.tick as number) < previousTick
    ) return null;
    previousTick = raw.tick as number;
    if (raw.type === 'pause') {
      inputs.push({ tick: raw.tick as number, type: 'pause' });
    } else if (raw.type === 'direction' && isTrainingDirection(raw.direction)) {
      inputs.push({
        tick: raw.tick as number,
        type: 'direction',
        direction: raw.direction,
      });
    } else {
      return null;
    }
  }
  return inputs;
}

export function verifyTrainingAttemptPayload(body: unknown): TrainingAttemptResult {
  if (!body || typeof body !== 'object') throw new Error('Invalid training payload');
  const raw = body as Record<string, unknown>;
  const reference = sanitizeTrainingReference(raw.scenario);
  if (!reference) throw new Error('Invalid training scenario');
  const scenario = createTrainingScenario(reference);
  const endedAtTick = raw.endedAtTick;
  if (
    !Number.isInteger(endedAtTick) ||
    (endedAtTick as number) < 0 ||
    (endedAtTick as number) > scenario.maxTicks
  ) throw new Error('Invalid training end tick');
  const inputs = sanitizeTrainingInputs(raw.inputs, scenario.maxTicks, endedAtTick as number);
  if (!inputs) throw new Error('Invalid training input trace');
  return replayTrainingAttempt(scenario, inputs, endedAtTick as number);
}

function sanitizeMedal(value: unknown): TrainingMedal {
  return value === 'bronze' || value === 'silver' || value === 'gold' || value === 'prismatic'
    ? value
    : 'none';
}

function isStoredScore(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;
}

function sanitizeTrace(value: unknown): TrainingTracePoint[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 241).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    if (
      !Number.isInteger(raw.tick) || !Number.isInteger(raw.x) || !Number.isInteger(raw.z) ||
      (raw.tick as number) < 0 || (raw.tick as number) > 240 ||
      (raw.x as number) < 0 || (raw.x as number) > 19 ||
      (raw.z as number) < 0 || (raw.z as number) > 19
    ) return [];
    return [{ tick: raw.tick as number, x: raw.x as number, z: raw.z as number }];
  });
}

export function trainingBestFromRow(value: unknown): TrainingBestSummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    !isTrainingExerciseId(row.exercise_id) ||
    !isTrainingDifficulty(row.difficulty) ||
    row.scenario_version !== TRAINING_SCENARIO_VERSION ||
    typeof row.completed !== 'boolean' ||
    !isStoredScore(row.rating) ||
    !isStoredScore(row.accuracy) ||
    !isStoredScore(row.efficiency) ||
    !isStoredScore(row.consistency) ||
    !Number.isInteger(row.ticks) || (row.ticks as number) < 0 || (row.ticks as number) > 240 ||
    typeof row.scenario_seed !== 'string' || !SEED_PATTERN.test(row.scenario_seed)
  ) return null;
  return {
    exercise: row.exercise_id,
    difficulty: row.difficulty,
    version: TRAINING_SCENARIO_VERSION,
    completed: row.completed,
    rating: row.rating as number,
    medal: sanitizeMedal(row.medal),
    accuracy: row.accuracy as number,
    efficiency: row.efficiency as number,
    consistency: row.consistency as number,
    ticks: row.ticks as number,
    seed: row.scenario_seed,
    trace: sanitizeTrace(row.trace),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(0).toISOString(),
  };
}

export function trainingRecentFromRow(value: unknown): TrainingRecentSummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    !isTrainingExerciseId(row.exercise_id) ||
    !isTrainingDifficulty(row.difficulty) ||
    !isStoredScore(row.rating) ||
    typeof row.completed !== 'boolean'
  ) return null;
  return {
    exercise: row.exercise_id,
    difficulty: row.difficulty,
    rating: row.rating as number,
    completed: row.completed,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
  };
}

export function candidateBestFromResult(
  result: TrainingAttemptResult,
  updatedAt = new Date().toISOString()
): TrainingBestSummary {
  return {
    exercise: result.exercise,
    difficulty: result.difficulty,
    version: result.scenario?.version ?? TRAINING_SCENARIO_VERSION,
    completed: result.metrics.completed,
    rating: result.metrics.rating,
    medal: result.metrics.medal,
    accuracy: result.metrics.accuracy,
    efficiency: result.metrics.efficiency,
    consistency: result.metrics.consistency,
    ticks: result.metrics.ticks,
    seed: result.scenario?.seed ?? '',
    trace: result.trace.map((point) => ({ ...point })),
    updatedAt,
  };
}

export function sanitizeSandboxScenarioConfig(value: unknown): SandboxScenarioConfig | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (
    (raw.dynasty !== 'PRIMAL' && raw.dynasty !== 'CYBER' && raw.dynasty !== 'COSMIC') ||
    typeof raw.tickMs !== 'number' || !Number.isFinite(raw.tickMs) ||
    typeof raw.startLength !== 'number' || !Number.isFinite(raw.startLength) ||
    !Array.isArray(raw.path) || raw.path.length < 5 || raw.path.length > 120
  ) return null;
  const config: SandboxScenarioConfig = {
    dynasty: raw.dynasty,
    tickMs: Math.max(50, Math.min(250, Math.round(raw.tickMs))),
    startLength: Math.max(3, Math.min(8, Math.round(raw.startLength))),
    path: raw.path.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const cell = entry as Record<string, unknown>;
      if (!Number.isInteger(cell.x) || !Number.isInteger(cell.z)) return [];
      return [{ x: cell.x as number, z: cell.z as number }];
    }),
  };
  if (config.path.length !== raw.path.length) return null;
  try {
    createSandboxScenario(config);
    return config;
  } catch {
    return null;
  }
}

export function trainingPresetFromRow(value: unknown): TrainingPreset | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const config = sanitizeSandboxScenarioConfig({
    dynasty: row.dynasty,
    tickMs: row.tick_ms,
    startLength: row.start_length,
    path: row.path,
  });
  if (
    !config || typeof row.id !== 'string' || typeof row.name !== 'string' ||
    row.name.trim().length === 0
  ) return null;
  return {
    id: row.id,
    name: row.name.trim().slice(0, 40),
    ...config,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(0).toISOString(),
  };
}
