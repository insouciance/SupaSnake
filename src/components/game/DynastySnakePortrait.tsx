'use client';

/**
 * DYNASTY SNAKE PORTRAITS — the real head, three times, on one canvas.
 *
 * Owner ruling (2026-08-08): the Run Setup favourite tiles "should display the
 * actual snake, or like a thumbnail of it, or just the face almost from the
 * front, just a small angle that shows or indicates it's 3D. Almost like a
 * passport picture but at a small angle. For now, the difference is the snake
 * color for the dynasties, plus the cosmetics should be visible."
 *
 * So the tile carries the CREATURE, not a picture of one. Same GLB head, same
 * `getSnakeSegmentMaterial` per dynasty, same ink hull, same cosmetics
 * renderer the board and the chamber use. The dynasty difference is the
 * snake's own colour, which is exactly the owner's clause — nothing here
 * invents a swatch.
 *
 * ── WHY A SNAPSHOT, AND NOT THREE LIVE CANVASES ──────────────────────────
 *
 * The owner named the shape of the answer before the code existed: "three
 * live mini-canvases is likely too heavy — prefer render-to-texture ... or a
 * single shared canvas snapshotting three poses". Three canvases would be
 * three WebGL contexts, three render loops and three copies of the toon
 * program, held for the whole of Setup, on the surface the player reaches
 * from a cold Home load — and then thrown away the instant PLAY is pressed
 * and the board wants a context of its own. Browsers cap live contexts, and
 * the board's context is the one that must never be the loser.
 *
 * What runs instead: ONE context, ONE frame, then nothing.
 *
 *   1. a hidden 256x256 `<Canvas frameloop="demand">` mounts, but only while
 *      the portraits for this loadout are missing;
 *   2. `useFrame(cb, 1)` — a positive priority takes the render loop off R3F
 *      and hands it to us, so we call `gl.render()` and read the drawing
 *      buffer back in the SAME frame, which is the only place
 *      `preserveDrawingBuffer` is cheap;
 *   3. all three dynasties inside that one frame: the only thing that differs
 *      between them is the head's material (and, on the lit rollback style,
 *      the rim lamp), so the shutter swaps those and renders three times;
 *   4. the whole canvas UNMOUNTS on the next commit and the context is
 *      released — before the board ever asks for one.
 *
 * The results are PNG data URLs cached at module level under
 * `${dynasty}|${loadoutKey}`, so re-opening Setup in the same tab costs zero
 * frames and zero contexts. Changing what the snake wears changes the key,
 * which is the only thing that re-runs the capture.
 *
 * ── FAILURE IS INVISIBLE (doctrine principle 1) ──────────────────────────
 *
 * A portrait is DECORATION beside a button that is already fully labelled. So
 * every failure path — no WebGL, a 404 on the GLB, a canvas readback the
 * browser refuses, a frame that has not happened yet — resolves to "this
 * dynasty has no URL", and `RunSetupPanel` draws exactly what it drew before
 * this file existed: the strain glyph. There is no state in which a player
 * sees a broken or empty tile, and no state in which a missing portrait costs
 * them a decision. `AssetGate` closes the half of that which `Suspense` does
 * not (FM-13): it wraps the head, so a failed model produces NO capture rather
 * than a capture of an empty room.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

import {
  EquippedCosmetics,
  occludesFeature,
  type CosmeticLoadout,
} from '@/components/home/SnakeCosmetics';
import { EMPTY_SNAKE_LOADOUT } from '@/lib/cosmetics/snakeCosmetics';
import { SNAKE_COSMETIC_SLOTS } from '@/shared/game/cosmeticSlots';
import { AssetGate } from '@/components/game/AssetGate';
import {
  SETUP_DYNASTIES,
  type SetupDynasty,
} from '@/components/game/SnakePickerSheet';
import {
  getSnakeGeometries,
  getSnakeSegmentMaterial,
  SNAKE_MODEL_URL,
} from '@/components/game/SnakeModel';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';
import { getSnakeRoundedGeometry } from '@/components/game/screen/gameRenderGeometry';
import {
  applySnakeFaceShading,
  createSnakeInkHullMaterial,
  GUIDE_PALETTE,
  IS_SNAKE_90S,
  SNAKE_STYLE_PROFILE,
  TONE_SIDE,
} from '@/components/game/screen/snake90s';

/** What the hook hands back: a data URL per dynasty, or nothing for that one. */
export type DynastyPortraitMap = Partial<Record<SetupDynasty, string>>;

