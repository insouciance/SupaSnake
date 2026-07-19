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
      // Death dimming: a smooth ~2.2Hz throb, deliberately NOT the old
      // per-frame random strobe (broadband 3-30Hz flashing violates the
      // photosensitivity budget). The drama comes from shake + particles.
      pointLightRef.current.intensity =
        0.45 + Math.sin(state.clock.elapsedTime * 14) * 0.25;
      return;
    }

    // Slow, shallow breathe (~0.32Hz, small amplitude) - the dynasty light
    // must never read as a strobe over the moving trunk
    const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.08 + 0.7;
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
      {/* Main dynasty-colored point light - pulses, brightens with score */}
      <pointLight
        ref={pointLightRef}
        position={[center, 15, center]}
        intensity={0.7}
        color={theme.primary}
        distance={50}
        decay={2}
      />

      {/* Rim light for snake silhouette pop */}
      <directionalLight
        position={[center + 15, 8, center + 15]}
        intensity={0.35}
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

      {/* The old blue fill, overhead spot, and 4 corner points are gone:
          their job moved to the hemisphere base rig (page.tsx), the
          stronger floor edge wash, and the border glow strips - premium
          contrast for 4 fewer per-fragment light evaluations. */}
    </>
  );
}
