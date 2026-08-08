/**
 * THE BUTTON IS A SEGMENT OF THE SNAKE.
 *
 * Owner ruling, 2026-08-08, replacing both earlier button rounds outright:
 *
 *   "the buttons could look like the segments of the snake, i.e. cubes, that'd
 *    make more sense, and then we have synergies from doing the cubes of the
 *    snake anyways in this round. and will make it very coherent, a great
 *    composition."
 *
 * So a Home control is not a rectangle wearing a decoration. It is one of the
 * creature's own cubes, drawn by the creature's own law, and the only thing
 * that distinguishes it from a segment on the board is that it has a glyph on
 * its front face and it presses.
 *
 * ── WHY THIS IS DRAWN HERE RATHER THAN RENDERED ──────────────────────────
 *
 * The obvious move is a second WebGL surface — a live canvas, or the
 * snapshot-to-PNG trick `DynastySnakePortrait` already ships. Both were
 * rejected for the same reason, and it is not cost:
 *
 *   A NAVIGATION CONTROL MAY NOT DEPEND ON A GPU. The portraits are
 *   decoration beside a fully-labelled button and are allowed to fail to
 *   nothing (doctrine principle 1). PLAY is not decoration. A capture that has
 *   not happened yet is a button with no face for a frame, and a capture that
 *   fails is a button with no face at all — so a canvas path needs a drawn
 *   fallback anyway, and once the drawn fallback exists and is correct, the
 *   canvas is a second implementation of a thing that already works.
 *
 * What makes the drawn cube legitimate is that NOTHING HERE IS AUTHORED BY
 * EYE. Every number below is read out of `snake90s.ts`:
 *
 *   - the SILHOUETTE is the chamfered cube the board builds, at the profile's
 *     own `bodySize`/`headSize` and `bodyBevelRadius`/`headBevelRadius`;
 *   - the ANGLE is the ratified hero angle the Specimen Chamber and the Setup
 *     portraits already share, so a button, a portrait and the chamber's
 *     creature are three views of one object rather than three drawings;
 *   - the BANDS are assigned by the shipped shader's own branch, evaluated on
 *     each facet's normal — the identical `edgeness`/`top`/`down`/key test in
 *     `faceFragmentBody`, ported once and pinned by a test;
 *   - the COLOURS run the same arithmetic the GPU runs: base x tone.mul +
 *     tone.add in LINEAR space, plus the material's emissive, then ACES
 *     filmic tone mapping and the sRGB transfer — because that is what the
 *     renderer does, and a colour picked to "look like" the render is exactly
 *     the drift this module exists to prevent;
 *   - the top-lit FALL is carried as a linear gradient per band, because it is
 *     a linear function of object-space Y and object-space Y projects to a
 *     straight line on screen.
 *
 * The pipeline was VERIFIED against the live chamber rather than asserted:
 * pixels sampled off a rendered frame of the real creature agree with the
 * values computed here to within a unit or two per channel on every band. That
 * measurement is the fixture in `snakeCubeArt.test.ts`, and it is what makes
 * "the same material" a claim with evidence behind it.
 *
 * ── THE HEAD LEADS THE ROW ────────────────────────────────────────────────
 *
 * PLAY is the head cube and the other controls are body cubes. That is not a
 * decoration of the hierarchy, it IS the hierarchy, and the creature already
 * states it: the head is a larger cube (0.9 against 0.78) on a brighter base
 * with far more emissive (x0.6 against x0.22). The owner's alternative — a
 * fused two-cube row for the wide button — is available in `cubeRowArt` and is
 * not used on the rail, because a row makes PLAY wider where the creature
 * makes its lead segment BIGGER, and the second reading is the one the
 * character sheet actually draws.
 */

