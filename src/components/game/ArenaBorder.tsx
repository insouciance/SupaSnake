'use client';

/**
 * ArenaBorder - the wall around the arena, which is the SLAB'S RIM.
 *
 * PASS 4, OWNER RULING: the borders "were left untouched by the earlier passes
 * and are now out of language... the wall should read as the slab's raised RIM
 * or its EDGE - stone-family material, ink-hulled like everything else on the
 * board. Not machined graphite, not a neon fence."
 *
 * Pass 3 had already deleted the corner pylons and put an ink outline on the
 * rails, but the rail itself was still LIGHT: its albedo was the dynasty
 * colour, its emissive was the same colour again at 0.42, and four additive
 * strips ran along the tops. Three light sources describing one curb. Against
 * a stone tile that is a fence with the tile drawn behind it.
 *
 * So the rail is now made of the tile. Its albedo is the slab's rim stone,
 * pulled a fifth of the way toward the dynasty colour so PRIMAL's curb is
 * green-cast slate and CYBER's is blue-cast slate without either becoming a
 * light. The dynasty survives as a QUIET emissive in the stone, scaled to a
 * fifth of what the profiles ask for - enough that the resting pulse still
 * carries the "these edges kill" signal, low enough that the rim never crosses
 * the bloom threshold. The four additive strips are deleted: a curb with real
 * height, an ink outline and a raised top face does not need a light to be
 * read as a wall, and deleting them is four fewer draw calls.
 *
 * The curb is also CHUNKIER - roughly 3x the width and 1.8x the height of the
 * cockpit's old rail. A rim is a piece of the tile; a rail was a wire.
 *
 * COSMIC's torus (WP-3.13): the rim IS the "these edges do not kill" signal -
 * dim, translucent, and PERMANENTLY so. The edge barely exists, because on
 * COSMIC it barely does.
 *
 * This replaced a four-state animation driven by the wall-phase cycle
 * (open / closing-telegraph / closed / opening-telegraph, in rose). The
 * cycle is gone, and its visual is gone with it: a rail that changes state
 * is a rail whose meaning has to be re-read, and the reason the wrap was
 * unlearnable was that its rule kept changing. One rail state, one rule.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createInkHullMaterial, getToonGradientMap } from './screen/inkAmber';
import { ARENA_STONE } from './screen/gameScreenTokens';

/** The rim wears the board's ink, exactly as the snake does. */
const railHullMaterial = createInkHullMaterial();
const railGeometry = new THREE.BoxGeometry(1, 1, 1);

/**
 * How much of the profile's emissive intensity the stone rim keeps.
 *
 * The profiles were authored when the rail's own albedo was the dynasty
 * colour and the number had to compete with an additive strip on top of it.
 * On stone, 0.42 of ELECTRIC_BLUE adds about 0.42 of linear blue to a curb
 * whose lit albedo is 0.06 - i.e. the stone disappears and a light remains.
 * A tenth of it lands the PRIMAL rim, measured, near rgb(55,71,55) -
 * unmistakably a green-cast stone, and far under the 0.68 bloom threshold, so
 * the rim stops glowing at the exact moment it stopped being a light.
 *
 * The resting pulse survives at this scale but is very quiet, because the
 * profiles' amplitudes are themselves tiny (PRIMAL asks for 0.035). The "these
 * edges kill" signal now rests mostly on the curb being a solid, outlined,
 * raised object rather than on it breathing - which is the stronger cue, and
 * the one a player reads at speed.
 */
const RIM_EMISSIVE_SCALE = 0.1;

/**
 * How far the rim stone is pulled toward the dynasty colour, PERCEPTUALLY.
 *
 * The mix has to happen in sRGB, not in the linear working space THREE.Color
 * stores. PRIMAL's rim colour is #c8f57d, which is 0.57/0.93/0.22 linear
 * against slate's 0.02/0.03/0.05: an 18% linear lerp toward it is a ~75%
 * perceptual jump, and the first render of this pass came back with a bright
 * olive frame around the board instead of a green-cast stone. Converted back
 * to sRGB the same 12% lands where the eye expects it - slate that has taken
 * the dynasty's cast, which is what a tinted stone looks like.
 */
const RIM_DYNASTY_TINT = 0.09;

/** Slate pulled `RIM_DYNASTY_TINT` toward a dynasty colour, mixed in sRGB. */
function rimStoneColor(dynastyColor: string): THREE.Color {
  const stone = new THREE.Color(ARENA_STONE.rim).convertLinearToSRGB();
  const dynasty = new THREE.Color(dynastyColor).convertLinearToSRGB();
  return stone.lerp(dynasty, RIM_DYNASTY_TINT).convertSRGBToLinear();
}

