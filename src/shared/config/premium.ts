/**
 * SupaSnake Premium — subscription configuration.
 *
 * Authority: docs/PRODUCT_CONSTITUTION.md §10 (§10.2 the Keeper archetype,
 * §10.4 the never-sold list) and Rules R3/R4. docs/game/MONETIZATION_DESIGN.md
 * is SUPERSEDED — nothing here is implemented from it.
 *
 * **What is in this file, stated exactly: billing plumbing and nothing else.**
 * A feature flag, two plan prices, and the grace window that keeps a lapsing
 * subscriber whole. There is no perk here, because there is no longer a perk
 * that is a number.
 *
 * WP-0.09 removed the three that were:
 *   - the daily energy stipend (+3/day) had already gone with migration 039
 *     (§8.6/§10.4: energy is never sold, gifted or stipended);
 *   - `contracts.picksPerDay{Free,Premium}` (3 picks instead of 2) — a paid
 *     progression rate, §10.4;
 *   - `passiveProgress.maxOfflineHoursPremium` (48h of offline DNA instead of
 *     24h) — paid offline anything, §10.4;
 *   - `breeding.maxActivePremium`, which was inert: it described a breeding
 *     queue that does not exist, and an advertised perk with no code behind it
 *     is a false claim whether or not it works.
 * WP-0.02 deleted the DNA multiplier stack outright, so there is no factor for
 * a perk to reintroduce even if one tried.
 *
 * What a subscription actually delivers today lives elsewhere, on purpose,
 * because none of it is a configurable quantity: the monthly cosmetic drop
 * (`premium_cosmetic_drops`, migration 028), the supporter badge and aurora
 * frame granted on activation (028), and the stats dashboard. All three are
 * expressive or presentational; none is claimed here.
 *
 * **Adding a key to this object that resolves to something a player receives
 * is a change to the never-sold list (§10.4) and needs a constitutional
 * amendment, not a pull request.** Phase 3 renames this to Keeper and reprices
 * it (§10.2: €3.99/month, €34.99/year); the prices below are what Stripe
 * charges today and may not drift from it.
 */

function deepFreeze<T extends object>(obj: T): T {
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

export const PREMIUM_CONFIG = deepFreeze({
  /** Feature flag: hides premium UI and 503s premium routes when false */
  enabled: true,

  /** Prices are gross EUR incl. VAT (PAngG display rule; Stripe Tax inclusive) */
  plans: {
    monthlyEur: 9.99,
    yearlyEur: 89.99,                // ~2 months free vs monthly
  },

  /** past_due keeps the subscription alive this many days past the paid
   *  period while Stripe Smart Retries run — keep in lockstep with
   *  has_premium() in migration 028. Grace protects the subscriber from a
   *  failed card; it grants nothing. */
  graceDaysPastDue: 7,
} as const);

export type PremiumConfig = typeof PREMIUM_CONFIG;
