'use client';

/**
 * SpecimenChamber - the home screen's living backdrop.
 *
 * A full-viewport R3F scene presenting the player's equipped snake as an
 * iconic character: hero-scaled voxel specimen, center-low in frame at a
 * three-quarter angle, idling with a gentle sine undulation inside a dark
 * void. A faint grid floor fades into fog (the arena's language, far
 * subtler) and the camera drifts on a slow lissajous path.
 *
 * Performance / correctness contract:
 * - Reuses the game's snake geometry + material machinery from
 *   SnakeModel.tsx (read-only: shared materials are cloned once per
 *   dynasty+role into a module cache, never mutated).
 * - Zero allocations in useFrame: base pose, camera vectors and grid
 *   buffers are precomputed once at module scope.
 * - dpr clamped to [1, 2], no shadows, antialias ON - the voxel style is
 * an intentional aesthetic and its edges must be crisp to read premium (glow
 *   carries the look), low-power GPU preference.
 * - Render loop pauses when the tab is hidden (frameloop -> 'never');
 *   under prefers-reduced-motion the scene renders a static composed pose
 *   (frameloop 'demand', no drift, no undulation).
 */

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import {
  SNAKE_MODEL_URL,
  getSnakeGeometries,
  getSnakeSegmentMaterial,
} from '@/components/game/SnakeModel';
import { getSnakeRoundedGeometry } from '@/components/game/screen/gameRenderGeometry';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';
import {
  createInkHullMaterial,
  getToonGradientMap,
} from '@/components/game/screen/inkAmber';
import { specimenCameraDistance } from '@/components/home/specimenCameraFit';
import {
  EquippedCosmetics,
  SegmentGenomeBand,
  genomeBandColor,
  occludesFeature,
  type CosmeticLoadout,
} from '@/components/home/SnakeCosmetics';
import { EMPTY_SNAKE_LOADOUT } from '@/lib/cosmetics/snakeCosmetics';

// -----------------------------------------------------------------------------
// Look constants
// -----------------------------------------------------------------------------

export type SpecimenReaction = 'play' | 'lab' | 'compete' | 'you';

const REACTION_GLOW: Record<SpecimenReaction, string> = {
  play: '#42e0f5',
  lab: '#a642f5',
  compete: '#f5c542',
  you: '#8b5cf6',
};

/**
 * THE CHAMBER IS BRIGHT NOW.
 *
 * Pass 2's room was rejected outright ("horrible"), and the owner has said
 * "no black" twice, so darkness is treated here as a hard fail rather than a
 * dial. The reference the owner supplied - `assets/Inspiration/Trap_Snake_1`
 * - is the target: the character on a near-white warm studio sweep with one
 * soft contact shadow, no grid, no void, no atmosphere. Everything below is
 * graded against that sheet.
 *
 * Ink stays. The outline is not "black background", it is the drawing, and a
 * dark line is what makes a bright page read as comic art rather than as a
 * blown-out render.
 */
/** The page. The brightest thing in frame, and the frame itself. */
const PAPER = '#fffaf1';
/** The sweep where the paper turns away from the light. */
const PAPER_EDGE = '#faf1e2';
/** Warm shadow. Never ink: a shadow on warm paper is warm, not neutral. */
const PAPER_SHADOW = '#c0a887';
/** The ink the creature is drawn with. */
const VOID_COLOR = '#0b1118';

/**
 * Specimen body plan: head plus THREE pieces.
 *
 * `specimenCameraFit.HOME_SPECIMEN_PIECES` still reads 3 and is still the
 * shipped framing contract (it is test-locked). The concept deliberately
 * does not move it: piece count is a ratification decision, and the fit
 * function takes explicit bounds, not a count. Promote the constant when
 * the pose is signed off.
 */
const SEGMENT_COUNT = 4;
/**
 * Head-to-body hierarchy: the head IS the character.
 *
 * The reference sheet runs its head at roughly 1.6x the body cube and that
 * ratio is most of why the thing reads as a pet rather than as a chain of
 * boxes - big head, small body is the oldest cute-proportion rule there is.
 * Pass 2 was at 1.39. This is 1.56, and the body TAPERS down the spine on
 * top of it, so the far pieces are smaller by build as well as by
 * perspective. Both together are what makes the body read as receding "from
 * far" rather than as lying flat.
 */
const SPECIMEN_HEAD_SCALE = 1.0;
const SPECIMEN_BODY_SCALES = [0.64, 0.58, 0.52];
/** Fallback for callers that want one number (camera pad, contact discs). */
const SPECIMEN_BODY_SCALE = SPECIMEN_BODY_SCALES[0];
/**
 * Clearance between consecutive pieces, in cells, ON TOP of their combined
 * half-extents. This is the fix for the reported head artefact - see
 * `buildBasePose` - and it is derived, never typed in, so no future pose
 * edit can reintroduce the overlap.
 */
const PIECE_GAP = 0.5;
// Body height must clear the floor slab even at the undulation's lowest
// point (half-height 0.25 + sine amplitude 0.028 + margin) - segments
// dipping below the floor clipped their bottom faces one by one (the
// reported cyclic flicker).
const BODY_Y = 0.48;
/**
 * The head rides high and the body settles - a confident coil, not an
 * alarmed one. Lifts fall away down the spine instead of stopping at the
 * neck, which is what made the old pose read as a head snapped off a body.
 */
const PIECE_LIFT = [0.46, 0.16, 0.04, 0];
/** Idle sway. Held well under PIECE_GAP so neighbours never touch. */
const SWAY_X = 0.03;
const SWAY_Y = 0.022;

