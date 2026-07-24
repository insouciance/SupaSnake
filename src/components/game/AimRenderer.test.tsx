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
  DEADEYE_CROSSHAIR_SCALE,
  updateDeadeyeVisualPositions,
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
  it('renders only two equal centered lines as a symmetrical plus', () => {
    const { container } = render(
      <AimRenderer
        headPosition={head}
        direction="LEFT"
        aimSystem="deadeye"
        targets={[{ x: 1, z: 6, kind: 'food' }]}
        color="#22d3ee"
      />
    );

    const crosshair = container.querySelector('group[name="deadeye-crosshair"]');
    const horizontal = container.querySelector(
      'mesh[name="deadeye-crosshair-horizontal"]'
    );
    const vertical = container.querySelector(
      'mesh[name="deadeye-crosshair-vertical"]'
    );

    expect(crosshair).not.toBeNull();
    expect(horizontal).not.toBeNull();
    expect(vertical).not.toBeNull();
    expectVectorClose(vectorAttribute(crosshair!, 'position'), [4.5, 0, 6.5]);
    expectVectorClose(vectorAttribute(horizontal!, 'position'), [0, 0.06, 0]);
    expectVectorClose(vectorAttribute(vertical!, 'position'), [0, 0.06, 0]);
    expect(vectorAttribute(horizontal!, 'scale')).toEqual(
      DEADEYE_CROSSHAIR_SCALE.horizontal
    );
    expect(vectorAttribute(vertical!, 'scale')).toEqual(
      DEADEYE_CROSSHAIR_SCALE.vertical
    );
    expect(DEADEYE_CROSSHAIR_SCALE.horizontal[0]).toBe(
      DEADEYE_CROSSHAIR_SCALE.vertical[1]
    );
    expect(DEADEYE_CROSSHAIR_SCALE.horizontal[1]).toBe(
      DEADEYE_CROSSHAIR_SCALE.vertical[0]
    );

    // One floor tile plus the two clean crosshair lines: no beam ticks,
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

describe('updateDeadeyeVisualPositions', () => {
  it('keeps the crosshair fluid while the floor tile snaps to the current cell', () => {
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [segment(4, 6)], 200, 1000);
    recordTick(buffer, [segment(5, 6)], 200, 1200);
    const previousBefore = Array.from(buffer.prev);
    const currentBefore = Array.from(buffer.curr);
    const crosshairPosition = new THREE.Vector3();
    const highlightPosition = new THREE.Vector3();

    updateDeadeyeVisualPositions(
      segment(5, 6),
      buffer,
      1300,
      crosshairPosition,
      highlightPosition
    );

    // Halfway from grid x=4 to x=5, plus the half-cell world offset.
    expect(crosshairPosition.toArray()).toEqual([5, 0, 6.5]);
    // The visual tile stays on the authoritative current grid cell.
    expect(highlightPosition.toArray()).toEqual([5.5, 0.04, 6.5]);
    expect(Array.from(buffer.prev)).toEqual(previousBefore);
    expect(Array.from(buffer.curr)).toEqual(currentBefore);
  });

  it('falls back to the supplied head cell before interpolation is available', () => {
    const crosshairPosition = new THREE.Vector3();
    const highlightPosition = new THREE.Vector3();

    updateDeadeyeVisualPositions(
      head,
      null,
      0,
      crosshairPosition,
      highlightPosition
    );

    expect(crosshairPosition.toArray()).toEqual([4.5, 0, 6.5]);
    expect(highlightPosition.toArray()).toEqual([4.5, 0.04, 6.5]);
  });
});
