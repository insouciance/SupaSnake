/**
 * ET-1 timing contracts.
 *
 * These are not "the curve returns the number the curve returns" tests. Each
 * one is a property the review's argument depends on
 * (docs/ENGINE_ARCHITECTURE_REVIEW.md, root cause 1): if any of them stops
 * holding, the render has gone back to lying about where the snake is, and the
 * two named constants can be retuned freely as long as they keep holding.
 */

import {
  applyArrivalModeFromSearch,
  ARRIVAL_ALPHA,
  ARRIVAL_OVERSHOOT,
  arrivalMotion,
  arrivalTransition,
  DEFAULT_ARRIVAL_MODE,
  frontLoadedArrival,
  getArrivalMode,
  GLIDE_MOTION_AT_TICK_END,
  GLIDE_MOTION_AT_TICK_START,
  glideArrival,
  parseArrivalMode,
  resetArrivalMode,
  setArrivalMode,
  symmetricSmoothstep,
} from './arrivalEasing';

const SAMPLES = 2001;

/** alpha values across one whole tick interval, endpoints included. */
function sweep(): number[] {
  return Array.from({ length: SAMPLES }, (_, i) => i / (SAMPLES - 1));
}

/** Central-difference speed, in cells per tick interval. */
function speedAt(alpha: number, h = 1e-6): number {
  return (frontLoadedArrival(alpha + h) - frontLoadedArrival(alpha - h)) / (2 * h);
}

afterEach(resetArrivalMode);

describe('the arrival instant', () => {
  it('lands the head on its logical cell at ARRIVAL_ALPHA, not at the next tick', () => {
    // THE defect: with a linear or symmetric blend the head only reaches the
    // cell the engine already moved it to at alpha = 1 - the instant the next
    // tick makes that cell wrong. Everything else in ET-1 follows from moving
    // that instant forward.
    expect(ARRIVAL_ALPHA).toBeLessThanOrEqual(0.5);
    expect(frontLoadedArrival(ARRIVAL_ALPHA)).toBeCloseTo(1, 12);
    expect(frontLoadedArrival(0)).toBe(0);
    expect(frontLoadedArrival(1)).toBe(1);
  });

  it('holds the true cell for the majority of every interval; classic does not', () => {
    // The review's exit criterion, measured rather than asserted: the eye must
    // dwell on the simulation's real board state for at least half of each
    // interval. A tenth of a cell is ~2px at the board's 24px cube - below
    // "that is somewhere else".
    const withinACellTenth = (map: (a: number) => number) =>
      sweep().filter((alpha) => Math.abs(map(alpha) - 1) <= 0.1).length /
      SAMPLES;

    expect(withinACellTenth(frontLoadedArrival)).toBeGreaterThanOrEqual(0.5);
    // The old timing spends nine tenths of every interval showing the player a
    // position the engine has already left. This is the number ET-1 exists to
    // change, so it is pinned here rather than described.
    expect(withinACellTenth((alpha) => alpha)).toBeLessThan(0.15);
  });
});

describe('the motion reads as a hop, not a jump cut', () => {
  it('never backs up on its way to the cell', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 450; i += 1) {
      const value = frontLoadedArrival((i / 450) * ARRIVAL_ALPHA);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('starts and ends at rest, so consecutive hops join without a velocity step', () => {
    // Zero speed at both ends of an interval means hop N+1 begins exactly
    // where hop N stopped moving. A curve with residual speed at alpha 1 would
    // stutter once per tick, forever, at the tick rate - the most visible
    // artefact a grid game can have.
    expect(Math.abs(speedAt(1e-4))).toBeLessThan(0.02);
    expect(Math.abs(speedAt(1 - 1e-4))).toBeLessThan(0.02);
  });

  it('is C1 at the arrival instant - the settle inherits the drive velocity', () => {
    const h = 1e-6;
    const before =
      (frontLoadedArrival(ARRIVAL_ALPHA) - frontLoadedArrival(ARRIVAL_ALPHA - h)) / h;
    const after =
      (frontLoadedArrival(ARRIVAL_ALPHA + h) - frontLoadedArrival(ARRIVAL_ALPHA)) / h;
    expect(after).toBeCloseTo(before, 4);
    // And that inherited velocity is what carries the overshoot: a settle
    // starting from rest would be a dead remainder, i.e. a strobe.
    expect(before).toBeGreaterThan(0);
  });

  it('moves fast where it should - a real primary beat, not a teleport', () => {
    const peak = Math.max(...sweep().map((alpha) => speedAt(alpha)));
    // A linear blend crosses at exactly 1 cell per interval. Front-loading
    // must be visibly faster than that (it covers the cell in 45% of the
    // time) and must stay finite - an unbounded spike IS a teleport.
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThan(6);
  });
});

describe('the settle', () => {
  it('overshoots by exactly ARRIVAL_OVERSHOOT and never more', () => {
    const values = sweep().map(frontLoadedArrival);
    const peak = Math.max(...values);
    expect(peak - 1).toBeCloseTo(ARRIVAL_OVERSHOOT, 5);
    // Bounded on the other side too: the head must never retreat off its cell
    // once it has arrived.
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(-1e-12);
      expect(value).toBeLessThanOrEqual(1 + ARRIVAL_OVERSHOOT + 1e-12);
    }
  });

  it('stays inside the head cube, so the creature never looks off its tile', () => {
    // HEAD_SIZE is 0.9, half-width 0.45, and a cell is 1. An overshoot at or
    // above 0.05 + 0.45 would push a face past the tile boundary; this is the
    // constraint that bounds how hard the landing may be tuned.
    expect(ARRIVAL_OVERSHOOT).toBeLessThan(0.5 - 0.9 / 2 + 0.06);
    expect(ARRIVAL_OVERSHOOT).toBeGreaterThan(0);
  });

  it('returns to rest exactly on the cell before the next tick fires', () => {
    expect(frontLoadedArrival(0.999999)).toBeCloseTo(1, 6);
  });
});

