'use client';

/**
 * SnakeCosmetics - INK & AMBER concept: composable cosmetic assets.
 *
 * STRUCTURAL CONTRACT (this is the point of the file, not the art):
 *
 * A cosmetic is never baked into the snake's geometry. It is its own
 * component, mounted at a NAMED ANCHOR on the creature, and it can be
 * added, removed, or exchanged one slot at a time:
 *
 *     <SnakeCosmetic slot="face">  <ShadesCosmetic />  </SnakeCosmetic>
 *     <SnakeCosmetic slot="crown"> <BraidsCosmetic /> </SnakeCosmetic>
 *
 * `EquippedCosmetics` drives that from a plain `CosmeticLoadout` object -
 * the same shape the `player_loadout` table already stores - so when the
 * cosmetics system lands, the concept translates without a rewrite and the
 * Home specimen's click target has something real to open.
 *
 * IDENTITY CONTINUITY (pass 3, new law).
 *
 * The chamber snake IS the played snake. `EQUIPPED_LOADOUT` below is the one
 * source both the Home portrait and the in-game board head read, so a
 * cosmetic cannot exist on one and not the other - the failure that makes a
 * pet feel like a menu illustration. See that constant for the production
 * path.
 *
 * TWO DETAIL LEVELS, ONE ASSET.
 *
 * A cosmetic authored for a 400px hero portrait is noise on a head that is
 * 17px wide during a run, and noise on the board is a READABILITY bug, not a
 * style opinion. So every cosmetic takes a `detail`:
 *
 *   'hero'   the portrait. Full part count.
 *   'board'  in play. Parts whose feature size falls under ~2px are dropped,
 *            and nothing may extend the head's footprint or hang below the
 *            board plane. What survives is what still says "that is MY
 *            snake" in peripheral vision: the crown pattern and one dark
 *            band across the eyes.
 *
 * Anchors are expressed in HEAD-LOCAL units. The head geometry is an exact
 * unit rounded box (extrema -0.5..0.5), so an anchor at z = 0.5 is exactly
 * the face plane at any head scale - which is why the identical component
 * mounts on a 0.92-scale portrait head and a 0.9-scale board head with no
 * per-surface tuning.
 *
 * Ink: every cosmetic part carries the same inverted-hull outline as the
 * board, at a FINER width. The hull shader divides its offset by world
 * scale, so a 0.18-wide braid bead and a 0.92-wide head would otherwise
 * carry an identical 2px line and the ink would swallow the small parts.
 * Fine detail gets a fine line; that is a drawing rule, not a cheat.
 *
 * Cost: concept-grade. Each part is its own mesh + hull. Production should
 * merge each cosmetic into one instanced pair (+2 draw calls per cosmetic);
 * nothing about the anchor contract changes when it does.
 */

import type { ReactNode } from 'react';
import * as THREE from 'three';
import { createExactUnitRoundedBoxGeometry } from '@/components/game/screen/gameRenderGeometry';
import {
  createInkHullMaterial,
  getToonGradientMap,
} from '@/components/game/screen/inkAmber';
import {
  applyFaceKeyedShading,
  BRAID_TONES,
  FLAT_TONES,
  IS_SNAKE_90S,
  SHADE_TONES,
  SNAKE_FACE_TONES,
  SNAKE_STYLE_PROFILE,
  type SnakeFaceToneSet,
} from '@/components/game/screen/snake90s';
import type { SnakeCosmeticSlot } from '@/shared/game/cosmeticSlots';
import type { SnakeCosmeticLoadout } from '@/lib/cosmetics/snakeCosmetics';

// -----------------------------------------------------------------------------
// Detail levels
// -----------------------------------------------------------------------------

/** Where the cosmetic is being drawn. See the file header. */
export type CosmeticDetail = 'hero' | 'board';

// -----------------------------------------------------------------------------
// Anchors - the mount points a cosmetic may attach to
// -----------------------------------------------------------------------------

/**
 * Slots that mount on the head. The server's snake vocabulary also contains
 * `food_skin`, which is worn by the FOOD and therefore has no head anchor —
 * it is absent from this table on purpose, not by omission.
 */
