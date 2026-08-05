'use client';

/**
 * FoodBeacon - the board pickup.
 *
 * INK & AMBER, and the ruling that closed the food pass. The nested
 * emissive-core-plus-wireframe-cage beacon is gone: it was an abstract jewel,
 * and food should read as FOOD - something you would recognise as edible in a
 * cartoon.
 *
 *   APPLE IS THE ORDINARY FOOD. One shape, everywhere ordinary food appears.
 *   There is no variant switch in board code and no constant to flip - the
 *   board asks for `standard` and gets the apple. Chunky voxel body, ink stem,
 *   one green leaf, one bone pixel glint; the leaf breaks the blob, which is
 *   what keeps it legible at 19px where a symmetric shape is not.
 *
 * Every shape carries the ink hull and the 3-band toon ramp. Specials stay
 * shape-first, because at 19px only OUTLINE survives:
 *
 *   GOLDEN  a flat, chunky, tilted gold ring - a coin caught mid-spin. It is
 *           the only ANNULUS on the board: a hole in the middle is a shape no
 *           other object has, and it reads before the gold does.
 *   WAGER   a cube stood on its corner, wobbling on two frequencies that
 *           never resolve. UMBRA oxblood.
 *
 * Cost: 4 draw calls for the ordinary apple (body + hull, leaf + hull; the
 * stem and glint are unlit ink/bone marks that carry no hull), 2 for either
 * special. The old beacon was 2. Geometries live at module scope; body
 * materials are cached per colour (bounded set: dynasty accents + COSMIC glyph
 * colours) and the fixed parts share one material each. Per-frame work is
 * scale and rotation writes only - no allocations, no React state.
 */

import { useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createExactUnitRoundedBoxGeometry } from './screen/gameRenderGeometry';
import { createInkHullMaterial, getToonGradientMap, INK } from './screen/inkAmber';

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
  /** Dynasty accent color (or COSMIC constellation glyph color) */
  color?: string;
  /** Visual-only scale; released default remains 1. */
  visualScale?: number;
  /** Gene-special silhouette. Board code leaves this alone: `standard` is the apple. */
  variant?: FoodVariant;
}

/** Nominal food radius. Every variant is built against this one number. */
const CORE_SIZE = 0.34;
const CORE_EMISSIVE = 1.6;
/** Rest height of the item's centre above the board plane. */
const CENTER_Y = 0.36;
/** Spawn pop duration (elastic overshoot) */
const SPAWN_DURATION = 0.45;

/** Body diameter, in cells. Held under a cell so food never crowds a turn. */
const APPLE_WIDTH = CORE_SIZE * 1.92;
/** A squat apple is a friendly apple: the body is wider than it is tall. */
const APPLE_SQUASH = 0.88;

/** Idle motion. Ordinary food hovers and turns; it does not tumble. */
const IDLE_SPIN_RATE = 0.42;
const IDLE_BOB_RATE = 1.7;
const IDLE_BOB_HEIGHT = 0.045;
/** GOLDEN HOUR: a coin caught mid-spin, around the board's up axis only. */
const RING_SPIN_RATE = 0.62;
const RING_BOB_RATE = 1.5;
const RING_BOB_HEIGHT = 0.06;
/** The fixed tilt that keeps the annulus off edge-on. */
const RING_TILT: [number, number, number] = [0.34, 0, 0.12];
/**
 * WAGER: a die that never quite settles. The two wobble frequencies are
 * deliberately incommensurate so the motion never resolves into a loop - risk
 * should feel unsteady, and no other object on the board moves like this.
 */
const WAGER_SPIN_RATE = 0.55;
const WAGER_WOBBLE_Z = { rate: 3.1, amplitude: 0.16 } as const;
const WAGER_WOBBLE_X = { rate: 2.3, phase: 1.1, amplitude: 0.13 } as const;
const WAGER_HOP = { rate: 2.6, height: 0.055 } as const;

// -----------------------------------------------------------------------------
// Geometry - module scope, never disposed
// -----------------------------------------------------------------------------

/**
 * The apple body. Radius 0.42 at two rounding segments is as close to a
 * sphere as this family gets while still chamfering like everything else on
 * the board - a real sphere would be the only smooth object in frame and
 * would read as imported from another game.
 */
