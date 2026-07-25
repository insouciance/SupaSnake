/**
 * Aim systems - the four aim telegraphs, all four available from run 1.
 *
 * - deadeye   (default)  heading-relative T guide extending from the fluid
 *                        head to the board edges + a snapped current-cell tile
 * - gridlock             row+column rails following the head + snapped
 *                        cell highlight; aligned rails brighten toward
 *                        food/portal with a pip at the target
 * - pathline             projected 5-cell path ribbon + queued-turn
 *                        chevrons + danger tint
 * - firefly              a glowing companion drone that pursues the target
 *                        food
 *
 * WP-0.07 removed the unlock gate. Constitution §6.1: "Aim systems are
 * universal settings available to everyone from the first run (§15, overturn
 * 10), so information parity holds and no assist annotation is needed." An
 * aim system is a control preference, not a reward: gating one behind high
 * score, games played or a completed breed (GT §9.4 - the Firefly gate was
 * reachable by *breeding*, i.e. by DNA) meant a newcomer played a worse game
 * than a veteran for reasons unrelated to skill.
 *
 * Consequently this module reads NO progression, unlock, breeding or account
 * state, and exposes no predicate that could. Selection is still
 * server-persisted (/api/player validates the *id*), but there is nothing
 * left to authorize: every id is selectable by every player, always.
 *
 * The retired thresholds are not deleted - R6 keeps what a player earned.
 * They moved to `src/lib/chronicle/aimTrivia.ts`, where the Chronicle reads
 * them as career trivia and nothing else consults them.
 *
 * Migration 026 remaps stored v1 selections tier-aligned
 * (pulse->deadeye, vector->gridlock, sequence/radar/apex->pathline).
 */

export type AimSystemId = 'deadeye' | 'gridlock' | 'pathline' | 'firefly';

export interface AimSystemDef {
  id: AimSystemId;
  name: string;
  description: string;
}

export const DEFAULT_AIM_SYSTEM: AimSystemId = 'deadeye';

export const AIM_SYSTEMS: readonly AimSystemDef[] = [
  {
    id: 'deadeye',
    name: 'Deadeye',
    description:
      'A heading-relative T guide reaches the board edges while a highlighted tile marks your current cell.',
  },
  {
    id: 'gridlock',
    name: 'Gridlock',
    description:
      'Row and column rails track your head; aligned rails light up toward targets.',
  },
  {
    id: 'pathline',
    name: 'Pathline',
    description:
      'Your true projected path: 5-cell ribbon, queued turns, danger tint.',
  },
  {
    id: 'firefly',
    name: 'Firefly',
    description: 'A glowing companion drone hovers over your next meal.',
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