export type HeadCosmeticSlot = Extract<SnakeCosmeticSlot, 'face' | 'crown'>;

/** Base creature features a cosmetic may hide while it is equipped. */
export type CreatureFeature = 'eyes';

export interface CosmeticAnchorDef {
  /** Head-local mount point. */
  position: [number, number, number];
  /** Human-readable, for the appearance UI this concept is a substrate for. */
  label: string;
}

export const COSMETIC_ANCHORS: Record<HeadCosmeticSlot, CosmeticAnchorDef> = {
  /** The face plane, at the eye line. */
  face: { position: [0, 0.1, 0.5], label: 'Face' },
  /** The top plane, centred. */
  crown: { position: [0, 0.5, 0], label: 'Crown' },
};

export const HEAD_COSMETIC_SLOTS = Object.keys(
  COSMETIC_ANCHORS
) as HeadCosmeticSlot[];

/** Mounts one cosmetic at one named anchor. Nothing else may position them. */
export function SnakeCosmetic({
  slot,
  children,
}: {
  slot: HeadCosmeticSlot;
  children: ReactNode;
}) {
  return <group position={COSMETIC_ANCHORS[slot].position}>{children}</group>;
}

// -----------------------------------------------------------------------------
// Shared material / geometry vocabulary
// -----------------------------------------------------------------------------

/** The active style's cosmetic vocabulary, or null under the shipped style. */
const STYLE_COSMETICS = SNAKE_STYLE_PROFILE.cosmetics;

/** Voxel family: chunky rounding, same construction as the snake's own box. */
const partGeometry = createExactUnitRoundedBoxGeometry(0.14);
/** Flat plates (lenses, glints) round less so their edge stays a hard line. */
const plateGeometry = createExactUnitRoundedBoxGeometry(0.06);
/**
 * Braid blocks round LESS than the rest of the voxel family, and the reason is
 * the highlight rather than the shape.
 *
 * The 90s concept paints its bright edge onto the outer part of a chamfer, so
 * the chamfer's width IS the highlight's weight. On a body cube that reads as a
 * line. On a braid block, which is a fifth of the size and near-black, a
 * proportionally identical chamfer means the gold edge is most of what is left
 * of the block on screen and the braids come out grey-gold instead of black
 * with a lit edge. A tighter radius keeps the highlight a line on a black block
 * - which is what the sheet draws.
 */
const braidGeometry = createExactUnitRoundedBoxGeometry(
  STYLE_COSMETICS ? 0.09 : 0.14
);

/**
 * Ink widths, in world cells. The head carries 0.058; detail carries less.
 *
 * 90s CARTOON, round 2: the sheet inks the shades and the braid blocks as
 * boldly as it inks the head, because between them they are most of the
 * character's silhouette - so under the concept these step up with it.
 */
const SHADE_INK = STYLE_COSMETICS?.shadeInk ?? 0.03;
const BEAD_INK = STYLE_COSMETICS?.beadInk ?? 0.018;

const shadeHull = createInkHullMaterial(SHADE_INK);
const beadHull = createInkHullMaterial(BEAD_INK);

// -----------------------------------------------------------------------------
// THE EMBED RULE - a cosmetic INTERSECTS the head, it never rests on its skin.
//
// This is the fix for the reported artefact: a thin ragged ink line drawn
// across the forehead, just above the shades. It was neither z-fighting nor a
// stray mesh, and it is worth writing down exactly what it was, because the
// shape of the bug is the shape of the rule.
//
// The face anchor sits at z = 0.5, which IS the head's front plane. Pass 3's
// brow bar was centred at anchor + 0.055 with a half-depth of 0.055, so its
// rear face landed at exactly z = 0.500 - resting on the skin, flush. Its ink
// hull then has to expand SHADE_INK *behind* that rear face, so the hull
// straddled the head's surface: part of its rear chamfer band ended up inside
// the head and part of it in FRONT of the forehead.
//
// That chamfer band is the problem. Because the bar is scaled [1.02, 0.1,
// 0.11], the inverse-transpose turns its rounded rear-to-top chamfer into a
// set of facets whose world normals are nearly perpendicular to the view
// direction at this camera - within about a degree of exactly edge-on. The
// hull is BackSide, so whether such a facet is drawn depends on the sign of a
// dot product that is sitting on zero. The idle sway (head yaw +/-0.08,
// pitch +/-0.04) pushes it back and forth across zero, so those facets flicker
// into being drawn, each one rasterising to a one-pixel sliver of ink lying in
// front of the forehead. A ragged, crawling line above the brow.
//
// So the structural fix is not an epsilon and not a polygon offset: it is to
// stop the cosmetic being tangent to the head at all. Sink every face part so
// its rear surface - AND the whole of its hull - is unambiguously inside the
// head's solid volume, where the depth buffer can only ever resolve it as
// hidden, at every camera angle and every phase of the sway.
//
// The depth needed is the part's own hull width plus a margin. It is derived
// from the ink width rather than typed in, so re-weighting the ink cannot
// silently reintroduce the fringe.
// -----------------------------------------------------------------------------

