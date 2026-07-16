'use client';

/**
 * Shop Page - Energy refills and bundles
 * Per BM-001: Pay for convenience, not power
 * Per BM-004: Bundles appear after engagement (Day 2+)
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useWalletSync } from '@/hooks/useWalletSync';
import {
  ENERGY_PRODUCTS,
  BUNDLE_PRODUCTS,
  shouldShowBundles,
  StoreProduct,
} from '@/lib/stripe/products';
import { EnergyTimer } from '@/components/ui/EnergyTimer';
import Link from 'next/link';

export default function ShopPage() {
  const { user, session, isAuthenticated, isAnonymous } = useAuth();
  const { dnaBalance, energy, maxEnergy, energyRegenAt } = useWalletSync();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBundles, setShowBundles] = useState(false);
  const [success, setSuccess] = useState(false);

  // Check URL params for success/cancel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setSuccess(true);
    }
  }, []);

  // Check if bundles should be shown (Day 2+ per BM-004)
  useEffect(() => {
    if (user?.created_at) {
      setShowBundles(shouldShowBundles(new Date(user.created_at)));
    }
  }, [user?.created_at]);

  const handlePurchase = async (product: StoreProduct) => {
    if (!isAuthenticated || !session?.access_token) {
      setError('Please sign in to make purchases');
      return;
    }

    setLoading(product.id);
    setError(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ productId: product.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Purchase failed');
      }

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-scale-blue-dark text-bone-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">Shop</h1>
          <p className="text-beige font-body">Power up your snake empire</p>
        </div>
        <div className="flex items-center gap-6">
          {/* DNA Balance */}
          <div className="flex items-center gap-2 px-3 py-1 bg-scale-blue rounded-arcade border-[2px] border-scale-blue-light">
            <span className="text-lg">🧬</span>
            <span className="text-bone-white font-display">{dnaBalance.toLocaleString()}</span>
          </div>
          <EnergyTimer
            energy={energy}
            maxEnergy={maxEnergy}
            energyRegenAt={energyRegenAt}
          />
          <Link
            href="/"
            className="px-4 py-2 bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-bone-white hover:bg-scale-blue-light transition-all"
          >
            Back
          </Link>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-venom-orange/20 border-[3px] border-venom-orange rounded-arcade p-4 mb-6">
          <p className="text-venom-orange font-display uppercase">Purchase successful!</p>
          <p className="text-beige text-sm font-body">Your rewards have been added to your account.</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-strike-red/20 border-[3px] border-strike-red rounded-arcade p-4 mb-6">
          <p className="text-strike-red font-body">{error}</p>
        </div>
      )}

      {/* Anonymous User Notice */}
      {isAnonymous && (
        <div className="bg-venom-orange/10 border-[3px] border-venom-orange-dark rounded-arcade p-4 mb-6">
          <p className="text-venom-orange font-display uppercase">Save your progress!</p>
          <p className="text-beige text-sm font-body">
            Create an account to keep your purchases across devices.
          </p>
        </div>
      )}

      {/* Energy Section */}
      <section className="mb-10">
        <h2 className="text-2xl font-display uppercase tracking-arcade text-bone-white mb-2">Energy Packs</h2>
        <p className="text-beige font-body mb-6">Get more energy to keep playing</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ENERGY_PRODUCTS.map((product) => (
            <div
              key={product.id}
              className="bg-scale-blue rounded-arcade p-6 border-[3px] border-scale-blue-light hover:border-venom-orange transition-colors"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="text-3xl">⚡</div>
                <div>
                  <h3 className="font-display uppercase tracking-arcade text-bone-white">{product.name}</h3>
                  <p className="text-beige text-sm font-body">{product.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-2xl font-display text-venom-orange">
                  ${product.priceUsd.toFixed(2)}
                </span>
                <button
                  onClick={() => handlePurchase(product)}
                  disabled={loading !== null}
                  className={`px-6 py-2 rounded-arcade border-[3px] font-display uppercase tracking-arcade transition-all ${
                    loading === product.id
                      ? 'bg-scale-blue-light border-scale-blue text-beige cursor-wait'
                      : 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {loading === product.id ? '...' : 'Buy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bundles Section - Only show after Day 2 per BM-004 */}
      {showBundles && (
        <section className="mb-10">
          <h2 className="text-2xl font-display uppercase tracking-arcade text-bone-white mb-2">Bundles</h2>
          <p className="text-beige font-body mb-6">Best value packages</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BUNDLE_PRODUCTS.map((product) => (
              <div
                key={product.id}
                className="bg-scale-blue rounded-arcade p-6 border-[3px] border-venom-orange"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display uppercase tracking-arcade text-xl text-bone-white">{product.name}</h3>
                    <p className="text-beige text-sm font-body">{product.description}</p>
                  </div>
                  {product.id === 'starter_bundle' && (
                    <span className="px-2 py-1 bg-strike-red border-[2px] border-red-900 rounded-arcade text-xs font-display uppercase text-bone-white">
                      80% OFF
                    </span>
                  )}
                </div>

                {/* Rewards Preview */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {product.rewards.energy && (
                    <span className="px-3 py-1 bg-venom-orange/20 rounded-arcade border-[2px] border-venom-orange-dark text-venom-orange text-sm font-body">
                      ⚡ {product.rewards.energy} Energy
                    </span>
                  )}
                  {product.rewards.dna && (
                    <span className="px-3 py-1 bg-scale-blue-light/50 rounded-arcade border-[2px] border-scale-blue-light text-bone-white text-sm font-body">
                      🧬 {product.rewards.dna} DNA
                    </span>
                  )}
                  {product.rewards.variants && (
                    <span className="px-3 py-1 bg-scale-blue-light/50 rounded-arcade border-[2px] border-scale-blue-light text-bone-white text-sm font-body">
                      🐍 {product.rewards.variants.length} Exclusive Variant
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-2xl font-display text-venom-orange">
                    ${product.priceUsd.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handlePurchase(product)}
                    disabled={loading !== null}
                    className={`px-6 py-2 rounded-arcade border-[3px] font-display uppercase tracking-arcade transition-all ${
                      loading === product.id
                        ? 'bg-scale-blue-light border-scale-blue text-beige cursor-wait'
                        : 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  >
                    {loading === product.id ? '...' : 'Buy Bundle'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Fair Play Notice */}
      <section className="text-center text-beige/60 text-sm font-body">
        <p>All variants can be unlocked through gameplay.</p>
        <p>Purchases provide convenience, not power advantages.</p>
      </section>
    </div>
  );
}
