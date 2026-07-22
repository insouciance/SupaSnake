'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const MAX_GILDED_CELLS = 128;
const MAX_BONUS_FOODS = 16;

const gildedGeometry = new THREE.BoxGeometry(0.78, 0.05, 0.78);
const bonusGeometry = new THREE.OctahedronGeometry(0.3, 0);
const gildedMaterial = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.48,
  depthWrite: false,
  vertexColors: true,
});
const bonusMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  emissive: '#ffffff',
  emissiveIntensity: 0.45,
  roughness: 0.45,
  metalness: 0.15,
  vertexColors: true,
});
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3(1, 1, 1);
const color = new THREE.Color();

export interface GenomeBoardEffectsProps {
  gildedCells: readonly { x: number; z: number; ticks: number }[];
  bonusFoods: readonly { x: number; z: number; kind: 'molt' | 'heartwood' }[];
}

/** Two instanced layers make Genome-created board objects readable. */
export function GenomeBoardEffects({
  gildedCells,
  bonusFoods,
}: GenomeBoardEffectsProps) {
  const gildedRef = useRef<THREE.InstancedMesh>(null);
  const bonusRef = useRef<THREE.InstancedMesh>(null);

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

  useEffect(() => {
    const mesh = bonusRef.current;
    if (!mesh) return;
    const count = Math.min(bonusFoods.length, MAX_BONUS_FOODS);
    for (let index = 0; index < count; index++) {
      const food = bonusFoods[index];
      position.set(food.x + 0.5, 0.34, food.z + 0.5);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(food.kind === 'heartwood' ? '#f5c542' : '#5ff542'));
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [bonusFoods]);

  return (
    <group>
      <instancedMesh
        ref={gildedRef}
        args={[gildedGeometry, gildedMaterial, MAX_GILDED_CELLS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={bonusRef}
        args={[bonusGeometry, bonusMaterial, MAX_BONUS_FOODS]}
        frustumCulled={false}
      />
    </group>
  );
}

export default GenomeBoardEffects;
