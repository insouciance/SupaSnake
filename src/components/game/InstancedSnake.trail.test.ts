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
  TRAIL_LINK_WIDTH,
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
  it('draws one box per body cell plus one link per joint', () => {
    // Segment 0 is the separate head mesh, so 4 boxes; 4 joints including the
    // neck. If this ever silently halves, the body has come apart.
    const { count } = emit(bufferOf(straight(5)), [0, 0, 0, 0, 0]);
    expect(count).toBe(4 + 4);
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

describe('links: the continuous form, and the seam that must not be drawn', () => {
  it('orients a link along its joint and spans the full centre-to-centre gap', () => {
    const { sink } = emit(bufferOf(straight(3)), [0, 0, 0]);
    // Boxes are 0 and 1; links start at index 2.
    const link = sink.instances[2];
    expect(link.scale.z).toBeCloseTo(1, 10);
    // The joint runs along Z, so local +Z must already point along world Z:
    // a yaw of 0 or PI. Either way the box's length lies on the Z axis.
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(link.quaternion);
    expect(Math.abs(forward.z)).toBeCloseTo(1, 10);
    expect(Math.abs(forward.x)).toBeCloseTo(0, 10);
  });

  it('turns the link with the joint on an X-axis run', () => {
    const buffer = bufferOf([at(5, 5), at(6, 5), at(7, 5)]);
    const { sink } = emit(buffer, [0, 0, 0]);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      sink.instances[2].quaternion
    );
    expect(Math.abs(forward.x)).toBeCloseTo(1, 10);
    expect(Math.abs(forward.z)).toBeCloseTo(0, 10);
  });

  it('never lets a link poke out of the cells it joins', () => {
    // This is what makes a separate corner-cap instance unnecessary: the
    // corner cell's own box is wider than the two links meeting in it, so the
    // box fills the outer notch that two right-angled bars would leave.
    //
    // Long enough that the cells around the corner are clear of the tail
    // taper, which would otherwise narrow one end of each link.
    const cells: Position[] = [at(5, 5), at(5, 6)];
    for (let x = 6; x < 16; x++) cells.push(at(x, 6));
    const buffer = bufferOf(cells);
    const { sink } = emit(buffer, new Array(cells.length).fill(1));
    const boxes = cells.length - 1;
    const boxWidth = sink.instances[0].scale.x;
    // The two links meeting in the corner cell (1,2) and (2,3).
    for (const joint of [1, 2]) {
      const link = sink.instances[boxes + joint];
      expect(link.scale.x).toBeLessThan(boxWidth);
      expect(link.scale.x).toBeCloseTo(boxWidth * TRAIL_LINK_WIDTH, 10);
    }
  });

  it('compresses a corner link mid-tick instead of tearing', () => {
    // Because the engine unshifts and pops, curr[i] === prev[i-1]: a corner
    // joint shortens to 0.707 at alpha 0.5 and rotates through it. A joint
    // that assumed a fixed length of 1.0 would leave a gap at every turn.
    const buffer = createInterpolationBuffer();
    recordTick(buffer, [at(5, 6), at(5, 7), at(5, 8)], 100, 1000);
    recordTick(buffer, [at(6, 6), at(5, 6), at(5, 7)], 100, 1100);
    const { sink } = emit(buffer, [0, 0, 0], 0.5);
    const neck = sink.instances[2];
    expect(neck.scale.z).toBeGreaterThan(0.7);
    expect(neck.scale.z).toBeLessThan(1);
  });

  it('SUPPRESSES the link across a COSMIC wrap seam', () => {
    // Two "consecutive" segments a board apart. An unguarded link here draws
    // a bar straight across the arena - the single most visible way this
    // component can fail.
    const wrapped = [at(0, 5), at(19, 5), at(18, 5), at(17, 5)];
    const { count } = emit(bufferOf(wrapped), [0, 0, 0, 0]);
    // 3 boxes + 3 joints, minus the one seam-straddling joint.
    expect(count).toBe(3 + 2);
  });

  it('skips the duplicated tail cell of a growth tick', () => {
    // recordTick seeds prev = curr for a new tail index, so two indices name
    // one position for a tick. A zero-length link has no direction to point
    // in and composes to a degenerate matrix.
    const grown = [at(5, 5), at(5, 6), at(5, 7), at(5, 7)];
    const { count } = emit(bufferOf(grown), [0, 0, 0, 0]);
    expect(count).toBe(3 + 2);
  });
});

describe('no two surfaces ever share a depth (the z-fighting defect)', () => {
  // THE DEFECT THE OWNER HIT ON FIRST PLAY: "the blocks of the snake dont
  // render properly, they are flickering and not all sides of the cubes /
  // segments are visible."
  //
  // A link spans centre to centre, so it is buried inside both cells it joins.
  // Its height used to be exactly `min(heightA, heightB)`, and along the
  // settled trunk every cell is exactly TRAIL_HEIGHT_TRUNK — so the link's top
  // face and the cells' top faces were COPLANAR over the whole run. Two
  // surfaces at one depth is z-fighting by definition, and it read as notches
  // marching along the snake's back, shimmering whenever anything moved.
  //
  // These assert GEOMETRY, not a constant, because the constant is not the
  // invariant — "no link top may touch a cell top" is, and it has to survive
  // the breathe multiplier, the sinking tail and the head-zone easing.
  const topOf = (i: Instance): number => i.position.y + i.scale.y / 2;

  it('every link top sits strictly below both cells it joins', () => {
    const snake = straight(24);
    const { sink, count } = emit(bufferOf(snake), new Array(24).fill(2));
    const boxes = sink.instances.slice(0, snake.length - 1);
    const links = sink.instances.slice(snake.length - 1, count);
    expect(boxes.length).toBeGreaterThan(0);
    expect(links.length).toBeGreaterThan(0);

    // PAIRWISE, against the two cells this link actually joins. A global
    // minimum would be the wrong bound and it is worth saying why: the tail
    // sinks, so the shortest cell in the run is far from the trunk and a trunk
    // link has no reason to clear it. Asserting that instead would fail on
    // correct geometry, which is how a test starts getting weakened.
    links.forEach((link, joint) => {
      const a = boxes[Math.max(0, joint - 1)];
      const b = boxes[Math.min(boxes.length - 1, joint)];
      expect(topOf(link)).toBeLessThan(Math.min(topOf(a), topOf(b)));
    });
  });

  it('holds while the head zone is breathing', () => {
    // The breathe multiplies height per-segment per-frame, so a link between a
    // breathing cell and a still one has two different heights to stay under.
    // Sampled across a full cycle rather than at one lucky phase.
    const snake = straight(20);
    for (let step = 0; step < 24; step++) {
      const elapsed = step / 24;
      const { sink, count } = emit(
        bufferOf(snake),
        new Array(20).fill(1),
        1,
        elapsed
      );
      const boxes = sink.instances.slice(0, snake.length - 1);
      const links = sink.instances.slice(snake.length - 1, count);
      links.forEach((link, joint) => {
        const a = boxes[Math.max(0, joint - 1)];
        const b = boxes[Math.min(boxes.length - 1, joint)];
        expect(topOf(link)).toBeLessThan(Math.min(topOf(a), topOf(b)));
      });
    }
  });

  it('holds through the sinking tail, where heights differ most', () => {
    const snake = straight(30);
    const { sink, count } = emit(bufferOf(snake), new Array(30).fill(0));
    const boxes = sink.instances.slice(0, snake.length - 1);
    const links = sink.instances.slice(snake.length - 1, count);
    // Pair each link with the two cells it actually joins rather than the
    // global minimum: the tail's cells are genuinely shorter than the trunk's,
    // and a global bound would hide a link that clears the tail but not its
    // own neighbours.
    links.forEach((link, joint) => {
      const a = boxes[Math.max(0, joint - 1)];
      const b = boxes[Math.min(boxes.length - 1, joint)];
      expect(topOf(link)).toBeLessThan(Math.min(topOf(a), topOf(b)));
    });
  });

  it('the trunk is a cube, not a plate', () => {
    // The second half of the same report — "not all sides of the cubes are
    // visible". A segment 0.42 tall and up to 0.96 wide has almost no side
    // area to be seen in. Height must stay within a factor of the footprint or
    // the body stops reading as blocks at all.
    const snake = straight(20);
    const { sink } = emit(bufferOf(snake), new Array(20).fill(2));
    const trunk = sink.instances[12];
    const footprint = getTrailFootprint(2);
    expect(trunk.scale.y).toBeGreaterThan(footprint * 0.6);
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
    // Every body cell and every joint: nothing dropped.
    expect(count).toBe(399 + 399);
    expect(sink.instances).toHaveLength(count);
    expect(count).toBeLessThanOrEqual(INTERPOLATION_CAPACITY * 2);
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
