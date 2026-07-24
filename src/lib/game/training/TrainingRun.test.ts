import type { Direction } from '@/lib/game/SnakeGameLogic';
import {
  TRAINING_DIFFICULTIES,
  TRAINING_EXERCISE_IDS,
  TRAINING_SCENARIO_VERSION,
  createTrainingScenario,
  type TrainingCell,
  type TrainingScenario,
} from '@/shared/game/training';
import { TrainingRun, replayTrainingAttempt } from './TrainingRun';

function directionBetween(from: TrainingCell, to: TrainingCell): Direction {
  if (to.x > from.x) return 'RIGHT';
  if (to.x < from.x) return 'LEFT';
  if (to.z > from.z) return 'DOWN';
  return 'UP';
}

function completeSuggestedLine(scenario: TrainingScenario) {
  const run = new TrainingRun(scenario);
  let direction = directionBetween(scenario.path[0], scenario.path[1]);
  expect(['accepted', 'duplicate']).toContain(run.input(direction));
  for (let index = 1; index < scenario.path.length && !run.isDone; index += 1) {
    const nextDirection = directionBetween(scenario.path[index - 1], scenario.path[index]);
    if (nextDirection !== direction) {
      expect(run.input(nextDirection)).toBe('accepted');
      direction = nextDirection;
    }
    run.advance();
  }
  return run.snapshot().result!;
}

describe('TrainingRun', () => {
  it.each(['trace', 'route', 'tempo', 'escape'] as const)(
    'completes the authored %s line with canonical engine inputs',
    (exercise) => {
      const scenario = createTrainingScenario({
        version: TRAINING_SCENARIO_VERSION,
        exercise,
        difficulty: 'foundation',
        seed: 'perfect-line',
      });
      const result = completeSuggestedLine(scenario);
      expect(result.metrics.completed).toBe(true);
      expect(result.metrics.progress).toBe(result.metrics.progressTotal);
      expect(result.trace.length).toBe(result.metrics.ticks + 1);
      if (exercise === 'trace' || exercise === 'tempo') {
        expect(result.metrics.accuracy).toBe(100);
      }
    }
  );

  it('keeps every transformed catalog line completable at every difficulty', () => {
    for (const exercise of TRAINING_EXERCISE_IDS) {
      for (const difficulty of TRAINING_DIFFICULTIES) {
        for (let variant = 0; variant < 12; variant += 1) {
          const scenario = createTrainingScenario({
            version: TRAINING_SCENARIO_VERSION,
            exercise,
            difficulty,
            seed: `solvable-${variant}`,
          });
          const result = completeSuggestedLine(scenario);
          expect(result.metrics.completed).toBe(true);
          expect(result.metrics.consistency).toBe(100);
          expect(result.metrics.splits.every((split) => split.deltaTicks === 0)).toBe(true);
        }
      }
    }
  });

  it('records rejected and unnecessary commands as actionable consistency feedback', () => {
    const scenario = createTrainingScenario({
      version: TRAINING_SCENARIO_VERSION,
      exercise: 'trace',
      difficulty: 'foundation',
      seed: 'input-errors',
    });
    const run = new TrainingRun(scenario);
    const first = directionBetween(scenario.path[0], scenario.path[1]);
    run.input(first);
    const opposite: Direction = first === 'UP' ? 'DOWN'
      : first === 'DOWN' ? 'UP'
        : first === 'LEFT' ? 'RIGHT' : 'LEFT';
    expect(run.input(opposite)).toBe('reversal');
    expect(run.input(first)).toBe('duplicate');
    const result = run.stop();
    expect(result.metrics.rejectedInputs).toBe(1);
    expect(result.metrics.unnecessaryInputs).toBe(1);
  });

  it('replays an input trace to the byte-equivalent metrics and ghost', () => {
    const scenario = createTrainingScenario({
      version: TRAINING_SCENARIO_VERSION,
      exercise: 'tempo',
      difficulty: 'advanced',
      seed: 'server-replay',
    });
    const client = completeSuggestedLine(scenario);
    const server = replayTrainingAttempt(scenario, client.inputs);
    expect(server.metrics).toEqual(client.metrics);
    expect(server.trace).toEqual(client.trace);
  });

  it('replays tactical holds and player-ended attempts at the exact tick', () => {
    const scenario = createTrainingScenario({
      version: TRAINING_SCENARIO_VERSION,
      exercise: 'trace',
      difficulty: 'foundation',
      seed: 'held-stop',
    });
    const client = new TrainingRun(scenario);
    const first = directionBetween(scenario.path[0], scenario.path[1]);
    client.input(first);
    client.advance();
    expect(client.pause()).toBe(true);
    expect(client.input(first)).toBe('duplicate');
    client.advance();
    expect(client.pause()).toBe(true);
    const stopped = client.stop();
    const server = replayTrainingAttempt(scenario, stopped.inputs, stopped.metrics.ticks);
    expect(server.metrics).toEqual(stopped.metrics);
    expect(server.trace).toEqual(stopped.trace);
    expect(stopped.inputs.some((input) => input.type === 'pause')).toBe(true);

    const zeroTick = new TrainingRun(scenario).stop();
    expect(replayTrainingAttempt(scenario, [], 0).metrics).toEqual(zeroTick.metrics);
  });

  it('rejects reordered or deferred held-board input traces', () => {
    const scenario = createTrainingScenario({
      version: TRAINING_SCENARIO_VERSION,
      exercise: 'trace',
      difficulty: 'foundation',
      seed: 'invalid-replay',
    });
    expect(() => replayTrainingAttempt(scenario, [
      { tick: 2, type: 'direction', direction: 'UP' },
    ])).toThrow(/cannot advance/);
    expect(() => replayTrainingAttempt(scenario, [
      { tick: 1, type: 'direction', direction: 'UP' },
      { tick: 0, type: 'direction', direction: 'LEFT' },
    ])).toThrow(/ordered/);
    expect(() => replayTrainingAttempt(scenario, [
      { tick: 0, type: 'direction', direction: scenario.startDirection },
      { tick: 1, type: 'pause' },
    ], 2)).toThrow(/declared end tick/);
  });
});
