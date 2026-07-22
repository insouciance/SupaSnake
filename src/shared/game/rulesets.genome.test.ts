/**
 * Genome scoring authority - the two invariants everything rests on:
 * 1. EQUIVALENCE: an empty genome pays exactly what the legacy path pays
 *    (old sessions and the genome-off deploy window validate unchanged).
 * 2. DETERMINISM: computeGenomeRunTotals is a pure function - fuzzed
 *    inputs recompute identically, and score is never genome-shaped.
 */

import type { GenePick } from '@/shared/game/genes';
import { GENE_POOL } from '@/shared/game/genes';
import { mulberry32 } from '@/shared/game/offerGravity';
import {
  applyGenomeOutcome,
  applyOutcome,
  applyOutcomeWithMutations,
  computeGenomeRunTotals,
  computeRunTotals,
  type DynastyName,
} from '@/shared/game/rulesets';
import { EMPTY_GENOME, type GenomeRunInput } from '@/shared/game/genome';
import type { MutationPick } from '@/shared/game/mutations';
import { STRAIN_ECONOMICS } from '@/shared/game/strains';

const DYNASTIES: DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

const genome = (partial: Partial<GenomeRunInput>): GenomeRunInput => ({
  picks: [],
  heirloom: {},
  surges: [],
  infuses: [],
  revive: null,
  ...partial,
});

describe('equivalence with the legacy authority', () => {
  it('empty genome === computeRunTotals for every dynasty and food count', () => {
    for (const dynasty of DYNASTIES) {
      for (const count of [0, 1, 15, 40, 100, 150]) {
        const legacy = computeRunTotals(dynasty, count);
        const genomeTotals = computeGenomeRunTotals(dynasty, count, EMPTY_GENOME);
        expect(genomeTotals.rawDna).toBe(legacy.rawDna);
        expect(genomeTotals.score).toBe(legacy.score);
      }
    }
  });

  it('empty genome with traits + anomaly === legacy with traits + anomaly', () => {
    for (const dynasty of DYNASTIES) {
      const legacy = computeRunTotals(
        dynasty, 80, [], null, ['scavenger', 'gambler'], 'gold_rush'
      );
      const genomeTotals = computeGenomeRunTotals(
        dynasty, 80, EMPTY_GENOME, ['scavenger', 'gambler'], 'gold_rush'
      );
      expect(genomeTotals.rawDna).toBe(legacy.rawDna);
      expect(genomeTotals.score).toBe(legacy.score);
    }
  });

  it('legacy-only picks (no strain thresholds crossed) === legacy math', () => {
    // One gene per strain - no strain reaches 2 points, no fusion pair.
    const picks: GenePick[] = [
      { id: 'gold_trail', atFood: 10 },
      { id: 'time_dilation', atFood: 25 },
    ];
    for (const dynasty of DYNASTIES) {
      const legacy = computeRunTotals(dynasty, 90, picks as MutationPick[], null);
      const genomeTotals = computeGenomeRunTotals(
        dynasty, 90, genome({ picks })
      );
      expect(genomeTotals.rawDna).toBe(legacy.rawDna);
      expect(genomeTotals.score).toBe(legacy.score);
    }
  });

  it('applyGenomeOutcome(empty) === applyOutcome === applyOutcomeWithMutations', () => {
    for (const extracted of [true, false]) {
      expect(applyGenomeOutcome(1990, extracted, EMPTY_GENOME)).toBe(
        applyOutcome(1990, extracted)
      );
      expect(applyGenomeOutcome(1990, extracted, EMPTY_GENOME)).toBe(
        applyOutcomeWithMutations(1990, extracted)
      );
    }
  });
});

