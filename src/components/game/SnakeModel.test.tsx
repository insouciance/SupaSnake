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
  getSegmentScale,
  SNAKE_MODEL_URL,
  HEAD_SIZE,
  BODY_SIZE,
  TAPER_SEGMENTS,
  TAPER_MIN,
  ENERGY_MIN,
  TRAIL_FOOTPRINT,
  TRAIL_TONE,
  TRAIL_HEAD_ZONE,
  TRAIL_HEIGHT_HEAD,
  TRAIL_HEIGHT_TRUNK,
  TRAIL_HEIGHT_TAIL,
  TRAIL_VACANCY_TICKS,
  TRAIL_BREATHE_AMPLITUDE,
  getTrailFootprint,
  getTrailTone,
  getTrailHeight,
  getTrailBreathe,
} from './SnakeModel';
import { getGameMaterialProfile } from './screen/gameMaterialProfiles';
import { getToonGradientMap } from './screen/inkAmber';

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

describe('proportion constants (AAA rework pins)', () => {
  it('pins the head/body proportion: head 0.9, body 0.75', () => {
    // Deliberate design pins - a change here is a design decision, not a
    // refactor. BODY_SIZE dropped 0.82 -> 0.75: enough gap for the head to
    // read first, tight enough that inter-segment gaps don't strobe
    // (accordion) through curves - the eye-comfort compromise.
    expect(HEAD_SIZE).toBe(0.9);
    expect(BODY_SIZE).toBe(0.75);
    expect(TAPER_SEGMENTS).toBe(6);
    expect(TAPER_MIN).toBe(0.85);
    // The settled interior stays close to full energy. Quiet comes from
    // cell-persistence and selective head motion, not an unreadable dark tail.
    expect(ENERGY_MIN).toBe(0.94);
  });
});

describe('getSegmentScale (tail taper)', () => {
  it('keeps the head and trunk at exactly 1.0', () => {
    const length = 20;
    expect(getSegmentScale(0, length)).toBe(1);
    for (let i = 1; i < length - TAPER_SEGMENTS; i++) {
      expect(getSegmentScale(i, length)).toBe(1);
    }
  });

  it('is monotonically non-increasing from head to tail', () => {
    for (const length of [3, 7, 10, 50, 100]) {
      let previous = Infinity;
      for (let i = 0; i < length; i++) {
        const scale = getSegmentScale(i, length);
        expect(scale).toBeLessThanOrEqual(previous);
        previous = scale;
      }
    }
  });

  it('reaches exactly TAPER_MIN at the tail tip', () => {
    for (const length of [8, 10, 42, 100]) {
      expect(getSegmentScale(length - 1, length)).toBeCloseTo(TAPER_MIN, 10);
    }
  });

  it('tapers over exactly the last TAPER_SEGMENTS segments on long snakes', () => {
    const length = 30;
    const taperStart = length - TAPER_SEGMENTS;
    expect(getSegmentScale(taperStart - 1, length)).toBe(1);
    expect(getSegmentScale(taperStart, length)).toBeLessThan(1);
  });

  it('never drops below TAPER_MIN anywhere', () => {
    for (const length of [1, 2, 3, 5, 7, 20, 400]) {
      for (let i = 0; i < length; i++) {
        expect(getSegmentScale(i, length)).toBeGreaterThanOrEqual(TAPER_MIN);
      }
    }
  });

  it('short-snake clamp: the head never tapers, the body still does', () => {
    // 3-segment hatchling: head full size, tail tip at TAPER_MIN
    expect(getSegmentScale(0, 3)).toBe(1);
    expect(getSegmentScale(1, 3)).toBeLessThan(1);
    expect(getSegmentScale(2, 3)).toBeCloseTo(TAPER_MIN, 10);
    // Degenerate lengths are safe
    expect(getSegmentScale(0, 1)).toBe(1);
    expect(getSegmentScale(1, 2)).toBeCloseTo(TAPER_MIN, 10);
  });
});