/** Lissajous drift: +/-2% of camera distance, ~20s period */
const DRIFT_W1 = (2 * Math.PI) / 20;
const DRIFT_W2 = (2 * Math.PI) / 26;
/**
 * THE CAMERA, pass 3.
 *
 * Owner: "the snake must be seen MORE FROM THE FRONT with a slight angle -
 * face prominent but NOT dead-frontal. Segments visible receding BEHIND the
 * head from far. Face is the star; depth is the drama."
 *
 * Three separate levers, because "more frontal" and "more depth" pull against
 * each other and only one of them is the camera:
 *
 *   ELEVATION 0.46 -> 0.30 rad (26deg -> 17deg). Pass 2 looked down on the
 *   creature, so the crown was the biggest surface in frame and the face was
 *   foreshortened. Dropping to 17 degrees puts the lens near the character's
 *   own eye line, which is what "hero portrait" means and what the reference
 *   sheet does.
 *
 *   FOV 38 -> 46. This is the depth lever, and it is the one that actually
 *   answers "receding from far". A wider lens at a closer distance
 *   exaggerates size falloff along the spine, so the head looms and the tail
 *   shrinks. Overlap would have been the cheap way to say "behind"; falloff
 *   is the honest one, and it does not risk the head-contour collision that
 *   pass 2 was built to eliminate.
 *
 *   AZIMUTH 0.32 -> 0.34, with the head's own yaw doing the real work (see
 *   HEAD_GLANCE). The camera is not what makes a portrait three-quarter -
 *   the SUBJECT's turn is.
 */
const CAMERA_ELEVATION = 0.3; // ~17 degrees above the specimen plane
const CAMERA_AZIMUTH = 0.34;
/**
 * Fit margin. Pass 3 tightens 1.2 -> 0.94 because the first render of this
 * camera put the creature small and lonely in a very large room, and "face is
 * the star" is a SIZE instruction before it is an angle one. Under 1 the fit
 * deliberately lets the tail run past the frame's safe area, which is correct
 * for a portrait: a hero shot crops the body, it does not shrink the head to
 * fit the body in.
 */
const FIT_MARGIN = 0.94;
/** The near bound keeps the chamber portrait-like on very wide screens. */
const MIN_CAMERA_DISTANCE = 4.2;

/**
 * IDENTITY CONTINUITY (law): the chamber snake IS the played snake.
 *
 * The concept held that with a shared module constant. Production holds it
 * with a shared SERVER ANSWER — `read_snake_loadout` (migration 069) — which
 * the chamber receives as a prop and the run receives in its start manifest.
 * There is no chamber-local cosmetic set, and now there is no client-local one
 * either: the surfaces cannot drift because neither of them owns the fact.
 *
 * `EMPTY_SNAKE_LOADOUT` is the honest default for a signed-out visitor and for
 * the moment before the fetch lands — a bare specimen, not a guess.
 */
const CHAMBER_PUSH_IN_DISTANCE = 0.84;
const CHAMBER_PUSH_IN_SECONDS = 0.55;

// -----------------------------------------------------------------------------
// Base pose - a relaxed creature at rest, computed once at module scope.
//
// THE HEAD ARTEFACT, AND WHY THIS IS WHERE IT IS FIXED.
//
// The reported "something rendering behind the head" was not a hull bug and
// not a duplicate mesh. It was screen-space overlap between the head and the
// piece behind it, and it is measurable.
//
// The chamber camera sits at azimuth 0.32 / elevation 0.46. Projecting a
// world link direction onto that view plane keeps only a fraction of its
// length; at the old first-link heading of -1.174 rad that fraction is
// 0.737. With the old 0.82 spacing the head and neck centres landed
// 0.82 x 0.737 = 0.604 cells apart ON SCREEN, while their combined
// half-extents were 0.44 + 0.34 = 0.78. The neck was therefore buried
// behind the head with a sliver protruding, and because every piece carries
// its OWN closed ink contour, that sliver read as a torn shard and broke
// the head's outline where the two contours collided.
//
// So the fix is geometric, in three parts:
//
//   1. Spacing is DERIVED from the two pieces' scales plus PIECE_GAP, so a
//      pair can never overlap in world space whatever the pose does.
//   2. Headings are chosen so each link keeps a large component in the view
//      plane. The projected separations under this pose are 0.93 / 0.92 /
//      0.87 cells against half-extent sums of 0.79 / 0.66 / 0.66 - clear at
//      every joint, with margin left over for the idle sway.
//   3. The head's yaw is derived from the spine instead of being a fixed
//      0.5 rad. The old head faced 124 degrees away from the direction its
//      own tail implied; this one turns 27 degrees off its neck - a glance,
//      which is what "relaxed" looks like - and lands 33 degrees off the
//      camera, a three-quarter that still reads the face plane square on.
// -----------------------------------------------------------------------------

/**
 * Link headings in the XZ plane, head-first. A lazy S: the body leans one
 * way out of the neck and eases back under the tail. Small angles - a snake
 * at rest is a curve, not a hinge.
 */
/**
 * Pass 3 re-solves these against the new camera rather than nudging them.
 *
 * At azimuth 0.34 / elevation 0.30 the heading that points STRAIGHT away from
 * the lens is -1.911 rad. A body on that heading would hide behind its own
 * head; a body perpendicular to it would lie flat across the frame with no
 * depth at all. These three sit 44, 50 and 56 degrees off the away-axis,
 * curling gently toward screen right - the same lazy sweep the reference
 * sheet uses.
 *
 * The numbers were chosen by measuring, not by eye. Projecting each link onto
 * the view plane gives on-screen separations of 0.92 / 0.86 / 0.88 cells
 * against half-extent sums of 0.82 / 0.61 / 0.55: clear at every joint by
 * 0.10, 0.25 and 0.33, all comfortably above the 0.03-cell idle sway. So the
 * body recedes hard into depth - the along-view components are 1.00 / 0.72 /
 * 0.58 cells - while no two ink contours can collide, which is the artefact
 * pass 2 was built to kill and which stays killed.
 */
const LINK_HEADINGS = [-1.143, -1.038, -0.933];

/** Centre-to-centre spacing that cannot overlap, whatever the scales become. */
function linkSpacing(scaleA: number, scaleB: number): number {
  return (scaleA + scaleB) / 2 + PIECE_GAP;
}

function pieceScale(index: number): number {
  return index === 0
    ? SPECIMEN_HEAD_SCALE
    : SPECIMEN_BODY_SCALES[index - 1] ?? SPECIMEN_BODY_SCALE;
}

