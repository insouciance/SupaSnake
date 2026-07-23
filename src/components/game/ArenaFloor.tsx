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
    const yMajor = 0.02;

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
  // reads as lit rather than cut out. Generated once per accent color.
  const edgeWashTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const c = new THREE.Color(accentColor);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);

    const grad = ctx.createRadialGradient(
      size / 2, size / 2, size * 0.2,
      size / 2, size / 2, size * 0.71
    );
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},${0.1 * edgeWashStrength})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${0.35 * edgeWashStrength})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [accentColor, edgeWashStrength]);

  const cockpitSurface = surfacePreset === 'cockpit';

  useEffect(() => {
    return () => {
      edgeWashTexture?.dispose();
    };
  }, [edgeWashTexture]);

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
      {edgeWashTexture && (
        <mesh position={[center, 0.006, center]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[gridSize, gridSize]} />
          <meshBasicMaterial
            map={edgeWashTexture}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

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
