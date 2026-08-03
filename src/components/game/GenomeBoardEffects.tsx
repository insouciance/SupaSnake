'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { STRAINS } from '@/shared/game/strains';
import { FLOOR_CLEARANCE } from './ArenaFloor';
import { getTerrainCellGeometry } from './screen/gameRenderGeometry';
import { genomeRuneEngravingStrokes } from './screen/gameRuneStrokes';
import type {
  GenomeV2BoardProjection,
  GenomeV2BoardTarget,
  GenomeV2BoardTerrainSource,
} from './genome/genomeV2BoardPresentation';

const MAX_GILDED_CELLS = 128;
const MAX_GENOME_TERRAIN_CELLS = 400;
const MAX_GENOME_TERRAIN_RUNES = MAX_GENOME_TERRAIN_CELLS * 6;
const MAX_GENOME_ACTIVE_TARGETS = 8;
const MAX_GENOME_ACTIVE_GATES = 8;

const gildedGeometry = new THREE.BoxGeometry(0.78, 0.05, 0.78);
const gildedMaterial = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.48,
  depthWrite: false,
  vertexColors: true,
});
const terrainGeometry = getTerrainCellGeometry();
const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const targetHaloGeometry = new THREE.TorusGeometry(0.48, 0.045, 8, 32);
const targetBudgetGeometry = new THREE.TorusGeometry(0.37, 0.025, 6, 28);
const targetShellGeometry = new THREE.BoxGeometry(0.78, 0.78, 0.78);
const gateRingGeometry = new THREE.TorusGeometry(0.36, 0.07, 8, 32);
const gateCoreGeometry = new THREE.OctahedronGeometry(0.16, 0);

const gildedMatrix = new THREE.Matrix4();
const terrainMatrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const identity = new THREE.Quaternion();
const rotation = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const scale = new THREE.Vector3(1, 1, 1);
const color = new THREE.Color();

const sealMaterial = new THREE.MeshStandardMaterial({
  color: '#33483f',
  emissive: '#77d39a',
  emissiveIntensity: 0.22,
  metalness: 0.08,
  roughness: 0.78,
});
const scarMaterial = new THREE.MeshStandardMaterial({
  color: '#352b50',
  emissive: '#a855f7',
  emissiveIntensity: 0.34,
  metalness: 0.24,
  roughness: 0.58,
});
const runeMaterial = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  toneMapped: false,
  vertexColors: true,
});

const TERRAIN_STRAIN = {
  coilkeeper_seal: 'FERAL',
  phase_gate_scar: 'FLUX',
} as const;

const TERRAIN_HEIGHT = 0.74;
const TERRAIN_FOOTPRINT = 0.94;
const RUNE_HEIGHT = 0.045;

export const GENOME_TARGET_COLORS: Record<GenomeV2BoardTarget['kind'], string> = {
  crown_future: '#f0abfc',
  gold_trail: '#f5c542',
  live_wire: '#67e8f9',
  circuit_run: '#a78bfa',
  coilkeeper: '#a3e635',
  wall_rush: '#3f8cff',
  phase_gate: '#c084fc',
};

function writeMatrix(
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  quaternion = identity
): void {
  position.set(x, y, z);
  scale.set(sx, sy, sz);
  terrainMatrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, terrainMatrix);
}

/**
 * Lethal Genome terrain uses the arena's raised-solid grammar but retains its
 * cause: a green FERAL seal or a violet FLUX scar. One cell is one base mesh;
 * the bright top rune is never allowed to substitute for the solid volume.
 */
