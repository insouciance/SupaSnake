'use client';

/**
 * AimingCrosshair - Targeting crosshair lines for food
 * Creates perpendicular lines intersecting at food position
 * Dynasty-colored with subtle opacity for non-intrusive targeting
 */

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface AimingCrosshairProps {
  /** Food position [x, z] on the grid */
  foodPosition: { x: number; z: number } | null;
  /** Grid size (default 20) */
  gridSize?: number;
  /** Line color */
  color?: string;
  /** Line opacity */
  opacity?: number;
}

export function AimingCrosshair({
  foodPosition,
  gridSize = 20,
  color = '#D98324',
  opacity = 0.35,
}: AimingCrosshairProps) {
  const y = 0.05; // Slightly above floor
  const x = foodPosition?.x ?? 0;
  const z = foodPosition?.z ?? 0;

  // Horizontal line (along X axis at food's Z position)
  const horizontalPoints = useMemo(() => [
    new THREE.Vector3(0, y, z + 0.5),
    new THREE.Vector3(gridSize, y, z + 0.5),
  ], [z, gridSize, y]);

  // Vertical line (along Z axis at food's X position)
  const verticalPoints = useMemo(() => [
    new THREE.Vector3(x + 0.5, y, 0),
    new THREE.Vector3(x + 0.5, y, gridSize),
  ], [x, gridSize, y]);

  // Don't render if no food position
  if (!foodPosition) return null;

  return (
    <group>
      {/* Horizontal crosshair line */}
      <Line
        points={horizontalPoints}
        color={color}
        lineWidth={1.5}
        opacity={opacity}
        transparent
      />

      {/* Vertical crosshair line */}
      <Line
        points={verticalPoints}
        color={color}
        lineWidth={1.5}
        opacity={opacity}
        transparent
      />

      {/* Center target indicator - small diamond at intersection */}
      <mesh position={[x + 0.5, y + 0.01, z + 0.5]} rotation={[0, Math.PI / 4, 0]}>
        <ringGeometry args={[0.3, 0.4, 4]} />
        <meshBasicMaterial color={color} opacity={opacity * 1.5} transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default AimingCrosshair;
