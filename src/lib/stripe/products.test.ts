/**
 * The one-time SKU catalogue — Constitution §10.2 / §10.4.
 *
 * These tests are written against `ALL_PRODUCTS` as a whole, never against
 * named SKUs, because the thing worth protecting is not "the five deleted
 * products stay deleted" — it is that **no future SKU can grant energy, DNA
 * or progression** without failing here first. The catalogue is empty today;
 * every assertion below is written to keep working, and keep meaning
 * something, the day the Atelier fills it.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ALL_PRODUCTS, getProductById, type StoreProduct } from './products';

/** The SKUs WP-0.09 deleted. None may ever resolve again. */
const RETIRED_SKU_IDS = [
  'energy_small',
  'energy_medium',
  'energy_large',
  'starter_bundle',
  'dynasty_bundle',
];

/**
 * Every name §10.4 puts on the never-sold list, as a reward key. A SKU that
 * grows one of these fails here; `tsc` already rejects most of them, and this
 * is the belt to that pair of braces (a `rewards` object widened by a future
 * edit compiles fine — it just must not ship).
 */
const NEVER_SOLD_REWARD_KEYS = [
  'energy',
  'charges',
  'charge',
  'dna',
  'currency',
  'coins',
  'xp',
  'progress',
  'variants',
  'variant',
  'traits',
  'genes',
  'splices',
  'heirlooms',
  'breeding',
  'rerolls',
  'rerollTokens',
  'days',
  'attempts',
  'objectives',
  'offline',
  'multiplier',
  'boost',
];

describe('The one-time catalogue (§10.2)', () => {
  it('is empty — no §10.2 archetype has shipped yet', () => {
    // Not a placeholder assertion: an empty catalogue is the *shipped state*
    // after WP-0.09, and a SKU appearing without the tests below being
    // reconsidered is exactly what this is here to notice.
    expect(ALL_PRODUCTS).toEqual([]);
  });

  it('offers only the archetypes §10.2 permits, and nothing consumable', () => {
    for (const product of ALL_PRODUCTS) {
      expect(['cosmetic', 'season', 'patronage']).toContain(product.type);
    }
  });

  it('prices every SKU in gross EUR (Austrian/EU storefront, PAngG)', () => {
    for (const product of ALL_PRODUCTS) {
      expect(product.currency).toBe('eur');
      expect(product.price).toBeGreaterThan(0);
    }
  });

  it('fully specifies every SKU pre-payment (R4: no surprise contents)', () => {
    for (const product of ALL_PRODUCTS) {
      expect(product.id).toMatch(/\S/);
      expect(product.name).toMatch(/\S/);
      expect(product.description.length).toBeGreaterThan(10);
      expect(product.stripePriceId).toMatch(/\S/);
    }
  });
});

describe('No SKU grants energy, DNA or progression (§10.4, R3)', () => {
  it('declares nothing but cosmetics in its rewards, catalogue-wide', () => {
    for (const product of ALL_PRODUCTS) {
      const rewardKeys = Object.keys(product.rewards);
      expect(rewardKeys.sort()).toEqual(
        rewardKeys.filter((key) => key === 'cosmetics').sort()
      );
    }
  });

  it('carries no never-sold key under any casing, catalogue-wide', () => {
    for (const product of ALL_PRODUCTS) {
      const keys = Object.keys(product.rewards).map((k) => k.toLowerCase());
      for (const forbidden of NEVER_SOLD_REWARD_KEYS) {
        expect(keys).not.toContain(forbidden.toLowerCase());
      }
    }
  });

  it('grants no number anywhere in a reward payload', () => {
    // Money touches no computed number (R3). A cosmetic is a code, never a
    // quantity, so a numeric leaf in `rewards` is a violation by shape and
    // needs no knowledge of what it was called.
    const numericLeaf = (value: unknown): boolean => {
      if (typeof value === 'number') return true;
      if (Array.isArray(value)) return value.some(numericLeaf);
      if (value && typeof value === 'object') {
        return Object.values(value).some(numericLeaf);
      }
      return false;
    };

    for (const product of ALL_PRODUCTS) {
      expect(numericLeaf(product.rewards)).toBe(false);
    }
  });

  it('keeps the reward type itself incapable of expressing a grant', () => {
    // The enforcement is the type, not this test: the test proves the type
    // still says what the comment claims. Widening `rewards` is a change to
    // the never-sold list (§10.4) and must fail here loudly.
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/stripe/products.ts'),
      'utf8'
    );
    const rewardsBlock = source.slice(
      source.indexOf('rewards: {'),
      source.indexOf('export const ALL_PRODUCTS')
    );
    expect(rewardsBlock).toContain('cosmetics?: string[]');
    for (const forbidden of NEVER_SOLD_REWARD_KEYS) {
      expect(rewardsBlock).not.toMatch(
        new RegExp(`\\b${forbidden}\\??\\s*:`, 'i')
      );
    }
  });
});

describe('getProductById', () => {
  it('resolves nothing for the five retired SKUs', () => {
    for (const id of RETIRED_SKU_IDS) {
      expect(getProductById(id)).toBeUndefined();
    }
  });

  it('returns undefined for an unknown id', () => {
    expect(getProductById('not_a_product')).toBeUndefined();
    expect(getProductById('')).toBeUndefined();
  });

  it('resolves whatever the catalogue does contain, by identity', () => {
    for (const product of ALL_PRODUCTS as StoreProduct[]) {
      expect(getProductById(product.id)).toBe(product);
    }
  });
});
