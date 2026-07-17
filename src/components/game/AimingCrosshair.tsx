'use client';

/**
 * AimingCrosshair - the aim telegraph, rendered per the player's selected
 * aim system (meta-progression, see src/lib/game/aimSystems.ts):
 *
 * - pulse:    heading chevron just ahead of the head (always present)
 * - vector:   + projected 5-cell path lane (queued turns applied,
 *              mirroring engine tick semantics)
 * - sequence: + bone-white chevrons where buffered inputs will execute
 * - radar:    + danger sense - when the committed heading impacts a wall
 *              or the snake body within 5 cells, the cells leading to the
 *              impact tint neon rose with intensity rising toward it
 * - apex:     everything, at subtler opacities
 *
 * The legacy food crosshair is gone - aim help comes only from aim systems.
 * All geometries/materials are memoized and shared; the only per-frame
 * work is one opacity write (no allocations in useFrame).
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Direction, Position } from '@/lib/game/SnakeGameLogic';
import { getAimFeatures, type AimSystemId } from '@/lib/game/aimSystems';
import {
  projectAimPath,
  projectDangerPath,
  DIRECTION_DELTAS,
  DIRECTION_YAW,
} from './aimUtils';

interface AimingCrosshairProps {
  /** Snake head position (null when not playing) */
  headPosition?: Position | null;
  /** Current committed heading */
  direction?: Direction;
  /** Buffered direction inputs (engine consumption order) */
  queuedDirections?: readonly Direction[];
  /** Full snake (for the radar body-impact scan) */
  snake?: readonly Position[];
  /** Grid size (default 20) */
  gridSize?: number;
  /** Player-selected aim system (drives which layers render) */
  aimSystem?: AimSystemId;
  /** Heading chevron color (dynasty accent) */
  color?: string;
  /** Path lane color (dynasty primary) */
  laneColor?: string;
}

/** Cells of projected path / danger scan ahead of the head */
const LANE_LENGTH = 5;
/** Distance-fade opacity ramp for the lane quads */
const LANE_OPACITIES = [0.3, 0.22, 0.16, 0.11, 0.07];
/** Danger tint ramp, indexed by distance FROM impact (0 = at impact) */
const DANGER_OPACITIES = [0.7, 0.52, 0.38, 0.26, 0.16];
/** Neon rose - the palette's danger accent */
const DANGER_COLOR = '#f43f5e';

const EMPTY_QUEUE: readonly Direction[] = [];
const EMPTY_SNAKE: readonly Position[] = [];

export function AimingCrosshair({
  headPosition = null,
  direction = 'RIGHT',
  queuedDirections = EMPTY_QUEUE,
  snake = EMPTY_SNAKE,
  gridSize = 20,
  aimSystem = 'pulse',
  color = '#22d3ee',
  laneColor = '#22d3ee',
}: AimingCrosshairProps) {
  const y = 0.05; // Slightly above floor and grid lines

  const features = getAimFeatures(aimSystem);
  /** Apex renders every layer, so each is dialed down to stay readable */
  const layerScale = features.subtle ? 0.6 : 1;

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

  // --- Shared materials (rebuilt only on dynasty color / system change) ---
  const laneMaterials = useMemo(
    () =>
      LANE_OPACITIES.map(
        (o) =>
          new THREE.MeshBasicMaterial({
            color: laneColor,
            transparent: true,
            opacity: o * layerScale,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
      ),
    [laneColor, layerScale]
  );

  const dangerMaterials = useMemo(
    () =>
      DANGER_OPACITIES.map(
        (o) =>
          new THREE.MeshBasicMaterial({
            color: DANGER_COLOR,
            transparent: true,
            opacity: o * (features.subtle ? 0.7 : 1),
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
      ),
    [features.subtle]
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
        opacity: 0.9 * layerScale,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [layerScale]
  );

  useEffect(() => {
    return () => {
      laneGeometry.dispose();
      chevronGeometry.dispose();
      laneMaterials.forEach((m) => m.dispose());
      dangerMaterials.forEach((m) => m.dispose());
      headingMaterial.dispose();
      turnMaterial.dispose();
    };
  }, [
    laneGeometry,
    chevronGeometry,
    laneMaterials,
    dangerMaterials,
    headingMaterial,
    turnMaterial,
  ]);

  // Gentle pulse on the heading chevron - one opacity write per frame
  const pulseBase = features.subtle ? 0.5 : 0.65;
  const pulseAmp = features.subtle ? 0.14 : 0.2;
  useFrame(({ clock }) => {
    headingMaterial.opacity =
      pulseBase + Math.sin(clock.getElapsedTime() * 5) * pulseAmp;
  });

  // --- Projected path (true engine path: queued turns applied per tick) ---
  const path = useMemo(
    () =>
      headPosition && (features.lane || features.queue)
        ? projectAimPath(headPosition, direction, queuedDirections, gridSize, LANE_LENGTH)
        : [],
    [headPosition, direction, queuedDirections, gridSize, features.lane, features.queue]
  );

  // --- Danger scan (committed heading only, no queue) ---
  const danger = useMemo(
    () =>
      headPosition && features.radar
        ? projectDangerPath(headPosition, direction, snake, gridSize, LANE_LENGTH)
        : null,
    [headPosition, direction, snake, gridSize, features.radar]
  );
  const dangerCells = danger?.impact ? danger.cells : [];

  // Heading chevron sits at the front edge of the head cell
  const headingDelta = DIRECTION_DELTAS[direction];

  if (!headPosition) return null;

  return (
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
      {features.lane &&
        path.map((cell, i) => (
          <mesh
            key={`lane-${i}`}
            geometry={laneGeometry}
            material={laneMaterials[i]}
            position={[cell.x + 0.5, y - 0.02, cell.z + 0.5]}
            rotation-x={-Math.PI / 2}
          />
        ))}

      {/* Queued-turn chevrons - input-registered confirmation */}
      {features.queue &&
        path.map((cell, i) =>
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

      {/* Radar danger sense - rose tint rising toward the impact. Sits just
          above the lane quads so apex reads danger over path. */}
      {dangerCells.map((cell, i) => (
        <mesh
          key={`danger-${i}`}
          geometry={laneGeometry}
          material={
            dangerMaterials[
              Math.min(dangerCells.length - 1 - i, DANGER_OPACITIES.length - 1)
            ]
          }
          position={[cell.x + 0.5, y - 0.01, cell.z + 0.5]}
          rotation-x={-Math.PI / 2}
        />
      ))}
    </group>
  );
}

export default AimingCrosshair;
