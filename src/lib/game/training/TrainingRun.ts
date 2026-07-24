import {
  SnakeGameLogic,
  type Direction,
  type GameState,
  type SetDirectionResult,
} from '@/lib/game/SnakeGameLogic';
import { getRuleset } from '@/shared/game/rulesets';
import {
  scoreTrainingAttempt,
  type TrainingAttemptFacts,
  type TrainingAttemptResult,
  type TrainingCell,
  type TrainingInput,
  type TrainingScenario,
  type TrainingTracePoint,
} from '@/shared/game/training';

export interface TrainingRunSnapshot {
  state: GameState;
  tick: number;
  progress: number;
  progressTotal: number;
  target: TrainingCell | null;
  done: boolean;
  result: TrainingAttemptResult | null;
}

function sameCell(
  a: TrainingCell | null | undefined,
  b: TrainingCell | null | undefined
): boolean {
  return Boolean(a && b && a.x === b.x && a.z === b.z);
}

function expectedTurnCount(scenario: TrainingScenario): number {
  return scenario.checkpointIndices.filter((index) => index < scenario.path.length - 1).length;
}

/**
 * Deterministic training adapter around the production SnakeGameLogic.
 * It owns goals and feedback only; movement, collisions and buffering stay in
 * the canonical engine and the same class is used for server replay.
 */
export class TrainingRun {
  readonly engine: SnakeGameLogic;
  private readonly scenario: TrainingScenario;
  private tickIndex = 0;
  private inputs: TrainingInput[] = [];
  private trace: TrainingTracePoint[] = [];
  private checkpointCursor = 0;
  private targetCursor = 0;
  private pathMatchedTicks = 0;
  private acceptedTurns = 0;
  private rejectedInputs = 0;
  private duplicateInputs = 0;
  private started = false;
  private done = false;
  private attemptResult: TrainingAttemptResult | null = null;
  private checkpointTicks = new Map<number, number>();

  constructor(scenario: TrainingScenario) {
    this.scenario = scenario;

    // Standard drills isolate mechanics from run economy. Sandbox keeps the
    // selected arena's collision/wall behavior (including COSMIC Flux), while
    // its explicit pace control owns cadence instead of CYBER's food curve.
    const physicsDynasty = scenario.kind === 'sandbox'
      ? scenario.dynasty
      : scenario.exercise === 'tempo'
        ? 'CYBER'
        : 'PRIMAL';
    this.engine = new SnakeGameLogic({
      gridSize: scenario.gridSize,
      initialLength: scenario.startSnake.length,
      ruleset: getRuleset(physicsDynasty),
      rng: () => 0.42,
      mutationPool: [],
    });

    const firstFood = this.currentTarget() ?? scenario.path[scenario.path.length - 1];
    this.engine.startDriven({
      snake: scenario.startSnake.map((cell) => ({ ...cell, y: 0 })),
      direction: scenario.startDirection as Direction,
      foods: [{ ...firstFood, y: 0 }],
    });
    this.engine.pause();

    const head = this.engine.getState().snake[0];
    this.trace.push({ tick: 0, x: head.x, z: head.z });
  }

  getScenario(): TrainingScenario {
    return this.scenario;
  }

  get tick(): number {
    return this.tickIndex;
  }

  get isDone(): boolean {
    return this.done;
  }

  get isStarted(): boolean {
    return this.started;
  }

  input(direction: Direction): SetDirectionResult {
    if (this.done || this.inputs.length >= this.scenario.maxTicks * 4 + 8) {
      return 'inactive';
    }

    const wasPaused = this.engine.isPaused;
    const result = wasPaused
      ? this.engine.resumeWithDirection(direction)
      : this.engine.setDirection(direction);
    this.inputs.push({ tick: this.tickIndex, type: 'direction', direction });

    if (result === 'accepted') {
      if (this.started) this.acceptedTurns += 1;
    } else if (result === 'duplicate') {
      // Reaffirming the current heading is the deliberate tactical-hold
      // release contract, not a sloppy extra command.
      if (this.started && !wasPaused) this.duplicateInputs += 1;
    } else if (result === 'reversal' || result === 'queue_full') {
      this.rejectedInputs += 1;
    }

    if (wasPaused && (result === 'accepted' || result === 'duplicate')) {
      this.started = true;
    }
    return result;
  }

  pause(): boolean {
    if (this.done || this.engine.isPaused) return false;
    this.engine.pause();
    if (!this.engine.isPaused) return false;
    this.inputs.push({ tick: this.tickIndex, type: 'pause' });
    return true;
  }

  advance(): TrainingRunSnapshot {
    if (this.done || this.engine.isPaused) return this.snapshot();

    this.engine.tick();
    this.tickIndex += 1;
    const state = this.engine.getState();
    const head = state.snake[0];
    this.trace.push({ tick: this.tickIndex, x: head.x, z: head.z });

    const expected = this.scenario.path[Math.min(this.tickIndex, this.scenario.path.length - 1)];
    if (sameCell(head, expected)) this.pathMatchedTicks += 1;

    if (this.scenario.exercise === 'route') {
      const target = this.currentTarget();
      if (sameCell(head, target)) {
        this.targetCursor += 1;
        const next = this.currentTarget();
        if (next) this.engine.placeFood({ ...next, y: 0 });
      }
    } else if (this.scenario.exercise === 'escape') {
      if (sameCell(head, this.scenario.targets[0])) this.targetCursor = 1;
    }

    // Splits are diagnostic for every exercise, even when ordered targets
    // (Route) or the safety cell (Escape) own the completion condition.
    const checkpointIndex = this.scenario.checkpointIndices[this.checkpointCursor];
    const checkpoint = checkpointIndex === undefined
      ? undefined
      : this.scenario.path[checkpointIndex];
    if (sameCell(head, checkpoint)) {
      this.checkpointTicks.set(checkpointIndex, this.tickIndex);
      this.checkpointCursor += 1;
    }

    const completed = this.completionReached();
    if (completed || state.isDeathSequence || state.isGameOver || this.tickIndex >= this.scenario.maxTicks) {
      this.finish(completed);
    }
    return this.snapshot();
  }