/** How far a face part's rear surface sits BEHIND the face plane. */
const FACE_EMBED = SHADE_INK + 0.02;
/** The same rule for the crown: beads carry the finer line, so less is needed. */
const CROWN_EMBED = BEAD_INK + 0.02;

/**
 * Centre and depth for a face part, derived from where its FRONT should sit.
 *
 * `front` is how far the part stands proud of the skin, in head-local cells.
 * Only the front is a look decision; the rear is always FACE_EMBED behind the
 * anchor. So a part's visible profile is authored directly and its embedding
 * cannot be got wrong.
 */
function faceDepth(front: number): { z: number; depth: number } {
  const depth = front + FACE_EMBED;
  return { z: front - depth / 2, depth };
}

/** As `faceDepth`, for parts mounted on the crown plane and rising in +Y. */
function crownDepth(rise: number): { y: number; depth: number } {
  const depth = rise + CROWN_EMBED;
  return { y: rise - depth / 2, depth };
}

/**
 * One cosmetic material.
 *
 * `tones` is the 90s concept's face-keyed treatment for this part - the same
 * shader the creature itself wears, so a bead and a body cube are lit by the
 * same authored decision rather than by two rigs that happen to agree today.
 * Ignored entirely under the shipped style, which keeps its lit toon material.
 */
function toonPart(
  color: string,
  emissiveIntensity = 0,
  tones: SnakeFaceToneSet | null = null,
  cacheKey = ''
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color,
    emissive: emissiveIntensity > 0 ? color : '#000000',
    emissiveIntensity,
    gradientMap: getToonGradientMap(),
  });
  if (tones && IS_SNAKE_90S) {
    applyFaceKeyedShading(material, { tones, cacheKey });
  }
  return material;
}

/** Cosmetics stay inside the ink-and-amber palette. No new hues. */
const SHIPPED_COSMETIC_COLORS = {
  /** Frame stock - lifted off pure ink so the outline still separates it. */
  frame: '#1a2432',
  /** Lens glass - the deepest value on the character. */
  lens: '#0b1118',
  /** Bone glint - the pixel stair that gives the shades their attitude. */
  glint: '#eef3f7',
  /** Braid stock. Lifted well off ink: at near-void value the beads lost
   *  their own shading and only the ink outline survived, so the strands
   *  read as floating amber dots with nothing between them. */
  braid: '#2a3647',
  /** Braid band - the brand amber, used as jewellery. */
  band: '#f2a03f',
} as const;

/**
 * 90s CARTOON, round 2. The guide details both cosmetics by name, so they stop
 * being INK & AMBER props and become the sheet's own:
 *
 *   "Shades - disproportionately large, thick BLACK frames, angular/blocky,
 *    white pixel-style reflections."   -> the frame stops being slate.
 *   "Braids - chunky simplified block segments, NEAR-BLACK, strong upper-edge
 *    highlights, small cubic orange/gold BEADS at the ends."
 *
 * The braid's near-black is the value round 1's shipped cosmetic deliberately
 * avoided ("at near-void value the beads lost their own shading"). That defect
 * is fixed at its cause rather than by lifting the colour: `BRAID_TONES` puts
 * an authored bone-gold line on every upper bevel, so a near-black block has a
 * shape again without being anything other than near-black.
 */
