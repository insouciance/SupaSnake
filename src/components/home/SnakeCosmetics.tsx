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

/** Voxel family: chunky rounding, same construction as the snake's own box. */
const partGeometry = createExactUnitRoundedBoxGeometry(0.14);
/** Flat plates (lenses, glints) round less so their edge stays a hard line. */
const plateGeometry = createExactUnitRoundedBoxGeometry(0.06);

/** Ink widths, in world cells. The head carries 0.058; detail carries less. */
const SHADE_INK = 0.03;
const BEAD_INK = 0.018;

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

function toonPart(color: string, emissiveIntensity = 0): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    emissive: emissiveIntensity > 0 ? color : '#000000',
    emissiveIntensity,
    gradientMap: getToonGradientMap(),
  });
}

/** Cosmetics stay inside the ink-and-amber palette. No new hues. */
const COSMETIC_COLORS = {
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

const frameMaterial = toonPart(COSMETIC_COLORS.frame);
const lensMaterial = toonPart(COSMETIC_COLORS.lens);
const glintMaterial = new THREE.MeshBasicMaterial({
  color: COSMETIC_COLORS.glint,
  toneMapped: false,
});
const braidMaterial = toonPart(COSMETIC_COLORS.braid);
const bandMaterial = toonPart(COSMETIC_COLORS.band, 0.25);

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
const LENS_X = 0.235;
/**
 * The pixel checker. Four bone squares zig-zagging across each lens - the one
 * detail that carries the whole "unbothered" read, and it is four boxes. The
 * owner's reference draws it as a checkerboard rather than a soft specular,
 * which is exactly why it survives being shrunk: a checker degrades into a
 * dot, a gradient degrades into mud.
 *
 * Dropped entirely at board detail - each square would be under a pixel, and
 * a sub-pixel white speck on a moving head is scintillation, not sparkle.
 */
const GLINT_STEPS: [number, number][] = [
  [-0.088, 0.032],
  [-0.03, -0.03],
  [0.028, 0.032],
  [0.086, -0.03],
];

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

export function ShadesCosmetic({ detail = 'hero' }: { detail?: CosmeticDetail }) {
  const board = detail === 'board';
  const brow = faceDepth(BROW_PROUD);
  const lens = faceDepth(LENS_PROUD);
  return (
    <group>
      {/* Brow bar: the full-width frame, proud of the face plane and sunk into
          it. The front face is where it always was; only the buried half grew. */}
      <Part
        position={[0, 0.055, brow.z]}
        scale={[1.02, board ? 0.13 : 0.1, brow.depth]}
        material={frameMaterial}
        ink="shade"
      />
      {/* Lenses: wider than tall, splayed a few degrees for attitude */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Part
            position={[side * LENS_X, -0.05, lens.z]}
            scale={[0.4, board ? 0.22 : 0.19, lens.depth]}
            rotation={[0, 0, side * -0.06]}
            material={lensMaterial}
            geometry={plateGeometry}
            ink="shade"
          />
          {/* Bone pixel checker, sitting on the lens face */}
          {!board &&
            GLINT_STEPS.map(([gx, gy], i) => (
              <Part
                key={i}
                position={[side * LENS_X + side * gx, -0.05 + gy, 0.112]}
                scale={[0.052, 0.052, 0.02]}
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
          position={[side * 0.5, 0.02, board ? -0.12 : -0.22]}
          scale={[0.07, board ? 0.1 : 0.08, board ? 0.32 : 0.52]}
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
const CORNROW_X = [-0.33, -0.11, 0.11, 0.33];

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
const BEAD_PITCH = 0.21;

/**
 * How far a strand may fall at board detail.
 *
 * The board head's centre sits 0.45 cells above the plane and the head is
 * 0.9 cells, so a crown-anchored bead at head-local y = -0.06 is already at
 * the board plane. Three beads puts the amber tip at -0.055 - just clear -
 * and four would bury it in the floor. This is a derived limit, not a taste
 * call: raise the head and it can have more.
 */
const BOARD_STRAND_BEADS = 3;

/** Bead size falls from the scalp to the tip; the band beads are chunkier. */
function beadScale(index: number, count: number): number {
  const t = index / Math.max(1, count - 1);
  return 0.195 - t * 0.07;
}

/** How far a cornrow rises above the crown plane. See `crownDepth`. */
const CORNROW_RISE = 0.12;

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
        <Part
          key={`row-${i}`}
          position={[x, row.y, 0.0]}
          scale={[0.15, row.depth, 0.84]}
          material={braidMaterial}
          ink="bead"
        />
      ))}
      {/* Falling strands */}
      {strands.map((strand, s) => {
        const beads = board ? Math.min(BOARD_STRAND_BEADS, strand.beads) : strand.beads;
        return (
          <group key={`strand-${s}`}>
            {Array.from({ length: beads }, (_, i) => {
              const size = beadScale(i, beads);
              // The last bead (two, at hero detail) is the amber band.
              const isBand = i >= beads - (board ? 1 : 2);
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
                      ? [size * 1.08, size * 0.78, size * 1.08]
                      : [size, size, size]
                  }
                  material={isBand ? bandMaterial : braidMaterial}
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
// GENOME COLOUR CODE - not a cosmetic; this one carries information
// -----------------------------------------------------------------------------

/**
 * The owner's call: a whole tail painted in strain colour is too heavy on
 * the eyes. So the code is an ACCENT - one band per coded segment, and the
 * body keeps its dynasty fill underneath.
 *
 * The band must clear the segment's own ink hull or the outline swallows
 * it: the segment surface sits at 0.5, its hull at 0.5 + 0.045/scale, so a
 * band at 0.60 half-extent reads as a raised collar at every body scale.
 */
export const GENOME_CODED_SEGMENTS = 3;
const BAND_HALF_EXTENT = 1.16;
/** Thin: this is a stripe of information, not a second body colour. */
const BAND_THICKNESS = 0.15;

/** Concept mock: plausible strain colours, taken from `strains.ts` verbatim. */
export const CONCEPT_GENOME_CODE: readonly string[] = [
  '#f5c542', // AURUM  - Gold
  '#42e0f5', // VOLT   - Pulse
  '#f54263', // UMBRA  - Risk
];

/**
 * The colour a body segment's band carries, or null past the coded window -
 * those segments stay muted slate, which is the whole point of the rule.
 */
export function genomeBandColor(bodyIndex: number): string | null {
  return bodyIndex < GENOME_CODED_SEGMENTS
    ? CONCEPT_GENOME_CODE[bodyIndex] ?? null
    : null;
}

const bandMaterialCache = new Map<string, THREE.MeshToonMaterial>();
const genomeBandHull = createInkHullMaterial(0.022);

function getGenomeBandMaterial(color: string): THREE.MeshToonMaterial {
  let material = bandMaterialCache.get(color);
  if (!material) {
    material = toonPart(color, 0.22);
    bandMaterialCache.set(color, material);
  }
  return material;
}

/** One coded band, parented to a body segment (segment-local units). */
export function SegmentGenomeBand({ color }: { color: string }) {
  return (
    <mesh
      scale={[BAND_HALF_EXTENT, BAND_THICKNESS, BAND_HALF_EXTENT]}
      position={[0, 0.04, 0]}
      geometry={plateGeometry}
      material={getGenomeBandMaterial(color)}
    >
      <mesh geometry={plateGeometry} material={genomeBandHull} renderOrder={-1} />
    </mesh>
  );
}
