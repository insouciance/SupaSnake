'use client';

/**
 * ArenaFloor - THE SLAB.
 *
 * PASS 4, OWNER RULING: the board should read as "a solid shape with
 * thickness, floating in space - a fine slab of stone, like a large tile that
 * consists of many smaller tiles", with the lines separating the tiles CARVED
 * like engraved grooves rather than drawn on.
 *
 * Pass 3 made the board a drawn object: a toon fill wearing the snake's ink,
 * plus ONE analytic pass for checker parity and antialiased rules. That was
 * right about the DRAWING and wrong about the OBJECT - it was still a plane,
 * 0.1 units thick, sitting inside a machined chassis. Pass 4 keeps every line
 * of the drawing decision and replaces the plane with a tile:
 *
 *   SLAB     a chamfered stone body with real thickness and four side faces,
 *            built at world size (see `createArenaSlabGeometry`) so twisting
 *            the camera reveals a physical object. Face tone travels in a
 *            vertex colour, so the polished top, the bright cut chamfer, the
 *            raw side faces and the underside are ONE draw call.
 *   APRON    the tile is wider than the playfield. The chassis that used to
 *            fill that band is deleted; the band is now simply more stone, and
 *            the slab's outer half-overhang is exactly the camera's frame
 *            margin, so the visible object and the framed object are the same
 *            object.
 *   CHECKER  alternating cells at a barely-there tonal lift. Owner: "might
 *            work better if the colors have a bit less contrast." It is
 *            orientation and scale information, not decoration.
 *   GROOVES  cell boundaries CARVED, not inked - see the fragment shader.
 *
 * Checker and grooves remain ONE analytic fragment shader over ONE transparent
 * plane, so the carving costs nothing that pass 3 was not already paying. The
 * plane stays transparent so the lit slab shows through and keeps RECEIVING
 * SHADOWS.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createInkHullMaterial, getToonGradientMap, INK } from './screen/inkAmber';
import { ARENA_STONE } from './screen/gameScreenTokens';

interface ArenaFloorProps {
  /** Grid size (default 20) */
  gridSize?: number;
  /** Top-face albedo of the slab (the surface play is read against) */
  floorColor?: string;
  /** Checker tint - a finish difference on the same stone, not a colour */
  gridColor?: string;
  /** The lit wall of a carved groove */
  majorGridColor?: string;
  /** Dynasty color for the emissive edge wash */
  accentColor?: string;
  /** Released material is the rollback default; cockpit is matte composite. */
  surfacePreset?: 'released' | 'cockpit';
  /** Multiplier for the generated edge-wash alpha. */
  edgeWashStrength?: number;
  /** Groove depth (composite strength), tunable without changing geometry. */
  minorGridOpacity?: number;
  majorGridOpacity?: number;
}

/** Cells between major (emphasized) grid lines */
const MAJOR_EVERY = 5;

/**
 * The floor's top surface, and the clearance everything standing on it must
 * keep from that surface.
 *
 * The slab's top face is at EXACTLY y = 0. Anything drawn base-on-floor at
 * y = 0 therefore shares a plane with it, at identical depth, over its whole
 * footprint - and two coplanar surfaces are z-fighting by definition. It
 * renders as horizontal bands across the bottom of every face that flicker as
 * the object moves, which is what the owner reported on the trail: "they are
 * flickering and not all sides of the cubes/segments are visible... when going
 * vertically it is flickering."
 *
 * The direction-dependence is the tell. Moving along Z changes each face's
 * depth slope relative to the floor plane, so the fight resolves differently
 * frame to frame; moving along X leaves that slope constant, so it looks
 * stable. Same defect either way - only one of them shimmers.
 *
 * CLEARANCE, NOT BIAS. Lifting by a hair removes the tie outright rather than
 * asking the depth buffer to break it. The shared base below also clears the
 * raised board-graphics plane; `polygonOffset` would only pick a winner and
 * would still be wrong on a different GPU.
 */
export const FLOOR_TOP_Y = 0;

/** The tallest decorative floor primitive is the board pass at y=0.02. */
export const FLOOR_GRAPHICS_TOP_Y = 0.02;

