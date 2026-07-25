/**
 * Stripe Products Configuration
 * Defines purchasable items in the game
 * Per BM-001: Pay for convenience, not power
 */

export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  /** Gross price incl. VAT (PAngG display rule; Stripe Tax inclusive) */
  price: number;
  /** ISO currency - EUR storefront for the Austrian/EU launch */
  currency: 'eur';
  stripePriceId: string; // Set from environment variables
  type: 'energy' | 'bundle' | 'battlepass';
  rewards: {
    energy?: number;
    dna?: number;
    variants?: string[]; // snake_variants.name values (resolved to UUIDs server-side)
    days?: number; // For battlepass
  };
}

/**
 * Energy products - instant energy refills
 * Per BM-001: Pay for convenience (energy = time saving)
 */
export const ENERGY_PRODUCTS: StoreProduct[] = [
  {
    id: 'energy_small',
    name: 'Energy Pack',
    description: '3 Energy - Play more today',
    price: 0.99,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_ENERGY_SMALL || '',
    type: 'energy',
    rewards: { energy: 3 },
  },
  {
    id: 'energy_medium',
    name: 'Energy Bundle',
    description: '10 Energy - Best value',
    price: 2.49,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_ENERGY_MEDIUM || '',
    type: 'energy',
    rewards: { energy: 10 },
  },
  {
    id: 'energy_large',
    name: 'Energy Vault',
    description: '25 Energy - For dedicated players',
    price: 4.99,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_ENERGY_LARGE || '',
    type: 'energy',
    rewards: { energy: 25 },
  },
];

/**
 * Starter bundles - appear Day 2-3 per BM-004
 * Per BM-001: Variants achievable through play
 *
 * The Energy components were removed from the DESCRIPTIONS by WP-0.01:
 * Constitution §8.6 replaced the energy balance with a daily allotment that
 * has nothing to top up, so a bundle could no longer deliver what its copy
 * promised, and taking money against an undeliverable claim is not a thing
 * to leave running until the next work package. The `rewards.energy` values
 * are left in place for WP-0.09, which owns this file and deletes both
 * ENERGY_PRODUCTS and these bundles outright; they now write only the
 * deprecated `players.energy` column, which nothing reads.
 */
export const BUNDLE_PRODUCTS: StoreProduct[] = [
  {
    id: 'starter_bundle',
    name: 'Starter Bundle',
    description: '1000 DNA + 1 Rare Variant',
    price: 2.99,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_BUNDLE || '',
    type: 'bundle',
    rewards: {
      energy: 20,
      dna: 1000,
      variants: ['CYBER VORTEX'], // Rare variant
    },
  },
  {
    id: 'dynasty_bundle',
    name: 'Dynasty Booster',
    description: '3000 DNA + 1 Epic Variant',
    price: 9.99,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_DYNASTY_BUNDLE || '',
    type: 'bundle',
    rewards: {
      energy: 50,
      dna: 3000,
      variants: ['COSMIC SUPERNOVA'], // Epic variant
    },
  },
];

/**
 * All products combined
 */
export const ALL_PRODUCTS: StoreProduct[] = [
  ...ENERGY_PRODUCTS,
  ...BUNDLE_PRODUCTS,
];

/**
 * Get product by ID
 */
export function getProductById(id: string): StoreProduct | undefined {
  return ALL_PRODUCTS.find(p => p.id === id);
}

/**
 * Check if bundles should be shown (Day 2-3 per BM-004)
 */
export function shouldShowBundles(accountCreatedAt: Date): boolean {
  const now = new Date();
  const diffMs = now.getTime() - accountCreatedAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Show bundles starting Day 2 (48 hours)
  return diffDays >= 2;
}
