'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import { COSMIC_CONSTELLATION } from '@/shared/game/rulesets';
import { MUTATION_PHYSICS } from '@/shared/game/mutations';
import { getGameMaterialProfile } from './screen/gameMaterialProfiles';

interface DynamicLightsProps {
  dynasty: DynastyId;
  score: number;
  isDeathSequence: boolean;
  /**
   * Every food on the board, for spotlight targeting.
   *
   * This took an array in WP-3.06 because it used to take one position and got
   * handed `foods[0]`. COSMIC has always placed a constellation GROUP of three
   * — its combo mechanic is collecting them in sequence — so two thirds of a
   * COSMIC wave was unlit, and the dynasty whose identity is the group was the
   * one dynasty that could not see it.
   */
  foodPositions?: readonly { x: number; z: number }[];
  /** Grid size for positioning */
  gridSize?: number;
  /** Cockpit-v1 can calm dynasty spill while preserving released defaults. */
  intensityScale?: number;
}

/**
 * Spotlights are per-fragment work, so the wave is capped rather than trusted.
 * The largest wave the game can produce is COSMIC's base five, plus Splitter,
 * plus Starweaver — seven. Derive the moving parts so a constellation retune
 * cannot leave two legal objectives dark again.
 */
const MAX_FOOD_SPOTLIGHTS =
  COSMIC_CONSTELLATION.size + MUTATION_PHYSICS.starweaverExtraGroupFood + 1;

export function DynamicLights({
  dynasty,
  score,
  isDeathSequence,
  foodPositions,
  gridSize = 20,
  intensityScale = 1,
}: DynamicLightsProps) {
  const pointLightRef = useRef<THREE.PointLight>(null);
  const foodSpotRefs = useRef<(THREE.SpotLight | null)[]>([]);
  const lighting = getGameMaterialProfile(dynasty).lighting;
  const center = gridSize / 2;
  const lit = (foodPositions ?? []).slice(0, MAX_FOOD_SPOTLIGHTS);

  useFrame((state) => {
    if (!pointLightRef.current) return;

    if (isDeathSequence) {
      // Death dimming: a smooth ~2.2Hz throb, deliberately NOT the old
      // per-frame random strobe (broadband 3-30Hz flashing violates the
      // photosensitivity budget). The drama comes from shake + particles.
      pointLightRef.current.intensity =
        (0.45 + Math.sin(state.clock.elapsedTime * 14) * 0.25) * intensityScale;
      return;
    }

    // Slow, shallow breathe (~0.32Hz, small amplitude) - the dynasty light
    // must never read as a strobe over the moving trunk
    const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.08 + 0.7;
    const scoreBoost = Math.min(score / 50, 1) * 0.3;
    pointLightRef.current.intensity = (pulse + scoreBoost) * intensityScale;

    // Aim each spotlight at its own food. A spotlight points at its target
    // object, not at its own position, so this has to run per food or the
    // extra lights hang in the air aiming at the origin.
    for (let i = 0; i < lit.length; i++) {
      const spot = foodSpotRefs.current[i];
      if (!spot) continue;
      spot.target.position.set(lit[i].x + 0.5, 0, lit[i].z + 0.5);
      spot.target.updateMatrixWorld();
    }
  });

  return (
    <>
      {/* Main dynasty-colored point light - pulses, brightens with score */}
      <pointLight
        ref={pointLightRef}
        position={[center, 15, center]}
        intensity={0.7}
        color={lighting.keyColor}
        distance={50}
        decay={2}
      />

      {/* Rim light for snake silhouette pop */}
      <directionalLight
        position={[center + 15, 8, center + 15]}
        intensity={0.35 * Math.max(0.7, intensityScale)}
        color="#ffffff"
      />

      {/* One spotlight per food - every target on the board is lit */}
      {lit.map((position, index) => (
        <spotLight
          key={`${position.x},${position.z}`}
          ref={(node) => {
            foodSpotRefs.current[index] = node;
          }}
          position={[position.x + 0.5, 8, position.z + 0.5]}
          angle={0.4}
          penumbra={0.6}
          intensity={0.6 * intensityScale}
          color={lighting.objectiveColor}
          distance={15}
          decay={2}
        />
      ))}

      {/* The old blue fill, overhead spot, and 4 corner points are gone:
          their job moved to the hemisphere base rig (page.tsx), the
          stronger floor edge wash, and the border glow strips - premium
          contrast for 4 fewer per-fragment light evaluations. */}
    </>
  );
}