const COSMETIC_COLORS = STYLE_COSMETICS
  ? {
      frame: STYLE_COSMETICS.frame,
      lens: STYLE_COSMETICS.lens,
      glint: STYLE_COSMETICS.glint,
      braid: STYLE_COSMETICS.braid,
      band: STYLE_COSMETICS.bead,
    }
  : SHIPPED_COSMETIC_COLORS;

const frameMaterial = toonPart(
  COSMETIC_COLORS.frame,
  0,
  SHADE_TONES,
  'shade-frame'
);
const lensMaterial = toonPart(COSMETIC_COLORS.lens, 0, FLAT_TONES, 'shade-lens');
const glintMaterial = new THREE.MeshBasicMaterial({
  color: COSMETIC_COLORS.glint,
  toneMapped: false,
});
const braidMaterial = toonPart(COSMETIC_COLORS.braid, 0, BRAID_TONES, 'braid');
// The beads are the creature's own material language: cubic, orange/gold, and
// carrying the same bright bevel the body cubes carry. The sheet draws them as
// small body segments worn as jewellery, and that is exactly what they are.
const bandMaterial = toonPart(
  COSMETIC_COLORS.band,
  STYLE_COSMETICS ? 0.14 : 0.25,
  SNAKE_FACE_TONES,
  'bead'
);

