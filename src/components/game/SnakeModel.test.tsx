/**
 * SnakeModel tests - GLB voxel segment rendering.
 *
 * Covers the three contracts of the component:
 * 1. Geometry is extracted by cloning (the shared useGLTF cache is never
 *    mutated - regression test for the old scene.traverse material swap bug).
 * 2. Per-dynasty materials are memoized module-wide (segments share instances).
 * 3. Head/body render with the right sizes and graceful GLB fallback.
 */

import { render } from '@testing-library/react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import {
  SnakeModel,
  SnakeSegmentFallback,
  getSnakeGeometries,
  getSnakeSegmentMaterial,
  SNAKE_MODEL_URL,
  HEAD_SIZE,
  BODY_SIZE,
  HEAD_EMISSIVE_INTENSITY,
  BODY_EMISSIVE_INTENSITY,
  BASE_COLOR_SCALE,
} from './SnakeModel';
import { themeManager } from '@/lib/theme/ThemeManager';

jest.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(jest.fn(), { preload: jest.fn() }),
}));

const mockUseGLTF = useGLTF as unknown as jest.Mock;

/** Build a stand-in for the loaded snake_voxel.glb scene. */
function buildGltfScene() {
  const scene = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#00ff9e' });

  // Head: 1.5-unit cube centered at origin (matches the real GLB)
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), material);
  head.name = 'snake_head';

  // Body segment: 1-unit cube with its offset baked into the geometry,
  // like the real GLB (center at z = -1.2)
  const segGeometry = new THREE.BoxGeometry(1, 1, 1);
  segGeometry.translate(0, 0, -1.2);
  const segment = new THREE.Mesh(segGeometry, material);
  segment.name = 'snake_segment_1';

  scene.add(head, segment);
  return { scene, material, head, segment };
}

// React logs warnings for R3F props on plain DOM (jsdom has no Canvas);
// silence them so real errors stay visible.
let consoleErrorSpy: jest.SpyInstance;
beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  mockUseGLTF.mockReset();
});

describe('getSnakeGeometries', () => {
  it('clones geometry instead of reusing the GLTF cache instances', () => {
    const { scene, head, segment } = buildGltfScene();
    const { head: headGeo, body: bodyGeo } = getSnakeGeometries(scene);

    expect(headGeo).not.toBeNull();
    expect(bodyGeo).not.toBeNull();
    expect(headGeo).not.toBe(head.geometry);
    expect(bodyGeo).not.toBe(segment.geometry);
  });

  it('normalizes extracted geometry to a centered unit cube', () => {
    const { scene } = buildGltfScene();
    const { head: headGeo, body: bodyGeo } = getSnakeGeometries(scene);

    for (const geo of [headGeo!, bodyGeo!]) {
      geo.computeBoundingBox();
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      geo.boundingBox!.getSize(size);
      geo.boundingBox!.getCenter(center);
      expect(size.x).toBeCloseTo(1);
      expect(size.y).toBeCloseTo(1);
      expect(size.z).toBeCloseTo(1);
      // The body segment's baked z-offset (-1.2) must be removed
      expect(center.length()).toBeCloseTo(0);
    }
  });

  it('caches per scene: repeated calls return the same instances', () => {
    const { scene } = buildGltfScene();
    const first = getSnakeGeometries(scene);
    const second = getSnakeGeometries(scene);

    expect(second).toBe(first);
    expect(second.head).toBe(first.head);
    expect(second.body).toBe(first.body);
  });

  it('does not mutate the source scene (geometry untouched)', () => {
    const { scene, head, segment } = buildGltfScene();
    const headGeoBefore = head.geometry;
    const segGeoBefore = segment.geometry;
    const segBoundsBefore = segGeoBefore
      .clone()
      .toNonIndexed()
      .getAttribute('position')
      .clone();

    getSnakeGeometries(scene);

    expect(head.geometry).toBe(headGeoBefore);
    expect(segment.geometry).toBe(segGeoBefore);
    // Vertex data unchanged (center()/scale() were applied to clones only)
    const segBoundsAfter = segGeoBefore
      .toNonIndexed()
      .getAttribute('position');
    expect(Array.from(segBoundsAfter.array)).toEqual(
      Array.from(segBoundsBefore.array)
    );
  });

  it('returns nulls when the expected meshes are missing', () => {
    const emptyScene = new THREE.Group();
    const { head, body } = getSnakeGeometries(emptyScene);
    expect(head).toBeNull();
    expect(body).toBeNull();
  });
});