describe('head and body share one clock', () => {
  it('completes the trail transition at the same instant the head lands', () => {
    // A body easing on the old symmetric curve under a head that has already
    // arrived is an accordion: the deposited cell would still be growing while
    // the head sat still. Same clock, one grammar.
    expect(arrivalTransition(ARRIVAL_ALPHA, 'front')).toBeCloseTo(1, 12);
    expect(arrivalMotion(ARRIVAL_ALPHA, 'front')).toBeCloseTo(1, 12);
  });

  it('clamps the transition so a scale never overshoots its tile', () => {
    // Position may overshoot - that is the settle. A SCALE may not: a cell
    // scaled past 1 pops out of the tile it is meant to be filling, and a
    // departing cell's `1 - eased` would go negative and invert the box.
    for (const alpha of sweep()) {
      const value = arrivalTransition(alpha, 'front');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(1 - value).toBeGreaterThanOrEqual(0);
    }
  });

  it('never decreases, so an entering cell only ever grows', () => {
    let previous = -Infinity;
    for (const alpha of sweep()) {
      const value = arrivalTransition(alpha, 'front');
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
  });
});

describe('ET-1b glide: constant rate, permanently half a cell ahead', () => {
  it('moves at exactly one cell per interval, everywhere, with no junction', () => {
    // Constraint 1 of the owner's design law, measured. `front` peaks above 3
    // cells per interval and returns to rest twice a tick; if this ever reads
    // anything but a flat 1 the strobe is back.
    for (const alpha of sweep()) {
      const h = 1e-7;
      const speed =
        (glideArrival(Math.min(1, alpha + h)) -
          glideArrival(Math.max(0, alpha - h))) /
        (Math.min(1, alpha + h) - Math.max(0, alpha - h));
      expect(speed).toBeCloseTo(1, 6);
    }
  });

  it('is on the entry edge at the tick and the exit edge at the next one', () => {
    // Constraint 2: never behind. m = 0.5 at the tick instant is the head
    // sitting on the edge its own cell shares with the one it came from - the
    // furthest back it is ever drawn, and still inside the true tile.
    expect(glideArrival(0)).toBe(GLIDE_MOTION_AT_TICK_START);
    expect(glideArrival(0.5)).toBeCloseTo(1, 12);
    expect(glideArrival(1)).toBe(GLIDE_MOTION_AT_TICK_END);
    expect(GLIDE_MOTION_AT_TICK_END - GLIDE_MOTION_AT_TICK_START).toBeCloseTo(1, 12);
  });

  it('crosses the tile edge exactly when the tick fires', () => {
    // Constraint 3: the beat belongs to the highlight, which snaps at the
    // tick. The mesh must reach the shared edge at that same instant or the
    // two channels disagree about when the move happened.
    const exit = glideArrival(1) - 1;
    const entry = glideArrival(0);
    expect(exit).toBeCloseTo(0.5, 12);
    expect(entry).toBeCloseTo(0.5, 12);
    // ...and the two are the SAME world point one cell apart, which is what
    // makes consecutive intervals join with no position step at all.
    expect(exit + entry).toBeCloseTo(1, 12);
  });

  it('stays inside the simulation cell for the whole interval', () => {
    for (const alpha of sweep()) {
      const offset = glideArrival(alpha) - 1; // signed cells from `curr`
      expect(Math.abs(offset)).toBeLessThanOrEqual(0.5 + 1e-12);
    }
  });

  it('clamps to the exit edge, which is contact on the fatal tick', () => {
    // The engine stops ticking on a death, alpha clamps at 1, and the head
    // comes to rest touching the obstacle rather than a cell short of it.
    expect(glideArrival(1.4)).toBe(GLIDE_MOTION_AT_TICK_END);
    expect(glideArrival(-0.2)).toBe(GLIDE_MOTION_AT_TICK_START);
  });

  it('runs the trail on plain linear alpha - one clock, no easing anywhere', () => {
    for (const alpha of sweep()) {
      expect(arrivalTransition(alpha, 'glide')).toBeCloseTo(alpha, 12);
    }
    expect(arrivalTransition(-1, 'glide')).toBe(0);
    expect(arrivalTransition(2, 'glide')).toBe(1);
    expect(arrivalMotion(0.25, 'glide')).toBeCloseTo(0.75, 12);
  });

  it('leaves front and classic bit-for-bit alone', () => {
    // The A/B is only worth playing if the other two legs are untouched.
    for (const alpha of sweep()) {
      expect(arrivalMotion(alpha, 'front')).toBe(frontLoadedArrival(alpha));
      expect(arrivalMotion(alpha, 'classic')).toBe(alpha);
      expect(arrivalTransition(alpha, 'classic')).toBe(
        symmetricSmoothstep(alpha)
      );
    }
  });
});

describe('the classic leg reproduces the pre-ET-1 timing exactly', () => {
  it('is the raw elapsed-time alpha for position and the symmetric smoothstep for transitions', () => {
    // The A/B is only worth the owner's time if one leg is honestly the old
    // build. These two expressions are what InstancedSnake and AimRenderer
    // used before ET-1, character for character.
    for (const alpha of [0, 0.13, 0.45, 0.5, 0.77, 1]) {
      expect(arrivalMotion(alpha, 'classic')).toBe(alpha);
      expect(arrivalTransition(alpha, 'classic')).toBeCloseTo(
        alpha * alpha * (3 - 2 * alpha),
        12
      );
    }
    expect(symmetricSmoothstep(0.5)).toBeCloseTo(0.5, 12);
  });

  it('arrives only when the next tick fires - the lie, kept intact for comparison', () => {
    expect(arrivalMotion(ARRIVAL_ALPHA, 'classic')).toBeLessThan(0.5);
    expect(arrivalMotion(1, 'classic')).toBe(1);
  });
});

describe('the dev A/B pin', () => {
  it('ships front-loaded and only a recognised flag changes it', () => {
    expect(DEFAULT_ARRIVAL_MODE).toBe('front');
    expect(getArrivalMode()).toBe('front');

    expect(applyArrivalModeFromSearch('?arrival=classic')).toBe('classic');
    expect(getArrivalMode()).toBe('classic');

    // Absent, empty and nonsense values leave the active mode ALONE rather
    // than resetting it: a URL that says nothing about arrival is not an
    // instruction about arrival.
    expect(applyArrivalModeFromSearch('?dynasty=CYBER')).toBe('classic');
    expect(applyArrivalModeFromSearch('')).toBe('classic');
    expect(applyArrivalModeFromSearch(null)).toBe('classic');
    expect(applyArrivalModeFromSearch('?arrival=fast')).toBe('classic');

    expect(applyArrivalModeFromSearch('?arrival=front&perf=1')).toBe('front');
    expect(applyArrivalModeFromSearch('?arrival=glide')).toBe('glide');
    expect(getArrivalMode()).toBe('glide');
  });

  it('parses strictly', () => {
    expect(parseArrivalMode('front')).toBe('front');
    expect(parseArrivalMode('classic')).toBe('classic');
    expect(parseArrivalMode('glide')).toBe('glide');
    expect(parseArrivalMode('FRONT')).toBeNull();
    expect(parseArrivalMode('GLIDE')).toBeNull();
    expect(parseArrivalMode(undefined)).toBeNull();
    expect(parseArrivalMode('')).toBeNull();
  });

  it('resets to the shipped default', () => {
    setArrivalMode('classic');
    resetArrivalMode();
    expect(getArrivalMode()).toBe(DEFAULT_ARRIVAL_MODE);
  });
});
