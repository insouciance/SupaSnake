'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import type { StrainId } from '@/shared/game/strains';
import { ARENA_STONE } from '@/components/game/screen/gameScreenTokens';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';
import { genomeRuneEngravingStrokes } from '@/components/game/screen/gameRuneStrokes';
import { SLAB_APRON, SLAB_THICKNESS } from '@/components/game/ArenaFloor';

interface ArenaUndertrayProps {
  gridSize: number;
  dynasty: DynastyId;
}

const orientationGeometry = new THREE.BoxGeometry(1, 1, 1);
const MAX_ORIENTATION_STROKES = 5;

const DYNASTY_ORIENTATION_RUNE: Record<DynastyId, StrainId> = {
  CYBER: 'VOLT',
  PRIMAL: 'FERAL',
  COSMIC: 'FLUX',
};

export interface ArenaOrientationStrokeLayout {
  readonly x: number;
  readonly z: number;
  readonly length: number;
  readonly width: number;
  readonly yaw: number;
}

/** Pure layout contract for the functional north marker. Every point remains
 * outside the playable z >= 0 rectangle and inside the undertray silhouette. */
export function arenaOrientationRuneLayout(
  gridSize: number,
  dynasty: DynastyId
): readonly ArenaOrientationStrokeLayout[] {
  const center = gridSize / 2;
  const runeScale = 1.15;
  const runeZ = -0.84;
  return genomeRuneEngravingStrokes(DYNASTY_ORIENTATION_RUNE[dynasty]).map((stroke) => {
    const dx = (stroke.x2 - stroke.x1) * runeScale;
    const dz = (stroke.z2 - stroke.z1) * runeScale;
    return {
      x: center + ((stroke.x1 + stroke.x2) / 2) * runeScale,
      z: runeZ + ((stroke.z1 + stroke.z2) / 2) * runeScale,
      length: Math.hypot(dx, dz),
      width: stroke.width * runeScale,
      yaw: Math.atan2(-dz, dx),
    };
  });
}

/** How far past the slab's own footprint the float halo reaches. */
const HALO_REACH = 1.62;

export const ARENA_HALO_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The float halo: scattered light where a floor would otherwise be.
 *
 * An object "floats in space" when the eye can find the gap between it and
 * anything else. On a black backdrop there is nothing to find - the slab's
 * unlit side face and the void behind it are within a few sRGB levels of each
 * other, so the silhouette dissolves exactly where the thickness is supposed
 * to read. A soft plane of light sitting just under the tile fixes that from
 * both directions at once: it is the ambient occlusion the slab would cast if
 * it were sitting on something, and it is the only thing the dark side face
 * has to be a silhouette AGAINST.
 *
 * It follows the tile's square with a superellipse rather than a disc, is
 * analytic so no bitmap resolution appears when the viewport grows, and is
 * cubed so it hugs the silhouette instead of washing the backdrop. Depth
 * testing does the framing for free: everything under the tile is occluded by
 * the tile, so only the ring outside it is ever seen.
 */
export const ARENA_HALO_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uInner;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    vec2 edgeVector = abs(vUv * 2.0 - vec2(1.0));
    float boardDistance = pow(
      pow(edgeVector.x, 5.0) + pow(edgeVector.y, 5.0),
      1.0 / 5.0
    );
    float glow = smoothstep(1.0, uInner, boardDistance);
    glow = glow * glow * glow;
    gl_FragColor = vec4(uColor, glow * uStrength);
    #include <colorspace_fragment>
  }
`;

/** Build the one-draw, resolution-independent float halo. */
export function createArenaHaloMaterial(
  color: string,
  inner: number,
  strength: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uInner: { value: inner },
      uStrength: { value: strength },
    },
    vertexShader: ARENA_HALO_VERTEX_SHADER,
    fragmentShader: ARENA_HALO_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * What is under and around the slab.
 *
 * PASS 4. THE CHASSIS LIVED HERE, AND IT IS DELETED. A 22.35-wide graphite
 * base plate, four outer lips and their ink hulls - eleven draw calls that
 * described a machine frame around the board. The owner's board is "a fine
 * slab of stone, like a large tile", one object, so the frame is not restyled,
 * it is removed: the slab itself now occupies exactly that footprint (its
 * apron is `SLAB_APRON.cockpit`, which is the camera's frame margin), and what
 * used to be chassis is simply more stone.
 *
 * Two draws remain, and both do work no other object does:
 *
 *   HALO   the float cue. See `ARENA_HALO_FRAGMENT_SHADER`.
 *   RUNE   the north mark. One instanced Genome engraving on the slab's apron,
 *          which is unambiguous orientation in a way the four deleted corner
 *          diamonds never were - one mark tells you which way you are facing,
 *          four identical ones tell you nothing.
 *
 * No lights, no per-frame work; all geometry stays outside the 20x20 bounds.
 */
export function ArenaUndertray({ gridSize, dynasty }: ArenaUndertrayProps) {
  const orientationRef = useRef<THREE.InstancedMesh>(null);
  const profile = getGameMaterialProfile(dynasty);
  const center = gridSize / 2;
  const slabSpan = gridSize + SLAB_APRON.cockpit * 2;
  const haloSpan = slabSpan * HALO_REACH;

  const haloMaterial = useMemo(
    () => createArenaHaloMaterial(ARENA_STONE.halo, 1 / HALO_REACH, 0.28),
    []
  );

  const orientationMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: profile.arena.undertrayCornerColor,
        transparent: true,
        opacity: 0.72,
        toneMapped: false,
      }),
    [profile.arena.undertrayCornerColor]
  );

  useLayoutEffect(() => {
    const mesh = orientationRef.current;
    if (!mesh) return;
    const rune = arenaOrientationRuneLayout(gridSize, dynasty);
    const transform = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    rune.forEach((stroke, index) => {
      rotation.setFromAxisAngle(yAxis, stroke.yaw);
      // The apron is at y = 0, so the mark sits ON the stone rather than on a
      // lip that no longer exists.
      position.set(stroke.x, 0.018, stroke.z);
      scale.set(stroke.length, 0.025, stroke.width);
      transform.compose(position, rotation, scale);
      mesh.setMatrixAt(index, transform);
    });
    mesh.count = rune.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [dynasty, gridSize]);

  useEffect(() => {
    return () => {
      haloMaterial.dispose();
      orientationMaterial.dispose();
    };
  }, [haloMaterial, orientationMaterial]);

  return (
    <group>
      <mesh
        position={[center, -SLAB_THICKNESS * 0.88, center]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={haloMaterial}
      >
        <planeGeometry args={[haloSpan, haloSpan]} />
      </mesh>

      <instancedMesh
        ref={orientationRef}
        args={[
          orientationGeometry,
          orientationMaterial,
          MAX_ORIENTATION_STROKES,
        ]}
        frustumCulled={false}
      />
    </group>
  );
}

export default ArenaUndertray;
