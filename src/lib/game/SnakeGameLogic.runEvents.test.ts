/**
 * Run-event recorder tests (Player Identity v1 section 9.5) - the
 * engine's compact discrete-event capture: f/p/b/m/w/x codes with
 * deciseconds since run start, near-wall episodes emitted on episode
 * end, the 600-event cap with the terminal event always surviving, and
 * the death-cause stamp. Capture only - nothing here touches scoring.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SnakeGameLogic, type GameOverData } from './SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';
import { RUN_EVENTS_MAX } from '@/shared/game/runEvents';

/** Eat `count` foods deterministically (food placed in the march path). */
function eatFoods(game: SnakeGameLogic, count: number): void {
  for (let i = 0; i < count; i++) {
    const state = game.getState();
    expect(state.isGameOver).toBe(false);
    game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
    game.tick();
  }
}

describe('SnakeGameLogic run-event recorder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts every run with an empty stream', () => {
    const game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    game.start();
    expect(game.getRunEvents()).toEqual({ events: [], truncated: false });
    expect(game.getDeathCause()).toBeNull();
  });

  it('records f events with 1-based food indices and decisecond times', () => {
    const game = new SnakeGameLogic({ gridSize: 30, ruleset: RULESETS.PRIMAL });
    game.start();
    jest.advanceTimersByTime(1000); // 10 deciseconds in
    eatFoods(game, 3);
    const { events } = game.getRunEvents();
    const foods = events.filter((event) => event.e === 'f');
    expect(foods.map((event) => event.n)).toEqual([1, 2, 3]);
    expect(foods.every((event) => event.t === 10)).toBe(true);
  });

  it('records portal spawn when the exit appears organically', () => {
    const game = new SnakeGameLogic({
      gridSize: 60,
      ruleset: RULESETS.PRIMAL,
      rng: () => 0.99, // exit placement escapes the snake row
    });
    game.start();
    eatFoods(game, RULESETS.PRIMAL.extraction.firstExitAtFood);
    const { events } = game.getRunEvents();
    expect(events.some((event) => event.e === 'p' && event.k === 'spawn')).toBe(true);
  });

  it('records a portal PASS when the window expires unused', () => {
    const game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    game.start();
    const head = game.getState().snake[0];
    // Portal far away, one tick left on its window
    game.placeExit({ x: head.x, y: 0, z: head.z + 5 }, 1);
    game.tick();
    const { events } = game.getRunEvents();
    expect(events.some((event) => event.e === 'p' && event.k === 'pass')).toBe(true);
  });

  it('records enter + bank + terminal extracted on extraction', () => {
    const game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    game.start();
    let payload: GameOverData | null = null;
    game.on('gameOver', (data) => {
      payload = data as GameOverData;
    });
    const head = game.getState().snake[0];
    game.placeExit({ x: head.x + 1, y: 0, z: head.z });
    game.tick();

    const { events } = game.getRunEvents();
    expect(events.some((event) => event.e === 'p' && event.k === 'enter')).toBe(true);
    expect(events.some((event) => event.e === 'b')).toBe(true);
    const terminal = events.filter((event) => event.e === 'x');
    expect(terminal).toEqual([expect.objectContaining({ e: 'x', c: 'extracted' })]);
    expect(game.getDeathCause()).toBe('extracted');
    expect(payload!.deathCause).toBe('extracted');
  });

  it('records m events for mutation picks', () => {
    const game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    game.start();
    game.grantMutation('gold_trail');
    game.grantMutation('phoenix');
    const mutationEvents = game.getRunEvents().events.filter((event) => event.e === 'm');
    expect(mutationEvents.map((event) => event.id)).toEqual(['gold_trail', 'phoenix']);
  });

  it('stamps a WALL death (terminal x with c=wall after the death sequence)', () => {
    const game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    game.start();
    // March right into the wall
    for (let i = 0; i < 30 && !game.getState().isDeathSequence; i++) {
      game.tick();
    }
    expect(game.getState().isDeathSequence).toBe(true);
    jest.advanceTimersByTime(800); // death drama -> finalizeRun
    expect(game.getDeathCause()).toBe('wall');
    const terminal = game.getRunEvents().events.filter((event) => event.e === 'x');
    expect(terminal).toEqual([expect.objectContaining({ c: 'wall' })]);
  });

  it('stamps a SELF death when the snake bites its own body', () => {
    const game = new SnakeGameLogic({ gridSize: 30, ruleset: RULESETS.PRIMAL });
    game.start();
    eatFoods(game, 3); // length 6 - long enough to hit on a U-turn
    game.setDirection('DOWN');
    game.tick();
    game.setDirection('LEFT');
    game.tick();
    game.setDirection('UP');
    game.tick(); // bites the body
    expect(game.getState().isDeathSequence).toBe(true);
    jest.advanceTimersByTime(800);
    expect(game.getDeathCause()).toBe('self');
    const terminal = game.getRunEvents().events.filter((event) => event.e === 'x');
    expect(terminal).toEqual([expect.objectContaining({ c: 'self' })]);
  });

  it('emits a near-wall episode >=500ms at episode END with its duration', () => {
    const game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    game.start();
    // March to the wall margin (head starts at x=10; margin is x >= 19)
    for (let i = 0; i < 8; i++) {
      game.tick(); // x 11..18 - not yet in margin
      jest.advanceTimersByTime(100);
    }
    game.tick(); // x=19 - enters the margin
    jest.advanceTimersByTime(100);
    // Ride the wall downward for 600ms
    game.setDirection('DOWN');
    for (let i = 0; i < 6; i++) {
      game.tick();
      jest.advanceTimersByTime(100);
    }
    // Leave the margin
    game.setDirection('LEFT');
    game.tick();

    const wallEvents = game.getRunEvents().events.filter((event) => event.e === 'w');
    expect(wallEvents).toHaveLength(1);
    expect(wallEvents[0].d).toBeGreaterThanOrEqual(5);
  });

  it('ignores near-wall brushes shorter than 500ms', () => {
    const game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    game.start();
    for (let i = 0; i < 9; i++) game.tick(); // into the margin at x=19
    jest.advanceTimersByTime(200); // only 200ms inside
    game.setDirection('DOWN');
    game.tick();
    game.setDirection('LEFT');
    game.tick(); // out of the margin
    expect(game.getRunEvents().events.filter((event) => event.e === 'w')).toHaveLength(0);
  });

  it('caps at 600 events, flags truncation, and the terminal event survives', () => {
    const game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
    game.start();
    for (let i = 0; i < RUN_EVENTS_MAX + 20; i++) {
      game.grantMutation('gold_trail');
    }
    // March into the wall and finish the run
    for (let i = 0; i < 30 && !game.getState().isDeathSequence; i++) {
      game.tick();
    }
    jest.advanceTimersByTime(800);

    const { events, truncated } = game.getRunEvents();
    expect(truncated).toBe(true);
    expect(events).toHaveLength(RUN_EVENTS_MAX);
    expect(events[events.length - 1]).toEqual(
      expect.objectContaining({ e: 'x', c: 'wall' })
    );
  });

  it('keeps times monotonic across the whole stream', () => {
    const game = new SnakeGameLogic({ gridSize: 30, ruleset: RULESETS.PRIMAL });
    game.start();
    eatFoods(game, 2);
    jest.advanceTimersByTime(700);
    game.grantMutation('phoenix');
    jest.advanceTimersByTime(700);
    eatFoods(game, 2);
    const { events } = game.getRunEvents();
    for (let i = 1; i < events.length; i++) {
      expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
    }
  });

  it('a restart wipes the previous run cleanly', () => {
    const game = new SnakeGameLogic({ gridSize: 30, ruleset: RULESETS.PRIMAL });
    game.start();
    eatFoods(game, 2);
    expect(game.getRunEvents().events.length).toBeGreaterThan(0);
    game.start();
    expect(game.getRunEvents()).toEqual({ events: [], truncated: false });
    expect(game.getDeathCause()).toBeNull();
  });
});
