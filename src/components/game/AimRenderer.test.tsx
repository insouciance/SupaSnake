/**
 * Deadeye visual-contract tests.
 *
 * RE-EXPRESSED FOR THE LEAD (INK & AMBER). This suite used to pin the T
 * guide's layout maths - `getDeadeyeGuideLayout`, `writeDeadeyeGuideTransforms`
 * and `updateDeadeyeVisualTransforms`, and the crossbar/stem meshes they
 * positioned. The owner removed that guide outright ("completely wrong - take
 * it away and replace it with a different one"), so those exports and this
 * half of the suite retire TOGETHER, in one re-ratification, rather than an
 * exported API being quietly deleted while a test still imports it.
 *
 * What replaces them pins THE LEAD's actual contract, which is the same kind
 * of promise the old suite made about the T:
 *
 *   1. Structure - three chips and their ink hulls, in two instanced draws,
 *      plus the one snapped cell tile. Nothing else.
 *   2. The taper - length recedes with distance while WIDTH is constant,
 *      because width carries the ink edge.
 *   3. Wall truncation, and its torus exception.
 *   4. The glide binding - the mark rides the interpolated head while the
 *      tile snaps to the authoritative cell (the split Gridlock also uses).
 *
 * The WebGL scene itself is covered by the cockpit renderer gate; these
 * focused tests involve no movement or engine state.
 */

import { render } from '@testing-library/react';
import * as THREE from 'three';
import {
  createInterpolationBuffer,
  recordTick,
} from '@/lib/game/interpolationBuffer';
import {
  AimRenderer,
  countLeadCells,
  readLeadHeadSample,
  writeLeadInstances,
} from './AimRenderer';

jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
}));

const head = { x: 4, y: 0, z: 6 };
const segment = (x: number, z: number) => ({ x, y: 0, z });

// React logs warnings for R3F props on plain DOM (jsdom has no Canvas).
let consoleErrorSpy: jest.SpyInstance;
beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  consoleErrorSpy.mockRestore();
});

function vectorAttribute(element: Element, attribute: string): number[] {
  return (element.getAttribute(attribute) ?? '').split(',').map(Number);
}

function expectVectorClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], 10);
  });
}

/**
 * Read the authored lead matrices the way the component does: an instanced
 * mesh at the module's capacity, filled by the shared writer.
 *
 * `InstancedMesh` stores matrices in a Float32Array, so every value round-trips
 * through single precision. Assertions below are held to 6 decimals rather
 * than 10 for that reason and no other - these are authored constants, not
 * accumulated arithmetic.
 */
function authoredLead(): THREE.Matrix4[] {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    3
  );
  writeLeadInstances(mesh);
  return [0, 1, 2].map((index) => {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    return matrix;
  });
}

function decompose(matrix: THREE.Matrix4): {
  position: THREE.Vector3;
  scale: THREE.Vector3;
} {
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  matrix.decompose(position, new THREE.Quaternion(), scale);
  return { position, scale };
}

describe('THE LEAD', () => {
  it('draws three chips, their ink hulls, and the snapped cell tile - nothing else', () => {
    const { container } = render(
      <AimRenderer
        headPosition={head}
        direction="LEFT"
        gridSize={20}
        aimSystem="deadeye"
        targets={[{ x: 1, z: 6, kind: 'food' }]}
        color="#22d3ee"
      />
    );

    const lead = container.querySelector('group[name="deadeye-lead"]');
    const chips = container.querySelector(
      'instancedmesh[name="deadeye-lead-chips"]'
    );
    const ink = container.querySelector(
      'instancedmesh[name="deadeye-lead-ink"]'
    );

    expect(lead).not.toBeNull();
    expect(chips).not.toBeNull();
    expect(ink).not.toBeNull();

    // The guide is TWO instanced draws, not one mesh per dash, and the only
    // plain mesh left in the system is the snapped cell tile. No beam ticks,
    // lock brackets, centre dot, crossbar or stem survive.
    expect(container.querySelectorAll('instancedmesh')).toHaveLength(2);
    expect(container.querySelectorAll('mesh')).toHaveLength(1);
    expect(
      container.querySelector('mesh[name="deadeye-head-cell-highlight"]')
    ).not.toBeNull();
  });

  it('yaws the whole mark instead of re-authoring it per heading', () => {
    // A turn must cost a single declarative rotation: the chips live in the
    // group's local space with the heading along -Z, exactly the convention
    // DIRECTION_YAW maps the Pathline chevron by.
    const yaws = (['UP', 'DOWN', 'LEFT', 'RIGHT'] as const).map((direction) => {
      const { container } = render(
        <AimRenderer
          headPosition={head}
          direction={direction}
          gridSize={20}
          aimSystem="deadeye"
          color="#22d3ee"
        />
      );
      return container
        .querySelector('group[name="deadeye-lead"]')!
        .getAttribute('rotation-y');
    });

    expect(new Set(yaws).size).toBe(4);
  });

  it('places the cell-sized highlight beneath the head cell', () => {
    const { container } = render(
      <AimRenderer headPosition={head} aimSystem="deadeye" color="#22d3ee" />
    );

    const highlight = container.querySelector(
      'mesh[name="deadeye-head-cell-highlight"]'
    );
    expect(highlight).not.toBeNull();
    expectVectorClose(vectorAttribute(highlight!, 'position'), [4.5, 0.04, 6.5]);
  });
});

