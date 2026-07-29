/**
 * Food placement (WP-3.05).
 *
 * The shipped sampler rejection-sampled 1000 random cells and then RETURNED
 * ITS LAST GUESS whatever it was. On a board that is 8% full — the median
 * production run — the chance of 1000 consecutive misses is around 1e-46, so
 * the bug was unobservable. This wave deliberately drives runs toward a full
 * board, and the failure mode arrives with it: food inside your own body, on
 * the portal, or inside a terrain block.
 *
 * So the first two tests below are the ones that matter, and they are stated
 * as absolutes rather than as probabilities.
 */

import { describe, it, expect } from '@jest/globals';
import {
  FOOD_RADIUS_MIN,
  blockedGrid,
  chooseFoodCell,
  chooseSurvivableTargetCell,
  foodSearchRadius,
  markBlocked,
  placementKey,
  reachableFrom,
} from './foodPlacement';

/**
 * The tests express blocked cells as a readable string Set; `chooseFoodCell`
 * takes an integer grid, because a string key per segment on the engine's
 * hottest path cost the suite six minutes. Converted here so the tests stay
 * legible without putting that cost back into the game.
 */
function grid(blocked: ReadonlySet<string>, gridSize = GRID): Uint8Array {
  const g = blockedGrid(gridSize);
  blocked.forEach((key) => {
    const [x, z] = key.split(',').map(Number);
    markBlocked(g, gridSize, x, z);
  });
  return g;
}

const GRID = 20;

