'use client';

/**
 * FoodBeacon - the board pickup, drawn as 90S CARTOON FOOD.
 *
 * THE SUPERSESSION. INK & AMBER got the idea right and the material wrong:
 * food should read as something a cartoon would eat, and it did - but it was
 * built as a near-sphere lit by the board and lifted by an emissive so large
 * it erased its own cel bands. This pass keeps the idea, the shapes' ROLES and
 * every semantic, and rebuilds the surface on the snake's own vocabulary. The
 * argument for each choice lives in `screen/food90s.ts`; what follows is what
 * is drawn.
 *
 *   APPLE   the ordinary food, on every board, in every dynasty. A chunky
 *           tapered block - barrel-bodied with a shoulder - an ink stem, one
 *           fat green leaf and a single bone glint. The leaf is not decoration:
 *           it breaks the silhouette asymmetrically, which is what keeps the
 *           shape legible at the smallest board scale where a symmetric blob is
 *           not, and red-against-green is a pairing no other object on the
 *           board owns.
 *   DONUT   the golden state. Glazed, sprinkled, and the only ANNULUS in the
 *           scene - a hole is a shape nothing else has and it reads before the
 *           gold does. The incumbent earned that property with a gold ring;
 *           this keeps the property and spends it on an actual food.
 *   BERRY   the wager state. Wide-shouldered, drawn to a blunt point, and
 *           wobbling on two frequencies that never resolve - it stands on a
 *           corner it could fall off, so the shape says risk before the motion
 *           does. UMBRA, the colour the product already spends on risk.
 *
 * EVERY STATE IS TOLD APART ON THREE CHANNELS AT ONCE - silhouette, hue family
 * and motion - and never on brightness, which is the one channel that does not
 * survive a cheaper tier. `FOOD_STATE_SIGNATURES` states it and the test
 * asserts it.
 *
 * ENV-IMMUNITY. Every body runs the snake's face-keyed shading, which zeroes
 * both reflected-light accumulators and writes an authored band off the world
 * normal. After that the food's colour is a function of its own surface and
 * nothing else - not the key light, not the fill, not the board theme standing
 * behind it. A fruit cannot wash out when the dynasty changes.
 *
 * Cost: 6 draw calls for the apple (body + hull, leaf + hull, and the stem and
 * glint as unlit ink marks that carry no hull), 6 for the donut, 5 for the
 * berry - parity with the beacon this replaces. Geometries and materials live
 * at module scope and are shared; per-frame work is scale and rotation writes
 * only, with no allocations, no React state and - deliberately - no brightness
 * animation at all.
 */

import { useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  DONUT_SPRINKLES,
  FOOD_CHIP_INK_HULL_WIDTH,
  FOOD_PALETTE,
  FOOD_STATE_SIGNATURES,
  FOOD_TONES,
  FOOD_TONES_FLAT_FALL,
  appleBodyGeometry,
  berryBodyGeometry,
  chipGeometry,
  createFoodInkHullMaterial,
  donutGeometry,
  getFoodCelMaterial,
  getFoodFlatMaterial,
} from './screen/food90s';

/**
 * THE ORDINARY FOOD. `standard` is the board's alias for it - board code names
 * the ROLE and this module owns the shape, so there is exactly one place the
 * ordinary pickup is decided.
 */
export const ORDINARY_FOOD = 'apple' as const;

export type FoodVariant = 'standard' | typeof ORDINARY_FOOD | 'golden' | 'wager';

interface FoodBeaconProps {
  /** Food position */
  position: [number, number, number];
  /**
   * THE OBJECTIVE COLOUR, AND WHY THE ORDINARY FOOD NO LONGER TAKES IT.
   *
   * Retained so every existing caller compiles and so the specials keep a
   * fallback, but the apple is authored scarlet on every board now. Two
   * reasons, and neither is taste:
   *
   *   Nothing dynasty-specific is being given up. All three material profiles
   *   set `objectiveColor` to the same `systemCyan`, so the shipped food was
   *   already one fixed colour everywhere - a CYAN apple, and on the cyan-neon
   *   CYBER board a cyan pickup against a cyan board is the worst pairing the
   *   palette can produce.
   *
   *   A tinted food is not a food. The whole brief is that the pickup belongs
   *   to the same cartoon as the character, and a cartoon apple is red. Colour
   *   is the food's IDENTITY here, not a channel for something else to borrow.
   *
   * The one thing this drops is COSMIC's per-glyph wave tint. A constellation
   * wave still reads as one object - its members are the only multi-food state
   * on the board and they arrive together - but successive waves no longer
   * differ in hue. Flagged for the owner rather than buried: restoring it is
   * one line here.
   */
  color?: string;
  /** Visual-only scale; released default remains 1. */
  visualScale?: number;
  /** Gene-special silhouette. Board code leaves this alone: `standard` is the apple. */
  variant?: FoodVariant;
}

