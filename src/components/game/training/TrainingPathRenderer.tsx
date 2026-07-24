'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type {
  TrainingCell,
  TrainingGuidance,
  TrainingScenario,
  TrainingTracePoint,
} from '@/shared/game/training';

const MAX_GUIDE_CELLS = 128;
const MAX_CHECKPOINTS = 32;
const guideGeometry = new THREE.BoxGeometry(0.7, 0.025, 0.7);
const checkpointGeometry = new THREE.TorusGeometry(0.35, 0.055, 8, 20);
const ghostGeometry = new THREE.SphereGeometry(0.24, 12, 8);
const guideMaterial = new THREE.MeshBasicMaterial({
  color: '#67e8f9',
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
});
const checkpointMaterial = new THREE.MeshBasicMaterial({
  color: '#f5c85b',
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
});
const ghostMaterial = new THREE.MeshBasicMaterial({
  color: '#c4b5fd',
  transparent: true,
  opacity: 0.88,
  depthWrite: false,
});
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3(1, 1, 1);
const identity = new THREE.Quaternion();
const ringRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

interface TrainingPathRendererProps {
  scenario: TrainingScenario;
  guidance: TrainingGuidance;
  tick: number;
  progress: number;
  head: TrainingCell | null;
  ghost?: readonly TrainingTracePoint[];
}

function sameCell(a: TrainingCell, b: TrainingCell): boolean {
  return a.x === b.x && a.z === b.z;
}

export function TrainingPathRenderer({
  scenario,
  guidance,
  tick,
  progress,
  head,
  ghost = [],
}: TrainingPathRendererProps) {
  const guideRef = useRef<THREE.InstancedMesh>(null);
  const checkpointRef = useRef<THREE.InstancedMesh>(null);
  const pathCursor = useMemo(() => {
    if (!head) return Math.min(tick, scenario.path.length - 1);
    const exact = scenario.path.findIndex((cell) => sameCell(cell, head));
    return exact >= 0 ? exact : Math.min(tick, scenario.path.length - 1);
  }, [head, scenario.path, tick]);
  const visiblePath = useMemo(() => {
    if (guidance === 'ghost' || guidance === 'none') return [];
    const remaining = scenario.path.slice(pathCursor + 1);
    return guidance === 'next' ? remaining.slice(0, 6) : remaining;
  }, [guidance, pathCursor, scenario.path]);
  const visibleCheckpoints = useMemo(() => {
    if (scenario.exercise === 'route' || scenario.exercise === 'escape') return [];
    return scenario.checkpointIndices
      .slice(progress)
      .map((index) => scenario.path[index])
      .filter(Boolean);
  }, [progress, scenario]);

  useEffect(() => {
    const mesh = guideRef.current;
    if (!mesh) return;
    const count = Math.min(visiblePath.length, MAX_GUIDE_CELLS);
    for (let index = 0; index < count; index += 1) {
      const cell = visiblePath[index];
      position.set(cell.x + 0.5, 0.04, cell.z + 0.5);
      matrix.compose(position, identity, scale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }, [visiblePath]);

  useEffect(() => {
    const mesh = checkpointRef.current;
    if (!mesh) return;
    const count = Math.min(visibleCheckpoints.length, MAX_CHECKPOINTS);
    for (let index = 0; index < count; index += 1) {
      const cell = visibleCheckpoints[index];
      position.set(cell.x + 0.5, 0.075, cell.z + 0.5);
      matrix.compose(position, ringRotation, scale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }, [visibleCheckpoints]);

  const ghostPoints = useMemo(
    () => ghost.map((point) => [point.x + 0.5, 0.12, point.z + 0.5] as [number, number, number]),
    [ghost]
  );
  const ghostHead = useMemo(() => {
    let current: TrainingTracePoint | null = null;
    for (const point of ghost) {
      if (point.tick > tick) break;
      current = point;
    }
    return current;
  }, [ghost, tick]);

  return (
    <group>
      <instancedMesh
        ref={guideRef}
        args={[guideGeometry, guideMaterial, MAX_GUIDE_CELLS]}
        frustumCulled={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={checkpointRef}
        args={[checkpointGeometry, checkpointMaterial, MAX_CHECKPOINTS]}
        frustumCulled={false}
        renderOrder={3}
      />
      {guidance === 'ghost' && ghostPoints.length > 1 && (
        <>
          <Line
            points={ghostPoints}
            color="#c4b5fd"
            lineWidth={1.25}
            transparent
            opacity={0.48}
            depthWrite={false}
          />
          {ghostHead && (
            <mesh
              geometry={ghostGeometry}
              material={ghostMaterial}
              position={[ghostHead.x + 0.5, 0.24, ghostHead.z + 0.5]}
              renderOrder={4}
            />
          )}
        </>
      )}
    </group>
  );
}

export default TrainingPathRenderer;