  stop(): TrainingAttemptResult {
    return this.finish(false);
  }

  snapshot(): TrainingRunSnapshot {
    const progress = this.progress();
    return {
      state: this.engine.getState(),
      tick: this.tickIndex,
      progress: progress.current,
      progressTotal: progress.total,
      target: this.currentTarget(),
      done: this.done,
      result: this.attemptResult,
    };
  }

  private currentTarget(): TrainingCell | null {
    if (this.scenario.exercise === 'route') {
      return this.scenario.targets[this.targetCursor] ?? null;
    }
    return this.scenario.targets[0] ?? null;
  }

  private progress(): { current: number; total: number } {
    if (this.scenario.exercise === 'route' || this.scenario.exercise === 'escape') {
      return { current: this.targetCursor, total: this.scenario.targets.length };
    }
    return {
      current: this.checkpointCursor,
      total: this.scenario.checkpointIndices.length,
    };
  }

  private completionReached(): boolean {
    if (this.scenario.exercise === 'route' || this.scenario.exercise === 'escape') {
      return this.targetCursor >= this.scenario.targets.length;
    }
    return this.checkpointCursor >= this.scenario.checkpointIndices.length;
  }

  private finish(completed: boolean): TrainingAttemptResult {
    if (this.attemptResult) return this.attemptResult;
    this.done = true;
    this.engine.pause();
    const progress = this.progress();
    const splits = this.scenario.checkpointIndices.map((checkpoint) => {
      const actualTick = this.checkpointTicks.get(checkpoint) ?? null;
      return {
        checkpoint,
        expectedTick: checkpoint,
        actualTick,
        deltaTicks: actualTick === null ? null : actualTick - checkpoint,
      };
    });
    const unnecessaryInputs = this.duplicateInputs + Math.max(
      0,
      this.acceptedTurns - expectedTurnCount(this.scenario)
    );
    const facts: TrainingAttemptFacts = {
      completed,
      kind: this.scenario.kind,
      exercise: this.scenario.exercise,
      tickMs: this.scenario.tickMs,
      ticks: this.tickIndex,
      optimalTicks: this.scenario.optimalTicks,
      progress: progress.current,
      progressTotal: progress.total,
      pathMatchedTicks: this.pathMatchedTicks,
      pathObservedTicks: this.tickIndex,
      rejectedInputs: this.rejectedInputs,
      unnecessaryInputs,
      splits,
    };
    this.attemptResult = {
      scenario: this.scenario.reference ? { ...this.scenario.reference } : null,
      exercise: this.scenario.exercise,
      difficulty: this.scenario.difficulty,
      kind: this.scenario.kind,
      metrics: scoreTrainingAttempt(facts),
      inputs: this.inputs.map((input) => ({ ...input })),
      trace: this.trace.map((point) => ({ ...point })),
    };
    return this.attemptResult;
  }
}

export function replayTrainingAttempt(
  scenario: TrainingScenario,
  inputs: readonly TrainingInput[],
  endedAtTick?: number
): TrainingAttemptResult {
  if (
    endedAtTick !== undefined &&
    (!Number.isInteger(endedAtTick) || endedAtTick < 0 || endedAtTick > scenario.maxTicks)
  ) {
    throw new Error('Training end tick is outside the scenario');
  }
  let previousTick = -1;
  for (const input of inputs) {
    if (
      !Number.isInteger(input.tick) || input.tick < 0 || input.tick > scenario.maxTicks ||
      (endedAtTick !== undefined && input.tick > endedAtTick)
    ) {
      throw new Error('Training input tick is outside the scenario');
    }
    if (input.tick < previousTick) throw new Error('Training inputs must be ordered');
    previousTick = input.tick;
  }
  if (inputs.length > scenario.maxTicks * 4 + 8) {
    throw new Error('Training input trace is too large');
  }

  const run = new TrainingRun(scenario);
  let cursor = 0;
  while (!run.isDone && run.tick <= scenario.maxTicks) {
    while (cursor < inputs.length && inputs[cursor].tick === run.tick) {
      const input = inputs[cursor];
      if (input.type === 'pause') {
        if (!run.pause()) throw new Error('Training pause event is not valid at this tick');
      } else {
        run.input(input.direction as Direction);
      }
      cursor += 1;
    }
    if (endedAtTick !== undefined && run.tick >= endedAtTick) break;
    if (run.engine.isPaused) {
      if (cursor < inputs.length) {
        throw new Error('Training input trace cannot advance while the board is held');
      }
      break;
    }
    if (!run.isStarted) {
      if (cursor < inputs.length) {
        throw new Error('Training input trace cannot advance while the board is held');
      }
      break;
    }
    run.advance();
  }
  if (cursor !== inputs.length) throw new Error('Training trace continues after the attempt ended');
  const result = run.isDone ? run.snapshot().result! : run.stop();
  if (endedAtTick !== undefined && result.metrics.ticks !== endedAtTick) {
    throw new Error('Training trace does not reach its declared end tick');
  }
  return result;
}
