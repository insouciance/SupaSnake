import { render } from '@testing-library/react';
import * as THREE from 'three';
import {
  ARENA_EDGE_WASH_FRAGMENT_SHADER,
  ArenaFloor,
  centerYFromBase,
  createArenaEdgeWashMaterial,
  createArenaSlabGeometry,
  FLOOR_CLEARANCE,
  FLOOR_GRAPHICS_TOP_Y,
} from './ArenaFloor';

describe('arena floor render geometry', () => {
  it('converts a desired base into the centre of centred Three.js geometry', () => {
    expect(centerYFromBase(0.04, 0.9)).toBeCloseTo(0.49, 10);
    expect(
      centerYFromBase(FLOOR_CLEARANCE, 0.7) - 0.7 / 2
    ).toBeCloseTo(FLOOR_CLEARANCE, 10);
    expect(FLOOR_CLEARANCE).toBeGreaterThan(FLOOR_GRAPHICS_TOP_Y);
  });
});

describe('analytic arena edge wash', () => {
  it('uses a resolution-independent board-shaped fragment calculation', () => {
    const material = createArenaEdgeWashMaterial('#35e6ff', 0.5);

    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.toneMapped).toBe(false);
    expect(material.uniforms.uAccent.value.getHexString()).toBe('35e6ff');
    expect(material.uniforms.uStrength.value).toBe(0.5);
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).toContain('abs(vUv * 2.0');
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).toContain('pow(edgeVector.x, 6.0)');
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).toContain('smoothstep');
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).not.toContain('sampler2D');

    material.dispose();
  });

  it('clamps invalid or excessive wash strength', () => {
    const invalid = createArenaEdgeWashMaterial('#ffffff', Number.NaN);
    const excessive = createArenaEdgeWashMaterial('#ffffff', 20);
    expect(invalid.uniforms.uStrength.value).toBe(0);
    expect(excessive.uniforms.uStrength.value).toBe(1.5);
    invalid.dispose();
    excessive.dispose();
  });

  /**
   * RE-EXPRESSED FOR THE SLAB. The arena used to own exactly one GPU resource
   * it had to release - the edge wash - so a count of one was the whole
   * contract. It now builds three per mount, and the honest test is not a
   * bigger number but a statement of WHICH resources are per-mount and which
   * are deliberately shared:
   *
   *   PER MOUNT   the edge wash and the board pass (both parameterised by the
   *               caller's colours), the slab's toon material, and the slab
   *               GEOMETRY, which is built at world size from this arena's
   *               own span and can therefore never be shared.
   *   SHARED      the ink hull material and the toon gradient ramp, which are
   *               parameter-free module singletons like every other pooled
   *               resource in this renderer. Disposing those on unmount would
   *               break the next mount, so they must NOT be counted.
   */
  it('disposes exactly the resources it builds, and leaves the shared pools alone', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    // Spied on Material, not ShaderMaterial: the slab's toon material would
    // slip past a ShaderMaterial-only spy entirely.
    const disposeMaterial = jest.spyOn(THREE.Material.prototype, 'dispose');
    const disposeGeometry = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose');

    const view = render(
      <ArenaFloor accentColor="#35e6ff" edgeWashStrength={0.5} />
    );
    expect(disposeMaterial).not.toHaveBeenCalled();

    const materialsBefore = disposeMaterial.mock.calls.length;
    const geometriesBefore = disposeGeometry.mock.calls.length;
    view.unmount();

    // Edge wash + board pass + slab toon. The module-scope ink hull and the
    // shared gradient ramp are not among them.
    expect(disposeMaterial.mock.calls.length - materialsBefore).toBe(3);
    // The slab body only. `planeGeometry` elements are owned by R3F.
    expect(disposeGeometry.mock.calls.length - geometriesBefore).toBe(1);

    // The shared pools survive: a second mount must still have them.
    const second = render(
      <ArenaFloor accentColor="#35e6ff" edgeWashStrength={0.5} />
    );
    expect(second.container.querySelectorAll('mesh').length).toBeGreaterThan(0);
    second.unmount();

    disposeMaterial.mockRestore();
    disposeGeometry.mockRestore();
    consoleError.mockRestore();
  });

  it('builds the slab at world size so its hull expands evenly on every face', () => {
    // A unit box scaled to 22.35 x 0.95 x 22.35 would carry a chamfer 23x
    // wider along X than along Y, and a non-unit world scale would make the
    // shared ink hull expand by different amounts per axis. Building at size
    // is what pins both.
    const span = 22.35;
    const geometry = createArenaSlabGeometry(span, 0.95, 0.16, {
      face: '#16202a',
      bevel: '#4a5d6e',
      side: '#334252',
      base: '#070c12',
    });

    const position = geometry.getAttribute('position');
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      maxX = Math.max(maxX, position.getX(i));
      minY = Math.min(minY, position.getY(i));
      maxY = Math.max(maxY, position.getY(i));
    }
    expect(maxX).toBeCloseTo(span / 2, 6);
    // The play surface is EXACTLY y = 0; the body hangs below it.
    expect(maxY).toBeCloseTo(0, 10);
    expect(minY).toBeCloseTo(-0.95, 6);

    // Ten quads: top, four chamfers, four sides, underside.
    expect(position.count).toBe(10 * 6);
    // Face tone rides a vertex colour, so the whole tile is one draw.
    expect(geometry.getAttribute('color')).not.toBeUndefined();

    geometry.dispose();
  });
});