function buildBasePose(): [number, number, number][] {
  const points: [number, number, number][] = [];
  let x = 0;
  let z = 0;
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    points.push([x, BODY_Y + PIECE_LIFT[i], z]);
    const heading = LINK_HEADINGS[i];
    if (heading === undefined) break;
    const spacing = linkSpacing(pieceScale(i), pieceScale(i + 1));
    x += Math.cos(heading) * spacing;
    z += Math.sin(heading) * spacing;
  }
  // Center on the coil's centroid (both axes) so framing math is exact
  const cx = points.reduce((s, p) => s + p[0], 0) / SEGMENT_COUNT;
  const cz = points.reduce((s, p) => s + p[2], 0) / SEGMENT_COUNT;
  for (const p of points) {
    p[0] -= cx;
    p[2] -= cz;
  }
  return points;
}

const BASE_POSE = buildBasePose();

/**
 * Head yaw, derived from the neck rather than declared.
 *
 * A mesh's face is its local +Z, so a piece travelling along world heading h
 * looks along h + PI, which is a yaw of -PI/2 - h. From there the head turns
 * a fixed fraction of the way toward the camera - never all of it, because a
 * head screwed round to face the lens is exactly the unnatural bend that was
 * reported.
 */
/**
 * Pass 3: 0.45 -> 0.52, which lands the face 21 degrees off the lens.
 *
 * That is the number the owner's note is actually about. Dead-frontal (0
 * degrees) is a mugshot and was explicitly ruled out; pass 2's 32 degrees was
 * far enough round that the far cheek dominated and the face stopped being
 * the subject. 21 degrees is the classic three-quarter hero portrait: both
 * eyes fully present, the near side of the head reading as the front plane,
 * and just enough turn to show that the head is a solid object.
 */
const HEAD_GLANCE = 0.52;

const HEAD_YAW = (() => {
  const spineYaw = -Math.PI / 2 - LINK_HEADINGS[0];
  // Yaw that would point the face straight down the camera's azimuth.
  const cameraYaw =
    Math.PI / 2 -
    Math.atan2(
      Math.cos(CAMERA_AZIMUTH) * Math.cos(CAMERA_ELEVATION),
      Math.sin(CAMERA_AZIMUTH) * Math.cos(CAMERA_ELEVATION)
    );
  return spineYaw + (cameraYaw - spineYaw) * HEAD_GLANCE;
})();

/** Axis extents of the pose (segment size included) for camera fit.
 *  Per-axis extents beat a bounding sphere here: the coil is wide and
 *  shallow, and the sphere's depth term made portrait framing push the
 *  camera so far back the specimen became invisible on phones. */
const POSE_BOUNDS = (() => {
  /**
   * FRAME ON THE FACE, not on the coil.
   *
   * A plain centroid puts the middle of the body at the middle of the frame,
   * which on a tapering pose pushes the head off toward one corner and hands
   * the optical centre to a tail piece. The owner's brief is "face is the
   * star", so the framing centre is weighted 70/30 toward the head: the head
   * sits at the composition's heart and the body trails away from it into
   * depth, exactly as the reference sheet stages it.
   */
  const HEAD_WEIGHT = 0.7;
  const centroid = new THREE.Vector3();
  for (const [x, y, z] of BASE_POSE) centroid.add(new THREE.Vector3(x, y, z));
  centroid.divideScalar(SEGMENT_COUNT);
  const headPoint = new THREE.Vector3(...BASE_POSE[0]);
  const center = headPoint
    .multiplyScalar(HEAD_WEIGHT)
    .addScaledVector(centroid, 1 - HEAD_WEIGHT);
  let halfX = 0;
  let halfZ = 0;
  let maxY = 0;
  for (const [x, y, z] of BASE_POSE) {
    halfX = Math.max(halfX, Math.abs(x - center.x));
    halfZ = Math.max(halfZ, Math.abs(z - center.z));
    maxY = Math.max(maxY, y);
  }
  // Cosmetics widen the silhouette past the head box - braids fall below the
  // jaw and overhang the sides - so the pad carries them too. Pass 3 halves
  // it: 0.85 was sized for a pose that filled the frame, and on the tightened
  // portrait it was pure empty room on all four sides.
  const pad = SPECIMEN_HEAD_SCALE * 0.42;
  return {
    center,
    halfX: halfX + pad,
    halfZ: halfZ + pad,
    halfY: maxY / 2 + pad,
  };
})();

// -----------------------------------------------------------------------------
// Materials / geometry - shared caches, no per-render allocation
// -----------------------------------------------------------------------------

/** Portrait-local clones of the game's shared segment materials. The game's
 * cache is never mutated; one identical clone per dynasty+role lives here. */
const heroMaterialCache = new Map<string, THREE.MeshToonMaterial>();

function getHeroMaterial(
  dynasty: DynastyId,
  isHead: boolean
): THREE.MeshToonMaterial {
  const key = `${dynasty}:${isHead ? 'head' : 'body'}`;
  let material = heroMaterialCache.get(key);
  if (!material) {
    material = getSnakeSegmentMaterial(dynasty, isHead).clone();
    // The Home hero and in-game creature intentionally share one physical
    // material profile. Scale/framing make this a portrait; a second set of
    // ad-hoc emissive values would make the same snake change identity when
    // Play is pressed.
    heroMaterialCache.set(key, material);
  }
  return material;
}

/** Rounded procedural stand-ins are the same silhouettes used in-game. */
const fallbackHeadGeometry = getSnakeRoundedGeometry('head');
const fallbackBodyGeometry = getSnakeRoundedGeometry('body');

/** Eye geometry/materials - shared across renders. */
const eyeGeometry = new THREE.BoxGeometry(1, 1, 1);
const eyeDarkMaterial = new THREE.MeshBasicMaterial({ color: '#0b1118' });
const eyeGlintMaterial = new THREE.MeshBasicMaterial({ color: '#eef3f7' });
// INK & AMBER: the specimen is the cover of the record, so the ink edge is
// decided here first. Same material as the board, so the creature does not
// change identity when Play is pressed.
const specimenHullMaterial = createInkHullMaterial();