import type { DynastyId } from '@/shared/types/game';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';
import {
  GUIDE_PALETTE,
  SNAKE_FACE_CUTS,
  SNAKE_FACE_TONES,
  SNAKE_STYLE_PROFILE,
  resolveSnakeEmissiveColor,
  type FaceTone,
  type SnakeFaceToneSet,
  type SnakeSegmentRole,
  type SnakeStyleProfile,
} from '@/components/game/screen/snake90s';

// -----------------------------------------------------------------------------
// The ratified hero angle
// -----------------------------------------------------------------------------

/**
 * The chamber's own camera, in radians — ~17 degrees above the eye line and
 * ~19.5 degrees round.
 *
 * These are not new numbers and must not become new numbers: they are the pair
 * `SpecimenChamber` settled over three passes and `DynastySnakePortrait`
 * already copies verbatim, with the note that "a second surface drawing the
 * same creature at a second angle would be two products". A button is a third
 * such surface.
 */
export const CUBE_VIEW_ELEVATION = 0.3;
export const CUBE_VIEW_AZIMUTH = 0.34;

/** Which of the five authored bands a facet belongs to. */
export type CubeBand = 'rim' | 'top' | 'side' | 'away' | 'down';

const BAND_ORDER: readonly CubeBand[] = ['rim', 'top', 'side', 'away', 'down'];

// -----------------------------------------------------------------------------
// Colour — the renderer's own pipeline, in TypeScript
// -----------------------------------------------------------------------------

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

type Rgb = readonly [number, number, number];

function hexToLinear(hex: string): Rgb {
  const n = hex.replace('#', '');
  return [0, 2, 4].map((i) => srgbToLinear(parseInt(n.slice(i, i + 2), 16) / 255)) as
    unknown as Rgb;
}