/**
 * Shared render base for anything that stands on the arena.
 *
 * This used to equal the board-graphics y=0.02 plane. That removed the floor
 * z-fight while leaving the bottom face of every snake segment coplanar with
 * a major grid line. The defect therefore survived on the exact rows and
 * columns players use most for routing, especially on mobile depth buffers.
 * A further 0.02-cell separation is visually imperceptible but geometrically
 * decisive. This is rendering clearance only; logical cells and collisions
 * remain on y=0 in the engine.
 */
export const FLOOR_CLEARANCE = FLOOR_GRAPHICS_TOP_Y + 0.02;

/**
 * Slab thickness, below the play surface.
 *
 * 0.95 over a 22.35-wide tile is roughly 24:1 - the proportion of a large
 * format stone tile, not a plinth. It is also enough to SEE: a vertical face
 * projects at cos(camera elevation), so at the cockpit's default 64-degree
 * elevation the side reads about 0.42 of a cell tall on screen, and at the
 * 45-degree pitch limit about 0.67 of a cell. Thinner and the twist reveals a
 * plane again; thicker and the tile becomes a pedestal.
 */
export const SLAB_THICKNESS = 0.95;

/** Chamfer on the tile's top edge - the "fine" in "a fine slab of stone". */
const SLAB_CHAMFER = 0.16;

/**
 * Stone beyond the playfield, per side.
 *
 * The cockpit value is exactly `COCKPIT_FRAME_MARGIN` (CameraRig), which used
 * to describe the deleted undertray chassis's outer half-overhang. The chassis
 * is gone and the stone now occupies that band, so the auto-fit still frames
 * precisely the object that exists. The released rollback fits to a margin of
 * 1, so its apron stays inside that.
 */
export const SLAB_APRON = { cockpit: 1.175, released: 0.9 } as const;

/**
 * Convert a rendered object's base and full height into its mesh centre.
 * Three.js positions centred geometry, so assigning the desired base directly
 * puts half the object through the floor. Every snake head/body placement uses
 * this one rule.
 */
export function centerYFromBase(baseY: number, height: number): number {
  return baseY + height / 2;
}

export const ARENA_EDGE_WASH_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ARENA_EDGE_WASH_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uAccent;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    // A soft superellipse follows the square arena instead of drawing a foggy
    // circle across its centre. It is analytic, so there is no raster grain at
    // any DPR; the low alpha leaves objectives and the snake in command.
    vec2 edgeVector = abs(vUv * 2.0 - vec2(1.0));
    float boardDistance = pow(
      pow(edgeVector.x, 6.0) + pow(edgeVector.y, 6.0),
      1.0 / 6.0
    );
    float edge = smoothstep(0.76, 1.08, boardDistance);
    float alpha = edge * 0.32 * uStrength;
    gl_FragColor = vec4(uAccent, alpha);
  }