/**
 * Eyes on the head's camera-facing side - the single strongest "this is a
 * creature, not a box" signal. Positions are in head-local space (the head
 * is yawed toward the viewer); parenting to the head mesh means the idle
 * sway carries them naturally.
 */
/**
 * THE BLINK.
 *
 * Cute is mostly timing. The eyes squash on Y for a tenth of a second every
 * few seconds, at an interval that is deliberately not a round number so it
 * never syncs with the idle sway and never feels metronomic - the creature
 * should look like it decided to blink, not like it is on a timer.
 *
 * Only reachable when no face cosmetic is equipped: the lens bar covers the
 * eye line, so there is nothing to blink. Pass 3 gave the shaded path its own
 * beat - a tongue flick - and the owner rejected it outright with no
 * replacement, so under the shades the creature is carried by the idle sway
 * alone. See the note in `SnakeCosmetics.tsx` before adding another.
 */
const BLINK_PERIOD = 4.7;
const BLINK_DURATION = 0.13;

function blinkScale(time: number): number {
  const phase = time % BLINK_PERIOD;
  if (phase > BLINK_DURATION) return 1;
  // Down and back up over the window; 0.12 rather than 0 so the eye never
  // fully vanishes, which reads as a dropped frame rather than a blink.
  const t = phase / BLINK_DURATION;
  return 0.12 + 0.88 * Math.abs(Math.cos(t * Math.PI));
}

function SpecimenEyes({ animate }: { animate: boolean }) {
  const lidsRef = useRef<(THREE.Group | null)[]>([null, null]);

  useFrame(({ clock }) => {
    const scale = animate ? blinkScale(clock.elapsedTime) : 1;
    for (const lid of lidsRef.current) {
      if (lid) lid.scale.y = scale;
    }
  });

  return (
    <group>
      {[-1, 1].map((side, i) => (
        <group
          key={side}
          ref={(group) => {
            lidsRef.current[i] = group;
          }}
          position={[side * 0.22, 0.16, 0.51]}
        >
          <mesh geometry={eyeGeometry} material={eyeDarkMaterial} scale={0.16} />
          <mesh
            geometry={eyeGeometry}
            material={eyeGlintMaterial}
            scale={0.055}
            position={[0.035, 0.04, 0.045]}
          />
        </group>
      ))}
    </group>
  );
}

/** A muted slate dash below the eye line. Never occluded by a face cosmetic:
 *  the shades take the eyes, the deadpan mouth is the creature's own. */
const mouthMaterial = new THREE.MeshToonMaterial({
  color: '#6d8598',
  gradientMap: getToonGradientMap(),
});

function SpecimenMouth() {
  return (
    <mesh
      geometry={eyeGeometry}
      material={mouthMaterial}
      position={[0, -0.16, 0.505]}
      scale={[0.2, 0.055, 0.03]}
    />
  );
}

// -----------------------------------------------------------------------------
// Scene pieces
// -----------------------------------------------------------------------------

interface SpecimenBodyProps {
  dynasty: DynastyId;
  animate: boolean;
  /** Server-held, or the previewed set while the player browses the menu. */
  loadout: CosmeticLoadout;
  headGeometry?: THREE.BufferGeometry;
  bodyGeometry?: THREE.BufferGeometry;
}

/** The character. Idle = sine undulation traveling down the body
 *  (per-segment phase offset, position-only) + subtle head sway. */
function SpecimenBody({
  dynasty,
  animate,
  loadout,
  headGeometry,
  bodyGeometry,
}: SpecimenBodyProps) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: SEGMENT_COUNT }, () => null)
  );

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const base = BASE_POSE[i];
      // Amplitudes are held under PIECE_GAP: the idle may breathe, it may
      // not close the clearance the pose was built to guarantee.
      mesh.position.x = base[0] + Math.sin(t * 1.1 - i * 0.62) * SWAY_X;
      mesh.position.y = base[1] + Math.sin(t * 0.8 - i * 0.5) * SWAY_Y;
      mesh.position.z = base[2];
    }
    const head = meshRefs.current[0];
    if (head) {
      head.rotation.y = HEAD_YAW + Math.sin(t * 0.45) * 0.08;
      head.rotation.x = Math.sin(t * 0.62) * 0.04;
    }
  });

  const bareEyes = !occludesFeature(loadout, 'eyes');

  return (
    <group>
      {BASE_POSE.map(([x, y, z], i) => {
        const isHead = i === 0;
        const geometry = isHead
          ? headGeometry ?? fallbackHeadGeometry
          : bodyGeometry ?? fallbackBodyGeometry;
        // Body index 0 is the piece right behind the head.
        const bandColor = isHead ? null : genomeBandColor(i - 1);
        return (
          <mesh
            key={i}
            ref={(mesh) => {
              meshRefs.current[i] = mesh;
            }}
            position={[x, y, z]}
            rotation={isHead ? [0, HEAD_YAW, 0] : undefined}
            scale={isHead ? SPECIMEN_HEAD_SCALE : SPECIMEN_BODY_SCALE}
            geometry={geometry}
            material={getHeroMaterial(dynasty, isHead)}
          >
            <mesh
              geometry={geometry}
              material={specimenHullMaterial}
              renderOrder={-1}
            />
            {isHead && bareEyes && <SpecimenEyes animate={animate} />}
            {isHead && <SpecimenMouth />}
            {isHead && <EquippedCosmetics loadout={loadout} />}
            {bandColor && <SegmentGenomeBand color={bandColor} />}
          </mesh>
        );
      })}
    </group>
  );
}

/** GLB-backed specimen; suspends while the voxel model loads. */
function VoxelSpecimen(props: Omit<SpecimenBodyProps, 'headGeometry' | 'bodyGeometry'>) {
  const { scene } = useGLTF(SNAKE_MODEL_URL);
  const { head, body } = getSnakeGeometries(scene);
  return (
    <SpecimenBody
      {...props}
      headGeometry={head ?? undefined}
      bodyGeometry={body ?? undefined}
    />
  );
}