// -----------------------------------------------------------------------------
// THE RATIFIED HERO-SHOT ANGLE
//
// These are SpecimenChamber's numbers, not new ones. The chamber settled the
// portrait angle over three passes and wrote the reasoning down; a second
// surface drawing the same creature at a second angle would be two products.
// -----------------------------------------------------------------------------

/** ~17 degrees above the eye line. */
const CAMERA_ELEVATION = 0.3;
const CAMERA_AZIMUTH = 0.34;

/**
 * The face, 21 degrees off the lens — the classic three-quarter hero portrait.
 * Dead-frontal is a mugshot and was explicitly ruled out; far enough round and
 * the near cheek dominates and the face stops being the subject.
 *
 * The chamber DERIVES this from its neck (`HEAD_GLANCE = 0.52` interpolating
 * from the spine heading toward the camera heading, landing at 21.1 degrees).
 * A head-only portrait has no neck to glance from, so the same angle is stated
 * absolutely here. Stated as an ANGLE rather than copied as a yaw, because the
 * angle is the ratified fact and the yaw is only its arithmetic.
 */
const THREE_QUARTER_OFF_LENS = 0.3685;

/** The yaw that would point the head's face (+Z local) straight down the lens. */
const CAMERA_YAW = CAMERA_AZIMUTH;

/** Turned back off the lens by the ratified three-quarter angle. */
const PORTRAIT_HEAD_YAW = CAMERA_YAW - THREE_QUARTER_OFF_LENS;

/**
 * Framing radius, in head cells. The head is an exact unit cube, so 0.5 is its
 * own half-extent; the rest is the cosmetic pad — braids fall below the jaw and
 * overhang the sides, and a frame cut to the bare head would guillotine them.
 *
 * WIDENED WITH THE FRAME (owner ruling, 2026-08-08: the portrait fills the
 * tray). 0.94 was set when this picture was a 44px chip, where a braid tip
 * running off the edge was a detail nobody could resolve. The picture is now
 * the whole face of the card at up to ~230px, and at that size a clipped braid
 * is the first thing the eye lands on — the cosmetics are the part of the
 * creature the owner's clause says must stay VISIBLE, so they have to be
 * inside the frame rather than merely accounted for by it.
 *
 * 1.18 fits the braid envelope with a ring of room left over. The bare head
 * still owns the middle of the crop, which is the passport read the ruling
 * asked for; what the extra buys is that the character arrives whole.
 */
const PORTRAIT_FIT_RADIUS = 1.18;
const PORTRAIT_FOV = 34;

/**
 * Square, and the same in both axes, so all three tiles crop identically —
 * and so the picture can be dropped into a square face with `object-cover`
 * and lose nothing at all. The tile's face IS this frame now (owner ruling,
 * 2026-08-08: the portrait fills the tray), which is why the resolution went
 * up: the face was a 56px chip and is now a whole column of the tray, about
 * 230 CSS px on the desktop measure and 118 on a 390px phone. 384 covers the
 * larger of those at 2x and the smaller at 3x; it is still ONE frame and
 * three readbacks, so the cost of the change is memory and not time.
 */
const PORTRAIT_PX = 384;

const PORTRAIT_DISTANCE =
  PORTRAIT_FIT_RADIUS /
  Math.sin(THREE.MathUtils.degToRad(PORTRAIT_FOV) / 2);

const PORTRAIT_CAMERA_POSITION: [number, number, number] = [
  Math.sin(CAMERA_AZIMUTH) * Math.cos(CAMERA_ELEVATION) * PORTRAIT_DISTANCE,
  Math.sin(CAMERA_ELEVATION) * PORTRAIT_DISTANCE,
  Math.cos(CAMERA_AZIMUTH) * Math.cos(CAMERA_ELEVATION) * PORTRAIT_DISTANCE,
];

/** Aimed a hair below centre so a crown cosmetic does not crowd the top edge. */
const PORTRAIT_TARGET = new THREE.Vector3(0, -0.04, 0);

// -----------------------------------------------------------------------------
// Shared materials / geometry — module level, so three captures allocate once
// -----------------------------------------------------------------------------

