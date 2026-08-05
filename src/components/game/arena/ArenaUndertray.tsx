'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import type { StrainId } from '@/shared/game/strains';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';
import { genomeRuneEngravingStrokes } from '@/components/game/screen/gameRuneStrokes';

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
 * ONE draw remains, and it does work no other object does:
 *
 *   RUNE   the north mark. One instanced Genome engraving on the slab's apron,
 *          which is unambiguous orientation in a way the four deleted corner
 *          diamonds never were - one mark tells you which way you are facing,
 *          four identical ones tell you nothing.
 *
 * The float halo lived here too and has moved to `ArenaFloor`. It is a
 * property of the SLAB - the cue that says the tile is floating - and this
 * component is mounted only by the cockpit assembly, so hosting it here left
 * the released rollback path drawing a tile with nothing under it. It also had
 * to hardcode `SLAB_APRON.cockpit` to guess a span it did not own.
 *
 * No lights, no per-frame work; all geometry stays outside the 20x20 bounds.
 */
export function ArenaUndertray({ gridSize, dynasty }: ArenaUndertrayProps) {
  const orientationRef = useRef<THREE.InstancedMesh>(null);
  const profile = getGameMaterialProfile(dynasty);

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
      orientationMaterial.dispose();
    };
  }, [orientationMaterial]);

  return (
    <group>
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
