import { SnakeGameLogic } from './SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';

describe('SnakeGameLogic driven starts', () => {
  it('uses an authored body, heading and food while preserving canonical movement', () => {
    const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    const started = jest.fn(() => engine.getState());
    engine.on('gameStart', started);
    engine.startDriven({
      snake: [
        { x: 2, y: 0, z: 10 },
        { x: 3, y: 0, z: 10 },
        { x: 4, y: 0, z: 10 },
      ],
      direction: 'LEFT',
      foods: [{ x: 2, y: 0, z: 6 }],
    });
    expect(engine.getState()).toMatchObject({
      direction: 'LEFT',
      snake: [
        { x: 2, y: 0, z: 10 },
        { x: 3, y: 0, z: 10 },
        { x: 4, y: 0, z: 10 },
      ],
      food: { x: 2, y: 0, z: 6 },
    });
    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.results[0].value.snake[0]).toEqual({ x: 2, y: 0, z: 10 });
    expect(engine.setDirection('UP')).toBe('accepted');
    engine.tick();
    expect(engine.getState().snake[0]).toEqual({ x: 2, y: 0, z: 9 });
  });

  it('rejects invalid authored geometry before replacing state', () => {
    const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    expect(() => engine.startDriven({
      snake: [
        { x: 2, y: 0, z: 2 },
        { x: 4, y: 0, z: 2 },
      ],
      direction: 'RIGHT',
      foods: [{ x: 6, y: 0, z: 2 }],
    })).toThrow(/contiguous/);
    expect(engine.getState().isPlaying).toBe(false);
  });

  it('rejects duplicate authored food before replacing state', () => {
    const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    expect(() => engine.startDriven({
      snake: [
        { x: 2, y: 0, z: 2 },
        { x: 1, y: 0, z: 2 },
      ],
      direction: 'RIGHT',
      foods: [
        { x: 4, y: 0, z: 2 },
        { x: 4, y: 0, z: 2 },
      ],
    })).toThrow(/unique/);
    expect(engine.getState().isPlaying).toBe(false);
  });

  it('rejects a heading that points into the authored body', () => {
    const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    expect(() => engine.startDriven({
      snake: [
        { x: 2, y: 0, z: 2 },
        { x: 1, y: 0, z: 2 },
      ],
      direction: 'LEFT',
      foods: [{ x: 4, y: 0, z: 2 }],
    })).toThrow(/heading/);
    expect(engine.getState().isPlaying).toBe(false);
  });
});