function linearToHex(c: Rgb): string {
  return (
    '#' +
    c
      .map((v) => {
        const s = Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255);
        return s.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

/**
 * three.js `ACESFilmicToneMapping`, transcribed from `tonemapping_pars_fragment`.
 *
 * It is here because the renderer applies it and the material does not opt out
 * (`toneMapped` is only turned off on the ink hull, which is why the ink below
 * is the guide's swatch EXACTLY and the lit bands are not). Leaving it out
 * shifted every band by four to nine units per channel against the measured
 * frame — visible, and in the direction that makes a drawn copy look like a
 * different, hotter material.
 *
 * The matrices are written as GLSL writes them: each `Rgb` is a COLUMN.
 */
const ACES_INPUT: readonly Rgb[] = [
  [0.59719, 0.076, 0.0284],
  [0.35458, 0.90834, 0.13383],
  [0.04823, 0.01566, 0.83777],
];
const ACES_OUTPUT: readonly Rgb[] = [
  [1.60475, -0.10208, -0.00327],
  [-0.53108, 1.10813, -0.07276],
  [-0.07367, -0.00605, 1.07602],
];

function applyMatrix(m: readonly Rgb[], v: Rgb): Rgb {
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

function rrtAndOdtFit(v: Rgb): Rgb {
  return v.map((x) => {
    const a = x * (x + 0.0245786) - 0.000090537;
    const b = x * (0.983729 * x + 0.432951) + 0.238081;
    return a / b;
  }) as unknown as Rgb;
}

/** `toneMappingExposure` is left at the renderer's default of 1. */
function acesFilmic(color: Rgb): Rgb {
  const scaled = color.map((x) => (x * 1) / 0.6) as unknown as Rgb;
  return applyMatrix(ACES_OUTPUT, rrtAndOdtFit(applyMatrix(ACES_INPUT, scaled))).map(
    (x) => Math.min(1, Math.max(0, x))
  ) as unknown as Rgb;
}

/**
 * One band's colour at one height on the cube.
 *
 * This IS `faceFragmentBody`'s last line —
 * `diffuseColor.rgb * toneMul + toneAdd` — plus the emissive the toon material
 * adds unconditionally, plus the fall. The fall scales the tone terms and
 * never the emissive, exactly as the shader does it, which is the reason a
 * shaded face never goes darker than the flat glow underneath it.
 *
 * @param y Object-space height, -0.5 at the bottom of the cube to +0.5 at the top.
 */
function bandColorAt(
  base: Rgb,
  emissive: Rgb,
  emissiveIntensity: number,
  tone: FaceTone,
  fall: number,
  y: number
): string {
  const f = 1 - fall * (0.5 - y);
  const add = tone.add ?? ([0, 0, 0] as const);
  const lit: Rgb = [0, 1, 2].map(
    (i) => base[i] * tone.mul[i] * f + add[i] * f + emissive[i] * emissiveIntensity
  ) as unknown as Rgb;
  return linearToHex(acesFilmic(lit));
}

// -----------------------------------------------------------------------------
// The shader's own branch
// -----------------------------------------------------------------------------

/**
 * Which band a facet takes, from its normal.
 *
 * Ported line for line from `faceFragmentBody`, including the two subtleties
 * that block was written to record: `edgeness` is asked of the OBJECT normal
 * (a chamfer is a chamfer however the object is turned) and the rim carries its
 * own floor so a downward-tilted chamfer falls through to `down` instead of
 * drawing a bright line under every vertical face.
 *
 * A button is never rotated, so object and world normals coincide and the two
 * frames the shader carries collapse into one here. The port keeps them
 * separate in NAME so a reader can check it against the shader without holding
 * that fact in their head.
 */
export function classifyFacet(normal: Rgb): CubeBand {
  const [nx, ny, nz] = normal;
  const edgeness =
    1 - Math.max(Math.abs(nx), Math.max(Math.abs(ny), Math.abs(nz)));
  if (edgeness > SNAKE_FACE_CUTS.rim && ny > SNAKE_FACE_CUTS.rimFloor) return 'rim';
  if (ny > SNAKE_FACE_CUTS.top) return 'top';
  if (ny < SNAKE_FACE_CUTS.down) return 'down';
  const [kx, kz] = SNAKE_FACE_CUTS.key;
  return nx * kx + nz * kz >= 0 ? 'side' : 'away';
}

// -----------------------------------------------------------------------------
// Geometry
// -----------------------------------------------------------------------------

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];

interface Facet {
  readonly normal: Vec3;
  readonly points: readonly Vec3[];
}

/**
 * The chamfered cube, as facets.
 *
 * `bodyBevelRadius` is documented as "a wide single chamfer ... the ring it
 * creates is where the RIM band lives", so the drawn solid is the exact same
 * construction: six shrunken faces, twelve 45-degree edge bands, eight corner
 * triangles. The board's mesh rounds that chamfer over two quads; both quads
 * take the rim band by `SNAKE_FACE_CUTS.rim`, so a single flat band is what
 * the two of them RESOLVE to and drawing them separately would only add
 * vertices that carry no colour information.
 *
 * @param chamfer The bevel leg as a fraction of the full edge.
 */
function chamferedCube(chamfer: number): Facet[] {
  const h = 0.5;
  const inner = h - chamfer;
  const facets: Facet[] = [];
  const axes: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  const at = (i: number, a: number, j: number, b: number, k: number, c: number): Vec3 => {
    const p: [number, number, number] = [0, 0, 0];
    p[i] = a;
    p[j] = b;
    p[k] = c;
    return p;
  };

  // Six flat faces.
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    for (const s of [1, -1]) {
      const normal = axes[i].map((v) => v * s) as unknown as Vec3;
      facets.push({
        normal,
        points: [
          at(i, s * h, j, -inner, k, -inner),
          at(i, s * h, j, inner, k, -inner),
          at(i, s * h, j, inner, k, inner),
          at(i, s * h, j, -inner, k, inner),
        ],
      });
    }
  }

  // Twelve edge chamfers.
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const k = 3 - i - j;
      for (const si of [1, -1]) {
        for (const sj of [1, -1]) {
          const n: [number, number, number] = [0, 0, 0];
          n[i] = si / Math.SQRT2;
          n[j] = sj / Math.SQRT2;
          facets.push({
            normal: n,
            points: [
              at(i, si * h, j, sj * inner, k, -inner),
              at(i, si * h, j, sj * inner, k, inner),
              at(i, si * inner, j, sj * h, k, inner),
              at(i, si * inner, j, sj * h, k, -inner),
            ],
          });
        }
      }
    }
  }

  // Eight corner triangles.
  const r3 = 1 / Math.sqrt(3);
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        facets.push({
          normal: [sx * r3, sy * r3, sz * r3],
          points: [
            [sx * h, sy * inner, sz * inner],
            [sx * inner, sy * h, sz * inner],
            [sx * inner, sy * inner, sz * h],
          ],
        });
      }
    }
  }

  return facets;
}

