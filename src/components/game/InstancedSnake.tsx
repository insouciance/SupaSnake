'use client';

/**
 * InstancedSnake - the whole snake in two draw calls.
 *
 * Body = ONE InstancedMesh (DynamicDrawUsage, frustumCulled off, instance
 * count written per frame straight from the interpolation buffer - growth
 * never touches React). Head = its own mesh with voxel eyes (the
 * SpecimenChamber "this is a creature" signal brought onto the board) and
 * a damped yaw that leans into turns instead of snapping.
 *
 * Fluidity contract:
 * - Positions come from the tick-alpha interpolation buffer every frame:
 *   exact blend between the last two authoritative engine states.
 * - ZERO per-frame allocations: all scratch objects (Vector3/Quaternion/
 *   Matrix4) live at module scope; the loop only writes.
 * - No React state anywhere in the render loop; segment growth shows up
 *   purely as a larger `mesh.count` next frame.
 * - Geometry comes from the shared GLB WeakMap cache and materials from
 *   the shared per-dynasty Map cache in SnakeModel.tsx - nothing new is
 *   created per mount beyond the InstancedMesh itself.
 *
 * The GLB Suspense fallback (InstancedSnakeFallback) shares this exact
 * Core with unit-box geometry, so the streaming swap changes shading only,
 * never structure or behavior.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import type { Direction } from '@/lib/game/SnakeGameLogic';
import {
  getAlpha,
  getInterpolatedX,
  getInterpolatedZ,
  INTERPOLATION_CAPACITY,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import {
  BODY_SIZE,
  HEAD_SIZE,
  SNAKE_MODEL_URL,
  getSegmentEnergy,
  getSegmentScale,
  getSnakeGeometries,
  getSnakeSegmentMaterial,
} from './SnakeModel';

export interface InstancedSnakeProps {
  /** The tick-alpha interpolation buffer ref (owned by the game page). */
  bufferRef: { readonly current: InterpolationBuffer | null };
  dynasty: DynastyId;
  /** Committed heading - drives the head's damped yaw. */
  direction: Direction;
}

// -----------------------------------------------------------------------------
// Module-scope scratch + shared assets: the render loop allocates NOTHING
// -----------------------------------------------------------------------------

const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quaternion = new THREE.Quaternion(); // identity - segments never rotate
const _matrix = new THREE.Matrix4();
const _energyColor = new THREE.Color();

/**
 * Instanced-body material per dynasty: a clone of the shared body material
 * with two eye-comfort adjustments -
 * 1. albedo trimmed so the moving trunk sits safely UNDER the bloom
 *    threshold (only head/food/portal/glow strips may bloom; a blooming
 *    trunk is a flicker amplifier in motion), and
 * 2. an emissive shader patch that multiplies emissive by the per-instance
 *    color, so the energy falloff (getSegmentEnergy) cools BOTH albedo and
 *    glow toward the tail. The trunk itself is otherwise perfectly steady:
 *    no time-varying material writes on body segments, ever.
 */
const instancedBodyMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function getInstancedBodyMaterial(dynasty: DynastyId): THREE.MeshStandardMaterial {
  let material = instancedBodyMaterialCache.get(dynasty);
  if (!material) {
    material = getSnakeSegmentMaterial(dynasty, false).clone();
    material.color.multiplyScalar(0.75);
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
          '#ifdef USE_INSTANCING_COLOR\n' +
          '\ttotalEmissiveRadiance *= vColor;\n' +
          '#endif'
      );
    };
    instancedBodyMaterialCache.set(dynasty, material);
  }
  return material;
}

/** Shared unit box for the pre-GLB fallback (same idea as SnakeModel's). */
const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

/** Eye pieces - the SpecimenChamber pattern, shared across mounts. */
const eyeGeometry = new THREE.BoxGeometry(1, 1, 1);
const eyeDarkMaterial = new THREE.MeshBasicMaterial({ color: '#06090d' });
const eyeGlintMaterial = new THREE.MeshBasicMaterial({ color: '#e6edf3' });

/**
 * Yaw that points the head's face (+Z local: the eyes' side) along each
 * grid heading. rotation.y = t maps local +Z to (sin t, 0, cos t).
 */
const HEAD_FACE_YAW: Record<Direction, number> = {
  UP: Math.PI, // -Z
  DOWN: 0, // +Z
  LEFT: -Math.PI / 2, // -X
  RIGHT: Math.PI / 2, // +X
};

const TWO_PI = Math.PI * 2;

/** Damping rate for the head yaw (higher = snappier). */
const YAW_DAMP = 14;

/**
 * Eyes on the head's forward face - parented inside the head mesh so its
 * scale and damped yaw carry them (positions in unit-head-local space,
 * mirroring SpecimenChamber's SpecimenEyes).
 */