/** One outlined part. `ink` selects the line weight for its size class. */
function Part({
  position,
  scale,
  material,
  geometry = partGeometry,
  ink = 'bead',
  rotation,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  material: THREE.Material;
  geometry?: THREE.BufferGeometry;
  ink?: 'shade' | 'bead' | 'none';
  rotation?: [number, number, number];
}) {
  return (
    <mesh
      position={position}
      scale={scale}
      rotation={rotation}
      geometry={geometry}
      material={material}
    >
      {ink !== 'none' && (
        <mesh
          geometry={geometry}
          material={ink === 'shade' ? shadeHull : beadHull}
          renderOrder={-1}
        />
      )}
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// SHADES - slot "face"
// -----------------------------------------------------------------------------

/** Lens centres, mirrored. */
const LENS_X = STYLE_COSMETICS ? 0.245 : 0.235;
/**
 * The pixel checker. Four bone squares zig-zagging across each lens - the one
 * detail that carries the whole "unbothered" read, and it is four boxes. The
 * owner's reference draws it as a checkerboard rather than a soft specular,
 * which is exactly why it survives being shrunk: a checker degrades into a
 * dot, a gradient degrades into mud.
 *
 * ROUND 2 measured this off the sheet rather than inferring it, and the answer
 * was that pass 3 already had it right: four squares per lens on a half-offset
 * two-row checker, reading left to right as low-high-low-high. What was wrong
 * was the SIZE - the sheet's squares are about a fifth of the lens width and
 * touch at their corners, where these sat with air around them. So the
 * positions are the same shape, scaled up with the lens.
 *
 * Dropped entirely at board detail - each square would be under a pixel, and
 * a sub-pixel white speck on a moving head is scintillation, not sparkle.
 */
const GLINT_STEPS: [number, number][] = STYLE_COSMETICS
  ? [
      [-0.105, 0.038],
      [-0.035, -0.038],
      [0.035, 0.038],
      [0.105, -0.038],
    ]
  : [
      [-0.088, 0.032],
      [-0.03, -0.03],
      [0.028, 0.032],
      [0.086, -0.03],
    ];
const GLINT_SIZE = STYLE_COSMETICS ? 0.084 : 0.052;

/**
 * A dark rounded-box lens bar sitting ON the face plane, overhanging the
 * head at both ends the way real shades do. Frame, two lenses, two temples,
 * eight glints - twelve boxes, no texture, no transparency.
 *
 * At board detail the glints stand down and the temples shorten, leaving the
 * brow bar and lenses: one hard dark band across the front of the head, which
 * is the read that survives at 17px and the read that says "wearing
 * something" from across the arena.
 */
/**
 * How far the brow bar and the lenses stand PROUD of the face plane. These two
 * numbers are the whole silhouette of the shades from the side; everything
 * behind them is buried in the head by `faceDepth` and never seen.
 */
const BROW_PROUD = 0.11;
const LENS_PROUD = 0.105;

/**
 * 90s CARTOON, round 2 - "DISPROPORTIONATELY LARGE, thick black frames,
 * angular/blocky".
 *
 * The shape on the sheet is not a frame with two lenses in it. It is ONE black
 * mass with a STEPPED bottom edge: a straight bar across the brow, and below it
 * two blocks that hang lower, leaving a notch between them where the head's
 * orange shows through. That notch is the only thing standing in for a nose,
 * and it is what makes the bar read as worn rather than painted on.
 *
 * So the two "lenses" are modelled as part of the same black mass rather than
 * as glass set into a frame: same value, overlapping the bar, no seam. The
 * white checker is the only thing that says "lens" - which is exactly how the
 * sheet says it.
 *
 * `overhang` past 1.0 is the guide's word "disproportionately" made literal:
 * the bar is wider than the head it is on.
 */
const SHADE_BROW_HEIGHT = STYLE_COSMETICS?.browHeight ?? 0.1;
const SHADE_OVERHANG = STYLE_COSMETICS?.shadeOverhang ?? 1.02;
const SHADE_LENS_HEIGHT = STYLE_COSMETICS?.lensHeight ?? 0.19;
const SHADE_LENS_WIDTH = STYLE_COSMETICS ? 0.46 : 0.4;
/** The bar rides above centre; the lens blocks step down from it. */
const SHADE_BROW_Y = STYLE_COSMETICS ? 0.075 : 0.055;
const SHADE_LENS_Y = STYLE_COSMETICS ? -0.045 : -0.05;

export function ShadesCosmetic({ detail = 'hero' }: { detail?: CosmeticDetail }) {
  const board = detail === 'board';
  const brow = faceDepth(BROW_PROUD);
  const lens = faceDepth(LENS_PROUD);
  return (
    <group>
      {/* Brow bar: the full-width frame, proud of the face plane and sunk into
          it. The front face is where it always was; only the buried half grew. */}
      <Part
        position={[0, SHADE_BROW_Y, brow.z]}
        scale={[
          SHADE_OVERHANG,
          board ? SHADE_BROW_HEIGHT * 1.3 : SHADE_BROW_HEIGHT,
          brow.depth,
        ]}
        material={frameMaterial}
        ink="shade"
      />
      {/* Lenses: wider than tall, splayed a few degrees for attitude */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Part
            position={[side * LENS_X, SHADE_LENS_Y, lens.z]}
            scale={[
              SHADE_LENS_WIDTH,
              board ? SHADE_LENS_HEIGHT * 1.15 : SHADE_LENS_HEIGHT,
              lens.depth,
            ]}
            rotation={STYLE_COSMETICS ? undefined : [0, 0, side * -0.06]}
            material={lensMaterial}
            geometry={plateGeometry}
            ink="shade"
          />
          {/* Bone pixel checker, sitting on the lens face */}
          {!board &&
            GLINT_STEPS.map(([gx, gy], i) => (
              <Part
                key={i}
                position={[
                  side * LENS_X + side * gx,
                  SHADE_LENS_Y + gy,
                  LENS_PROUD + 0.007,
                ]}
                scale={[GLINT_SIZE, GLINT_SIZE, 0.02]}
                material={glintMaterial}
                geometry={plateGeometry}
                ink="none"
              />
            ))}
        </group>
      ))}
      {/* Temples: the arms running back along the head sides */}
      {[-1, 1].map((side) => (
        <Part
          key={side}
          position={[side * 0.5, SHADE_BROW_Y - 0.035, board ? -0.12 : -0.22]}
          scale={[
            0.07,
            board ? SHADE_BROW_HEIGHT : SHADE_BROW_HEIGHT * 0.8,
            board ? 0.32 : 0.52,
          ]}
          material={frameMaterial}
          ink="bead"
        />
      ))}
    </group>
  );
}

// -----------------------------------------------------------------------------
// BRAIDS - slot "crown"
// -----------------------------------------------------------------------------