/**
 * THE CREATURE CARRIES ITS HOUSE — portraits, and only portraits.
 *
 * Owner ruling, 2026-08-08, overruling the one-colour law for this surface by
 * name: CYBER, PRIMAL and COSMIC each get a house-tinted snake in their
 * portrait. What stood before was the shipped character law — `snake90s.ts`
 * resolves every dynasty's head through `forcedHeadBaseColor`, so all three
 * heads really are one amber creature — and the tile spent the house colour on
 * the GROUND RING behind the head instead. The owner reviewed that and moved
 * the colour onto the animal.
 *
 * ── THE TINT IS AUTHORED, NOT WASHED ─────────────────────────────────────
 *
 * A hue rotation over the amber render would have been one line and would have
 * produced three versions of the same picture in fancy dress: the bands would
 * keep amber's relative values, the shadow would go grey-of-another-hue, and
 * the creature would read as a recolour rather than as a character of that
 * house. So nothing here washes pixels. Two authored facts build a real
 * five-band tone family per house, and BOTH of them already exist in the
 * product:
 *
 *   THE BASE is the dynasty's OWN snake colour — `GAME_MATERIAL_PROFILES
 *   [dynasty].snake.baseColor`, which is the colour the creature had before
 *   `ninetiesGuide` forced the three of them to amber. The portrait un-forces
 *   it. Nothing new is invented and nothing is picked by eye.
 *
 *   THE BANDS are the guide's own `SNAKE_FACE_TONES`, untouched. They are
 *   multipliers on the base, so a different base yields a different FAMILY
 *   rather than a tinted copy — and `TONE_DOWN`'s own comment already names
 *   the three shadows this produces: "PRIMAL #98e15a -> #514c15 dark olive,
 *   not grey; CYBER #2de7ff -> #144e4e deep teal, not slate; COSMIC #b58cff
 *   -> #612c4e deep plum, not charcoal". The generalisation was written down
 *   before it was ever drawn; this is the surface that spends it.
 *
 * ── THE EMISSIVE IS THE HOUSE'S OWN MID TONE ─────────────────────────────
 *
 * The guide forces every emissive to `GUIDE_PALETTE.midtone`, and an orange
 * lamp inside a cyan head is a muddy head. The replacement is not a fourth
 * swatch per house: the guide's own mid tone IS its highlight run through
 * `TONE_SIDE` — the file says so, and the arithmetic agrees to two units
 * (#ffc53d x TONE_SIDE = #f38522 against the stated #f5811f). So a house's
 * emissive is that house's base through the same multiplier. One rule,
 * derived from the guide, generalised without a single authored hex:
 *
 *      CYBER   #2de7ff -> #2a9d9e      PRIMAL  #98e15a -> #919834
 *      COSMIC  #b58cff -> #ad5d9e
 *
 * The INTENSITY is left exactly where the clone found it, which is the
 * dynasty's own `headEmissiveIntensity` scaled by `HEAD_EMISSIVE_SCALE`. A
 * portrait that also re-weighted the lamp would be authoring a second
 * material rather than un-forcing one.
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────
 *
 * The board is untouched. These are portrait-local clones — the game's shared
 * material cache is never mutated — so the creature that launches is still the
 * one amber animal the character law describes, and the ruling stays exactly
 * as narrow as it was written.
 *
 * `Material.copy()` DROPS `onBeforeCompile`, so a clone arrives with its
 * colours assigned and its 90s cel shader missing — a portrait lit by this
 * rig's lamps beside a board painted by its own authored faces. Re-hang it or
 * the tile shows a different animal from the one that launches. It is re-hung
 * AFTER the colours are set, because the shader is what spends them.
 */
const portraitMaterialCache = new Map<string, THREE.MeshToonMaterial>();

/**
 * A house's mid tone: its base through `TONE_SIDE`, in the linear working
 * space the shader's own multiply happens in.
 *
 * `THREE.Color` holds linear-sRGB under three's colour management, which is
 * the space `diffuseColor.rgb * toneMul` runs in — so this is the same
 * multiplication the GPU does, done once on the CPU.
 */
export function houseMidTone(baseColor: string): THREE.Color {
  const tone = new THREE.Color(baseColor);
  tone.r *= TONE_SIDE[0];
  tone.g *= TONE_SIDE[1];
  tone.b *= TONE_SIDE[2];
  return tone;
}

/**
 * The two colours a house's portrait is painted from, as hex.
 *
 * Exported so the tint LAW can be asserted rather than the rendering: a
 * portrait is a WebGL readback and there is no WebGL in jest, so the thing a
 * test can hold is that each house's base is that house's own authored snake
 * colour and its lamp is that colour's own mid tone.
 */
