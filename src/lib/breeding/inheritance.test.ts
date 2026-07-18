/**
 * RPC-shaped trait inheritance tests (Design v2 Phase 3A, section 6.3).
 * These exercise the TS mirror of the breed_snakes / reroll_trait trait
 * rules (supabase/migrations/018_traits.sql) - inheritance, slot caps,
 * dedupe, empty pools, and reroll candidate exclusion.
 */

import { describe, it, expect } from '@jest/globals';
import {
  previewInheritance,
  rerollCandidates,
  rollInheritedTraits,
} from './inheritance';
import { getTraitSlots, type TraitId } from '@/shared/game/traits';

/** rng stub yielding a fixed sequence (then 0s). */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

describe('rollInheritedTraits (one trait from EACH parent pool)', () => {
  it('slot 1 from parent A, slot 2 from parent B', () => {
    const traits = rollInheritedTraits(
      ['sprinter', 'hoarder'],
      ['ascetic', 'patient'],
      2,
      seq([0, 0.9]) // A -> index 0 (sprinter), B -> index 1 (patient)
    );
    expect(traits).toEqual(['sprinter', 'patient']);
  });

  it('empty-pool parents contribute nothing', () => {
    expect(rollInheritedTraits([], [], 2)).toEqual([]);
    expect(rollInheritedTraits(['gambler'], [], 2, seq([0]))).toEqual(['gambler']);
    expect(rollInheritedTraits([], ['magnetism'], 2, seq([0]))).toEqual(['magnetism']);
  });

  it('duplicate rolls collapse to a single trait', () => {
    const traits = rollInheritedTraits(
      ['sprinter'],
      ['sprinter', 'hoarder'],
      2,
      seq([0, 0]) // both roll sprinter
    );
    expect(traits).toEqual(['sprinter']);
  });

  it('respects the slot cap (1-slot offspring keeps parent A roll)', () => {
    const traits = rollInheritedTraits(
      ['sprinter'],
      ['hoarder'],
      1,
      seq([0, 0])
    );
    expect(traits).toEqual(['sprinter']);
  });

  it('never returns more traits than slots or duplicates across 200 random rolls', () => {
    const pool1: TraitId[] = ['sprinter', 'hoarder', 'ascetic'];
    const pool2: TraitId[] = ['sprinter', 'patient'];
    for (let i = 0; i < 200; i++) {
      const traits = rollInheritedTraits(pool1, pool2, 2);
      expect(traits.length).toBeLessThanOrEqual(2);
      expect(new Set(traits).size).toBe(traits.length);
      if (traits.length > 0) expect(pool1).toContain(traits[0]);
      if (traits.length === 2) expect(pool2).toContain(traits[1]);
    }
  });
});

describe('previewInheritance (odds for the breeding screen)', () => {
  it('reports 1/n odds per parent-pool entry', () => {
    const preview = previewInheritance(
      ['sprinter', 'hoarder'],
      ['ascetic'],
      ['common', 'common'],
      2
    );
    expect(preview.parent1.oddsPerTrait).toBeCloseTo(0.5, 10);
    expect(preview.parent2.oddsPerTrait).toBe(1);
  });

  it('sanitizes hostile pool input', () => {
    const preview = previewInheritance(
      ['sprinter', 'not_a_trait', 'sprinter'],
      'garbage',
      ['common'],
      1
    );
    expect(preview.parent1.pool).toEqual(['sprinter']);
    expect(preview.parent2.pool).toEqual([]);
    expect(preview.parent2.oddsPerTrait).toBeNull();
  });

  it('uses the minimum guaranteed slot count over possible variants', () => {
    // 50/50 between a common (1 slot) and a rare (2 slots) at Gen 2
    const preview = previewInheritance([], [], ['common', 'rare'], 2);
    expect(preview.slots).toBe(1);
    // At Gen 3+ even the common outcome has 2 slots
    const gen3 = previewInheritance([], [], ['common', 'rare'], 3);
    expect(gen3.slots).toBe(2);
  });

  it('slot math mirrors get_trait_slots (SQL) via getTraitSlots', () => {
    expect(getTraitSlots('common', 2)).toBe(1);
    expect(getTraitSlots('rare', 2)).toBe(2);
    expect(getTraitSlots('common', 3)).toBe(2);
  });
});

describe('rerollCandidates (redraw from the combined parent pool)', () => {
  it('excludes every trait the snake currently holds', () => {
    expect(
      rerollCandidates(
        ['sprinter', 'hoarder', 'ascetic', 'patient'],
        ['sprinter', 'patient']
      )
    ).toEqual(['hoarder', 'ascetic']);
  });

  it('dedupes the combined pool (both parents sharing a trait)', () => {
    expect(
      rerollCandidates(['sprinter', 'sprinter', 'hoarder'], [])
    ).toEqual(['sprinter', 'hoarder']);
  });

  it('empty result when the pool offers nothing new (RPC refuses, token kept)', () => {
    expect(rerollCandidates(['sprinter'], ['sprinter'])).toEqual([]);
    expect(rerollCandidates([], ['sprinter'])).toEqual([]);
  });
});