const appleBodyGeometry = createExactUnitRoundedBoxGeometry(0.42, 2);
/** Stem, leaf and glint - small flat parts, so they round less. */
const chipGeometry = createExactUnitRoundedBoxGeometry(0.16);

/**
 * GOLDEN HOUR. Four radial segments keep the tube faceted, which is what
 * stops a torus reading as the one smooth-shaded import on the board. The
 * tube is deliberately fat: a thin ring vanishes at phone scale, and the
 * whole point of the shape is the HOLE.
 */
const goldRingGeometry = new THREE.TorusGeometry(CORE_SIZE * 0.92, 0.1, 4, 18);
goldRingGeometry.rotateX(Math.PI / 2);

/**
 * WAGER: a cube on its corner. Rotating the GEOMETRY, not the mesh, keeps the
 * idle wobble free to be its own motion.
 */
const wagerGeometry = new THREE.BoxGeometry(
  CORE_SIZE * 0.88,
  CORE_SIZE * 0.88,
  CORE_SIZE * 0.88
);
wagerGeometry.rotateX(Math.PI / 4);
wagerGeometry.rotateZ(Math.atan(Math.SQRT1_2));

// -----------------------------------------------------------------------------
// Materials
// -----------------------------------------------------------------------------

/** Variant palette. Both specials sit in colours the product already owns. */
const VARIANT_COLOR: Partial<Record<FoodVariant, string>> = {
  golden: '#f5c542', // AURUM
  wager: '#f54263', // UMBRA
};

/**
 * The leaf is the one part that never takes the dynasty accent. A cyan apple
 * is still an apple; a cyan LEAF is a shape with no meaning. One fixed fresh
 * green is the whole "this is produce" signal and it costs one material.
 */
const LEAF_GREEN = '#7fbd48';

// --- Per-color body material cache (bounded: 3 accents + 3 glyph colors) ---
const coreMaterialCache = new Map<string, THREE.MeshToonMaterial>();

// INK & AMBER: one hull for every food body.
const coreHullMaterial = createInkHullMaterial();
/** Fine parts get a fine line, or the ink swallows the leaf. */
const chipHullMaterial = createInkHullMaterial(0.022);

function getCoreMaterial(color: string): THREE.MeshToonMaterial {
  let material = coreMaterialCache.get(color);
  if (!material) {
    material = new THREE.MeshToonMaterial({
      color,
      emissive: color,
      emissiveIntensity: CORE_EMISSIVE,
      gradientMap: getToonGradientMap(),
    });
    coreMaterialCache.set(color, material);
  }
  return material;
}

/** Stem: ink, unlit, so it stays a drawn mark at any scale. */
const inkPartMaterial = new THREE.MeshBasicMaterial({
  color: INK,
  toneMapped: false,
});
/** The cartoon highlight. Unlit bone - it is a drawn glint, not a specular. */
const glintMaterial = new THREE.MeshBasicMaterial({
  color: '#fdf6ea',
  toneMapped: false,
});
const leafMaterial = new THREE.MeshToonMaterial({
  color: LEAF_GREEN,
  emissive: LEAF_GREEN,
  emissiveIntensity: 0.5,
  gradientMap: getToonGradientMap(),
});

// -----------------------------------------------------------------------------
// Parts
// -----------------------------------------------------------------------------

/** One outlined part. `ink="none"` for marks that ARE the ink. */
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
  ink?: 'core' | 'chip' | 'none';
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
          material={ink === 'core' ? coreHullMaterial : chipHullMaterial}
          renderOrder={-1}
        />
      )}
    </mesh>
  );
}

/**
 * THE APPLE - the ordinary food, on every board, in every dynasty.
 *
 * Cool + cute is a proportion problem, not a decoration problem: the body is
 * wider than it is tall, the stem is short and tilted (an upright stem reads
 * as a bomb fuse), and the leaf sits high and to one side so the silhouette is
 * asymmetric. The single bone pixel is the entire cartoon read - the same
 * pixel-glint vocabulary the snake's eyes use, so the food and the character
 * are drawn by one hand.
 */
