'use client';

import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import { GAME_CONFIG } from '@/shared/config/game';

// Arcade color palette from styleguide
const ARCADE_COLORS = {
  scaleBlue: '#232C33',
  scaleBlueLight: '#2a3540',
  venomOrange: '#D98324',
};

interface GameFloorProps {
  dynasty: DynastyId;
}

export function GameFloor({ dynasty }: GameFloorProps) {
  const gridSize = GAME_CONFIG.board.gridSize;

  return (
    <>
      {/* Floor - Scale Blue base */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[gridSize / 2, -0.01, gridSize / 2]}
        receiveShadow
      >
        <planeGeometry args={[gridSize, gridSize]} />
        <meshStandardMaterial
          color={ARCADE_COLORS.scaleBlue}
          metalness={0.6}
          roughness={0.5}
        />
      </mesh>

      {/* Grid - Venom Orange primary lines, lighter Scale Blue secondary */}
      <gridHelper
        args={[gridSize, gridSize, ARCADE_COLORS.venomOrange, ARCADE_COLORS.scaleBlueLight]}
        position={[gridSize / 2, 0.01, gridSize / 2]}
      />

      {/* Border - Solid Venom Orange */}
      <lineSegments position={[gridSize / 2, 0.5, gridSize / 2]}>
        <edgesGeometry args={[new THREE.BoxGeometry(gridSize, 1, gridSize)]} />
        <lineBasicMaterial color={ARCADE_COLORS.venomOrange} opacity={0.8} transparent />
      </lineSegments>
    </>
  );
}
