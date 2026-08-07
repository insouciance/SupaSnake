/**
 * THE STYLE GUIDE AS ASSERTIONS.
 *
 * Every test here restates a clause of the character sheet, not a constant of
 * this module. A test that only says `expect(HEAD_SIZE).toBe(0.98)` catches
 * nothing a diff would not; these say what the number has to be TRUE OF, so
 * the next person to retune the concept finds out whether they broke the
 * guide or merely changed a value.
 *
 * ROUND 2 SUPERSEDES THREE OF ROUND 1'S CLAUSES, and each is re-argued at the
 * test that used to carry it rather than deleted quietly:
 *
 *   - "chunkier than shipped at every fusion level" is gone. It was a proxy
 *     for "cubic & chunky" and it measured the wrong thing: the shipped
 *     footprint is one axis of a slab, and beating it on that one axis is how
 *     round 1 ended up with a 0.82 x 0.70 x 0.82 body. The guide's clause is
 *     TRUE CUBES, CLEARLY SEPARATED, and that is what is asserted now.
 *
 *   - "the packed level keeps a hairline seam (< 0.1)" is INVERTED. The guide
 *     says body cubes are "CLEARLY SEPARATED from neighbours" and the sheet
 *     draws a black gap of about 15% of a cube at its tightest. A hairline
 *     seam is the continuous tube the guide forbids. The fusion readout does
 *     not need a merge to survive - it rides on the ORDERING of the gaps.
 *
 *   - the light-driven ramp is gone entirely. Its tests went with it, replaced
 *     by tests that the tone is a function of FACE ORIENTATION and of nothing
 *     else - which is the same guide clause ("colours not contaminated by
 *     environmental lighting") asserted where it can actually fail.
 *
 * ROUND 3 SUPERSEDES TWO MORE, against the owner's own REFERENCE BLOCK - a
 * single gold cube he drew the target read on. Same treatment: re-argued here
 * rather than deleted quietly.
 *
 *   - "the cuff" is gone, and with it every clause about where it sits, how it
 *     is drawn and which parts pay for it. The sheet does draw one; the
 *     reference block does not, and on a body cube at the gameplay camera the
 *     cuff's dark seam reads as a GROOVE CARVED INTO THE CUBE - the artefact
 *     the owner boxed in red. The describe block below now asserts the
 *     opposite, and asserts it at the shader, which is the only place a cuff
 *     could come back from.
 *
 *   - "the bright line is a substantial OUTER portion of the bevel" is now
 *     "the bright line is the WHOLE bevel". Round 2's boundary sat two fifths
 *     of the way across the chamfer, which is a boundary in the middle of a
 *     surface, and the owner's word for the result was marshmallow. The clause
 *     it was serving - "bright graphic highlights on top-facing edges" - is
 *     better served by a facet than by part of one.
 */

import * as THREE from 'three';
import {
  applyFaceKeyedShading,
  applySnakeFaceShading,
  BRAID_TONES,
  FLAT_TONES,
  GUIDE_PALETTE,
  NINETIES_SHIPPED_STYLE,
  resolveCubeEdge,
  SHADE_TONES,
  SNAKE_FACE_CUTS,
  SNAKE_FACE_TONES,
  SNAKE_STYLE,
  SNAKE_STYLE_PROFILE,
  SNAKE_STYLE_PROFILES,
  TONE_AWAY,
  TONE_DOWN,
  TONE_RIM,
  TONE_RIM_LIFT,
  TONE_SIDE,
  TONE_TOP,
  type SnakeFaceToneSet,
  type SnakeStyleId,
  type SnakeStyleProfile,
} from './snake90s';
import { DYNASTY_SCREEN_TOKENS } from './gameScreenTokens';
import { getGameMaterialProfile } from './gameMaterialProfiles';
import { SNAKE_COSMETICS } from '@/components/home/SnakeCosmetics';
import { COSMETIC_ANCHORS } from '@/components/home/SnakeCosmetics';
import { TRAIL_HEAD_ZONE, TRAIL_VACANCY_TICKS } from '../SnakeModel';

const CONCEPT_STYLES: SnakeStyleId[] = ['nineties', 'ninetiesGuide'];
const ALL_STYLES: SnakeStyleId[] = ['classic', ...CONCEPT_STYLES];

const classic = SNAKE_STYLE_PROFILES.classic;

function concept(id: SnakeStyleId): SnakeStyleProfile {
  return SNAKE_STYLE_PROFILES[id];
}

/** sRGB -> linear. The space the face tints actually multiply in. */
function toLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * Parsed by hand rather than through `THREE.Color`: colour management is a
 * global with a renderer-dependent default, and this test is about the
 * arithmetic of the tones, not about which space three happened to be in.
 */
function linearRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [
    toLinear(((value >> 16) & 255) / 255),
    toLinear(((value >> 8) & 255) / 255),
    toLinear((value & 255) / 255),
  ];
}