export function portraitHouseTint(dynasty: SetupDynasty): {
  base: string;
  midTone: string;
} {
  const base = getGameMaterialProfile(dynasty).snake.baseColor;
  return { base, midTone: `#${houseMidTone(base).getHexString()}` };
}

function getPortraitHeadMaterial(dynasty: SetupDynasty): THREE.MeshToonMaterial {
  let material = portraitMaterialCache.get(dynasty);
  if (!material) {
    material = getSnakeSegmentMaterial(dynasty, true).clone();
    const baseColor = getGameMaterialProfile(dynasty).snake.baseColor;
    material.color.set(baseColor);
    material.emissive.copy(houseMidTone(baseColor));
    applySnakeFaceShading(material, {
      role: 'head',
      cacheKey: `setup-portrait:${dynasty}:head`,
    });
    portraitMaterialCache.set(dynasty, material);
  }
  return material;
}

const portraitHullMaterial = createSnakeInkHullMaterial();
const fallbackHeadGeometry = getSnakeRoundedGeometry('head');

/**
 * Eye pieces — the same two meshes at the same head-local anchors the board's
 * `SnakeEyes` and the chamber's `SpecimenEyes` use. This is the third copy of a
 * fifteen-line pattern, and it is a copy on purpose: both existing sites are
 * private to files this work package may not edit, and the anchors are already
 * pinned by `SNAKE_STYLE_PROFILE`, so the shared thing (the proportions) IS
 * shared and only the mounting is repeated.
 */
const eyeGeometry = new THREE.BoxGeometry(1, 1, 1);
const eyeDarkMaterial = new THREE.MeshBasicMaterial({
  color: IS_SNAKE_90S ? GUIDE_PALETTE.ink : '#06090d',
});
const eyeGlintMaterial = new THREE.MeshBasicMaterial({
  color: IS_SNAKE_90S ? GUIDE_PALETTE.white : '#e6edf3',
});

function PortraitEyes() {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.22, 0.16, 0.51]}>
          <mesh
            geometry={eyeGeometry}
            material={eyeDarkMaterial}
            scale={SNAKE_STYLE_PROFILE.eyePupilScale}
          />
          <mesh
            geometry={eyeGeometry}
            material={eyeGlintMaterial}
            scale={SNAKE_STYLE_PROFILE.eyeGlintScale}
            position={[...SNAKE_STYLE_PROFILE.eyeGlintOffset]}
          />
        </group>
      ))}
    </group>
  );
}

/**
 * The chamber's studio recipe, on a dark plate. The ambient is the dominant
 * term on purpose: on a MeshToonMaterial it pushes the surface into the ramp's
 * upper bands, which is the flat bright fill a comic character has. The key
 * only carves the single step; the dynasty colour rides a soft rim.
 *
 * The RIM is handed out by ref rather than by prop, because all three
 * portraits are taken inside one frame and the rim is the one lamp that
 * differs between them (see the shutter). Under the shipped 90s style the
 * face-keyed shader zeroes every light term and the rim does nothing at all —
 * it is kept because the rollback style is lit, and a portrait that only
 * looked right on one flag leg would be a rollback that ships a grey creature.
 */
function PortraitLights({ rimRef }: { rimRef: Ref<THREE.DirectionalLight> }) {
  return (
    <>
      <ambientLight intensity={1.15} color="#fff6e6" />
      <hemisphereLight args={['#fffaf0', '#e8d5b8', 0.55]} />
      <directionalLight position={[3.5, 4.5, 4.5]} intensity={0.62} color="#ffe9c6" />
      <directionalLight ref={rimRef} position={[-5, 2.5, -4]} intensity={0.5} />
    </>
  );
}

// -----------------------------------------------------------------------------
// The head, and the frame that photographs it
// -----------------------------------------------------------------------------

interface PortraitStageProps {
  loadout: CosmeticLoadout;
  passKey: string;
  onCapture: (passKey: string, portraits: DynastyPortraitMap) => void;
  headGeometry?: THREE.BufferGeometry;
}