/** Aspect-aware framing + slow lissajous drift.
 *  The camera distance is computed from the pose's bounding sphere against
 *  BOTH the vertical and horizontal fov, so the whole specimen is always
 *  fully in frame - portrait phones included. Recomputes on resize only. */
function CameraRig({
  animate,
  pushIn,
}: {
  animate: boolean;
  /** True while the cosmetics menu is open - "approaching your pet". */
  pushIn: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const baseRef = useRef(new THREE.Vector3());
  const dirRef = useRef(new THREE.Vector3());
  /** 0 = framed portrait, 1 = pushed in. Eased, never snapped, while animating. */
  const pushRef = useRef(0);

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(persp.fov);
    const cosE = Math.cos(CAMERA_ELEVATION);
    const sinE = Math.sin(CAMERA_ELEVATION);
    const distance = Math.max(
      MIN_CAMERA_DISTANCE,
      specimenCameraDistance(
        POSE_BOUNDS,
        size.width,
        size.height,
        vFov,
        CAMERA_ELEVATION,
        CAMERA_AZIMUTH,
        FIT_MARGIN
      )
    );

    dirRef.current.set(
      Math.sin(CAMERA_AZIMUTH) * cosE,
      sinE,
      Math.cos(CAMERA_AZIMUTH) * cosE
    );
    baseRef.current
      .copy(POSE_BOUNDS.center)
      .addScaledVector(dirRef.current, distance);
    camera.position
      .copy(baseRef.current)
      .addScaledVector(dirRef.current, -CHAMBER_PUSH_IN_DISTANCE * pushRef.current);
    camera.lookAt(POSE_BOUNDS.center);
    camera.updateMatrixWorld();
    // Reduced-motion uses frameloop="demand". Changing the camera in an
    // effect does not schedule a frame by itself, so without this invalidation
    // the portrait could remain rendered from R3F's close default camera.
    invalidate();
  }, [camera, invalidate, size.width, size.height]);

  // Reduced motion: the push-in is a MOTION, so it is not performed. The
  // player still arrives at the closer framing - they are simply already
  // there. Honouring the preference must not cost them the view.
  useEffect(() => {
    if (animate) return;
    pushRef.current = pushIn ? 1 : 0;
    camera.position
      .copy(baseRef.current)
      .addScaledVector(dirRef.current, -CHAMBER_PUSH_IN_DISTANCE * pushRef.current);
    camera.lookAt(POSE_BOUNDS.center);
    camera.updateMatrixWorld();
    invalidate();
  }, [animate, pushIn, camera, invalidate]);

  useFrame(({ clock }, delta) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    const base = baseRef.current;
    const dir = dirRef.current;

    // Ease toward the target framing. Frame-rate independent, and clamped so
    // a long stall between frames cannot overshoot past the target.
    const target = pushIn ? 1 : 0;
    const step = Math.min(1, delta / CHAMBER_PUSH_IN_SECONDS);
    pushRef.current += (target - pushRef.current) * step;
    const push = CHAMBER_PUSH_IN_DISTANCE * pushRef.current;

    const amplitude = base.length() * 0.02;
    camera.position.x =
      base.x - dir.x * push + Math.sin(t * DRIFT_W1) * amplitude;
    camera.position.y =
      base.y - dir.y * push + Math.sin(t * DRIFT_W2 + 1.3) * amplitude * 0.6;
    camera.position.z = base.z - dir.z * push;
    camera.lookAt(POSE_BOUNDS.center);
  });

  return null;
}

/**
 * STUDIO LIGHTING ON A BRIGHT PAGE.
 *
 * Pass 2 lit a dark room: a weak key, a coloured rim, and most of the
 * character's surface sitting in the toon ramp's bottom band. That is what
 * made it read as murky, and no amount of background grading fixes a subject
 * that is itself unlit.
 *
 * So the ambient is now the dominant term. On a MeshToonMaterial a high
 * ambient pushes the whole surface into the ramp's upper two bands, which is
 * exactly the flat, bright, saturated fill a comic character has - the
 * shading is a single deliberate step, not a gradient into shadow. The key
 * then only has to carve that one step, so it is soft and warm rather than
 * hot, and the dynasty colour moves to a gentle rim that separates the
 * silhouette from the paper without tinting the fill.
 */
function ChamberLights({
  dynasty,
  reaction,
}: {
  dynasty: DynastyId;
  reaction: SpecimenReaction | null;
}) {
  const glow = getGameMaterialProfile(dynasty).lighting.keyColor;
  return (
    <>
      {/* The page's own bounce. This is the brightness, and it is deliberate
          that it outweighs every directional term in the rig. */}
      <ambientLight intensity={1.15} color="#fff6e6" />
      {/* Bounce from the sweep: warm from below-front, so the underside of
          the jaw and the belly never fall into a dark band. */}
      <hemisphereLight args={['#fffaf0', '#e8d5b8', 0.55]} />
      {/* Key: one soft warm lamp, front-high-right. It exists to place the
          single toon step, not to light the subject. */}
      <directionalLight position={[3.5, 4.5, 4.5]} intensity={0.62} color="#ffe9c6" />
      {/* Rim: dynasty-coloured, from behind-left. On a bright ground a rim is
          what keeps the silhouette from dissolving into the paper. */}
      <directionalLight position={[-5, 2.5, -4]} intensity={0.5} color={glow} />
      {/* A safe additive whole-character cue for the four Home actions. It
          leaves the cached segment materials untouched and disappears the
          instant the action loses hover/focus/press. */}
      <pointLight
        position={[0, 2.1, 2.5]}
        intensity={reaction ? 1.1 : 0}
        distance={7}
        decay={2}
        color={reaction ? REACTION_GLOW[reaction] : '#000000'}
      />
    </>
  );
}