function luminance([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function tinted(
  base: readonly [number, number, number],
  tint: readonly [number, number, number]
): [number, number, number] {
  return [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]];
}

/** HSV saturation of a linear triple. 0 = grey. */
function saturation(rgb: readonly [number, number, number]): number {
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Compile a patched material against the STOCK toon shader and hand back the
 * two sources. This is what makes the shading claims testable at all: the
 * patch is text substitution on three's own chunks, so the only honest way to
 * assert what it produces is to produce it.
 */
function compile(material: THREE.MeshToonMaterial): {
  vertex: string;
  fragment: string;
  uniforms: Record<string, { value: unknown }>;
} {
  const shader = {
    vertexShader: THREE.ShaderLib.toon.vertexShader,
    fragmentShader: THREE.ShaderLib.toon.fragmentShader,
    uniforms: {} as Record<string, { value: unknown }>,
    name: 'toon',
    defines: {},
  };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as unknown as THREE.WebGLRenderer
  );
  return {
    vertex: shader.vertexShader,
    fragment: shader.fragmentShader,
    uniforms: shader.uniforms,
  };
}

/**
 * THE SWITCH.
 *
 * Round 3's concept resolved the style from a dev-only query key alone, and
 * that was correct for a branch nobody could deploy. 90S-A moved the decision
 * to `NEXT_PUBLIC_NINETIES_COMPOSITION`, so what a player gets is now a
 * property of the RELEASE and the query key is only ever a comparison tool.
 * The full flag contract - both legs, both production refusals, the rollback
 * profile - is asserted in `src/lib/features/ninetiesComposition.test.ts`,
 * which is where a reader looking for "what does each leg ship" will go. What
 * stays here is the clause this module owns: which of the three the RATIFIED
 * style is, and why.
 */
describe('snake90s: the switch', () => {
  it('ships the guide palette, because the character law picks it', () => {
    // Section 4: "Primary Supa orange/yellow-orange ... Local colors stay
    // recognizable under every board theme (no heavy environmental
    // contamination)." A snake whose hue follows its dynasty is a snake whose
    // local colour IS its environment, so `nineties` cannot be the shipped
    // one - it is the alternative the ruling was taken against.
    expect(NINETIES_SHIPPED_STYLE).toBe('ninetiesGuide');
    const shipped = concept(NINETIES_SHIPPED_STYLE);
    expect(shipped.forcedHeadBaseColor).toBe(GUIDE_PALETTE.highlight);
    expect(shipped.forcedBodyBaseColor).toBe(GUIDE_PALETTE.bodyHighlight);
    expect(concept('nineties').forcedHeadBaseColor).toBeNull();
  });

  it('keeps the two 90s variants identical apart from that palette', () => {
    // The rejected variant is kept, so it has to stay honest: if it ever
    // diverged in shape, ink or cosmetics it would stop being the comparison
    // the ruling was made against and start being a third design.
    const { forcedHeadBaseColor: _h1, forcedBodyBaseColor: _b1,
      forcedEmissiveColor: _e1, id: _i1, ...hue } = concept('nineties');
    const { forcedHeadBaseColor: _h2, forcedBodyBaseColor: _b2,
      forcedEmissiveColor: _e2, id: _i2, ...guide } =
      concept(NINETIES_SHIPPED_STYLE);
    expect(hue).toEqual(guide);
  });

  it('resolves to a real profile, whichever leg this build is', () => {
    // `SNAKE_STYLE` is read at module load from the flag; jest runs with it
    // absent, so this asserts the wiring rather than a value - the resolved
    // profile must be the entry for the resolved id, always.
    expect(SNAKE_STYLE_PROFILES[SNAKE_STYLE].id).toBe(SNAKE_STYLE);
    expect(SNAKE_STYLE_PROFILE).toBe(SNAKE_STYLE_PROFILES[SNAKE_STYLE]);
  });
});

describe('snake90s: shape language - "true cubes, clearly separated"', () => {
  it.each(ALL_STYLES)(
    '%s keeps the head inside one grid cell, so it never paints a tile it does not occupy',
    (id) => {
      expect(SNAKE_STYLE_PROFILES[id].headSize).toBeGreaterThan(0);
      expect(SNAKE_STYLE_PROFILES[id].headSize).toBeLessThan(1);
    }
  );

  it.each(CONCEPT_STYLES)(
    '%s reads head-first: the head is oversized against the settled body it leads',
    (id) => {
      const profile = concept(id);
      const bodyEdge = profile.trailFootprint[1];
      const ratio = profile.headSize / bodyEdge;
      expect(ratio).toBeGreaterThanOrEqual(1.15);
      expect(ratio).toBeLessThanOrEqual(1.3);
      // And it is a bigger step than the shipped snake takes.
      expect(ratio).toBeGreaterThan(classic.headSize / classic.trailFootprint[1]);
    }
  );

  /**
   * The clause round 1 could not satisfy: "Body: true cubes (width = height =
   * depth) ... never flattened into tiles or slabs."
   *
   * The renderer proves this by construction - one edge written into all three
   * components of the scale - so what is assertable here is that the concept
   * HAS a cube law and the shipped style does not, and that the law's inputs
   * can never produce a non-cube.
   */
  it.each(CONCEPT_STYLES)('%s is governed by a cube law; classic is not', (id) => {
    expect(concept(id).cube).not.toBeNull();
    expect(classic.cube).toBeNull();
  });

  it.each(CONCEPT_STYLES)(
    '%s never lets any cell close the gap to its neighbour, in ANY state',
    (id) => {
      const profile = concept(id);
      const cube = profile.cube!;
      // Every state the renderer can put a cell in: any fusion level, anywhere
      // in the head zone, anywhere in the vacancy window, on any snake length.
      for (const level of [0, 1, 2]) {
        for (const length of [2, 6, 12, 80, 400]) {
          for (let index = 0; index < Math.min(length, 24); index += 1) {
            const edge = resolveCubeEdge(
              cube,
              profile.trailFootprint[level],
              index,
              length,
              TRAIL_HEAD_ZONE,
              TRAIL_VACANCY_TICKS
            );
            // A cube, in a cell of width 1, with a gap left over.
            expect(edge).toBeGreaterThan(0);
            expect(edge).toBeLessThanOrEqual(cube.maxEdge);
            expect(1 - edge).toBeGreaterThan(0.1);
          }
        }
      }
    }
  );

  it.each(CONCEPT_STYLES)(
    '%s spaces a packed coil the way the sheet draws it - a black gap, not a seam',
    (id) => {
      const [free, mid, packed] = concept(id).trailFootprint;
      // "0 neighbours = discrete voxels with visible gaps"
      expect(1 - free).toBeGreaterThan(0.25);
      // The sheet's own spacing between adjacent body cubes is about 15% of a
      // cube. THIS INVERTS ROUND 1: a hairline seam is the continuous tube the
      // guide forbids ("never flattened into tiles", "CLEARLY SEPARATED").
      expect(1 - packed).toBeGreaterThan(0.1);
      expect(1 - packed).toBeLessThan(0.25);
      // And the fusion readout survives the change intact, because it never
      // rode on the merge - it rides on the ORDERING of the gaps.
      expect(free).toBeLessThan(mid);
      expect(mid).toBeLessThan(packed);
    }
  );

  it('classic keeps its own footprint law untouched', () => {
    // The concept is additive. Whatever round 2 argued, the shipped creature is
    // the shipped creature, seam included.
    const [free, , packed] = classic.trailFootprint;
    expect(1 - free).toBeGreaterThan(0.25);
    expect(1 - packed).toBeGreaterThan(0);
    expect(1 - packed).toBeLessThan(0.15);
  });

  it.each(CONCEPT_STYLES)(
    '%s still says "this tile frees up soon" and "this cell is packed"',
    (id) => {
      const profile = concept(id);
      const cube = profile.cube!;
      const packed = profile.trailFootprint[2];
      const free = profile.trailFootprint[0];
      const LONG = 60;
      const edge = (index: number, base: number) =>
        resolveCubeEdge(
          cube,
          base,
          index,
          LONG,
          TRAIL_HEAD_ZONE,
          TRAIL_VACANCY_TICKS
        );

      // VACANCY: the last cells shrink, monotonically, and the tip is small
      // enough to be unmistakable but big enough to still be a cube.
      const settled = edge(30, free);
      for (let i = LONG - TRAIL_VACANCY_TICKS + 1; i < LONG; i += 1) {
        expect(edge(i, free)).toBeLessThan(edge(i - 1, free));
      }
      expect(edge(LONG - 1, free)).toBeLessThan(settled * 0.75);
      expect(edge(LONG - 1, free)).toBeGreaterThan(0.3);

      // FUSION: a packed cell is bigger than a free one at the same index.
      expect(edge(30, packed)).toBeGreaterThan(edge(30, free));

      // HEAD ZONE: the front of the creature stands proud of the settled trail
      // and eases back into it, rather than stepping.
      expect(edge(0, free)).toBeGreaterThan(edge(3, free));
      expect(edge(3, free)).toBeGreaterThan(edge(TRAIL_HEAD_ZONE, free));
      expect(edge(TRAIL_HEAD_ZONE, free)).toBeCloseTo(free, 10);
    }
  );

  it.each(ALL_STYLES)('%s bevels stay a legal chamfer on a unit cube', (id) => {
    const profile = SNAKE_STYLE_PROFILES[id];
    for (const radius of [profile.headBevelRadius, profile.bodyBevelRadius]) {
      expect(radius).toBeGreaterThan(0);
      expect(radius).toBeLessThan(0.499);
    }
  });

  it.each(CONCEPT_STYLES)(
    '%s draws a bolder silhouette than shipped - bounded by the gap, not by a percentage',
    (id) => {
      const profile = concept(id);
      expect(profile.inkHullWidth).toBeGreaterThan(classic.inkHullWidth);
      // ROUND 2 replaces round 1's `< classic * 1.5`, which was a number with
      // no meaning. The real failure mode of a bolder line is that the ink on
      // two neighbouring cells meets and the outline stops describing a
      // silhouette - so the bound is the gap it must not close.
      const freeGap = 1 - profile.trailFootprint[0];
      expect(profile.inkHullWidth * 2).toBeLessThan(freeGap);
      // Even at the tightest packing it may not swallow the separation whole.
      const packedGap = 1 - profile.trailFootprint[2];
      expect(profile.inkHullWidth).toBeLessThan(packedGap);
    }
  );
});

describe('snake90s: cel shading - three tones, keyed to the FACE', () => {
  it('reproduces the guide swatches from one base colour', () => {
    const base = linearRgb(GUIDE_PALETTE.highlight);
    const midTarget = linearRgb(GUIDE_PALETTE.midtone);
    const shadowTarget = linearRgb(GUIDE_PALETTE.shadow);

    // The flat TOP face is the HIGHLIGHT swatch itself. The tints only ever
    // darken, which is why the material's colour is the highlight and not the
    // mid tone - and why the top band is a pass-through.
    tinted(base, TONE_TOP).forEach((channel, i) => {
      expect(channel).toBeCloseTo(base[i], 10);
    });
    tinted(base, TONE_SIDE).forEach((channel, i) => {
      expect(Math.abs(channel - midTarget[i])).toBeLessThan(0.02);
    });
    tinted(base, TONE_DOWN).forEach((channel, i) => {
      expect(Math.abs(channel - shadowTarget[i])).toBeLessThan(0.02);
    });
  });

  it('lifts the bevel ABOVE the swatch, because the sheet does', () => {
    // Measured off the sheet: a body cube's top face is the highlight and the
    // chamfer around it is brighter still. There is nothing above 1.0 to
    // multiply toward, so the rim is the only band that adds rather than
    // multiplies - and it adds WARM, so a dynasty keeps its own hue under a
    // key light instead of washing toward white.
    const base = linearRgb(GUIDE_PALETTE.highlight);
    const rim = base.map((c, i) => c * TONE_RIM[i] + TONE_RIM_LIFT[i]);
    expect(luminance(rim as [number, number, number])).toBeGreaterThan(
      luminance(tinted(base, TONE_TOP))
    );
    expect(TONE_RIM_LIFT[0]).toBeGreaterThan(TONE_RIM_LIFT[1]);
    expect(TONE_RIM_LIFT[1]).toBeGreaterThan(TONE_RIM_LIFT[2]);
    // A lift, not a flare: the bevel is a line on the character, not a light
    // source, and the composer's bloom budget is not the snake's to spend.
    expect(luminance(TONE_RIM_LIFT)).toBeLessThan(0.2);

    // On every dynasty it stays inside the hue it lifted.
    for (const dynasty of ['PRIMAL', 'CYBER', 'COSMIC'] as const) {
      const hue = linearRgb(DYNASTY_SCREEN_TOKENS[dynasty].snake);
      const lifted = hue.map((c, i) => c + TONE_RIM_LIFT[i]) as [
        number,
        number,
        number,
      ];
      expect(saturation(lifted)).toBeGreaterThan(0.35);
    }
  });

  it('steps DOWN monotonically from the lit edge to the underside', () => {
    const base = linearRgb(GUIDE_PALETTE.highlight);
    const band = (
      mul: readonly [number, number, number],
      add: readonly [number, number, number] = [0, 0, 0]
    ) =>
      luminance(
        tinted(base, mul).map((c, i) => c + add[i]) as [number, number, number]
      );
    const bands = [
      band(TONE_RIM, TONE_RIM_LIFT),
      band(TONE_TOP),
      band(TONE_SIDE),
      band(TONE_AWAY),
      band(TONE_DOWN),
    ];
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]).toBeLessThan(bands[i - 1]);
    }
    // HIGH CONTRAST: the shadow is a fraction of the highlight, not a nudge.
    expect(luminance(TONE_SIDE)).toBeLessThan(0.7);
    expect(luminance(TONE_DOWN)).toBeLessThan(0.25);
    expect(luminance(TONE_DOWN)).toBeGreaterThan(0.02); // a shadow, not a hole
  });

  it('SHADOWS ARE DARK ORANGE, NOT GREY - the tint is warm, so it cannot be neutral', () => {
    // A neutral tint has equal channels. The guide forbids exactly that.
    expect(TONE_DOWN[0]).toBeGreaterThan(TONE_DOWN[1] * 2);
    expect(TONE_DOWN[0]).toBeGreaterThan(TONE_DOWN[2] * 2);
    expect(TONE_SIDE[0]).toBeGreaterThan(TONE_SIDE[1]);
    expect(TONE_SIDE[1]).toBeGreaterThan(TONE_SIDE[2]);
    expect(TONE_AWAY[0]).toBeGreaterThan(TONE_AWAY[1]);
  });

  it.each(['PRIMAL', 'CYBER', 'COSMIC'] as const)(
    "keeps %s's shadow deep AND vivid - the guide's rule generalised past orange",
    (dynasty) => {
      const base = linearRgb(DYNASTY_SCREEN_TOKENS[dynasty].snake);
      const shadow = tinted(base, TONE_DOWN);
      // Deep: a real shadow band, not a nudge.
      expect(luminance(shadow)).toBeLessThan(luminance(base) * 0.3);
      // Vivid: "shadows are dark ORANGE" is a rule against grey, and grey is
      // what a neutral darkening of a saturated hue perceptually becomes.
      expect(saturation(shadow)).toBeGreaterThan(0.6);
      expect(saturation(shadow)).toBeGreaterThan(saturation(base) * 0.9);
    }
  );

  it('gains saturation wherever the hue has headroom - which grey darkening never does', () => {
    // CYBER is excluded on purpose: it starts at ~0.97 saturation, so there
    // is nothing left to gain. The claim is about the tint's direction, and
    // a hue already at the gamut edge cannot demonstrate direction.
    for (const dynasty of ['PRIMAL', 'COSMIC'] as const) {
      const base = linearRgb(DYNASTY_SCREEN_TOKENS[dynasty].snake);
      expect(saturation(tinted(base, TONE_DOWN))).toBeGreaterThan(
        saturation(base)
      );
    }
    const guide = linearRgb(GUIDE_PALETTE.highlight);
    expect(saturation(tinted(guide, TONE_DOWN))).toBeGreaterThan(
      saturation(guide)
    );
    // The control: a NEUTRAL tint of the same luminance leaves saturation
    // exactly where it found it. The warmth is what does the work.
    const neutral = luminance(TONE_DOWN);
    expect(
      saturation(tinted(guide, [neutral, neutral, neutral]))
    ).toBeCloseTo(saturation(guide), 6);
  });

  /**
   * THE ROUND-2 CLAUSE, and the one that can actually fail silently.
   *
   * "Local colours stay recognisable under every board theme - no heavy
   * environmental contamination." Round 1 tuned an indirect-light scalar toward
   * that and could only ever get close. This asserts the structural version:
   * after the patch, NOTHING the arena's rig computes reaches the output.
   */
  it('answers to the surface and to nothing else - no light reaches the output', () => {
    const material = new THREE.MeshToonMaterial();
    applyFaceKeyedShading(material, {
      tones: SNAKE_FACE_TONES,
      band: null,
      cacheKey: 'test',
    });
    const { fragment } = compile(material);

    // Every accumulator the arena's lights, fill and shadow map write into is
    // discarded, and the replacement is a function of the surface normal.
    expect(fragment).toContain('reflectedLight.directDiffuse = vec3( 0.0 );');
    expect(fragment).toContain('reflectedLight.directSpecular = vec3( 0.0 );');
    expect(fragment).toContain('reflectedLight.indirectSpecular = vec3( 0.0 );');
    expect(fragment).toContain(
      'reflectedLight.indirectDiffuse = diffuseColor.rgb * toneMul + toneAdd;'
    );
    // ...and it happens AFTER three has finished accumulating, or the chunks
    // downstream would simply add the lights back on top.
    expect(fragment.indexOf('#include <lights_fragment_end>')).toBeLessThan(
      fragment.indexOf('reflectedLight.directDiffuse = vec3( 0.0 );')
    );
    // The per-instance colour still multiplies in, so the fusion tone and the
    // strain band are untouched by any of this.
    expect(fragment).toContain('diffuseColor.rgb *');
  });

  it('keys the tone to the WORLD normal, so the head cannot spin its own lighting', () => {
    const material = new THREE.MeshToonMaterial();
    applyFaceKeyedShading(material, {
      tones: SNAKE_FACE_TONES,
      band: null,
      cacheKey: 'test',
    });
    const { vertex, fragment } = compile(material);
    // Object space would rotate with the head's damped yaw; view space would
    // rotate with the camera. The world normal is the only one that leaves a
    // painted character painted.
    expect(vertex).toContain('vSnakeWorldNormal = vec3(');
    expect(vertex).toContain('dot( viewMatrix[ 0 ].xyz, transformedNormal )');
    expect(fragment).toContain('vec3 sn = normalize( vSnakeWorldNormal );');
  });

  /**
   * "Bright graphic highlights on top-facing EDGES" and "substantially darker
   * shadow faces", expressed as the boundaries the shader actually branches on.
   *
   * The body geometry is a unit rounded box at one chamfer segment, so every
   * face is a flat centre inside a ring of analytic-normal bevel quads. These
   * three numbers decide which band each of those lands in.
   */
  it('puts the bright line on the bevel and leaves the flat faces alone', () => {
    const edgeness = (n: readonly [number, number, number]) =>
      1 - Math.max(Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2]));

    // A flat face is never a rim: the sheet's highlight is an EDGE, not a face.
    expect(edgeness([0, 1, 0])).toBeLessThan(SNAKE_FACE_CUTS.rim);
    expect(edgeness([0, 0, 1])).toBeLessThan(SNAKE_FACE_CUTS.rim);
    // A 45-degree edge and a corner both are.
    const r = Math.SQRT1_2;
    expect(edgeness([0, r, r])).toBeGreaterThan(SNAKE_FACE_CUTS.rim);
    expect(edgeness([r, 0, r])).toBeGreaterThan(SNAKE_FACE_CUTS.rim);
    const c = 1 / Math.sqrt(3);
    expect(edgeness([c, c, c])).toBeGreaterThan(SNAKE_FACE_CUTS.rim);

    /**
     * ROUND 3: IT IS THE WHOLE FACET, not a portion of one.
     *
     * The ring quad interpolates its normal from the flat face's to the
     * 45-degree edge's, so walking that interpolation says where the boundary
     * between the face's tone and the highlight actually falls. Round 1 put it
     * at four fifths of the way out - a mark under a pixel wide, which never
     * drew. Round 2 put it at two fifths, which drew and which the owner
     * called marshmallow, because a chamfer whose inner half wears the flat
     * face's tone reads as a soft roll rather than as a plane.
     *
     * The target is his reference block: the highlight IS the chamfer, edge to
     * edge, with a straight hard boundary where the geometry changes. So the
     * boundary has to sit against the flat face - and still not ON it, which
     * is the second bound: a cut of zero would let interpolator noise on a
     * flat quad's four identical normals flip an entire face to the highlight.
     */
    const ringNormalAt = (t: number): [number, number, number] => {
      const n: [number, number, number] = [0, 1 - 0.2929 * t, 0.7071 * t];
      const len = Math.hypot(...n);
      return [n[0] / len, n[1] / len, n[2] / len];
    };
    let boundary = 1;
    for (let t = 0; t <= 1; t += 0.001) {
      if (edgeness(ringNormalAt(t)) >= SNAKE_FACE_CUTS.rim) {
        boundary = t;
        break;
      }
    }
    expect(1 - boundary).toBeGreaterThan(0.8); // essentially the whole facet
    expect(boundary).toBeGreaterThan(0); // but never the flat face itself
    // And the margin against a flat face's own interpolation error is orders
    // of magnitude, not a hair: that is what the cut being non-zero buys.
    expect(SNAKE_FACE_CUTS.rim).toBeGreaterThan(1e-4);
  });

  /**
   * THE RIM'S FLOOR IS ITS OWN - split out of `down` at round 3, and it had to
   * be. While the highlight covered only the outer two fifths of a chamfer,
   * the two cuts could share a number harmlessly. Widening the highlight to
   * the whole facet widens what a shared floor would also catch: the inner
   * part of the BOTTOM ring of every vertical face, which is tilted downward
   * and edge-like and would have taken a bright band along the bottom of every
   * cube - the exact inverse of the dark under-edge the sheet draws.
   */
  it('never lights an under-bevel - the sheet gives the underside no highlight', () => {
    const edgeness = (n: readonly [number, number, number]) =>
      1 - Math.max(Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2]));
    const r = Math.SQRT1_2;
    // A downward 45-degree chamfer is edge-like...
    expect(1 - Math.max(0, r, r)).toBeGreaterThan(SNAKE_FACE_CUTS.rim);
    // ...but it is below the rim's floor, and the rim branch is gated on that.
    expect(-r).toBeLessThan(SNAKE_FACE_CUTS.rimFloor);

    /**
     * Walk the bottom ring of a vertical face the same way the top one was
     * walked. Every point on it that is edge-like enough to reach the rim
     * branch has to fail the floor - for the whole ring, not for most of it.
     */
    const bottomRingNormalAt = (t: number): [number, number, number] => {
      const n: [number, number, number] = [1 - 0.2929 * t, -0.7071 * t, 0];
      const len = Math.hypot(...n);
      return [n[0] / len, n[1] / len, n[2] / len];
    };
    for (let t = 0; t <= 1; t += 0.005) {
      const n = bottomRingNormalAt(t);
      const isRim =
        edgeness(n) > SNAKE_FACE_CUTS.rim && n[1] > SNAKE_FACE_CUTS.rimFloor;
      expect(isRim).toBe(false);
    }

    // A VERTICAL corner chamfer is level, and the sheet does highlight it -
    // so the floor must sit below zero, not at it.
    expect(SNAKE_FACE_CUTS.rimFloor).toBeLessThan(0);
    expect(0).toBeGreaterThan(SNAKE_FACE_CUTS.rimFloor);

    // The down cut keeps its own job: it catches the OUTER bottom ring of
    // every vertical face, which is what gives each cube its dark under-edge.
    expect(SNAKE_FACE_CUTS.down).toBeGreaterThan(-0.5);
    expect(SNAKE_FACE_CUTS.down).toBeLessThan(SNAKE_FACE_CUTS.rimFloor);
    // A flat top face clears the top cut; a vertical face does not.
    expect(1).toBeGreaterThan(SNAKE_FACE_CUTS.top);
    expect(0).toBeLessThan(SNAKE_FACE_CUTS.top);
  });

  it('has a CLEAR LIGHT DIRECTION - a constant azimuth, not a lamp', () => {
    const [kx, kz] = SNAKE_FACE_CUTS.key;
    expect(Math.hypot(kx, kz)).toBeCloseTo(1, 6);
    // Exactly two of the four vertical faces take the mid tone and two take the
    // deeper step: a 3/4 read, which is how every pose on the sheet is drawn.
    const faces: [number, number][] = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    const lit = faces.filter(([x, z]) => x * kx + z * kz >= 0);
    expect(lit).toHaveLength(2);
  });

  it('is inert under the shipped style', () => {
    const material = new THREE.MeshToonMaterial();
    const before = material.onBeforeCompile;
    applySnakeFaceShading(material, { role: 'body', cacheKey: 'x' });
    expect(material.onBeforeCompile).toBe(before);
  });
});