// ---------------------------------------------------------------------------
// The trail (WP-3.07). Pure per-segment shape - the metric that feeds it lives
// in src/lib/game/trailFusion.ts and is tested there.
// ---------------------------------------------------------------------------

describe('getTrailFootprint (fusion -> how much of its cell a segment claims)', () => {
  it('grows strictly with the earned fusion level', () => {
    expect(getTrailFootprint(0)).toBeLessThan(getTrailFootprint(1));
    expect(getTrailFootprint(1)).toBeLessThan(getTrailFootprint(2));
  });

  it('leaves a visible gap at level 0 and a hairline at level 2', () => {
    // Level 0 is "running free": the voxels must read as separate tiles.
    // Level 2 is "fully fused": solid, but the grid must stay countable -
    // telling the player WHICH tiles are blocked is the trail's first job.
    expect(1 - getTrailFootprint(0)).toBeGreaterThan(0.25);
    expect(1 - getTrailFootprint(2)).toBeGreaterThan(0);
    expect(1 - getTrailFootprint(2)).toBeLessThan(0.1);
  });

  it('never exceeds a cell - a segment may not overlap its neighbours', () => {
    for (const footprint of TRAIL_FOOTPRINT) {
      expect(footprint).toBeGreaterThan(0);
      expect(footprint).toBeLessThan(1);
    }
  });

  it('clamps outside the level range instead of reading off the end', () => {
    expect(getTrailFootprint(-3)).toBe(TRAIL_FOOTPRINT[0]);
    expect(getTrailFootprint(9)).toBe(TRAIL_FOOTPRINT[TRAIL_FOOTPRINT.length - 1]);
  });
});

describe('getTrailTone (fusion -> brightness)', () => {
  it('is brightest when fully fused and darkest when running free', () => {
    expect(getTrailTone(0)).toBeLessThan(getTrailTone(1));
    expect(getTrailTone(1)).toBeLessThan(getTrailTone(2));
  });

  it('never goes dark enough to hide a segment', () => {
    // This is a readout, not a punishment. Badly packed cells still have to
    // be legible, or the feedback costs the player the information it is
    // supposed to be giving them.
    for (const tone of TRAIL_TONE) {
      expect(tone).toBeGreaterThan(0.6);
    }
  });

  it('stays under the bloom threshold once the albedo trim is applied', () => {
    // Each material profile keeps the moving trunk below bloom even at full
    // fusion. A blooming trunk is a flicker amplifier in motion.
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const scalar = getGameMaterialProfile(dynasty).snake.bodyAlbedoScalar;
      for (const tone of TRAIL_TONE) {
        expect(tone * scalar).toBeLessThan(1);
      }
    }
  });

  it('clamps outside the level range', () => {
    expect(getTrailTone(-1)).toBe(TRAIL_TONE[0]);
    expect(getTrailTone(7)).toBe(TRAIL_TONE[TRAIL_TONE.length - 1]);
  });
});