/** A deterministic stand-in for the engine's seeded stream. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function blockAll(except: Array<[number, number]>): Set<string> {
  const free = new Set(except.map(([x, z]) => placementKey(x, z)));
  const blocked = new Set<string>();
  for (let x = 0; x < GRID; x++) {
    for (let z = 0; z < GRID; z++) {
      const key = placementKey(x, z);
      if (!free.has(key)) blocked.add(key);
    }
  }
  return blocked;
}

describe('the placer never returns an illegal cell', () => {
  it('never lands on a blocked cell, at any occupancy', () => {
    const rng = seeded(7);
    // Sweep occupancy from empty to nearly full, blocking a growing prefix.
    for (let filled = 0; filled < GRID * GRID - 2; filled += 37) {
      const blocked = new Set<string>();
      for (let i = 0; i < filled; i++) {
        blocked.add(placementKey(i % GRID, Math.floor(i / GRID)));
      }
      const head = { x: GRID - 1, z: GRID - 1 };
      blocked.add(placementKey(head.x, head.z));
      const cell = chooseFoodCell(GRID, head, grid(blocked), filled / 400, rng);
      if (cell === null) continue;
      expect(blocked.has(placementKey(cell.x, cell.z))).toBe(false);
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(GRID);
      expect(cell.z).toBeGreaterThanOrEqual(0);
      expect(cell.z).toBeLessThan(GRID);
    }
  });

  it('returns the ONLY free cell when exactly one remains', () => {
    // The case the rejection sampler had a real chance of failing: one free
    // cell in 400, so a uniform guess misses 99.75% of the time.
    const blocked = blockAll([
      [3, 3],
      [3, 4],
    ]);
    const cell = chooseFoodCell(GRID, { x: 3, z: 4 }, grid(blocked), 399 / 400, seeded(1));
    expect(cell).toEqual({ x: 3, z: 3 });
  });

  it('returns null only when the board holds no free cell', () => {
    const blocked = blockAll([]);
    expect(chooseFoodCell(GRID, { x: 0, z: 0 }, grid(blocked), 1, seeded(1))).toBeNull();
  });

  it('a zero-size board is null, not a crash', () => {
    expect(chooseFoodCell(0, { x: 0, z: 0 }, blockedGrid(0), 0, seeded(1))).toBeNull();
  });
});

describe('reachability', () => {
  it('excludes a pocket sealed by the body', () => {
    // A 1-cell pocket at (0,0) walled off by blocked cells. The head sits far
    // away with open space around it.
    const blocked = new Set<string>([
      placementKey(1, 0),
      placementKey(0, 1),
      placementKey(1, 1),
    ]);
    const reach = reachableFrom(GRID, { x: 10, z: 10 }, blocked);
    expect(reach.has(placementKey(0, 0))).toBe(false);
    expect(reach.has(placementKey(10, 11))).toBe(true);
  });

  it('never places food in a sealed pocket once the board is crowded', () => {
    // The guarantee holds once random sampling stops landing, which is where
    // sealed pockets are actually common and actually fatal. A board this full
    // exhausts the sampler, so every placement is enumerated exactly.
    const blocked = new Set<string>([
      placementKey(1, 0),
      placementKey(0, 1),
      placementKey(1, 1),
    ]);
    const rng = seeded(99);
    for (let i = 0; i < 300; i++) {
      const cell = chooseFoodCell(GRID, { x: 10, z: 10 }, grid(blocked),
        0.9,
        rng
      );
      expect(cell).not.toEqual({ x: 0, z: 0 });
    }
  });

  it('never places food in a sealed pocket, however sparse the board', () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, and the inversion is the point.
    //
    // It was called "on a sparse board it rejection-samples, and that is the
    // deal", and it asserted that food DOES sometimes land in a sealed pocket
    // when the board is nearly empty - an honest boundary test for a deliberate
    // limitation. The reasoning: a pocket sealed by your own BODY is transient,
    // because the tail vacates, so refusing such a cell would be over-strict
    // and paying for a flood fill on every spawn would not be worth it.
    //
    // Terrain killed that reasoning. A pocket sealed by terrain is sealed
    // FOREVER - Rule 15 forbids removing a block - so food inside one is a
    // target the player can never take. The owner hit it in a real run: food in
    // the outer ring, walled off by the arena, reachable only by dying.
    //
    // Reachability is now checked on every placement, bounded to a fixed
    // neighbourhood so it cannot reintroduce the cost that made the first
    // version of this module 400x too slow.
    const blocked = new Set<string>([
      placementKey(1, 0),
      placementKey(0, 1),
      placementKey(1, 1),
    ]);
    const rng = seeded(99);
    for (let i = 0; i < 4000; i++) {
      const cell = chooseFoodCell(GRID, { x: 10, z: 10 }, grid(blocked), 0.02, rng);
      expect(cell).not.toEqual({ x: 0, z: 0 });
    }
  });

  it('still returns a legal cell every time it refuses a pocket', () => {
    const blocked = new Set<string>([
      placementKey(1, 0),
      placementKey(0, 1),
      placementKey(1, 1),
    ]);
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) {
      const cell = chooseFoodCell(GRID, { x: 10, z: 10 }, grid(blocked), 0.02, rng)!;
      expect(blocked.has(placementKey(cell.x, cell.z))).toBe(false);
    }
  });

  it('falls back to any free cell when the head is fully sealed in', () => {
    // Head boxed into a single cell. Refusing to place food would freeze a run
    // that is ending anyway; placing it somewhere unreachable at least lets
    // the run finish.
    const head = { x: 5, z: 5 };
    const blocked = new Set<string>([
      placementKey(5, 5),
      placementKey(4, 5),
      placementKey(6, 5),
      placementKey(5, 4),
      placementKey(5, 6),
    ]);
    const cell = chooseFoodCell(GRID, head, grid(blocked), 0.02, seeded(3));
    expect(cell).not.toBeNull();
    expect(blocked.has(placementKey(cell!.x, cell!.z))).toBe(false);
  });
});

describe('reachable is not survivable', () => {
  // THE OWNER'S RUN: "that food was reachable, but you couldn't get out alive -
  // there was no escape path. I had to crash into myself, but I got the food
  // first."
  //
  // BE PRECISE ABOUT WHAT THIS CHECK DOES, because the first version of these
  // tests was not, and a test that overstates its subject is worse than none.
  //
  // It measures the free region containing the candidate and refuses the cell
  // when that region cannot hold the body coming for it. That catches food
  // stranded in a fragment of a board that terrain has cut up, and it catches
  // food placed when the snake is already boxed in.
  //
  // It does NOT prove survivability in general. A pocket with a mouth belongs
  // to the whole open region, so it measures large and passes - even though the
  // snake's own body may seal that mouth behind it on the way in. Proving THAT
  // is a Hamiltonian question, not a flood fill.
  //
  // The owner's actual case is handled a layer up, in the engine: food is no
  // longer placed in the ring the arena is currently closing (see
  // `markClosingRing`), which is where their food was.

  it('refuses a cell whose whole region is smaller than the snake', () => {
    // Head sealed into a 6-cell pen by terrain. Reachable, and fatal.
    const blocked = new Set<string>();
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        const inPen = x <= 2 && z <= 1;
        if (!inPen) blocked.add(placementKey(x, z));
      }
    }
    blocked.add(placementKey(0, 0)); // the head's own cell
    const rng = seeded(3);
    // A 30-segment snake cannot survive in a 5-cell pen, so every cell in it is
    // refused - and the placer still returns something legal rather than null.
    for (let i = 0; i < 200; i++) {
      const cell = chooseFoodCell(
        GRID, { x: 0, z: 0 }, grid(blocked), 0.98, rng, null, 30
      );
      expect(cell).not.toBeNull();
      expect(blocked.has(placementKey(cell!.x, cell!.z))).toBe(false);
    }
  });

  it('allows the same pen for a snake short enough to live in it', () => {
    // The rule is about ROOM, not about the shape being forbidden.
    const blocked = new Set<string>();
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        const inPen = x <= 2 && z <= 1;
        if (!inPen) blocked.add(placementKey(x, z));
      }
    }
    blocked.add(placementKey(0, 0));
    const cell = chooseFoodCell(
      GRID, { x: 0, z: 0 }, grid(blocked), 0.98, seeded(9), null, 3
    );
    expect(cell).not.toBeNull();
    expect(blocked.has(placementKey(cell!.x, cell!.z))).toBe(false);
  });

  it('never returns null just because nothing satisfies the budget', () => {
    // Refusing to place food would freeze a run rather than end it, which is
    // strictly worse than an awkward placement.
    const blocked = blockAll([[3, 3], [3, 4]]);
    const cell = chooseFoodCell(
      GRID, { x: 3, z: 4 }, grid(blocked), 399 / 400, seeded(1), null, 50
    );
    expect(cell).toEqual({ x: 3, z: 3 });
  });

  it('lets an optional target decline instead of spawning in a fatal pocket', () => {
    // The head and five free cells form a sealed pen. Food retains its unsafe
    // last resort so a doomed run can finish; a portal must not pretend this
    // five-cell region is an actionable choice for a 30-cell body.
    const blocked = new Set<string>();
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        if (!(x <= 2 && z <= 1)) blocked.add(placementKey(x, z));
      }
    }
    blocked.add(placementKey(0, 0));

    expect(
      chooseSurvivableTargetCell(
        GRID,
        { x: 0, z: 0 },
        grid(blocked),
        seeded(3),
        30
      )
    ).toBeNull();
  });

  it('selects the same reachable region when it has room for the body', () => {
    const blocked = new Set<string>();
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        if (!(x <= 2 && z <= 1)) blocked.add(placementKey(x, z));
      }
    }
    blocked.add(placementKey(0, 0));

    const target = chooseSurvivableTargetCell(
      GRID,
      { x: 0, z: 0 },
      grid(blocked),
      seeded(9),
      3
    );
    expect(target).not.toBeNull();
    expect(blocked.has(placementKey(target!.x, target!.z))).toBe(false);
  });
});

describe('the search radius is the traverse fix', () => {
  it('spans the whole board while the board is empty', () => {
    // The opening must be byte-identical in feel to the shipped game: at a
    // median run's 8% occupancy the radius still covers every cell.
    expect(foodSearchRadius(GRID, 0)).toBeGreaterThanOrEqual(GRID);
    expect(foodSearchRadius(GRID, 0.08)).toBeGreaterThanOrEqual(GRID - 3);
  });

  it('tightens as the board fills, and never below the floor', () => {
    const empty = foodSearchRadius(GRID, 0.05);
    const half = foodSearchRadius(GRID, 0.5);
    const full = foodSearchRadius(GRID, 0.9);
    expect(half).toBeLessThan(empty);
    expect(full).toBeLessThan(half);
    expect(full).toBe(FOOD_RADIUS_MIN);
  });

  it('is monotonic — a fuller board never widens the search', () => {
    let previous = Infinity;
    for (let o = 0; o <= 1.0001; o += 0.05) {
      const r = foodSearchRadius(GRID, o);
      expect(r).toBeLessThanOrEqual(previous);
      previous = r;
    }
  });

  it('keeps food inside the radius on a crowded board', () => {
    // Fill the top half, head bottom-left. Every placement should land within
    // the tightened radius rather than across the board.
    const blocked = new Set<string>();
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID / 2; z++) blocked.add(placementKey(x, z));
    }
    const head = { x: 0, z: GRID - 1 };
    blocked.add(placementKey(head.x, head.z));
    const radius = foodSearchRadius(GRID, 0.5);
    const rng = seeded(11);
    for (let i = 0; i < 200; i++) {
      const cell = chooseFoodCell(GRID, head, grid(blocked), 0.5, rng)!;
      const distance = Math.max(
        Math.abs(cell.x - head.x),
        Math.abs(cell.z - head.z)
      );
      expect(distance).toBeLessThanOrEqual(radius);
    }
  });
});

describe('the two flood fills agree', () => {
  // `reachableFrom` is the readable statement of the rule; `chooseFoodCell`
  // runs the same fill over integer indices inside a bounded window. The module
  // header claims they agree, so something has to check it — the whole reason
  // the shipped placer carried a latent bug is that nothing bound its two paths
  // together.
  it('the head cell is never a candidate, from either fill', () => {
    // The case that caught this: block the board down to two free cells and
    // stand the head on one of them. Seeding the fill from the head's
    // NEIGHBOURS is not enough — it walks back into the head from the first
    // neighbour it expands.
    const head = { x: 3, z: 4 };
    const blocked = blockAll([
      [3, 3],
      [3, 4],
    ]);
    expect(reachableFrom(GRID, head, blocked).has(placementKey(3, 4))).toBe(
      false
    );
    const rng = seeded(1);
    for (let i = 0; i < 200; i++) {
      expect(chooseFoodCell(GRID, head, grid(blocked), 399 / 400, rng)).toEqual({
        x: 3,
        z: 3,
      });
    }
  });

  it('agree on which cells a crowded board leaves reachable', () => {
    // A spiral-ish wall that seals a real pocket, at an occupancy high enough
    // that `chooseFoodCell` is on its exact path every time.
    const blocked = new Set<string>();
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        if (z === 5 && x < GRID - 1) blocked.add(placementKey(x, z));
      }
    }
    const head = { x: 10, z: 10 };
    blocked.add(placementKey(head.x, head.z));
    const reach = reachableFrom(GRID, head, blocked);
    const rng = seeded(4);
    // Everything the placer returns must be something the readable fill also
    // calls reachable. (Not the converse: the placer's window is deliberately
    // narrower, which is conservative in the safe direction.)
    for (let i = 0; i < 300; i++) {
      const cell = chooseFoodCell(GRID, head, grid(blocked), 0.95, rng);
      expect(cell).not.toBeNull();
      expect(reach.has(placementKey(cell!.x, cell!.z))).toBe(true);
    }
  });
});

describe('placement cost is bounded by the neighbourhood, not the board', () => {
  // THE ASSERTION WHOSE ABSENCE COST A WEEK. The first version of this module
  // was correct and ~400x too slow on a large board, and nothing failed: it
  // surfaced as a CI job cancelled at its 15-minute timeout, three commits
  // later, and was then misdiagnosed four times in a row.
  //
  // The budget is deliberately loose — timing tests flake, and this one only
  // has to catch a regression of that magnitude, not a 20% drift. For scale:
  // the parked implementation needed roughly 13 SECONDS for this loop.
  it('survives a degenerate rng on a board 400 cells wide', () => {
    const big = 400;
    const blocked = blockedGrid(big);
    // A snake-shaped run of blocked cells through the middle of the board,
    // including the head's own cell, exactly as the engine marks it.
    for (let i = 0; i < 300; i++) {
      markBlocked(blocked, big, 200 + (i % 3), 200 + Math.floor(i / 3));
    }
    const head = { x: 200, z: 200 };
    // A constant stream is the worst case and NOT hypothetical: it is what
    // `foldParity.test.ts` injects, which is how the regression got in.
    const constant = () => 0.5;
    const started = Date.now();
    for (let i = 0; i < 1000; i++) {
      expect(chooseFoodCell(big, head, blocked, 300 / (big * big), constant))
        .not.toBeNull();
    }
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('determinism and clustering', () => {
  it('the same seed lays out the same food', () => {
    // Replayability, not validation: challenge links and same-seed runs must
    // reproduce the board exactly (the discipline terrain.ts follows).
    const blocked = new Set<string>([placementKey(0, 0)]);
    const a = Array.from({ length: 20 }, (_, i) =>
      chooseFoodCell(GRID, { x: 0, z: 0 }, grid(blocked), 0.05, seeded(42 + i))
    );
    const b = Array.from({ length: 20 }, (_, i) =>
      chooseFoodCell(GRID, { x: 0, z: 0 }, grid(blocked), 0.05, seeded(42 + i))
    );
    expect(a).toEqual(b);
  });

  it('an anchor clusters the placement, for COSMIC groups', () => {
    const blocked = new Set<string>([placementKey(19, 19)]);
    const anchor = { cell: { x: 4, z: 4 }, radius: 4 };
    const rng = seeded(5);
    for (let i = 0; i < 200; i++) {
      const cell = chooseFoodCell(GRID, { x: 19, z: 19 }, grid(blocked),
        0.02,
        rng,
        anchor
      )!;
      expect(Math.abs(cell.x - 4)).toBeLessThanOrEqual(4);
      expect(Math.abs(cell.z - 4)).toBeLessThanOrEqual(4);
    }
  });

  it('a crowded anchor neighbourhood falls back instead of failing', () => {
    // Block everything within the anchor radius. The old sampler burned 500
    // attempts here and then fell through to a uniform guess; this must simply
    // place a legal cell elsewhere.
    const blocked = new Set<string>();
    for (let x = 0; x <= 8; x++) {
      for (let z = 0; z <= 8; z++) blocked.add(placementKey(x, z));
    }
    const cell = chooseFoodCell(GRID, { x: 15, z: 15 }, grid(blocked),
      0.2,
      seeded(8),
      { cell: { x: 4, z: 4 }, radius: 4 }
    );
    expect(cell).not.toBeNull();
    expect(blocked.has(placementKey(cell!.x, cell!.z))).toBe(false);
  });
});
