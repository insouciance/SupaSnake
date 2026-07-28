/**
 * The trail's emission loop, actually executed (WP-3.07).
 *
 * `trailFusion.test.ts` proves the metric is right and `trail.visible.test.ts`
 * proves it is wired up. Neither of them runs a single line of the code that
 * decides where a box goes, because that code lives inside a `useFrame`
 * callback: every component test in this directory mocks `useFrame` as a no-op
 * and jsdom has no WebGL context.
 *
 * So the loop was extracted into `writeTrailInstances`, which writes into a
 * plain sink interface. THREE.InstancedMesh satisfies that interface in the
 * game; a recording stub satisfies it here. This is the file that would have
 * caught a trail that computed everything correctly and drew it in the wrong
 * place, at the wrong size, or not at all.
 */

import { describe, it, expect } from '@jest/globals';
import * as THREE from 'three';
import {
  createInterpolationBuffer,
  recordTick,
  getAlpha,
  INTERPOLATION_CAPACITY,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import type { Position } from '@/lib/game/SnakeGameLogic';
import { writeTrailInstances } from './InstancedSnake';
import {
  TRAIL_HEIGHT_HEAD,
    getTrailFootprint,
} from './SnakeModel';

interface Instance {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  color: THREE.Color;
}

/** Records what an InstancedMesh would have been told, decomposed. */
class RecordingSink {
  readonly instances: Instance[] = [];

  setMatrixAt(index: number, matrix: THREE.Matrix4): void {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    this.instances[index] = {
      position,
      quaternion,
      scale,
      color: new THREE.Color(),
    };
  }

  setColorAt(index: number, color: THREE.Color): void {
    this.instances[index].color.copy(color);
  }
}

const at = (x: number, z: number): Position => ({ x, y: 0, z });

/** A buffer holding one authoritative tick (prev === curr, so alpha = 1). */
function bufferOf(snake: readonly Position[]): InterpolationBuffer {
  const buffer = createInterpolationBuffer();
  recordTick(buffer, snake, 100, 1000);
  recordTick(buffer, snake, 100, 1100);
  return buffer;
}

function emit(
  buffer: InterpolationBuffer,
  levels: number[],
  alpha = 1,
  elapsed = 0
): { sink: RecordingSink; count: number } {
  const sink = new RecordingSink();
  const packed = new Uint8Array(INTERPOLATION_CAPACITY);
  levels.forEach((level, i) => {
    packed[i] = level;
  });
  const count = writeTrailInstances(sink, buffer, alpha, packed, [], elapsed);
  return { sink, count };
}

/** A straight vertical snake of `length` cells starting at (5, 5). */
function straight(length: number): Position[] {
  const cells: Position[] = [];
  for (let i = 0; i < length; i++) cells.push(at(5, 5 + i));
  return cells;
}

describe('the trail is actually emitted', () => {
  it('draws one box per body cell', () => {
    // Segment 0 is the separate head mesh, so a 5-cell snake is 4 boxes.
    const { count } = emit(bufferOf(straight(5)), [0, 0, 0, 0, 0]);
    expect(count).toBe(4);
  });

  it('draws nothing for an empty or single-cell snake', () => {
    expect(emit(bufferOf([]), []).count).toBe(0);
    // One cell is the head mesh alone - no body, no joint.
    expect(emit(bufferOf([at(5, 5)]), [0]).count).toBe(0);
  });

  it('places every box on its cell centre', () => {
    const { sink } = emit(bufferOf(straight(4)), [0, 0, 0, 0]);
    for (let i = 0; i < 3; i++) {
      expect(sink.instances[i].position.x).toBeCloseTo(5.5, 10);
      expect(sink.instances[i].position.z).toBeCloseTo(6.5 + i, 10);
    }
  });

  it('stands every box on the floor, never floating', () => {
    // Base-on-floor is y = height / 2, TerrainBlocks' convention. A hovering
    // box has no useful cast shadow, and the shadow is a real occupancy cue.
    const { sink, count } = emit(bufferOf(straight(12)), new Array(12).fill(1));
    for (let i = 0; i < count; i++) {
      const instance = sink.instances[i];
      expect(instance.position.y).toBeCloseTo(instance.scale.y / 2, 10);
      expect(instance.scale.y).toBeGreaterThan(0);
      expect(instance.scale.y).toBeLessThanOrEqual(TRAIL_HEIGHT_HEAD);
    }
  });

  it('never emits a NaN', () => {
    // compose() with a zero-length link would produce an unrenderable matrix
    // and three.js reports nothing at all - the instance simply vanishes.
    const { sink, count } = emit(bufferOf(straight(30)), new Array(30).fill(2));
    for (let i = 0; i < count; i++) {
      const { position, quaternion, scale } = sink.instances[i];
      for (const value of [
        position.x, position.y, position.z,
        quaternion.x, quaternion.y, quaternion.z, quaternion.w,
        scale.x, scale.y, scale.z,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});

describe('fusion drives the picture, not just a number', () => {
  // Long enough that segment 1 is clear of the tail taper, so the emitted
  // scale is the fusion footprint and nothing else.
  const LONG = 20;
  const levels = (level: number) => new Array(LONG).fill(level);

  it('a fused cell claims visibly more of its tile than a free one', () => {
    // The keystone made visual. If these were equal the entire metric would be
    // computed, hysteresis-filtered, and invisible.
    const buffer = bufferOf(straight(LONG));
    const free = emit(buffer, levels(0)).sink.instances[0];
    const fused = emit(buffer, levels(2)).sink.instances[0];
    expect(fused.scale.x).toBeGreaterThan(free.scale.x);
    expect(fused.scale.x).toBeCloseTo(getTrailFootprint(2), 10);
    expect(free.scale.x).toBeCloseTo(getTrailFootprint(0), 10);
  });

  it('a fused cell is brighter than a free one', () => {
    const buffer = bufferOf(straight(LONG));
    const free = emit(buffer, levels(0)).sink.instances[0];
    const fused = emit(buffer, levels(2)).sink.instances[0];
    expect(fused.color.r).toBeGreaterThan(free.color.r);
  });

  it('leaves a real gap between free cells and closes it when fused', () => {
    // "0 = running free -> discrete voxels with visible gaps." Cells are 1.0
    // apart, so the gap is 1 - footprint.
    const buffer = bufferOf(straight(LONG));
    const free = emit(buffer, levels(0)).sink.instances[0];
    const fused = emit(buffer, levels(2)).sink.instances[0];
    expect(1 - free.scale.x).toBeGreaterThan(0.25);
    expect(1 - fused.scale.x).toBeLessThan(0.1);
  });
});

describe('one box per cell, and nothing that interpenetrates it', () => {
  // THE DEFECT THE OWNER HIT ON FIRST PLAY, and the guard that keeps it gone:
  // "the blocks of the snake dont render properly, they are flickering and not
  // all sides of the cubes/segments are visible."
  //
  // WP-3.07 emitted a second box per JOINT, spanning centre to centre, to make
  // the middle read as a continuous form. It was buried inside the two cells it
  // joined, and two opaque solids sharing a volume is how faces stop being
  // drawn. A control render with that pass disabled and nothing else changed
  // brought the body back as clean, discrete, fully-faced cubes.
  //
  // The first fix attempt was wrong and is worth remembering: it assumed the
  // problem was the link's TOP face being coplanar with the cells', inset the
  // link, changed the render, and fixed nothing the owner could see. Sizing the
  // intruder differently was never going to help; the intrusion was the defect.
  //
  // So this asserts the strong invariant rather than the narrow one: NO two
  // emitted instances may share space at all. That makes the entire class
  // unreachable instead of pinning the one shape it happened to take.
  const boxOf = (i: Instance) => ({
    minX: i.position.x - i.scale.x / 2,
    maxX: i.position.x + i.scale.x / 2,
    minY: i.position.y - i.scale.y / 2,
    maxY: i.position.y + i.scale.y / 2,
    minZ: i.position.z - i.scale.z / 2,
    maxZ: i.position.z + i.scale.z / 2,
  });

  const anyOverlap = (sink: RecordingSink, count: number): string | null => {
    const EPS = 1e-6;
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        const A = boxOf(sink.instances[a]);
        const B = boxOf(sink.instances[b]);
        if (
          A.minX < B.maxX - EPS && B.minX < A.maxX - EPS &&
          A.minY < B.maxY - EPS && B.minY < A.maxY - EPS &&
          A.minZ < B.maxZ - EPS && B.minZ < A.maxZ - EPS
        ) {
          return `instances ${a} and ${b} share volume`;
        }
      }
    }
    return null;
  };

  it('emits exactly one instance per body cell - no joint pass', () => {
    // Segment 0 is the separate head mesh, so a 5-cell snake is 4 boxes. If a
    // second pass ever comes back this doubles and says so.
    expect(emit(bufferOf(straight(5)), [0, 0, 0, 0, 0]).count).toBe(4);
  });

  it('never overlaps, at any fusion level', () => {
    const snake = straight(24);
    for (const level of [0, 1, 2]) {
      const { sink, count } = emit(bufferOf(snake), new Array(24).fill(level));
      expect(anyOverlap(sink, count)).toBeNull();
    }
  });

  it('never shares a FACE PLANE around a corner, mid-tick', () => {
    // Mid-tick through a turn is where cells are closest, because one is moving
    // along X while its neighbour moves along Z. Their boxes interpenetrate at
    // the top fusion level, and that is FINE: intersecting opaque solids of one
    // material render as a clean union, since their surfaces meet at an angle.
    //
    // What is not fine is two surfaces at the SAME depth, which is the z-fight
    // condition. This asserts that, and deliberately not "no overlap" - the
    // control render that isolated the real defect had this overlap and came
    // back clean, and bounding overlap instead would have flattened the fusion
    // range to fix something that was never broken.
    const turn: Position[] = [
      at(5, 5), at(5, 6), at(5, 7), at(6, 7), at(7, 7), at(8, 7),
    ];
    const buffer = createInterpolationBuffer();
    recordTick(buffer, turn, 100, 1000);
    recordTick(buffer, [at(5, 4), ...turn.slice(0, 5)], 100, 1100);
    const EPS = 1e-6;
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      const sink = new RecordingSink();
      const packed = new Uint8Array(INTERPOLATION_CAPACITY);
      packed.fill(2);
      const count = writeTrailInstances(sink, buffer, alpha, packed, [], 0);
      for (let a = 0; a < count; a++) {
        for (let b = a + 1; b < count; b++) {
          const A = boxOf(sink.instances[a]);
          const B = boxOf(sink.instances[b]);
          const overlapY = A.minY < B.maxY - EPS && B.minY < A.maxY - EPS;
          const overlapZ = A.minZ < B.maxZ - EPS && B.minZ < A.maxZ - EPS;
          const overlapX = A.minX < B.maxX - EPS && B.minX < A.maxX - EPS;
          // A shared plane only fights where the other two axes overlap.
          if (overlapY && overlapZ) {
            for (const fa of [A.minX, A.maxX]) {
              for (const fb of [B.minX, B.maxX]) {
                expect(Math.abs(fa - fb)).toBeGreaterThan(EPS);
              }
            }
          }
          if (overlapY && overlapX) {
            for (const fa of [A.minZ, A.maxZ]) {
              for (const fb of [B.minZ, B.maxZ]) {
                expect(Math.abs(fa - fb)).toBeGreaterThan(EPS);
              }
            }
          }
        }
      }
    }
  });

  it('never overlaps while the head zone is breathing', () => {
    const snake = straight(20);
    for (let step = 0; step < 12; step++) {
      const { sink, count } = emit(
        bufferOf(snake), new Array(20).fill(2), 1, step / 12
      );
      expect(anyOverlap(sink, count)).toBeNull();
    }
  });

  it('the trunk is a cube, not a plate', () => {
    // The second half of the same report - "not all sides of the cubes are
    // visible". A segment 0.42 tall against a footprint of up to 0.96 has
    // almost no side area to be seen in.
    const { sink } = emit(bufferOf(straight(20)), new Array(20).fill(2));
    expect(sink.instances[12].scale.y).toBeGreaterThan(
      getTrailFootprint(2) * 0.55
    );
  });
});

describe('the instance budget holds at the length where it matters', () => {
  it('a board-filling snake is drawn whole, not truncated', () => {
    // 400 cells is exactly when the trail is most useful and most likely to
    // overflow. Silently dropping the tail there would be the worst possible
    // place to be wrong.
    const snake: Position[] = [];
    for (let z = 0; z < 20; z++) {
      for (let x = 0; x < 20; x++) {
        snake.push(at(z % 2 === 0 ? x : 19 - x, z));
      }
    }
    expect(snake).toHaveLength(400);
    const { sink, count } = emit(bufferOf(snake), new Array(400).fill(1));
    // Every body cell, nothing dropped. A board-filling snake is exactly the
    // length at which the trail matters most, so silently truncating it is the
    // one failure this budget exists to prevent.
    expect(count).toBe(399);
    expect(sink.instances).toHaveLength(count);
    expect(count).toBeLessThanOrEqual(INTERPOLATION_CAPACITY);
  });
});

describe('the head zone breathes and the trunk does not', () => {
  it('changes head-zone geometry over time and leaves the trunk identical', () => {
    const buffer = bufferOf(straight(40));
    const levels = new Array(40).fill(1);
    const t0 = emit(buffer, levels, 1, 0).sink;
    const t1 = emit(buffer, levels, 1, 0.31).sink;

    // Segment 1 is inside the head zone: it must have moved.
    expect(t1.instances[0].scale.y).not.toBeCloseTo(t0.instances[0].scale.y, 6);

    // Segments well past the head zone are bit-identical. A pulse leaking into
    // the trunk would put motion on every cell of a long coil, which is the
    // eye-comfort failure this component was built to avoid.
    for (let i = 10; i < 30; i++) {
      expect(t1.instances[i].scale.y).toBe(t0.instances[i].scale.y);
      expect(t1.instances[i].position.y).toBe(t0.instances[i].position.y);
    }
  });
});

describe('interpolation, never a grid snap', () => {
  it('draws the body between the two authoritative ticks', () => {
    // 5-10 Hz is the worst flicker band there is; a snapped middle would gap a
    // full cell at the head/trail junction every tick.
    const buffer = createInterpolationBuffer();
    recordTick(buffer, [at(5, 5), at(5, 6), at(5, 7)], 100, 1000);
    recordTick(buffer, [at(5, 4), at(5, 5), at(5, 6)], 100, 1100);
    const { sink } = emit(buffer, [0, 0, 0], 0.5);
    // Segment 1 moved (5,6) -> (5,5): at alpha 0.5 it is on 5.5, not on a cell.
    expect(sink.instances[0].position.z).toBeCloseTo(6.0, 10);
    expect(getAlpha(buffer, 1150)).toBeCloseTo(0.5, 10);
  });
});