describe('snake90s: MADE TO POP - the head leads', () => {
  /**
   * The regression this exists to prevent: cutting emissive by one scalar
   * preserves the head/body RATIO perfectly and destroys the head's primacy,
   * because the eye reads the GAP. Every assertion here is about the gap.
   */
  const DYNASTIES = ['CYBER', 'PRIMAL', 'COSMIC'] as const;

  function shipped(dynasty: (typeof DYNASTIES)[number]) {
    const snake = getGameMaterialProfile(dynasty).snake;
    return { head: snake.headEmissiveIntensity, body: snake.bodyEmissiveIntensity };
  }

  it.each(CONCEPT_STYLES)(
    '%s keeps the head brighter than the trunk by the SHIPPED margin, not the shipped ratio',
    (id) => {
      const profile = concept(id);
      for (const dynasty of DYNASTIES) {
        const { head, body } = shipped(dynasty);
        const gap =
          head * profile.headEmissiveScale - body * profile.bodyEmissiveScale;
        // Within a couple of percent of the creature the player already knows.
        expect(gap).toBeCloseTo(head - body, 1);
      }
    }
  );

  it.each(CONCEPT_STYLES)(
    '%s still reads DRAWN - the head pays a real price to the cel treatment',
    (id) => {
      const profile = concept(id);
      // Emissive is the one term that is identical on every face, so it is the
      // one term that can still flatten an authored three-tone. It is cut...
      expect(profile.headEmissiveScale).toBeLessThan(0.8);
      expect(profile.bodyEmissiveScale).toBeLessThan(0.4);
      // ...but not by the trunk's cut, which is what collapsed the gap.
      expect(profile.headEmissiveScale).toBeGreaterThan(
        profile.bodyEmissiveScale * 2
      );
    }
  );

  it('classic pays nothing at all', () => {
    expect(classic.headEmissiveScale).toBe(1);
    expect(classic.bodyEmissiveScale).toBe(1);
  });

  it('the guide draws the head a value step above the body', () => {
    const guide = concept('ninetiesGuide');
    expect(guide.forcedHeadBaseColor).toBe(GUIDE_PALETTE.highlight);
    expect(guide.forcedBodyBaseColor).toBe(GUIDE_PALETTE.bodyHighlight);
    // A value step, in the direction the sheet draws it.
    expect(
      luminance(linearRgb(guide.forcedHeadBaseColor!))
    ).toBeGreaterThan(luminance(linearRgb(guide.forcedBodyBaseColor!)));

    // ROUND 2: the body's BASE is a highlight-class colour, not the mid tone.
    // Round 1 put the body on the mid swatch, which was right about the value
    // step and wrong about where it lives - under face-keyed shading a mid-tone
    // base paints the body's TOP faces orange, where the sheet paints them
    // yellow. The mid tone is what the SIDE faces resolve to, and that is
    // asserted rather than assumed:
    const bodySide = tinted(linearRgb(guide.forcedBodyBaseColor!), TONE_SIDE);
    const midSwatch = linearRgb(GUIDE_PALETTE.midtone);
    expect(luminance(bodySide)).toBeLessThan(luminance(midSwatch) * 1.15);
    expect(saturation(bodySide)).toBeGreaterThan(0.9);
  });

  it('resolves head and body to different swatches under the guide palette only', () => {
    // The treatment-only variant must leave every dynasty its own hue on BOTH
    // ends - that is the whole difference between the two concept styles.
    const treatment = concept('nineties');
    expect(treatment.forcedHeadBaseColor).toBeNull();
    expect(treatment.forcedBodyBaseColor).toBeNull();
    expect(classic.forcedHeadBaseColor).toBeNull();
    expect(classic.forcedBodyBaseColor).toBeNull();
  });
});

