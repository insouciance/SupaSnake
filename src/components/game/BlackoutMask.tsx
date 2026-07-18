'use client';

/**
 * Blackout anomaly visibility mask (Design v2 §7.2): a render-layer
 * effect - the world fades to void beyond ~6 cells of the snake's head.
 * Deliberately NOT engine logic: Blackout is a [P] anomaly that changes
 * what the player can SEE, never the payout math.
 *
 * Implementation: one large horizontal plane hovering above the board
 * with a radial-alpha fragment shader (transparent inside the visibility
 * radius, void-opaque beyond a short falloff). The head position rides a
 * uniform updated in useFrame - zero per-frame allocations.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ANOMALY_PHYSICS } from '@/shared/game/anomalies';
import type { Position } from '@/lib/game/SnakeGameLogic';

interface BlackoutMaskProps {
  /** Snake head cell (grid coordinates), or null before the run starts. */
  headPosition: Position | null;
  gridSize: number;
}

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uHead;
  uniform float uRadius;
  uniform float uFalloff;
  uniform vec3 uColor;
  varying vec3 vWorldPos;
  void main() {
    float dist = distance(vWorldPos.xz, uHead.xz);
    float alpha = smoothstep(uRadius, uRadius + uFalloff, dist);
    gl_FragColor = vec4(uColor, alpha * 0.96);
  }
`;

export function BlackoutMask({ headPosition, gridSize }: BlackoutMaskProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uHead: { value: new THREE.Vector3(gridSize / 2, 0, gridSize / 2) },
      uRadius: { value: ANOMALY_PHYSICS.blackoutVisibilityRadius },
      uFalloff: { value: 2.5 },
      uColor: { value: new THREE.Color('#06090d') }, // page void family
    }),
    [gridSize]
  );

  useFrame(() => {
    if (!headPosition || !materialRef.current) return;
    // Mutate the existing vector - no allocations in the frame loop
    materialRef.current.uniforms.uHead.value.set(
      headPosition.x + 0.5,
      0,
      headPosition.z + 0.5
    );
  });

  return (
    <mesh
      position={[gridSize / 2, 2.6, gridSize / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={999}
    >
      {/* Oversized so board edges + fog seams stay covered at any camera angle */}
      <planeGeometry args={[gridSize * 3, gridSize * 3]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default BlackoutMask;
