'use client';

/**
 * Snake 3D Model - GLB Voxel Model Loader
 * Uses the assets/3D/snake_voxel.glb model
 */

import { useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import { themeManager } from '@/lib/theme/ThemeManager';

interface SnakeModelProps {
  position: [number, number, number];
  dynasty: DynastyId;
  rotation?: [number, number, number];
  scale?: number;
  animate?: boolean;
}

export function SnakeModel({
  position,
  dynasty,
  rotation = [0, 0, 0],
  scale = 1,
  animate = true,
}: SnakeModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/assets/3D/snake_voxel.glb');

  const theme = themeManager.getTheme(dynasty);

  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: theme.primary,
            emissive: theme.secondary,
            emissiveIntensity: 0.3,
            metalness: 0.5,
            roughness: 0.3,
          });
        }
      });
    }
  }, [scene, theme]);

  useFrame((state) => {
    if (animate && groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 2) * 0.1;
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={scene.clone()} />
    </group>
  );
}

export function SnakeModelFallback({
  position,
  dynasty,
}: {
  position: [number, number, number];
  dynasty: DynastyId;
}) {
  const theme = themeManager.getTheme(dynasty);

  return (
    <mesh position={position}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial
        color={theme.primary}
        emissive={theme.secondary}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

useGLTF.preload('/assets/3D/snake_voxel.glb');