/** Rest height of the item's centre above the board plane. */
const CENTER_Y = 0.36;
/** Spawn pop duration (elastic overshoot) */
const SPAWN_DURATION = 0.45;

/** Footprints, straight off the distinctness table - one source, not two. */
const APPLE_WIDTH = FOOD_STATE_SIGNATURES.apple.footprint;
const DONUT_WIDTH = FOOD_STATE_SIGNATURES.donut.footprint;
const BERRY_WIDTH = FOOD_STATE_SIGNATURES.berry.footprint;
/** A squat apple is a friendly apple: the body is wider than it is tall. */
const APPLE_SQUASH = 0.88;
/** The berry is the one body taller than it is wide - that is the taper. */
const BERRY_STRETCH = 1.08;

/** Idle motion. Ordinary food hovers and turns; it does not tumble. */
const IDLE_SPIN_RATE = 0.42;
const IDLE_BOB_RATE = 1.7;
const IDLE_BOB_HEIGHT = 0.045;
/** GOLDEN: a donut turning on the board's up axis, so the hole never hides. */
const DONUT_SPIN_RATE = 0.62;
const DONUT_BOB_RATE = 1.5;
const DONUT_BOB_HEIGHT = 0.06;
/** The fixed tilt that keeps the annulus off edge-on. */
const DONUT_TILT: [number, number, number] = [0.34, 0, 0.12];
/**
 * WAGER: a berry that never quite settles. The two wobble frequencies are
 * deliberately incommensurate so the motion never resolves into a loop - risk
 * should feel unsteady, and no other object on the board moves like this.
 */
const BERRY_SPIN_RATE = 0.55;
const BERRY_WOBBLE_Z = { rate: 3.1, amplitude: 0.16 } as const;
const BERRY_WOBBLE_X = { rate: 2.3, phase: 1.1, amplitude: 0.13 } as const;
const BERRY_HOP = { rate: 2.6, height: 0.055 } as const;

// -----------------------------------------------------------------------------
// Materials - module scope, shared, never disposed
// -----------------------------------------------------------------------------

const bodyHullMaterial = createFoodInkHullMaterial();
/** Fine parts get a fine line, or the ink swallows the leaf. */
const chipHullMaterial = createFoodInkHullMaterial(FOOD_CHIP_INK_HULL_WIDTH);

const appleMaterial = getFoodCelMaterial(FOOD_PALETTE.appleSkin, FOOD_TONES);
const berryMaterial = getFoodCelMaterial(FOOD_PALETTE.berry, FOOD_TONES);
/**
 * The glaze and the greenery take the FLAT-FALL table. The top-lit fall is
 * keyed to raw object-space height on a unit body; on a ring laid flat and on
 * a leaf a tenth of a cell thick it would not draw a gradient, only a constant
 * tax on the authored colour.
 */
const glazeMaterial = getFoodCelMaterial(
  FOOD_PALETTE.glaze,
  FOOD_TONES_FLAT_FALL
);
const leafMaterial = getFoodCelMaterial(
  FOOD_PALETTE.leaf,
  FOOD_TONES_FLAT_FALL
);

/** Stem: ink, unlit, so it stays a drawn mark at any scale. */
const inkPartMaterial = getFoodFlatMaterial(FOOD_PALETTE.ink);
/** The cartoon highlight. Unlit bone - it is a drawn glint, not a specular. */
const glintMaterial = getFoodFlatMaterial(FOOD_PALETTE.glint);
const sprinkleBoneMaterial = getFoodFlatMaterial(FOOD_PALETTE.sprinkleBone);
const sprinklePinkMaterial = getFoodFlatMaterial(FOOD_PALETTE.sprinklePink);

// -----------------------------------------------------------------------------
// Parts
// -----------------------------------------------------------------------------