/** Cornrows: chunky bars lying front-to-back along the head's top plane.
 *  This is the single highest-value cosmetic detail on the BOARD, because the
 *  arena camera sits at ~69 degrees and the crown is most of what it sees. */
const CORNROW_X = STYLE_COSMETICS
  ? [-0.345, -0.115, 0.115, 0.345]
  : [-0.33, -0.11, 0.11, 0.33];

/**
 * 90s CARTOON, round 2 - "CHUNKY SIMPLIFIED BLOCK SEGMENTS ... never realistic
 * hair", and the sheet means it literally: the crown is a FIELD of separate
 * rounded blocks in rows, not four smooth bars. Every block has its own
 * silhouette and its own bone-gold top edge, and the gaps between them are what
 * make the crown read as braided rather than as a ridged helmet.
 *
 * Rows run front to back. Board detail keeps the front two: at 17px the back
 * rows are behind the head's own horizon and cost two draw calls each to say
 * nothing.
 */
const CORNROW_Z = [0.3, 0.06, -0.18, -0.4];
const BOARD_CORNROW_ROWS = 2;

interface StrandDef {
  /** Where the strand leaves the head, in crown-anchor space. */
  origin: [number, number, number];
  /** Per-bead drift in x / z as it falls. */
  drift: [number, number];
  beads: number;
  /** Board detail keeps only the strands marked true. */
  board: boolean;
}

/**
 * Four side strands - two per side, one forward of the ear line and one
 * behind it, so the pair reads as a CURTAIN framing the face rather than two
 * lonely antennae. The reference sheet hangs its braids exactly there: they
 * bracket the shades and the gold beads land at jaw height, which is what
 * makes the face the centre of a frame instead of a box with things on it.
 *
 * Voxel family throughout: a chain of discrete beads that TAPER, never a
 * curve, never a tube. The last two beads of each strand are amber bands -
 * jewellery, and the only warm value the cosmetic is allowed.
 */
const STRANDS: StrandDef[] = [
  { origin: [-0.53, -0.06, 0.24], drift: [-0.03, 0.012], beads: 6, board: true },
  { origin: [-0.5, -0.03, -0.16], drift: [-0.022, -0.02], beads: 5, board: false },
  { origin: [0.53, -0.06, 0.2], drift: [0.03, 0.014], beads: 6, board: true },
  { origin: [0.5, -0.03, -0.18], drift: [0.022, -0.022], beads: 5, board: false },
];

/**
 * Bead pitch must EXCEED the bead, or the strand fuses into a slab and
 * stops reading as segmented - which is the whole difference between a
 * voxel braid and a lump of hair.
 */
const BEAD_PITCH = STYLE_COSMETICS?.braidPitch ?? 0.21;

/**
 * How far a strand may fall at board detail.
 *
 * The board head is `HEAD_SIZE` cells and its centre sits half of that above
 * the plane, so head-local y = -0.5 IS the board plane and the crown anchor
 * sits at head-local +0.5 - which puts the limit at crown-space y = -1.0. A
 * strand's piece `i` sits at `origin.y - 0.055 - i * BEAD_PITCH`, so with the
 * worst origin (-0.06) and the concept's wider pitch:
 *
 *      i = 2  ->  -0.605   clear (its underside reaches -0.71)
 *      i = 3  ->  -0.850   its underside reaches -0.95, inside the plane
 *
 * Three pieces is the honest limit at this pitch, and it is derived rather
 * than chosen: widen the pitch or shrink the head and this has to move.
 */
const BOARD_STRAND_BEADS = 3;

/**
 * Piece size along the strand.
 *
 * The shipped braid tapers from scalp to tip, which is how hair behaves. The
 * sheet's braid does not: it is a stack of near-identical chunky blocks that
 * stops at a bead, because "chunky simplified block segments" is a shape
 * language and a taper is a simulation. So under the concept the taper is
 * nearly flat and the last piece changes MATERIAL rather than size.
 */
function beadScale(index: number, count: number): number {
  const t = index / Math.max(1, count - 1);
  return STYLE_COSMETICS
    ? STYLE_COSMETICS.braidBlock - t * 0.025
    : 0.195 - t * 0.07;
}

