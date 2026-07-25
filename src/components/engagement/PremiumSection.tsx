'use client';

/**
 * PremiumSection - the SupaSnake Premium subscription card in the shop, and
 * the only commercial surface this screen is allowed (Rule 7).
 * Authority: docs/PRODUCT_CONSTITUTION.md §10.2/§10.4.
 * docs/game/MONETIZATION_DESIGN.md is SUPERSEDED.
 *
 * **The perk list below is the advertisement, so it may only contain things
 * that exist.** WP-0.09 removed three entries that did not survive that test:
 * "Season Pass included" (Season 1 seeds no premium tiers - the perk had no
 * content behind it at all), "Triple Contracts" and "Extended Lab Uptime"
 * (both were paid progression rates, §10.4, and are deleted from the server).
 * What remains is expressive: a monthly cosmetic drop, supporter marks, and
 * the stats dashboard. Adding a line here without shipped content behind it
 * is a false advertisement, not a copy change.
 *
 * Subscribing requires two active consents (not persisted -
 * an active choice per visit):
 *   1. §10 FAGG service-start consent (digital service, pro-rata refund
 *      on withdrawal per §16 FAGG)
 *   2. 18+ self-declaration (recurring billing)
 * Subscribed state shows billing summary + the Manage button (Stripe
 * Customer Portal - the EU easy-cancellation surface).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { usePremiumStore } from '@/lib/stores/premiumStore';
import { PREMIUM_PLANS, type PremiumPlan } from '@/lib/stripe/premium';
import { IconCrown, IconMedal } from '@/components/ui/icons';

/**
 * Every line here is shipped and appearance-only. None of them changes a
 * number the game computes (Rule 3), which is why none of them reads a
 * config value: there is no quantity to read.
 */
const PERKS: { title: string; detail: string }[] = [
  {
    title: 'Monthly exclusive cosmetic',
    detail: 'A new supporter-only trail, emblem or banner every month',
  },
  {
    title: 'Supporter prestige',
    detail: 'Patron badge, aurora frame and a crown by your name everywhere',
  },
  {
    title: 'Lab Analytics',
    detail: 'The advanced stats dashboard for your runs and dynasties',
  },
];

export interface PremiumSectionProps {
  /** Anonymous users cannot subscribe - the CTA opens the upgrade modal. */
  onRequireAccount: () => void;
}

