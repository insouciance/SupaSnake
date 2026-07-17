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
import { AccountUpgradeModal } from '@/components/auth/UpgradePrompt';
import Link from 'next/link';
import { IconBolt, IconCart, IconDna, IconSnake } from '@/components/ui/icons';

export default function ShopPage() {
  const { user, session, isAuthenticated, isAnonymous } = useAuth();
  const { dnaBalance, energy, maxEnergy, energyRegenAt } = useWalletSync();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBundles, setShowBundles] = useState(false);
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Check URL params for success/cancel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setSuccess(true);
    }
    if (params.get('canceled') === 'true') {
      setCanceled(true);
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

  // Anonymous accounts are ephemeral - purchases must land on a real
  // account, so the buy button is replaced by an account-creation CTA.
  const renderPurchaseButton = (product: StoreProduct, buyLabel: string) => {
    if (isAnonymous) {
      return (
        <button
          onClick={() => setShowUpgrade(true)}
          data-testid={`create-account-cta-${product.id}`}
          className="btn-arcade min-h-[44px] px-4 py-2 text-xs bg-void/40 border-venom-orange text-venom-orange hover:bg-venom-orange hover:text-void-deep transition-all"
        >
          Create an account to purchase
        </button>
      );
    }
    return (
      <button
        onClick={() => handlePurchase(product)}
        disabled={loading !== null}
        className={`btn-go min-h-[44px] px-6 py-2 ${
          loading === product.id ? 'cursor-wait' : ''
        }`}
      >
        {loading === product.id ? '...' : buyLabel}
      </button>
    );
  };

  return (
    <div className="app-bg text-bone-white p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 animate-fade-up">
        <div>
          <h1 className="heading-display text-4xl text-venom-orange text-glow-orange flex items-center gap-3">
            <IconCart size={32} />
            Shop
          </h1>
          <p className="text-beige font-body">Power up your snake empire</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          {/* DNA Balance */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-arcade border border-scale-blue-light/60 bg-void/70">
            <IconDna size={18} className="text-venom-orange" />
            <span className="text-bone-white font-display">{dnaBalance.toLocaleString()}</span>
          </div>
          <div className="flex items-center px-3 py-1.5 rounded-arcade border border-scale-blue-light/60 bg-void/70">
            <EnergyTimer
              energy={energy}
              maxEnergy={maxEnergy}
              energyRegenAt={energyRegenAt}
            />
          </div>
          <Link
            href="/"
            className="btn-neutral px-4 py-2 min-h-[44px] inline-flex items-center"
          >
            Back
          </Link>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="panel-glow [--glow:#22d3ee] p-4 mb-6 animate-pop-in">
          <p className="text-venom-orange font-display uppercase">Purchase successful!</p>
          <p className="text-beige text-sm font-body">Your rewards have been added to your account.</p>
        </div>
      )}

      {/* Canceled Message */}
      {canceled && (
        <div className="panel p-4 mb-6 animate-fade-up">
          <p className="text-beige font-display uppercase">Checkout canceled</p>
          <p className="text-beige/70 text-sm font-body">No charge was made. Come back anytime.</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-strike-red/15 border border-strike-red/70 rounded-arcade p-4 mb-6 animate-fade-up">
          <p className="text-strike-red font-body">{error}</p>
        </div>
      )}

      {/* Anonymous User Notice */}
      {isAnonymous && (
        <div className="panel-glow [--glow:#22d3ee] p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-up">
          <div>
            <p className="text-venom-orange font-display uppercase">Save your progress!</p>
            <p className="text-beige text-sm font-body">
              Purchases need an account so they can never be lost with this device.
            </p>
          </div>
          <button
            onClick={() => setShowUpgrade(true)}
            className="btn-go shrink-0 px-4 py-2 text-xs min-h-[44px]"
          >
            Create Account
          </button>
        </div>
      )}

      {/* Energy Section */}
      <section className="mb-10 animate-fade-up">
        <h2 className="heading-display text-2xl text-bone-white mb-2">Energy Packs</h2>
        <p className="text-beige font-body mb-6">Get more energy to keep playing</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ENERGY_PRODUCTS.map((product) => (
            <div
              key={product.id}
              className="panel-elevated p-6 hover:border-venom-orange/70 transition-colors"
            >
              <div className="flex items-center gap-3 mb-4">
                <IconBolt size={32} className="text-venom-orange shrink-0" />
                <div>
                  <h3 className="heading-display text-bone-white">{product.name}</h3>
                  <p className="text-beige text-sm font-body">{product.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-2xl font-display text-venom-orange">
                  ${product.priceUsd.toFixed(2)}
                </span>
                {renderPurchaseButton(product, 'Buy')}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bundles Section - Only show after Day 2 per BM-004 */}
      {showBundles && (
        <section className="mb-10 animate-fade-up">
          <h2 className="heading-display text-2xl text-bone-white mb-2">Bundles</h2>
          <p className="text-beige font-body mb-6">Best value packages</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BUNDLE_PRODUCTS.map((product) => (
              <div
                key={product.id}
                className="panel-glow [--glow:#22d3ee] p-6"
              >
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="heading-display text-xl text-bone-white">{product.name}</h3>
                    <p className="text-beige text-sm font-body">{product.description}</p>
                  </div>
                  {product.id === 'starter_bundle' && (
                    <span className="shrink-0 px-2 py-1 bg-danger-gradient border border-strike-red rounded-arcade text-xs font-display uppercase text-bone-white shadow-glow-sm shadow-strike-red/50">
                      80% OFF
                    </span>
                  )}
                </div>

                {/* Rewards Preview */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {product.rewards.energy && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-venom-orange/15 rounded-arcade border border-venom-orange/60 text-venom-orange text-sm font-body">
                      <IconBolt size={14} />
                      {product.rewards.energy} Energy
                    </span>
                  )}
                  {product.rewards.dna && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-void/50 rounded-arcade border border-scale-blue-light/60 text-bone-white text-sm font-body">
                      <IconDna size={14} className="text-venom-orange" />
                      {product.rewards.dna} DNA
                    </span>
                  )}
                  {product.rewards.variants && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-void/50 rounded-arcade border border-scale-blue-light/60 text-bone-white text-sm font-body">
                      <IconSnake size={14} className="text-venom-orange" />
                      {product.rewards.variants.length} Exclusive Variant
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xl font-display text-venom-orange text-glow-orange">
                    ${product.priceUsd.toFixed(2)}
                  </span>
                  {renderPurchaseButton(product, 'Buy Bundle')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Fair Play Notice */}
      <section className="text-center text-beige/60 text-sm font-body">
        <div className="divider-glow max-w-md mx-auto mb-4" />
        <p>All variants can be unlocked through gameplay.</p>
        <p>Purchases provide convenience, not power advantages.</p>
      </section>

      {/* Account upgrade modal (anonymous users only) */}
      <AccountUpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
}