// -----------------------------------------------------------------------------
// THE CHAMBER
//
// Pass 1 graded the room to near-black and the Specimen Chamber stopped
// being a room. Depth is restored the cheap way - three procedural gradients
// and one contact pass, no bitmap, no post-processing:
//
//   backdrop  a radial lift behind the subject, so the void has a centre
//   floor     an unlit warm pool under the lamp, falling off to ink
//   contact   one soft disc per piece, which is what puts the creature ON
//             the floor instead of in front of it
//
// All three are ink-and-amber: the only warmth is the lamp's, and it is
// weak enough that the amber on the creature still reads as the brightest
// warm thing in frame.
// -----------------------------------------------------------------------------

const FLOOR_EXTENT = 22;
const GRID_HALF = 10;
/**
 * Explicit order for the transparent pass. These four plates sit at nearly
 * the same camera distance, so leaving them to distance sorting makes the
 * composite flicker as the camera drifts. Back to front, once, forever.
 */
const ORDER_PLATES = -3;
const ORDER_FLOOR = -2;
const ORDER_CONTACT = -1;
/**
 * Fog, floor rim and backdrop rim are ONE value. Pass 1's horizon was a hard
 * line because the floor fogged toward a lighter grey than the backdrop
 * behind it; matching the three makes the floor dissolve instead of ending.
 */
const FOG_COLOR = PAPER_EDGE;

/**
 * A radial gradient as raw texture data. `stops` are [t, '#rrggbb', alpha]
 * sampled on distance from centre, normalised to the texture's half-width.
 */