/**
 * THE CUFF IS GONE - owner ruling, round 3, from his reference block.
 *
 * This block used to assert the cuff's seat, its two lines and which parts
 * paid for them. It now asserts the opposite, because "no stripe" is not the
 * absence of a decision - it is the decision, and it can be undone by accident
 * in exactly one place: the shader. So the assertions are made THERE rather
 * than on a profile field that no longer exists, which is the only form of
 * them that could ever fail.
 */
describe('snake90s: no cuff - the reference block carries no stripe', () => {
  it.each(CONCEPT_STYLES)('%s draws no Y-keyed mark on a segment', (id) => {
    const profile = concept(id);
    // The profile has nowhere left to put one.
    expect('band' in profile).toBe(false);
    expect('headBand' in profile).toBe(false);
  });

  it('compiles no band uniform and no absolute tint override', () => {
    const material = new THREE.MeshToonMaterial();
    applyFaceKeyedShading(material, {
      tones: SNAKE_FACE_TONES,
      cacheKey: 'body',
    });
    const { fragment } = compile(material);
    // The four uniforms the cuff needed. Any one of them back means a stripe.
    for (const uniform of [
      'uSnakeBand',
      'uSnakeBandTint',
      'uSnakeSeamTint',
      'uSnakeRimTint',
    ]) {
      expect(fragment).not.toContain(uniform);
    }
    /**
     * And structurally: the height varying may only ever be MULTIPLIED into
     * the tone, never used to replace it. An assignment is what draws a line;
     * a multiplier can only shade. This is the assertion that would catch the
     * cuff coming back under another name.
     */
    const heightUses = fragment
      .split('\n')
      .filter((line) => line.includes('vSnakeSegmentY'));
    expect(heightUses.length).toBeGreaterThan(0);
    for (const line of heightUses) {
      expect(line).not.toMatch(/toneMul\s*=[^*]/);
      expect(line).not.toMatch(/toneAdd\s*=[^*]/);
    }
  });

  /**
   * THE HEAD LOST IT TOO, and that is one step past the note - recorded here
   * because it is a judgement rather than an instruction. The head's cuff was
   * the same mechanism at a lower seat, producing the same artefact on the one
   * cube the player looks at most; and a cuff worn by the head alone would be
   * a NEW authored marking, not a surviving one. Head primacy never rested on
   * it, which is what this asserts: the three things it does rest on are all
   * still here and all still bigger for the head than for the body.
   */
  it('leaves head primacy standing on the three things that carried it', () => {
    for (const id of CONCEPT_STYLES) {
      const profile = concept(id);
      // SIZE.
      expect(profile.headSize).toBeGreaterThan(profile.bodySize);
      expect(profile.headSize).toBeGreaterThan(Math.max(...profile.trailFootprint));
      // The EMISSIVE gap, held over the cut-down trunk.
      expect(profile.headEmissiveScale).toBeGreaterThan(profile.bodyEmissiveScale);
      // And, under the guide palette only, the sheet's own value step.
      if (profile.forcedHeadBaseColor && profile.forcedBodyBaseColor) {
        expect(profile.forcedHeadBaseColor).not.toBe(profile.forcedBodyBaseColor);
      }
    }
  });

  it('hands a flat-drawn part a DIFFERENT program from the creature', () => {
    // Three's default cache key is `onBeforeCompile.toString()`, and every
    // material patched here shares one function source. Without the explicit
    // key the shades - which the sheet draws as one hard black bar - would be
    // handed the creature's program and start modelling.
    const creature = new THREE.MeshToonMaterial();
    const shades = new THREE.MeshToonMaterial();
    applyFaceKeyedShading(creature, {
      tones: SNAKE_FACE_TONES,
      cacheKey: 'body:x',
    });
    applyFaceKeyedShading(shades, { tones: FLAT_TONES, cacheKey: 'lens' });
    expect(creature.customProgramCacheKey!()).not.toBe(
      shades.customProgramCacheKey!()
    );
    // And the flat part pays for none of the varying it cannot use.
    expect(compile(shades).fragment).not.toContain('vSnakeSegmentY');
    expect(compile(shades).vertex).not.toContain('vSnakeSegmentY');
  });

  it('classic draws no patch at all', () => {
    expect(classic.tones).toBeNull();
  });
});

