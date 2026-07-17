'use client';

/**
 * ArenaBorder - Glowing border rails around the arena
 *
 * Dynasty-colored rails (theme secondary) carry the pulsing emissive
 * identity; venom-orange is reserved for the corner pylons, echoing the
 * app shell's accent hierarchy. Rails share one material and pylons share
 * another, so the pulse costs two uniform updates per frame.
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
}

export function ArenaBorder({
  gridSize = 20,
  color = '#22d3ee',
  accentColor = '#22d3ee',
  emissiveIntensity = 0.5,
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
      }),
    // emissiveIntensity is animated below; only color changes rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color]
  );

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

  // Subtle pulse animation - no allocations, two material writes per frame
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    railMaterial.emissiveIntensity = 0.4 + Math.sin(t * 2) * 0.15;
    pylonMaterial.emissiveIntensity = 0.55 + Math.sin(t * 2 + 0.8) * 0.18;
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
