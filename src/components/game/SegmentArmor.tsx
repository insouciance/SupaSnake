'use client';

/**
 * SEGMENT ARMOR - the first GEAR item, and the SEGMENT-anchored wearable type.
 *
 * The head's cosmetics mount at named head-local anchors and are CHILDREN of the
 * head mesh, so the head's transform carries them for free. A body segment has
 * no such mesh to be a child of: the trail is ONE InstancedMesh drawing board
 * OCCUPANCY, one box per occupied cell, and an instance cannot be parented to.
 * So this file introduces the second kind of mount, and the whole of its
 * difficulty is in three places:
 *
 * -----------------------------------------------------------------------------
 * 1. THE ARMOUR GLIDES; THE CELLS DO NOT
 * -----------------------------------------------------------------------------
 *
 * The trail renders occupancy: established cells stay planted on their tile
 * centres while segment IDENTITY flows through them (see `writeTrailInstances`).
 * Gear is worn by an identity, not by a tile, so the plate cannot be drawn on a
 * cell - it would jump one whole cell every tick as the identity moved on.
 *
 * It rides `getGlideX/Z` at the segment's own index instead, which is exactly
 * what the head rides. Three properties fall out of that, and together they are
 * the anchor:
 *
 *   CONTINUOUS. Glide is `m = 0.5 + alpha`, so a segment sweeps from the
 *   boundary behind its cell, through the cell centre, to the boundary ahead,
 *   at one unvarying speed. A segment's end-of-tick position is
 *   midpoint(curr_i, curr_i-1), which IS its start-of-next-tick position -
 *   `arrivalEasing`'s "C0 across tick boundaries by construction". Nothing pops,
 *   on straights or corners, because nothing is re-anchored.
 *
 *   LOCKED TO THE HEAD. For any segment i and any motion m, the drawn offset
 *   between segment i and the head is exactly i cells. Below m = 1 both are a
 *   prev->curr blend at the same m; above it both travel along their own
 *   outbound at the same rate. So the plate holds a rigid distance behind the
 *   head at every instant of every tick - which is what makes it read as bolted
 *   on rather than as a thing that follows.
 *
 *   ALWAYS ON BODY. Mid-glide the plate's centre is off its cube by up to half a
 *   cell, so it must be long enough to still rest on it. That is a bound, not a
 *   hope: `armorSpansItsSegment` checks the plate's length against the widest
 *   gap the body ever opens (0.32 of a cell), and the plate is 0.714.
 *
 * -----------------------------------------------------------------------------
 * 2. THE EXTRUSION CASE - why the neck cannot make it pop
 * -----------------------------------------------------------------------------
 *
 * Segment 1's cell is always the NECK: the tile the head just left. That tile is
 * the one entering cell the trail draws differently - rear-anchored and
 * EXTRUDING, its rear face pinned while its front face chases the head's
 * trailing face (GLIDE-2 defect 2, the owner's ruling).
 *
 * The plate is immune to it, and by construction rather than by correction: the
 * extrusion is in LENGTH ONLY. `writeTrailCell` passes the neck a transition of
 * 1, so its HEIGHT is full from the first frame of the tick and never changes
 * while it grows. The armour is seated on that height - `armorSeatY` reads the
 * cube's drawn top and nothing else - so the seat is invariant across the whole
 * extrusion. There is no frame on which the plate could rise, sink or blink,
 * and `SegmentArmor.test.ts` asserts the seat is identical at both ends of the
 * extrusion window rather than trusting this paragraph.
 *
 * -----------------------------------------------------------------------------
 * 3. LAYERING - worn items are OUTERMOST, and the fringe stays dead
 * -----------------------------------------------------------------------------
 *
 * Two rules, both inherited rather than invented:
 *
 *   THE EMBED RULE. Every slab is sunk `ARMOR_EMBED` into whatever it rests on,
 *   so its inverted hull is entirely inside a solid and can never straddle a
 *   surface. That straddle is what produced the braid fringe - back-facing
 *   chamfer facets sitting on the sign change of a back-face test, flickered
 *   into being drawn by the idle sway. Nothing here is tangent to anything.
 *
 *   OUTERMOST. The fill draws after the body, its own hull between them. The
 *   armour is a sibling of the instanced trail rather than a child, so this is
 *   render order rather than parenting - but the relative order inside the
 *   assembly (hull, then fill) is the same one every cosmetic Part uses.
 *
 * -----------------------------------------------------------------------------
 * FAILURE
 * -----------------------------------------------------------------------------
 *
 * The armour degrades to NOTHING and takes nothing with it. It never mutates the
 * head or the trail, their materials or their geometry; it adds a sibling group
 * that the frame loop hides whenever it cannot be drawn honestly - no buffer, an
 * empty snake, or a snake too short to have the segment being armoured. An
 * unknown gear key resolves to nothing worn, never to a throw, exactly as
 * `cosmeticDef` does for hats (doctrine FM-12).
 *
 * Cost: concept-grade, and the same shape the head's cosmetics are in - one mesh
 * plus one hull per part. Board detail is three slabs; hero adds four rivets and
 * two straps. Production should merge each stock into one instanced pair;
 * nothing about the anchor contract changes when it does.
 */