/**
 * THE TOP-LIT FALL WITHIN A FACE - round 3, the other half of the reference.
 *
 * His block's large faces are not flat fills; they carry a gentle vertical
 * gradient while the step BETWEEN two faces stays hard. Those two properties
 * pull against each other, and the whole design of the mechanism is which one
 * wins where.
 */
describe('snake90s: the fall - top-lit faces, hard face boundaries', () => {
  const fallAt = (fall: number, y: number) => 1 - fall * (0.5 - y);

  it('anchors at the top, so every band still lands on the guide swatch', () => {
    // At the top of a face the multiplier is exactly one - which is what keeps
    // the swatch table in `TONE_SIDE` literally true rather than approximately.
    expect(fallAt(SNAKE_FACE_TONES.fall, 0.5)).toBe(1);
    // A flat top face IS at y = 0.5, so the top plane is untouched entirely.
    expect(SNAKE_FACE_TONES.fall).toBeGreaterThan(0);
  });

  it('never lets a lit face fall as far as the band below it', () => {
    // The fall may deepen a face; it may not turn a lit one into a shaded one,
    // or the authored 3/4 read comes apart at the bottom of every cube.
    const bottom = fallAt(SNAKE_FACE_TONES.fall, -0.5);
    const sideToAway = luminance(TONE_AWAY) / luminance(TONE_SIDE);
    expect(bottom).toBeGreaterThan(sideToAway);
    const topToSide = luminance(TONE_SIDE) / luminance(TONE_TOP);
    expect(bottom).toBeGreaterThan(topToSide);
  });

  it('is a multiplier, so it cannot cross-fade a band boundary', () => {
    // Two faces meeting at an edge are at the SAME height there, so both are
    // scaled by the same number and their authored distance survives intact.
    const y = 0.2;
    const f = fallAt(SNAKE_FACE_TONES.fall, y);
    const lit = luminance(TONE_SIDE) * f;
    const shaded = luminance(TONE_AWAY) * f;
    expect(lit / shaded).toBeCloseTo(
      luminance(TONE_SIDE) / luminance(TONE_AWAY),
      12
    );
  });

  it('leaves every flat-drawn value flat', () => {
    // "A lit black is a grey that moves with the board theme."
    expect(FLAT_TONES.fall).toBe(0);
    // The shades are one hard bar and the braids are stock near-black; a
    // gradient on either is the "realistic" read the palette panel forbids.
    expect(SHADE_TONES.fall).toBe(0);
    expect(BRAID_TONES.fall).toBe(0);
  });
});

