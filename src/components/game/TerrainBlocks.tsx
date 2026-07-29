'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GAME_CONFIG } from '@/shared/config/game';
import type { TerrainBlock, TerrainSource } from '@/shared/game/terrain';
import { FLOOR_CLEARANCE } from './ArenaFloor';

/**
 * One terrain physics primitive, one lifecycle, four causal signatures.
 *
 * FORMING is a claimed BOARD CELL: a low amber fill plus perimeter rails
 * closes inward. It is passable, and its area is the remaining-warning clock.
 * SOLID is a transformed cell: raised, matte, and permanently still. This
 * replaces the generic "concrete cube" read with board architecture while
 * preserving the categorical flat/raised safety grammar.
 *
 * Cause survives as a quiet Genome-derived top rune, never a different
 * collision shape: VOLT lightning for CYBER, a FERAL sprout/claw for Fortress,
 * a broken FLUX portal for COSMIC, and an AURUM-style seal for the ladder.
 * The rune is already present while a cell forms, then lifts with the cell as
 * it locks. Source is distinguished by silhouette rather than dynasty colour.
 * Three instanced meshes cover the whole grammar (forming, solid, rune).
 */

const MAX_BLOCKS = GAME_CONFIG.board.gridSize * GAME_CONFIG.board.gridSize;
const MAX_FORMING_INSTANCES = MAX_BLOCKS * 5;
const MAX_SIGNATURES = MAX_BLOCKS * 5;
const FORMING_HEIGHT = 0.035;
const FORMING_FOOTPRINT = 0.86;
const SOLID_HEIGHT = 0.72;
const SOLID_FOOTPRINT = 0.94;
const SIGNATURE_HEIGHT = 0.04;

const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const formingMaterial = new THREE.MeshBasicMaterial({
  color: '#f2a640',
  toneMapped: false,
});
const solidMaterial = new THREE.MeshStandardMaterial({
  color: '#8292a0',
  roughness: 0.9,
  metalness: 0.03,
  emissive: '#65717c',
  emissiveIntensity: 0.18,
});
const signatureMaterial = new THREE.MeshBasicMaterial({
  color: '#e6edf1',
  toneMapped: false,
});

// Module scratch: a terrain update allocates no THREE objects.
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const identity = new THREE.Quaternion();
const rotation = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const scale = new THREE.Vector3(1, 1, 1);

export interface TerrainRuneStroke {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  readonly width: number;
}

/**
 * Local-cell linework adapted from the Genome strain glyphs. Exported so the
 * causal vocabulary is testable without a WebGL context.
 */
export function terrainRuneStrokes(
  source: TerrainSource
): readonly TerrainRuneStroke[] {
  switch (source) {
    case 'cyber':
      // VOLT: a connected three-stroke lightning channel.
      return [
        { x1: 0.15, z1: -0.32, x2: -0.09, z2: -0.04, width: 0.075 },
        { x1: -0.09, z1: -0.04, x2: 0.09, z2: -0.04, width: 0.075 },
        { x1: 0.09, z1: -0.04, x2: -0.15, z2: 0.32, width: 0.075 },
      ];
    case 'fortress':
      // FERAL: a rooted stem with two protective prongs.
      return [
        { x1: 0, z1: -0.3, x2: 0, z2: 0.3, width: 0.07 },
        { x1: -0.29, z1: -0.08, x2: 0, z2: 0.09, width: 0.07 },
        { x1: 0.29, z1: -0.08, x2: 0, z2: 0.09, width: 0.07 },
      ];
    case 'cosmic':
      // FLUX: four separated portal arcs. Deliberately not the old X.
      return [
        { x1: -0.23, z1: -0.15, x2: -0.06, z2: -0.31, width: 0.065 },
        { x1: 0.06, z1: -0.31, x2: 0.23, z2: -0.15, width: 0.065 },
        { x1: 0.23, z1: 0.15, x2: 0.06, z2: 0.31, width: 0.065 },
        { x1: -0.06, z1: 0.31, x2: -0.23, z2: 0.15, width: 0.065 },
      ];
    case 'ladder':
      // AURUM / Genome socket: a compact five-sided authored seal.
      return [
        { x1: 0, z1: -0.31, x2: 0.28, z2: -0.1, width: 0.06 },
        { x1: 0.28, z1: -0.1, x2: 0.17, z2: 0.28, width: 0.06 },
        { x1: 0.17, z1: 0.28, x2: -0.17, z2: 0.28, width: 0.06 },
        { x1: -0.17, z1: 0.28, x2: -0.28, z2: -0.1, width: 0.06 },
        { x1: -0.28, z1: -0.1, x2: 0, z2: -0.31, width: 0.06 },
      ];
  }
}

function writeInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  quaternion: THREE.Quaternion
): void {
  position.set(x, y, z);
  scale.set(sx, sy, sz);
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

function markUpdated(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
}

export interface TerrainBlocksProps {
  terrain: readonly TerrainBlock[];
}

export function TerrainBlocks({ terrain }: TerrainBlocksProps) {
  const formingRef = useRef<THREE.InstancedMesh>(null);
  const solidRef = useRef<THREE.InstancedMesh>(null);
  const signatureRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const forming = formingRef.current;
    const solid = solidRef.current;
    const signature = signatureRef.current;
    if (!forming || !solid || !signature) return;

    let formingCount = 0;
    let solidCount = 0;
    let signatureCount = 0;
    const addForming = (
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number
    ): void => {
      if (formingCount >= MAX_FORMING_INSTANCES) return;
      writeInstance(
        forming,
        formingCount,
        x,
        y,
        z,
        sx,
        sy,
        sz,
        identity
      );
      formingCount += 1;
    };
    const addStroke = (
      x: number,
      y: number,
      z: number,
      stroke: TerrainRuneStroke,
      runeScale: number
    ): void => {
      if (signatureCount >= MAX_SIGNATURES) return;
      const dx = (stroke.x2 - stroke.x1) * runeScale;
      const dz = (stroke.z2 - stroke.z1) * runeScale;
      const length = Math.hypot(dx, dz);
      const centerX = x + ((stroke.x1 + stroke.x2) / 2) * runeScale;
      const centerZ = z + ((stroke.z1 + stroke.z2) / 2) * runeScale;
      const angle = Math.atan2(-dz, dx);
      rotation.setFromAxisAngle(yAxis, angle);
      writeInstance(
        signature,
        signatureCount,
        centerX,
        y,
        centerZ,
        length,
        SIGNATURE_HEIGHT,
        stroke.width * runeScale,
        rotation
      );
      signatureCount += 1;
    };
    const addRune = (
      source: TerrainSource,
      x: number,
      y: number,
      z: number,
      runeScale = 1
    ): void => {
      // Cause is not mapped to a colour: dynasty hues mean player identity.
      for (const stroke of terrainRuneStrokes(source)) {
        addStroke(x, y, z, stroke, runeScale);
      }
    };

    for (const block of terrain) {
      const x = block.x + 0.5;
      const z = block.z + 0.5;
      if (block.solid) {
        if (solidCount < MAX_BLOCKS) {
          writeInstance(
            solid,
            solidCount,
            x,
            FLOOR_CLEARANCE + SOLID_HEIGHT / 2,
            z,
            SOLID_FOOTPRINT,
            SOLID_HEIGHT,
            SOLID_FOOTPRINT,
            identity
          );
          solidCount += 1;
        }

        const top = FLOOR_CLEARANCE + SOLID_HEIGHT + SIGNATURE_HEIGHT / 2;
        addRune(block.source, x, top, z);
        continue;
      }

      const total = Math.max(1, block.formingTotal);
      const progress = Math.min(1, Math.max(0, 1 - block.formingTicks / total));
      const fill = (0.22 + 0.78 * progress) * FORMING_FOOTPRINT;
      addForming(
        x,
        FLOOR_CLEARANCE + FORMING_HEIGHT / 2,
        z,
        fill,
        FORMING_HEIGHT,
        fill
      );

      // The perimeter names the whole unavailable cell even while the fill is
      // small. Rails shorten inward with the same progress, so cause and
      // countdown read as one transformation rather than competing effects.
      const span = 0.2 + 0.66 * progress;
      addForming(x, FLOOR_CLEARANCE + 0.04, z - 0.43, span, 0.035, 0.035);
      addForming(x, FLOOR_CLEARANCE + 0.04, z + 0.43, span, 0.035, 0.035);
      addForming(x - 0.43, FLOOR_CLEARANCE + 0.04, z, 0.035, 0.035, span);
      addForming(x + 0.43, FLOOR_CLEARANCE + 0.04, z, 0.035, 0.035, span);

      // The stable rune names WHY this cell is being claimed while the amber
      // fill shows WHEN. On lock, the same mark rises with the transformed
      // cell instead of changing symbols at the dangerous moment.
      addRune(
        block.source,
        x,
        FLOOR_CLEARANCE + FORMING_HEIGHT + SIGNATURE_HEIGHT / 2 + 0.004,
        z,
        0.82
      );
    }

    forming.count = formingCount;
    solid.count = solidCount;
    signature.count = signatureCount;
    markUpdated(forming);
    markUpdated(solid);
    markUpdated(signature);
  }, [terrain]);

  return (
    <group>
      <instancedMesh
        ref={formingRef}
        args={[unitBoxGeometry, formingMaterial, MAX_FORMING_INSTANCES]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={solidRef}
        args={[unitBoxGeometry, solidMaterial, MAX_BLOCKS]}
        frustumCulled={false}
        receiveShadow
      />
      <instancedMesh
        ref={signatureRef}
        args={[unitBoxGeometry, signatureMaterial, MAX_SIGNATURES]}
        frustumCulled={false}
      />
    </group>
  );
}

export default TerrainBlocks;
