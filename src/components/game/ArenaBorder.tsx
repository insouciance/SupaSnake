'use client';

/**
 * ArenaBorder - Glowing border rails around the arena
 * Creates elevated edge rails with emissive glow
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ArenaBorderProps {
  /** Grid size (default 20) */
  gridSize?: number;
  /** Border color */
  color?: string;
  /** Emissive intensity */
  emissiveIntensity?: number;
}

export function ArenaBorder({
  gridSize = 20,
  color = '#D98324',
  emissiveIntensity = 0.5,
}: ArenaBorderProps) {
  const railRef = useRef<THREE.Group>(null);

  // Subtle pulse animation
  useFrame(({ clock }) => {
    if (railRef.current) {
      const pulse = 0.4 + Math.sin(clock.getElapsedTime() * 2) * 0.15;
      railRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissiveIntensity = pulse;
        }
      });
    }
  });

  const railHeight = 0.15;
  const railWidth = 0.08;
  const y = railHeight / 2;

  return (
    <group ref={railRef}>
      {/* Bottom rail (Z = 0) */}
      <mesh position={[gridSize / 2, y, -railWidth / 2]}>
        <boxGeometry args={[gridSize + railWidth * 2, railHeight, railWidth]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Top rail (Z = gridSize) */}
      <mesh position={[gridSize / 2, y, gridSize + railWidth / 2]}>
        <boxGeometry args={[gridSize + railWidth * 2, railHeight, railWidth]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Left rail (X = 0) */}
      <mesh position={[-railWidth / 2, y, gridSize / 2]}>
        <boxGeometry args={[railWidth, railHeight, gridSize]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Right rail (X = gridSize) */}
      <mesh position={[gridSize + railWidth / 2, y, gridSize / 2]}>
        <boxGeometry args={[railWidth, railHeight, gridSize]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Corner pylons */}
      {[
        [0, 0],
        [gridSize, 0],
        [0, gridSize],
        [gridSize, gridSize],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, railHeight, z]}>
          <boxGeometry args={[0.2, railHeight * 2, 0.2]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={emissiveIntensity * 1.2}
            metalness={0.9}
            roughness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

export default ArenaBorder;
