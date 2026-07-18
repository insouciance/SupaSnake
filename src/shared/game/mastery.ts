/**
 * Per-dynasty Mastery - Design v2 (GAME_DESIGN_V2.md section 7.1)
 *
 * Horizontal, permanent, per-dynasty tracks fed exclusively by banked DNA:
 * extracted runs grant mastery XP equal to floor(raw x 1.25) - the banked
 * payout BEFORE the account multiplier stack (streak x set x clanDuel), so
 * streaks never inflate mastery. Deaths and Free Play grant nothing.
 *
 * This module is the single source of truth for:
 * - the level curve (M1..M10, 175,000 XP cumulative) - mirrored by the
 *   level_for_xp SQL function in migration 019 (keep in lockstep)
 * - the unlock track (mutations at M3/M6/M9, cosmetics elsewhere)
 * - the per-dynasty mastery mutations and pool computation - the server
 *   recomputes a player's unlocked pool from player_mastery, NEVER from a
 *   client-supplied list.
 */

import {
  MUTATIONS,
  MUTATION_POOL,
  type MutationId,
} from '@/shared/game/mutations';
import { BANK, type DynastyName } from '@/shared/game/rulesets';

export const MASTERY_MAX_LEVEL = 10;

/**
 * XP to NEXT level (doc table): M1 1,000 / M2 2,000 / M3 4,000 / M4 7,000 /
 * M5 11,000 / M6 16,000 / M7 22,000 / M8 29,000 / M9 37,000 / M10 46,000.
 * Index i = cost of going from level i to level i+1.
 */
export const MASTERY_XP_TO_NEXT: readonly number[] = [
  1000, 2000, 4000, 7000, 11000, 16000, 22000, 29000, 37000, 46000,
] as const;

/**
 * Cumulative XP required to REACH each level: thresholds[level].
 * [0, 1000, 3000, 7000, 14000, 25000, 41000, 63000, 92000, 129000, 175000]
 */
export const MASTERY_THRESHOLDS: readonly number[] = MASTERY_XP_TO_NEXT.reduce<
  number[]
>((acc, cost) => [...acc, acc[acc.length - 1] + cost], [0]);

/** Total XP for a maxed track - the doc's 175,000 anchor. */
export const MASTERY_TOTAL_XP =
  MASTERY_THRESHOLDS[MASTERY_MAX_LEVEL]; // 175,000

/**
 * Mastery level (0..10) for a banked-XP total. Level N is reached at
 * exactly MASTERY_THRESHOLDS[N] XP. Mirrors level_for_xp (migration 019).
 */
export function levelForXp(xp: number): number {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 0;
  while (
    level < MASTERY_MAX_LEVEL &&
    total >= MASTERY_THRESHOLDS[level + 1]
  ) {
    level += 1;
  }
  return level;
}

/** Progress detail for UI: level, XP into the level, XP to the next. */
export interface MasteryProgress {
  level: number;
  /** XP accumulated inside the current level. */
  intoLevel: number;
  /** XP still needed for the next level; null at M10 (track complete). */
  toNext: number | null;
}

export function masteryProgress(xp: number): MasteryProgress {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const level = levelForXp(total);
  const intoLevel = total - MASTERY_THRESHOLDS[level];
  const toNext =
    level >= MASTERY_MAX_LEVEL
      ? null
      : MASTERY_THRESHOLDS[level + 1] - total;
  return { level, intoLevel, toNext };
}

/**
 * Mastery XP for a run (section 7.1): extracted runs grant
 * floor(raw x 1.25) - the banked payout at the BASE bank multiplier,
 * before Mirror Wager/Compound Interest outcome shaping and before the
 * account multiplier stack. Deaths grant nothing.
 */
export function masteryXpForRun(rawDna: number, extracted: boolean): number {
  if (!extracted) return 0;
  const raw = Number.isFinite(rawDna) ? Math.max(0, rawDna) : 0;
  return Math.floor(raw * BANK.extractMultiplier);
}

/** The levels that unlock a mutation into the dynasty's offer pool. */
export const MASTERY_MUTATION_LEVELS = [3, 6, 9] as const;
export type MasteryMutationLevel = (typeof MASTERY_MUTATION_LEVELS)[number];

/**
 * The nine mastery mutations: per dynasty, +1 into that dynasty's offer
 * pool at M3/M6/M9 (section 7.1). Definitions live in MUTATIONS.
 */
export const MASTERY_MUTATIONS: Record<
  DynastyName,
  Record<MasteryMutationLevel, MutationId>
> = {
  PRIMAL: { 3: 'deep_roots', 6: 'ancient_grove', 9: 'tectonic_patience' },
  CYBER: { 3: 'redline_dividend', 6: 'afterburner', 9: 'overclock_harvest' },
  COSMIC: { 3: 'starweaver', 6: 'gravity_well', 9: 'event_horizon' },
};

/**
 * The offer pool a player has EARNED for a dynasty at a mastery level:
 * base ten + that dynasty's mastery mutations at or below the level.
 * The server recomputes this from player_mastery - a client-supplied pool
 * is never trusted.
 */
export function unlockedMutationPool(
  dynasty: DynastyName,
  masteryLevel: number
): MutationId[] {
  const unlocks = MASTERY_MUTATION_LEVELS.filter(
    (lvl) => masteryLevel >= lvl
  ).map((lvl) => MASTERY_MUTATIONS[dynasty][lvl]);
  return [...MUTATION_POOL, ...unlocks];
}

/**
 * The ENTIRE pool for a dynasty (section 7.4 Free Play: everything
 * unlocked, including mutations the player hasn't earned - practice is
 * also a showroom).
 */
export function fullMutationPool(dynasty: DynastyName): MutationId[] {
  return unlockedMutationPool(dynasty, MASTERY_MAX_LEVEL);
}

/** One rung of the M1-M10 unlock track (section 7.1 table). */
export interface MasteryUnlock {
  level: number;
  kind: 'mutation' | 'cosmetic';
  /** Display label; for mutation rungs use masteryUnlockLabel for the name. */
  label: string;
}

/** The M1-M10 unlock track (section 7.1) - cosmetic labels per the doc. */
export const MASTERY_UNLOCK_TRACK: readonly MasteryUnlock[] = [
  { level: 1, kind: 'cosmetic', label: 'Dynasty Emblem I' },
  { level: 2, kind: 'cosmetic', label: 'Body Trail I' },
  { level: 3, kind: 'mutation', label: '+1 Mutation' },
  { level: 4, kind: 'cosmetic', label: 'Board-Accent Skin' },
  { level: 5, kind: 'cosmetic', label: 'Trail II' },
  { level: 6, kind: 'mutation', label: '+1 Mutation' },
  { level: 7, kind: 'cosmetic', label: 'Emblem II' },
  { level: 8, kind: 'cosmetic', label: 'Trail III (Animated)' },
  { level: 9, kind: 'mutation', label: '+1 Mutation' },
  { level: 10, kind: 'cosmetic', label: 'Sovereign Emblem + Title' },
] as const;

/**
 * Display label for a track rung: mutation rungs name the actual mutation
 * ("Deep Roots"), cosmetic rungs use the doc's cosmetic label.
 */
export function masteryUnlockLabel(
  dynasty: DynastyName,
  level: number
): string {
  const rung = MASTERY_UNLOCK_TRACK[level - 1];
  if (!rung) return '';
  if (rung.kind === 'mutation') {
    const id =
      MASTERY_MUTATIONS[dynasty][level as MasteryMutationLevel];
    return MUTATIONS[id].name;
  }
  return rung.label;
}
