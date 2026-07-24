import type { Direction } from '@/lib/game/SnakeGameLogic';
import { TrainingRun } from '@/lib/game/training/TrainingRun';
import {
  TRAINING_SCENARIO_VERSION,
  createTrainingScenario,
  type TrainingCell,
} from '@/shared/game/training';
import {
  candidateBestFromResult,
  isMissingTrainingInfra,
  sanitizeTrainingInputs,
  sanitizeTrainingReference,
  sanitizeSandboxScenarioConfig,
  trainingBestFromRow,
  trainingPresetFromRow,
  verifyTrainingAttemptPayload,
} from './training';

function directionBetween(from: TrainingCell, to: TrainingCell): Direction {
  if (to.x > from.x) return 'RIGHT';
  if (to.x < from.x) return 'LEFT';
  if (to.z > from.z) return 'DOWN';
  return 'UP';
}

function perfectPayload() {
  const reference = {
    version: TRAINING_SCENARIO_VERSION,
    exercise: 'trace',
    difficulty: 'foundation',
    seed: 'server-validation',
  } as const;
  const scenario = createTrainingScenario(reference);
  const run = new TrainingRun(scenario);
  let direction = directionBetween(scenario.path[0], scenario.path[1]);
  run.input(direction);
  for (let index = 1; index < scenario.path.length && !run.isDone; index += 1) {
    const next = directionBetween(scenario.path[index - 1], scenario.path[index]);
    if (next !== direction) {
      run.input(next);
      direction = next;
    }
    run.advance();
  }
  const result = run.snapshot().result!;
  return {
    scenario: reference,
    inputs: result.inputs,
    endedAtTick: result.metrics.ticks,
  };
}

describe('server training validation', () => {
  it('sanitizes scenario references and bounded ordered input traces', () => {
    const payload = perfectPayload();
    expect(sanitizeTrainingReference(payload.scenario)).toEqual(payload.scenario);
    expect(sanitizeTrainingReference({ ...payload.scenario, seed: '../bad' })).toBeNull();
    expect(sanitizeTrainingInputs(payload.inputs, 200)).toEqual(payload.inputs);
    expect(sanitizeTrainingInputs([
      { tick: 2, type: 'direction', direction: 'UP' },
      { tick: 1, type: 'direction', direction: 'LEFT' },
    ], 10)).toBeNull();
    expect(sanitizeTrainingInputs([], 10, 0)).toEqual([]);
  });

  it('replays authoritative metrics and ignores injected result claims', () => {
    const payload = perfectPayload();
    const result = verifyTrainingAttemptPayload({
      ...payload,
      metrics: { rating: 999, completed: true },
    });
    expect(result.metrics.rating).toBe(100);
    expect(result.metrics.completed).toBe(true);
    expect(candidateBestFromResult(result)).toMatchObject({
      exercise: 'trace',
      difficulty: 'foundation',
      rating: 100,
      seed: 'server-validation',
    });
  });

  it('recognizes only expected pre-migration failures', () => {
    expect(isMissingTrainingInfra({ code: '42P01', message: 'missing relation' })).toBe(true);
    expect(isMissingTrainingInfra({ code: 'PGRST202', message: 'record_training_attempt missing' })).toBe(true);
    expect(isMissingTrainingInfra({ code: 'XX000', message: 'disk failed' })).toBe(false);
  });

  it('rejects malformed best rows and bounds stored ghost points', () => {
    expect(trainingBestFromRow({ exercise_id: 'unknown' })).toBeNull();
    expect(trainingBestFromRow({
      exercise_id: 'tempo', difficulty: 'elite', rating: 101, medal: 'gold',
      scenario_version: 1, completed: true, accuracy: 95, efficiency: 88, consistency: 87, ticks: 30,
      scenario_seed: 'seed', trace: [],
    })).toBeNull();
    expect(trainingBestFromRow({
      exercise_id: 'tempo', difficulty: 'elite', rating: 90, medal: 'gold',
      scenario_version: 1, completed: true,
      accuracy: 95, efficiency: 88, consistency: 87, ticks: 30,
      scenario_seed: 'seed', updated_at: '2026-07-24T00:00:00.000Z',
      trace: [{ tick: 0, x: 10, z: 10 }, { tick: 1, x: 999, z: 10 }],
    })).toMatchObject({ trace: [{ tick: 0, x: 10, z: 10 }] });
  });

  it('validates reusable Sandbox presets through the scenario generator', () => {
    const config = {
      dynasty: 'PRIMAL', tickMs: 175, startLength: 3,
      path: [
        { x: 10, z: 10 }, { x: 11, z: 10 }, { x: 12, z: 10 },
        { x: 12, z: 9 }, { x: 12, z: 8 },
      ],
    };
    expect(sanitizeSandboxScenarioConfig(config)).toEqual(config);
    expect(sanitizeSandboxScenarioConfig({ ...config, tickMs: Number.NaN })).toBeNull();
    expect(sanitizeSandboxScenarioConfig({ ...config, path: config.path.slice(0, 4) })).toBeNull();
    expect(sanitizeSandboxScenarioConfig({ ...config, path: [...config.path, config.path[0]] })).toBeNull();
    expect(trainingPresetFromRow({
      id: 'preset-1', name: 'Corner lab', dynasty: 'PRIMAL', tick_ms: 175,
      start_length: 3, path: config.path, updated_at: '2026-07-24T00:00:00.000Z',
    })).toMatchObject({ id: 'preset-1', name: 'Corner lab', tickMs: 175 });
  });
});
