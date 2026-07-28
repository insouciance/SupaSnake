/**
 * RULE 15 — length only ever increases; free space only ever shrinks.
 *
 * Constitution v1.4 §4 Rule 15. This file is the mechanical gate: it asserts
 * that nothing reachable in a run can rewind the difficulty clock. The
 * checklist asks a reviewer the same question; this asks it of the code.
 */

import { describe, it, expect } from '@jest/globals';
import { MUTATION_POOL, MUTATION_PHYSICS } from './mutations';
import { GENE_POOL, SIGNATURE_GENES } from './genes';
import { SPLICES, spliceForPair } from './splices';
import { STRAIN_PHYSICS } from './strains';
import { composeGenePool } from './genePool';
import { computeLengthTrace, fusePicks, strainActivations } from './genome';
import type { DynastyName } from './rulesets';

const DYNASTIES: DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

describe('Rule 15: the length-reducers are unreachable', () => {
  it('`shed` is not draftable from the base pool', () => {
    expect(MUTATION_POOL).not.toContain('shed');
    expect(GENE_POOL).not.toContain('shed');
  });

  it('`shed` cannot be offered on any dynasty, at any mastery, free play included', () => {
    const offered = new Set<string>();
    for (const dynasty of DYNASTIES) {
      for (let mastery = 0; mastery <= 10; mastery++) {
        for (const freePlay of [false, true]) {
          for (const id of composeGenePool(dynasty, mastery, [], null, freePlay)) {
            offered.add(id);
          }
        }
      }
    }
    expect([...offered]).not.toContain('shed');
    // Free play is a showroom and grants the whole pool, so it is the case
    // most likely to leak a retired gene back in.
    expect(offered.size).toBeGreaterThan(0);
  });

  it('both shed splices become unformable, with no separate edit', () => {
    // Each names `shed` as a parent, so removing the gene from the pool is
    // what retires them - the two can never fall out of step.
    expect(SPLICES.splice_regenesis.parents).toContain('shed');
    expect(SPLICES.splice_molted_rebirth.parents).toContain('shed');
    // Exactly two partners form a splice with `shed`, and both recipes are
    // therefore dead the moment `shed` leaves the pool.
    // The two partners are still perfectly draftable - it is `shed` that is
    // gone, so the PAIR can never be held, and the recipes stay intact for
    // recomputing runs that were settled before the rule.
    const partners = [...GENE_POOL, ...Object.values(SIGNATURE_GENES)]
      .filter((partner) => spliceForPair('shed', partner) !== null)
      .sort();
    expect(partners).toEqual(['overgrowth', 'phoenix']);
    expect(GENE_POOL).not.toContain('shed');
  });

  it('INFUSE grows the body rather than paying for the gene with it', () => {
    expect(STRAIN_PHYSICS.infuseGrowth).toBeGreaterThan(0);
    expect(STRAIN_PHYSICS).not.toHaveProperty('infuseSegmentCost');
  });

  it('the revive keeps its rewind but no longer truncates', () => {
    // The rewind is positional mercy and stays; `phoenixRebirthLength` is no
    // longer consulted by either the engine or the length model.
    expect(MUTATION_PHYSICS.phoenixRewindCells).toBeGreaterThan(0);
  });

  it('FERAL-2 transforms length rather than shedding it (WP-3.11)', () => {
    // Molt was the one length-reducer Rule 15 could NOT be satisfied by
    // re-pricing, because its effect WAS the shed. Fortress replaced the
    // effect: nothing in the tier reduces length, and the dials that made the
    // shed possible are gone rather than renamed - a `moltShedFraction` still
    // sitting in the module would mean someone could restore the cycle with
    // one line and no failing test.
    expect(STRAIN_PHYSICS).not.toHaveProperty('moltShedFraction');
    expect(STRAIN_PHYSICS).not.toHaveProperty('moltEveryFoods');
    expect(STRAIN_PHYSICS).not.toHaveProperty('moltMinLength');
    expect(STRAIN_PHYSICS).not.toHaveProperty('moltTickFactor');
    expect(STRAIN_PHYSICS.fortressSegments).toBeGreaterThan(0);
    expect(STRAIN_PHYSICS.fortressEveryFoods).toBeGreaterThan(0);
  });

  it('a petrified segment stays in the modelled length', () => {
    // The mechanical statement of "the clock never rewinds": across the food
    // that petrifies, the length model must not fall. Two FERAL genes plus two
    // spawn points is the Expression exactly.
    const picks = [
      { id: 'serpentine' as const, atFood: 0 },
      { id: 'heartwood' as const, atFood: 0 },
    ];
    const activations = strainActivations(picks, { FERAL: 2 });
    expect(activations.FERAL.expressionAt).toBe(0);
    const trace = computeLengthTrace(
      fusePicks(picks),
      STRAIN_PHYSICS.fortressEveryFoods * 3,
      activations,
      { picks, heirloom: {}, surges: [], infuses: [], revive: null }
    );
    // Expression at food 0, so events land on 20, 40 and 60.
    expect(trace.petrifyEvents.map((e) => e.atFood)).toEqual([20, 40, 60]);
    for (let n = 2; n < trace.lengthAtEat.length; n++) {
      expect(trace.lengthAtEat[n]).toBeGreaterThanOrEqual(trace.lengthAtEat[n - 1]);
    }
  });
});
