/**
 * Tests for the Lab Analytics aggregation (pure).
 */

import { describe, it, expect } from '@jest/globals';
import { aggregateSessions, type SessionRow } from './utils';

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    score: 50,
    dna_earned: 100,
    duration_seconds: 120,
    foods_collected: 10,
    extracted: true,
    dynasty: 'CYBER',
    started_at: '2026-07-18T10:00:00Z',
    ...overrides,
  };
}

describe('aggregateSessions', () => {
  it('returns zeroed stats for no sessions', () => {
    const { overall, dynasties } = aggregateSessions([]);
    expect(overall.games).toBe(0);
    expect(overall.bankRate).toBe(0);
    expect(overall.avgDurationSeconds).toBe(0);
    expect(dynasties).toEqual([]);
  });

  it('computes overall totals, bests and bank rate', () => {
    const { overall } = aggregateSessions([
      row({ score: 80, foods_collected: 20, dna_earned: 200, extracted: true }),
      row({ score: 40, foods_collected: 5, dna_earned: 50, extracted: false }),
      row({ score: 120, foods_collected: 30, dna_earned: 400, extracted: true }),
    ]);

    expect(overall.games).toBe(3);
    expect(overall.banked).toBe(2);
    expect(overall.bankRate).toBeCloseTo(2 / 3);
    expect(overall.bestScore).toBe(120);
    expect(overall.bestFoods).toBe(30);
    expect(overall.totalDna).toBe(650);
    expect(overall.totalFoods).toBe(55);
    expect(overall.avgDurationSeconds).toBe(120);
  });

  it('groups per dynasty with averages, sorted by games played', () => {
    const { dynasties } = aggregateSessions([
      row({ dynasty: 'CYBER', foods_collected: 10 }),
      row({ dynasty: 'CYBER', foods_collected: 15 }),
      row({ dynasty: 'PRIMAL', foods_collected: 40, extracted: false }),
    ]);

    expect(dynasties.map((d) => d.dynasty)).toEqual(['CYBER', 'PRIMAL']);
    const cyber = dynasties[0];
    expect(cyber.games).toBe(2);
    expect(cyber.avgFoods).toBe(12.5);
    expect(cyber.bankRate).toBe(1);
    const primal = dynasties[1];
    expect(primal.bankRate).toBe(0);
    expect(primal.bestFoods).toBe(40);
  });

  it('tolerates null fields and missing dynasties', () => {
    const { overall, dynasties } = aggregateSessions([
      row({
        score: null,
        dna_earned: null,
        duration_seconds: null,
        foods_collected: null,
        extracted: null,
        dynasty: null,
      }),
    ]);

    expect(overall.games).toBe(1);
    expect(overall.banked).toBe(0);
    expect(overall.totalDna).toBe(0);
    expect(dynasties[0].dynasty).toBe('UNKNOWN');
  });
});