function GenomePermanentTerrain({
  terrain,
}: {
  terrain: GenomeV2BoardProjection['permanentTerrain'];
}) {
  const sealRef = useRef<THREE.InstancedMesh>(null);
  const scarRef = useRef<THREE.InstancedMesh>(null);
  const runeRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const seal = sealRef.current;
    const scar = scarRef.current;
    const rune = runeRef.current;
    if (!seal || !scar || !rune) return;
    let sealCount = 0;
    let scarCount = 0;
    let runeCount = 0;

    const addRune = (
      source: GenomeV2BoardTerrainSource,
      x: number,
      z: number
    ) => {
      const strokes = genomeRuneEngravingStrokes(TERRAIN_STRAIN[source]);
      for (const stroke of strokes) {
        if (runeCount >= MAX_GENOME_TERRAIN_RUNES) break;
        const dx = stroke.x2 - stroke.x1;
        const dz = stroke.z2 - stroke.z1;
        const length = Math.hypot(dx, dz);
        const centerX = x + (stroke.x1 + stroke.x2) / 2;
        const centerZ = z + (stroke.z1 + stroke.z2) / 2;
        rotation.setFromAxisAngle(yAxis, Math.atan2(-dz, dx));
        writeMatrix(
          rune,
          runeCount,
          centerX,
          FLOOR_CLEARANCE + TERRAIN_HEIGHT + RUNE_HEIGHT / 2 + 0.006,
          centerZ,
          length,
          RUNE_HEIGHT,
          stroke.width,
          rotation
        );
        color.set(STRAINS[TERRAIN_STRAIN[source]].color);
        rune.setColorAt(runeCount, color);
        runeCount += 1;
      }
    };

    for (const cell of terrain) {
      const x = cell.x + 0.5;
      const z = cell.z + 0.5;
      const mesh = cell.source === 'phase_gate_scar' ? scar : seal;
      const index = cell.source === 'phase_gate_scar'
        ? scarCount++
        : sealCount++;
      if (index >= MAX_GENOME_TERRAIN_CELLS) continue;
      writeMatrix(
        mesh,
        index,
        x,
        FLOOR_CLEARANCE + TERRAIN_HEIGHT / 2,
        z,
        TERRAIN_FOOTPRINT,
        TERRAIN_HEIGHT,
        TERRAIN_FOOTPRINT
      );
      addRune(cell.source, x, z);
    }

    seal.count = Math.min(sealCount, MAX_GENOME_TERRAIN_CELLS);
    scar.count = Math.min(scarCount, MAX_GENOME_TERRAIN_CELLS);
    rune.count = Math.min(runeCount, MAX_GENOME_TERRAIN_RUNES);
    seal.instanceMatrix.needsUpdate = true;
    scar.instanceMatrix.needsUpdate = true;
    rune.instanceMatrix.needsUpdate = true;
    if (rune.instanceColor) rune.instanceColor.needsUpdate = true;
  }, [terrain]);

  return (
    <group data-testid="genome-v2-permanent-terrain">
      <instancedMesh
        ref={sealRef}
        args={[terrainGeometry, sealMaterial, MAX_GENOME_TERRAIN_CELLS]}
        frustumCulled={false}
        receiveShadow
      />
      <instancedMesh
        ref={scarRef}
        args={[terrainGeometry, scarMaterial, MAX_GENOME_TERRAIN_CELLS]}
        frustumCulled={false}
        receiveShadow
      />
      <instancedMesh
        ref={runeRef}
        args={[unitBoxGeometry, runeMaterial, MAX_GENOME_TERRAIN_RUNES]}
        frustumCulled={false}
      />
    </group>
  );
}

