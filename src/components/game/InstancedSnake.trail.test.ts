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
import type { Direction, Position } from '@/lib/game/SnakeGameLogic';
import { COSMETIC_ANCHORS } from '@/components/home/SnakeCosmetics';
import {
  createTrailFusionState,
  type TrailFusionState,
} from '@/lib/game/trailFusion';
import {
  createTrailCellState,
  updateTrailCells,
  type TrailCellState,
} from '@/lib/game/trailCells';
import {
  COIL_SEAL_DURATION_SECONDS,
  getInstancedBodyMaterial,
  HEAD_FACE_YAW,
  SNAKE_HEAD_CENTER_Y,
  TRAIL_STRAIN_LUMINANCE_FLOOR,
  writeCoilSealInstances,
  writeSnakeTrailColor,
  writeTrailInstances,
} from './InstancedSnake';
import {
  centerYFromBase,
  FLOOR_CLEARANCE,
  FLOOR_GRAPHICS_TOP_Y,
  FLOOR_TOP_Y,
} from './ArenaFloor';
import {
  HEAD_SIZE,
  TRAIL_HEIGHT_HEAD,
  TRAIL_TONE,
  getTrailFootprint,
} from './SnakeModel';
import { getGameMaterialProfile } from './screen/gameMaterialProfiles';

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

const colorDistance = (left: THREE.Color, right: THREE.Color): number =>
  Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);

/** A buffer holding one authoritative tick (prev === curr, so alpha = 1). */
function bufferOf(snake: readonly Position[]): InterpolationBuffer {
  const buffer = createInterpolationBuffer();
  recordTick(buffer, snake, 100, 1000);
  recordTick(buffer, snake, 100, 1100);
  return buffer;
}

function movingBuffer(
  previous: readonly Position[],
  current: readonly Position[]
): InterpolationBuffer {
  const buffer = createInterpolationBuffer();
  recordTick(buffer, previous, 100, 1000);
  recordTick(buffer, current, 100, 1100);
  return buffer;
}

function emit(
  buffer: InterpolationBuffer,
  levels: number[],
  alpha = 1,
  elapsed = 0,
  dynasty: 'CYBER' | 'PRIMAL' | 'COSMIC' = 'CYBER',
  strainBands: Parameters<typeof writeTrailInstances>[6] = []
): { sink: RecordingSink; count: number } {
  const sink = new RecordingSink();
  const fusion: TrailFusionState = createTrailFusionState(20, 400);
  const cells: TrailCellState = createTrailCellState(20);
  updateTrailCells(cells, buffer);
  for (let index = 0; index < cells.currentCount; index += 1) {
    const cell = cells.currentCells[index];
    fusion.committed[cell] = levels[cells.currentRepresentative[cell]] ?? 0;
  }
  for (let index = 0; index < cells.departingCount; index += 1) {
    const cell = cells.departingCells[index];
    fusion.committed[cell] = levels[cells.previousRepresentative[cell]] ?? 0;
  }
  const count = writeTrailInstances(
    sink,
    buffer,
    alpha,
    fusion,
    cells,
    dynasty,
    strainBands,
    elapsed
  );
  return { sink, count };
}

/** A straight vertical snake of `length` cells starting at (5, 5). */
function straight(length: number): Position[] {
  const cells: Position[] = [];
  for (let i = 0; i < length; i++) cells.push(at(5, 5 + i));
  return cells;
}

