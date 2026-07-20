/**
 * SupaSnake Premium - Stripe Billing plans
 * Design doc: docs/game/MONETIZATION_DESIGN.md (LOCKED)
 *
 * Subscriptions are intentionally NOT StoreProducts: the one-time grant
 * path (rewards JSON in checkout metadata -> grant_purchase_rewards) does
 * not apply. Premium entitlement is derived from subscription lifecycle
 * webhooks -> apply_subscription_update (migration 028).
 *
 * Stripe Dashboard setup (dedicated SupaSnake account - NEVER Court OS):
 * one product "SupaSnake Premium", two recurring EUR prices with
 * tax_behavior=inclusive (displayed prices are gross incl. VAT, PAngG).
 */

export interface PremiumPlan {
  id: 'premium_monthly' | 'premium_yearly';
  name: string;
  /** Gross EUR incl. VAT - mirrors PREMIUM_CONFIG.plans */
  priceEur: number;
  interval: 'month' | 'year';
  stripePriceId: string; // Set from environment variables
}

export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    id: 'premium_monthly',
    name: 'SupaSnake Premium (Monthly)',
    priceEur: 9.99,
    interval: 'month',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY || '',
  },
  {
    id: 'premium_yearly',
    name: 'SupaSnake Premium (Yearly)',
    priceEur: 89.99,
    interval: 'year',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY || '',
  },
];

export function getPremiumPlanById(id: string): PremiumPlan | undefined {
  return PREMIUM_PLANS.find(p => p.id === id);
}
