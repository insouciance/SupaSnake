/**
 * Aim systems - meta-progression for the aim telegraph.
 *
 * The always-on telegraph is replaced by five player-selected aim systems,
 * unlocked by stats the server already tracks (high score, games played,
 * breeds, best snake generation - NO new tracking):
 *
 * - pulse    (default)  head-front heading chevron only
 * - vector              pulse + projected 5-cell path lane
 * - sequence            vector + queued-turn chevrons
 * - radar               pulse + danger sense (impact cells tinted rose)
 * - apex                vector + sequence + radar, tuned subtle
 *
 * Selection is server-authoritative: /api/player validates the unlock
 * predicate before persisting, so a locked system can never be equipped by
 * editing the client. This module is pure TS (no three/react) and is shared
 * by the API route, the store, and the renderer.
 */

export type AimSystemId = 'pulse' | 'vector' | 'sequence' | 'radar' | 'apex';

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

export const DEFAULT_AIM_SYSTEM: AimSystemId = 'pulse';

export const AIM_SYSTEMS: readonly AimSystemDef[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Heading chevron at the front of your snake.',
    unlockHint: 'Always available',
    isUnlocked: () => true,
  },
  {
    id: 'vector',
    name: 'Vector',
    description: 'Pulse + the projected 5-cell path lane.',
    unlockHint: 'Reach a high score of 15',
    isUnlocked: (s) => s.highScore >= 15,
  },
  {
    id: 'sequence',
    name: 'Sequence',
    description: 'Vector + chevrons where queued turns will execute.',
    unlockHint: 'Play 25 games or complete a breed',
    isUnlocked: (s) => s.totalGames >= 25 || s.breeds >= 1,
  },
  {
    id: 'radar',
    name: 'Radar',
    description: 'Pulse + danger sense: cells before an impact glow rose.',
    unlockHint: 'Reach a high score of 30',
    isUnlocked: (s) => s.highScore >= 30,
  },
  {
    id: 'apex',
    name: 'Apex',
    description: 'Vector + Sequence + Radar combined, tuned subtle.',
    unlockHint: 'High score 50 or own a Gen 5 snake',
    isUnlocked: (s) => s.highScore >= 50 || s.maxGeneration >= 5,
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

/** Which telegraph layers an aim system renders */
export interface AimFeatures {
  /** Projected path lane (existing projectAimPath) */
  lane: boolean;
  /** Queued-turn chevrons (existing getQueuedDirections wiring) */
  queue: boolean;
  /** Danger sense: straight-heading impact tint */
  radar: boolean;
  /** Apex renders everything at subtler opacities */
  subtle: boolean;
}

const FEATURES: Record<AimSystemId, AimFeatures> = {
  pulse: { lane: false, queue: false, radar: false, subtle: false },
  vector: { lane: true, queue: false, radar: false, subtle: false },
  sequence: { lane: true, queue: true, radar: false, subtle: false },
  radar: { lane: false, queue: false, radar: true, subtle: false },
  apex: { lane: true, queue: true, radar: true, subtle: true },
};

export function getAimFeatures(id: AimSystemId): AimFeatures {
  return FEATURES[id];
}