/** Camera basis for the ratified angle. */
function viewBasis(): { toCamera: Vec3; right: Vec3; up: Vec3 } {
  const el = CUBE_VIEW_ELEVATION;
  const az = CUBE_VIEW_AZIMUTH;
  const toCamera: Vec3 = [
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  ];
  // right = normalize(worldUp x toCamera)
  const rx = toCamera[2];
  const rz = -toCamera[0];
  const rl = Math.hypot(rx, rz) || 1;
  const right: Vec3 = [rx / rl, 0, rz / rl];
  // up = toCamera x right
  const up: Vec3 = [
    toCamera[1] * right[2] - toCamera[2] * right[1],
    toCamera[2] * right[0] - toCamera[0] * right[2],
    toCamera[0] * right[1] - toCamera[1] * right[0],
  ];
  return { toCamera, right, up };
}

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Monotone-chain hull. The solid is convex, so this is its silhouette. */
function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (source: Vec2[]) => {
    const out: Vec2[] = [];
    for (const p of source) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) {
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(pts), ...build([...pts].reverse())];
}

// -----------------------------------------------------------------------------
// The art
// -----------------------------------------------------------------------------

export interface CubeGradient {
  readonly band: CubeBand;
  /** User-space gradient ends, in viewBox units. */
  readonly y0: number;
  readonly y1: number;
  /** The band at the cube's top edge and at its bottom edge. */
  readonly from: string;
  readonly to: string;
}

