'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GAME_CONFIG } from '@/shared/config/game';
import type { TerrainBlock, TerrainSource } from '@/shared/game/terrain';
import { STRAINS, type StrainId } from '@/shared/game/strains';
import { FLOOR_CLEARANCE } from './ArenaFloor';
import {
  genomeRuneEngravingStrokes,
  type GenomeRuneEngravingStroke,
} from './screen/gameRuneStrokes';
import { getTerrainCellGeometry } from './screen/gameRenderGeometry';
import { createInkHullMaterial, getToonGradientMap } from './screen/inkAmber';

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
 * it locks. Source is distinguished first by silhouette, then reinforced by
 * the already-learned Genome strain colour (never by the active dynasty).
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
// INK & AMBER, the amber law: ground becoming yours is the same amber as
// banked yield, the Daily Take, and every primary action. A 3-unit shift off
// the terrain amber that was already here - the grammar was right, it just
// was not shared.
const formingMaterial = new THREE.MeshBasicMaterial({
  color: '#f2a03f',
  toneMapped: false,
});
// Solid terrain is a hazard, and at #8292a0 it was the lightest large object
// on the board - the exact inverse of what it means. Slate deep + a hard ink
// edge puts it back where the mascot's palette puts it: cool, heavy, behind.
const solidMaterial = new THREE.MeshToonMaterial({
  color: '#3f5060',
  emissive: '#22303c',
  emissiveIntensity: 0.5,
  gradientMap: getToonGradientMap(),
});
const solidHullMaterial = createInkHullMaterial();
const signatureMaterial = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  toneMapped: false,
});
const solidGeometry = getTerrainCellGeometry();

// Module scratch: a terrain update allocates no THREE objects.
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const identity = new THREE.Quaternion();
const rotation = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const scale = new THREE.Vector3(1, 1, 1);
const signatureColor = new THREE.Color();

export type TerrainRuneStroke = GenomeRuneEngravingStroke;

const TERRAIN_RUNE_STRAIN: Record<TerrainSource, StrainId> = {
  cyber: 'VOLT',
  fortress: 'FERAL',
  cosmic: 'FLUX',
  ladder: 'AURUM',
};

/**
 * Local-cell linework adapted from the Genome strain glyphs. Exported so the
 * causal vocabulary is testable without a WebGL context.
 */
export function terrainRuneStrokes(
  source: TerrainSource
): readonly TerrainRuneStroke[] {
  return genomeRuneEngravingStrokes(TERRAIN_RUNE_STRAIN[source]);
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
  const solidHullRef = useRef<THREE.InstancedMesh>(null);
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
      source: TerrainSource,
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
      signatureColor.set(STRAINS[TERRAIN_RUNE_STRAIN[source]].color);
      signature.setColorAt(signatureCount, signatureColor);
      signatureCount += 1;
    };
    const addRune = (
      source: TerrainSource,
      x: number,
      y: number,
      z: number,
      runeScale = 1
    ): void => {
      // The silhouette remains the primary cause channel. Its restrained
      // canonical strain colour is a learned Genome echo, never a new code.
      for (const stroke of terrainRuneStrokes(source)) {
        addStroke(source, x, y, z, stroke, runeScale);
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
    // Ink hull: the identical solid instance set, copied rather than recomputed.
    const solidHull = solidHullRef.current;
    if (solidHull) {
      (solidHull.instanceMatrix.array as Float32Array).set(
        solid.instanceMatrix.array as Float32Array
      );
      solidHull.count = solidCount;
      markUpdated(solidHull);
    }
    if (signature.instanceColor) {
      signature.instanceColor.needsUpdate = true;
    }
  }, [terrain]);

  return (
    <group>
      <instancedMesh
        ref={formingRef}
        args={[unitBoxGeometry, formingMaterial, MAX_FORMING_INSTANCES]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={solidHullRef}
        args={[solidGeometry, solidHullMaterial, MAX_BLOCKS]}
        frustumCulled={false}
        renderOrder={-1}
      />
      <instancedMesh
        ref={solidRef}
        args={[solidGeometry, solidMaterial, MAX_BLOCKS]}
        frustumCulled={false}
        receiveShadow
        castShadow
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