describe('getTrailHeight (the head is a creature, the trail is settled stack)', () => {
  const LONG = 60;

  it('stands tall at the head and settles into the trunk', () => {
    expect(getTrailHeight(1, LONG)).toBeGreaterThan(getTrailHeight(4, LONG));
    expect(getTrailHeight(TRAIL_HEAD_ZONE, LONG)).toBeCloseTo(
      TRAIL_HEIGHT_TRUNK,
      10
    );
  });

  it('is flat through the whole middle - the trunk must be still', () => {
    for (let i = TRAIL_HEAD_ZONE; i < LONG - TRAIL_VACANCY_TICKS; i++) {
      expect(getTrailHeight(i, LONG)).toBeCloseTo(TRAIL_HEIGHT_TRUNK, 10);
    }
  });

  it('sinks over exactly the last TRAIL_VACANCY_TICKS cells', () => {
    // The tail zone encodes IMMINENT VACANCY, denominated in ticks: the
    // engine pops one tail cell per tick, so segment `i` of a length-L body
    // frees its tile in L - i ticks.
    const firstSinking = LONG - TRAIL_VACANCY_TICKS;
    expect(getTrailHeight(firstSinking, LONG)).toBeCloseTo(
      TRAIL_HEIGHT_TRUNK,
      10
    );
    for (let i = firstSinking + 1; i < LONG; i++) {
      expect(getTrailHeight(i, LONG)).toBeLessThan(getTrailHeight(i - 1, LONG));
    }
    expect(getTrailHeight(LONG - 1, LONG)).toBeCloseTo(TRAIL_HEIGHT_TAIL, 10);
  });

  it('stays below a solid terrain block, which is 0.72 tall', () => {
    // Categorical separation from TerrainBlocks: terrain is a raised wall
    // that never moves again, the trail is a low field that answers how you
    // are playing. They must not compete for the same read.
    for (let i = 1; i < LONG; i++) {
      if (i <= TRAIL_HEAD_ZONE) continue;
      expect(getTrailHeight(i, LONG)).toBeLessThan(0.72);
    }
  });

  it('never flattens to nothing - the cast shadow is an occupancy cue', () => {
    for (const length of [2, 3, 5, 12, 400]) {
      for (let i = 0; i < length; i++) {
        expect(getTrailHeight(i, length)).toBeGreaterThan(0);
        expect(getTrailHeight(i, length)).toBeLessThanOrEqual(
          TRAIL_HEIGHT_HEAD
        );
      }
    }
  });

  it('vacancy wins where the two zones overlap on a short snake', () => {
    // A segment that is both near the head and about to vacate is about to
    // vacate, and that is the more urgent thing to say.
    const short = 4;
    expect(getTrailHeight(short - 1, short)).toBeCloseTo(TRAIL_HEIGHT_TAIL, 10);
  });
});