export function PremiumSection({ onRequireAccount }: PremiumSectionProps) {
  const { session, isAuthenticated, isAnonymous } = useAuth();
  const {
    isPremium,
    billingInterval,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    currentDrop,
    fetchStatus,
  } = usePremiumStore();

  const [plan, setPlan] = useState<PremiumPlan>(PREMIUM_PLANS[0]);
  const [serviceStartConsent, setServiceStartConsent] = useState(false);
  const [adultConfirmation, setAdultConfirmation] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && session?.access_token) {
      fetchStatus(session.access_token);
    }
  }, [isAuthenticated, session?.access_token, fetchStatus]);

  const handleSubscribe = async () => {
    if (isAnonymous) {
      onRequireAccount();
      return;
    }
    if (!isAuthenticated || !session?.access_token) {
      setError('Please sign in to subscribe');
      return;
    }
    if (!serviceStartConsent || !adultConfirmation) {
      setConsentError('Please confirm both statements below first.');
      return;
    }

    setLoading(true);
    setError(null);
    setConsentError(null);
    try {
      const response = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          planId: plan.id,
          serviceStartConsent,
          adultConfirmation,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Subscription failed');
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed');
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/premium/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not open the billing portal');
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the billing portal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-10 animate-fade-up" data-testid="premium-section">
      <h2 className="heading-display text-2xl text-bone-white mb-2 flex items-center gap-2">
        <IconCrown size={24} className="text-amber-300" />
        SupaSnake Premium
      </h2>
      <p className="text-beige font-body mb-6">
        Support the game and wear it. Appearance and recognition only — never
        pay-to-win, and nothing here touches a number the game computes.
      </p>

      <div className="panel-glow [--glow:#fbbf24] p-6">
        {/* Perks */}
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {PERKS.map((perk) => (
            <li key={perk.title} className="flex items-start gap-2.5">
              <IconMedal size={18} className="text-amber-300 shrink-0 mt-0.5" />
              <span className="font-body text-sm">
                <span className="text-bone-white">{perk.title}</span>{' '}
                <span className="text-beige/70">— {perk.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        {isPremium ? (
          /* Subscribed state: drop + billing summary + manage */
          <div className="space-y-4" data-testid="premium-subscribed">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-amber-300 font-display uppercase flex items-center gap-2">
                  <IconCrown size={16} />
                  Premium active
                </p>
                <p className="text-beige text-sm font-body">
                  {billingInterval === 'year' ? 'Yearly' : 'Monthly'} plan
                  {currentPeriodEnd && (
                    <>
                      {' '}
                      · {cancelAtPeriodEnd ? 'ends' : 'renews'}{' '}
                      {new Date(currentPeriodEnd).toLocaleDateString()}
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={handleManage}
                disabled={loading}
                data-testid="premium-manage"
                className="btn-neutral px-4 py-2 min-h-[44px]"
              >
                {loading ? '...' : 'Manage subscription'}
              </button>
            </div>

            {/* The daily energy stipend is gone (Constitution §8.6/§10.4:
                Energy is never sold, gifted or stipended, and no perk may
                touch it). Premium's cosmetic drop remains. */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {currentDrop && (
                <span
                  data-testid="premium-current-drop"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-arcade border border-amber-300/50 bg-amber-300/10 text-amber-300 text-sm font-body"
                >
                  <IconMedal size={14} />
                  This month: {currentDrop.name}
                  {currentDrop.claimed ? ' ✓' : ''}
                </span>
              )}
            </div>

            {error && (
              <p className="text-strike-red text-sm font-body">{error}</p>
            )}
          </div>
        ) : (
          <>
            {/* Plan toggle + price */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
              <div
                className="flex rounded-arcade border border-scale-blue-light/60 overflow-hidden"
                role="group"
                aria-label="Billing interval"
              >
                {PREMIUM_PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlan(p)}
                    data-testid={`premium-plan-${p.id}`}
                    className={`px-4 py-2 text-sm font-display uppercase min-h-[44px] transition-colors ${
                      plan.id === p.id
                        ? 'bg-amber-300/20 text-amber-300'
                        : 'bg-void/50 text-beige/70 hover:text-bone-white'
                    }`}
                  >
                    {p.interval === 'month' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
              <div>
                <span className="text-2xl font-display text-amber-300">
                  €{plan.priceEur.toFixed(2)}
                </span>
                <span className="text-beige/70 text-sm font-body">
                  {' '}
                  / {plan.interval === 'month' ? 'month' : 'year'} incl. VAT
                </span>
                {plan.interval === 'year' && (
                  <span className="ml-2 px-2 py-0.5 bg-amber-300/15 border border-amber-300/60 rounded-arcade text-xs font-display uppercase text-amber-300">
                    2 months free
                  </span>
                )}
              </div>
            </div>

            {/* Subscription consents (§10 FAGG + 18+) - active choice, never persisted */}
            <div
              className={`space-y-3 mb-4 ${
                consentError ? 'p-3 border-2 border-strike-red rounded-arcade' : ''
              }`}
            >
              <label
                htmlFor="premium-service-consent"
                className="flex items-start gap-3 cursor-pointer text-sm text-beige font-body"
              >
                <input
                  id="premium-service-consent"
                  type="checkbox"
                  checked={serviceStartConsent}
                  onChange={(e) => {
                    setServiceStartConsent(e.target.checked);
                    if (e.target.checked) setConsentError(null);
                  }}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-amber-300"
                />
                <span>
                  I expressly request that the Premium service starts
                  immediately. If I withdraw within 14 days, I pay only a
                  proportionate amount for the service already provided
                  (§§ 10, 16 FAGG) —{' '}
                  <Link
                    href="/legal/withdrawal"
                    target="_blank"
                    className="text-amber-300 hover:underline"
                  >
                    withdrawal notice
                  </Link>
                  .
                </span>
              </label>
              <label
                htmlFor="premium-adult-consent"
                className="flex items-start gap-3 cursor-pointer text-sm text-beige font-body"
              >
                <input
                  id="premium-adult-consent"
                  type="checkbox"
                  checked={adultConfirmation}
                  onChange={(e) => {
                    setAdultConfirmation(e.target.checked);
                    if (e.target.checked) setConsentError(null);
                  }}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-amber-300"
                />
                <span>
                  I confirm that I am at least 18 years old. Recurring
                  subscriptions are available to adults only.
                </span>
              </label>
              {consentError && (
                <p className="text-strike-red text-sm font-body">{consentError}</p>
              )}
            </div>

            {error && (
              <p className="text-strike-red text-sm font-body mb-3">{error}</p>
            )}

            {isAnonymous ? (
              <button
                onClick={onRequireAccount}
                data-testid="premium-create-account"
                className="btn-arcade min-h-[44px] px-6 py-2 text-xs bg-void/40 border-venom-orange text-venom-orange hover:bg-venom-orange hover:text-void-deep transition-all"
              >
                Create an account to subscribe
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={loading}
                data-testid="premium-subscribe"
                className="btn-go min-h-[44px] px-8 py-2"
              >
                {loading ? '...' : 'Subscribe'}
              </button>
            )}

            <p className="text-beige/50 text-xs font-body mt-3">
              Cancel anytime — your perks run until the end of the paid
              period. Managed securely by Stripe.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default PremiumSection;