/** How far a cornrow rises above the crown plane. See `crownDepth`. */
const CORNROW_RISE = STYLE_COSMETICS ? 0.15 : 0.12;

/** One row of the crown, at the active style: a chain of blocks, or one bar. */
function CrownRow({ x, row, board }: { x: number; row: { y: number; depth: number }; board: boolean }) {
  if (!STYLE_COSMETICS) {
    return (
      <Part
        position={[x, row.y, 0.0]}
        scale={[0.15, row.depth, 0.84]}
        material={braidMaterial}
        ink="bead"
      />
    );
  }
  const rows = board ? CORNROW_Z.slice(0, BOARD_CORNROW_ROWS) : CORNROW_Z;
  return (
    <>
      {rows.map((z, i) => (
        <Part
          key={i}
          position={[x, row.y, z]}
          scale={[STYLE_COSMETICS.braidBlock, row.depth, 0.205]}
          material={braidMaterial}
          geometry={braidGeometry}
          ink="bead"
        />
      ))}
    </>
  );
}

export function BraidsCosmetic({ detail = 'hero' }: { detail?: CosmeticDetail }) {
  const board = detail === 'board';
  const strands = board ? STRANDS.filter((s) => s.board) : STRANDS;
  const row = crownDepth(CORNROW_RISE);
  return (
    <group>
      {/* Cornrows on the top plane - kept at both detail levels. Pass 3 laid
          these 0.01 into the scalp, which is less than their own ink hull, so
          the hull's underside surfaced through the crown for the same reason
          the brow fringed. `crownDepth` buries it. */}
      {CORNROW_X.map((x, i) => (
        <CrownRow key={`row-${i}`} x={x} row={row} board={board} />
      ))}
      {/* Falling strands */}
      {strands.map((strand, s) => {
        const beads = board ? Math.min(BOARD_STRAND_BEADS, strand.beads) : strand.beads;
        return (
          <group key={`strand-${s}`}>
            {Array.from({ length: beads }, (_, i) => {
              const size = beadScale(i, beads);
              // The last bead (two, at hero detail) is the amber band. Under
              // the concept only the final piece is gold: the sheet hangs ONE
              // cubic bead at the end of each braid, and two makes a bracelet.
              const isBand = i >= beads - (STYLE_COSMETICS || board ? 1 : 2);
              return (
                <Part
                  key={i}
                  position={[
                    strand.origin[0] + strand.drift[0] * i,
                    strand.origin[1] - 0.055 - i * BEAD_PITCH,
                    strand.origin[2] + strand.drift[1] * i,
                  ]}
                  scale={
                    isBand
                      ? STYLE_COSMETICS
                        ? // A true cube, like every other bead on the creature.
                          [size * 0.82, size * 0.82, size * 0.82]
                        : [size * 1.08, size * 0.78, size * 1.08]
                      : [size, size, size]
                  }
                  material={isBand ? bandMaterial : braidMaterial}
                  geometry={isBand ? partGeometry : braidGeometry}
                  ink="bead"
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

// -----------------------------------------------------------------------------
// The registry - what an appearance screen would actually read
// -----------------------------------------------------------------------------

/**
 * The renderer registry, keyed by the `render.component` value migration 069
 * stores on each catalog row.
 *
 * The catalog is DATA and this is CODE, and they deploy independently. So the
 * lookup is deliberately partial: a component key this build does not know
 * resolves to nothing worn in that slot, never to a throw. An unknown hat is a
 * missing hat, which is what a player sees when they have not equipped one
 * (doctrine FM-12 — tolerance where a version boundary is crossed).
 */
export type CosmeticId = 'shades_deadpan' | 'braids_amber';

export interface CosmeticDef {
  id: CosmeticId;
  slot: HeadCosmeticSlot;
  label: string;
  /** Base features this cosmetic hides while equipped. */
  occludes: readonly CreatureFeature[];
  Component: (props: { detail?: CosmeticDetail }) => ReactNode;
}

export const SNAKE_COSMETICS: Record<CosmeticId, CosmeticDef> = {
  shades_deadpan: {
    id: 'shades_deadpan',
    slot: 'face',
    label: 'Deadpan Shades',
    // The lens bar covers the eye line, so the bare eyes must stand down.
    occludes: ['eyes'],
    Component: ShadesCosmetic,
  },
  braids_amber: {
    id: 'braids_amber',
    slot: 'crown',
    label: 'Amber Braids',
    occludes: [],
    Component: BraidsCosmetic,
  },
};

/** Resolve a server component key to a renderer, or null if this build has none. */
export function cosmeticDef(component: string | null): CosmeticDef | null {
  if (!component) return null;
  return (
    (SNAKE_COSMETICS as Record<string, CosmeticDef | undefined>)[component] ??
    null
  );
}

/**
 * THE ONE EQUIPPED SET is now server-held.
 *
 * The concept proved this continuity with a module constant. Production reads
 * `read_snake_loadout` (migration 069) instead: the home chamber gets it from
 * GET /api/player/cosmetics, the run gets it from the session-start manifest,
 * and it is the same row underneath — so a cosmetic cannot exist on one
 * surface and not the other, which is the failure that makes a pet feel like a
 * menu illustration.
 *
 * Deliberately NOT localStorage, and deliberately not a module constant any
 * more. Cosmetics are identity and identity is server-authoritative; a
 * client-owned loadout would be the first cosmetic a player could grant
 * themselves (Constitution R11).
 */
export type CosmeticLoadout = SnakeCosmeticLoadout;

/** True when some equipped cosmetic hides a base feature. */
export function occludesFeature(
  loadout: CosmeticLoadout,
  feature: CreatureFeature
): boolean {
  return HEAD_COSMETIC_SLOTS.some((slot) =>
    (cosmeticDef(loadout[slot])?.occludes ?? []).includes(feature)
  );
}

/** Mounts every equipped cosmetic at its own anchor. Add/remove one key. */
export function EquippedCosmetics({
  loadout,
  detail = 'hero',
}: {
  loadout: CosmeticLoadout;
  detail?: CosmeticDetail;
}) {
  return (
    <>
      {HEAD_COSMETIC_SLOTS.map((slot) => {
        const def = cosmeticDef(loadout[slot]);
        if (!def) return null;
        const Cosmetic = def.Component;
        return (
          <SnakeCosmetic key={slot} slot={slot}>
            <Cosmetic detail={detail} />
          </SnakeCosmetic>
        );
      })}
    </>
  );
}

// -----------------------------------------------------------------------------
// THE TONGUE IS GONE (owner ruling).
//
// Pass 3 gave the specimen a periodic tongue flick, on the argument that the
// shades take the eyes and so a blink could not carry the charm while they
// were equipped. The owner's verdict on the built result was "not cool, low
// quality", with no replacement wanted - so the creature's liveness on the
// shaded path is now carried by the idle sway alone, and the blink stays as
// the beat for the bare-eyed path. This note exists so the flick is not
// helpfully reinvented; it was built, seen, and rejected.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// GENOME COLOUR CODE - REMOVED (owner ruling, 2026-08-07)
// -----------------------------------------------------------------------------
//
// "the segments should be NORMAL - in contrast to the snake displayed now,
//  that has colored bands around its 3 segments."
//
// What stood here was a raised collar mesh per body segment, coloured from a
// three-entry table of literal hexes marked "Concept mock". It carried no
// player data at all: no strain, no lineage, no `read_snake_loadout` - the
// home specimen wore three fixed stripes that meant nothing and that the
// in-game snake never wore, so the same creature changed identity the moment
// Play was pressed. That is precisely what the chamber's own contract forbids
// ("CHAMBER = GAME LAW").
//
// It also re-introduced, as geometry, a thing that had already been ruled out
// as shader: `snake90s.ts` records "THE CUFF IS GONE - owner ruling, round 3",
// and `snake90s.test.ts` locks it - but that test can only see the shader, so
// the collar survived where the lock could not reach. Deleting it restores the
// existing ruling rather than making a new one.
//
// A body segment is now exactly what an in-game body cell is: one flat dynasty
// swatch under face-keyed toon shading, inside the shared ink hull.