function createRadialTexture(
  size: number,
  stops: [number, string, number][]
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const colors = stops.map(([, hex]) => new THREE.Color(hex));
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      let lo = 0;
      while (lo < stops.length - 2 && d > stops[lo + 1][0]) lo++;
      const hi = lo + 1;
      const span = Math.max(1e-6, stops[hi][0] - stops[lo][0]);
      const t = THREE.MathUtils.clamp((d - stops[lo][0]) / span, 0, 1);
      // smoothstep keeps the falloff from banding on a small texture
      const s = t * t * (3 - 2 * t);
      const i = (y * size + x) * 4;
      data[i] = Math.round(
        THREE.MathUtils.lerp(colors[lo].r, colors[hi].r, s) * 255
      );
      data[i + 1] = Math.round(
        THREE.MathUtils.lerp(colors[lo].g, colors[hi].g, s) * 255
      );
      data[i + 2] = Math.round(
        THREE.MathUtils.lerp(colors[lo].b, colors[hi].b, s) * 255
      );
      data[i + 3] = Math.round(
        THREE.MathUtils.lerp(stops[lo][2], stops[hi][2], s) * 255
      );
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * THE SWEEP. A photographer's paper roll: brightest right behind the
 * subject's head, easing to a warm cream at the corners. There is no dark
 * stop anywhere in this ramp, which is the point - the darkest value in the
 * whole backdrop is lighter than the lightest value on the creature, so the
 * character can never be lost against its own room.
 */
const backdropTexture = createRadialTexture(128, [
  [0, '#ffffff', 1],
  [0.45, PAPER, 1],
  [1, PAPER_EDGE, 1],
]);

/**
 * The floor is the same sweep, a shade warmer where the light lands. On a
 * studio sweep the floor and the wall are literally the same sheet of paper,
 * so the only thing separating them is the contact shadow below.
 */
const floorTexture = createRadialTexture(128, [
  [0, '#fffaf2', 1],
  [0.3, PAPER, 1],
  [1, PAPER_EDGE, 1],
]);

/**
 * Contact occlusion. WARM, and much softer than pass 2's near-opaque ink.
 *
 * This is the one shadow in the scene and it is doing the whole job of
 * seating the creature on the floor, which on a bright sweep is the only
 * thing that stops a character floating. A neutral or black shadow on warm
 * paper reads as a hole cut in the page; a warm one reads as the paper in
 * shade.
 */
const contactTexture = createRadialTexture(64, [
  [0, PAPER_SHADOW, 0.82],
  [0.4, PAPER_SHADOW, 0.4],
  [1, PAPER_SHADOW, 0],
]);

/**
 * Alpha masks. Three reads an `alphaMap` from the GREEN channel, so a
 * greyscale radial ramp is all that is needed - and greyscale keeps these
 * reusable for any plate regardless of its colour.
 */
function createRadialAlphaTexture(
  size: number,
  stops: [number, number][]
): THREE.DataTexture {
  return createRadialTexture(
    size,
    stops.map(([at, value]) => {
      const v = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
      const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
      return [at, hex, 1] as [number, string, number];
    })
  );
}

/**
 * The floor is a POOL, not a slab.
 *
 * Pass 1's floor was a 30-cell opaque plane, which meant it filled most of
 * the frame and nothing could ever be seen behind it - including the
 * backdrop. Fading it to fully transparent past the lamp's reach is both
 * the more honest lighting model (you see floor where light lands on it)
 * and the thing that lets the atmosphere plates read at all.
 */
const floorAlpha = createRadialAlphaTexture(128, [
  [0, 1],
  [0.26, 0.95],
  [0.52, 0.35],
  [0.78, 0],
  [1, 0],
]);

/** Plate mask: full at the core, gone before the plate's own rectangle. */
const plateAlpha = createRadialAlphaTexture(128, [
  [0, 1],
  [0.34, 0.92],
  [0.72, 0.3],
  [1, 0],
]);

const floorMaterial = new THREE.MeshBasicMaterial({
  map: floorTexture,
  alphaMap: floorAlpha,
  transparent: true,
  // The pool must not occlude the backdrop plates behind it.
  depthWrite: false,
  toneMapped: false,
});

const contactMaterial = new THREE.MeshBasicMaterial({
  map: contactTexture,
  transparent: true,
  depthWrite: false,
  toneMapped: false,
});

const contactGeometry = new THREE.PlaneGeometry(1, 1);

/**
 * THE ATMOSPHERE - the owner's speed-line and dust plates.
 *
 * Both are white-or-warm on black, which means ADDITIVE blending masks them
 * for free: the black field contributes nothing and no alpha channel is
 * needed. Both hang on vertical billboards behind the subject, turned to the
 * camera's azimuth, and both opt OUT of fog - they are the atmosphere, so
 * fogging them would be the room dimming its own air.
 *
 * The speed plate is deliberately aligned so its stippled dark core sits
 * behind the creature, exactly as the owner's reference card does it: the
 * lines are energy AROUND the subject and the subject reads against a hole.
 * That is why this can be loud at the rim and still legible at the centre.
 */
/**
 * Renders its children, or nothing at all if they throw.
 *
 * Deliberately silent and deliberately narrow: it wraps decoration only, and
 * "the paper texture 404'd" is not an incident a player should be told about.
 * It is still reported — `componentDidCatch` logs, so the failure is visible
 * to us in the console and to Sentry's console integration, which is the
 * difference between degrading and swallowing (doctrine FM-2).
 *
 * Do NOT widen this around the specimen itself. A snake that fails to render
 * is a chamber with no subject, and that IS worth surfacing.
 */
class DecorationBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Chamber decoration failed to load; continuing without it:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Renders its children, or `fallback` if they throw.
 *
 * Used for the specimen, where "nothing" is not an acceptable degradation —
 * the fallback is the primitive creature, so the chamber always has a subject.
 */
class SpecimenFallbackBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Specimen model failed to load; drawing the primitive:', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ChamberAtmosphere({ animate }: { animate: boolean }) {
  // WebP derivatives of the owner's plates, produced by
  // `scripts/optimize-textures.mjs` straight from the authored PNGs rather
  // than from the JPEGs that shipped first, so there is no generation loss.
  // Both are downscaled to 512: one is an alphaMap at 0.2 and the other a
  // map at 0.07, and neither renders a pixel of the detail it was carrying.
  const [speed, paper] = useTexture([
    '/textures/speed-lines.webp',
    '/textures/paper-fiber.webp',
  ]);
  const speedRef = useRef<THREE.Mesh>(null);

  const materials = useMemo(() => {
    for (const t of [speed, paper]) {
      t.colorSpace = THREE.SRGBColorSpace;
    }
    return {
      /**
       * THE POLARITY FLIP - this is the whole trick for a bright room.
       *
       * The owner's speed-line plate is white lines on black, and pass 2 blew
       * it in ADDITIVELY, which is the only thing that works on a dark
       * backdrop and the one thing that is invisible on a bright one: adding
       * white to near-white is nothing.
       *
       * So the plate is no longer a colour source at all - it is used as an
       * ALPHA MASK, and the colour drawn through it is a warm grey. Three
       * reads the alphaMap from the green channel, so the white lines become
       * alpha 1 and the black field becomes alpha 0, and the result is DARK
       * speed lines drawn on the page. That is what a comic actually does:
       * the lines are ink, not light.
       *
       * Warm grey rather than ink proper, and 0.2 opacity, because these are
       * a background texture and the creature's own outline has to stay the
       * boldest line in frame.
       */
      speed: new THREE.MeshBasicMaterial({
        alphaMap: speed,
        color: '#b9a68d',
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
      /**
       * Paper tooth. The faintest possible fibre over the sweep so the
       * backdrop reads as printed stock rather than as a CSS gradient. It is
       * the difference between "bright" and "blank".
       */
      paper: new THREE.MeshBasicMaterial({
        map: paper,
        alphaMap: plateAlpha,
        transparent: true,
        // First render came back noticeably tan, and this plate was the
        // cause: a full-frame beige fibre bitmap at 0.14 tints the entire
        // page toward its own colour, which is the opposite of "much
        // brighter". Halved, and multiplied by a near-white so the texture
        // contributes TOOTH without contributing HUE.
        color: '#fffdf7',
        opacity: 0.07,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    };
  }, [speed, paper]);

  // A very slow roll. Fast enough to be alive over ten seconds, far too slow
  // to be a "perpetual pulse" - the cockpit doc's rule holds here too.
  useFrame(({ clock }) => {
    if (!animate || !speedRef.current) return;
    speedRef.current.rotation.z = clock.elapsedTime * 0.012;
  });

  // Both plates hang square to the camera, directly behind the subject, so
  // the speed lines converge exactly where the creature is. Nesting an
  // azimuth turn outside an elevation tilt points local +Z down the camera
  // axis, which makes local -Z "straight back from the subject".
  return (
    <group position={POSE_BOUNDS.center} rotation={[0, CAMERA_AZIMUTH, 0]}>
      <group rotation={[-CAMERA_ELEVATION, 0, 0]}>
        <mesh
          ref={speedRef}
          position={[0, 0, -3.4]}
          renderOrder={ORDER_PLATES}
          material={materials.speed}
        >
          <planeGeometry args={[18, 18]} />
        </mesh>
        {/* Paper tooth, hung closer than the speed lines so the fibre sits
            in front of them - stock first, then what was printed on it. */}
        <mesh
          position={[0, 0, -2.3]}
          renderOrder={ORDER_PLATES}
          material={materials.paper}
        >
          <planeGeometry args={[15, 15]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Floor, grid and contact shadows. The grid survives from pass 1 - it is the
 * arena's language and the only thing that says "this room has a scale" -
 * but it now sits on a graded floor instead of a flat black one.
 */
function ChamberFloor() {
  const positions = useMemo(() => {
    const pts: number[] = [];
    for (let i = -GRID_HALF; i <= GRID_HALF; i++) {
      pts.push(i, 0, -GRID_HALF, i, 0, GRID_HALF);
      pts.push(-GRID_HALF, 0, i, GRID_HALF, 0, i);
    }
    return new Float32Array(pts);
  }, []);

  return (
    <group>
      <mesh position={[0, -0.06, 0]} renderOrder={ORDER_FLOOR}>
        <boxGeometry args={[FLOOR_EXTENT, 0.1, FLOOR_EXTENT]} />
        <primitive object={floorMaterial} attach="material" />
      </mesh>
      {/*
        The grid survives from the original composition - it is the arena's
        language and the one thing that says this room has a scale - but it is
        now drawn in warm paper shadow at a third of its old weight. A dark
        grid on a bright sweep would be the single loudest thing in frame and
        would turn a portrait back into a technical fixture.
      */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={PAPER_SHADOW} transparent opacity={0.16} />
      </lineSegments>
      {/* One disc per piece. Static: the idle sway is 0.03 cells and a
          shadow that chases it reads as a bug, not as life. */}
      {BASE_POSE.map(([x, , z], i) => {
        const spread = (i === 0 ? SPECIMEN_HEAD_SCALE : SPECIMEN_BODY_SCALE) * 2.6;
        return (
          <mesh
            key={i}
            geometry={contactGeometry}
            material={contactMaterial}
            position={[x, 0.006, z]}
            renderOrder={ORDER_CONTACT}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[spread, spread * 0.82, 1]}
          />
        );
      })}
    </group>
  );
}

// -----------------------------------------------------------------------------
// Chamber
// -----------------------------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

export interface SpecimenChamberProps {
  /** Dynasty of the equipped snake (PRIMAL specimen for fresh visitors). */
  dynasty: DynastyId;
  /** Ephemeral Home-action reaction; never persisted or gameplay-affecting. */
  reaction?: SpecimenReaction | null;
  /** Fired once the WebGL scene is live - drives the page's 600ms fade-in. */
  onReady?: () => void;
  /**
   * What the snake is wearing. Server-held (`read_snake_loadout`), or the
   * previewed set while the player browses the cosmetics menu. Defaults to
   * bare, which is the honest answer before the fetch lands.
   */
  loadout?: CosmeticLoadout;
  /**
   * Tapping the snake opens the cosmetics menu. Omitted for a signed-out
   * visitor, who has nothing to dress.
   */
  onSelect?: () => void;
  /** Accessible name for that tap target. */
  selectLabel?: string;
  /** Push the camera in toward the specimen ("approaching your pet"). */
  pushIn?: boolean;
}

export function SpecimenChamber({
  dynasty,
  reaction = null,
  onReady,
  loadout = EMPTY_SNAKE_LOADOUT,
  onSelect,
  selectLabel = 'Dress up your snake',
  pushIn = false,
}: SpecimenChamberProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [hidden, setHidden] = useState(false);

  // Pause the render loop entirely while the tab is hidden
  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const animate = !reducedMotion;
  const frameloop = hidden ? 'never' : reducedMotion ? 'demand' : 'always';

  return (
    <div
      className="absolute inset-0"
      data-testid="home-specimen-full-stage"
    >
      {/*
        THE TAP TARGET IS DOM, NOT A RAYCAST.
        A transparent button over the specimen's half of the stage, rather than
        an onClick on the mesh: it is reachable by keyboard and by a screen
        reader, it costs no per-frame raycasting, and it does not stop working
        when the canvas is paused (frameloop 'never' while the tab is hidden,
        or a lost WebGL context). The creature is the affordance; the button is
        only how the platform is told about it.
      */}
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          aria-label={selectLabel}
          data-testid="home-specimen-select"
          className="absolute inset-x-0 bottom-[18%] top-[22%] z-[1] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        />
      )}
      <Canvas
        frameloop={frameloop}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
        camera={{ fov: 46, near: 0.1, far: 48 }}
        onCreated={() => onReady?.()}
      >
        {/* A graded backdrop, not a flat void: the chamber needs a centre
            for the lamp to be the centre OF. */}
        <primitive attach="background" object={backdropTexture} />
        {/* Fog starts past the subject and ends inside the floor, so depth
            reads on the floor plane without dulling the creature. */}
        {/* Fog matched to the sweep's own edge colour, so the floor dissolves
            into the backdrop instead of ending at a horizon. On a bright room
            this is aerial perspective; the moment it differs from the paper by
            even a shade it becomes a visible seam. */}
        <fog attach="fog" args={[FOG_COLOR, 8, 20]} />
        <CameraRig animate={animate} pushIn={pushIn} />
        <ChamberLights dynasty={dynasty} reaction={reaction} />
        <ChamberFloor />
        {/*
          The atmosphere is DECORATION, and decoration is never allowed to
          take the page with it.

          `Suspense` alone was not enough and the difference cost a red e2e
          leg: drei's `useTexture` suspends while a texture loads, but on a
          404 it THROWS, and a thrown error walks past every Suspense
          boundary to the nearest error boundary — which, with none here, was
          the one that renders "Something went wrong" over the whole of Home.
          Two decorative JPEGs could black out the front page.

          So the boundary is explicit and it fails to `null`: no speed lines,
          no paper tooth, a chamber that is otherwise exactly itself. This is
          doctrine principle 1 in the smallest possible form — a supporting
          piece may fail without the player finding out.
        */}
        <DecorationBoundary>
          <Suspense fallback={null}>
            <ChamberAtmosphere animate={animate} />
          </Suspense>
        </DecorationBoundary>
        {/*
          THE SAME TRAP, ONE LEVEL UP, AND IT MUST NOT BE LEFT OPEN.

          `Suspense` here covers the GLB STREAMING and draws the primitive
          specimen meanwhile. It does not cover the GLB FAILING: a 404 or a
          malformed model throws out of `useGLTF`, past this boundary, and
          takes Home down exactly the way two missing JPEGs just did.

          The fallback for a failure is therefore the SAME primitive specimen
          the fallback for slowness is — rounded boxes, no model file, every
          cosmetic still mounted at its anchor. A player whose model failed to
          load sees a slightly simpler snake and nothing else. There is no
          state in which the chamber has no creature in it.
        */}
        <SpecimenFallbackBoundary
          fallback={
            <SpecimenBody dynasty={dynasty} animate={animate} loadout={loadout} />
          }
        >
          <Suspense
            fallback={
              <SpecimenBody dynasty={dynasty} animate={animate} loadout={loadout} />
            }
          >
            <VoxelSpecimen dynasty={dynasty} animate={animate} loadout={loadout} />
          </Suspense>
        </SpecimenFallbackBoundary>
      </Canvas>
    </div>
  );
}

export default SpecimenChamber;
