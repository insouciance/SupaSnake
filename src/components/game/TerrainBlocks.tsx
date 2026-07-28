'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TerrainBlock } from '@/shared/game/terrain';

/**
 * TERRAIN, DRAWN (WP-3.05).
 *
 * This component exists because it did not. WP-3.03 shipped terrain as
 * complete physics — scheduled, solidifying, and lethal in the collision chain
 * — with nothing anywhere in the UI that draws it. `arena: CYBER_ARENA` then
 * put six invisible instant-death blocks on the outer ring every five foods.
 * Every terrain test passed, because every terrain test asserts the MODEL, and
 * the model was never wrong.
 *
 * THE FORMING PHASE IS THE WHOLE FAIRNESS ARGUMENT, so it is drawn as a fill
 * rather than a countdown. `terrain.ts` calls it "not a courtesy — it is what
 * makes terrain a positioning problem rather than a random death". A forming
 * phase the player cannot see is only the random death.
 *
 * TWO LAYERS, AND THEY DIFFER CATEGORICALLY, NOT BY COLOUR:
 *
 *   forming  — FLAT floor decal, warm, growing. Harmless. You may cross it.
 *   solid    — RAISED block, cold, static, casting a shadow. Lethal. Permanent.
 *
 * Flat-and-changing versus raised-and-still is a distinction that survives
 * anyone retuning the palette later, and it is the axis the snake's own trail
 * must also differ on: the trail responds to how you are playing, terrain never
 * moves again. Rule 15 — a block is added and never removed.
 *
 * Deliberately NOT a dynasty colour. Dynasty hues mean "you" everywhere else in
 * this scene; the arena closing in is the one thing on the board that is not.
 */

/** Outer ring first, so a full 20x20 board cannot overflow the buffer. */
const MAX_BLOCKS = 256;

/**
 * Warm while it is still a decision, cold once it is architecture. Amber reads
 * as "incoming" against the `#101722` floor; slate reads as "wall".
 */
const FORMING_COLOR = '#f5a742';
const SOLID_COLOR = '#8fa3b8';

/** Flat enough to be unmistakably floor, wide enough to claim the cell. */
const formingGeometry = new THREE.BoxGeometry(0.9, 0.05, 0.9);
/** Tall enough to read as an obstacle from the near-top-down camera. */
const solidGeometry = new THREE.BoxGeometry(0.94, 0.62, 0.94);

const formingMaterial = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
  vertexColors: true,
});

const solidMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  // Matte and barely emissive: terrain must not bloom. Bloom is how this scene
  // says "alive", and the arena is the opposite of alive.
  roughness: 0.85,
  metalness: 0.08,
  emissive: SOLID_COLOR,
  emissiveIntensity: 0.12,
  vertexColors: true,
});

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3(1, 1, 1);
const color = new THREE.Color();

export interface TerrainBlocksProps {
  terrain: readonly TerrainBlock[];
}

export function TerrainBlocks({ terrain }: TerrainBlocksProps) {
  const formingRef = useRef<THREE.InstancedMesh>(null);
  const solidRef = useRef<THREE.InstancedMesh>(null);
  const pulse = useRef(0);

  useEffect(() => {
    const formingMesh = formingRef.current;
    const solidMesh = solidRef.current;
    if (!formingMesh || !solidMesh) return;

    let formingCount = 0;
    let solidCount = 0;

    for (const block of terrain) {
      if (block.solid) {
        if (solidCount >= MAX_BLOCKS) continue;
        position.set(block.x + 0.5, 0.31, block.z + 0.5);
        scale.set(1, 1, 1);
        matrix.compose(position, quaternion, scale);
        solidMesh.setMatrixAt(solidCount, matrix);
        solidMesh.setColorAt(solidCount, color.set(SOLID_COLOR));
        solidCount++;
        continue;
      }

      if (formingCount >= MAX_BLOCKS) continue;
      // The decal FILLS as the block forms, so "how long have I got" is read
      // from area rather than counted. A block whose forming has finished but
      // whose cell is still under the snake (the pending state) sits at full
      // size and waits — visibly claimed, not yet lethal.
      const total = Math.max(1, block.formingTotal);
      const progress = Math.min(
        1,
        Math.max(0, 1 - block.formingTicks / total)
      );
      const fill = 0.25 + 0.75 * progress;
      position.set(block.x + 0.5, 0.045, block.z + 0.5);
      scale.set(fill, 1, fill);
      matrix.compose(position, quaternion, scale);
      formingMesh.setMatrixAt(formingCount, matrix);
      formingMesh.setColorAt(
        formingCount,
        color.set(FORMING_COLOR).multiplyScalar(0.65 + 0.35 * progress)
      );
      formingCount++;
    }

    formingMesh.count = formingCount;
    solidMesh.count = solidCount;
    formingMesh.instanceMatrix.needsUpdate = true;
    solidMesh.instanceMatrix.needsUpdate = true;
    if (formingMesh.instanceColor) formingMesh.instanceColor.needsUpdate = true;
    if (solidMesh.instanceColor) solidMesh.instanceColor.needsUpdate = true;
  }, [terrain]);

  // A slow breathe on the forming layer only — never on solid, which must read
  // as inert. Amplitude is small and the period is over a second: this scene's
  // photosensitivity budget forbids anything that reads as a flash, and a
  // warning that hurts to look at is not a warning.
  useFrame((_, delta) => {
    const mesh = formingRef.current;
    if (!mesh || mesh.count === 0) return;
    pulse.current += delta;
    formingMaterial.opacity = 0.52 + 0.12 * Math.sin(pulse.current * 3.2);
  });

  return (
    <group>
      <instancedMesh
        ref={formingRef}
        args={[formingGeometry, formingMaterial, MAX_BLOCKS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={solidRef}
        args={[solidGeometry, solidMaterial, MAX_BLOCKS]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
    </group>
  );
}

export default TerrainBlocks;
