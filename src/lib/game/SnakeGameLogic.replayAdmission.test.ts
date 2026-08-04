import {
  SnakeGameLogic,
  type SnakeCheckpointV1,
  type SnakeReplayTrace,
} from '@/lib/game/SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';

const STARTED_AT = Date.UTC(2026, 7, 3, 8, 0, 0);
const SIMULATION_SEED = 'wall-rush-buffered-turn-1';

function newEngine(): SnakeGameLogic {
  const game = new SnakeGameLogic({
    ruleset: RULESETS.PRIMAL,
    simulationSeed: SIMULATION_SEED,
    growthProfileId: 'dynasty',
  });
  game.prepare();
  return game;
}

/** Exactly how the server rebuilds an engine before replaying a suffix. */
function replayEngineFrom(checkpoint: SnakeCheckpointV1): SnakeGameLogic {
  const engine = newEngine();
  engine.restoreCheckpoint(checkpoint, STARTED_AT, {
    replacePreparedOpening: true,
  });
  return engine;
}

/**
 * The audit's PRIMAL reproduction, twelve ticks long.
 *
 * The snake runs east into the wall column, turns UP, then the player buffers
 * RIGHT + UP inside one tick interval - two turns admitted against each other,
 * which is the ordinary way to steer a Wall Rush corner. Tick 10 consumes the
 * RIGHT, hits the wall, and Wall Rush rewrites the live heading to UP mid-tick
 * WITHOUT clearing the buffer. Tick 11 then consumes the already-admitted UP.
 */
function driveBufferedTurnAcrossSlide(): {
  game: SnakeGameLogic;
  opening: SnakeCheckpointV1;
  beforeBufferedTurn: SnakeCheckpointV1;
} {
  const game = newEngine();
  game.activatePrepared(STARTED_AT);
  // Wall Rush as a legacy pick: `trySlide` is shared with the Genome v2 gene,
  // so this exercises the same mid-tick heading rewrite with no genome setup.
  game.grantMutation('wall_rush', 0);
  const opening = game.exportCheckpoint(STARTED_AT);

  for (let index = 0; index < 9; index += 1) game.tick();
  expect(game.getState().snake[0]).toMatchObject({ x: 19, z: 10 });
  expect(game.getState().direction).toBe('RIGHT');

  expect(game.setDirection('UP', 'standard')).toBe('accepted');
  game.tick();
  expect(game.getState().direction).toBe('UP');

  expect(game.setDirection('RIGHT', 'standard')).toBe('accepted');
  expect(game.setDirection('UP', 'standard')).toBe('accepted');

  game.tick();
  // The slide: the clockwise perpendicular (DOWN) is body-blocked, so Wall
  // Rush takes the counter-clockwise fallback and the heading becomes UP.
  expect(game.getState().isGameOver).toBe(false);
  expect(game.getState().direction).toBe('UP');
  expect(game.getState().snake[0]).toMatchObject({ x: 19, z: 8 });
  const beforeBufferedTurn = game.exportCheckpoint(STARTED_AT);

  game.tick();
  expect(game.getState().isGameOver).toBe(false);
  expect(game.getState().snake[0]).toMatchObject({ x: 19, z: 7 });

  return { game, opening, beforeBufferedTurn };
}

describe('replay turn admission', () => {
  it('replays a turn buffered across a Wall Rush slide instead of rejecting it', () => {
    const { game, opening } = driveBufferedTurnAcrossSlide();
    const trace = game.getReplayTrace();

    // The recorded shape the server receives: the buffered UP is consumed on
    // the tick after the slide, where the live heading is already UP.
    expect(trace).toEqual({
      ticks: 12,
      actions: [
        { tick: 9, kind: 'turn', direction: 'UP' },
        { tick: 10, kind: 'turn', direction: 'RIGHT' },
        { tick: 11, kind: 'turn', direction: 'UP' },
      ],
    });

    const replay = replayEngineFrom(opening);
    expect(() => replay.applyReplayTrace(trace, 0)).not.toThrow();
    expect(replay.getState().snake).toEqual(game.getState().snake);
    expect(replay.getState().direction).toBe(game.getState().direction);
    expect(replay.getSimulationTick()).toBe(game.getSimulationTick());
  });

  it('accepts the same buffered turn when the checkpoint boundary splits the chain', () => {
    const { game, beforeBufferedTurn } = driveBufferedTurnAcrossSlide();
    const trace = game.getReplayTrace();
    const prefix = beforeBufferedTurn.privateState.replay
      .actions as SnakeReplayTrace['actions'];
    expect(prefix).toHaveLength(2);

    // The turn's admission reference (the RIGHT consumed on tick 10) lives in
    // the prefix the canonical checkpoint already absorbed, and restoring
    // clears the input buffer - so the chain must be re-derived from the trace.
    const replay = replayEngineFrom(beforeBufferedTurn);
    expect(() => replay.applyReplayTrace(trace, prefix.length)).not.toThrow();
    expect(replay.getState().snake).toEqual(game.getState().snake);
    expect(replay.getState().direction).toBe(game.getState().direction);
  });

  it('still rejects a turn no press could have produced', () => {
    const { game, opening } = driveBufferedTurnAcrossSlide();
    const trace = game.getReplayTrace();

    // Tick 9 is chained to nothing (tick 8 consumed no turn), so its only
    // admission reference is the live heading, RIGHT. A forged LEFT there is a
    // reversal under every reference the engine could have used.
    const forged: SnakeReplayTrace = {
      ticks: trace.ticks,
      actions: trace.actions.map((action, index) =>
        index === 0 ? { ...action, direction: 'LEFT' as const } : action
      ),
    };
    const replay = replayEngineFrom(opening);
    expect(() => replay.applyReplayTrace(forged, 0)).toThrow(
      'Replay contains an illegal turn'
    );
  });

  it('still rejects two turns claimed for one tick', () => {
    const { game, opening } = driveBufferedTurnAcrossSlide();
    const trace = game.getReplayTrace();
    const doubled: SnakeReplayTrace = {
      ticks: trace.ticks,
      actions: [
        trace.actions[0],
        { tick: 9, kind: 'turn', direction: 'DOWN' },
        ...trace.actions.slice(1),
      ],
    };
    const replay = replayEngineFrom(opening);
    expect(() => replay.applyReplayTrace(doubled, 0)).toThrow(
      'Replay contains two turns for one tick'
    );
  });

  it('leaves live admission untouched', () => {
    const game = newEngine();
    game.activatePrepared(STARTED_AT);
    expect(game.getState().direction).toBe('RIGHT');
    expect(game.setDirection('LEFT', 'standard')).toBe('reversal');
    expect(game.setDirection('RIGHT', 'standard')).toBe('duplicate');
    expect(game.setDirection('UP', 'standard')).toBe('accepted');
    // Chained against the buffered UP, not the live heading.
    expect(game.setDirection('DOWN', 'standard')).toBe('reversal');
    expect(game.setDirection('UP', 'standard')).toBe('duplicate');
    expect(game.setDirection('RIGHT', 'standard')).toBe('accepted');
  });
});
