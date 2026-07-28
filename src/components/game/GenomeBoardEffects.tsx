'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const MAX_GILDED_CELLS = 128;

const gildedGeometry = new THREE.BoxGeometry(0.78, 0.05, 0.78);
const gildedMaterial = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.48,
  depthWrite: false,
  vertexColors: true,
});
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3(1, 1, 1);
const color = new THREE.Color();

export interface GenomeBoardEffectsProps {
  gildedCells: readonly { x: number; z: number; ticks: number }[];
}

/**
 * Genome-created board objects.
 *
 * This drew two layers until WP-3.11. The second was the bonus-food layer -
 * FERAL's molt drops and Heartwood's goldens - and Fortress retired both: the
 * cells those pickups landed on are terrain now, and their DNA is folded
 * deterministically rather than collected. Petrified blocks are drawn by
 * `TerrainBlocks`, which is mounted unconditionally, so PRIMAL's Expression is
 * visible without a layer of its own.
 */
export function GenomeBoardEffects({ gildedCells }: GenomeBoardEffectsProps) {
  const gildedRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = gildedRef.current;
    if (!mesh) return;
    const count = Math.min(gildedCells.length, MAX_GILDED_CELLS);
    for (let index = 0; index < count; index++) {
      const cell = gildedCells[index];
      position.set(cell.x + 0.5, 0.035, cell.z + 0.5);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      color.set('#f5c542').multiplyScalar(0.7 + Math.min(0.3, cell.ticks / 1000));
      mesh.setColorAt(index, color);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [gildedCells]);

  return (
    <group>
      <instancedMesh
        ref={gildedRef}
        args={[gildedGeometry, gildedMaterial, MAX_GILDED_CELLS]}
        frustumCulled={false}
      />
    </group>
  );
}

export default GenomeBoardEffects;
