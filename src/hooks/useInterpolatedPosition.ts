'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Position } from '@/lib/game/SnakeGameLogic';
import { GAME_CONFIG } from '@/shared/config/game';

/**
 * Hook that returns a ref to a mesh that will be interpolated toward the target position.
 * The ref should be attached to the mesh you want to animate.
 */
export function useInterpolatedMesh(
  target: Position,
  duration: number = GAME_CONFIG.snake.interpolationDuration
) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetVec = useRef(new THREE.Vector3(target.x + 0.5, 0.5, target.z + 0.5));

  // Update target when it changes
  useEffect(() => {
    targetVec.current.set(target.x + 0.5, 0.5, target.z + 0.5);
  }, [target.x, target.z]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const lerpFactor = Math.min(1, delta * (1000 / duration) * 3);
    meshRef.current.position.lerp(targetVec.current, lerpFactor);
  });

  return meshRef;
}

/**
 * Simple version that just returns the grid position (no interpolation).
 * Use this as a fallback if interpolation causes issues.
 */
export function useGridPosition(target: Position): [number, number, number] {
  return [target.x + 0.5, 0.5, target.z + 0.5];
}
