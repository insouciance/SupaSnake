'use client';

/**
 * FoodBeacon - Enhanced food with rotating ring and light beam
 * High-value objective visual treatment
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FoodBeaconProps {
  /** Food position */
  position: [number, number, number];
  /** Primary color */
  color?: string;
  /** Spawn time for animation */
  spawnTime?: number;
}

export function FoodBeacon({
  position,
  color = '#D98324',
  spawnTime = 0,
}: FoodBeaconProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const pulseRingRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const age = time - spawnTime;

    // Spawn animation (elastic scale-up)
    const spawnDuration = 0.3;
    let spawnScale = 1;
    if (age < spawnDuration) {
      const t = age / spawnDuration;
      spawnScale = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2);
    }

    if (groupRef.current) {
      groupRef.current.scale.setScalar(spawnScale);
    }

    // Rotating ring
    if (ringRef.current) {
      ringRef.current.rotation.y = time * 2;
      ringRef.current.rotation.x = Math.sin(time) * 0.2;
    }

    // Pulsing sphere
    if (sphereRef.current) {
      const pulse = 0.9 + Math.sin(time * 4) * 0.1;
      sphereRef.current.scale.setScalar(pulse);
      sphereRef.current.position.y = 0.5 + Math.sin(time * 3) * 0.1;

      const material = sphereRef.current.material as THREE.MeshStandardMaterial;
      if (material) {
        material.emissiveIntensity = 0.6 + Math.sin(time * 5) * 0.3;
      }
    }

    // Beam opacity pulse
    if (beamRef.current) {
      const material = beamRef.current.material as THREE.MeshBasicMaterial;
      if (material) {
        material.opacity = 0.08 + Math.sin(time * 3) * 0.04;
      }
    }

    // Expanding pulse ring
    if (pulseRingRef.current) {
      const pulsePhase = (time * 0.8) % 1;
      const scale = 0.5 + pulsePhase * 1.5;
      pulseRingRef.current.scale.set(scale, scale, 1);
      const material = pulseRingRef.current.material as THREE.MeshBasicMaterial;
      if (material) {
        material.opacity = (1 - pulsePhase) * 0.3;
      }
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Main food sphere */}
      <mesh ref={sphereRef} position={[0, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Rotating ring */}
      <mesh ref={ringRef} position={[0, 0.5, 0]}>
        <torusGeometry args={[0.7, 0.04, 8, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>

      {/* Vertical light beam */}
      <mesh ref={beamRef} position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.15, 0.3, 3, 8]} />
        <meshBasicMaterial color={color} opacity={0.1} transparent />
      </mesh>

      {/* Ground pulse ring - lifted above the grid lines (major lines sit
          at y=0.02) to avoid z-fighting */}
      <mesh ref={pulseRingRef} position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.6, 32]} />
        <meshBasicMaterial color={color} opacity={0.3} transparent side={THREE.DoubleSide} />
      </mesh>

      {/* Static ground indicator */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.35, 32]} />
        <meshBasicMaterial color={color} opacity={0.5} transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default FoodBeacon;
