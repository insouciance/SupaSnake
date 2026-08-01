import * as THREE from 'three';

/**
 * One inexpensive chamfer pass is enough to catch a readable rim highlight at
 * game-camera distance. More subdivisions add GPU work to 400 body instances
 * without changing the silhouette at that scale.
 */
export const SNAKE_ROUNDING_SEGMENTS = 1;
export const SNAKE_HEAD_RADIUS = 0.12;
export const SNAKE_BODY_RADIUS = 0.085;
export const TERRAIN_CELL_RADIUS = 0.045;

/**
 * Exact-unit rounded box geometry without a runtime dependency on Three's
 * examples bundle. The algorithm starts with a subdivided unit box, pulls
 * corners inward, and writes analytic bevel normals. Axis extrema remain
 * exactly -0.5..0.5, so mesh scale is still the sole authority for gameplay
 * footprint and height.
 */
export function createExactUnitRoundedBoxGeometry(
  radius: number,
  segments = SNAKE_ROUNDING_SEGMENTS
): THREE.BufferGeometry {
  const safeSegments = Math.max(1, Math.floor(segments));
  const safeRadius = THREE.MathUtils.clamp(radius, 0.001, 0.499);
  const totalSegments = safeSegments * 2 + 1;
  const indexed = new THREE.BoxGeometry(
    1,
    1,
    1,
    totalSegments,
    totalSegments,
    totalSegments
  );
  const geometry = indexed.toNonIndexed();
  indexed.dispose();

  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const inset = 0.5 - safeRadius;
  const halfSegment = 0.5 / totalSegments;

  for (let index = 0; index < positions.count; index += 1) {
    position.fromBufferAttribute(positions, index);
    normal.copy(position);
    normal.x -= Math.sign(normal.x) * halfSegment;
    normal.y -= Math.sign(normal.y) * halfSegment;
    normal.z -= Math.sign(normal.z) * halfSegment;
    normal.normalize();

    positions.setXYZ(
      index,
      inset * Math.sign(position.x) + normal.x * safeRadius,
      inset * Math.sign(position.y) + normal.y * safeRadius,
      inset * Math.sign(position.z) + normal.z * safeRadius
    );
    normals.setXYZ(index, normal.x, normal.y, normal.z);
  }

  positions.needsUpdate = true;
  normals.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const snakeHeadGeometry = createExactUnitRoundedBoxGeometry(SNAKE_HEAD_RADIUS);
const snakeBodyGeometry = createExactUnitRoundedBoxGeometry(SNAKE_BODY_RADIUS);
const terrainCellGeometry = createExactUnitRoundedBoxGeometry(TERRAIN_CELL_RADIUS);

/** Shared immutable geometry pools. Callers change mesh scale, never vertices. */
export function getSnakeRoundedGeometry(
  role: 'head' | 'body'
): THREE.BufferGeometry {
  return role === 'head' ? snakeHeadGeometry : snakeBodyGeometry;
}

export function getTerrainCellGeometry(): THREE.BufferGeometry {
  return terrainCellGeometry;
}