import type { ReactNode } from 'react';
import * as THREE from 'three';
import { createExactUnitRoundedBoxGeometry } from './screen/gameRenderGeometry';
import { createInkHullMaterial, getToonGradientMap } from './screen/inkAmber';
import {
  applyFaceKeyedShading,
  BRAID_TONES,
  GUIDE_PALETTE,
  IS_SNAKE_90S,
  SNAKE_STYLE_PROFILE,
  type SnakeFaceToneSet,
} from './screen/snake90s';
import {
  ARMOR_EMBED,
  ARMOR_INK_WIDTH,
  ARMOR_PALETTE,
  ARMOR_RIVET_RISE,
  ARMOR_RIVET_SIZE,
  ARMOR_RIVET_X,
  ARMOR_RIVET_Z,
  ARMOR_STRAP_LENGTH,
  ARMOR_STRAP_RISE,
  ARMOR_STRAP_WIDTH,
  ARMOR_STRAP_Z,
  ARMOR_TIERS,
  ARMOR_TONES,
  armorFacingYaw,
  armorSeat,
  armorTierSeat,
  SEGMENT_ANCHORS,
  type ArmorStock,
  type SegmentGearSlot,
} from './screen/armor90s';
import type { CosmeticDetail } from '@/components/home/SnakeCosmetics';
import {
  getGlideX,
  getGlideZ,
  getInterpolatedX,
  getInterpolatedZ,
  settleToward,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import type { ArrivalMode } from '@/lib/game/arrivalEasing';
import type { TrailFusionState } from '@/lib/game/trailFusion';
import { FLOOR_CLEARANCE } from './ArenaFloor';
import {
  getSegmentScale,
  getTrailBreathe,
  getTrailCubeEdge,
  getTrailHeight,
} from './SnakeModel';

// -----------------------------------------------------------------------------
// Shared geometry / materials
// -----------------------------------------------------------------------------

/**
 * A forged edge, not a chunky one.
 *
 * The creature's cubes round at 0.155 because a wide chamfer is where their
 * bright rim line lives. A slab is a quarter of a cube tall, so the same
 * fraction would put a highlight across most of its thickness and the plate
 * would read as a pillow. 0.09 keeps the chamfer around the slab's TOP face
 * (~0.08 world, a clean 3px line) while its vertical edge stays nearly square -
 * which is the difference between rolled steel and a cushion.
 */
const slabGeometry = createExactUnitRoundedBoxGeometry(0.09);
/** Bolt heads round like the creature's own small parts - they are beads. */
const rivetGeometry = createExactUnitRoundedBoxGeometry(0.16);

const armorHullMaterial = createInkHullMaterial(ARMOR_INK_WIDTH);

/**
 * One armour material. Same construction as the head cosmetics' `toonPart` -
 * a stock toon material wearing an authored face-keyed tone set, so a plate and
 * a body cube are lit by the same decision rather than by two rigs that happen
 * to agree today. No emissive anywhere: the armour is the one thing on the
 * creature that may not bloom.
 */
function armorMaterial(
  color: string,
  tones: SnakeFaceToneSet,
  cacheKey: string
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color,
    emissive: '#000000',
    emissiveIntensity: 0,
    gradientMap: getToonGradientMap(),
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  if (IS_SNAKE_90S) {
    applyFaceKeyedShading(material, { tones, cacheKey });
  }
  return material;
}

const ironMaterial = armorMaterial(
  ARMOR_PALETTE.iron,
  ARMOR_TONES,
  'armor-iron'
);
const steelMaterial = armorMaterial(
  ARMOR_PALETTE.steel,
  ARMOR_TONES,
  'armor-steel'
);
const rivetMaterial = armorMaterial(
  ARMOR_PALETTE.rivet,
  ARMOR_TONES,
  'armor-rivet'
);
/** The harness is the braids' own stock, under the braids' own tones. */
const strapMaterial = armorMaterial(
  GUIDE_PALETTE.braid,
  BRAID_TONES,
  'armor-strap'
);

const STOCK_MATERIALS: Record<ArmorStock, THREE.MeshToonMaterial> = {
  iron: ironMaterial,
  steel: steelMaterial,
};

/**
 * Render order. The body draws at 0 with its hull at -1; the armour draws above
 * both, its own hull between them, so a worn item is outermost without relying
 * on where in the scene graph it happens to sit.
 */
const ARMOR_HULL_ORDER = 1;
const ARMOR_FILL_ORDER = 2;

/** One outlined slab. The hull is a CHILD, so it inherits the transform. */
function ArmorPart({
  position,
  scale,
  material,
  geometry = slabGeometry,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  material: THREE.Material;
  geometry?: THREE.BufferGeometry;
}) {
  return (
    <mesh
      position={position}
      scale={scale}
      geometry={geometry}
      material={material}
      renderOrder={ARMOR_FILL_ORDER}
    >
      <mesh
        geometry={geometry}
        material={armorHullMaterial}
        renderOrder={ARMOR_HULL_ORDER}
      />
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// THE PLATE
// -----------------------------------------------------------------------------

/**
 * The wearable, authored entirely in SEGMENT-LOCAL units with its seat at
 * y = 0 - the segment's top plane.
 *
 * Every number it draws comes from `armor90s.ts`, so the shape is reviewable
 * and testable without a renderer, and the two surfaces that mount it (the
 * board's per-frame rig and the chamber's parented mount) cannot disagree about
 * what the object is.
 */
export function PlateCarapace({ detail = 'hero' }: { detail?: CosmeticDetail }) {
  const hero = detail !== 'board';
  const strap = armorSeat(ARMOR_STRAP_RISE, ARMOR_TIERS[0].rise);
  const rivet = armorSeat(ARMOR_RIVET_RISE, ARMOR_TIERS[0].rise);
  return (
    <group>
      {/* The ziggurat: three slabs, each narrower and shorter than the last. */}
      {ARMOR_TIERS.map((tier, index) => {
        const seat = armorTierSeat(index);
        return (
          <ArmorPart
            key={tier.id}
            position={[0, seat.y, 0]}
            scale={[tier.width, seat.thickness, tier.length]}
            material={STOCK_MATERIALS[tier.stock]}
          />
        );
      })}
      {/* The harness - two near-black bands lying across the base tier. */}
      {hero &&
        [-1, 1].map((side) => (
          <ArmorPart
            key={`strap-${side}`}
            position={[0, strap.y, side * ARMOR_STRAP_Z]}
            scale={[ARMOR_STRAP_WIDTH, strap.thickness, ARMOR_STRAP_LENGTH]}
            material={strapMaterial}
          />
        ))}
      {/* Bolt heads on the shoulders, outboard of the tier above. */}
      {hero &&
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <ArmorPart
              key={`rivet-${sx}-${sz}`}
              position={[sx * ARMOR_RIVET_X, rivet.y, sz * ARMOR_RIVET_Z]}
              scale={[ARMOR_RIVET_SIZE, rivet.thickness, ARMOR_RIVET_SIZE]}
              material={rivetMaterial}
              geometry={rivetGeometry}
            />
          ))
        )}
    </group>
  );
}