/**
 * One outlined part.
 *
 * The hull is mounted as a CHILD of the mesh it outlines rather than a
 * sibling, so it inherits the same transform automatically. The hull shader
 * divides its offset by world scale, so the line stays the same weight on a
 * 0.66-wide apple and a 0.12-wide sprinkle alike. `ink="none"` for marks that
 * ARE the ink.
 */
function Part({
  position,
  scale,
  rotation,
  material,
  geometry = chipGeometry,
  ink = 'chip',
}: {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  material: THREE.Material;
  geometry?: THREE.BufferGeometry;
  ink?: 'body' | 'chip' | 'none';
}) {
  return (
    <mesh
      position={position}
      scale={scale}
      rotation={rotation}
      geometry={geometry}
      material={material}
      castShadow
    >
      {ink !== 'none' && (
        <mesh
          geometry={geometry}
          material={ink === 'body' ? bodyHullMaterial : chipHullMaterial}
          renderOrder={-1}
        />
      )}
    </mesh>
  );
}

/**
 * THE APPLE - the ordinary food, on every board, in every dynasty.
 *
 * Cool and cute is a proportion problem, not a decoration problem: the body is
 * wider than it is tall, the stem is short and tilted (an upright stem reads as
 * a bomb fuse), and the leaf sits high and to one side so the silhouette is
 * asymmetric. The single bone pixel is the entire cartoon read - the same
 * pixel-glint vocabulary the snake's eyes use, so the food and the character
 * are drawn by one hand.
 */
function Apple() {
  return (
    <group>
      <Part
        position={[0, 0, 0]}
        scale={[APPLE_WIDTH, APPLE_WIDTH * APPLE_SQUASH, APPLE_WIDTH]}
        material={appleMaterial}
        geometry={appleBodyGeometry}
        ink="body"
      />
      {/* Stem: short, tilted, ink. */}
      <Part
        position={[0.02, APPLE_WIDTH * 0.42, 0]}
        scale={[0.06, 0.18, 0.06]}
        rotation={[0, 0, -0.3]}
        material={inkPartMaterial}
        ink="none"
      />
      {/* Leaf: one fat blade off the stem, tipped up and swept back. Chunky
          rather than thin - a blade thinner than the ink line is a line. */}
      <Part
        position={[0.19, APPLE_WIDTH * 0.5, 0.02]}
        scale={[0.27, 0.1, 0.16]}
        rotation={[0, -0.35, 0.42]}
        material={leafMaterial}
      />
      {/* The glint. Upper-left of the body, flat on its face. */}
      <Part
        position={[-0.15, 0.1, APPLE_WIDTH * 0.42]}
        scale={[0.09, 0.09, 0.03]}
        material={glintMaterial}
        ink="none"
      />
    </group>
  );
}

/**
 * THE DONUT - the golden state.
 *
 * The sprinkles are unlit drawn marks scattered around the ring at authored
 * angles: they cost no outline, they read as texture rather than as parts, and
 * they are what stops a fat amber torus reading as the coin it replaced.
 */
function Donut() {
  return (
    <group scale={DONUT_WIDTH}>
      <mesh geometry={donutGeometry} material={glazeMaterial} castShadow>
        <mesh
          geometry={donutGeometry}
          material={bodyHullMaterial}
          renderOrder={-1}
        />
      </mesh>
      {DONUT_SPRINKLES.map(([angle, tilt], index) => (
        <Part
          key={angle}
          position={[
            Math.cos(angle) * 0.28,
            0.1,
            Math.sin(angle) * 0.28,
          ]}
          scale={[0.11, 0.035, 0.045]}
          rotation={[0, -angle + tilt, 0]}
          material={
            index % 2 === 0 ? sprinkleBoneMaterial : sprinklePinkMaterial
          }
          ink="none"
        />
      ))}
    </group>
  );
}

/**
 * THE BERRY - the wager state. A calyx of two leaves and one glint; the taper
 * does the rest.
 */
function Berry() {
  return (
    <group>
      <Part
        position={[0, 0, 0]}
        scale={[BERRY_WIDTH, BERRY_WIDTH * BERRY_STRETCH, BERRY_WIDTH]}
        material={berryMaterial}
        geometry={berryBodyGeometry}
        ink="body"
      />
      <Part
        position={[0.11, BERRY_WIDTH * 0.5, 0.04]}
        scale={[0.24, 0.08, 0.13]}
        rotation={[0, -0.4, 0.24]}
        material={leafMaterial}
      />
      <Part
        position={[-0.12, BERRY_WIDTH * 0.44, -0.06]}
        scale={[0.22, 0.08, 0.12]}
        rotation={[0, 2.5, -0.2]}
        material={leafMaterial}
      />
      <Part
        position={[-0.13, 0.08, BERRY_WIDTH * 0.38]}
        scale={[0.08, 0.08, 0.03]}
        material={glintMaterial}
        ink="none"
      />
    </group>
  );
}