describe('writeLeadInstances', () => {
  it('puts one chip on the centre of each of the next three cells', () => {
    const matrices = authoredLead();

    matrices.forEach((matrix, index) => {
      const { position } = decompose(matrix);
      // Local space: the heading runs along -Z, one cell per dash.
      expect(position.x).toBeCloseTo(0, 6);
      expect(position.z).toBeCloseTo(-(index + 1), 6);
    });
  });

  it('rests every chip on the aim plane rather than sinking it into the board', () => {
    const AIM_Y = 0.05;
    for (const matrix of authoredLead()) {
      const { position, scale } = decompose(matrix);
      expect(position.y - scale.y / 2).toBeCloseTo(AIM_Y, 6);
    }
  });

  it('tapers in LENGTH only - width is constant so the ink edge never eats the core', () => {
    const scales = authoredLead().map((matrix) => decompose(matrix).scale);

    // Length recedes, monotonically.
    expect(scales[0].z).toBeGreaterThan(scales[1].z);
    expect(scales[1].z).toBeGreaterThan(scales[2].z);
    // Height recedes with it - a mild recede, the mark stays board-flat.
    expect(scales[0].y).toBeGreaterThan(scales[2].y);
    // Width does NOT. A narrower dash would be eaten by its own outline.
    expect(scales[1].x).toBeCloseTo(scales[0].x, 6);
    expect(scales[2].x).toBeCloseTo(scales[0].x, 6);
    // The furthest dash still reads as pointing, not sitting: the shallowest
    // length:width ratio in the taper stays at or above 1.5:1.
    expect(scales[2].z / scales[2].x).toBeGreaterThanOrEqual(1.5 - 1e-6);
    // And no dash ever crowds a turn by spilling out of its own cell.
    for (const scale of scales) {
      expect(scale.z).toBeLessThan(1);
      expect(scale.x).toBeLessThan(1);
    }
  });
});

describe('countLeadCells', () => {
  it('shows the full lead with clear board ahead', () => {
    expect(countLeadCells(head, 'RIGHT', 20, false)).toBe(3);
  });

  it('truncates at the wall rather than marking cells off the board', () => {
    expect(countLeadCells(segment(17, 8), 'RIGHT', 20, false)).toBe(2);
    expect(countLeadCells(segment(19, 8), 'RIGHT', 20, false)).toBe(0);
    expect(countLeadCells(segment(1, 8), 'LEFT', 20, false)).toBe(1);
    expect(countLeadCells(segment(8, 0), 'UP', 20, false)).toBe(0);
    expect(countLeadCells(segment(8, 18), 'DOWN', 20, false)).toBe(1);
  });

  it('carries the whole lead over a seam on a torus - there is no wall to stop at', () => {
    // WP-3.13: on COSMIC the edges wrap, so the three cells the guide marks
    // are exactly the three cells the snake will occupy. A truncated lead
    // there would be an omission at the one place the player most needs it.
    expect(countLeadCells(segment(19, 8), 'RIGHT', 20, true)).toBe(3);
    expect(countLeadCells(segment(0, 0), 'LEFT', 20, true)).toBe(3);
    expect(countLeadCells(segment(8, 19), 'DOWN', 20, true)).toBe(3);
  });
});

describe('the glide binding', () => {
  it('rides the interpolated head while the tile snaps to the current cell', () => {
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [segment(4, 6)], 200, 1000);
    recordTick(buffer, [segment(5, 6)], 200, 1200);
    const previousBefore = Array.from(buffer.prev);
    const currentBefore = Array.from(buffer.curr);

    const sample = readLeadHeadSample(segment(5, 6), buffer, 1300);

    // Halfway from grid x=4 to x=5: the mark and the head move as one rigid
    // body, so the guide never has to be re-acquired by the eye.
    expect(sample.smoothX).toBeCloseTo(4.5, 10);
    expect(sample.smoothZ).toBeCloseTo(6, 10);
    // The tile stays on the authoritative grid cell - the snapped answer to
    // "which cell am I in", which is what a gliding mark cannot give.
    expect(sample.snapX).toBe(5);
    expect(sample.snapZ).toBe(6);
    // Reading the buffer must never disturb it.
    expect(Array.from(buffer.prev)).toEqual(previousBefore);
    expect(Array.from(buffer.curr)).toEqual(currentBefore);
  });

  it('falls back to the supplied head cell before interpolation is available', () => {
    const sample = readLeadHeadSample(head, null, 0);

    expect(sample.smoothX).toBe(head.x);
    expect(sample.smoothZ).toBe(head.z);
    expect(sample.snapX).toBe(head.x);
    expect(sample.snapZ).toBe(head.z);
  });
});