function SnakeEyes() {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.22, 0.16, 0.51]}>
          <mesh geometry={eyeGeometry} material={eyeDarkMaterial} scale={0.16} />
          <mesh
            geometry={eyeGeometry}
            material={eyeGlintMaterial}
            scale={0.055}
            position={[0.035, 0.04, 0.045]}
          />
        </group>
      ))}
    </group>
  );
}

// -----------------------------------------------------------------------------
// Core - shared by the GLB and fallback variants
// -----------------------------------------------------------------------------

interface InstancedSnakeCoreProps extends InstancedSnakeProps {
  headGeometry: THREE.BufferGeometry;
  bodyGeometry: THREE.BufferGeometry;
}

function InstancedSnakeCore({
  bufferRef,
  dynasty,
  direction,
  headGeometry,
  bodyGeometry,
}: InstancedSnakeCoreProps) {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.Group>(null);
  const yawRef = useRef(HEAD_FACE_YAW[direction]);
  // Energy-falloff cache: instance colors only rewrite when length changes
  const lastEnergyCountRef = useRef(-1);

  const headMaterial = getSnakeSegmentMaterial(dynasty, true);
  const bodyMaterial = getInstancedBodyMaterial(dynasty);

  // One-time GPU hints: the instance matrices stream every frame, and the
  // whole arena is always on screen - skip per-frame culling math.
  useEffect(() => {
    const mesh = instancedRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    lastEnergyCountRef.current = -1;
  }, [bodyGeometry]);

  useFrame((_, delta) => {
    const buffer = bufferRef.current;
    const mesh = instancedRef.current;
    const head = headRef.current;
    if (!buffer || !mesh || !head) return;

    const count = buffer.count;
    const alpha = getAlpha(buffer, performance.now());

    // Body: segments 1..count-1 as instances (segment 0 is the head mesh)
    for (let i = 1; i < count; i++) {
      _position.set(
        getInterpolatedX(buffer, i, alpha) + 0.5,
        0.5,
        getInterpolatedZ(buffer, i, alpha) + 0.5
      );
      const s = BODY_SIZE * getSegmentScale(i, count);
      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(i - 1, _matrix);
    }
    mesh.count = Math.max(0, count - 1);
    mesh.instanceMatrix.needsUpdate = true;

    // Energy falloff (eye comfort): bright near the head, cooling toward
    // the tail. Written only when the snake's length changes - the trunk's
    // look is otherwise perfectly steady frame to frame.
    if (
      count !== lastEnergyCountRef.current ||
      (count > 1 && mesh.instanceColor === null)
    ) {
      lastEnergyCountRef.current = count;
      for (let i = 1; i < count; i++) {
        _energyColor.setScalar(getSegmentEnergy(i, count));
        mesh.setColorAt(i - 1, _energyColor);
      }
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    // Head: interpolated position + damped yaw toward the heading
    if (count > 0) {
      head.visible = true;
      head.position.set(
        getInterpolatedX(buffer, 0, alpha) + 0.5,
        0.5,
        getInterpolatedZ(buffer, 0, alpha) + 0.5
      );
      const target = HEAD_FACE_YAW[direction];
      // Shortest-path wrap into [-PI, PI), then exponential damp
      let diff = (target - yawRef.current) % TWO_PI;
      if (diff > Math.PI) diff -= TWO_PI;
      if (diff < -Math.PI) diff += TWO_PI;
      yawRef.current += diff * (1 - Math.exp(-YAW_DAMP * delta));
      head.rotation.y = yawRef.current;
    } else {
      head.visible = false;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={instancedRef}
        args={[bodyGeometry, bodyMaterial, INTERPOLATION_CAPACITY]}
        frustumCulled={false}
        castShadow
      />
      <group ref={headRef} visible={false}>
        <mesh
          geometry={headGeometry}
          material={headMaterial}
          scale={HEAD_SIZE}
          castShadow
        >
          <SnakeEyes />
        </mesh>
      </group>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Public variants
// -----------------------------------------------------------------------------

/** GLB-backed snake. Suspends while the voxel model streams in - wrap in
 *  <Suspense fallback={<InstancedSnakeFallback ... />}>. */
export function InstancedSnake(props: InstancedSnakeProps) {
  const { scene } = useGLTF(SNAKE_MODEL_URL);
  const { head, body } = getSnakeGeometries(scene);
  return (
    <InstancedSnakeCore
      {...props}
      headGeometry={head ?? unitBoxGeometry}
      bodyGeometry={body ?? unitBoxGeometry}
    />
  );
}

/** Instant procedural stand-in (unit boxes, same shared materials) so the
 *  run never blocks on asset load; identical Core, identical behavior. */
export function InstancedSnakeFallback(props: InstancedSnakeProps) {
  return (
    <InstancedSnakeCore
      {...props}
      headGeometry={unitBoxGeometry}
      bodyGeometry={unitBoxGeometry}
    />
  );
}

useGLTF.preload(SNAKE_MODEL_URL);