// -----------------------------------------------------------------------------
// The registry - what a gear screen would actually read
// -----------------------------------------------------------------------------

export type SegmentGearId = 'plate_carapace';

export interface SegmentGearDef {
  readonly id: SegmentGearId;
  readonly slot: SegmentGearSlot;
  readonly label: string;
  readonly Component: (props: { detail?: CosmeticDetail }) => ReactNode;
}

export const SEGMENT_GEAR: Record<SegmentGearId, SegmentGearDef> = {
  plate_carapace: {
    id: 'plate_carapace',
    slot: 'back',
    label: 'Plate Carapace',
    Component: PlateCarapace,
  },
};

/**
 * Resolve a component key to a renderer, or null if this build has none.
 *
 * Deliberately partial, for the reason `cosmeticDef` is: the catalog is DATA and
 * this is CODE, and they deploy independently. A key this build does not know is
 * a missing item, never a throw.
 */
export function segmentGearDef(component: string | null): SegmentGearDef | null {
  if (!component) return null;
  return (
    (SEGMENT_GEAR as Record<string, SegmentGearDef | undefined>)[component] ??
    null
  );
}

/** Mounts one gear item at one named segment anchor. */
export function SegmentGearMount({
  slot,
  yaw = 0,
  children,
}: {
  slot: SegmentGearSlot;
  /** Facing, for surfaces whose segments carry no rotation of their own. */
  yaw?: number;
  children: ReactNode;
}) {
  return (
    <group
      position={[...SEGMENT_ANCHORS[slot].position]}
      rotation={[0, yaw, 0]}
    >
      {children}
    </group>
  );
}

// -----------------------------------------------------------------------------
// The board anchor
// -----------------------------------------------------------------------------

/**
 * What the frame loop writes into. `THREE.Group` satisfies it structurally; a
 * recording stub satisfies it in tests.
 *
 * The interface exists for the same reason `TrailInstanceSink` does: every
 * component test in this directory mocks `useFrame` as a no-op and jsdom has no
 * WebGL, so anchor arithmetic living inside that callback would be unreachable
 * by any test that could exist.
 */