export interface CubeArt {
  readonly width: number;
  readonly height: number;
  readonly viewBox: string;
  /** The creature's own outline pass: the silhouette, worn as a band outside it. */
  readonly ink: { readonly d: string; readonly strokeWidth: number; readonly color: string };
  /** Front-facing facets only. The solid is convex, so they never overlap. */
  readonly facets: readonly { readonly d: string; readonly band: CubeBand }[];
  readonly gradients: readonly CubeGradient[];
  /**
   * The largest axis-aligned rectangle inside the projected FLAT front face,
   * in viewBox units. A glyph placed here cannot be eaten by a bevel band,
   * which is the kid-clear clause stated as geometry instead of as care.
   */
  readonly face: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface CubeArtOptions {
  readonly role?: SnakeSegmentRole;
  readonly dynasty?: DynastyId;
  /** How many fused cubes, laid along the creature's own travel axis. */
  readonly cubes?: number;
  /**
   * The style to draw, defaulting to the ACTIVE one so a button and the
   * creature standing above it can never be two different snakes.
   *
   * It is a parameter for the reason `resolveCubeEdge` is: the active style is
   * resolved once at module load from the URL, so under jest it is always
   * `classic` and the guide's own arithmetic would be unreachable by any test
   * that could exist. Passing the profile in makes the law testable against the
   * profile the guide is actually about.
   */
  readonly profile?: SnakeStyleProfile;
}

const artCache = new Map<string, CubeArt>();

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The drawn segment.
 *
 * Cached per (role, dynasty, count) at module scope: the geometry and the
 * colours are constants of the style, so every button on Home that wants a body
 * cube shares one object and the projection runs a handful of times per session.
 */
export function getSnakeCubeArt(options: CubeArtOptions = {}): CubeArt {
  const role: SnakeSegmentRole = options.role ?? 'body';
  const dynasty: DynastyId = options.dynasty ?? 'PRIMAL';
  const cubes = Math.max(1, Math.min(3, Math.round(options.cubes ?? 1)));
  const profile = options.profile ?? SNAKE_STYLE_PROFILE;
  const key = `${profile.id}|${role}|${dynasty}|${cubes}`;
  const cached = artCache.get(key);
  if (cached) return cached;

  const isHead = role === 'head';
  const size = isHead ? profile.headSize : profile.bodySize;
  const bevel = isHead ? profile.headBevelRadius : profile.bodyBevelRadius;
  // Everything below is expressed with the cube's own EDGE as the unit, so the
  // ink band and the chamfer keep the ratios the board draws them at whatever
  // pixel size the button is finally given.
  const chamfer = bevel / size;
  const inkRatio = profile.inkHullWidth / size;

  const surface = getGameMaterialProfile(dynasty).snake;
  // The forced-colour and emissive resolvers in `snake90s` read the ACTIVE
  // profile off the module, which is the one thing a profile parameter has to
  // route around. Same three lines, asked of the profile in hand.
  const forcedBase = isHead
    ? profile.forcedHeadBaseColor
    : profile.forcedBodyBaseColor;
  const base = hexToLinear(forcedBase ?? surface.baseColor);
  const emissive = hexToLinear(
    profile.forcedEmissiveColor ?? resolveSnakeEmissiveColor(surface.emissiveColor)
  );
  // `resolveSnakeEmissiveIntensity` reads the ACTIVE profile off the module, so
  // the scale is applied from the profile in hand instead — same arithmetic,
  // and it survives being asked about a style that is not the running one.
  const emissiveIntensity =
    (isHead ? surface.headEmissiveIntensity : surface.bodyEmissiveIntensity) *
    (profile.tones
      ? isHead
        ? profile.headEmissiveScale
        : profile.bodyEmissiveScale
      : 1);
  const tones: SnakeFaceToneSet = profile.tones ?? SNAKE_FACE_TONES;

  const { toCamera, right, up } = viewBasis();
  const project = (p: Vec3): Vec2 => [dot3(p, right), -dot3(p, up)];

  // The cubes of a row sit on the creature's travel axis (world X), touching:
  // a fused coil, which is what the guide draws and what the cube law's
  // "CLEARLY SEPARATED" floor permits at the top of the fusion range.
  const offsets = Array.from({ length: cubes }, (_, i) => i - (cubes - 1) / 2);

  const facets = chamferedCube(chamfer);
  const projectedAll: Vec2[] = [];
  const drawn: { d: string; band: CubeBand; depth: number }[] = [];

  for (const ox of offsets) {
    for (const facet of facets) {
      const pts = facet.points.map(
        (p) => [p[0] + ox, p[1], p[2]] as unknown as Vec3
      );
      for (const p of pts) projectedAll.push(project(p));
      if (dot3(facet.normal, toCamera) <= 1e-6) continue;
      const flat = pts.map(project);
      drawn.push({
        d:
          'M' +
          flat.map(([x, y]) => `${round(x)} ${round(y)}`).join('L') +
          'Z',
        band: classifyFacet(facet.normal),
        // Painter order along the view direction. A single convex solid does
        // not need it; a ROW of them does, where a near cube's chamfer overlaps
        // the far cube's.
        depth: pts.reduce((acc, p) => acc + dot3(p, toCamera), 0) / pts.length,
      });
    }
  }

  const hull = convexHull(projectedAll);
  const minX = Math.min(...projectedAll.map((p) => p[0])) - inkRatio;
  const maxX = Math.max(...projectedAll.map((p) => p[0])) + inkRatio;
  const minY = Math.min(...projectedAll.map((p) => p[1])) - inkRatio;
  const maxY = Math.max(...projectedAll.map((p) => p[1])) + inkRatio;

  // Object-space Y projects to a straight line on screen, so the fall's two
  // endpoints are two screen heights and one gradient serves every facet of a
  // band. These are the projections of y = +0.5 and y = -0.5.
  const yTop = project([0, 0.5, 0])[1];
  const yBottom = project([0, -0.5, 0])[1];

  const gradients: CubeGradient[] = BAND_ORDER.map((band) => ({
    band,
    y0: round(yTop),
    y1: round(yBottom),
    from: bandColorAt(base, emissive, emissiveIntensity, tones[band], tones.fall, 0.5),
    to: bandColorAt(base, emissive, emissiveIntensity, tones[band], tones.fall, -0.5),
  }));

  // The flat front face (+Z), inscribed. Its projection is a parallelogram; the
  // rectangle taken here is the intersection of its own bounding box with the
  // vertical strip its two side edges leave clear, so a glyph inside it is
  // clear of the chamfer at every column.
  const frontFace = facets.find((f) => f.normal[2] === 1);
  const frontPts = (frontFace?.points ?? []).map((p) =>
    project([p[0] + offsets[0], p[1], p[2]] as unknown as Vec3)
  );
  const frontRight = (frontFace?.points ?? []).map((p) =>
    project([p[0] + offsets[offsets.length - 1], p[1], p[2]] as unknown as Vec3)
  );
  const faceXs = [...frontPts, ...frontRight].map((p) => p[0]);
  const faceYs = [...frontPts, ...frontRight].map((p) => p[1]);
  const faceX0 = Math.min(...faceXs);
  const faceX1 = Math.max(...faceXs);
  // The parallelogram leans, so the safe height is its bbox less the lean.
  const lean = Math.abs(project([0, 0, 1])[1] - project([0, 0, 0])[1]) * 0;
  const faceY0 = Math.min(...faceYs) + lean;
  const faceY1 = Math.max(...faceYs) - lean;

  const art: CubeArt = {
    width: round(maxX - minX),
    height: round(maxY - minY),
    viewBox: `${round(minX)} ${round(minY)} ${round(maxX - minX)} ${round(maxY - minY)}`,
    ink: {
      d:
        'M' +
        hull.map(([x, y]) => `${round(x)} ${round(y)}`).join('L') +
        'Z',
      // Stroked at twice the hull width and centred on the silhouette, so
      // exactly `inkRatio` of it stands outside — which is what the inverted
      // hull produces and why the two read as the same line weight.
      strokeWidth: round(inkRatio * 2),
      color: profile.inkColor ?? GUIDE_PALETTE.ink,
    },
    facets: drawn
      .sort((a, b) => a.depth - b.depth)
      .map(({ d, band }) => ({ d, band })),
    gradients,
    face: {
      x: round(faceX0),
      y: round(faceY0),
      width: round(faceX1 - faceX0),
      height: round(faceY1 - faceY0),
    },
  };
  artCache.set(key, art);
  return art;
}

/**
 * The band colours at the cube's top and bottom edge, for a caller that needs
 * the material without the drawing — the pressed block under a cube is the
 * `down` band, because a shadow here is a darker, more saturated member of the
 * object's own hue and the creature has already authored which member that is.
 */
export function getSnakeCubeBandColors(
  options: Pick<CubeArtOptions, 'role' | 'dynasty'> = {}
): Record<CubeBand, { from: string; to: string }> {
  const art = getSnakeCubeArt(options);
  return Object.fromEntries(
    art.gradients.map((g) => [g.band, { from: g.from, to: g.to }])
  ) as Record<CubeBand, { from: string; to: string }>;
}
