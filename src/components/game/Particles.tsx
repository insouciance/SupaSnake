'use client';

/**
 * Particle Effects - Visual juice on food collection
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import { themeManager } from '@/lib/theme/ThemeManager';

interface ParticleSystemProps {
  position: [number, number, number];
  dynasty: DynastyId;
  count?: number;
  active: boolean;
  onComplete?: () => void;
}

export function ParticleSystem({
  position,
  dynasty,
  count = 20,
  active,
  onComplete,
}: ParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const startTime = useRef<number>(0);
  const hasCompleted = useRef(false);

  const theme = themeManager.getTheme(dynasty);

  const { positions, velocities, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const color = new THREE.Color(theme.accent);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      velocities[i3] = Math.cos(angle) * speed;
      velocities[i3 + 1] = 1 + Math.random() * 2;
      velocities[i3 + 2] = Math.sin(angle) * speed;

      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    return { positions, velocities, colors };
  }, [count, theme.accent]);

  useFrame((state, delta) => {
    if (!active || !pointsRef.current) return;

    if (startTime.current === 0) {
      startTime.current = state.clock.elapsedTime;
      hasCompleted.current = false;
    }

    const elapsed = state.clock.elapsedTime - startTime.current;
    const duration = 0.8;

    if (elapsed > duration) {
      if (!hasCompleted.current && onComplete) {
        hasCompleted.current = true;
        onComplete();
      }
      return;
    }

    const progress = elapsed / duration;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      posArray[i3] += velocities[i3] * delta * 3;
      posArray[i3 + 1] += velocities[i3 + 1] * delta * 3 - elapsed * 2;
      posArray[i3 + 2] += velocities[i3 + 2] * delta * 3;
    }

    posAttr.needsUpdate = true;

    const material = pointsRef.current.material as THREE.PointsMaterial;
    material.opacity = 1 - progress;
    material.size = 0.3 * (1 - progress * 0.5);
  });

  if (!active) {
    startTime.current = 0;
    return null;
  }

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.3}
        vertexColors
        transparent
        opacity={1}
        sizeAttenuation
      />
    </points>
  );
}

interface CollectEffectProps {
  position: [number, number, number] | null;
  dynasty: DynastyId;
  trigger: number;
}

export function CollectEffect({ position, dynasty, trigger }: CollectEffectProps) {
  const key = `particle-${trigger}`;

  if (!position) return null;

  return (
    <ParticleSystem
      key={key}
      position={position}
      dynasty={dynasty}
      active={true}
      count={25}
    />
  );
}

/**
 * Death Explosion - Dramatic particle burst on game over
 */
interface DeathExplosionProps {
  position: [number, number, number] | null;
  dynasty: DynastyId;
  active: boolean;
  onComplete?: () => void;
}

export function DeathExplosion({ position, dynasty, active, onComplete }: DeathExplosionProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const startTime = useRef<number>(0);
  const hasCompleted = useRef(false);

  const theme = themeManager.getTheme(dynasty);
  const count = 150; // More particles for dramatic effect

  const { positions, velocities, colors, sizes } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const primaryColor = new THREE.Color(theme.primary);
    const secondaryColor = new THREE.Color(theme.secondary);
    const accentColor = new THREE.Color(theme.accent);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Start at center
      positions[i3] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;

      // Spherical explosion - particles go in all directions
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI;
      const speed = 2 + Math.random() * 6; // Faster for explosion

      velocities[i3] = Math.sin(theta) * Math.cos(phi) * speed;
      velocities[i3 + 1] = Math.cos(theta) * speed * 0.7 + 2; // Bias upward
      velocities[i3 + 2] = Math.sin(theta) * Math.sin(phi) * speed;

      // Mix of dynasty colors
      const colorChoice = Math.random();
      const color = colorChoice < 0.4 ? primaryColor :
                    colorChoice < 0.7 ? secondaryColor : accentColor;

      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // Varied sizes
      sizes[i] = 0.2 + Math.random() * 0.4;
    }

    return { positions, velocities, colors, sizes };
  }, [count, theme]);

  useFrame((state, delta) => {
    if (!active || !pointsRef.current || !position) return;

    if (startTime.current === 0) {
      startTime.current = state.clock.elapsedTime;
      hasCompleted.current = false;
    }

    const elapsed = state.clock.elapsedTime - startTime.current;
    const duration = 1.5; // Longer for dramatic effect

    if (elapsed > duration) {
      if (!hasCompleted.current && onComplete) {
        hasCompleted.current = true;
        onComplete();
      }
      return;
    }

    const progress = elapsed / duration;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;

    const gravity = 8;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Apply velocity with gravity
      posArray[i3] += velocities[i3] * delta * 2;
      posArray[i3 + 1] += velocities[i3 + 1] * delta * 2 - gravity * elapsed * delta;
      posArray[i3 + 2] += velocities[i3 + 2] * delta * 2;

      // Slow down velocity over time (air resistance)
      velocities[i3] *= 0.99;
      velocities[i3 + 2] *= 0.99;
    }

    posAttr.needsUpdate = true;

    const material = pointsRef.current.material as THREE.PointsMaterial;
    // Fast fade at the end
    material.opacity = progress < 0.7 ? 1 : 1 - ((progress - 0.7) / 0.3);
    material.size = 0.4 * (1 - progress * 0.3);
  });

  if (!active || !position) {
    startTime.current = 0;
    return null;
  }

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.4}
        vertexColors
        transparent
        opacity={1}
        sizeAttenuation
      />
    </points>
  );
}
