'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import {
  GAME_SCREEN_COLORS,
  getDynastyScreenTokens,
} from '@/components/game/screen/gameScreenTokens';

interface ArenaUndertrayProps {
  gridSize: number;
  dynasty: DynastyId;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cornerGeometry = new THREE.BoxGeometry(1, 1, 1);

/**
 * Low-cost physical chassis beneath the exact playable board.
 *
 * Seven added draws: base, four shared-material outer rails, one instanced set
 * of corner nodes, and one north orientation notch. No lights and no per-frame
 * work. The geometry stays outside the 20×20 gameplay bounds.
 */
export function ArenaUndertray({ gridSize, dynasty }: ArenaUndertrayProps) {
  const cornersRef = useRef<THREE.InstancedMesh>(null);
  const theme = getDynastyScreenTokens(dynasty);
  const center = gridSize / 2;

  const materials = useMemo(() => {
    const base = new THREE.MeshStandardMaterial({
      color: GAME_SCREEN_COLORS.graphiteDeep,
      metalness: 0.42,
      roughness: 0.68,
    });
    const rail = new THREE.MeshStandardMaterial({
      color: GAME_SCREEN_COLORS.graphiteLifted,
      emissive: theme.primary,
      emissiveIntensity: 0.06,
      metalness: 0.5,
      roughness: 0.52,
    });
    const corner = new THREE.MeshStandardMaterial({
      color: GAME_SCREEN_COLORS.graphiteEdge,
      emissive: theme.secondary,
      emissiveIntensity: 0.22,
      metalness: 0.58,
      roughness: 0.4,
    });
    const orientation = new THREE.MeshBasicMaterial({
      color: theme.secondary,
      transparent: true,
      opacity: 0.72,
    });
    return { base, rail, corner, orientation };
  }, [theme.primary, theme.secondary]);

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

      <mesh
        geometry={unitBox}
        material={materials.orientation}
        position={[center, 0.125, -railOffset - 0.145]}
        scale={[2.1, 0.025, 0.045]}
      />
    </group>
  );
}

export default ArenaUndertray;