/**
 * THE STAGE AND THE SHUTTER, TOGETHER, BECAUSE THEY TAKE ONE FRAME.
 *
 * The head is mounted exactly the way the BOARD mounts its own: fill mesh, ink
 * hull behind it, bare eyes that stand down when something covers them, and
 * every equipped cosmetic at its authored anchor. `detail="hero"` rather than
 * `"board"` because this renders at 256px and shows at 44–56; the board's
 * detail level exists for a head seventeen pixels wide and would drop parts
 * this crop can plainly resolve.
 *
 * ── ONE FRAME, THREE EXPOSURES ───────────────────────────────────────────
 *
 * The first cut of this file drove a three-step queue: render one dynasty, let
 * React commit the next one's material, render again. It worked, and it took
 * about two and a half seconds to produce three pictures, with an occasional
 * tile left on its glyph — because every step depended on a `frameloop="demand"`
 * invalidation surviving a React commit raised from inside the render loop.
 *
 * All of that was solving a problem the scene does not have. The three
 * portraits differ in ONE object: the head's material. The cosmetics are the
 * player's single loadout and are identical in all three, the geometry is
 * shared, the camera never moves. So the shutter swaps the material (and the
 * rim lamp, for the lit rollback style) directly and renders three times
 * inside ONE `useFrame`, reading the buffer back after each. No queue, no
 * invalidation chain, no partial result: the portraits arrive together on the
 * first frame the model is ready, and the canvas unmounts on the next commit.
 *
 * Mutating `mesh.material` behind React's back is safe here and only here:
 * this subtree exists for the length of one frame, is never interactive, and
 * is unmounted by the state this very call sets.
 *
 * It lives INSIDE the `AssetGate`, so a model that failed or has not arrived
 * produces NO capture instead of a photograph of an empty room. That is what
 * makes the fallback invisible rather than merely quiet.
 */
function PortraitStage({
  loadout,
  passKey,
  onCapture,
  headGeometry,
}: PortraitStageProps) {
  const geometry = headGeometry ?? fallbackHeadGeometry;
  const headRef = useRef<THREE.Mesh>(null);
  const rimRef = useRef<THREE.DirectionalLight>(null);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  // `frameloop="demand"` renders only when something asks. Ask once, on mount:
  // one frame is the whole job.
  useEffect(() => {
    invalidate();
  }, [invalidate, passKey]);

  useFrame(() => {
    const head = headRef.current;
    if (!head) return;
    camera.lookAt(PORTRAIT_TARGET);
    camera.updateMatrixWorld();

    const portraits: DynastyPortraitMap = {};
    for (const dynasty of SETUP_DYNASTIES) {
      head.material = getPortraitHeadMaterial(dynasty);
      rimRef.current?.color.set(getGameMaterialProfile(dynasty).lighting.keyColor);
      gl.render(scene, camera);
      try {
        portraits[dynasty] = gl.domElement.toDataURL('image/png');
      } catch (error) {
        // A tainted or size-zero canvas refuses readback. Reported, never
        // swallowed (FM-2) — and the tile simply keeps its glyph.
        console.error(
          'Setup portrait readback refused; drawing the glyph:',
          error
        );
      }
    }
    onCapture(passKey, portraits);
  }, 1);

  return (
    <>
      <PortraitLights rimRef={rimRef} />
      <mesh
        ref={headRef}
        rotation={[0, PORTRAIT_HEAD_YAW, 0]}
        geometry={geometry}
        material={getPortraitHeadMaterial(SETUP_DYNASTIES[0])}
      >
        <mesh geometry={geometry} material={portraitHullMaterial} renderOrder={-1} />
        {!occludesFeature(loadout, 'eyes') && <PortraitEyes />}
        <EquippedCosmetics loadout={loadout} detail="hero" />
      </mesh>
    </>
  );
}

/** GLB-backed stage; suspends while the voxel model streams in. */
function VoxelPortraitStage(props: Omit<PortraitStageProps, 'headGeometry'>) {
  const { scene } = useGLTF(SNAKE_MODEL_URL);
  const { head } = getSnakeGeometries(scene);
  return <PortraitStage {...props} headGeometry={head ?? undefined} />;
}

function PortraitCaptureCanvas({
  passKey,
  loadout,
  onCapture,
}: {
  passKey: string;
  loadout: CosmeticLoadout;
  onCapture: (passKey: string, portraits: DynastyPortraitMap) => void;
}) {
  return (
    <div
      aria-hidden="true"
      data-testid="setup-portrait-rig"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: PORTRAIT_PX,
        height: PORTRAIT_PX,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
        overflow: 'hidden',
      }}
    >
      {/* The outer gate catches a renderer that cannot be created at all — a
          blocked or exhausted WebGL context throws out of `<Canvas>` itself,
          and with nothing above it the nearest catcher is the route's error
          boundary. Setup must not be takeable down by a decoration. */}
      <AssetGate label="the setup portrait canvas" fallback={null}>
        <Canvas
          frameloop="demand"
          dpr={1}
          gl={{
            preserveDrawingBuffer: true,
            alpha: true,
            antialias: true,
            powerPreference: 'low-power',
          }}
          camera={{
            fov: PORTRAIT_FOV,
            near: 0.1,
            far: 20,
            position: PORTRAIT_CAMERA_POSITION,
          }}
        >
          <AssetGate label="the setup snake portrait model" fallback={null}>
            <VoxelPortraitStage
              passKey={passKey}
              loadout={loadout}
              onCapture={onCapture}
            />
          </AssetGate>
        </Canvas>
      </AssetGate>
    </div>
  );
}

