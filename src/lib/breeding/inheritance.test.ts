/**
 * Trait draft tests (Constitution §8.2).
 *
 * WP-1.05 rewrote this file. The previous suite asserted `rollInheritedTraits`
 * (one RNG draw per parent), `previewInheritance` (1/n odds per pool entry)
 * and `rerollCandidates` (the token-spending redraw). All three described the
 * random system §8.2 abolished, so those tests are DELETED rather than
 * adapted: there are no odds left to preview and no reroll left to validate.
 * What is asserted instead is the property the Constitution asks for - the
 * board is a deterministic function of the two parents, and a draft is either
 * legal or refused.
 */

import { describe, it, expect } from '@jest/globals';
import {
  defaultTraitDraft,
  isValidTraitDraft,
  traitDraftPool,
  variantDraftOptions,
} from './inheritance';
import type { TraitId } from '@/shared/game/traits';

const A: TraitId = 'sprinter';
const B: TraitId = 'hoarder';
const C: TraitId = 'scavenger';
const D: TraitId = 'gambler';

describe('traitDraftPool', () => {
  it('is the union of both parents, in first-appearance order', () => {
    expect(traitDraftPool([A, B], [C])).toEqual([
      { traitId: A, source: 'parent1' },
      { traitId: B, source: 'parent1' },
      { traitId: C, source: 'parent2' },
    ]);
  });

  it('marks a shared trait as coming from both parents, listed once', () => {
    expect(traitDraftPool([A, B], [B, C])).toEqual([
      { traitId: A, source: 'parent1' },
      { traitId: B, source: 'both' },
      { traitId: C, source: 'parent2' },
    ]);
  });

  it('is deterministic: the same parents always give the same board', () => {
    const first = traitDraftPool([A, B, C], [C, D]);
    for (let i = 0; i < 25; i += 1) {
      expect(traitDraftPool([A, B, C], [C, D])).toEqual(first);
    }
  });

  it('orders parent 1 ahead of parent 2', () => {
    expect(traitDraftPool([A], [B]).map((e) => e.traitId)).toEqual([A, B]);
    expect(traitDraftPool([B], [A]).map((e) => e.traitId)).toEqual([B, A]);
  });

  it('ignores unknown ids and non-array input', () => {
    expect(traitDraftPool(['not-a-trait', A], null)).toEqual([
      { traitId: A, source: 'parent1' },
    ]);
    expect(traitDraftPool(undefined, undefined)).toEqual([]);
  });

  it('two traitless parents offer nothing to draft', () => {
    expect(traitDraftPool([], [])).toEqual([]);
  });
});

describe('defaultTraitDraft', () => {
  it('takes the first `slots` entries - a published, previewable default', () => {
    const pool = traitDraftPool([A, B], [C]);
    expect(defaultTraitDraft(pool, 2)).toEqual([A, B]);
    expect(defaultTraitDraft(pool, 1)).toEqual([A]);
    expect(defaultTraitDraft(pool, 0)).toEqual([]);
  });

  it('never returns more than the pool holds', () => {
    expect(defaultTraitDraft(traitDraftPool([A], []), 2)).toEqual([A]);
  });
});

describe('isValidTraitDraft', () => {
  const pool = traitDraftPool([A, B], [C]);

  it('accepts a distinct in-pool draft inside the slot count', () => {
    expect(isValidTraitDraft([A, C], pool, 2)).toBe(true);
    expect(isValidTraitDraft([], pool, 2)).toBe(true);
  });

  it('refuses a trait neither parent offers', () => {
    expect(isValidTraitDraft([D], pool, 2)).toBe(false);
  });

  it('refuses a duplicate', () => {
    expect(isValidTraitDraft([A, A], pool, 2)).toBe(false);
  });

  it('refuses more traits than there are slots - the forced choice', () => {
    expect(isValidTraitDraft([A, B, C], pool, 2)).toBe(false);
    expect(isValidTraitDraft([A, B], pool, 1)).toBe(false);
  });
});

describe('variantDraftOptions', () => {
  const p1 = { variantId: 'v1', rarity: 'common' };
  const p2 = { variantId: 'v2', rarity: 'legendary' };

  it("offers both parents' lines, parent 1 first", () => {
    expect(variantDraftOptions(p1, p2, 2).map((o) => o.variantId)).toEqual([
      'v1',
      'v2',
    ]);
  });

  it('collapses identical parent variants to one option', () => {
    expect(variantDraftOptions(p1, { ...p1 }, 2)).toHaveLength(1);
  });

  it('quotes the slot count that follows from each line', () => {
    const options = variantDraftOptions(p1, p2, 2);
    expect(options[0].slots).toBe(1); // common at Gen2
    expect(options[1].slots).toBe(2); // legendary
  });

  it('gives Gen3+ two slots on either line', () => {
    expect(variantDraftOptions(p1, p2, 3).map((o) => o.slots)).toEqual([2, 2]);
  });
});