describe('snake90s: the shader patch', () => {
  /**
   * The three lines of stock three.js this concept depends on. They are matched
   * by text, so a three upgrade that rewords any of them would silently
   * downgrade the whole style with no error anywhere. This asserts the seams
   * still exist in the installed version.
   */
  it('still has the stock seams it splices into', () => {
    expect(THREE.ShaderLib.toon.vertexShader).toContain(
      '#include <defaultnormal_vertex>'
    );
    expect(THREE.ShaderLib.toon.vertexShader).toContain(
      '#include <begin_vertex>'
    );
    expect(THREE.ShaderLib.toon.fragmentShader).toContain(
      '#include <lights_fragment_end>'
    );
  });

  it('composes with a patch the material already carried', () => {
    // `Material.copy()` does not clone `onBeforeCompile`, so several call sites
    // re-hang two patches onto one clone. The second must not eat the first -
    // the instanced body's emissive-times-instance-colour patch is the one
    // that would go, and dense coils would wash out.
    const material = new THREE.MeshToonMaterial();
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n// FIRST PATCH'
      );
    };
    applyFaceKeyedShading(material, {
      tones: SNAKE_FACE_TONES,
      band: null,
      cacheKey: 'compose',
    });
    const { fragment } = compile(material);
    expect(fragment).toContain('// FIRST PATCH');
    expect(fragment).toContain('reflectedLight.directDiffuse = vec3( 0.0 );');
  });
});