describe('getSnakeSegmentMaterial', () => {
  it('memoizes per dynasty + role (shared across all segments)', () => {
    const a = getSnakeSegmentMaterial('CYBER', false);
    const b = getSnakeSegmentMaterial('CYBER', false);
    expect(b).toBe(a);

    const head = getSnakeSegmentMaterial('CYBER', true);
    expect(head).not.toBe(a);

    const primal = getSnakeSegmentMaterial('PRIMAL', false);
    expect(primal).not.toBe(a);
  });

  it('uses void-shifted theme primary as base and secondary as emissive', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const theme = themeManager.getTheme(dynasty);
      const material = getSnakeSegmentMaterial(dynasty, false);
      // Base is primary mixed toward the void (deliberate glow-over-void
      // read: the emissive carries the identity, not the albedo)
      const expectedBase = new THREE.Color(theme.primary).multiplyScalar(
        BASE_COLOR_SCALE
      );
      expect(material.color.getHexString()).toBe(expectedBase.getHexString());
      expect(`#${material.emissive.getHexString()}`).toBe(
        theme.secondary.toLowerCase()
      );
    }
  });

  it('gives the head a brighter emissive than the body', () => {
    const head = getSnakeSegmentMaterial('COSMIC', true);
    const body = getSnakeSegmentMaterial('COSMIC', false);
    expect(head.emissiveIntensity).toBe(HEAD_EMISSIVE_INTENSITY);
    expect(body.emissiveIntensity).toBe(BODY_EMISSIVE_INTENSITY);
    expect(head.emissiveIntensity).toBeGreaterThan(body.emissiveIntensity);
  });
});

describe('SnakeModel', () => {
  it('loads the voxel GLB via useGLTF and renders head/body at correct scale', () => {
    const { scene } = buildGltfScene();
    mockUseGLTF.mockReturnValue({ scene });

    const { container } = render(
      <>
        <SnakeModel position={[0.5, 0.5, 0.5]} isHead dynasty="CYBER" />
        <SnakeModel position={[1.5, 0.5, 0.5]} isHead={false} dynasty="CYBER" />
      </>
    );

    expect(mockUseGLTF).toHaveBeenCalledWith(SNAKE_MODEL_URL);
    const meshes = container.querySelectorAll('mesh');
    expect(meshes).toHaveLength(2);
    expect(meshes[0].getAttribute('scale')).toBe(String(HEAD_SIZE));
    expect(meshes[1].getAttribute('scale')).toBe(String(BODY_SIZE));
  });

  it('never mutates the shared GLTF cache (materials and geometry untouched)', () => {
    const { scene, material, head, segment } = buildGltfScene();
    const colorBefore = material.color.getHexString();
    const headGeoBefore = head.geometry;
    mockUseGLTF.mockReturnValue({ scene });

    render(
      <>
        <SnakeModel position={[0.5, 0.5, 0.5]} isHead dynasty="COSMIC" />
        <SnakeModel position={[1.5, 0.5, 0.5]} isHead={false} dynasty="COSMIC" />
      </>
    );

    // Regression: the old implementation replaced every mesh material in an
    // effect while rendering a clone of the cached scene.
    expect(head.material).toBe(material);
    expect(segment.material).toBe(material);
    expect(material.color.getHexString()).toBe(colorBefore);
    expect(head.geometry).toBe(headGeoBefore);
  });

  it('still renders when the GLB lacks the expected meshes', () => {
    mockUseGLTF.mockReturnValue({ scene: new THREE.Group() });

    const { container } = render(
      <SnakeModel position={[0.5, 0.5, 0.5]} isHead dynasty="PRIMAL" />
    );

    expect(container.querySelectorAll('mesh')).toHaveLength(1);
  });
});

describe('SnakeSegmentFallback', () => {
  it('renders a box stand-in without touching useGLTF', () => {
    const { container } = render(
      <SnakeSegmentFallback
        position={[0.5, 0.5, 0.5]}
        isHead={false}
        dynasty="CYBER"
      />
    );

    expect(mockUseGLTF).not.toHaveBeenCalled();
    const mesh = container.querySelector('mesh');
    expect(mesh).not.toBeNull();
    expect(mesh!.getAttribute('scale')).toBe(String(BODY_SIZE));
  });
});
