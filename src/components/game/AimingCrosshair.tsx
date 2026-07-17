'use client';

/**
 * AimingCrosshair - Pro aim telegraph + food targeting
 *
 * The e-sports read, in three layers of priority:
 * 1. Heading chevron: bright dynasty-accent chevron just ahead of the head
 *    showing the committed heading (gently pulsed for visibility)
 * 2. Projected path lane: the true next-5-cells path (queued turns
 *    included, mirroring engine tick semantics) as dynasty-colored quads
 *    fading with distance - truncates at the wall as a danger read
 * 3. Queued-turn chevrons: bone-white chevrons at the cells where buffered
 *    inputs will execute - instant "input registered" confirmation
 *
 * Food crosshair lines are kept but dimmed to background-info level.
 * All geometries/materials are memoized and shared; the only per-frame
 * work is one opacity write (no allocations in useFrame).
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Direction, Position } from '@/lib/game/SnakeGameLogic';
import { projectAimPath, DIRECTION_DELTAS, DIRECTION_YAW } from './aimUtils';

interface AimingCrosshairProps {
  /** Food position [x, z] on the grid */
  foodPosition: { x: number; z: number } | null;
  /** Snake head position (null when not playing) */
  headPosition?: Position | null;
  /** Current committed heading */
  direction?: Direction;
  /** Buffered direction inputs (engine consumption order) */
  queuedDirections?: readonly Direction[];
  /** Grid size (default 20) */
  gridSize?: number;
  /** Food crosshair / heading chevron color (dynasty accent) */
  color?: string;
  /** Path lane color (dynasty primary) */
  laneColor?: string;
  /** Food crosshair line opacity */
  opacity?: number;
}

/** Cells of projected path shown ahead of the head */
const LANE_LENGTH = 5;
/** Distance-fade opacity ramp for the lane quads */
const LANE_OPACITIES = [0.3, 0.22, 0.16, 0.11, 0.07];

const EMPTY_QUEUE: readonly Direction[] = [];

export function AimingCrosshair({
  foodPosition,
  headPosition = null,
  direction = 'RIGHT',
  queuedDirections = EMPTY_QUEUE,
  gridSize = 20,
  color = '#22d3ee',
  laneColor = '#22d3ee',
  opacity = 0.15,
}: AimingCrosshairProps) {
  const y = 0.05; // Slightly above floor and grid lines
  const x = foodPosition?.x ?? 0;
  const z = foodPosition?.z ?? 0;

  // --- Shared geometries (created once) ---
  const laneGeometry = useMemo(() => new THREE.PlaneGeometry(0.86, 0.86), []);
  const chevronGeometry = useMemo(() => {
    // Chevron band pointing +Y in shape space; the flat -PI/2 X-rotation
    // maps +Y to -Z (grid UP), matching DIRECTION_YAW.
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, -0.14);
    shape.lineTo(0, 0.22);
    shape.lineTo(0.3, -0.14);
    shape.lineTo(0.18, -0.14);
    shape.lineTo(0, 0.06);
    shape.lineTo(-0.18, -0.14);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  // --- Shared materials (rebuilt only on dynasty color change) ---
  const laneMaterials = useMemo(
    () =>
      LANE_OPACITIES.map(
        (o) =>
          new THREE.MeshBasicMaterial({
            color: laneColor,
            transparent: true,
            opacity: o,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
      ),
    [laneColor]
  );

  const headingMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  const turnMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#e6edf3',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    []
  );

  useEffect(() => {
    return () => {
      laneGeometry.dispose();
      chevronGeometry.dispose();
      laneMaterials.forEach((m) => m.dispose());
      headingMaterial.dispose();
      turnMaterial.dispose();
    };
  }, [laneGeometry, chevronGeometry, laneMaterials, headingMaterial, turnMaterial]);

  // Gentle pulse on the heading chevron - one opacity write per frame
  useFrame(({ clock }) => {
    headingMaterial.opacity = 0.65 + Math.sin(clock.getElapsedTime() * 5) * 0.2;
  });

  // --- Projected path (true engine path: queued turns applied per tick) ---
  const path = useMemo(
    () =>
      headPosition
        ? projectAimPath(headPosition, direction, queuedDirections, gridSize, LANE_LENGTH)
        : [],
    [headPosition, direction, queuedDirections, gridSize]
  );

  // Heading chevron sits at the front edge of the head cell
  const headingDelta = DIRECTION_DELTAS[direction];

  // Food crosshair lines
  const horizontalPoints = useMemo(() => [
    new THREE.Vector3(0, y, z + 0.5),
    new THREE.Vector3(gridSize, y, z + 0.5),
  ], [z, gridSize, y]);

  const verticalPoints = useMemo(() => [
    new THREE.Vector3(x + 0.5, y, 0),
    new THREE.Vector3(x + 0.5, y, gridSize),
  ], [x, gridSize, y]);

  return (
    <group>
      {/* === Pro aim telegraph === */}
      {headPosition && (
        <group>
          {/* Heading chevron - committed direction, at the head's front edge */}
          <group
            position={[
              headPosition.x + 0.5 + headingDelta.x * 0.55,
              y + 0.015,
              headPosition.z + 0.5 + headingDelta.z * 0.55,
            ]}
            rotation-y={DIRECTION_YAW[direction]}
          >
            <mesh
              geometry={chevronGeometry}
              material={headingMaterial}
              rotation-x={-Math.PI / 2}
              scale={0.85}
            />
          </group>

          {/* Projected path lane - fades with distance */}
          {path.map((cell, i) => (
            <mesh
              key={`lane-${i}`}
              geometry={laneGeometry}
              material={laneMaterials[i]}
              position={[cell.x + 0.5, y - 0.02, cell.z + 0.5]}
              rotation-x={-Math.PI / 2}
            />
          ))}

          {/* Queued-turn chevrons - input-registered confirmation */}
          {path.map((cell, i) =>
            cell.isTurn ? (
              <group
                key={`turn-${i}`}
                position={[cell.x + 0.5, y + 0.01, cell.z + 0.5]}
                rotation-y={DIRECTION_YAW[cell.direction]}
              >
                <mesh
                  geometry={chevronGeometry}
                  material={turnMaterial}
                  rotation-x={-Math.PI / 2}
                />
              </group>
            ) : null
          )}
        </group>
      )}

      {/* === Food targeting (background info level) === */}
      {foodPosition && (
        <group>
          <Line
            points={horizontalPoints}
            color={color}
            lineWidth={1}
            opacity={opacity}
            transparent
          />
          <Line
            points={verticalPoints}
            color={color}
            lineWidth={1}
            opacity={opacity}
            transparent
          />
          {/* Center target indicator - small diamond at intersection */}
          <mesh position={[x + 0.5, y + 0.01, z + 0.5]} rotation={[0, Math.PI / 4, 0]}>
            <ringGeometry args={[0.3, 0.4, 4]} />
            <meshBasicMaterial color={color} opacity={0.45} transparent side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export default AimingCrosshair;
