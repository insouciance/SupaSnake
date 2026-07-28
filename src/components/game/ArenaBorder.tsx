'use client';

/**
 * ArenaBorder - Glowing border rails around the arena
 *
 * Dynasty-colored rails (theme secondary) carry the pulsing emissive
 * identity; venom-orange is reserved for the corner pylons, echoing the
 * app shell's accent hierarchy. Rails share one material and pylons share
 * another, so the pulse costs two uniform updates per frame.
 *
 * COSMIC's torus (WP-3.13): the rails ARE the "these edges do not kill"
 * signal - dim, translucent, and PERMANENTLY so. The edge barely exists,
 * because on COSMIC it barely does.
 *
 * This replaced a four-state animation driven by the wall-phase cycle
 * (open / closing-telegraph / closed / opening-telegraph, in rose). The
 * cycle is gone, and its visual is gone with it: a rail that changes state
 * is a rail whose meaning has to be re-read, and the reason the wrap was
 * unlearnable was that its rule kept changing. One rail state, one rule.
 *
 * Outside COSMIC (torus false/undefined) the Phase 1 visuals are
 * byte-identical.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ArenaBorderProps {
  /** Grid size (default 20) */
  gridSize?: number;
  /** Rail color (dynasty secondary) */
  color?: string;
  /** Corner pylon accent color */
  accentColor?: string;
  /** Emissive intensity */
  emissiveIntensity?: number;
  /** True on a dynasty whose edges wrap instead of killing (COSMIC). */
  torus?: boolean;
  /** Physical rail dimensions; released values remain the default. */
  railHeight?: number;
  railWidth?: number;
  /** Scales the additive top strip without adding lights. */
  glowStrength?: number;
  /** Resting rail pulse values; released defaults preserve the current look. */
  restingEmissiveIntensity?: number;
  restingPulseAmplitude?: number;
  pylonEmissiveIntensity?: number;
}

export function ArenaBorder({
  gridSize = 20,
  color = '#22d3ee',
  accentColor = '#22d3ee',
  emissiveIntensity = 0.5,
  torus = false,
  railHeight = 0.15,
  railWidth = 0.08,
  glowStrength = 1,
  restingEmissiveIntensity = 0.4,
  restingPulseAmplitude = 0.15,
  pylonEmissiveIntensity = 0.55,
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
        // transparent so COSMIC's torus can thin the rails out; opacity
        // stays 1 on the dynasties whose walls kill
        transparent: true,
        opacity: 1,
      }),
    // emissiveIntensity is animated below; only color changes rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color]
  );

  // Precomputed color so the per-frame branch never allocates
  const baseRailColor = useMemo(() => new THREE.Color(color), [color]);

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

  // Additive glow strip along the rail tops - the premium replacement for
  // the deleted corner point lights: +4 draws, zero lights. Color/opacity
  // are driven from the rail's animated state each frame, so the torus
  // look carries through automatically.
  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    return () => {
      railMaterial.dispose();
      pylonMaterial.dispose();
      glowMaterial.dispose();
    };
  }, [railMaterial, pylonMaterial, glowMaterial]);

  // Subtle pulse animation - no allocations, a few material writes per
  // frame. The torus thins the rails out permanently (see header).
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    pylonMaterial.emissiveIntensity =
      pylonEmissiveIntensity + Math.sin(t * 2 + 0.8) * restingPulseAmplitude;

    railMaterial.color.copy(baseRailColor);
    railMaterial.emissive.copy(baseRailColor);
    if (torus) {
      // The edge barely exists, and never stops barely existing.
      railMaterial.opacity = 0.35;
      railMaterial.emissiveIntensity = 0.12 + Math.sin(t * 1.5) * 0.05;
    } else {
      railMaterial.opacity = 1;
      railMaterial.emissiveIntensity =
        restingEmissiveIntensity + Math.sin(t * 2) * restingPulseAmplitude;
    }
  });

  // Glow strip follows the rail's animated color/energy (after the branch
  // above so the torus look carries through) - two writes, no allocs
  useFrame(() => {
    glowMaterial.color.copy(railMaterial.emissive);
    glowMaterial.opacity =
      (0.18 + railMaterial.emissiveIntensity * 0.3) * railMaterial.opacity * glowStrength;
  });

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

      {/* Additive glow strips along the rail tops - the border's light
          halo (replaces the four corner point lights) */}
      <mesh position={[gridSize / 2, railHeight + 0.015, -railWidth / 2]} material={glowMaterial}>
        <boxGeometry args={[gridSize + railWidth * 2, 0.03, railWidth * 1.6]} />
      </mesh>
      <mesh position={[gridSize / 2, railHeight + 0.015, gridSize + railWidth / 2]} material={glowMaterial}>
        <boxGeometry args={[gridSize + railWidth * 2, 0.03, railWidth * 1.6]} />
      </mesh>
      <mesh position={[-railWidth / 2, railHeight + 0.015, gridSize / 2]} material={glowMaterial}>
        <boxGeometry args={[railWidth * 1.6, 0.03, gridSize]} />
      </mesh>
      <mesh position={[gridSize + railWidth / 2, railHeight + 0.015, gridSize / 2]} material={glowMaterial}>
        <boxGeometry args={[railWidth * 1.6, 0.03, gridSize]} />
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
