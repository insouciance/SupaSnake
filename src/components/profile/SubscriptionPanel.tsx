'use client';

/**
 * SubscriptionPanel - the settings surface for SupaSnake Premium.
 *
 * EU easy-cancellation: subscribers always see a visible
 * "Manage / cancel subscription" button here (Stripe Customer Portal -
 * cancel anytime, effective at period end). Non-subscribers get a quiet
 * link to the shop - settings is not an upsell surface.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { usePremiumStore } from '@/lib/stores/premiumStore';
import { IconCrown } from '@/components/ui/icons';

export function SubscriptionPanel() {
  const { session, isAuthenticated } = useAuth();
  const {
    live,
    isPremium,
    status,
    billingInterval,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    fetchStatus,
  } = usePremiumStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && session?.access_token) {
      fetchStatus(session.access_token);
    }
  }, [isAuthenticated, session?.access_token, fetchStatus]);

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

  if (!live) return null;

  return (
    <div className="panel-elevated p-6 mb-6 animate-fade-up" data-testid="subscription-panel">
      <h2 className="heading-display text-xl text-bone-white mb-4 flex items-center gap-2">
        <IconCrown size={20} className="text-amber-300" />
        Subscription
      </h2>

      {isPremium ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-amber-300 font-body">SupaSnake Premium — active</p>
            <p className="text-beige text-sm font-body">
              {billingInterval === 'year' ? 'Yearly' : 'Monthly'} plan
              {currentPeriodEnd && (
                <>
                  {' '}
                  · {cancelAtPeriodEnd ? 'ends' : 'renews'}{' '}
                  {new Date(currentPeriodEnd).toLocaleDateString()}
                </>
              )}
              {status === 'past_due' && (
                <span className="text-strike-red"> · payment issue — please update your card</span>
              )}
            </p>
          </div>
          <button
            onClick={handleManage}
            disabled={loading}
            data-testid="subscription-manage"
            className="btn-neutral px-4 py-2 min-h-[44px]"
          >
            {loading ? '...' : 'Manage / cancel subscription'}
          </button>
        </div>
      ) : (
        <p className="text-beige text-sm font-body">
          No active subscription.{' '}
          <Link href="/shop" className="text-amber-300 hover:underline">
            Learn about SupaSnake Premium
          </Link>
          .
        </p>
      )}

      {error && <p className="text-strike-red text-sm font-body mt-3">{error}</p>}
    </div>
  );
}

export default SubscriptionPanel;