interface ArenaBorderProps {
  /** Grid size (default 20) */
  gridSize?: number;
  /** Dynasty colour the rim stone is cast and lit with */
  color?: string;
  /** Emissive intensity, before RIM_EMISSIVE_SCALE */
  emissiveIntensity?: number;
  /** True on a dynasty whose edges wrap instead of killing (COSMIC). */
  torus?: boolean;
  /** Physical rim dimensions. */
  railHeight?: number;
  railWidth?: number;
  /** Resting rim pulse values, before RIM_EMISSIVE_SCALE. */
  restingEmissiveIntensity?: number;
  restingPulseAmplitude?: number;
}

/**
 * One outlined rim course.
 *
 * Module scope, not a closure inside `ArenaBorder`. A component declared in a
 * render body is a NEW component type on every render, so React unmounts and
 * remounts all four courses - which on this tree means four mesh pairs torn
 * down and rebuilt whenever any prop changes. The materials it needs are
 * module singletons except the animated one, so the only thing that has to
 * travel is that.
 */
function Rail({
  position,
  scale,
  material,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  material: THREE.Material;
}) {
  return (
    <mesh
      geometry={railGeometry}
      material={material}
      position={position}
      scale={scale}
      castShadow
    >
      {/* The hull is a CHILD so it inherits the course's scale for free. */}
      <mesh geometry={railGeometry} material={railHullMaterial} renderOrder={-1} />
    </mesh>
  );
}

export function ArenaBorder({
  gridSize = 20,
  color = '#22d3ee',
  emissiveIntensity = 0.5,
  torus = false,
  railHeight = 0.24,
  railWidth = 0.32,
  restingEmissiveIntensity = 0.4,
  restingPulseAmplitude = 0.15,
}: ArenaBorderProps) {
  // One shared material - the pulse mutates one material per frame instead
  // of walking every child mesh. Toon, so the rim bands like the tile it is
  // cut from.
  const railMaterial = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: rimStoneColor(color),
        emissive: color,
        emissiveIntensity: emissiveIntensity * RIM_EMISSIVE_SCALE,
        gradientMap: getToonGradientMap(),
        // transparent so COSMIC's torus can thin the rim out; opacity
        // stays 1 on the dynasties whose walls kill
        transparent: true,
        opacity: 1,
      }),
    // emissiveIntensity is animated below; only color changes rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color]
  );

  // Precomputed color so the per-frame branch never allocates
  const baseRailColor = useMemo(() => new THREE.Color(color), [color]);

  useEffect(() => {
    return () => {
      railMaterial.dispose();
    };
  }, [railMaterial]);

  // Subtle pulse animation - no allocations, a few material writes per
  // frame. The torus thins the rim out permanently (see header).
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    railMaterial.emissive.copy(baseRailColor);
    if (torus) {
      // The edge barely exists, and never stops barely existing.
      railMaterial.opacity = 0.35;
      railMaterial.emissiveIntensity =
        (0.12 + Math.sin(t * 1.5) * 0.05) * RIM_EMISSIVE_SCALE;
    } else {
      railMaterial.opacity = 1;
      railMaterial.emissiveIntensity =
        (restingEmissiveIntensity + Math.sin(t * 2) * restingPulseAmplitude) *
        RIM_EMISSIVE_SCALE;
    }
  });

  const y = railHeight / 2;

  return (
    <group>
      {/* South course (Z = 0) */}
      <Rail
        material={railMaterial}
        position={[gridSize / 2, y, -railWidth / 2]}
        scale={[gridSize + railWidth * 2, railHeight, railWidth]}
      />

      {/* North course (Z = gridSize) */}
      <Rail
        material={railMaterial}
        position={[gridSize / 2, y, gridSize + railWidth / 2]}
        scale={[gridSize + railWidth * 2, railHeight, railWidth]}
      />

      {/* West course (X = 0) */}
      <Rail
        material={railMaterial}
        position={[-railWidth / 2, y, gridSize / 2]}
        scale={[railWidth, railHeight, gridSize]}
      />

      {/* East course (X = gridSize) */}
      <Rail
        material={railMaterial}
        position={[gridSize + railWidth / 2, y, gridSize / 2]}
        scale={[railWidth, railHeight, gridSize]}
      />
    </group>
  );
}

export default ArenaBorder;
