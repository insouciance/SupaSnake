import * as THREE from 'three';

/**
 * INK & AMBER - the board's shared material vocabulary.
 *
 * Three primitives, all built from stock three.js:
 *
 * 1. `createInkHullMaterial` - the inverted-hull outline. A second copy of the
 *    same geometry rendered `BackSide` and pushed out along its own normals in
 *    the vertex shader. On an instanced mesh that is +1 draw call for the whole
 *    object, not one per instance.
 * 2. `getToonGradientMap` - a 3-texel nearest-filtered ramp. Hard bands, so a
 *    lit surface reads as drawn rather than rendered.
 * 3. `createLightTarget` - an explicit `DirectionalLight.target`. Three's
 *    default target is the world origin, which is a *corner* of this board, not
 *    its centre; every rig on the board needs its own.
 *
 * The rounded-box geometry these run over (`gameRenderGeometry.ts`) writes
 * analytic radial normals at every vertex, including the chamfers, so the hull
 * expansion is continuous and the outline does not split at silhouette corners.
 */

/** Outline, pupils, deepest shadow. Deeper than void-deep on purpose. */
export const INK = '#0b1118';

/**
 * Hull expansion, in board cells, applied in WORLD space.
 *
 * The default camera frames roughly 20.7 world units over the viewport height,
 * so at a 900px-tall viewport one cell is ~43px and 0.058 reads as a ~2.5px
 * line. Because the shader divides the offset by the object's world scale, a
 * 0.26-high vacancy voxel and a 0.86-high head carry exactly the same line
 * weight - which is the whole point of an ink outline and is not achievable by
 * scaling the hull.
 *
 * Pass 3, owner ruling: "the bold black outlines look really good esp when
 * coiling up... just a little bit bolder would work even better." 0.045 ->
 * 0.058 is +29%, which is one visible step at desk scale and still under half a
 * pixel of change on the tightest phone - deliberately short of the weight
 * where neighbouring coil segments start to merge into one black mass, which is
 * the failure mode a bolder line actually has.
 */
export const INK_HULL_WIDTH = 0.058;

const INK_HULL_VERTEX_PATCH = [
  '#include <begin_vertex>',
  '{',
  '  vec3 inkScale = vec3(',
  '    length( modelMatrix[ 0 ].xyz ),',
  '    length( modelMatrix[ 1 ].xyz ),',
  '    length( modelMatrix[ 2 ].xyz )',
  '  );',
  '  #ifdef USE_INSTANCING',
  '    inkScale *= vec3(',
  '      length( instanceMatrix[ 0 ].xyz ),',
  '      length( instanceMatrix[ 1 ].xyz ),',
  '      length( instanceMatrix[ 2 ].xyz )',
  '    );',
  '  #endif',
  '  transformed += normalize( normal ) / max( inkScale, vec3( 1e-4 ) ) * uInkHullWidth;',
  '}',
].join('\n');

/**
 * A hard dark outline for one board object.
 *
 * Render it as a sibling (or child, when the object animates its own transform)
 * of the mesh it outlines, sharing the identical geometry. Depth testing does
 * the rest: the hull's back faces sit behind the object everywhere except at
 * the silhouette, where they become the line.
 */
export function createInkHullMaterial(
  width: number = INK_HULL_WIDTH
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: INK,
    side: THREE.BackSide,
    // Ink is a drawn value, not a lit one. Tone mapping must not lift it.
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uInkHullWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uInkHullWidth;\nvoid main() {')
      .replace('#include <begin_vertex>', INK_HULL_VERTEX_PATCH);
  };
  return material;
}

let toonGradientMap: THREE.DataTexture | null = null;

/**
 * Three bands: shadow, mid, light. Nearest filtering is what makes the step
 * hard - a hard edge is a decision and a gradient is an accident.
 */
export function getToonGradientMap(): THREE.DataTexture {
  if (!toonGradientMap) {
    // The top band deliberately stops short of 255: at full white a lit
    // surface clips and a flat fill loses the hue it exists to carry. Three
    // bands of COLOUR, not two bands and a sheet of paper.
    const bands = new Uint8Array([72, 150, 214]);
    toonGradientMap = new THREE.DataTexture(
      bands,
      bands.length,
      1,
      THREE.RedFormat
    );
    toonGradientMap.minFilter = THREE.NearestFilter;
    toonGradientMap.magFilter = THREE.NearestFilter;
    toonGradientMap.generateMipmaps = false;
    toonGradientMap.needsUpdate = true;
  }
  return toonGradientMap;
}

/**
 * An explicit light target. `DirectionalLight` defaults to an unparented
 * `Object3D` at the world origin, and both the shading direction and the
 * orthographic shadow frustum are built from it - so on a board that spans
 * 0..20 the default aims the rig at a corner. Mount the returned object in the
 * scene (`<primitive object={target} />`) or its world matrix never updates.
 */
export function createLightTarget(
  x: number,
  y: number,
  z: number
): THREE.Object3D {
  const target = new THREE.Object3D();
  target.position.set(x, y, z);
  return target;
}
