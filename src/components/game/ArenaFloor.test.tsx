import { render } from '@testing-library/react';
import * as THREE from 'three';
import {
  ARENA_EDGE_WASH_FRAGMENT_SHADER,
  ArenaFloor,
  centerYFromBase,
  createArenaEdgeWashMaterial,
  FLOOR_CLEARANCE,
  FLOOR_GRAPHICS_TOP_Y,
} from './ArenaFloor';

describe('arena floor render geometry', () => {
  it('converts a desired base into the centre of centred Three.js geometry', () => {
    expect(centerYFromBase(0.04, 0.9)).toBeCloseTo(0.49, 10);
    expect(
      centerYFromBase(FLOOR_CLEARANCE, 0.58) - 0.58 / 2
    ).toBeCloseTo(FLOOR_CLEARANCE, 10);
    expect(FLOOR_CLEARANCE).toBeGreaterThan(FLOOR_GRAPHICS_TOP_Y);
  });
});

describe('analytic arena edge wash', () => {
  it('uses a resolution-independent radial fragment calculation', () => {
    const material = createArenaEdgeWashMaterial('#35e6ff', 0.5);

    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.toneMapped).toBe(false);
    expect(material.uniforms.uAccent.value.getHexString()).toBe('35e6ff');
    expect(material.uniforms.uStrength.value).toBe(0.5);
    expect(ARENA_EDGE_WASH_FRAGMENT_SHADER).toContain(
      'length(vUv - vec2(0.5))'
    );
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

  it('disposes its GPU material when the arena unmounts', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const dispose = jest.spyOn(THREE.ShaderMaterial.prototype, 'dispose');

    const view = render(
      <ArenaFloor accentColor="#35e6ff" edgeWashStrength={0.5} />
    );
    expect(dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);

    dispose.mockRestore();
    consoleError.mockRestore();
  });
});
