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
 *
 * -----------------------------------------------------------------------------
 * PASS 5, OWNER RULING 2026-08-07: "no grooves are visible, no terrain 3D like
 * in the graphics provided. rework that and work harder. also, the game board
 * must have those 90s cartoon elements. it's all a coherent composition."
 * -----------------------------------------------------------------------------
 *
 * Pass 4's argument for shading a groove rather than building one was sound on
 * its own premise - that the channel had to stay ~2px - and the premise was
 * what was wrong. So on a THEMED board the cells become real blocks:
 *
 *   TILE FIELD  400 chamfered blocks in ONE baked geometry (`boardTiles.ts`),
 *               standing SEAM_DEPTH proud of the slab, separated by a real
 *               SEAM_WIDTH gap. Two draw calls with its ink hull. The near wall
 *               of a seam now OCCLUDES its own floor, which is the one cue no
 *               fragment shader over a flat plane can produce at any strength.
 *   THE SLAB    unchanged in every dimension, and RECESSED by SEAM_DEPTH so the
 *               tile tops land at exactly y = 0. Everything that stands on the
 *               board keeps its shipped clearance; nothing outside this file
 *               learns a new floor height. The slab's top face is now the
 *               GROOVE FLOOR, and its apron is the board's dark margin.
 *   BOARD PASS  keeps its plane and its draw, moves down with the slab, and
 *               sheds the two layers the geometry now does for real - the
 *               checker and the tile bevel. What remains is the NEON in the
 *               bottom of the cut, which the tiles mask down to exactly the
 *               seams for free.
 *
 * THE STONE BOARD IS UNTOUCHED. `neonTheme = null` - the shipped path, the
 * released rollback and `?boardTheme=stone` - renders pass 4 exactly, down to
 * the uniform values, so the A/B compares two real boards rather than one board
 * and a memory of it.
 *
 * -----------------------------------------------------------------------------
 * PASS 6, OWNER RULING 2026-08-07: "we don't need the gridlines now anymore,
 * they are rather a disturbance. the tiles already provide for proper
 * orientation on the board."
 * -----------------------------------------------------------------------------
 *
 * Pass 5 built the boundary three times over: as GEOMETRY (a real gap that
 * occludes), as INK (a thin hull around every tile) and as LIGHT (an analytic
 * carve plus a neon filament in the bottom of the cut). Only the first of
 * those is the thing itself; the other two are drawings of it, and they were
 * kept out of continuity with the flat board that needed them. The owner is
 * reading the surplus as noise.
 *
 * So on a tiled board, INSIDE the playfield, this component now draws NOTHING
 * at a cell boundary. Concretely, `createArenaBoardMaterial` zeroes the minor
 * and major carve alphas and the minor and major neon; `boardTiles` zeroes
 * every interior seam glow and stops building the ink hull. The board pass
 * survives as a draw with exactly one job left - THE PERIMETER, which is not a
 * cell boundary but the edge of the object, and which is the one line on this
 * surface a player is judging a distance to.
 *
 * `seamLines` restores the whole of pass 5 for a live A/B (`?gridlines=1` on
 * the fixture). Default is the line-free board.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createInkHullMaterial, getToonGradientMap, INK } from './screen/inkAmber';
import { ARENA_STONE } from './screen/gameScreenTokens';
import type { BoardTheme } from './screen/boardThemes';
import {
  applyBoardCelShading,
  createBoardCelRamp,
  createBoardTileField,
  SEAM_DEPTH,
  SEAM_WIDTH,
  SLAB_INK_WIDTH,
  TILE_INK_WIDTH,
} from './screen/boardTiles';

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
  /**
   * NEON DYNASTY THEMES (concept). When present, the theme supplies every
   * tone this component would otherwise take from `ARENA_STONE` plus the two
   * layers the stone board does not draw at all - the tile bevel and the neon
   * in the seams. When absent (the default, and every shipped path) the
   * component renders the stone board unchanged, down to the uniform values.
   */
  neonTheme?: BoardTheme | null;
  /**
   * COMPARE TOGGLE (concept, dev fixture only). Restore pass 5's drawn seam -
   * the analytic carve, the neon filament and the tiles' ink hull - so the
   * owner can flip the line-free board against the one he reviewed rather than
   * trust a description of the difference. Ignored on the stone board, which
   * has no blocks and whose grooves ARE its drawn seam.
   */
  seamLines?: boolean;
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

