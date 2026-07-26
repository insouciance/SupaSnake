/**
 * Seed determinism for the run engine (finding F-12, WP-1.08).
 *
 * Constitution §11.3 makes a challenge link "drop the visitor onto the
 * *same seed* with the sharer's score as the target". That promise is only
 * true if a seed reproduces a board, so this file is the proof: two engines
 * built from one seed and driven by one input script must agree on every
 * observable of the run, tick by tick.
 *
 * Before F-12, `sampleFoodCell` called `Math.random()` directly instead of
 * the injected `this.rng`, so the very first food wave differed between two
 * runs on the same seed and every subsequent decision diverged with it. The
 * `differing seeds diverge` case is the other half of the proof: it shows
 * the trace is genuinely seed-driven and not merely constant.
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic, type Direction } from './SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';
import { fnv1a, mulberry32 } from '@/shared/game/offerGravity';

/** The same seed -> rng derivation a challenge link uses. */
function seededRng(seed: string): () => number {
  return mulberry32(fnv1a(seed));
}

/**
 * A fixed steering script. Deliberately not straight-line: it turns, so the
 * snake sweeps the board and meets whatever the placement samplers laid
 * down, rather than running off one axis and hitting a wall on tick 20.
 */
const SCRIPT: readonly Direction[] = [
  'RIGHT', 'RIGHT', 'UP', 'UP', 'RIGHT', 'DOWN', 'DOWN', 'RIGHT',
  'UP', 'LEFT', 'UP', 'RIGHT', 'RIGHT', 'DOWN', 'LEFT', 'DOWN',
];

interface Frame {
  tick: number;
  head: string;
  length: number;
  score: number;
  dna: number;
  foods: string;
  exit: string;
  exit2: string;
  mutation: string;
  glyph: number | null;
  over: boolean;
}

function snapshot(game: SnakeGameLogic, tick: number): Frame {
  const state = game.getState();
  const cell = (p: { x: number; z: number } | null | undefined) =>
    p ? `${p.x},${p.z}` : '-';
  return {
    tick,
    head: cell(state.snake[0]),
    length: state.snake.length,
    score: state.score,
    dna: state.dnaCollected,
    foods: state.foods.map(cell).join('|'),
    exit: cell(state.exitTile),
    exit2: cell(state.exitTile2),
    mutation: cell(state.mutationTile),
    glyph: state.constellationGlyph ?? null,
    over: state.isGameOver,
  };
}

/**
 * Play a scripted run on `seed` and return its full trace. Steering is
 * applied from the script; `setDirection` rejecting an illegal reversal is
 * itself deterministic, so the script needs no filtering.
 */
function traceRun(seed: string, ticks = 220): Frame[] {
  const game = new SnakeGameLogic({
    gridSize: 40,
    ruleset: RULESETS.COSMIC,
    rng: seededRng(seed),
  });
  game.start();

  const frames: Frame[] = [snapshot(game, 0)];
  for (let i = 1; i <= ticks; i += 1) {
    const state = game.getState();
    if (state.isGameOver) break;
    // A choice hold freezes the engine by design (Rule 1); resolving it the
    // same way every time keeps the script comparable across seeds.
    if (state.pendingChoice !== null) {
      game.declineMutation();
    } else if (state.pendingPortalChoice !== null) {
      game.resolvePortalChoice('pass');
    }
    game.setDirection(SCRIPT[i % SCRIPT.length]);
    game.tick();
    frames.push(snapshot(game, i));
  }
  return frames;
}

describe('engine determinism from a seed (F-12)', () => {
  it('replays an identical run for the same seed', () => {
    const first = traceRun('S1c0ffee');
    const second = traceRun('S1c0ffee');

    expect(first.length).toBeGreaterThan(20);
    expect(second).toEqual(first);
  });

  it('places the first food wave from the seed, not from Math.random', () => {
    // The exact regression: two engines on one seed, inspected before any
    // input at all. Under F-12 these differed on essentially every call.
    const a = new SnakeGameLogic({ gridSize: 40, ruleset: RULESETS.COSMIC, rng: seededRng('wave') });
    const b = new SnakeGameLogic({ gridSize: 40, ruleset: RULESETS.COSMIC, rng: seededRng('wave') });
    a.start();
    b.start();

    const foods = (game: SnakeGameLogic) =>
      game.getState().foods.map((p) => `${p.x},${p.z}`).join('|');

    // COSMIC spawns a constellation group, so this compares several cells.
    expect(a.getState().foods.length).toBeGreaterThan(1);
    expect(foods(b)).toBe(foods(a));
  });

  it('lays out different boards for different seeds', () => {
    const layouts = new Set(
      ['seed-a', 'seed-b', 'seed-c', 'seed-d'].map((seed) => {
        const game = new SnakeGameLogic({
          gridSize: 40,
          ruleset: RULESETS.COSMIC,
          rng: seededRng(seed),
        });
        game.start();
        return game.getState().foods.map((p) => `${p.x},${p.z}`).join('|');
      })
    );
    // If placement had stayed on Math.random this would still pass; the
    // point of the assertion is the converse - that the seed is the input,
    // proven together with the reproducibility case above.
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('diverges when the seed changes, so a challenge link means something', () => {
    const a = traceRun('S1c0ffee');
    const b = traceRun('Sdecafbad');
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it('is reproducible on every dynasty ruleset', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const play = () => {
        const game = new SnakeGameLogic({
          gridSize: 40,
          ruleset: RULESETS[dynasty],
          rng: seededRng(`ruleset-${dynasty}`),
        });
        game.start();
        const frames: Frame[] = [];
        for (let i = 1; i <= 120; i += 1) {
          const state = game.getState();
          if (state.isGameOver) break;
          if (state.pendingChoice !== null) game.declineMutation();
          else if (state.pendingPortalChoice !== null) game.resolvePortalChoice('pass');
          game.setDirection(SCRIPT[i % SCRIPT.length]);
          game.tick();
          frames.push(snapshot(game, i));
        }
        return frames;
      };
      expect(play()).toEqual(play());
    }
  });
});
