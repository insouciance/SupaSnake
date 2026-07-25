/**
 * One-time Stripe products — the catalogue of things SupaSnake sells outright.
 *
 * Authority: docs/PRODUCT_CONSTITUTION.md §10 (§10.2 the four SKU archetypes,
 * §10.4 the never-sold list) and Rules R3/R4. docs/game/MONETIZATION_DESIGN.md
 * is SUPERSEDED — nothing here is implemented from it.
 *
 * **The catalogue is empty, and that is the shipped state.** WP-0.09 deleted
 * ENERGY_PRODUCTS (3 SKUs) and BUNDLE_PRODUCTS (2 SKUs): every one of them
 * granted Energy, DNA or a variant, all three of which §10.4 puts on the
 * never-sold list. Nothing replaces them in Phase 0. The Atelier, the
 * Chronicle Season and Patronage (§10.2) are the archetypes that will fill
 * this file, each arriving with its own server-side grant path.
 *
 * The `rewards` shape is the enforcement, not a convention: it can express
 * cosmetics and nothing else, so `tsc` rejects a SKU that grants energy, DNA,
 * XP, variants or days before a reviewer ever sees it. Widening it is a change
 * to the never-sold list and needs a constitutional amendment (§10.4), not a
 * pull request.
 */

/** The only SKU archetypes §10.2 permits. Nothing sold is consumable. */
export type StoreProductType = 'cosmetic' | 'season' | 'patronage';

export interface StoreProduct {
  id: string;
  name: string;
  /** Fully specified pre-payment (R4) — no surprise contents, no randomness. */
  description: string;
  /** Gross price incl. VAT (PAngG display rule; Stripe Tax inclusive) */
  price: number;
  /** ISO currency - EUR storefront for the Austrian/EU launch */
  currency: 'eur';
  stripePriceId: string; // Set from environment variables
  type: StoreProductType;
  /**
   * What the purchase delivers. Permanent and appearance-only by
   * construction: `cosmetic_definitions.code` values, resolved to rows
   * server-side. No numeric grant of any kind may be added here (R3: money
   * touches no computed number).
   */
  rewards: {
    cosmetics?: string[];
  };
}

/**
 * Every one-time SKU on sale. Empty until an §10.2 archetype ships.
 */
export const ALL_PRODUCTS: readonly StoreProduct[] = [];

/**
 * Get product by ID. Returns undefined for every id today — including the
 * five retired ones — which is what stops the checkout and webhook paths
 * from fulfilling a deleted SKU.
 */
export function getProductById(id: string): StoreProduct | undefined {
  return ALL_PRODUCTS.find((product) => product.id === id);
}
