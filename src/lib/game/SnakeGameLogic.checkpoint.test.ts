import { describe, expect, it } from '@jest/globals';
import {
  SNAKE_CHECKPOINT_VERSION,
  SnakeGameLogic,
  type Direction,
  type SnakeCheckpointV1,
} from './SnakeGameLogic';
import { RULESETS, type DynastyName } from '@/shared/game/rulesets';

const DYNASTIES: readonly DynastyName[] = ['CYBER', 'PRIMAL', 'COSMIC'];

function foodImmediatelyAhead(game: SnakeGameLogic): { x: number; y: 0; z: number } {
  const state = game.getState();
  const head = state.snake[0];
  const offsets: Record<Direction, { x: number; z: number }> = {
    UP: { x: 0, z: -1 },
    DOWN: { x: 0, z: 1 },
    LEFT: { x: -1, z: 0 },
    RIGHT: { x: 1, z: 0 },
  };
  const offset = offsets[state.direction];
  return { x: head.x + offset.x, y: 0, z: head.z + offset.z };
}

function eatNextFood(game: SnakeGameLogic): void {
  game.placeFood(foodImmediatelyAhead(game));
  game.tick();
}

function comparableCheckpoint(
  game: SnakeGameLogic,
  now: number
): SnakeCheckpointV1 {
  return game.exportCheckpoint(now);
}

function gameplayState(game: SnakeGameLogic) {
  const { startTime: _startTime, ...state } = game.getState();
  return state;
}

describe('SnakeGameLogic resumable checkpoints', () => {
  it.each(DYNASTIES)(
    'continues the exact seeded future in %s',
    (dynasty) => {
      const original = new SnakeGameLogic({
        gridSize: 120,
        ruleset: RULESETS[dynasty],
        simulationSeed: `resume-${dynasty}`,
      });
      original.start();

      for (let index = 0; index < 4; index += 1) eatNextFood(original);

      const checkpointAt = Date.now() + 500;
      const checkpoint = comparableCheckpoint(original, checkpointAt);
      const resumed = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.PRIMAL,
      });
      resumed.restoreCheckpoint(checkpoint, checkpointAt + 60_000);

      // Offline time must not advance the run clock, and stale queued input
      // must never execute when the player returns.
      expect(resumed.getState().isPaused).toBe(checkpoint.state.isPaused);
      expect(resumed.exportCheckpoint(checkpointAt + 60_000).privateState.elapsedMs)
        .toBe(checkpoint.privateState.elapsedMs);

      original.resume();
      resumed.resume();

      for (let index = 0; index < 12; index += 1) {
        eatNextFood(original);
        eatNextFood(resumed);
        expect(gameplayState(resumed)).toEqual(gameplayState(original));
        expect(resumed.getSpeed()).toBe(original.getSpeed());
      }

      const originalFuture = comparableCheckpoint(original, checkpointAt + 1_000);
      const resumedFuture = comparableCheckpoint(resumed, checkpointAt + 61_000);
      // Absolute wall-clock timestamps differ by the offline interval. The
      // logical elapsed run time and every simulation field must not. Event
      // deciseconds are observational analytics, so compare their ordered
      // payloads independently from the synthetic wall clocks in this test.
      resumedFuture.state.startTime = originalFuture.state.startTime;
      resumedFuture.privateState.runEvents = resumedFuture.privateState.runEvents.map(
        (event) => ({ ...event, t: 0 })
      );
      originalFuture.privateState.runEvents = originalFuture.privateState.runEvents.map(
        (event) => ({ ...event, t: 0 })
      );
      expect(resumedFuture).toEqual(originalFuture);
    }
  );

  it('requires a replayable server-issued simulation seed', () => {
    const game = new SnakeGameLogic({ ruleset: RULESETS.PRIMAL });
    game.start();
    expect(() => game.exportCheckpoint()).toThrow(
      'This run has no replayable simulation seed'
    );
  });

  it('rejects terminal and malformed checkpoints', () => {
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed: 'checkpoint-validation',
    });
    game.start();
    const checkpoint = game.exportCheckpoint();
    const receiver = new SnakeGameLogic();

    expect(() =>
      receiver.restoreCheckpoint({
        ...checkpoint,
        version: (SNAKE_CHECKPOINT_VERSION + 1) as typeof SNAKE_CHECKPOINT_VERSION,
      })
    ).toThrow('Unsupported or malformed snake checkpoint');

    game.finalizeRun('died');
    expect(() => game.exportCheckpoint()).toThrow(
      'Only a live resolved run can be checkpointed'
    );
  });

  it('may replace only a pristine prepared opening during server recovery', () => {
    const source = new SnakeGameLogic({
      ruleset: RULESETS.CYBER,
      simulationSeed: 'source-checkpoint',
    });
    source.start();
    eatNextFood(source);
    const checkpoint = comparableCheckpoint(source, Date.now());

    const receiver = new SnakeGameLogic({
      ruleset: RULESETS.CYBER,
      simulationSeed: 'opening-checkpoint',
    });
    receiver.start();
    expect(() =>
      receiver.restoreCheckpoint(checkpoint, Date.now(), {
        replacePreparedOpening: true,
      })
    ).not.toThrow();

    receiver.resume();
    eatNextFood(receiver);
    expect(() =>
      receiver.restoreCheckpoint(checkpoint, Date.now(), {
        replacePreparedOpening: true,
      })
    ).toThrow('Cannot restore over a live engine');
  });
});