`;

/**
 * How much of an authored dynasty edge wash survives on a stone board.
 *
 * The wash was authored against a near-black plane, where it read as the
 * board's edge being lit. On the slab it reads as a 4-cell-wide painted frame
 * inside the playfield - on PRIMAL, a bright olive one - which is the single
 * loudest thing fighting "a fine slab of stone". The rim carries dynasty
 * identity in its own tint and emissive now, so the wash only has to be the
 * atmosphere it always claimed to be.
 *
 * It lives HERE, as this component's default, rather than at one call site.
 * Every path that draws the slab draws it on stone - the cockpit assembly, the
 * released rollback in `game/page.tsx`, the `/dev/perf` harness and the arena
 * prototype - so a factor applied by only one of them would leave the other
 * three washing a stone board at full strength. That was exactly the defect:
 * the rollback path passed no strength at all and got 1.0.
 */
export const EDGE_WASH_ON_STONE = 0.25;

/** Build the one-draw, resolution-independent arena edge wash. */
export function createArenaEdgeWashMaterial(
  accentColor: string,
  strength: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAccent: { value: new THREE.Color(accentColor) },
      uStrength: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(strength) ? strength : 0,
          0,
          1.5
        ),
      },
    },
    vertexShader: ARENA_EDGE_WASH_VERTEX_SHADER,
    fragmentShader: ARENA_EDGE_WASH_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * The key light, projected onto the board and expressed in CELL coordinates.
 *
 * A carved groove only reads as carved if its two walls are shaded by the lamp
 * that lights everything else. The game's single shadow-casting key sits at
 * [24, 18, 2] aimed at board centre [10, *, 10], so its direction over the
 * board is (14, 18, -8); flattened to the plane that is (14, -8) in WORLD XZ.
 *
 * The board pass is a PlaneGeometry rotated -PI/2 about X, which sends its
 * local +Y to world -Z - so the cell-space Y axis runs OPPOSITE world Z and
 * the flattened direction becomes (14, +8), normalized (0.868, 0.496).
 *
 * The asymmetry is the point and is not a defect: grooves running north-south
 * face the lamp squarely and get a strong bright/dark wall pair, grooves
 * running east-west catch it obliquely and get a softer one. That is what a
 * single raking light does to a grid of channels cut in stone.
 */
const KEY_LIGHT_CELL_DIR: readonly [number, number] = [0.868, 0.496];

/**
 * The checker's tonal lift.
 *
 * It was 0.038 of #87bada, which over the old near-black surface moved a cell
 * by roughly 16-25 sRGB levels - a chessboard, not a texture. 0.042 of a
 * mid-slate moves it by 4-7, which is findable when you look for it and gone
 * when you are reading the snake. The checker is orientation and scale
 * information; the GROOVES are the boundaries.
 */
const CHECKER_ALPHA = 0.042;

/**
 * Channel half-width, as a multiple of one screen-space cell derivative.
 *
 * Expressed in derivatives rather than world units so the carving is the same
 * number of PIXELS wide at every zoom and DPR - a fixed world width shimmers
 * once it falls below a pixel. The emphasis channel is wider because it is a
 * deeper cut, not a different kind of cut.
 */
const MINOR_CHANNEL_WIDTH = 1.15;
const MAJOR_CHANNEL_WIDTH = 1.45;

/**
 * How much more a groove OCCLUDES than it reflects.
 *
 * The two walls do not composite at the same weight. A board surface this dark
 * has very little room below it - measured, the lit wall lands about 30 sRGB
 * levels above the stone while an equally weighted shadow wall lands 4 below
 * it, which reads as a bright line drawn ON the stone rather than a channel
 * cut INTO it. So the shadow wall composites well past the nominal strength
 * and the highlight well under it.
 */
const GROOVE_SHADOW_WEIGHT = 1.6;
const GROOVE_LIGHT_WEIGHT = 0.36;

/**
 * A flat additive lift on the slab body. Imperceptible on the key-lit top face
 * and worth roughly a third of the value on the faces the key never reaches,
 * which is precisely where a slab in empty space loses its silhouette against
 * the backdrop.
 */
const SLAB_EMISSIVE_LIFT = 0.22;

export const ARENA_BOARD_VERTEX_SHADER = /* glsl */ `
  varying vec2 vCell;

  void main() {
    vCell = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The stone board face: checker parity plus CARVED cell grooves, in one pass,
 * over a transparent plane.
 *
 * WHY A SHADER GROOVE AND NOT INSET GEOMETRY. The two honest ways to make a
 * grid read as engraved are (a) a shading term in the pass that is already
 * running over the board face, and (b) real recessed geometry. (b) costs 40
 * channels x 2 axes of extra quads plus their own normals, puts a second
 * surface within hundredths of a unit of the slab top (the exact coplanar
 * z-fight this file exists to document), and gains nothing, because at this
 * camera a 2px-wide channel is never resolved as depth - it is resolved as
 * SHADING. (a) is a dozen lines inside an existing draw call and produces the
 * only cue that actually reads: one wall lit, the opposite wall in shadow, the
 * pair flipping sign exactly at the centre line. A painted line cannot do
 * that, and a player cannot tell it from a real channel at any pitch this
 * camera allows.
 *
 * `fwidth` is what makes it safe at any zoom or DPR. A groove drawn at a fixed
 * world width shimmers when it falls below a pixel; a groove whose half-width
 * is expressed in the SCREEN-SPACE derivative of the cell coordinate stays
 * exactly the requested number of pixels wide at every distance, which is why
 * the carving stays crisp when the player zooms in and stays present (rather
 * than flickering out) when they zoom out.
 */
export const ARENA_BOARD_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGrid;
  uniform float uMajorEvery;
  uniform vec3 uGrooveShadow;
  uniform vec3 uGrooveLight;
  uniform vec3 uCheck;
  uniform float uCheckAlpha;
  uniform float uMinorAlpha;
  uniform float uMajorAlpha;
  uniform float uMinorWidth;
  uniform float uMajorWidth;
  uniform vec2 uLight;
  uniform float uShadowWeight;
  uniform float uLightWeight;
  varying vec2 vCell;

  /** Softly shouldered coverage of a channel of half-width hw, in cell units. */
  float channel(float offset, float hw) {
    return 1.0 - smoothstep(0.3, 1.0, abs(offset) / max(hw, 1e-6));
  }

  /** Signed distance to the nearest integer boundary, in the same units. */
  vec2 nearestEdge(vec2 coord) {
    return fract(coord + 0.5) - 0.5;
  }

  /**
   * One carved layer: colour plus alpha, ready to composite over the surface.
   *
   * The wall whose normal tilts toward the lamp is lit and the opposite wall
   * is in the channel's own shadow, so the shading flips sign at the centre
   * line. That discontinuity IS the carve; a symmetric profile is a drawn
   * line no matter how dark it gets. The lit term is squared so the shadow
   * wall stays at the bottom of the channel rather than creeping halfway
   * toward the highlight.
   *
   * The two walls do NOT composite at the same weight - see
   * GROOVE_SHADOW_WEIGHT. A channel occludes far more than it reflects, and on
   * this palette that is the difference between carved and painted.
   */
  vec4 carve(vec2 offset, vec2 coverage, float strength) {
    float depth = max(coverage.x, coverage.y);
    if (depth <= 0.0) return vec4(0.0);
    float facing = (
      -sign(offset.x) * uLight.x * coverage.x
      - sign(offset.y) * uLight.y * coverage.y
    ) / max(depth, 1e-4);
    float lit = clamp(0.5 + 0.5 * facing, 0.0, 1.0);
    lit *= lit;
    return vec4(
      mix(uGrooveShadow, uGrooveLight, lit),
      min(1.0, depth * strength * mix(uShadowWeight, uLightWeight, lit))
    );
  }

  /** Source-over, done properly so the heavy layer wins at the crossings. */
  void over(inout vec3 dstColor, inout float dstAlpha, vec4 src) {
    float alpha = src.a + dstAlpha * (1.0 - src.a);
    if (alpha > 1e-4) {
      dstColor = (src.rgb * src.a + dstColor * dstAlpha * (1.0 - src.a)) / alpha;
    }
    dstAlpha = alpha;
  }

  void main() {
    vec2 cell = vCell * uGrid;
    vec2 cellWidth = fwidth(cell);

    // Checker parity. The board-game read, and the one cartoon element that
    // costs nothing to parse: alternate cells carry a whisper of light.
    vec2 tile = floor(cell);
    float parity = mod(tile.x + tile.y, 2.0);

    vec3 color = uCheck;
    float alpha = parity * uCheckAlpha;

    // Every cell boundary, then the emphasis channel every uMajorEvery cells:
    // wider, deeper, same carve.
    vec2 minorOffset = nearestEdge(cell);
    vec2 minorCoverage = vec2(
      channel(minorOffset.x, cellWidth.x * uMinorWidth),
      channel(minorOffset.y, cellWidth.y * uMinorWidth)
    );
    over(color, alpha, carve(minorOffset, minorCoverage, uMinorAlpha));

    vec2 majorCell = cell / uMajorEvery;
    vec2 majorWidth = cellWidth / uMajorEvery;
    vec2 majorOffset = nearestEdge(majorCell);
    vec2 majorCoverage = vec2(
      channel(majorOffset.x, majorWidth.x * uMajorWidth),
      channel(majorOffset.y, majorWidth.y * uMajorWidth)
    );
    over(color, alpha, carve(majorOffset, majorCoverage, uMajorAlpha));

    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(color, alpha);
    // Authored in sRGB like every other colour on the board. Three generates
    // linearToOutputTexel from the active render target, so this is identity
    // inside the desktop bloom composer (linear target) and the real encode on
    // the mobile path that renders straight to the canvas - the stone reads
    // the same on both.
    #include <colorspace_fragment>
  }
`;

/** Build the one-draw stone board face (checker + carved cell grooves). */
export function createArenaBoardMaterial(
  gridSize: number,
  checkColor: string,
  grooveLightColor: string,
  minorAlpha: number,
  majorAlpha: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGrid: { value: gridSize },
      uMajorEvery: { value: MAJOR_EVERY },
      uGrooveShadow: { value: new THREE.Color(INK) },
      uGrooveLight: { value: new THREE.Color(grooveLightColor) },
      uCheck: { value: new THREE.Color(checkColor) },
      uCheckAlpha: { value: CHECKER_ALPHA },
      uMinorAlpha: { value: THREE.MathUtils.clamp(minorAlpha, 0, 1) },
      uMajorAlpha: { value: THREE.MathUtils.clamp(majorAlpha, 0, 1) },
      uMinorWidth: { value: MINOR_CHANNEL_WIDTH },
      uMajorWidth: { value: MAJOR_CHANNEL_WIDTH },
      uShadowWeight: { value: GROOVE_SHADOW_WEIGHT },
      uLightWeight: { value: GROOVE_LIGHT_WEIGHT },
      uLight: {
        value: new THREE.Vector2(
          KEY_LIGHT_CELL_DIR[0],
          KEY_LIGHT_CELL_DIR[1]
        ),
      },
    },
    vertexShader: ARENA_BOARD_VERTEX_SHADER,
    fragmentShader: ARENA_BOARD_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

type SlabCorner = readonly [number, number, number];

/**
 * The slab's chamfered stone body, built at WORLD SIZE.
 *
 * Built rather than scaled, for two reasons. A chamfer is the one feature a
 * non-uniform scale destroys - a unit box stretched to 22.35 x 0.95 x 22.35
 * would carry a bevel 23x wider along X than along Y. And building at size
 * pins the mesh's world scale at 1, which is what makes the shared ink hull
 * expand by exactly INK_HULL_WIDTH on every face, since that shader divides
 * its offset by the object's world scale.
 *
 * Face tone travels in a vertex COLOUR rather than a material group. Six
 * groups would be six draw calls for one tile and six more for its hull; one
 * colour attribute is one draw and one hull, and THREE.Color linearises each
 * hex exactly as it does for every other colour on the board.
 *
 * Ten quads, wound counter-clockwise as seen from outside, each with the
 * normal DERIVED from its own winding rather than asserted alongside it - so a
 * mistyped corner shows up as a black face immediately instead of as a subtly
 * wrong band. Flat per-quad normals are deliberate: they are what give the
 * toon ramp a hard step at every edge of the tile.
 */
export function createArenaSlabGeometry(
  span: number,
  thickness: number,
  chamfer: number,
  tones: { face: string; bevel: string; side: string; base: string }
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const tone = new THREE.Color();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const quad = (
    a: SlabCorner,
    b: SlabCorner,
    c: SlabCorner,
    d: SlabCorner,
    hex: string
  ): void => {
    edgeA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    edgeB.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    normal.crossVectors(edgeA, edgeB).normalize();
    tone.set(hex);
    for (const corner of [a, b, c, a, c, d]) {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(tone.r, tone.g, tone.b);
    }
  };

  const outer = span / 2;
  const inner = outer - chamfer;
  const bevelY = -chamfer;
  const baseY = -thickness;

  // Polished top.
  quad(
    [-inner, 0, inner],
    [inner, 0, inner],
    [inner, 0, -inner],
    [-inner, 0, -inner],
    tones.face
  );

  // Cut chamfer, one ring of four.
  quad([-outer, bevelY, outer], [outer, bevelY, outer], [inner, 0, inner], [-inner, 0, inner], tones.bevel);
  quad([outer, bevelY, -outer], [-outer, bevelY, -outer], [-inner, 0, -inner], [inner, 0, -inner], tones.bevel);
  quad([outer, bevelY, outer], [outer, bevelY, -outer], [inner, 0, -inner], [inner, 0, inner], tones.bevel);
  quad([-outer, bevelY, -outer], [-outer, bevelY, outer], [-inner, 0, inner], [-inner, 0, -inner], tones.bevel);

  // Side faces - the thickness the twist exists to reveal.
  quad([-outer, baseY, outer], [outer, baseY, outer], [outer, bevelY, outer], [-outer, bevelY, outer], tones.side);
  quad([outer, baseY, -outer], [-outer, baseY, -outer], [-outer, bevelY, -outer], [outer, bevelY, -outer], tones.side);
  quad([outer, baseY, outer], [outer, baseY, -outer], [outer, bevelY, -outer], [outer, bevelY, outer], tones.side);
  quad([-outer, baseY, -outer], [-outer, baseY, outer], [-outer, bevelY, outer], [-outer, bevelY, -outer], tones.side);

  // Underside. Seen only at the pitch limit, and only as a dark edge.
  quad(
    [-outer, baseY, -outer],
    [outer, baseY, -outer],
    [outer, baseY, outer],
    [-outer, baseY, outer],
    tones.base
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** How far past the slab's own footprint the float halo reaches. */
const HALO_REACH = 1.62;

/**
 * Peak halo alpha at the slab's silhouette.
 *
 * Measured, not eyeballed: at 0.34 the scatter read as a lit floor the tile
 * was resting ON, which is the opposite of the cue - the halo exists so the
 * slab reads as FLOATING. 0.28 is the most it can carry while the gap between
 * the tile and the backdrop still reads as empty space.
 */
const HALO_STRENGTH = 0.28;

export const ARENA_HALO_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The float halo: scattered light where a floor would otherwise be.
 *
 * An object "floats in space" when the eye can find the gap between it and
 * anything else. On a black backdrop there is nothing to find - the slab's
 * unlit side face and the void behind it are within a few sRGB levels of each
 * other, so the silhouette dissolves exactly where the thickness is supposed
 * to read. A soft plane of light sitting just under the tile fixes that from
 * both directions at once: it is the ambient occlusion the slab would cast if
 * it were sitting on something, and it is the only thing the dark side face
 * has to be a silhouette AGAINST.
 *
 * It follows the tile's square with a superellipse rather than a disc, is
 * analytic so no bitmap resolution appears when the viewport grows, and is
 * cubed so it hugs the silhouette instead of washing the backdrop. Depth
 * testing does the framing for free: everything under the tile is occluded by
 * the tile, so only the ring outside it is ever seen.
 */
export const ARENA_HALO_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uInner;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    vec2 edgeVector = abs(vUv * 2.0 - vec2(1.0));
    float boardDistance = pow(
      pow(edgeVector.x, 5.0) + pow(edgeVector.y, 5.0),
      1.0 / 5.0
    );
    float glow = smoothstep(1.0, uInner, boardDistance);
    glow = glow * glow * glow;
    gl_FragColor = vec4(uColor, glow * uStrength);
    #include <colorspace_fragment>
  }
`;

/** Build the one-draw, resolution-independent float halo. */
export function createArenaHaloMaterial(
  color: string,
  inner: number,
  strength: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uInner: { value: inner },
      uStrength: { value: strength },
    },
    vertexShader: ARENA_HALO_VERTEX_SHADER,
    fragmentShader: ARENA_HALO_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** The slab's own ink outline - the same line the snake carries. */
const floorHullMaterial = createInkHullMaterial();

export function ArenaFloor({
  gridSize = 20,
  floorColor = '#16202a',
  gridColor = ARENA_STONE.checker,
  majorGridColor = ARENA_STONE.cut,
  accentColor = '#22d3ee',
  surfacePreset = 'released',
  edgeWashStrength = EDGE_WASH_ON_STONE,
  minorGridOpacity = 0.4,
  majorGridOpacity = 0.58,
}: ArenaFloorProps) {
  const center = gridSize / 2;
  const apron = SLAB_APRON[surfacePreset];

  // Dynasty-tinted emissive wash: transparent at center, faint glow toward
  // the edges, so the board participates in the dynasty theme and its edge
  // reads as lit rather than cut out. The gradient is analytic in the fragment
  // shader: there is no bitmap resolution to reveal when the viewport grows.
  const edgeWashMaterial = useMemo(
    () => createArenaEdgeWashMaterial(accentColor, edgeWashStrength),
    [accentColor, edgeWashStrength]
  );

  /**
   * Checker + carved grooves. The caller's colours still drive it, so a
   * dynasty that wants a cooler or warmer board still gets one - what changed
   * is that they now describe a CUT (its lit wall, its checker finish) rather
   * than the weight of a drawn line.
   */
  const boardMaterial = useMemo(
    () =>
      createArenaBoardMaterial(
        gridSize,
        gridColor,
        majorGridColor,
        minorGridOpacity,
        majorGridOpacity
      ),
    [gridSize, gridColor, majorGridColor, minorGridOpacity, majorGridOpacity]
  );

  const slabGeometry = useMemo(
    () =>
      createArenaSlabGeometry(gridSize + apron * 2, SLAB_THICKNESS, SLAB_CHAMFER, {
        face: floorColor,
        bevel: ARENA_STONE.bevel,
        side: ARENA_STONE.side,
        base: ARENA_STONE.base,
      }),
    [gridSize, apron, floorColor]
  );

  /**
   * The lit fill. Toon, so the tile bands like the creature standing on it -
   * and because a hard step between the top face, the chamfer and each side
   * face is exactly how a drawn object shows that it has volume. `vertexColors`
   * multiplies the per-face tone in; the material colour stays white so the
   * geometry alone decides what each face is made of.
   */
  const haloMaterial = useMemo(
    () => createArenaHaloMaterial(ARENA_STONE.halo, 1 / HALO_REACH, HALO_STRENGTH),
    []
  );

  const slabMaterial = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: '#ffffff',
        vertexColors: true,
        gradientMap: getToonGradientMap(),
        emissive: ARENA_STONE.side,
        emissiveIntensity: SLAB_EMISSIVE_LIFT,
      }),
    []
  );

  useEffect(() => {
    return () => {
      edgeWashMaterial.dispose();
      boardMaterial.dispose();
      slabMaterial.dispose();
      haloMaterial.dispose();
    };
  }, [edgeWashMaterial, boardMaterial, slabMaterial, haloMaterial]);

  useEffect(() => {
    return () => {
      slabGeometry.dispose();
    };
  }, [slabGeometry]);

  const slabSpan = gridSize + apron * 2;

  return (
    <group>
      {/*
        The float halo. It belongs to the SLAB, not to the cockpit chassis that
        used to host it: it is the cue that says the tile is floating, and a
        tile floats in the rollback path too. Sized from this arena's own span
        and apron, so the released preset gets a halo that fits its smaller
        tile instead of the cockpit's.
      */}
      <mesh
        position={[center, -SLAB_THICKNESS * 0.88, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={haloMaterial}
      >
        <planeGeometry args={[slabSpan * HALO_REACH, slabSpan * HALO_REACH]} />
      </mesh>

      {/* The tile: one stone body with thickness, wearing the board's ink. */}
      <mesh
        position={[center, 0, center]}
        geometry={slabGeometry}
        material={slabMaterial}
        receiveShadow
      >
        <mesh
          geometry={slabGeometry}
          material={floorHullMaterial}
          renderOrder={-1}
        />
      </mesh>

      {/* Dynasty edge wash - additive so it glows over the board surface */}
      <mesh
        position={[center, 0.006, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={edgeWashMaterial}
      >
        <planeGeometry args={[gridSize, gridSize]} />
      </mesh>

      {/* Checker + carved cell grooves + emphasis every 5, in one pass. */}
      <mesh
        position={[center, FLOOR_GRAPHICS_TOP_Y, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={boardMaterial}
      >
        <planeGeometry args={[gridSize, gridSize]} />
      </mesh>
    </group>
  );
}

export default ArenaFloor;