// -----------------------------------------------------------------------------
// Beacon
// -----------------------------------------------------------------------------

/**
 * `standard` is the ordinary food and the ordinary food is the apple. One
 * place decides it, so no caller can drift.
 */
function resolveVariant(variant: FoodVariant): Exclude<FoodVariant, 'standard'> {
  return variant === 'standard' ? ORDINARY_FOOD : variant;
}

export function FoodBeacon({
  position,
  visualScale = 1,
  variant = 'standard',
}: FoodBeaconProps) {
  const groupRef = useRef<THREE.Group>(null);
  const idleRef = useRef<THREE.Group>(null);
  const berryRef = useRef<THREE.Group>(null);
  const donutRef = useRef<THREE.Group>(null);
  // Spawn tracking: re-pop whenever the food moves to a new cell (the
  // component instance persists across spawns)
  const lastXRef = useRef(position[0]);
  const lastZRef = useRef(position[2]);
  const spawnAtRef = useRef<number | null>(null);

  const resolved = resolveVariant(variant);

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();
    if (
      spawnAtRef.current === null ||
      lastXRef.current !== position[0] ||
      lastZRef.current !== position[2]
    ) {
      lastXRef.current = position[0];
      lastZRef.current = position[2];
      spawnAtRef.current = time;
    }
    const age = time - spawnAtRef.current;

    // Elastic spawn pop - a new objective announces itself by SIZE, which
    // survives every tier, rather than by a flash, which does not.
    let spawnScale = 1;
    if (age >= 0 && age < SPAWN_DURATION) {
      const t = age / SPAWN_DURATION;
      spawnScale = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2.5) * 1.35;
      if (spawnScale < 0.001) spawnScale = 0.001;
    }
    if (groupRef.current) {
      groupRef.current.scale.setScalar(spawnScale * visualScale);
    }

    // Ordinary food HOVERS. It does not tumble: an apple rolling end over end
    // is a physics object, and this is a pickup sitting in the air waiting to
    // be taken. A slow turn sweeps the leaf past the camera once a cycle,
    // which is the whole animation budget it needs.
    if (idleRef.current) {
      idleRef.current.rotation.y += delta * IDLE_SPIN_RATE;
      idleRef.current.position.y = Math.sin(time * IDLE_BOB_RATE) * IDLE_BOB_HEIGHT;
    }

    // GOLDEN: the spin is around the board's up axis and the tilt is fixed, so
    // the annulus is never edge-on - the hole is the shape, and a hole you
    // cannot see is not a shape.
    if (donutRef.current) {
      donutRef.current.rotation.y += delta * DONUT_SPIN_RATE;
      donutRef.current.position.y =
        Math.sin(time * DONUT_BOB_RATE) * DONUT_BOB_HEIGHT;
    }

    // WAGER: a berry that never quite settles.
    if (berryRef.current) {
      berryRef.current.rotation.y += delta * BERRY_SPIN_RATE;
      berryRef.current.rotation.z =
        Math.sin(time * BERRY_WOBBLE_Z.rate) * BERRY_WOBBLE_Z.amplitude;
      berryRef.current.rotation.x =
        Math.sin(time * BERRY_WOBBLE_X.rate + BERRY_WOBBLE_X.phase) *
        BERRY_WOBBLE_X.amplitude;
      berryRef.current.position.y =
        Math.abs(Math.sin(time * BERRY_HOP.rate)) * BERRY_HOP.height;
    }
  });

  let body: ReactElement | null = null;
  if (resolved === ORDINARY_FOOD) {
    body = (
      <group ref={idleRef}>
        <Apple />
      </group>
    );
  } else if (resolved === 'golden') {
    body = (
      <group ref={donutRef} rotation={DONUT_TILT}>
        <Donut />
      </group>
    );
  } else {
    body = (
      <group ref={berryRef}>
        <Berry />
      </group>
    );
  }

  return (
    <group ref={groupRef} position={[position[0], CENTER_Y, position[2]]}>
      {body}
    </group>
  );
}

export default FoodBeacon;
