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
   * A yield gap this archetype once had, and the EV it was stuck at.
   *
   * CLOSED, and kept as a regression anchor rather than as a licence. Only
   * Rift Sailor carries one. WP-3.13 deleted COSMIC's combo, and this harness
   * had modelled that combo as a flat `comboMultiplier: 2.4` over a whole run
   * — itself fiction, because the ×2.4 cap needed a chain of 8 that a wave of
   * 3 could not produce, so the target was never actually being met. Removing
   * it exposed the archetype at 2077 against a 5400 target: 38% of target,
   * about a third of the other four.
   *
   * COSMIC's Yield was re-based in the same package to close it
   * (`COSMIC_YIELD_STEP` / `COSMIC_YIELD_CAP`). The number below is what it
   * paid BEFORE, and the test asserts the archetype has moved decisively off
   * it — so a future change that silently reverts the curve fails here rather
   * than in a playtest.
   */
  closedYieldGap?: number;
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
    closedYieldGap: 2077,
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
    // EVERY archetype, with no exemptions. Rift Sailor was exempted for one
    // commit while COSMIC's Yield gap was open; closing the gap is what
    // brought it back under the gate, and an exemption list here is how a
    // hole becomes the status quo.
    const results = GENOME_BALANCE_ARCHETYPES.map((archetype) => ({
      name: archetype.name,
      designEv: archetype.designEv,
      ...simulateGenomeArchetype(archetype),
    }));
    expect(results.length).toBe(GENOME_BALANCE_ARCHETYPES.length);
    for (const result of results) {
      expect(Math.abs(result.ev - result.designEv) / result.designEv).toBeLessThanOrEqual(0.15);
    }
  });

  it('keeps every closed yield gap closed', () => {
    // The anchor, pointing the other way from the gate above: not "is it near
    // target" but "has it moved decisively off the number it was stuck at".
    // A reverted curve could in principle satisfy neither, but this one names
    // the specific failure so the diff that caused it is obvious.
    for (const archetype of GENOME_BALANCE_ARCHETYPES) {
      if (archetype.closedYieldGap === undefined) continue;
      const { ev } = simulateGenomeArchetype(archetype);
      expect(ev).toBeGreaterThan(archetype.closedYieldGap * 1.5);
      expect(ev).toBeGreaterThan(archetype.designEv * 0.85);
    }
  });

  it('keeps the strongest line below the +15% median dominance gate', () => {
    const results = GENOME_BALANCE_ARCHETYPES.map(simulateGenomeArchetype);
    const values = results.map((result) => result.ev);
    const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    expect(Math.max(...values)).toBeLessThanOrEqual(median * 1.15);
  });
});