/**
 * THE WASH OBEYS THE SEAM LAW.
 *
 * MEASURED, and it is the sharpest lesson of pass 5. The wash is ADDITIVE and
 * a tiled board's flat albedo is around 0.03 in linear space, so a wash peak
 * of 0.032 does not tint the play surface - it doubles it. The first render
 * came back with copper tiles from edge to edge on both orange themes, and on
 * DARK NEON, whose entire identity is neutral graphite under hot orange light,
 * it inverted the theme: the stone became the orange thing.
 *
 * Damping it was the wrong fix and the second render proved it - a third of
 * too-much is still enough to stain a surface this dark. The right fix is the
 * law the neon already follows: LIGHT BELONGS IN THE SEAMS. The wash plane
 * goes back under the blocks, where the tiles mask it to exactly the grooves
 * by depth alone, and it keeps its authored strength there. It is then
 * incapable of reaching a surface the snake is read against, which is the
 * property that should never have depended on a coefficient.
 */

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

/**
 * THE TILE BEVEL - half-width of the roll at every cell boundary, in CELLS.
 *
 * This is the number that turns a grid into a floor of tiles. The groove is a
 * ~2px cut and reads as a SEAM; on its own the stone between two seams is
 * still flat, which is what "lines printed on a surface" means. A raised pad
 * has a rolled edge that is an order of magnitude wider than the seam it rolls
 * into, and that roll is what the eye actually reads as "this cell is a
 * physical object sitting slightly proud of its neighbours".
 *
 * 0.13 leaves the flat centre of a cell at 74% of its width - generous enough
 * that the snake, the food, THE LEAD and a terrain block all sit on flat
 * stone, which is the constraint that decided the number.
 *
 * WORLD-ANCHORED, WITH A SCREEN FLOOR. Unlike the groove, the bevel is a
 * proportion of a real tile, so it must scale like one when the player zooms:
 * a bevel pinned to a pixel width would grow into a dome as the camera pulled
 * back. The `max()` against a derivative multiple only engages when the board
 * is so far away that the roll would fall under ~2px and start to shimmer -
 * which is the same failure the groove's `fwidth` sizing exists to prevent,
 * applied from the other direction.
 */
const TILE_BEVEL_WIDTH = 0.13;
const TILE_BEVEL_PIXEL_FLOOR = 2.2;

/**
 * How hard the neon filament is concentrated into the middle of a cut.
 *
 * The channel's coverage is a soft shoulder; raising it to a power keeps the
 * light in the bottom of the groove instead of letting it wash up both walls,
 * which is the difference between "a lit channel" and "a fat glowing line".
 */
