/** Shared, dependency-free Clan Energy Battle rules. */

import { GAME_CONFIG } from '@/shared/config/game';

export interface EnergyBattleCycle {
  index: number;
  startsAt: string;
  endsAt: string;
  intermissionEndsAt: string;
  phase: 'active' | 'intermission';
}

export function energyBattleCycleAt(at: Date | number = Date.now()): EnergyBattleCycle {
  const config = GAME_CONFIG.economy.clanBattle;
  const nowMs = new Date(at).getTime();
  const epochMs = new Date(config.epochUtc).getTime();
  const activeMs = config.activeDurationSeconds * 1000;
  const cycleMs = (config.activeDurationSeconds + config.intermissionDurationSeconds) * 1000;
  const index = Math.floor((nowMs - epochMs) / cycleMs);
  const startsMs = epochMs + index * cycleMs;
  const endsMs = startsMs + activeMs;
  return {
    index,
    startsAt: new Date(startsMs).toISOString(),
    endsAt: new Date(endsMs).toISOString(),
    intermissionEndsAt: new Date(startsMs + cycleMs).toISOString(),
    phase: nowMs < endsMs ? 'active' : 'intermission',
  };
}

export interface ClanEligibleResult {
  sessionId: string;
  /** Full-strength settled Yield; Energy multiplier is deliberately absent. */
  score: number;
  energyCommitted: number;
  completedAt: string;
}

/** Stable ordering used by SQL and UI: score desc, older completion, id. */
export function strongestClanResults(
  results: readonly ClanEligibleResult[],
  count: number = GAME_CONFIG.economy.clanBattle.contributingRunsPerMember
): ClanEligibleResult[] {
  return [...results]
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime() ||
        a.sessionId.localeCompare(b.sessionId)
    )
    .slice(0, Math.max(1, Math.floor(count)));
}

export function clanResultThreshold(results: readonly ClanEligibleResult[]): number {
  const count = GAME_CONFIG.economy.clanBattle.contributingRunsPerMember;
  const strongest = strongestClanResults(results, count);
  return strongest.length < count ? 0 : strongest[strongest.length - 1]?.score ?? 0;
}

/**
 * Clan score is the sum of each member's five strongest full-strength Yields.
 * Commitment changes personal harvest and psychological stakes, never this
 * formula; therefore an exceptional one-E run can beat a cautious six-E run.
 */
export function clanMemberContribution(results: readonly ClanEligibleResult[]): number {
  return strongestClanResults(results).reduce((sum, result) => sum + Math.max(0, result.score), 0);
}
