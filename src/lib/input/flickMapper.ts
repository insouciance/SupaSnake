/**
 * FlickMapper - converts screen-space flick directions into absolute world
 * directions through the camera orientation.
 *
 * Commands are converted AT INPUT TIME using the camera azimuth captured
 * when the flick began ("frozen orientation"), then stored as absolute
 * directions in the engine's input queue. Absolute storage means a camera
 * rotation between input and execution can never re-interpret an already
 * queued command - the turn the player saw is the turn they get.
 *
 * World directions (see SnakeGameLogic): UP = -z, DOWN = +z,
 * LEFT = -x, RIGHT = +x. The camera's default view faces -z ("north"),
 * where screen-up maps to world UP. The camera snaps to 90-degree sides;
 * azimuth is quantized to the nearest quadrant, so mapping is an exact
 * rotation of the screen frame.
 */

import type { Direction } from '@/lib/game/SnakeGameLogic';
import type { ScreenFlickDirection } from './flickRecognizer';

/**
 * Quantize a camera azimuth (radians, OrbitControls convention: 0 when the
 * camera looks toward -z from +z side) to a quadrant index 0..3.
 */
export function azimuthToQuadrant(azimuthRad: number): 0 | 1 | 2 | 3 {
  const tau = Math.PI * 2;
  const normalized = ((azimuthRad % tau) + tau) % tau;
  return (Math.round(normalized / (Math.PI / 2)) % 4) as 0 | 1 | 2 | 3;
}

/**
 * Screen direction -> world direction per camera quadrant.
 * Quadrant 0 = default view (camera on +z side looking toward -z):
 * screen UP is world UP (-z), screen LEFT is world LEFT (-x).
 * Each successive quadrant rotates the mapping by 90 degrees.
 */
const QUADRANT_MAPS: Record<0 | 1 | 2 | 3, Record<ScreenFlickDirection, Direction>> = {
  0: { UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT' },
  1: { UP: 'LEFT', DOWN: 'RIGHT', LEFT: 'DOWN', RIGHT: 'UP' },
  2: { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' },
  3: { UP: 'RIGHT', DOWN: 'LEFT', LEFT: 'UP', RIGHT: 'DOWN' },
};

/** Map a screen flick to an absolute world direction for a camera quadrant. */
export function mapFlickToWorld(
  flick: ScreenFlickDirection,
  quadrant: 0 | 1 | 2 | 3
): Direction {
  return QUADRANT_MAPS[quadrant][flick];
}

/** Convenience: full pipeline from flick + raw azimuth to world direction. */
export function mapFlickWithAzimuth(
  flick: ScreenFlickDirection,
  azimuthRad: number
): Direction {
  return mapFlickToWorld(flick, azimuthToQuadrant(azimuthRad));
}