const NEON_FOCUS = 2.2;

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
  // NEON DYNASTY THEMES. Every one of these is inert on the stone board -
  // uBevelStrength and the three neon intensities are 0 - so the shipped
  // output is unchanged and the extra work is two uniform-coherent branches
  // the whole draw takes or skips together.
  uniform vec3 uBevelLight;
  uniform vec3 uBevelShade;
  uniform float uBevelWidth;
  uniform float uBevelFloor;
  uniform float uBevelStrength;
  uniform vec3 uNeon;
  uniform float uNeonMinor;
  uniform float uNeonMajor;
  uniform float uNeonEdge;
  uniform float uNeonFocus;
  // PASS 5. Zero on every screen-space board (the stone one, and pass 4's
  // themed one); a world half-width in CELLS once the seam is a real gap.
  uniform float uNeonWorld;
  uniform float uNeonWorldFloor;
  varying vec2 vCell;

  /**
   * The bevel is a SURFACE, not a cut, so its two halves composite far closer
   * to each other than a channel's walls do: a rolled edge that only ever goes
   * dark is a smudge, and the lit half of the roll is the entire reason a cell
   * reads as raised.
   */
  const float BEVEL_SHADE_WEIGHT = 1.25;
  const float BEVEL_LIGHT_WEIGHT = 0.8;

  /**
   * The filament and its skirt. One coverage produces both: a narrow bright
   * core in the bottom of the cut, and a soft spill a little way up its walls.
   * The glow is COMPOSITING, not a post pass - the bloom budget is fixed and
   * this pass does not spend any of it beyond what the composer already runs.
   */
  const float NEON_CORE_GAIN = 2.0;
  const float NEON_SKIRT_GAIN = 0.35;

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

  /**
   * The tile's rolled edge - a WIDE, SOFT version of the same shading the
   * channel wall gets, and it is the same physical surface: if the cells are
   * pads and the seam between them is the recess, then the roll IS the top of
   * the groove's wall. So it takes the same sign convention (the roll faces
   * -sign(offset), away from the cell centre) and the same lamp, and the two
   * layers line up into one continuous profile - flat centre, soft roll, hard
   * cut, lit far wall - instead of two effects sitting on top of each other.
   *
   * The lit term is NOT squared the way carve()'s is. A cut wants its shadow
   * pinned to the bottom of the channel; a roll wants a smooth falloff,
   * because that is what a chamfer under a raking light does.
   */
  vec4 roll(vec2 offset, vec2 lift, float strength) {
    float reach = max(lift.x, lift.y);
    if (reach <= 0.0) return vec4(0.0);
    float facing = (
      -sign(offset.x) * uLight.x * lift.x
      - sign(offset.y) * uLight.y * lift.y
    ) / max(reach, 1e-4);
    float lit = clamp(0.5 + 0.5 * facing, 0.0, 1.0);
    return vec4(
      mix(uBevelShade, uBevelLight, lit),
      min(1.0, reach * strength * mix(BEVEL_SHADE_WEIGHT, BEVEL_LIGHT_WEIGHT, lit))
    );
  }

  /** Restrained neon living in the bottom of a cut. See NEON_CORE_GAIN. */
  vec4 neonFill(vec2 coverage, float intensity) {
    if (intensity <= 0.0) return vec4(0.0);
    float reach = max(coverage.x, coverage.y);
    if (reach <= 0.0) return vec4(0.0);
    float core = pow(reach, uNeonFocus);
    float skirt = reach * reach;
    return vec4(
      uNeon,
      clamp(
        core * intensity * NEON_CORE_GAIN + skirt * intensity * NEON_SKIRT_GAIN,
        0.0,
        1.0
      )
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

    // THE TILE BEVEL, first, because it is the widest layer and everything
    // else is cut INTO it. World-anchored half-width with a screen-space
    // floor - see TILE_BEVEL_WIDTH.
    if (uBevelStrength > 0.0) {
      vec2 bevelHalfWidth = max(vec2(uBevelWidth), cellWidth * uBevelFloor);
      vec2 lift = vec2(
        1.0 - smoothstep(0.0, bevelHalfWidth.x, abs(minorOffset.x)),
        1.0 - smoothstep(0.0, bevelHalfWidth.y, abs(minorOffset.y))
      );
      over(color, alpha, roll(minorOffset, lift, uBevelStrength));
    }

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

    // THE NEON, last, because it is light and light sits on top of shading.
    // Deliberately NOT equal on every edge: a per-cell seam gets a whisper,
    // the emphasis grid carries the theme, and the PERIMETER carries the most
    // of all - that band is the boundary a player is judging their distance
    // to, and it is the one line on this board that is worth a glow.
    //
    // PASS 5. When the seam is a real gap the filament is sized in WORLD
    // units, because it is now lying in a channel that has a real width - a
    // core pinned to a pixel count would be a hairline down the middle of a
    // 6px trench at desk scale and would fill it on a phone. The derivative
    // floor survives as a floor only, for the zoomed-out case where the whole
    // seam falls under two pixels.
    if (uNeonMinor > 0.0 || uNeonMajor > 0.0 || uNeonEdge > 0.0) {
      bool worldNeon = uNeonWorld > 0.0;
      vec2 neonHalf = worldNeon
        ? max(vec2(uNeonWorld), cellWidth * uNeonWorldFloor)
        : cellWidth * uMinorWidth;
      vec2 neonHalfMajor = worldNeon
        ? neonHalf / uMajorEvery
        : majorWidth * uMajorWidth;

      vec2 neonMinorCoverage = worldNeon
        ? vec2(
            channel(minorOffset.x, neonHalf.x),
            channel(minorOffset.y, neonHalf.y)
          )
        : minorCoverage;
      vec2 neonMajorCoverage = worldNeon
        ? vec2(
            channel(majorOffset.x, neonHalfMajor.x),
            channel(majorOffset.y, neonHalfMajor.y)
          )
        : majorCoverage;

      over(color, alpha, neonFill(neonMinorCoverage, uNeonMinor));
      over(color, alpha, neonFill(neonMajorCoverage, uNeonMajor));

      vec2 border = min(cell, vec2(uGrid) - cell);
      vec2 edgeHalf = worldNeon
        ? neonHalf * 1.35
        : cellWidth * uMajorWidth * 1.35;
      vec2 edgeCoverage = vec2(
        channel(border.x, edgeHalf.x),
        channel(border.y, edgeHalf.y)
      );
      over(color, alpha, neonFill(edgeCoverage, uNeonEdge));
    }

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

/**
 * THE FILAMENT, once the seam is a real gap - half-width in CELLS.
 *
 * After pass 6 this sizes the PERIMETER light and, under the compare toggle,
 * every seam again. A core two fifths of the seam wide (this, doubled) leaves
 * dark groove floor on BOTH sides of the light, and `NEON_FOCUS` keeps it
 * concentrated in the middle - which is what a filament lying in the bottom of
 * a channel looks like. Filling the floor edge to edge instead produces a lit
 * slot, which is a different object.
 *
 * EXPRESSED AS A FRACTION OF THE SEAM, not as the 0.028 it was reviewed at -
 * which is the same number, because 0.028 was exactly a fifth of the 0.14 seam
 * of the day. Round 3 tightened the seam to 0.11, and a filament pinned to an
 * absolute width would have quietly grown from two fifths of the floor to more
 * than half of it. The authored intent is a RATIO; writing the ratio is what
 * makes the next seam change safe.
 */
const NEON_CORE_HALF_WIDTH = SEAM_WIDTH * 0.2;

/** Below ~2px of seam the world width would shimmer; this is the floor. */
const NEON_WORLD_PIXEL_FLOOR = 1.1;

/**
 * How much louder the neon has to be once it lives in a real recess.
 *
 * MEASURED, NOT REASONED. The first draft assumed a channel would HIDE light
 * and multiplied everything up. The opposite happened: the theme's numbers
 * were authored to composite over a ~2px line, the seam is now a ~6px band, so
 * the same intensity delivers roughly three times the light and the first
 * render came back as a glowing wire grid laid over stone - the exact "every
 * edge glowing" failure the brief drew a line under. The emphasis and edge
 * classes therefore come DOWN.
 *
 * The minor class still goes up, and that is not a contradiction: a per-cell
 * seam at 0.02 was a number chosen to be invisible next to a bright grid, and
 * with the grid quiet it has room to be the whisper it is described as.
 *
 * The net is a COMPRESSED spread - the theme's 30:1 becomes about 5:1 - which
 * is what the geometry bought. Structure is carried by depth now, so it does
 * not also have to be carried by brightness.
 *
 * MAJOR AND EDGE TAKE THE SAME GAIN, deliberately. Two different gains reorder
 * any theme whose own spread between those classes is narrower than the gains'
 * ratio - measured, DARK NEON's 0.40 and 0.46 flip under 1.6/1.3, which would
 * hand one dynasty a perimeter quieter than its own emphasis grid. Equal gains
 * cannot: scaling two numbers by one factor preserves their order for every
 * theme that will ever be written here. That property belongs in the code, not
 * in a comment asking the next author to re-check three hexes.
 *
 * PASS 6 leaves the numbers standing and narrows their reach. `edge` is the
 * only one the default board reads; `minor` and `major` are the compare
 * toggle's, and they are kept at exactly the values the owner reviewed so the
 * A/B shows him the board he saw.
 */
const NEON_TILED_GAIN = { minor: 3.1, major: 0.85, edge: 0.85 } as const;

/**
 * Build the one-draw stone board face (checker + carved cell grooves), and -
 * when a neon theme is supplied - the tile bevel and the neon in the seams,
 * in the SAME draw call. The extra identity costs zero draws, zero
 * postprocessing and one fragment branch.
 *
 * `tiled` is pass 5: the real tile field is standing over this plane, so the
 * two layers that were STANDING IN for geometry - the checker's tonal lift and
 * the shader roll that turned a cell into a pad - are switched off rather than
 * drawn underneath blocks that already are what they were imitating.
 *
 * `seamLines` is pass 6, and it goes further: with it false - the default, and
 * the board the ruling describes - a tiled board also stops CARVING and stops
 * lighting every interior boundary. The carve was the last drawn gridline on
 * this surface and the easiest to overlook, because it is shading rather than
 * a stroke: two shaded walls painted into the sliver of groove floor the
 * blocks leave visible, at 1.15 and 1.45 screen-space derivatives, i.e. a
 * ~2px line down the middle of a ~6px seam. A drawn line is a drawn line
 * whether it is inked, lit or shaded.
 *
 * WHAT SURVIVES ON A LINE-FREE TILED BOARD: `uNeonEdge`, and nothing else. The
 * pass discards every fragment that is not within a hair of the perimeter, so
 * it costs one nearly-empty draw and buys the board's edge light.
 */
export function createArenaBoardMaterial(
  gridSize: number,
  checkColor: string,
  grooveLightColor: string,
  minorAlpha: number,
  majorAlpha: number,
  theme?: BoardTheme | null,
  tiled = false,
  seamLines = false
): THREE.ShaderMaterial {
  const neonIntensity = (value: number, gain: number): number =>
    THREE.MathUtils.clamp(value * (tiled ? gain : 1), 0, 1);
  /**
   * The ruling applies to a board made of BLOCKS. A stone board's grooves are
   * the only boundary it has, so `seamLines` cannot reach it - which is also
   * what keeps the shipped path byte-identical through this change.
   */
  const lineFree = tiled && !seamLines;
  return new THREE.ShaderMaterial({
    uniforms: {
      uGrid: { value: gridSize },
      uMajorEvery: { value: MAJOR_EVERY },
      uGrooveShadow: { value: new THREE.Color(theme?.grooveShadow ?? INK) },
      uGrooveLight: { value: new THREE.Color(grooveLightColor) },
      uCheck: { value: new THREE.Color(checkColor) },
      uCheckAlpha: { value: tiled ? 0 : (theme?.checkerAlpha ?? CHECKER_ALPHA) },
      // The carve. Zero on a line-free board: a shaded channel painted where
      // a real channel already is, is a gridline drawn over a seam.
      uMinorAlpha: {
        value: lineFree ? 0 : THREE.MathUtils.clamp(minorAlpha, 0, 1),
      },
      uMajorAlpha: {
        value: lineFree ? 0 : THREE.MathUtils.clamp(majorAlpha, 0, 1),
      },
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
      // Inert without a theme: strength 0 skips the branch entirely.
      uBevelLight: { value: new THREE.Color(theme?.tileBevelLight ?? INK) },
      uBevelShade: { value: new THREE.Color(theme?.tileBevelShade ?? INK) },
      uBevelWidth: { value: TILE_BEVEL_WIDTH },
      uBevelFloor: { value: TILE_BEVEL_PIXEL_FLOOR },
      uBevelStrength: {
        value: tiled
          ? 0
          : THREE.MathUtils.clamp(theme?.tileBevelStrength ?? 0, 0, 1),
      },
      uNeon: { value: new THREE.Color(theme?.neon ?? INK) },
      // The filament, per seam class. The two INTERIOR classes are the
      // gridlines the ruling names; the perimeter is the board's edge and
      // survives at full authored strength.
      uNeonMinor: {
        value: lineFree
          ? 0
          : neonIntensity(theme?.neonMinor ?? 0, NEON_TILED_GAIN.minor),
      },
      uNeonMajor: {
        value: lineFree
          ? 0
          : neonIntensity(theme?.neonMajor ?? 0, NEON_TILED_GAIN.major),
      },
      uNeonEdge: {
        value: neonIntensity(theme?.neonEdge ?? 0, NEON_TILED_GAIN.edge),
      },
      uNeonFocus: { value: NEON_FOCUS },
      uNeonWorld: { value: tiled ? NEON_CORE_HALF_WIDTH : 0 },
      uNeonWorldFloor: { value: NEON_WORLD_PIXEL_FLOOR },
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

/**
 * PASS 6, the ink hierarchy REDUCED TO ITS TOP WEIGHT.
 *
 * "Thick near-black outline around the silhouette... thinner dark internal
 * lines separate... body cubes, material boundaries." Pass 5 spent both: the
 * slab took the bold line and all 400 tiles took the thin one. The owner's
 * ruling retires the second - "the tiles already provide for proper
 * orientation" - and the guide permits that, because the internal line is
 * offered as a way to separate parts, not required wherever parts meet.
 *
 * What is left is the CHARACTER OUTLINE: one bold line around the whole board,
 * at 0.11 cells (~4.7px at desk scale), emphatically not the "1px technical
 * edge" the guide forbids. It is what separates this object from the void, and
 * with nothing else on the board outlined it is unambiguous.
 *
 * `tileHullMaterial` remains for the compare toggle only.
 *
 * Module singletons: a material per mount would recompile the hull program on
 * every theme flip, and these carry no theme state - ink is ink.
 */
const boldFloorHullMaterial = createInkHullMaterial(SLAB_INK_WIDTH);
const tileHullMaterial = createInkHullMaterial(TILE_INK_WIDTH);

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
  neonTheme = null,
  seamLines = false,
}: ArenaFloorProps) {
  const center = gridSize / 2;
  const apron = SLAB_APRON[surfacePreset];

  /**
   * A theme replaces the tones, never the object. Everything resolved here is
   * a COLOUR or a WEIGHT; the span, the apron, the thickness, the chamfer and
   * every screen-space width above are untouched, which is what makes the
   * three themes the same board.
   */
  /**
   * PASS 5. The tile field is the themed board's entire structure, so it is
   * not optional within a theme - "identity at every tier" is the governor's
   * own law and the blocks ARE the identity. `tiled` is therefore exactly
   * `theme !== null`, and every geometry decision below reads from this one
   * boolean rather than re-testing the theme.
   */
  const tiled = neonTheme !== null && neonTheme !== undefined;

  /**
   * THE RECESS. On a tiled board the slab drops by exactly one seam depth so
   * the tile TOPS land at y = 0 - the plane `FLOOR_TOP_Y`, `FLOOR_CLEARANCE`
   * and every object that stands on this board were authored against. The
   * board grew a third dimension without a single consumer of this file
   * learning a new number.
   */
  const slabY = tiled ? -SEAM_DEPTH : 0;

  /**
   * A tiled board's slab top face IS the groove floor, so it takes the seam
   * tone rather than the play-surface tone. `face` stays what it always was -
   * the surface the game is read against - it has simply moved up onto the
   * blocks.
   */
  const playSurface = neonTheme?.face ?? floorColor;
  const seamFloor = neonTheme?.grooveShadow ?? floorColor;
  const faceColor = tiled ? seamFloor : playSurface;
  const checkColor = neonTheme?.checker ?? gridColor;
  const cutColor = neonTheme?.grooveLight ?? majorGridColor;
  const minorDepth = neonTheme?.minorDepth ?? minorGridOpacity;
  const majorDepth = neonTheme?.majorDepth ?? majorGridOpacity;
  const washColor = neonTheme?.edgeWash ?? accentColor;
  const washStrength = neonTheme?.edgeWashStrength ?? edgeWashStrength;
  const bevelTone = neonTheme?.bevel ?? ARENA_STONE.bevel;
  const sideTone = neonTheme?.side ?? ARENA_STONE.side;
  const baseTone = neonTheme?.base ?? ARENA_STONE.base;
  const haloTone = neonTheme?.halo ?? ARENA_STONE.halo;

  // Dynasty-tinted emissive wash: transparent at center, faint glow toward
  // the edges, so the board participates in the dynasty theme and its edge
  // reads as lit rather than cut out. The gradient is analytic in the fragment
  // shader: there is no bitmap resolution to reveal when the viewport grows.
  const edgeWashMaterial = useMemo(
    () => createArenaEdgeWashMaterial(washColor, washStrength),
    [washColor, washStrength]
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
        checkColor,
        cutColor,
        minorDepth,
        majorDepth,
        neonTheme,
        tiled,
        seamLines
      ),
    [
      gridSize,
      checkColor,
      cutColor,
      minorDepth,
      majorDepth,
      neonTheme,
      tiled,
      seamLines,
    ]
  );

  /**
   * THE TILE FIELD, built once per theme. Null on the stone board, where
   * nothing here is mounted and nothing here is paid for. Its ink hull is
   * built only when the compare toggle asks for one - see `BoardTileField`.
   */
  const tileField = useMemo(
    () =>
      neonTheme ? createBoardTileField(gridSize, neonTheme, { seamLines }) : null,
    [gridSize, neonTheme, seamLines]
  );

  /**
   * The board's cel ramp: three AUTHORED tones rather than three brightnesses,
   * through the same four-character gradient patch the 90s snake uses. Board
   * and character band through one mechanism, which is the mechanical half of
   * "drawn by the same hand".
   */
  const celRamp = useMemo(
    () => (neonTheme ? createBoardCelRamp(neonTheme) : null),
    [neonTheme]
  );

  /**
   * ONE material for 400 blocks. `vertexColors` carries the guide's three
   * orientation-keyed tones (see `toneForFace`) and the ramp bands them; the
   * material colour stays white so the geometry alone decides what each face
   * is made of, exactly as the slab does.
   *
   * No emissive. The slab lifts its unlit faces to keep a silhouette against
   * the void; a tile is never against the void - it is against the tile beside
   * it - and a flat lift there would fill the seams with the one thing the
   * seams must not have.
   */
  const tileMaterial = useMemo(() => {
    if (!neonTheme || !celRamp) return null;
    const material = new THREE.MeshToonMaterial({
      color: '#ffffff',
      vertexColors: true,
      gradientMap: getToonGradientMap(),
    });
    applyBoardCelShading(material, neonTheme, celRamp);
    return material;
  }, [neonTheme, celRamp]);

  const slabGeometry = useMemo(
    () =>
      createArenaSlabGeometry(gridSize + apron * 2, SLAB_THICKNESS, SLAB_CHAMFER, {
        face: faceColor,
        bevel: bevelTone,
        side: sideTone,
        base: baseTone,
      }),
    [gridSize, apron, faceColor, bevelTone, sideTone, baseTone]
  );

  /**
   * The lit fill. Toon, so the tile bands like the creature standing on it -
   * and because a hard step between the top face, the chamfer and each side
   * face is exactly how a drawn object shows that it has volume. `vertexColors`
   * multiplies the per-face tone in; the material colour stays white so the
   * geometry alone decides what each face is made of.
   */
  const haloMaterial = useMemo(
    () => createArenaHaloMaterial(haloTone, 1 / HALO_REACH, HALO_STRENGTH),
    [haloTone]
  );

  const slabMaterial = useMemo(() => {
    const material = new THREE.MeshToonMaterial({
      color: '#ffffff',
      vertexColors: true,
      gradientMap: getToonGradientMap(),
      emissive: sideTone,
      emissiveIntensity: SLAB_EMISSIVE_LIFT,
    });
    // The body a tiled board's blocks stand in has to band like they do, or
    // the seam floor and the apron read as a different material from the
    // tiles two hundredths of a unit above them.
    if (neonTheme && celRamp) applyBoardCelShading(material, neonTheme, celRamp);
    return material;
  }, [sideTone, neonTheme, celRamp]);

  useEffect(() => {
    return () => {
      edgeWashMaterial.dispose();
      boardMaterial.dispose();
      slabMaterial.dispose();
      haloMaterial.dispose();
      tileMaterial?.dispose();
    };
  }, [edgeWashMaterial, boardMaterial, slabMaterial, haloMaterial, tileMaterial]);

  useEffect(() => {
    return () => {
      slabGeometry.dispose();
    };
  }, [slabGeometry]);

  useEffect(() => {
    return () => {
      tileField?.field.dispose();
      tileField?.hull?.dispose();
    };
  }, [tileField]);

  useEffect(() => {
    return () => {
      celRamp?.dispose();
    };
  }, [celRamp]);

  const slabSpan = gridSize + apron * 2;

  return (
    <group>
      {/*
        The float halo. It belongs to the SLAB, not to the cockpit chassis that
        used to host it: it is the cue that says the tile is floating, and a
        tile floats in the rollback path too. Sized from this arena's own span
        and apron, so the released preset gets a halo that fits its smaller
        tile instead of the cockpit's. It travels with the slab into the recess:
        the halo describes the underside of THAT object.
      */}
      <mesh
        position={[center, slabY - SLAB_THICKNESS * 0.88, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={haloMaterial}
      >
        <planeGeometry args={[slabSpan * HALO_REACH, slabSpan * HALO_REACH]} />
      </mesh>

      {/*
        The slab: one stone body with thickness, wearing the board's ink. On a
        tiled board it is the plinth the blocks stand in and the margin around
        them, and it carries the BOLD line of the two-weight ink hierarchy,
        because this silhouette is where the board meets the void.
      */}
      <mesh
        position={[center, slabY, center]}
        geometry={slabGeometry}
        material={slabMaterial}
        receiveShadow
      >
        <mesh
          geometry={slabGeometry}
          material={tiled ? boldFloorHullMaterial : floorHullMaterial}
          renderOrder={-1}
        />
      </mesh>

      {/*
        Checker + carved cell grooves + emphasis every 5, in one pass. On a
        tiled board this plane is the bottom of the trench: the blocks above it
        mask it down to exactly the seams, for free, by depth alone - which is
        why the neon needs no mask of its own and why it can never leak onto a
        surface the snake is read against.

        On a LINE-FREE tiled board every layer in that list is off and the pass
        discards all but a hair of perimeter - it is the board's edge light and
        nothing else. Still mounted, because that edge light is the one thing
        the ruling explicitly leaves standing.
      */}
      <mesh
        position={[center, slabY + FLOOR_GRAPHICS_TOP_Y, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={boardMaterial}
      >
        <planeGeometry args={[gridSize, gridSize]} />
      </mesh>

      {/*
        THE TILE FIELD. 400 chamfered blocks in one geometry, ONE draw. It
        receives shadow - the snake's shadow lands on the surface the snake
        stands on - and casts none: a block 0.22 tall under a lamp this steep
        casts about a pixel, and buying that pixel would mean a second pass
        over 8k triangles.

        No ink. The thin internal line is retired by the line-free ruling and
        returns only with the compare toggle, which is also the only case in
        which a hull geometry exists to draw.
      */}
      {tileField && tileMaterial && (
        <mesh
          position={[center, 0, center]}
          geometry={tileField.field}
          material={tileMaterial}
          receiveShadow
        >
          {tileField.hull && (
            <mesh
              geometry={tileField.hull}
              material={tileHullMaterial}
              renderOrder={-1}
            />
          )}
        </mesh>
      )}

      {/*
        Dynasty edge wash - additive so it glows over the board surface. On a
        tiled board it sits UNDER the blocks, with the neon, for the reason
        documented above: additive light over an albedo this dark is not a tint
        but a doubling, and the only place on this board where that is welcome
        is the bottom of a groove.
      */}
      <mesh
        position={[center, tiled ? slabY + 0.006 : 0.006, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={edgeWashMaterial}
      >
        <planeGeometry args={[gridSize, gridSize]} />
      </mesh>
    </group>
  );
}

export default ArenaFloor;