describe('getTrailBreathe (the head zone is alive, the trunk is not)', () => {
  it('is exactly 1.0 everywhere past the head zone, at every moment', () => {
    // The standing promise of the instanced body: no time-varying writes on
    // the trunk. A pulse that leaked past the head zone would put motion on
    // every cell of a 400-segment coil.
    for (const t of [0, 0.13, 0.5, 1.7, 9.31]) {
      for (let i = TRAIL_HEAD_ZONE + 1; i < TRAIL_HEAD_ZONE + 40; i++) {
        expect(getTrailBreathe(i, t)).toBe(1);
      }
      expect(getTrailBreathe(0, t)).toBe(1);
    }
  });

  it('decays to exactly 1.0 at the head-zone boundary (no seam)', () => {
    for (const t of [0, 0.4, 2.2]) {
      expect(getTrailBreathe(TRAIL_HEAD_ZONE, t)).toBe(1);
    }
  });

  it('stays inside the declared amplitude', () => {
    for (let step = 0; step < 200; step++) {
      const t = step * 0.017;
      for (let i = 1; i <= TRAIL_HEAD_ZONE; i++) {
        const breathe = getTrailBreathe(i, t);
        expect(breathe).toBeGreaterThanOrEqual(1 - TRAIL_BREATHE_AMPLITUDE);
        expect(breathe).toBeLessThanOrEqual(1 + TRAIL_BREATHE_AMPLITUDE);
      }
    }
  });

  it('actually moves - a decorative constant would be worse than nothing', () => {
    const samples = new Set<number>();
    for (let step = 0; step < 40; step++) {
      samples.add(Number(getTrailBreathe(1, step * 0.05).toFixed(4)));
    }
    expect(samples.size).toBeGreaterThan(5);
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

  it('uses the renderer-local dynasty surface profile', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const profile = getGameMaterialProfile(dynasty).snake;
      const material = getSnakeSegmentMaterial(dynasty, false);
      expect(material.color.getHexString()).toBe(
        new THREE.Color(profile.baseColor).getHexString()
      );
      expect(`#${material.emissive.getHexString()}`).toBe(
        profile.emissiveColor.toLowerCase()
      );
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true);
    }
  });

  it('gives the head a brighter emissive than the body', () => {
    const head = getSnakeSegmentMaterial('COSMIC', true);
    const body = getSnakeSegmentMaterial('COSMIC', false);
    const profile = getGameMaterialProfile('COSMIC').snake;
    expect(head.emissiveIntensity).toBe(profile.headEmissiveIntensity);
    expect(body.emissiveIntensity).toBe(profile.bodyEmissiveIntensity);
    expect(head.emissiveIntensity).toBeGreaterThan(body.emissiveIntensity);
  });

  /**
   * RE-EXPRESSED FOR INK & AMBER. This rule used to be enforced by pinning
   * metalness at or below 0.25 and roughness at or above 0.5 - i.e. by
   * choosing PBR numbers that made the specular lobe too broad and too dim
   * to read as a moving highlight. That was always a defence against a
   * capability the material HAD.
   *
   * The toon material does not have it. There is no specular term for a
   * moving light to race down a 400-cell coil, so "no travelling sparkle" is
   * now structural rather than tuned, and the honest assertion is that the
   * capability is absent - not that its parameters are set conservatively.
   */
  it('cannot sparkle: the body carries no specular response at all', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const head = getSnakeSegmentMaterial(dynasty, true);
      const body = getSnakeSegmentMaterial(dynasty, false);

      for (const material of [head, body]) {
        expect(material).toBeInstanceOf(THREE.MeshToonMaterial);
        // The PBR channels the old pin defended are not merely low, they do
        // not exist on this material.
        expect('metalness' in material).toBe(false);
        expect('roughness' in material).toBe(false);
      }
    }
  });

  it('bands with the board\'s shared three-step ramp, not its own', () => {
    // One gradient map for every drawn object on the board: a per-material
    // ramp would let the snake step at different values than the tile it
    // stands on, which is exactly what an ink-and-toon direction cannot have.
    const ramp = getToonGradientMap();
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      expect(getSnakeSegmentMaterial(dynasty, true).gradientMap).toBe(ramp);
      expect(getSnakeSegmentMaterial(dynasty, false).gradientMap).toBe(ramp);
    }
    expect(ramp.image.width).toBe(3);
    expect(ramp.magFilter).toBe(THREE.NearestFilter);
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

    // RE-EXPRESSED FOR INK & AMBER: each segment is now a fill mesh wearing
    // exactly ONE ink-hull child, so a flat `mesh` count of 2 no longer
    // describes the tree. Asserting the STRUCTURE rather than the total is
    // also the stronger check - it catches a hull that went missing and a
    // second hull that crept in, neither of which a count of 4 would.
    const segments = container.querySelectorAll(':scope > mesh');
    expect(segments).toHaveLength(2);
    expect(segments[0].getAttribute('scale')).toBe(String(HEAD_SIZE));
    expect(segments[1].getAttribute('scale')).toBe(String(BODY_SIZE));
    for (const segment of segments) {
      const hulls = segment.querySelectorAll('mesh');
      expect(hulls).toHaveLength(1);
      // The hull is drawn before the fill it sits behind.
      expect(hulls[0].getAttribute('renderorder')).toBe('-1');
      // Same geometry, so the silhouette it expands is the segment's own.
      expect(hulls[0].getAttribute('geometry')).toBe(
        segment.getAttribute('geometry')
      );
    }
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

    const segments = container.querySelectorAll(':scope > mesh');
    expect(segments).toHaveLength(1);
    expect(segments[0].querySelectorAll('mesh')).toHaveLength(1);
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
    const mesh = container.querySelector(':scope > mesh');
    expect(mesh).not.toBeNull();
    expect(mesh!.getAttribute('scale')).toBe(String(BODY_SIZE));
    // The stand-in wears the same single ink hull as the GLB segment, so the
    // Suspense swap never changes the creature's line.
    expect(mesh!.querySelectorAll('mesh')).toHaveLength(1);
  });
});