export interface SegmentArmorSink {
  visible: boolean;
  readonly position: { set(x: number, y: number, z: number): void };
  readonly rotation: { y: number };
  readonly scale: { setScalar(value: number): void };
}

/** Scratch for the two sampled positions. The loop allocates nothing. */
const _self = { x: 0, z: 0 };
const _ahead = { x: 0, z: 0 };

function sampleSegment(
  out: { x: number; z: number },
  buffer: InterpolationBuffer,
  index: number,
  motion: number,
  mode: ArrivalMode,
  settle: number
): void {
  if (mode === 'glide') {
    out.x = settleToward(
      getGlideX(buffer, index, motion),
      buffer.curr[index * 2],
      settle
    );
    out.z = settleToward(
      getGlideZ(buffer, index, motion),
      buffer.curr[index * 2 + 1],
      settle
    );
    return;
  }
  out.x = getInterpolatedX(buffer, index, motion);
  out.z = getInterpolatedZ(buffer, index, motion);
}

/**
 * World Y of a segment's drawn TOP plane - where the armour is seated.
 *
 * Reproduces `writeTrailCell`'s height for that cell exactly, under either shape
 * law, so the plate sits on the surface the player is actually looking at:
 * the fusion step, the head-zone breathe and the tail taper all reach it. What
 * does NOT reach it is the neck's extrusion lead, because the extrusion is in
 * length only - see this file's header, section 2.
 */
export function armorSeatY(
  level: number,
  index: number,
  length: number,
  elapsed: number
): number {
  const breathe = getTrailBreathe(index, elapsed);
  const top = SNAKE_STYLE_PROFILE.cube
    ? getTrailCubeEdge(level, index, length) *
      getSegmentScale(index, length) *
      breathe
    : getTrailHeight(index, length) * breathe;
  return FLOOR_CLEARANCE + top;
}

/**
 * Place every armoured segment for one frame.
 *
 * Allocation-free. Hides any anchor it cannot place honestly - a snake shorter
 * than the segment being armoured is the ordinary case at spawn, not an error.
 */
export function writeSegmentArmor(
  sinks: readonly (SegmentArmorSink | null)[],
  segments: readonly number[],
  buffer: InterpolationBuffer,
  motion: number,
  mode: ArrivalMode,
  settle: number,
  fusion: TrailFusionState,
  elapsed: number,
  mountScale: number
): void {
  const count = buffer.count;
  for (let slot = 0; slot < segments.length; slot += 1) {
    const sink = sinks[slot];
    if (!sink) continue;
    const index = segments[slot];
    // A segment that does not exist yet wears nothing. The snake spawns short.
    if (index <= 0 || index >= count) {
      sink.visible = false;
      continue;
    }

    sampleSegment(_self, buffer, index, motion, mode, settle);
    sampleSegment(_ahead, buffer, index - 1, motion, mode, settle);

    // `levels` is the fusion fold's own per-SEGMENT-INDEX output, which is the
    // index the armour is denominated in. Before the first fold it is empty,
    // and level 0 - running free - is the honest reading of a snake that has
    // not been measured yet.
    const level = index < fusion.count ? fusion.levels[index] : 0;

    sink.position.set(
      _self.x + 0.5,
      armorSeatY(level, index, count, elapsed),
      _self.z + 0.5
    );
    const yaw = armorFacingYaw(
      _ahead.x,
      _ahead.z,
      _self.x,
      _self.z,
      fusion.gridSize
    );
    // Null means the pair coincides - the first stamp of a run. Keep the yaw
    // we have rather than snapping the plate to +Z on frame one.
    if (yaw !== null) sink.rotation.y = yaw;
    sink.scale.setScalar(mountScale);
    sink.visible = true;
  }
}

/**
 * The board's mount: one group per armoured segment, placed by the frame loop.
 *
 * It renders `detail="board"` - the wearable's own contract for "this segment is
 * 24px wide" - and drops the rivets and the harness there. Nothing here decides
 * what is dropped; the asset decides, once, for every surface that draws it.
 */
export function SegmentArmorRig({
  segments,
  groupRefs,
}: {
  segments: readonly number[];
  groupRefs: { current: (THREE.Group | null)[] };
}) {
  return (
    <>
      {segments.map((index, slot) => (
        <group
          key={index}
          ref={(group) => {
            groupRefs.current[slot] = group;
          }}
          visible={false}
        >
          <PlateCarapace detail="board" />
        </group>
      ))}
    </>
  );
}

/** The embed depth in world cells at a given mount - the fringe bound. */
export function armorEmbedWorld(mountScale: number): number {
  return ARMOR_EMBED * mountScale;
}