/** A contiguous in-bounds path for long-trail cases. */
function boardSnake(length: number): Position[] {
  const cells: Position[] = [];
  for (let z = 0; z < 20 && cells.length < length; z += 1) {
    for (let offset = 0; offset < 20 && cells.length < length; offset += 1) {
      cells.push(at(z % 2 === 0 ? offset : 19 - offset, z));
    }
  }
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
    // Base-on-floor plus FLOOR_CLEARANCE, TerrainBlocks' convention. The base
    // is also strictly above the major grid plane; matching that y was the
    // remaining device-dependent clipping seam after the floor fight was fixed.
    const { sink, count } = emit(bufferOf(straight(12)), new Array(12).fill(1));
    for (let i = 0; i < count; i++) {
      const instance = sink.instances[i];
      expect(instance.position.y).toBeCloseTo(
        centerYFromBase(FLOOR_CLEARANCE, instance.scale.y),
        10
      );
      expect(instance.position.y - instance.scale.y / 2).toBeGreaterThan(
        FLOOR_GRAPHICS_TOP_Y
      );
      expect(instance.scale.y).toBeGreaterThan(0);
      expect(instance.scale.y).toBeLessThanOrEqual(TRAIL_HEIGHT_HEAD);
    }
  });

  it('places the head from the same base-to-centre rule as the body', () => {
    expect(SNAKE_HEAD_CENTER_Y).toBe(
      centerYFromBase(FLOOR_CLEARANCE, HEAD_SIZE)
    );
    expect(SNAKE_HEAD_CENTER_Y - HEAD_SIZE / 2).toBeCloseTo(
      FLOOR_CLEARANCE,
      10
    );
    expect(FLOOR_CLEARANCE).toBeGreaterThan(FLOOR_GRAPHICS_TOP_Y);
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

describe('ordinary trail material is a solid authored surface', () => {
  it('is fully opaque, neutral for semantic instance colour, and under bloom', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const material = getInstancedBodyMaterial(dynasty);
      const scalar = getGameMaterialProfile(dynasty).snake.bodyAlbedoScalar;
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true);
      expect(material.color.r).toBeCloseTo(scalar, 10);
      expect(material.color.g).toBeCloseTo(scalar, 10);
      expect(material.color.b).toBeCloseTo(scalar, 10);
      expect(material.emissive.r).toBe(1);
      expect(material.emissive.g).toBe(1);
      expect(material.emissive.b).toBe(1);
      expect(scalar * Math.max(...TRAIL_TONE)).toBeLessThan(1);

      const shader = {
        fragmentShader: '#include <emissivemap_fragment>',
      } as THREE.WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.fragmentShader).toContain('#ifdef USE_COLOR');
      expect(shader.fragmentShader).toContain(
        'totalEmissiveRadiance *= vColor.rgb'
      );
      expect(shader.fragmentShader).not.toContain(
        '#ifdef USE_INSTANCING_COLOR'
      );
    }
  });
});

describe('Dynasty and Strain body colour', () => {
  const luminance = (color: THREE.Color) =>
    color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

  it('keeps every Strain band near its Dynasty base luminance', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const base = writeSnakeTrailColor(new THREE.Color(), dynasty, null);
      for (const strain of ['AURUM', 'VOLT', 'FERAL', 'FLUX', 'UMBRA'] as const) {
        const band = writeSnakeTrailColor(new THREE.Color(), dynasty, strain);
        expect(luminance(band)).toBeGreaterThanOrEqual(
          luminance(base) * TRAIL_STRAIN_LUMINANCE_FLOOR - 1e-6
        );
        // The band still communicates its Strain; preserving luminance must
        // not collapse it back to the untouched Dynasty colour.
        expect(colorDistance(band, base)).toBeGreaterThan(0.03);
      }
    }
  });

  it('keeps the three unbanded Dynasty bodies visually distinct', () => {
    const colors = (['CYBER', 'PRIMAL', 'COSMIC'] as const).map((dynasty) =>
      writeSnakeTrailColor(new THREE.Color(), dynasty, null)
    );
    expect(colorDistance(colors[0], colors[1])).toBeGreaterThan(0.2);
    expect(colorDistance(colors[0], colors[2])).toBeGreaterThan(0.2);
    expect(colorDistance(colors[1], colors[2])).toBeGreaterThan(0.2);
  });
});