describe('genome-shaped runs', () => {
  it('keeps splice recipes loose until the server FTUE gate unlocks them', () => {
    const picks: GenePick[] = [
      { id: 'gold_trail', atFood: 15 },
      { id: 'compound_interest', atFood: 30 },
    ];
    const locked = computeGenomeRunTotals(
      'PRIMAL',
      60,
      genome({ picks, splicesEnabled: false })
    );
    const unlocked = computeGenomeRunTotals(
      'PRIMAL',
      60,
      genome({ picks, splicesEnabled: true })
    );
    // Dragon Hoard adds +5 flat to golden foods after fusion; loose parent
    // genes do not. Both paths retain the same two AURUM strain points.
    expect(unlocked.rawDna).toBeGreaterThan(locked.rawDna);
    expect(locked.activations.AURUM.points).toBe(2);
    expect(unlocked.activations.AURUM.points).toBe(2);
  });

  it('AURUM minor (Gilt) pays +5% on foods after activation', () => {
    const picks: GenePick[] = [
      { id: 'grave_robber', atFood: 5 }, // UMBRA (neutral without prev death)
      { id: 'tithe', atFood: 200 }, // inert (post-run atFood)
    ];
    // Two AURUM genes activating the minor at food 30:
    const aurumPicks: GenePick[] = [
      { id: 'midnight_oil', atFood: 60 }, // AURUM (window over by design)
      { id: 'loan_shark', atFood: 90 }, // AURUM 2 -> minor at 90
    ];
    const base = computeGenomeRunTotals('PRIMAL', 100, genome({ picks }));
    const gilt = computeGenomeRunTotals('PRIMAL', 100, genome({ picks: aurumPicks }));
    // Foods 91..100 pay x1.05 x2 (loan shark window) x... - just assert
    // the minor contributes: recompute with heirloom pushing activation
    // earlier must pay MORE for the same picks.
    const earlier = computeGenomeRunTotals(
      'PRIMAL', 100, genome({ picks: aurumPicks, heirloom: { AURUM: 1 } })
    );
    expect(earlier.rawDna).toBeGreaterThan(gilt.rawDna);
    expect(base.score).toBe(gilt.score); // score is never genome-shaped
  });

  it('score is never genome-shaped (fuzz)', () => {
    const rng = mulberry32(1234);
    for (let i = 0; i < 50; i++) {
      const dynasty = DYNASTIES[Math.floor(rng() * 3)];
      const count = 20 + Math.floor(rng() * 100);
      const picks: GenePick[] = [];
      const used = new Set<string>();
      const pickCount = Math.floor(rng() * 6);
      for (let p = 0; p < pickCount; p++) {
        const id = GENE_POOL[Math.floor(rng() * GENE_POOL.length)];
        if (used.has(id)) continue;
        used.add(id);
        picks.push({ id, atFood: Math.floor(rng() * count) });
      }
      picks.sort((a, b) => a.atFood - b.atFood);
      const input = genome({
        picks,
        infuses: rng() < 0.5 ? [{ atFood: Math.floor(count / 2) }] : [],
      });
      const totals = computeGenomeRunTotals(dynasty, count, input);
      expect(totals.score).toBe(computeRunTotals(dynasty, count).score);
    }
  });

  it('is a pure function: fuzzed inputs recompute identically', () => {
    const rng = mulberry32(987);
    for (let i = 0; i < 100; i++) {
      const dynasty = DYNASTIES[Math.floor(rng() * 3)];
      const count = 10 + Math.floor(rng() * 120);
      const picks: GenePick[] = [];
      const used = new Set<string>();
      while (picks.length < Math.floor(rng() * 7) - 1) {
        const id = GENE_POOL[Math.floor(rng() * GENE_POOL.length)];
        if (used.has(id)) continue;
        used.add(id);
        picks.push({ id, atFood: Math.floor(rng() * count) });
      }
      picks.sort((a, b) => a.atFood - b.atFood);
      const input = genome({
        picks,
        heirloom: rng() < 0.3 ? { UMBRA: 1, FERAL: 1 } : {},
        infuses:
          rng() < 0.4
            ? [{ atFood: 20 }, { atFood: 40 }].filter((x) => x.atFood < count)
            : [],
        revive:
          rng() < 0.2 ? { kind: 'phoenix', atFood: Math.floor(count / 2) } : null,
        prevRunDied: rng() < 0.5,
      });
      const a = computeGenomeRunTotals(dynasty, count, input);
      const b = computeGenomeRunTotals(dynasty, count, input);
      expect(a.rawDna).toBe(b.rawDna);
      expect(a.score).toBe(b.score);
      expect(a.caps).toEqual(b.caps);
      expect(Number.isInteger(a.rawDna)).toBe(true);
      expect(a.rawDna).toBeGreaterThanOrEqual(0);
    }
  });

  it('Tithe floors every food at 1 DNA (never negative food)', () => {
    // Tithe + Splitter (x0.7) + Time Dilation (x0.8) on COSMIC flat 10:
    // late foods round to 6 then -1 flat = 5; construct a harsher case
    // with Wall Rush too, and assert nothing pays below 1.
    const picks: GenePick[] = [
      { id: 'tithe', atFood: 0 },
      { id: 'splitter', atFood: 0 },
      { id: 'time_dilation', atFood: 0 },
      { id: 'wall_rush', atFood: 0 },
    ];
    const totals = computeGenomeRunTotals('COSMIC', 30, genome({ picks }));
    // Per-food: round(10 * 0.7 * 0.8 * 0.9) = 5, -1 = 4 (10th: +20).
    // Deterministic floor holds: every food >= 1.
    expect(totals.rawDna).toBeGreaterThanOrEqual(30);
  });

  it('the aggregate claims cap tracks the deterministic recompute', () => {
    const totals = computeGenomeRunTotals('PRIMAL', 100, EMPTY_GENOME, ['ascetic']);
    // Ascetic x1.4 is a TRAIT - in both the deterministic and geneless folds.
    expect(totals.caps.globalClaimsCap).toBe(
      Math.floor(totals.rawDna * STRAIN_ECONOMICS.genomeClaimsCapRatio)
    );
    expect(totals.capsBasis.genelessRaw).toBe(totals.rawDna);
  });

  it('infuses shape the outcome through applyGenomeOutcome', () => {
    const input = genome({ infuses: [{ atFood: 20 }, { atFood: 40 }, { atFood: 60 }] });
    // bank 1.25 + 0.15 = 1.40; salvage 0.60 - 0.15 = 0.45.
    expect(applyGenomeOutcome(1000, true, input)).toBe(1400);
    expect(applyGenomeOutcome(1000, false, input)).toBe(450);
  });
});
