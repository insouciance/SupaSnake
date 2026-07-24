/**
 * Deadeye visual-contract tests.
 *
 * The WebGL scene itself is covered by the cockpit renderer gate. These
 * focused tests pin the component structure and the smooth-head/snapped-cell
 * split without involving movement or engine state.
 */

import { render } from '@testing-library/react';
import * as THREE from 'three';
import {
  createInterpolationBuffer,
  recordTick,
} from '@/lib/game/interpolationBuffer';
import {
  AimRenderer,
  getDeadeyeGuideLayout,
  updateDeadeyeVisualTransforms,
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

describe('Deadeye reticle', () => {
  it('renders only a board-wide crossbar and forward stem as a clean T', () => {
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

    const crosshair = container.querySelector('group[name="deadeye-crosshair"]');
    const crossbar = container.querySelector(
      'mesh[name="deadeye-crosshair-crossbar"]'
    );
    const stem = container.querySelector(
      'mesh[name="deadeye-crosshair-stem"]'
    );

    expect(crosshair).not.toBeNull();
    expect(crossbar).not.toBeNull();
    expect(stem).not.toBeNull();
    expectVectorClose(vectorAttribute(crossbar!, 'position'), [4.5, 0.06, 10]);
    expectVectorClose(vectorAttribute(crossbar!, 'scale'), [0.06, 20, 1]);
    expectVectorClose(vectorAttribute(stem!, 'position'), [2.25, 0.06, 6.5]);
    expectVectorClose(vectorAttribute(stem!, 'scale'), [4.5, 0.06, 1]);

    // One floor tile plus the two clean T-guide lines: no beam ticks,
    // lock brackets, center dot, or distant idle ornament remains.
    expect(container.querySelectorAll('mesh')).toHaveLength(3);
    expect(container.querySelector('instancedmesh')).toBeNull();
  });

  it('places the existing cell-sized highlight beneath the head cell', () => {
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

describe('getDeadeyeGuideLayout', () => {
  it('rotates the T through all four headings and reaches each relevant board edge', () => {
    const up = getDeadeyeGuideLayout(head, 'UP', 20);
    const down = getDeadeyeGuideLayout(head, 'DOWN', 20);
    const left = getDeadeyeGuideLayout(head, 'LEFT', 20);
    const right = getDeadeyeGuideLayout(head, 'RIGHT', 20);

    expect(up.crossbar).toEqual({
      position: [10, 0.06, 6.5],
      scale: [20, 0.06, 1],
    });
    expect(up.stem).toEqual({
      position: [4.5, 0.06, 3.25],
      scale: [0.06, 6.5, 1],
    });
    expect(down.crossbar).toEqual(up.crossbar);
    expect(down.stem).toEqual({
      position: [4.5, 0.06, 13.25],
      scale: [0.06, 13.5, 1],
    });
    expect(left.crossbar).toEqual({
      position: [4.5, 0.06, 10],
      scale: [0.06, 20, 1],
    });
    expect(left.stem).toEqual({
      position: [2.25, 0.06, 6.5],
      scale: [4.5, 0.06, 1],
    });
    expect(right.crossbar).toEqual(left.crossbar);
    expect(right.stem).toEqual({
      position: [12.25, 0.06, 6.5],
      scale: [15.5, 0.06, 1],
    });
  });

  it('keeps a half-cell stem at the outward board-edge cells', () => {
    const left = getDeadeyeGuideLayout(segment(0, 8), 'LEFT', 20);
    const right = getDeadeyeGuideLayout(segment(19, 8), 'RIGHT', 20);
    const up = getDeadeyeGuideLayout(segment(8, 0), 'UP', 20);
    const down = getDeadeyeGuideLayout(segment(8, 19), 'DOWN', 20);

    expect(left.stem.position[0] - left.stem.scale[0] / 2).toBe(0);
    expect(right.stem.position[0] + right.stem.scale[0] / 2).toBe(20);
    expect(up.stem.position[2] - up.stem.scale[1] / 2).toBe(0);
    expect(down.stem.position[2] + down.stem.scale[1] / 2).toBe(20);
    expect(left.stem.scale[0]).toBe(0.5);
    expect(right.stem.scale[0]).toBe(0.5);
    expect(up.stem.scale[1]).toBe(0.5);
    expect(down.stem.scale[1]).toBe(0.5);
  });
});

describe('updateDeadeyeVisualTransforms', () => {
  it('keeps the T fluid while the floor tile snaps to the current cell', () => {
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [segment(4, 6)], 200, 1000);
    recordTick(buffer, [segment(5, 6)], 200, 1200);
    const previousBefore = Array.from(buffer.prev);
    const currentBefore = Array.from(buffer.curr);
    const crossbar = new THREE.Object3D();
    const stem = new THREE.Object3D();
    const highlightPosition = new THREE.Vector3();

    updateDeadeyeVisualTransforms(
      segment(5, 6),
      'RIGHT',
      20,
      buffer,
      1300,
      crossbar,
      stem,
      highlightPosition
    );

    // Halfway from grid x=4 to x=5, plus the half-cell world offset. The
    // perpendicular bar follows that smooth center while still spanning Z.
    expect(crossbar.position.toArray()).toEqual([5, 0.06, 10]);
    expect(crossbar.scale.toArray()).toEqual([0.06, 20, 1]);
    expect(stem.position.toArray()).toEqual([12.5, 0.06, 6.5]);
    expect(stem.scale.toArray()).toEqual([15, 0.06, 1]);
    // The visual tile stays on the authoritative current grid cell.
    expect(highlightPosition.toArray()).toEqual([5.5, 0.04, 6.5]);
    expect(Array.from(buffer.prev)).toEqual(previousBefore);
    expect(Array.from(buffer.curr)).toEqual(currentBefore);
  });

  it('falls back to the supplied head cell before interpolation is available', () => {
    const crossbar = new THREE.Object3D();
    const stem = new THREE.Object3D();
    const highlightPosition = new THREE.Vector3();

    updateDeadeyeVisualTransforms(
      head,
      'UP',
      20,
      null,
      0,
      crossbar,
      stem,
      highlightPosition
    );

    expect(crossbar.position.toArray()).toEqual([10, 0.06, 6.5]);
    expect(crossbar.scale.toArray()).toEqual([20, 0.06, 1]);
    expect(stem.position.toArray()).toEqual([4.5, 0.06, 3.25]);
    expect(stem.scale.toArray()).toEqual([0.06, 6.5, 1]);
    expect(highlightPosition.toArray()).toEqual([4.5, 0.04, 6.5]);
  });
});
