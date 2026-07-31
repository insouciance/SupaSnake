'use client';

/**
 * ExitPortal - the extraction beam. Categorical redesign: no box, no
 * pickup-shaped anything. The portal is a place you ENTER - a floor
 * aperture with a vertical column of light:
 *
 * - flat aperture ring (6 shutter blades, slow spin)
 * - 3 counter-rotating outer arc ticks (desktop)
 * - vertical light beam: open cylinder, vertex-color fade to black under
 *   additive blending (no shader) - blooms to white at the base
 * - ground decal glow (desktop)
 * - faint inner disc (the beam's floor)
 *
 * Color: #f8f5d0 pale champagne-white. Deliberately OUTSIDE every dynasty
 * accent family (escapes CYBER cyan and COSMIC gold by saturation/value),
 * reading as the universal "extraction beam" grammar - unmistakable from
 * food at first sight.
 *
 * Urgency (window closing): ring spin-up 0.6 -> 3.0 rad/s, beat-pattern
 * beam flicker, color lerp to white (precomputed Colors - the ArenaBorder
 * pattern, no per-frame allocation).
 *
 * First-run FTUE: a floating "EXTRACT" sprite over the beam, once per page
 * lifecycle via OverlayHint's memory-only claim, fading out over 6 seconds.
 *
 * Cost: 5 draws desktop, 3 mobile (isMobile drops decal + arcs). All
 * geometries, the decal/sprite textures, and materials are module-scope
 * singletons (portal color is fixed); per-frame work is rotation/opacity/
 * color writes only. Zero allocations, no React state in the loop.
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { claimHint } from '@/components/ftue/OverlayHint';

interface ExitPortalProps {
  /** Portal position (cell-centered x/z, y ignored) */
  position: [number, number, number];
  /** Ticks until the portal despawns (drives the urgency state) */
  ticksRemaining: number;
  /** Mobile perf lever: drops the ground decal + arc ticks (5 -> 3 draws) */
  isMobile?: boolean;
  /** Keep the released first-portal lesson by default; visual fixtures may disable it. */
  showExtractHint?: boolean;
  /** Visual-only scale; released default remains 1. */
  visualScale?: number;
}

/** Portal identity color - pale champagne-white ("extraction beam"). */
const PORTAL_COLOR = '#f8f5d0';
/** Below this many ticks the urgency ramp engages. */
const URGENT_TICKS = 30;
/** Ring spin speed (rad/s): calm -> full urgency. */
const SPIN_CALM = 0.6;
const SPIN_URGENT = 3.0;
/** Beam column dimensions. */
const BEAM_RADIUS = 0.32;
const BEAM_HEIGHT = 2.6;
/** EXTRACT hint id (device-scoped FTUE state ONLY - never game progress). */
const EXTRACT_HINT_ID = 'portal-extract';
const EXTRACT_HINT_SECONDS = 6;

// -----------------------------------------------------------------------------
// Module-scope geometry (portal color and shape are fixed - one set ever)
// -----------------------------------------------------------------------------

/** Merge `count` flat ring arcs (with gaps) into ONE geometry = one draw.
 *  MeshBasicMaterial needs positions only. */
