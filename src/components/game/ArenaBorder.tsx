'use client';

/**
 * ArenaBorder - Glowing border rails around the arena
 *
 * Dynasty-colored rails (theme secondary) carry the pulsing emissive
 * identity; venom-orange is reserved for the corner pylons, echoing the
 * app shell's accent hierarchy. Rails share one material and pylons share
 * another, so the pulse costs two uniform updates per frame.
 *
 * COSMIC Flux (Design v2 section 3.3): the rails ARE the wall-phase
 * signal. Open phase = dimmed, translucent rails (the edge barely exists -
 * you can wrap through it); telegraph before closing = fast rose pulse;
 * closed = solid bright rose (the wall is real and lethal); telegraph
 * before opening = the rose pulses back down toward the dim rail color.
 * Outside COSMIC (fluxPhase null/undefined) the Phase 1 visuals are
 * byte-identical.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Flux rail colors: rose = lethal wall family (outside dynasty accents). */
const FLUX_CLOSED_COLOR = '#f43f5e';

interface ArenaBorderProps {
  /** Grid size (default 20) */
  gridSize?: number;
  /** Rail color (dynasty secondary) */
  color?: string;
  /** Corner pylon accent color */
  accentColor?: string;
  /** Emissive intensity */
  emissiveIntensity?: number;
  /** COSMIC wrap-phase state; null/undefined outside COSMIC */
  fluxPhase?: 'open' | 'closed' | null;
  /** True during the ~2s warning window before a phase flip */
  fluxTelegraph?: boolean;
}

export function ArenaBorder({
  gridSize = 20,
  color = '#22d3ee',
  accentColor = '#22d3ee',
  emissiveIntensity = 0.5,
  fluxPhase = null,
  fluxTelegraph = false,
}: ArenaBorderProps) {
  // One shared material per role - the pulse mutates two materials per
  // frame instead of walking every child mesh.
  const railMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity,
        metalness: 0.55,
        roughness: 0.35,
        // transparent so the COSMIC open phase can thin the rails out;
        // opacity stays 1 outside flux
        transparent: true,
        opacity: 1,
      }),
    // emissiveIntensity is animated below; only color changes rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color]
  );

  // Precomputed colors so the per-frame flux branch never allocates
  const baseRailColor = useMemo(() => new THREE.Color(color), [color]);
  const fluxClosedColor = useMemo(() => new THREE.Color(FLUX_CLOSED_COLOR), []);

  const pylonMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: emissiveIntensity * 1.2,
        metalness: 0.7,
        roughness: 0.25,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor]
  );

  useEffect(() => {
    return () => {
      railMaterial.dispose();
      pylonMaterial.dispose();
    };
  }, [railMaterial, pylonMaterial]);

  // Subtle pulse animation - no allocations, a few material writes per
  // frame. COSMIC flux overrides the rail look per phase (see header).
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    pylonMaterial.emissiveIntensity = 0.55 + Math.sin(t * 2 + 0.8) * 0.18;

    if (!fluxPhase) {
      railMaterial.color.copy(baseRailColor);
      railMaterial.emissive.copy(baseRailColor);
      railMaterial.opacity = 1;
      railMaterial.emissiveIntensity = 0.4 + Math.sin(t * 2) * 0.15;
      return;
    }

    if (fluxPhase === 'open' && !fluxTelegraph) {
      // Open: the wall barely exists - dim, translucent rails
      railMaterial.color.copy(baseRailColor);
      railMaterial.emissive.copy(baseRailColor);
      railMaterial.opacity = 0.35;
      railMaterial.emissiveIntensity = 0.12 + Math.sin(t * 1.5) * 0.05;
    } else if (fluxPhase === 'open' && fluxTelegraph) {
      // Closing soon: fast rose pulse - get away from the edges
      railMaterial.color.copy(fluxClosedColor);
      railMaterial.emissive.copy(fluxClosedColor);
      const pulse = 0.5 + Math.sin(t * 10) * 0.5;
      railMaterial.opacity = 0.4 + pulse * 0.5;
      railMaterial.emissiveIntensity = 0.3 + pulse * 0.7;
    } else if (fluxPhase === 'closed' && !fluxTelegraph) {
      // Closed: solid lethal wall
      railMaterial.color.copy(fluxClosedColor);
      railMaterial.emissive.copy(fluxClosedColor);
      railMaterial.opacity = 1;
      railMaterial.emissiveIntensity = 0.75 + Math.sin(t * 2.5) * 0.1;
    } else {
      // Opening soon: the rose pulses back down toward the dim rail state
      railMaterial.color.copy(fluxClosedColor);
      railMaterial.emissive.copy(fluxClosedColor);
      const pulse = 0.5 + Math.sin(t * 6) * 0.5;
      railMaterial.opacity = 1 - pulse * 0.55;
      railMaterial.emissiveIntensity = 0.25 + pulse * 0.4;
    }
  });

  const railHeight = 0.15;
  const railWidth = 0.08;
  const y = railHeight / 2;

  return (
    <group>
      {/* Bottom rail (Z = 0) */}
      <mesh position={[gridSize / 2, y, -railWidth / 2]} material={railMaterial}>
        <boxGeometry args={[gridSize + railWidth * 2, railHeight, railWidth]} />
      </mesh>

      {/* Top rail (Z = gridSize) */}
      <mesh position={[gridSize / 2, y, gridSize + railWidth / 2]} material={railMaterial}>
        <boxGeometry args={[gridSize + railWidth * 2, railHeight, railWidth]} />
      </mesh>

      {/* Left rail (X = 0) */}
      <mesh position={[-railWidth / 2, y, gridSize / 2]} material={railMaterial}>
        <boxGeometry args={[railWidth, railHeight, gridSize]} />
      </mesh>

      {/* Right rail (X = gridSize) */}
      <mesh position={[gridSize + railWidth / 2, y, gridSize / 2]} material={railMaterial}>
        <boxGeometry args={[railWidth, railHeight, gridSize]} />
      </mesh>

      {/* Corner pylons - venom-orange accents */}
      {[
        [0, 0],
        [gridSize, 0],
        [0, gridSize],
        [gridSize, gridSize],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, railHeight, z]} material={pylonMaterial}>
          <boxGeometry args={[0.2, railHeight * 2, 0.2]} />
        </mesh>
      ))}
    </group>
  );
}

export default ArenaBorder;