function TargetSigil({ target, colorValue }: {
  target: GenomeV2BoardTarget;
  colorValue: string;
}) {
  if (target.kind === 'crown_future') {
    return (
      <group rotation-y={Math.PI / 4}>
        <mesh geometry={unitBoxGeometry} scale={[0.38, 0.07, 0.07]}>
          <meshBasicMaterial color={colorValue} transparent opacity={0.5} toneMapped={false} />
        </mesh>
        <mesh geometry={unitBoxGeometry} scale={[0.07, 0.07, 0.38]}>
          <meshBasicMaterial color={colorValue} transparent opacity={0.5} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  if (target.kind === 'gold_trail' && target.branchChoice === 'ordinary') {
    return (
      <mesh geometry={unitBoxGeometry} scale={[0.24, 0.24, 0.24]}>
        <meshBasicMaterial
          color={colorValue}
          wireframe
          toneMapped={false}
        />
      </mesh>
    );
  }
  if (target.kind === 'gold_trail' && target.branchChoice === 'gilded') {
    return (
      <group rotation-y={Math.PI / 4}>
        <mesh geometry={gateCoreGeometry} scale={1.35}>
          <meshBasicMaterial color={colorValue} toneMapped={false} />
        </mesh>
        <mesh geometry={targetHaloGeometry} rotation-x={Math.PI / 2} scale={0.48}>
          <meshBasicMaterial
            color={colorValue}
            transparent
            opacity={0.82}
            toneMapped={false}
          />
        </mesh>
      </group>
    );
  }
  if (target.kind === 'live_wire') {
    return (
      <group rotation-z={-0.35}>
        <mesh geometry={unitBoxGeometry} position={[-0.1, 0.12, 0]} scale={[0.1, 0.28, 0.08]}>
          <meshBasicMaterial color={colorValue} toneMapped={false} />
        </mesh>
        <mesh geometry={unitBoxGeometry} position={[0.1, -0.12, 0]} scale={[0.1, 0.28, 0.08]}>
          <meshBasicMaterial color={colorValue} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  if (target.kind === 'circuit_run') {
    return (
      <group>
        {[-0.18, 0.18].map((x) => (
          <mesh key={x} position={[x, 0, 0]} geometry={gateCoreGeometry}>
            <meshBasicMaterial color={colorValue} toneMapped={false} />
          </mesh>
        ))}
        <mesh geometry={unitBoxGeometry} scale={[0.32, 0.045, 0.045]}>
          <meshBasicMaterial color={colorValue} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  if (target.kind === 'wall_rush') {
    return (
      <group rotation-z={Math.PI / 4}>
        <mesh geometry={unitBoxGeometry} scale={[0.34, 0.07, 0.07]}>
          <meshBasicMaterial color={colorValue} toneMapped={false} />
        </mesh>
        <mesh geometry={unitBoxGeometry} position={[0.2, 0.11, 0]} rotation-z={-Math.PI / 4} scale={[0.2, 0.07, 0.07]}>
          <meshBasicMaterial color={colorValue} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  return (
    <mesh geometry={gateCoreGeometry} rotation-y={Math.PI / 4}>
      <meshBasicMaterial color={colorValue} wireframe={target.kind === 'phase_gate'} toneMapped={false} />
    </mesh>
  );
}

function GenomeTargetMarker({ target }: { target: GenomeV2BoardTarget }) {
  const canonical =
    target.branchChoice === 'ordinary'
      ? '#e2e8f0'
      : GENOME_TARGET_COLORS[target.kind];
  const colorValue = target.budgetExpired ? '#fb7185' : canonical;
  const budgetScale = target.budgetFraction === null
    ? 1
    : Math.max(0.12, target.budgetFraction);
  const ghost = target.kind === 'crown_future';
  return (
    <group
      position={[target.cell.x + 0.5, FLOOR_CLEARANCE + 0.055, target.cell.z + 0.5]}
      userData={{
        targetId: target.targetId,
        branchChoice: target.branchChoice,
        status: target.statusLabel,
        edible: target.edible,
        collidable: target.collidable,
      }}
    >
      <mesh geometry={targetHaloGeometry} rotation-x={Math.PI / 2}>
        <meshBasicMaterial
          color={colorValue}
          transparent
          opacity={ghost ? 0.28 : 0.78}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        geometry={targetBudgetGeometry}
        rotation-x={Math.PI / 2}
        scale={[budgetScale, budgetScale, 1]}
      >
        <meshBasicMaterial
          color={colorValue}
          transparent
          opacity={target.budgetExpired ? 0.38 : 0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        geometry={targetShellGeometry}
        position-y={ghost ? 0.38 : 0.32}
        rotation-y={Math.PI / 4}
      >
        <meshBasicMaterial
          color={colorValue}
          wireframe
          transparent
          opacity={ghost ? 0.24 : target.budgetExpired ? 0.32 : 0.58}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group position={[0, ghost ? 0.82 : 0.78, 0]}>
        <TargetSigil target={target} colorValue={colorValue} />
      </group>
    </group>
  );
}

function PhaseGateMarker({
  cell,
  role,
}: {
  cell: { x: number; z: number };
  role: 'entry' | 'exit';
}) {
  const colorValue = role === 'entry' ? '#c084fc' : '#67e8f9';
  return (
    <group
      position={[cell.x + 0.5, FLOOR_CLEARANCE + 0.46, cell.z + 0.5]}
      userData={{ genomeGate: role }}
    >
      <mesh geometry={gateRingGeometry}>
        <meshBasicMaterial
          color={colorValue}
          transparent
          opacity={0.82}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={gateCoreGeometry} scale={role === 'entry' ? 1 : 0.72}>
        <meshBasicMaterial
          color={colorValue}
          wireframe={role === 'exit'}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={unitBoxGeometry} position-y={-0.42} scale={[0.58, 0.025, 0.58]} rotation-y={Math.PI / 4}>
        <meshBasicMaterial
          color={colorValue}
          transparent
          opacity={0.36}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export interface GenomeBoardEffectsProps {
  gildedCells: readonly { x: number; z: number; ticks: number }[];
  genomeV2?: GenomeV2BoardProjection | null;
}

/**
 * Every Genome-created board fact has a picture here. Legacy gilded wake
 * remains unchanged; v2 targets surround the ordinary food beacon instead of
 * replacing its learned silhouette, gates are visible before traversal, and
 * every permanent lethal seal/scar is a raised solid with a causal rune.
 */
export function GenomeBoardEffects({
  gildedCells,
  genomeV2 = null,
}: GenomeBoardEffectsProps) {
  const gildedRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = gildedRef.current;
    if (!mesh) return;
    const count = Math.min(gildedCells.length, MAX_GILDED_CELLS);
    for (let index = 0; index < count; index++) {
      const cell = gildedCells[index];
      position.set(cell.x + 0.5, 0.035, cell.z + 0.5);
      gildedMatrix.compose(position, identity, scale.set(1, 1, 1));
      mesh.setMatrixAt(index, gildedMatrix);
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
      {genomeV2 ? (
        <>
          <GenomePermanentTerrain terrain={genomeV2.permanentTerrain} />
          {genomeV2.targets.slice(0, MAX_GENOME_ACTIVE_TARGETS).map((target) => (
            <GenomeTargetMarker
              key={`${target.targetId}:${target.branchChoice ?? target.leg}`}
              target={target}
            />
          ))}
          {genomeV2.gates.slice(0, MAX_GENOME_ACTIVE_GATES).map((gate) => (
            <group key={gate.targetId}>
              <PhaseGateMarker cell={gate.entry} role="entry" />
              <PhaseGateMarker cell={gate.exit} role="exit" />
            </group>
          ))}
        </>
      ) : null}
    </group>
  );
}

export default GenomeBoardEffects;
