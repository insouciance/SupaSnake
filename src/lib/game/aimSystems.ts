/**
 * Aim systems v2 - meta-progression for the aim telegraph.
 *
 * The crosshair era: four systems replace the five v1 layer-stacks
 * (pulse/vector/sequence/radar/apex), unlocked by stats the server already
 * tracks (high score, games played, breeds - NO new tracking):
 *
 * - deadeye  (default)  target-lock reticle: bracket crosshair on the
 *                       first food/portal/mutation in the heading line +
 *                       heading beam with per-cell ticks
 * - gridlock            row+column rails following the head + snapped
 *                       cell highlight; aligned rails brighten toward
 *                       food/portal with a pip at the target
 * - pathline            projected 5-cell path ribbon + queued-turn
 *                       chevrons + danger tint (absorbs v1
 *                       vector/sequence/radar)
 * - firefly             the cute one: a glowing companion drone that
 *                       pursues the target food (advertises the lab loop;
 *                       alt unlock path for pure runners)
 *
 * Selection is server-authoritative: /api/player validates the unlock
 * predicate before persisting, so a locked system can never be equipped by
 * editing the client. This module is pure TS (no three/react) and is shared
 * by the API route, the store, and the renderer.
 *
 * Migration 026 remaps stored v1 selections tier-aligned
 * (pulse->deadeye, vector->gridlock, sequence/radar/apex->pathline).
 */

export type AimSystemId = 'deadeye' | 'gridlock' | 'pathline' | 'firefly';

/** Stats the unlock predicates read - all served from existing columns */
export interface AimStats {
  highScore: number;
  totalGames: number;
  breeds: number;
  /** MAX(generation) over the player's collected snakes */
  maxGeneration: number;
}

export interface AimSystemDef {
  id: AimSystemId;
  name: string;
  description: string;
  /** Shown on locked chips */
  unlockHint: string;
  isUnlocked: (stats: AimStats) => boolean;
}

export const DEFAULT_AIM_SYSTEM: AimSystemId = 'deadeye';

export const AIM_SYSTEMS: readonly AimSystemDef[] = [
  {
    id: 'deadeye',
    name: 'Deadeye',
    description:
      'Target lock: a reticle snaps to the first pickup in your heading line.',
    unlockHint: 'Always available',
    isUnlocked: () => true,
  },
  {
    id: 'gridlock',
    name: 'Gridlock',
    description:
      'Row and column rails track your head; aligned rails light up toward targets.',
    unlockHint: 'Reach a high score of 15',
    isUnlocked: (s) => s.highScore >= 15,
  },
  {
    id: 'pathline',
    name: 'Pathline',
    description:
      'Your true projected path: 5-cell ribbon, queued turns, danger tint.',
    unlockHint: 'Reach a high score of 30 or play 25 games',
    isUnlocked: (s) => s.highScore >= 30 || s.totalGames >= 25,
  },
  {
    id: 'firefly',
    name: 'Firefly',
    description: 'A glowing companion drone hovers over your next meal.',
    unlockHint: 'Complete a breed or reach a high score of 50',
    isUnlocked: (s) => s.breeds >= 1 || s.highScore >= 50,
  },
];

export const AIM_SYSTEM_IDS = AIM_SYSTEMS.map((s) => s.id) as readonly AimSystemId[];

export function isAimSystemId(value: unknown): value is AimSystemId {
  return typeof value === 'string' && AIM_SYSTEM_IDS.includes(value as AimSystemId);
}

export function getAimSystem(id: AimSystemId): AimSystemDef {
  // AIM_SYSTEMS covers every AimSystemId, so the lookup always succeeds
  return AIM_SYSTEMS.find((s) => s.id === id)!;
}

export function isAimSystemUnlocked(id: unknown, stats: AimStats): boolean {
  if (!isAimSystemId(id)) return false;
  return getAimSystem(id).isUnlocked(stats);
}

export function getUnlockedAimSystems(stats: AimStats): AimSystemId[] {
  return AIM_SYSTEMS.filter((s) => s.isUnlocked(stats)).map((s) => s.id);
}
