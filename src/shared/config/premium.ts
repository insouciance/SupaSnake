/**
 * SupaSnake Premium - Subscription Configuration
 * Design doc: docs/game/MONETIZATION_DESIGN.md (LOCKED)
 *
 * Never pay-to-win, no paid RNG: every perk is convenience, cosmetic or
 * collection progression - never competitive power. All perks are enforced
 * server-side; these constants mirror migration 028 - keep in lockstep.
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

  /** Daily Lab Stipend: +3 energy once per UTC day (028 claim_premium_stipend) */
  stipendEnergyPerDay: 3,

  /** Contracts: premium picks 3 of 3 daily contracts (028 pick_contracts) */
  contracts: {
    picksPerDayFree: 2,
    picksPerDayPremium: 3,
  },

  /** Offline DNA cap: 24h free -> 48h premium (API-side override) */
  passiveProgress: {
    maxOfflineHoursPremium: 48,
  },

  /** Breeding queue slots - INERT until the breeding queue feature ships
   *  (breeding is instant today; see GAME_CONFIG.breeding.maxActive) */
  breeding: {
    maxActivePremium: 5,
  },

  /** past_due keeps perks this many days past the paid period while Stripe
   *  Smart Retries run - keep in lockstep with has_premium() in 028 */
  graceDaysPastDue: 7,
} as const);

export type PremiumConfig = typeof PREMIUM_CONFIG;
