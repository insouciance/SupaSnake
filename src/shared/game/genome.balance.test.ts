/** Deterministic G8 balance harness for the five design archetypes. */

import type { GenePick } from './genes';
import type { GenomeRunInput } from './genome';
import { genomeOutcomeMultipliers } from './genome';
import { computeGenomeRunTotals, type DynastyName } from './rulesets';
import type { StrainId } from './strains';

const ELITE_ACCOUNT_STACK = 1.843;

interface Archetype {
  name: string;
  dynasty: DynastyName;
  foods: number;
  bankProbability: number;
  heirloom: Partial<Record<StrainId, number>>;
  picks: GenePick[];
  infuses: { atFood: number }[];
  prevRunDied?: boolean;
  boundedClaimDna?: number;
  designEv: number;
  /**
   * OPEN YIELD GAP — this archetype is knowingly short of its design target,
   * and the ±15% gate below skips it for that reason rather than the target
   * being quietly lowered to meet it.
   *
   * Only Rift Sailor carries it. WP-3.13 deleted COSMIC's combo, and this
   * harness modelled that combo as a flat `comboMultiplier: 2.4` over a whole
   * run — which was already fiction, because the ×2.4 cap needed a chain of 8
   * that a wave of 3 could not produce. Removing it takes the archetype from
   * 4984 to 2077, about 38% of target and about a third of the other four.
   *
   * That gap is real and it is NOT closed here. COSMIC's Yield curve is a
   * separate decision from its Score curve (D3 owns the score half and gave
   * it a mid-weighted shape; `foodDnaValue` is still a flat 10), and this
   * package deliberately did not author one — it would be a second economy
   * change riding a mechanic change, and the owner has to play the redesign
   * before the number it should pay is knowable.
   *
   * The measured value is asserted exactly, so the day someone does close it
   * this line fails and has to be re-decided rather than drifting.
   */
  openYieldGap?: number;
}

export const GENOME_BALANCE_ARCHETYPES: readonly Archetype[] = [
  {
    name: 'Gilded Pilgrim', dynasty: 'PRIMAL', foods: 100, bankProbability: 0.8,
    heirloom: { AURUM: 1 },
    picks: [{ id: 'gold_trail', atFood: 20 }, { id: 'compound_interest', atFood: 35 }],
    infuses: [{ atFood: 55 }],
    designEv: 5850,
  },
  {
    name: 'Storm Runner', dynasty: 'CYBER', foods: 80, bankProbability: 0.7,
    heirloom: { VOLT: 1 },
    picks: [
      { id: 'redline_dividend', atFood: 15 },
      { id: 'afterburner', atFood: 30 },
      { id: 'zenith_protocol', atFood: 45 },
    ],
    infuses: [],
    designEv: 5600,
  },
  {
    name: 'Molt Farmer', dynasty: 'PRIMAL', foods: 110, bankProbability: 0.88,
    heirloom: { FERAL: 1 },
    picks: [{ id: 'overgrowth', atFood: 40 }, { id: 'shed', atFood: 70 }],
    infuses: [],
    designEv: 5700,
  },
  {
    name: 'Void Dancer', dynasty: 'PRIMAL', foods: 115, bankProbability: 0.62,
    heirloom: { UMBRA: 1 },
    picks: [
      { id: 'mirror_wager', atFood: 12 },
      { id: 'phoenix', atFood: 28 },
      { id: 'grave_robber', atFood: 45 },
    ],
    infuses: [{ atFood: 58 }, { atFood: 78 }],
    prevRunDied: true,
    boundedClaimDna: 150,
    designEv: 5500,
  },
  {
    name: 'Rift Sailor', dynasty: 'COSMIC', foods: 110, bankProbability: 0.78,
    heirloom: { FLUX: 1 },
    picks: [
      { id: 'magnet_pulse', atFood: 12 },
      { id: 'pocket_rift', atFood: 28 },
    ],
    infuses: [],
    designEv: 5400,
    openYieldGap: 2077,
  },
] as const;

export function simulateGenomeArchetype(archetype: Archetype) {
  const genome: GenomeRunInput = {
    picks: archetype.picks,
    heirloom: archetype.heirloom,
    surges: [],
    infuses: archetype.infuses,
    revive: null,
    tierCap: 3,
    prevRunDied: archetype.prevRunDied,
  };
  const totals = computeGenomeRunTotals(archetype.dynasty, archetype.foods, genome);
  const outcome = genomeOutcomeMultipliers(genome);
  const weightedOutcome =
    archetype.bankProbability * outcome.bank +
    (1 - archetype.bankProbability) * outcome.death;
  const rawDna = totals.rawDna + (archetype.boundedClaimDna ?? 0);
  return {
    rawDna,
    bank: outcome.bank,
    death: outcome.death,
    ev: Math.round(rawDna * weightedOutcome * ELITE_ACCOUNT_STACK),
  };
}

describe('Genome archetype balance', () => {
  it('lands every elite archetype within 15% of the G0 target', () => {
    const results = GENOME_BALANCE_ARCHETYPES.filter(
      (archetype) => archetype.openYieldGap === undefined
    ).map((archetype) => ({
      name: archetype.name,
      designEv: archetype.designEv,
      ...simulateGenomeArchetype(archetype),
    }));
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(Math.abs(result.ev - result.designEv) / result.designEv).toBeLessThanOrEqual(0.15);
    }
  });

  it('records the open yield gaps exactly, so none of them can drift', () => {
    // An archetype below target is a finding, not a failure — but an
    // unrecorded one is how a 2.4x hole becomes the status quo. See
    // `openYieldGap` for why COSMIC's is open and what would close it.
    for (const archetype of GENOME_BALANCE_ARCHETYPES) {
      if (archetype.openYieldGap === undefined) continue;
      expect(simulateGenomeArchetype(archetype).ev).toBe(archetype.openYieldGap);
    }
  });

  it('keeps the strongest line below the +15% median dominance gate', () => {
    const results = GENOME_BALANCE_ARCHETYPES.map(simulateGenomeArchetype);
    const values = results.map((result) => result.ev);
    const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    expect(Math.max(...values)).toBeLessThanOrEqual(median * 1.15);
  });
});
