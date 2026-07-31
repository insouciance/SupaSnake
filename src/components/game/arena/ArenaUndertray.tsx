'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import type { StrainId } from '@/shared/game/strains';
import { GAME_SCREEN_COLORS } from '@/components/game/screen/gameScreenTokens';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';
import { genomeRuneStrokes } from '@/components/game/screen/gameRuneStrokes';

interface ArenaUndertrayProps {
  gridSize: number;
  dynasty: DynastyId;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cornerGeometry = new THREE.BoxGeometry(1, 1, 1);
const orientationGeometry = new THREE.BoxGeometry(1, 1, 1);
const MAX_ORIENTATION_STROKES = 5;

const DYNASTY_ORIENTATION_RUNE: Record<DynastyId, StrainId> = {
  CYBER: 'VOLT',
  PRIMAL: 'FERAL',
  COSMIC: 'FLUX',
};

export interface ArenaOrientationStrokeLayout {
  readonly x: number;
  readonly z: number;
  readonly length: number;
  readonly width: number;
  readonly yaw: number;
}

/** Pure layout contract for the functional north marker. Every point remains
 * outside the playable z >= 0 rectangle and inside the undertray silhouette. */
export function arenaOrientationRuneLayout(
  gridSize: number,
  dynasty: DynastyId
): readonly ArenaOrientationStrokeLayout[] {
  const center = gridSize / 2;
  const runeScale = 1.15;
  const runeZ = -0.84;
  return genomeRuneStrokes(DYNASTY_ORIENTATION_RUNE[dynasty]).map((stroke) => {
    const dx = (stroke.x2 - stroke.x1) * runeScale;
    const dz = (stroke.z2 - stroke.z1) * runeScale;
    return {
      x: center + ((stroke.x1 + stroke.x2) / 2) * runeScale,
      z: runeZ + ((stroke.z1 + stroke.z2) / 2) * runeScale,
      length: Math.hypot(dx, dz),
      width: stroke.width * runeScale,
      yaw: Math.atan2(-dz, dx),
    };
  });
}

/**
 * Low-cost physical chassis beneath the exact playable board.
 *
 * Seven added draws: base, four shared-material outer rails, one instanced set
 * of corner nodes, and one instanced north rune. The rune replaces the generic
 * notch with the dynasty's already-learned Genome mark, using it for actual
 * orientation rather than wallpaper. No lights or per-frame work; all geometry
 * stays outside the 20×20 gameplay bounds.
 */
export function ArenaUndertray({ gridSize, dynasty }: ArenaUndertrayProps) {
  const cornersRef = useRef<THREE.InstancedMesh>(null);
  const orientationRef = useRef<THREE.InstancedMesh>(null);
  const profile = getGameMaterialProfile(dynasty);
  const center = gridSize / 2;

  const materials = useMemo(() => {
    const base = new THREE.MeshStandardMaterial({
      color: GAME_SCREEN_COLORS.graphiteDeep,
      metalness: 0.42,
      roughness: 0.68,
    });
    const rail = new THREE.MeshStandardMaterial({
      color: GAME_SCREEN_COLORS.graphiteLifted,
      emissive: profile.arena.undertrayRailColor,
      emissiveIntensity: 0.06,
      metalness: 0.5,
      roughness: 0.52,
    });
    const corner = new THREE.MeshStandardMaterial({
      color: GAME_SCREEN_COLORS.graphiteEdge,
      emissive: profile.arena.undertrayCornerColor,
      emissiveIntensity: 0.22,
      metalness: 0.58,
      roughness: 0.4,
    });
    const orientation = new THREE.MeshBasicMaterial({
      color: profile.arena.undertrayCornerColor,
      transparent: true,
      opacity: 0.78,
    });
    return { base, rail, corner, orientation };
  }, [profile.arena.undertrayCornerColor, profile.arena.undertrayRailColor]);

  useLayoutEffect(() => {
    const mesh = cornersRef.current;
    if (!mesh) return;
    const transform = new THREE.Matrix4();
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, Math.PI / 4, 0)
    );
    const scale = new THREE.Vector3(0.42, 0.18, 0.42);
    const positions = [
      [-0.76, 0.06, -0.76],
      [gridSize + 0.76, 0.06, -0.76],
      [-0.76, 0.06, gridSize + 0.76],
      [gridSize + 0.76, 0.06, gridSize + 0.76],
    ] as const;
    positions.forEach(([x, y, z], index) => {
      transform.compose(new THREE.Vector3(x, y, z), rotation, scale);
      mesh.setMatrixAt(index, transform);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [gridSize]);

  useLayoutEffect(() => {
    const mesh = orientationRef.current;
    if (!mesh) return;
    const rune = arenaOrientationRuneLayout(gridSize, dynasty);
    const transform = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    rune.forEach((stroke, index) => {
      rotation.setFromAxisAngle(yAxis, stroke.yaw);
      position.set(stroke.x, 0.125, stroke.z);
      scale.set(stroke.length, 0.025, stroke.width);
      transform.compose(position, rotation, scale);
      mesh.setMatrixAt(index, transform);
    });
    mesh.count = rune.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [dynasty, gridSize]);

  useEffect(() => {
    return () => {
      materials.base.dispose();
      materials.rail.dispose();
      materials.corner.dispose();
      materials.orientation.dispose();
    };
  }, [materials]);

  const outerSpan = gridSize + 1.8;
  const railOffset = 0.73;

  return (
    <group>
      <mesh
        geometry={unitBox}
        material={materials.base}
        position={[center, -0.22, center]}
        scale={[gridSize + 2.35, 0.34, gridSize + 2.35]}
        receiveShadow
      />

      <mesh
        geometry={unitBox}
        material={materials.rail}
        position={[center, 0.01, -railOffset]}
        scale={[outerSpan, 0.18, 0.28]}
      />
      <mesh
        geometry={unitBox}
        material={materials.rail}
        position={[center, 0.01, gridSize + railOffset]}
        scale={[outerSpan, 0.18, 0.28]}
      />
      <mesh
        geometry={unitBox}
        material={materials.rail}
        position={[-railOffset, 0.01, center]}
        scale={[0.28, 0.18, outerSpan]}
      />
      <mesh
        geometry={unitBox}
        material={materials.rail}
        position={[gridSize + railOffset, 0.01, center]}
        scale={[0.28, 0.18, outerSpan]}
      />

      <instancedMesh
        ref={cornersRef}
        args={[cornerGeometry, materials.corner, 4]}
        frustumCulled={false}
      />

      <instancedMesh
        ref={orientationRef}
        args={[
          orientationGeometry,
          materials.orientation,
          MAX_ORIENTATION_STROKES,
        ]}
        frustumCulled={false}
      />
    </group>
  );
}

export default ArenaUndertray;