function Apple({ material }: { material: THREE.Material }) {
  return (
    <group>
      <Part
        position={[0, 0, 0]}
        scale={[APPLE_WIDTH, APPLE_WIDTH * APPLE_SQUASH, APPLE_WIDTH]}
        material={material}
        geometry={appleBodyGeometry}
        ink="core"
      />
      {/* Stem: short, tilted, ink. */}
      <Part
        position={[0.02, APPLE_WIDTH * 0.5, 0]}
        scale={[0.055, 0.17, 0.055]}
        rotation={[0, 0, -0.3]}
        material={inkPartMaterial}
        ink="none"
      />
      {/* Leaf: one flat blade off the stem, tipped up and swept back. */}
      <Part
        position={[0.17, APPLE_WIDTH * 0.56, 0.02]}
        scale={[0.24, 0.045, 0.13]}
        rotation={[0, -0.35, 0.42]}
        material={leafMaterial}
      />
      {/* The glint. Upper-left of the body, flat on its face. */}
      <Part
        position={[-0.14, 0.11, APPLE_WIDTH * 0.44]}
        scale={[0.085, 0.085, 0.03]}
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
  color = '#22d3ee',
  visualScale = 1,
  variant = 'standard',
}: FoodBeaconProps) {
  const groupRef = useRef<THREE.Group>(null);
  const idleRef = useRef<THREE.Group>(null);
  const wagerRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Group>(null);
  // Spawn tracking: re-pop whenever the food moves to a new cell (the
  // component instance persists across spawns)
  const lastXRef = useRef(position[0]);
  const lastZRef = useRef(position[2]);
  const spawnAtRef = useRef<number | null>(null);

  const resolved = resolveVariant(variant);
  // A special's colour is its own; ordinary food takes the dynasty accent.
  const coreMaterial = getCoreMaterial(VARIANT_COLOR[resolved] ?? color);

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

    // Elastic spawn pop - bigger overshoot than the old beacon so a new
    // objective announces itself across the board
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
    // Idempotent time-based write - shared material, every instance agrees.
    coreMaterial.emissiveIntensity =
      CORE_EMISSIVE * (1 + Math.sin(time * 2.2) * 0.15);

    // GOLDEN HOUR: the spin is around the board's up axis and the tilt is
    // fixed, so the annulus is never edge-on - the hole is the shape, and a
    // hole you cannot see is not a shape.
    if (ringRef.current) {
      ringRef.current.rotation.y += delta * RING_SPIN_RATE;
      ringRef.current.position.y = Math.sin(time * RING_BOB_RATE) * RING_BOB_HEIGHT;
    }

    // WAGER: a die that never quite settles.
    if (wagerRef.current) {
      wagerRef.current.rotation.y += delta * WAGER_SPIN_RATE;
      wagerRef.current.rotation.z =
        Math.sin(time * WAGER_WOBBLE_Z.rate) * WAGER_WOBBLE_Z.amplitude;
      wagerRef.current.rotation.x =
        Math.sin(time * WAGER_WOBBLE_X.rate + WAGER_WOBBLE_X.phase) *
        WAGER_WOBBLE_X.amplitude;
      wagerRef.current.position.y =
        Math.abs(Math.sin(time * WAGER_HOP.rate)) * WAGER_HOP.height;
    }
  });

  let body: ReactElement | null = null;
  if (resolved === ORDINARY_FOOD) {
    body = (
      <group ref={idleRef}>
        <Apple material={coreMaterial} />
      </group>
    );
  } else if (resolved === 'golden') {
    body = (
      <group ref={ringRef} rotation={RING_TILT}>
        <mesh geometry={goldRingGeometry} material={coreMaterial} castShadow>
          <mesh
            geometry={goldRingGeometry}
            material={coreHullMaterial}
            renderOrder={-1}
          />
        </mesh>
      </group>
    );
  } else {
    body = (
      <mesh
        ref={wagerRef}
        geometry={wagerGeometry}
        material={coreMaterial}
        castShadow
      >
        <mesh
          geometry={wagerGeometry}
          material={coreHullMaterial}
          renderOrder={-1}
        />
      </mesh>
    );
  }

  return (
    <group ref={groupRef} position={[position[0], CENTER_Y, position[2]]}>
      {body}
    </group>
  );
}

export default FoodBeacon;