// -----------------------------------------------------------------------------
// The hook
// -----------------------------------------------------------------------------

/** Cached captures, keyed `${dynasty}|${loadoutKey}`. Data URLs, module-lived. */
const portraitCache = new Map<string, string>();

/**
 * A stable serialisation of what the snake is wearing. Slot order comes from
 * the authored slot list rather than from `Object.keys`, so two loadouts that
 * differ only in property order can never produce two cache entries.
 */
export function snakeLoadoutKey(loadout: CosmeticLoadout): string {
  return SNAKE_COSMETIC_SLOTS.map((slot) => `${slot}=${loadout[slot] ?? ''}`).join(
    ','
  );
}

interface PortraitPass {
  key: string;
  /** True once this loadout has had its one exposure, whatever it produced. */
  taken: boolean;
  portraits: DynastyPortraitMap;
}

function passFromCache(key: string): PortraitPass {
  const portraits: DynastyPortraitMap = {};
  for (const dynasty of SETUP_DYNASTIES) {
    const hit = portraitCache.get(`${dynasty}|${key}`);
    if (hit) portraits[dynasty] = hit;
  }
  const complete = SETUP_DYNASTIES.every((dynasty) => portraits[dynasty]);
  return { key, taken: complete, portraits };
}

export interface DynastySnakePortraits {
  /** A PNG data URL per dynasty. A missing key means "draw the glyph". */
  portraits: DynastyPortraitMap;
  /** The hidden capture rig. Null once every portrait is in hand. */
  captureCanvas: ReactNode;
}

/**
 * Portraits of the player's own snake head, one per dynasty.
 *
 * Safe to call anywhere, including under jsdom and during SSR: the rig is
 * mounted only after an effect has confirmed a browser that has WebGL at all,
 * so a test environment renders no canvas, throws nothing, and simply reports
 * no portraits.
 */
export function useDynastySnakePortraits(
  loadout: CosmeticLoadout = EMPTY_SNAKE_LOADOUT
): DynastySnakePortraits {
  const key = useMemo(() => snakeLoadoutKey(loadout), [loadout]);
  const [pass, setPass] = useState<PortraitPass>(() => passFromCache(key));
  const [renderable, setRenderable] = useState(false);
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;

  // Deferred to an effect rather than read during render: the server has no
  // WebGL and the client does, and a decoration must not hand the two of them
  // different markup to argue about.
  useEffect(() => {
    setRenderable(
      typeof window !== 'undefined' &&
        typeof window.WebGLRenderingContext !== 'undefined'
    );
  }, []);

  useEffect(() => {
    setPass((prev) => (prev.key === key ? prev : passFromCache(key)));
  }, [key]);

  const onCapture = useCallback(
    (passKey: string, portraits: DynastyPortraitMap) => {
      setPass((prev) => {
        // A capture that belongs to a loadout the player has already changed is
        // discarded rather than written: it is a picture of a snake that is no
        // longer this one.
        if (prev.key !== passKey || prev.taken) return prev;
        for (const dynasty of SETUP_DYNASTIES) {
          const url = portraits[dynasty];
          if (url) portraitCache.set(`${dynasty}|${passKey}`, url);
        }
        // `taken` rather than "complete": one exposure per loadout, whatever it
        // yielded. A dynasty whose readback was refused keeps its glyph and
        // does not put the rig into a retry loop for a browser that has already
        // said no.
        return { key: prev.key, taken: true, portraits };
      });
    },
    []
  );

  const capturing = renderable && !pass.taken;

  return {
    portraits: pass.portraits,
    captureCanvas: capturing ? (
      <PortraitCaptureCanvas
        passKey={pass.key}
        loadout={loadoutRef.current}
        onCapture={onCapture}
      />
    ) : null,
  };
}

export default useDynastySnakePortraits;