describe('tail taper is fluid across engine ticks', () => {
  it('blends a persistent cell from its previous to current vacancy state', () => {
    const previous = straight(10); // z 5..14
    const current = [at(5, 4), ...previous.slice(0, -1)]; // z 4..13
    const buffer = movingBuffer(previous, current);
    const levels = new Array(10).fill(1);
    const heightAt = (alpha: number) => {
      const instance = emit(buffer, levels, alpha).sink.instances.find(
        (entry) => Math.abs(entry.position.z - 13.5) < 1e-6
      );
      expect(instance).toBeDefined();
      return instance!.scale.y;
    };

    const previousHeight = heightAt(0);
    const middleHeight = heightAt(0.5);
    const currentHeight = heightAt(1);
    expect(previousHeight).toBeGreaterThan(middleHeight);
    expect(middleHeight).toBeGreaterThan(currentHeight);
  });
});

describe('full-fusion seal payoff', () => {
  it('zips only the contact edges during its one-shot window', () => {
    const buffer = bufferOf(straight(10));
    const fusion = createTrailFusionState(20, 400);
    const cells = createTrailCellState(20);
    updateTrailCells(cells, buffer);
    const cell = cells.currentCells[3];
    fusion.sealStartedAt[cell] = 2;
    fusion.sealMask[cell] = (1 << 0) | (1 << 3);

    const active = new RecordingSink();
    const activeCount = writeCoilSealInstances(
      active,
      buffer,
      1,
      fusion,
      cells,
      2 + COIL_SEAL_DURATION_SECONDS / 2
    );
    expect(activeCount).toBe(2);
    for (let index = 0; index < activeCount; index += 1) {
      expect(active.instances[index].scale.y).toBeGreaterThan(0);
      expect(active.instances[index].position.y).toBeGreaterThan(
        FLOOR_CLEARANCE
      );
    }

    const expired = new RecordingSink();
    expect(
      writeCoilSealInstances(
        expired,
        buffer,
        1,
        fusion,
        cells,
        2 + COIL_SEAL_DURATION_SECONDS + 0.01
      )
    ).toBe(0);
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
      const { sink, count } = emit(buffer, new Array(6).fill(2), alpha, 0);
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

  it('never sits flush on the floor plane', () => {
    // THE DEFECT THE OWNER DIAGNOSED, and the one my two earlier attempts both
    // missed: the arena platform is a 0.1-tall slab centred at -0.05, so its
    // TOP FACE IS AT EXACTLY y = 0. A cube drawn base-on-floor at y = 0 shares
    // that plane at identical depth across its whole footprint, and two
    // coplanar surfaces z-fight - horizontal bands across the bottom of every
    // face, shimmering when the snake moves along Z and looking stable when it
    // moves along X, because only one of those changes the depth slope.
    //
    // Reproduced and eliminated with one variable: at FLOOR_CLEARANCE = 0 the
    // banding is there. The current value additionally clears the raised major
    // grid rather than sharing its y-plane.
    const { sink, count } = emit(bufferOf(straight(20)), new Array(20).fill(2));
    for (let i = 0; i < count; i++) {
      const base = sink.instances[i].position.y - sink.instances[i].scale.y / 2;
      expect(base).toBeGreaterThan(FLOOR_TOP_Y);
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
  it('uses one bright-front/interior step instead of a moving tail gradient', () => {
    const { sink } = emit(bufferOf(boardSnake(40)), new Array(40).fill(1));
    // Same fusion level: only the categorical front hierarchy differs.
    expect(sink.instances[0].color.r).toBeGreaterThan(
      sink.instances[12].color.r
    );
    expect(sink.instances[12].color.r).toBe(
      sink.instances[30].color.r
    );
  });

  it('changes head-zone geometry over time and leaves the trunk identical', () => {
    const buffer = bufferOf(boardSnake(40));
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

describe('selective interpolation: expressive front, settled interior', () => {
  it('keeps persistent cells fixed while their taper changes fluidly', () => {
    const buffer = createInterpolationBuffer();
    recordTick(buffer, [at(5, 5), at(5, 6), at(5, 7)], 100, 1000);
    recordTick(buffer, [at(5, 4), at(5, 5), at(5, 6)], 100, 1100);
    const early = emit(buffer, [0, 0, 0], 0.25).sink;
    const late = emit(buffer, [0, 0, 0], 0.75).sink;
    // Current body order: entering previous-head cell z=5, then persistent z=6.
    expect(early.instances[1].position.z).toBeCloseTo(6.5, 10);
    expect(late.instances[1].position.z).toBeCloseTo(6.5, 10);
    expect(early.instances[1].scale.y).not.toBeCloseTo(
      late.instances[1].scale.y,
      6
    );
    expect(early.instances[0].position.z).toBeCloseTo(5.5, 10);
    expect(late.instances[0].position.z).toBeCloseTo(5.5, 10);
    expect(late.instances[0].scale.y).toBeGreaterThan(early.instances[0].scale.y);
    expect(getAlpha(buffer, 1150)).toBeCloseTo(0.5, 10);
  });
});

/**
 * WHICH WAY THE CHARACTER IS LOOKING - round 3, owner note.
 *
 * "On the crowded board the head's face (shades + braids) looks BACKWARD,
 * toward its first tail segment, so the face is invisible in play."
 *
 * The head's face is not geometry: it is the `face` cosmetic anchor, at
 * head-local z = +0.5, plus the eyes just outside it. The only thing that
 * turns it toward the world is `HEAD_FACE_YAW`. That table was correct and the
 * fixture that fed it was not - which is precisely why the join now has a test
 * rather than two files that happen to agree.
 */
describe('the head faces where it is going', () => {
  const forward = (yaw: number) => ({
    x: Math.sin(yaw),
    z: Math.cos(yaw),
  });

  it('sends the face anchor down the direction of travel, in all four', () => {
    // The face lives on +Z in head-local space, so the yaw has to rotate +Z
    // onto the travel axis. Asserted against the anchor rather than against a
    // remembered number: moving the cosmetic and not the table breaks here.
    expect(COSMETIC_ANCHORS.face.position[2]).toBeGreaterThan(0);
    expect(COSMETIC_ANCHORS.face.position[0]).toBe(0);

    const travel: Record<Direction, { x: number; z: number }> = {
      UP: { x: 0, z: -1 },
      DOWN: { x: 0, z: 1 },
      LEFT: { x: -1, z: 0 },
      RIGHT: { x: 1, z: 0 },
    };
    for (const direction of Object.keys(travel) as Direction[]) {
      const face = forward(HEAD_FACE_YAW[direction]);
      expect(face.x).toBeCloseTo(travel[direction].x, 10);
      expect(face.z).toBeCloseTo(travel[direction].z, 10);
      // And never the reverse, which is the failure that was reported: a table
      // pi out passes an "axis" check and fails this one.
      expect(face.x * travel[direction].x + face.z * travel[direction].z)
        .toBeCloseTo(1, 10);
    }
  });

  it('turns the crown away from the lead, so braids trail and shades lead', () => {
    // The crown sits on top and is symmetric in plan, so the assertion that
    // carries the owner's note is about the FACE and the segment behind the
    // head: they must never point the same way. `snake[1]` is where the head
    // was a tick ago, so "behind" is the negation of travel.
    for (const direction of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
      const face = forward(HEAD_FACE_YAW[direction]);
      const behind =
        direction === 'UP'
          ? { x: 0, z: 1 }
          : direction === 'DOWN'
            ? { x: 0, z: -1 }
            : direction === 'LEFT'
              ? { x: 1, z: 0 }
              : { x: -1, z: 0 };
      expect(face.x * behind.x + face.z * behind.z).toBeCloseTo(-1, 10);
    }
  });
});
