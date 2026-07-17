'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import { themeManager } from '@/lib/theme/ThemeManager';

interface DynamicLightsProps {
  dynasty: DynastyId;
  score: number;
  isDeathSequence: boolean;
  /** Food position for spotlight targeting */
  foodPosition?: { x: number; z: number } | null;
  /** Grid size for positioning */
  gridSize?: number;
}

export function DynamicLights({
  dynasty,
  score,
  isDeathSequence,
  foodPosition,
  gridSize = 20,
}: DynamicLightsProps) {
  const pointLightRef = useRef<THREE.PointLight>(null);
  const foodSpotRef = useRef<THREE.SpotLight>(null);
  const theme = themeManager.getTheme(dynasty);
  const center = gridSize / 2;

  useFrame((state) => {
    if (!pointLightRef.current) return;

    if (isDeathSequence) {
      const flicker = Math.random() > 0.5 ? 1.2 : 0.3;
      pointLightRef.current.intensity = flicker;
      return;
    }

    const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.15 + 0.55;
    const scoreBoost = Math.min(score / 50, 1) * 0.3;
    pointLightRef.current.intensity = pulse + scoreBoost;

    // Update food spotlight target
    if (foodSpotRef.current && foodPosition) {
      foodSpotRef.current.target.position.set(
        foodPosition.x + 0.5,
        0,
        foodPosition.z + 0.5
      );
      foodSpotRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      {/* Main dynasty-colored point light */}
      <pointLight
        ref={pointLightRef}
        position={[center, 15, center]}
        intensity={0.5}
        color={theme.primary}
        distance={50}
        decay={2}
      />

      {/* Cool blue fill light */}
      <directionalLight
        position={[-8, 15, -8]}
        intensity={0.25}
        color="#6688ff"
      />

      {/* Rim light for snake silhouette pop */}
      <directionalLight
        position={[center + 15, 8, center + 15]}
        intensity={0.4}
        color="#ffffff"
      />

      {/* Overhead fill spot */}
      <spotLight
        position={[center, 25, center - 5]}
        angle={0.8}
        penumbra={0.8}
        intensity={0.3}
        color="#ffffff"
      />

      {/* Food spotlight - highlights the target */}
      {foodPosition && (
        <spotLight
          ref={foodSpotRef}
          position={[foodPosition.x + 0.5, 8, foodPosition.z + 0.5]}
          angle={0.4}
          penumbra={0.6}
          intensity={0.6}
          color={theme.accent}
          distance={15}
          decay={2}
        />
      )}

      {/* Corner accent lights - slightly raised to support the dynasty
          edge wash on the darker void-family floor */}
      <pointLight position={[0, 2, 0]} intensity={0.2} color={theme.primary} distance={8} />
      <pointLight position={[gridSize, 2, 0]} intensity={0.2} color={theme.primary} distance={8} />
      <pointLight position={[0, 2, gridSize]} intensity={0.2} color={theme.primary} distance={8} />
      <pointLight position={[gridSize, 2, gridSize]} intensity={0.2} color={theme.primary} distance={8} />
    </>
  );
}
