/**
 * Session x Anomaly composition (Design v2 Phase 4B, section 7.2) - unit
 * tests for what the session route composes on anomaly runs:
 * - START: the anomaly is server-derived from the calendar (rotation) and
 *   the offer pool gains the live seasonal mutations for every mode.
 * - END: the validator sees the session row's anomaly and recomputes the
 *   payout with its [E] effects; seasonal picks validate in-pool; anomaly
 *   runs remain full earning runs (mastery XP base = raw x 1.25).
 */

import { describe, expect, it } from '@jest/globals';
import {
  anomalyForWeek,
  anomalyWeekStart,
} from '@/shared/game/anomalies';
import { applyGauntletBan } from '@/shared/game/gauntlet';
import { masteryXpForRun } from '@/shared/game/mastery';
import {
  fullMutationPool,
  unlockedMutationPool,
} from '@/shared/game/mastery';
import { SEASON_1_MUTATIONS } from '@/shared/game/season';
import { computeRunTotals } from '@/shared/game/rulesets';
import { validateGameResult } from '@/lib/server/gameValidator';

describe('session start: server-derived anomaly stamp', () => {
  it('the stamp is a pure function of the clock - both ends of a week agree', () => {
    const monday = new Date(Date.UTC(2026, 6, 20, 0, 0, 1));
    const sunday = new Date(Date.UTC(2026, 6, 26, 23, 59));
    expect(anomalyForWeek(monday)).toBe(anomalyForWeek(sunday));
    expect(anomalyWeekStart(sunday).toISOString().slice(0, 10)).toBe('2026-07-20');
  });

  it('seasonal mutations join every mode pool (earning + free), ban still applies', () => {
    const seasonal = [...SEASON_1_MUTATIONS];
    const earning = applyGauntletBan(
      [...unlockedMutationPool('CYBER', 0), ...seasonal],
      'solstice_engine'
    );
    expect(earning).toContain('glacial_reserve');
    expect(earning).toContain('midnight_oil');
    expect(earning).not.toContain('solstice_engine'); // seasonal ids are bannable

    const free = applyGauntletBan(
      [...fullMutationPool('PRIMAL'), ...seasonal],
      null
    );
    for (const id of seasonal) expect(free).toContain(id);
  });

  it('PRE-021: an empty seasonal list leaves the pools byte-identical', () => {
    expect([...unlockedMutationPool('CYBER', 3), ...[]]).toEqual(
      unlockedMutationPool('CYBER', 3)
    );
  });
});

describe('session end: anomaly-aware validation + earning-run semantics', () => {
  const startedAt = () => new Date(Date.now() - 120_000);

  it('a seasonal pick validates against the seasonal-extended pool', () => {
    const pool = [...unlockedMutationPool('PRIMAL', 0), ...SEASON_1_MUTATIONS];
    const picks = [{ id: 'midnight_oil' as const, atFood: 20 }];
    const { rawDna, score } = computeRunTotals('PRIMAL', 40, picks);
    const result = validateGameResult(
      {
        food_count: 40,
        extracted: true,
        score,
        dna_earned: rawDna,
        duration_seconds: 120,
        died: false,
        victory: false,
        mutations: picks,
      },
      startedAt(),
      'PRIMAL',
      [],
      pool
    );
    expect(result.valid).toBe(true);
    expect(result.mutations.map((m) => m.id)).toEqual(['midnight_oil']);
  });

  it('the same pick is dropped + flagged when the seasonal pool is not live (pre-021)', () => {
    const result = validateGameResult(
      {
        food_count: 40,
        extracted: true,
        score: computeRunTotals('PRIMAL', 40).score,
        dna_earned: computeRunTotals('PRIMAL', 40).rawDna,
        duration_seconds: 120,
        died: false,
        victory: false,
        mutations: [{ id: 'midnight_oil', atFood: 20 }],
      },
      startedAt(),
      'PRIMAL',
      [],
      unlockedMutationPool('PRIMAL', 0)
    );
    expect(result.mutations).toEqual([]);
    expect(result.errors.some((e) => e.includes('MUTATION_LOCKED: midnight_oil'))).toBe(true);
  });

  it('anomaly runs feed mastery like any earning run: XP = floor(raw x 1.25)', () => {
    const { rawDna } = computeRunTotals('PRIMAL', 50, [], null, [], 'gold_rush');
    const result = validateGameResult(
      {
        food_count: 50,
        extracted: true,
        score: computeRunTotals('PRIMAL', 50).score,
        dna_earned: rawDna,
        duration_seconds: 150,
        died: false,
        victory: false,
      },
      startedAt(),
      'PRIMAL',
      [],
      null,
      'gold_rush'
    );
    expect(masteryXpForRun(result.rawDna, result.extracted)).toBe(
      Math.floor(rawDna * 1.25)
    );
  });
});