function buildArcRing(
  inner: number,
  outer: number,
  count: number,
  arcFraction: number,
  segments = 12
): THREE.BufferGeometry {
  const arcs: THREE.RingGeometry[] = [];
  const theta = (Math.PI * 2) / count;
  for (let i = 0; i < count; i++) {
    arcs.push(
      new THREE.RingGeometry(inner, outer, segments, 1, i * theta, theta * arcFraction)
    );
  }
  let vertexCount = 0;
  let indexCount = 0;
  for (const arc of arcs) {
    vertexCount += arc.attributes.position.count;
    indexCount += arc.index!.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const arc of arcs) {
    positions.set(arc.attributes.position.array as Float32Array, vertexOffset * 3);
    const arcIndex = arc.index!.array;
    for (let k = 0; k < arcIndex.length; k++) {
      indices[indexOffset + k] = arcIndex[k] + vertexOffset;
    }
    vertexOffset += arc.attributes.position.count;
    indexOffset += arc.index!.count;
    arc.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/** Aperture: 6 shutter blades - the spin is legible because of the gaps. */
const apertureGeometry = buildArcRing(0.28, 0.42, 6, 0.72);
/** Outer arc ticks: 3 thin counter-rotating arcs. */
const arcTicksGeometry = buildArcRing(0.48, 0.52, 3, 0.55);
/** Inner disc - the beam's floor. */
const innerDiscGeometry = new THREE.CircleGeometry(0.3, 32);

/** Beam: open cylinder with a baked grayscale vertex-color fade (bright at
 *  the floor, black at the top). material.color tints it champagne, so the
 *  urgency white-lerp needs only a color write. */
const beamGeometry = (() => {
  const geometry = new THREE.CylinderGeometry(
    BEAM_RADIUS,
    BEAM_RADIUS,
    BEAM_HEIGHT,
    24,
    8,
    true
  );
  const positionAttr = geometry.attributes.position;
  const colors = new Float32Array(positionAttr.count * 3);
  for (let i = 0; i < positionAttr.count; i++) {
    const t = (positionAttr.getY(i) + BEAM_HEIGHT / 2) / BEAM_HEIGHT; // 0 floor, 1 top
    const v = Math.pow(1 - t, 1.7); // fade to black toward the top
    colors[i * 3] = v;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = v;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
})();

const decalGeometry = new THREE.PlaneGeometry(1.9, 1.9);

// --- Module-scope materials (shared by every portal incl. Twin Exits;
//     urgency writes are time/ticks-based and idempotent across portals
//     because twins share the same despawn window) ---

const apertureMaterial = new THREE.MeshBasicMaterial({
  color: PORTAL_COLOR,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const arcTicksMaterial = new THREE.MeshBasicMaterial({
  color: PORTAL_COLOR,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const innerDiscMaterial = new THREE.MeshBasicMaterial({
  color: PORTAL_COLOR,
  transparent: true,
  opacity: 0.28,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const beamMaterial = new THREE.MeshBasicMaterial({
  color: PORTAL_COLOR,
  vertexColors: true,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** Ground decal: radial champagne glow, generated once per session. */
let decalMaterialSingleton: THREE.MeshBasicMaterial | null = null;
function getDecalMaterial(): THREE.MeshBasicMaterial | null {
  if (decalMaterialSingleton) return decalMaterialSingleton;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.05,
    size / 2, size / 2, size * 0.5
  );
  grad.addColorStop(0, 'rgba(248,245,208,0.55)');
  grad.addColorStop(0.45, 'rgba(248,245,208,0.18)');
  grad.addColorStop(1, 'rgba(248,245,208,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  decalMaterialSingleton = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return decalMaterialSingleton;
}

/** "EXTRACT" label texture + sprite material, generated once per session. */
let extractMaterialSingleton: THREE.SpriteMaterial | null = null;
function getExtractMaterial(): THREE.SpriteMaterial | null {
  if (extractMaterialSingleton) return extractMaterialSingleton;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = '700 34px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(248,245,208,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#f8f5d0';
  ctx.fillText('E X T R A C T', 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  extractMaterialSingleton = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  return extractMaterialSingleton;
}

// Precomputed urgency colors - the ArenaBorder no-allocation lerp pattern
const baseColor = new THREE.Color(PORTAL_COLOR);
const whiteColor = new THREE.Color('#ffffff');
const scratchColor = new THREE.Color();

export function ExitPortal({
  position,
  ticksRemaining,
  isMobile = false,
  showExtractHint = true,
  visualScale = 1,
}: ExitPortalProps) {
  const groupRef = useRef<THREE.Group>(null);
  const apertureRef = useRef<THREE.Mesh>(null);
  const arcTicksRef = useRef<THREE.Mesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const spawnTimeRef = useRef<number | null>(null);
  const hintShownAtRef = useRef<number | null>(null);

  // First-time EXTRACT hint: claim the page-lifecycle slot at mount (the
  // claim is immediate so a Twin Exits pair never shows it twice)
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (!showExtractHint) return;
    if (claimHint(EXTRACT_HINT_ID)) setShowHint(true);
  }, [showExtractHint]);

  const decalMaterial = !isMobile ? getDecalMaterial() : null;
  const extractMaterial = showHint ? getExtractMaterial() : null;

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();
    if (spawnTimeRef.current === null) {
      spawnTimeRef.current = time;
    }
    const age = time - spawnTimeRef.current;

    // Spawn pop (elastic scale-in, matching the food's announcement)
    const spawnDuration = 0.35;
    let spawnScale = 1;
    if (age >= 0 && age < spawnDuration) {
      const t = age / spawnDuration;
      spawnScale = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2);
    }
    if (groupRef.current) {
      groupRef.current.scale.setScalar(spawnScale * visualScale);
    }

    // Urgency ramp: 0 while calm, rises to 1 as the window closes
    const urgency =
      ticksRemaining > 0 && ticksRemaining < URGENT_TICKS
        ? 1 - ticksRemaining / URGENT_TICKS
        : 0;

    // Aperture spin-up + counter-rotating arc ticks
    const spin = SPIN_CALM + (SPIN_URGENT - SPIN_CALM) * urgency;
    if (apertureRef.current) {
      apertureRef.current.rotation.z += spin * delta;
    }
    if (arcTicksRef.current) {
      arcTicksRef.current.rotation.z -= spin * 0.6 * delta;
    }

    // Color lerp toward white as urgency rises (precomputed colors)
    scratchColor.copy(baseColor).lerp(whiteColor, urgency);
    apertureMaterial.color.copy(scratchColor);
    beamMaterial.color.copy(scratchColor);
    arcTicksMaterial.color.copy(scratchColor);

    // Beam breathe -> urgency throb. Photosensitivity budget: |sin|^3
    // throbs at rad/PI Hz, so 5..7.5 rad/s stays 1.6-2.4Hz - always below
    // the 3-30Hz WCAG flash band. Urgency is carried by the spin-up, the
    // white color shift, and a deeper (never faster than 2.4Hz) throb.
    if (urgency > 0) {
      const throbRad = 5 + urgency * 2.5;
      const throb = Math.pow(Math.abs(Math.sin(time * throbRad)), 3);
      beamMaterial.opacity = 0.35 + throb * (0.4 + urgency * 0.25);
      apertureMaterial.opacity = 0.75 + throb * 0.25;
    } else {
      beamMaterial.opacity = 0.5 + Math.sin(time * 2.4) * 0.1;
      apertureMaterial.opacity = 0.88 + Math.sin(time * 2.4) * 0.08;
    }

    // EXTRACT hint: rise, hold, fade over EXTRACT_HINT_SECONDS - then gone
    const sprite = spriteRef.current;
    if (sprite) {
      if (hintShownAtRef.current === null) {
        hintShownAtRef.current = time;
      }
      const hintAge = time - hintShownAtRef.current;
      if (hintAge >= EXTRACT_HINT_SECONDS) {
        sprite.visible = false;
      } else {
        const fadeIn = Math.min(1, hintAge / 0.6);
        const fadeOut = Math.min(1, (EXTRACT_HINT_SECONDS - hintAge) / 1.5);
        (sprite.material as THREE.SpriteMaterial).opacity =
          Math.min(fadeIn, fadeOut) * 0.95;
        sprite.position.y = BEAM_HEIGHT + 0.25 + Math.sin(time * 1.2) * 0.08;
      }
    }
  });

  return (
    <group ref={groupRef} position={[position[0], 0, position[2]]}>
      {/* Aperture ring - 6 shutter blades, slow spin (urgency spin-up) */}
      <mesh
        ref={apertureRef}
        geometry={apertureGeometry}
        material={apertureMaterial}
        position={[0, 0.045, 0]}
        rotation-x={-Math.PI / 2}
      />

      {/* Counter-rotating outer arc ticks (desktop only) */}
      {!isMobile && (
        <mesh
          ref={arcTicksRef}
          geometry={arcTicksGeometry}
          material={arcTicksMaterial}
          position={[0, 0.04, 0]}
          rotation-x={-Math.PI / 2}
        />
      )}

      {/* Faint inner disc - the beam's floor */}
      <mesh
        geometry={innerDiscGeometry}
        material={innerDiscMaterial}
        position={[0, 0.03, 0]}
        rotation-x={-Math.PI / 2}
      />

      {/* The vertical extraction beam - vertex-color fade to black under
          additive blending (dissolves into the sky, no shader) */}
      <mesh
        geometry={beamGeometry}
        material={beamMaterial}
        position={[0, BEAM_HEIGHT / 2, 0]}
      />

      {/* Ground decal glow (desktop only) */}
      {decalMaterial && (
        <mesh
          geometry={decalGeometry}
          material={decalMaterial}
          position={[0, 0.015, 0]}
          rotation-x={-Math.PI / 2}
        />
      )}

      {/* One-time EXTRACT label floating over the beam */}
      {extractMaterial && (
        <sprite
          ref={spriteRef}
          material={extractMaterial}
          position={[0, BEAM_HEIGHT + 0.25, 0]}
          scale={[1.7, 0.42, 1]}
        />
      )}
    </group>
  );
}

export default ExitPortal;
