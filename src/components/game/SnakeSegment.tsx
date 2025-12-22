'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import { themeManager } from '@/lib/theme/ThemeManager';

interface SnakeSegmentProps {
  position: THREE.Vector3 | [number, number, number];
  dynasty: DynastyId;
  isHead: boolean;
  segmentIndex: number;
  totalSegments: number;
}

export function SnakeSegment({
  position,
  dynasty,
  isHead,
  segmentIndex,
  totalSegments,
}: SnakeSegmentProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/assets/3D/snake_voxel.glb');
  const theme = themeManager.getTheme(dynasty);

  // Clone the scene for this segment
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  // Scale: head is larger, tail segments slightly smaller
  const scale = useMemo(() => {
    if (isHead) return 1.1;
    // Tail fade: last 3 segments get progressively smaller
    const tailIndex = totalSegments - segmentIndex - 1;
    if (tailIndex < 3) {
      return 0.85 + (tailIndex * 0.05); // 0.85, 0.90, 0.95
    }
    return 1.0;
  }, [isHead, segmentIndex, totalSegments]);

  // Emissive intensity: head glows more
  const emissiveIntensity = isHead ? 0.6 : 0.4;

  // Opacity for tail fade
  const opacity = useMemo(() => {
    const tailIndex = totalSegments - segmentIndex - 1;
    if (tailIndex < 2) {
      return 0.7 + (tailIndex * 0.15); // 0.7, 0.85
    }
    return 1.0;
  }, [segmentIndex, totalSegments]);

  // Apply dynasty material to all meshes in the model
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: theme.primary,
          emissive: theme.secondary,
          emissiveIntensity,
          metalness: 0.5,
          roughness: 0.3,
          transparent: opacity < 1,
          opacity,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [clonedScene, theme, emissiveIntensity, opacity]);

  // Subtle breathing animation for body segments
  useFrame((state) => {
    if (!groupRef.current || isHead) return;

    // Breathing scale pulse (offset by segment index for wave effect)
    const breatheOffset = segmentIndex * 0.3;
    const breathe = Math.sin(state.clock.elapsedTime * 2 + breatheOffset) * 0.02;
    groupRef.current.scale.setScalar(scale + breathe);
  });

  // Convert position to array if it's a Vector3
  const posArray: [number, number, number] = Array.isArray(position)
    ? position
    : [position.x, position.y, position.z];

  return (
    <group ref={groupRef} position={posArray} scale={scale}>
      <primitive object={clonedScene} />
    </group>
  );
}

// Fallback for when GLB fails to load
export function SnakeSegmentFallback({
  position,
  dynasty,
  isHead,
}: {
  position: [number, number, number];
  dynasty: DynastyId;
  isHead: boolean;
}) {
  const theme = themeManager.getTheme(dynasty);
  const size = isHead ? 0.9 : 0.85;
  const emissiveIntensity = isHead ? 0.6 : 0.4;

  return (
    <mesh position={position} castShadow>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial
        color={theme.primary}
        emissive={theme.secondary}
        emissiveIntensity={emissiveIntensity}
        metalness={0.5}
        roughness={0.3}
      />
    </mesh>
  );
}

// Preload the model
useGLTF.preload('/assets/3D/snake_voxel.glb');
