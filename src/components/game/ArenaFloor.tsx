'use client';

/**
 * ArenaFloor - Void-born arena platform
 *
 * The floor grows out of the app's void backdrop instead of floating over it:
 * a lifted void-family clearcoat surface (#101722) with a dynasty-tinted
 * emissive wash at the edges, plus an e-sports major/minor grid (thin cell
 * lines, emphasis every 5 cells) for fast line reading.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface ArenaFloorProps {
  /** Grid size (default 20) */
  gridSize?: number;
  /** Primary color for floor (void family) */
  floorColor?: string;
  /** Minor grid line color */
  gridColor?: string;
  /** Major grid line color (every 5 cells) */
  majorGridColor?: string;
  /** Dynasty color for the emissive edge wash */
  accentColor?: string;
  /** Released material is the rollback default; cockpit is matte composite. */
  surfacePreset?: 'released' | 'cockpit';
  /** Multiplier for the generated edge-wash alpha. */
  edgeWashStrength?: number;
  /** Grid weights can be tuned without changing geometry. */
  minorGridOpacity?: number;
  majorGridOpacity?: number;
  /** The cockpit undertray owns orientation nodes, avoiding duplicate corners. */
  showCornerMarkers?: boolean;
}

/** Cells between major (emphasized) grid lines */
const MAJOR_EVERY = 5;

/**
 * The floor's top surface, and the clearance everything standing on it must
 * keep from that surface.
 *
 * The platform is a 0.1-tall slab centred at -0.05, so its top face is at
 * EXACTLY y = 0. Anything drawn base-on-floor at y = 0 therefore shares a plane
 * with it, at identical depth, over its whole footprint - and two coplanar
 * surfaces are z-fighting by definition. It renders as horizontal bands across
 * the bottom of every face that flicker as the object moves, which is what the
 * owner reported on the trail: "they are flickering and not all sides of the
 * cubes/segments are visible... when going vertically it is flickering."
 *
 * The direction-dependence is the tell. Moving along Z changes each face's
 * depth slope relative to the floor plane, so the fight resolves differently
 * frame to frame; moving along X leaves that slope constant, so it looks
 * stable. Same defect either way - only one of them shimmers.
 *
 * CLEARANCE, NOT BIAS. Lifting by a hair removes the tie outright rather than
 * asking the depth buffer to break it. The shared base below also clears the
 * raised major-grid plane; `polygonOffset` would only pick a winner and would
 * still be wrong on a different GPU.
 */
export const FLOOR_TOP_Y = 0;

/** The tallest decorative floor primitive is the major grid at y=0.02. */
export const FLOOR_GRAPHICS_TOP_Y = 0.02;

/**
 * Shared render base for anything that stands on the arena.
 *
 * This used to equal the major grid's y=0.02 plane. That removed the floor
 * z-fight while leaving the bottom face of every snake segment coplanar with
 * a major grid line. The defect therefore survived on the exact rows and
 * columns players use most for routing, especially on mobile depth buffers.
 * A further 0.02-cell separation is visually imperceptible but geometrically
 * decisive. This is rendering clearance only; logical cells and collisions
 * remain on y=0 in the engine.
 */
export const FLOOR_CLEARANCE = FLOOR_GRAPHICS_TOP_Y + 0.02;

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
    // Analytic distance keeps the wash smooth at every canvas size and DPR.
    // The previous 256px CanvasTexture was enlarged across the whole board,
    // exposing its raster grain/banding around this circular transition.
    float radius = length(vUv - vec2(0.5)) / 0.70710678;
    float edge = smoothstep(0.28, 1.0, radius);
    float alpha = edge * 0.70 * uStrength;
    gl_FragColor = vec4(uAccent, alpha);
  }
`;

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

export function ArenaFloor({
  gridSize = 20,
  floorColor = '#101722',
  gridColor = '#3b5266',
  majorGridColor = '#7fb2d9',
  accentColor = '#22d3ee',
  surfacePreset = 'released',
  edgeWashStrength = 1,
  minorGridOpacity = 0.35,
  majorGridOpacity = 0.5,
  showCornerMarkers = true,
}: ArenaFloorProps) {
  const center = gridSize / 2;

  // Minor + major grid line geometry, split so each set gets its own
  // weight/opacity (e-sports read: thin quiet cells, emphasis every 5).
  const { minorPositions, majorPositions } = useMemo(() => {
    const minor: number[] = [];
    const major: number[] = [];
    const yMinor = 0.015;
    const yMajor = FLOOR_GRAPHICS_TOP_Y;

    for (let i = 0; i <= gridSize; i++) {
      const isMajor = i % MAJOR_EVERY === 0;
      const target = isMajor ? major : minor;
      const y = isMajor ? yMajor : yMinor;
      // Line along Z at x = i
      target.push(i, y, 0, i, y, gridSize);
      // Line along X at z = i
      target.push(0, y, i, gridSize, y, i);
    }

    return {
      minorPositions: new Float32Array(minor),
      majorPositions: new Float32Array(major),
    };
  }, [gridSize]);

  // Dynasty-tinted emissive wash: transparent at center, faint glow toward
  // the edges, so the board participates in the dynasty theme and its edge
  // reads as lit rather than cut out. The gradient is analytic in the fragment
  // shader: there is no bitmap resolution to reveal when the viewport grows.
  const edgeWashMaterial = useMemo(
    () => createArenaEdgeWashMaterial(accentColor, edgeWashStrength),
    [accentColor, edgeWashStrength]
  );

  const cockpitSurface = surfacePreset === 'cockpit';

  useEffect(() => {
    return () => {
      edgeWashMaterial.dispose();
    };
  }, [edgeWashMaterial]);

  return (
    <group>
      {/* Main platform surface - lifted void-family tone with a clearcoat
          sheen so the key/hemisphere rig reads as premium lacquer instead
          of matte plastic */}
      <mesh position={[center, -0.05, center]} receiveShadow>
        <boxGeometry args={[gridSize, 0.1, gridSize]} />
        <meshPhysicalMaterial
          color={floorColor}
          metalness={cockpitSurface ? 0.22 : 0.35}
          roughness={cockpitSurface ? 0.78 : 0.6}
          clearcoat={cockpitSurface ? 0.12 : 0.3}
          clearcoatRoughness={cockpitSurface ? 0.72 : 0.4}
        />
      </mesh>

      {/* Dynasty edge wash - additive so it glows over the void surface */}
      <mesh
        position={[center, 0.006, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={edgeWashMaterial}
      >
        <planeGeometry args={[gridSize, gridSize]} />
      </mesh>

      {/* Minor grid lines - thin, quiet cell boundaries */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[minorPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={gridColor} opacity={minorGridOpacity} transparent />
      </lineSegments>

      {/* Major grid lines - every 5 cells, brighter for fast distance reads */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[majorPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={majorGridColor} opacity={majorGridOpacity} transparent />
      </lineSegments>

      {/* Corner accent markers - dynasty-tinted */}
      {showCornerMarkers && [[0, 0], [gridSize, 0], [0, gridSize], [gridSize, gridSize]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]}>
          <boxGeometry args={[0.3, 0.02, 0.3]} />
          <meshStandardMaterial
            color={accentColor}
            emissive={accentColor}
            emissiveIntensity={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

export default ArenaFloor;