describe('snake90s: the cosmetics the guide names', () => {
  const cosmetics = concept('nineties').cosmetics!;

  it('has no cap, and no slot a cap could be worn in but the braids', () => {
    // "NO CAP. Remove the cap/headwear entirely; do not replace it. Top
    // silhouette = cubic head + braids."
    //
    // Nothing had to be removed - the crown slot has only ever held braids -
    // so this pins the state rather than the change. The head has exactly two
    // mount points, and what is worn on the top one is the braids.
    expect(Object.keys(COSMETIC_ANCHORS).sort()).toEqual(['crown', 'face']);
    const crown = Object.values(SNAKE_COSMETICS).filter(
      (def) => def.slot === 'crown'
    );
    expect(crown).toHaveLength(1);
    expect(crown[0].id).toBe('braids_amber');
    expect(Object.keys(SNAKE_COSMETICS).sort()).toEqual([
      'braids_amber',
      'shades_deadpan',
    ]);
  });

  it('makes the shades DISPROPORTIONATELY large - wider than the head itself', () => {
    // "Disproportionately large, thick black frames, angular/blocky." Literal:
    // the bar is wider than the face it is worn on.
    expect(cosmetics.shadeOverhang).toBeGreaterThan(1);
    // A fifth of the head's height on the brow alone, and the lens blocks step
    // lower still - a bar, not eyewear.
    expect(cosmetics.browHeight).toBeGreaterThanOrEqual(0.15);
    expect(cosmetics.lensHeight).toBeGreaterThan(cosmetics.browHeight);
    // "Thick black frames": the frame is the accent BLACK, not a lifted slate.
    expect(cosmetics.frame).toBe(GUIDE_PALETTE.ink);
    expect(cosmetics.lens).toBe(GUIDE_PALETTE.ink);
    // And inked as boldly as a body part, because it is half the silhouette.
    expect(cosmetics.shadeInk).toBeGreaterThan(0.03);
  });

  it('makes the braids blocks, and keeps them blocks', () => {
    // "Chunky simplified block segments ... never realistic hair." A chain
    // whose pitch does not exceed its block fuses into a ridge, which is the
    // same failure the body cubes are held against.
    expect(cosmetics.braidPitch).toBeGreaterThan(cosmetics.braidBlock);
    expect(cosmetics.braid).toBe(GUIDE_PALETTE.braid);
    // "Small cubic orange/gold beads at the ends" - warm, and the only warm
    // value the cosmetic is allowed.
    const bead = linearRgb(cosmetics.bead);
    expect(bead[0]).toBeGreaterThan(bead[1]);
    expect(bead[1]).toBeGreaterThan(bead[2]);
    expect(saturation(bead)).toBeGreaterThan(0.9);
  });

  it('gives a near-black braid its shape back with LIGHT, not with a lighter colour', () => {
    // The shipped braid is #2a3647 with a note explaining why: at near-void
    // value the blocks lost their shading and only the outline survived. The
    // guide asks for near-black anyway, so the fix has to be elsewhere.
    // "Strong upper-edge highlights" - and no multiplier reaches gold from
    // #191712, so the rim band ADDS light.
    const stock = linearRgb(GUIDE_PALETTE.braid);
    expect(luminance(stock)).toBeLessThan(0.02);
    expect(BRAID_TONES.rim.add).toBeDefined();
    const rim = BRAID_TONES.rim.add!;
    expect(luminance(rim)).toBeGreaterThan(luminance(stock) * 20);
    // Warm gold, not white: a white rim on a near-black block reads as wet
    // plastic, which is "realistic hair" arrived at from the other direction.
    expect(rim[0]).toBeGreaterThan(rim[1]);
    expect(rim[1]).toBeGreaterThan(rim[2]);
    // The other bands do NOT add - only the upper edge is lit.
    for (const band of [BRAID_TONES.side, BRAID_TONES.away, BRAID_TONES.down]) {
      expect(band.add ?? [0, 0, 0]).toEqual([0, 0, 0]);
    }
  });

  it('keeps the shades and the mouth flat - they are drawn values, not lit ones', () => {
    // The lens and the mouth are the deepest value on the character and the
    // sheet gives them no face variation at all. A lit black is a grey that
    // moves with the board theme.
    for (const key of ['rim', 'top', 'side', 'away', 'down'] as const) {
      const band = FLAT_TONES[key];
      expect(band.mul).toEqual([1, 1, 1]);
      expect(band.add ?? [0, 0, 0]).toEqual([0, 0, 0]);
    }
    // And no fall either - round 3's gradient is a face treatment, and a flat
    // drawn value has no face to treat.
    expect(FLAT_TONES.fall).toBe(0);
    // The frame is nearly flat too - a frame shaded like a body cube stops
    // reading as one hard black bar, which is the whole silhouette.
    expect(luminance(SHADE_TONES.rim.add!)).toBeLessThan(
      luminance(BRAID_TONES.rim.add!) * 0.5
    );
  });

  it('classic wears the shipped INK & AMBER cosmetics, untouched', () => {
    expect(classic.cosmetics).toBeNull();
  });
});
