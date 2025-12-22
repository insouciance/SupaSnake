'use client';

/**
 * ArenaFloor - Floating command platform
 * Elevated metallic surface with grid lines and void beneath
 */

import { useMemo } from 'react';
import * as THREE from 'three';

interface ArenaFloorProps {
  /** Grid size (default 20) */
  gridSize?: number;
  /** Primary color for floor */
  floorColor?: string;
  /** Grid line color */
  gridColor?: string;
  /** Accent color for highlights */
  accentColor?: string;
}

export function ArenaFloor({
  gridSize = 20,
  floorColor = '#1a2128',
  gridColor = '#3a4750',
  accentColor = '#D98324',
}: ArenaFloorProps) {
  const center = gridSize / 2;

  // Create grid lines geometry
  const gridLines = useMemo(() => {
    const points: THREE.Vector3[] = [];

    // Vertical lines (along Z axis)
    for (let i = 0; i <= gridSize; i++) {
      points.push(new THREE.Vector3(i, 0.02, 0));
      points.push(new THREE.Vector3(i, 0.02, gridSize));
    }

    // Horizontal lines (along X axis)
    for (let i = 0; i <= gridSize; i++) {
      points.push(new THREE.Vector3(0, 0.02, i));
      points.push(new THREE.Vector3(gridSize, 0.02, i));
    }

    return points;
  }, [gridSize]);

  return (
    <group>
      {/* Dark void beneath platform */}
      <mesh position={[center, -0.8, center]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[gridSize + 4, gridSize + 4]} />
        <meshBasicMaterial color="#000000" opacity={0.9} transparent />
      </mesh>

      {/* Main platform surface */}
      <mesh position={[center, -0.05, center]} receiveShadow>
        <boxGeometry args={[gridSize, 0.1, gridSize]} />
        <meshStandardMaterial
          color={floorColor}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>

      {/* Grid lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={gridLines.length}
            array={new Float32Array(gridLines.flatMap(v => [v.x, v.y, v.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={gridColor} opacity={0.4} transparent />
      </lineSegments>

      {/* Accent grid lines (every 5 cells) */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={20}
            array={new Float32Array([
              // Vertical accent lines
              0, 0.025, 0, 0, 0.025, gridSize,
              5, 0.025, 0, 5, 0.025, gridSize,
              10, 0.025, 0, 10, 0.025, gridSize,
              15, 0.025, 0, 15, 0.025, gridSize,
              20, 0.025, 0, 20, 0.025, gridSize,
              // Horizontal accent lines
              0, 0.025, 0, gridSize, 0.025, 0,
              0, 0.025, 5, gridSize, 0.025, 5,
              0, 0.025, 10, gridSize, 0.025, 10,
              0, 0.025, 15, gridSize, 0.025, 15,
              0, 0.025, 20, gridSize, 0.025, 20,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={accentColor} opacity={0.25} transparent />
      </lineSegments>

      {/* Corner accent markers */}
      {[[0, 0], [gridSize, 0], [0, gridSize], [gridSize, gridSize]].map(([x, z], i) => (
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
