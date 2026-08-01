import * as THREE from 'three';
import {
  SNAKE_BODY_RADIUS,
  SNAKE_HEAD_RADIUS,
  SNAKE_ROUNDING_SEGMENTS,
  createExactUnitRoundedBoxGeometry,
  getSnakeRoundedGeometry,
} from './gameRenderGeometry';

describe('exact-unit game render geometry', () => {
  it('keeps exact centered unit bounds for every snake role', () => {
    for (const role of ['head', 'body'] as const) {
      const geometry = getSnakeRoundedGeometry(role);
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      geometry.boundingBox!.getSize(size);
      geometry.boundingBox!.getCenter(center);
      expect(size.toArray()).toEqual([1, 1, 1]);
      expect(center.length()).toBeCloseTo(0, 10);
    }
  });

  it('uses a bounded low-segment bevel rather than resolution inflation', () => {
    const body = getSnakeRoundedGeometry('body');
    expect(SNAKE_ROUNDING_SEGMENTS).toBe(1);
    expect(body.getAttribute('position').count).toBeLessThanOrEqual(324);
    expect(SNAKE_HEAD_RADIUS).toBeGreaterThan(SNAKE_BODY_RADIUS);
  });

  it('has authored bevel normals while retaining the six axial faces', () => {
    const geometry = createExactUnitRoundedBoxGeometry(0.1);
    const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
    let hasBevelNormal = false;
    let hasAxialNormal = false;
    for (let index = 0; index < normals.count; index += 1) {
      const x = Math.abs(normals.getX(index));
      const y = Math.abs(normals.getY(index));
      const z = Math.abs(normals.getZ(index));
      if ([x, y, z].filter((value) => value > 0.05).length >= 2) {
        hasBevelNormal = true;
      }
      if (Math.max(x, y, z) > 0.999) hasAxialNormal = true;
    }
    expect(hasBevelNormal).toBe(true);
    expect(hasAxialNormal).toBe(true);
  });
});
