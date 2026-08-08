/**
 * SEGMENT ARMOR - the anchor, as assertions.
 *
 * Every case here drives the REAL interpolation buffer and the REAL glide
 * sampler rather than a model of them, because the claims being made are claims
 * about that sampler: that a worn item riding it is continuous across a tick
 * boundary, holds a rigid distance behind the head, and cannot be disturbed by
 * the neck's extrusion.
 *
 * `writeSegmentArmor` is a free function taking a sink for the same reason
 * `writeTrailInstances` is: every component test in this directory mocks
 * `useFrame` as a no-op and jsdom has no WebGL, so anchor arithmetic living
 * inside that callback would be unreachable by any test that could exist.
 */

import {
  armorSeatY,
  SEGMENT_GEAR,
  segmentGearDef,
  writeSegmentArmor,
  type SegmentArmorSink,
} from './SegmentArmor';
import { HEAD_FACE_YAW } from './InstancedSnake';
import { FLOOR_CLEARANCE } from './ArenaFloor';
import { armorFacingYaw } from './screen/armor90s';
import {
  createInterpolationBuffer,
  getGlideX,
  getGlideZ,
  recordTick,
  setHeadOutbound,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import { createTrailFusionState } from '@/lib/game/trailFusion';

const GRID = 20;
const MOUNT = 0.76;
const TICK = 150;

interface Recorded extends SegmentArmorSink {
  x: number;
  z: number;
  y: number;
  mount: number;
}

function makeSink(): Recorded {
  const sink: Recorded = {
    visible: false,
    x: 0,
    y: 0,
    z: 0,
    mount: 0,
    position: {
      set(x: number, y: number, z: number) {
        sink.x = x;
        sink.y = y;
        sink.z = z;
      },
    },
    rotation: { y: 0 },
    scale: {
      setScalar(value: number) {
        sink.mount = value;
      },
    },
  };
  return sink;
}

function makeFusion(length: number, level = 1) {
  const fusion = createTrailFusionState(GRID, GRID * GRID);
  for (let i = 0; i < length; i += 1) fusion.levels[i] = level;
  fusion.count = length;
  return fusion;
}

/** Place the armour for one frame and hand back what it wrote. */
function place(
  buffer: InterpolationBuffer,
  motion: number,
  segments: readonly number[] = [1, 2],
  { elapsed = 0, settle = 0, level = 1 } = {}
): Recorded[] {
  const sinks = segments.map(() => makeSink());
  writeSegmentArmor(
    sinks,
    segments,
    buffer,
    motion,
    'glide',
    settle,
    makeFusion(buffer.count, level),
    elapsed,
    MOUNT
  );
  return sinks;
}

/** A snake running +X along z = 5, one cell per tick. */
function straightRun(): InterpolationBuffer {
  const buffer = createInterpolationBuffer(64);
  recordTick(
    buffer,
    [
      { x: 4, z: 5 },
      { x: 3, z: 5 },
      { x: 2, z: 5 },
    ],
    TICK,
    0
  );
  recordTick(
    buffer,
    [
      { x: 5, z: 5 },
      { x: 4, z: 5 },
      { x: 3, z: 5 },
    ],
    TICK,
    TICK
  );
  return buffer;
}

// -----------------------------------------------------------------------------

describe('SegmentArmor: the anchor glides with its segment', () => {
  it('holds a rigid ONE CELL behind the head at every instant of a tick', () => {
    // The property that makes it read as bolted on rather than as a thing that
    // follows. Below motion 1 both the head and the segment are a prev->curr
    // blend at the same motion; above it both travel along their own outbound
    // at the same rate - so the offset is exactly the index, at every motion.
    const buffer = straightRun();
    for (const motion of [0.5, 0.75, 1, 1.25, 1.5]) {
      const [plate] = place(buffer, motion, [1]);
      const headX = getGlideX(buffer, 0, motion);
      const headZ = getGlideZ(buffer, 0, motion);
      const dx = plate.x - 0.5 - headX;
      const dz = plate.z - 0.5 - headZ;
      expect(Math.hypot(dx, dz)).toBeCloseTo(1, 10);
    }
  });

  it('is CONTINUOUS across a tick boundary - through a corner', () => {
    // Glide is C0 by construction: a segment's end-of-tick position IS its
    // start-of-next-tick position. A worn item riding it therefore cannot pop,
    // and the corner is where a discrete grid heading would have.
    const buffer = straightRun();
    // The turn is admitted: the next tick moves the head +Z.
    setHeadOutbound(buffer, 0, 1, 1);
    const [endOfTick] = place(buffer, 1.5, [1]);

    recordTick(
      buffer,
      [
        { x: 5, z: 6 },
        { x: 5, z: 5 },
        { x: 4, z: 5 },
      ],
      TICK,
      TICK * 2
    );
    const [startOfNext] = place(buffer, 0.5, [1]);

    expect(startOfNext.x).toBeCloseTo(endOfTick.x, 10);
    expect(startOfNext.z).toBeCloseTo(endOfTick.z, 10);
    expect(startOfNext.y).toBeCloseTo(endOfTick.y, 10);
    expect(startOfNext.rotation.y).toBeCloseTo(endOfTick.rotation.y, 10);
  });

  it('SWEEPS through a corner instead of snapping to the new axis', () => {
    // Read off the two drawn positions, so the plate is at 45 degrees exactly
    // when the pair straddles the corner. A grid heading would have flipped 90
    // degrees in one frame.
    const buffer = straightRun();
    setHeadOutbound(buffer, 0, 1, 1);
    const before = place(buffer, 1, [1])[0].rotation.y;
    const mid = place(buffer, 1.5, [1])[0].rotation.y;

    recordTick(
      buffer,
      [
        { x: 5, z: 6 },
        { x: 5, z: 5 },
        { x: 4, z: 5 },
      ],
      TICK,
      TICK * 2
    );
    const after = place(buffer, 1, [1])[0].rotation.y;

    expect(before).toBeCloseTo(HEAD_FACE_YAW.RIGHT, 10);
    expect(after).toBeCloseTo(HEAD_FACE_YAW.DOWN, 10);
    // Strictly between the two headings - the spine bending, not a flip.
    expect(mid).toBeLessThan(before);
    expect(mid).toBeGreaterThan(after);
    expect(mid).toBeCloseTo(Math.PI / 4, 10);
  });

  it('speaks the head renderer own yaw convention', () => {
    // HEAD_FACE_YAW is exported precisely so a contract split across files has
    // something asserting the join. The plate and the head must agree on what
    // forward means, or a turn would point them at different things.
    expect(armorFacingYaw(0, -1, 0, 0, GRID)).toBeCloseTo(HEAD_FACE_YAW.UP, 10);
    expect(armorFacingYaw(0, 1, 0, 0, GRID)).toBeCloseTo(
      HEAD_FACE_YAW.DOWN,
      10
    );
    expect(armorFacingYaw(-1, 0, 0, 0, GRID)).toBeCloseTo(
      HEAD_FACE_YAW.LEFT,
      10
    );
    expect(armorFacingYaw(1, 0, 0, 0, GRID)).toBeCloseTo(
      HEAD_FACE_YAW.RIGHT,
      10
    );
  });

  it('composes onto the tile centre when the board is at rest', () => {
    // Under the pause overlay everything glued to the creature settles through
    // `settleToward`, or the gear detaches for the length of the settle.
    const buffer = straightRun();
    const [plate] = place(buffer, 1.5, [1], { settle: 1 });
    expect(plate.x).toBeCloseTo(buffer.curr[2] + 0.5, 10);
    expect(plate.z).toBeCloseTo(buffer.curr[3] + 0.5, 10);
  });
});

describe('SegmentArmor: the extrusion case', () => {
  it('does not move while its own cell extrudes', () => {
    // Segment 1's cell is always the NECK - the tile the head just left, drawn
    // rear-anchored with its front face chasing the head. The extrusion is in
    // LENGTH ONLY (`writeTrailCell` gives the neck a transition of 1), so the
    // seat is invariant across the whole extrusion window. This is the "must
    // not pop" clause, and it holds by construction: no alpha reaches the seat.
    const buffer = straightRun();
    const start = place(buffer, 0.5, [1])[0].y;
    const mid = place(buffer, 1, [1])[0].y;
    const end = place(buffer, 1.5, [1])[0].y;
    expect(mid).toBe(start);
    expect(end).toBe(start);
  });

  it('seats on the cube it is worn on, above the floor', () => {
    const buffer = straightRun();
    const [plate] = place(buffer, 1, [1]);
    expect(plate.y).toBeGreaterThan(FLOOR_CLEARANCE);
    // Never higher than a whole cell above the floor - the plate rests on a
    // body cube, and no body cube is a cell tall.
    expect(plate.y).toBeLessThan(FLOOR_CLEARANCE + 1);
  });

  it('rides the head-zone breathe, because it is strapped to a living body', () => {
    const buffer = straightRun();
    const atRest = place(buffer, 1, [1], { elapsed: 0 })[0].y;
    const later = place(buffer, 1, [1], { elapsed: 0.31 })[0].y;
    expect(later).not.toBeCloseTo(atRest, 6);
    // ...but only by a breath. It is glued, not bouncing.
    expect(Math.abs(later - atRest)).toBeLessThan(0.1);
  });

  it('writes the rigid mount, not the cube it happens to be sitting on', () => {
    const buffer = straightRun();
    const [plate] = place(buffer, 1, [1]);
    expect(plate.mount).toBe(MOUNT);
  });

  it('tracks the drawn top through armorSeatY, whatever the shape law', () => {
    // Two different fusion levels seat at two different heights under the cube
    // law, and identically under the shipped slab law - either way the value is
    // the cube's own drawn top, which is what "glued" means.
    const loose = armorSeatY(0, 1, 40, 0);
    const packed = armorSeatY(2, 1, 40, 0);
    expect(loose).toBeGreaterThan(FLOOR_CLEARANCE);
    expect(packed).toBeGreaterThanOrEqual(loose);
  });
});

describe('SegmentArmor: it degrades to nothing', () => {
  it('wears nothing on a segment the snake does not have yet', () => {
    // The snake spawns short. This is the ordinary case, not an error.
    const buffer = createInterpolationBuffer(64);
    recordTick(
      buffer,
      [
        { x: 4, z: 5 },
        { x: 3, z: 5 },
      ],
      TICK,
      0
    );
    const [first, second] = place(buffer, 1, [1, 2]);
    expect(first.visible).toBe(true);
    expect(second.visible).toBe(false);
  });

  it('wears nothing at all on an empty buffer', () => {
    const buffer = createInterpolationBuffer(64);
    const sinks = place(buffer, 1, [1, 2]);
    expect(sinks.every((sink) => sink.visible)).toBe(false);
  });

  it('never wears anything on the head, whatever it is handed', () => {
    const buffer = straightRun();
    const [head] = place(buffer, 1, [0]);
    expect(head.visible).toBe(false);
  });

  it('survives an anchor that has not mounted', () => {
    const buffer = straightRun();
    expect(() =>
      writeSegmentArmor(
        [null, null],
        [1, 2],
        buffer,
        1,
        'glide',
        0,
        makeFusion(buffer.count),
        0,
        MOUNT
      )
    ).not.toThrow();
  });

  it('resolves an unknown gear key to nothing worn, never to a throw', () => {
    // The catalog is DATA and this is CODE; they deploy independently.
    expect(segmentGearDef('plate_carapace')).toBe(SEGMENT_GEAR.plate_carapace);
    expect(segmentGearDef('plate_carapace')?.slot).toBe('back');
    expect(segmentGearDef('some_future_pauldron')).toBeNull();
    expect(segmentGearDef(null)).toBeNull();
    expect(segmentGearDef('')).toBeNull();
  });
});

describe('SegmentArmor: both variants exist to be compared', () => {
  it('places one plate, or two, one cell apart', () => {
    const buffer = straightRun();
    const [only] = place(buffer, 1, [1]);
    const [first, second] = place(buffer, 1, [1, 2]);
    // The single-segment variant is the same object in the same place as the
    // first of the pair - so the owner is comparing an addition, not two
    // different designs.
    expect(first.x).toBeCloseTo(only.x, 10);
    expect(first.z).toBeCloseTo(only.z, 10);
    expect(second.visible).toBe(true);
    expect(Math.hypot(second.x - first.x, second.z - first.z)).toBeCloseTo(
      1,
      10
    );
  });
});
