'use client';

/**
 * Shop — the subscription card, and nothing else.
 *
 * Authority: docs/PRODUCT_CONSTITUTION.md §10 and Rule 7 (at most one
 * commercial surface per screen, none in-run or on Results).
 *
 * WP-0.09 removed the one-time storefront entirely. The Energy Packs section
 * went with §8.6/§10.4 — Energy is recovered only and never sold, so those
 * SKUs could not have delivered anything even if selling them were permitted.
 * The Bundles section went with them: both bundles sold
 * energy, DNA and a variant, all three on the never-sold list.
 *
 * The §18(1)(11) FAGG immediate-delivery consent checkbox went with the last
 * one-time product. It gated `POST /api/checkout`, which still enforces the
 * consent server-side and today refuses every productId; the checkbox returns
 * with the Atelier (§10.2), which is the next thing that can be bought
 * outright. A consent control for a purchase that cannot happen is noise, not
 * protection.
 *
 * The commercial surface on this screen is `PremiumSection`. There is exactly
 * one, and nothing may be added beside it.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useWalletSync } from '@/hooks/useWalletSync';
import { NavBar } from '@/components/ui/NavBar';
import { AccountUpgradeModal } from '@/components/auth/UpgradePrompt';
import { PremiumSection } from '@/components/engagement/PremiumSection';
import { GAME_CONFIG } from '@/shared/config/game';
import Link from 'next/link';
import { IconCart, IconDna } from '@/components/ui/icons';
import { formatAmount } from '@/shared/format/amount';

export default function ShopPage() {
  const { isAnonymous } = useAuth();
  const { dnaBalance } = useWalletSync();
  const [canceled, setCanceled] = useState(false);
  const [premiumSuccess, setPremiumSuccess] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Check URL params for success/cancel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('premium') === 'success') {
      setPremiumSuccess(true);
    }
    if (params.get('premium') === 'canceled' || params.get('canceled') === 'true') {
      setCanceled(true);
    }
  }, []);

  return (
    <div className="app-bg text-bone-white px-4 sm:px-6 pt-8 pb-28 sm:pb-6 sm:pr-16">
      {/* Global navigation rail */}
      <NavBar />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 animate-fade-up">
        <div>
          <h1 className="heading-display text-4xl text-venom-orange text-glow-orange flex items-center gap-3">
            <IconCart size={32} />
            Shop
          </h1>
          <p className="text-beige font-body">Support the game. Wear the colours.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          {/* DNA Balance */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-arcade border border-scale-blue-light/60 bg-void/70">
            <IconDna size={18} className="text-venom-orange" />
            <span className="text-bone-white font-display">{formatAmount(dnaBalance)}</span>
          </div>
          <Link
            href="/"
            className="btn-neutral px-4 py-2 min-h-[44px] inline-flex items-center"
          >
            Back
          </Link>
        </div>
      </div>

      {/* Premium Success Message */}
      {premiumSuccess && (
        <div className="panel-glow [--glow:#fbbf24] p-4 mb-6 animate-pop-in">
          <p className="text-amber-300 font-display uppercase">Welcome to Premium!</p>
          <p className="text-beige text-sm font-body">
            Thank you for supporting SupaSnake. Your supporter marks are active,
            and this month&apos;s cosmetic drop is waiting below.
          </p>
        </div>
      )}

      {/* Canceled Message */}
      {canceled && (
        <div className="panel p-4 mb-6 animate-fade-up">
          <p className="text-beige font-display uppercase">Checkout canceled</p>
          <p className="text-beige/70 text-sm font-body">No charge was made. Come back anytime.</p>
        </div>
      )}

      {/* Anonymous User Notice */}
      {isAnonymous && (
        <div className="panel-glow [--glow:#22d3ee] p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-up">
          <div>
            <p className="text-venom-orange font-display uppercase">Protect your account</p>
            <p className="text-beige text-sm font-body">
              Your progress is already server-secured. Add email recovery before a
              purchase so account access and entitlements can be restored.
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

      {/* SupaSnake Premium subscription — the one commercial surface (R7) */}
      {GAME_CONFIG.features.premium && (
        <PremiumSection onRequireAccount={() => setShowUpgrade(true)} />
      )}

      {/* Fair Play Notice */}
      <section className="text-center text-beige/60 text-sm font-body">
        <div className="divider-glow max-w-md mx-auto mb-4" />
        <p>Every variant, gene and record is earned by playing. None of it is for sale.</p>
        <p>A subscription buys appearance and recognition — never power, currency or progress.</p>
        <p className="mt-2">
          All prices include VAT where applicable. Payment is processed by
          Stripe. See our{' '}
          <Link href="/legal/terms" className="text-venom-orange/80 hover:underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link
            href="/legal/withdrawal"
            className="text-venom-orange/80 hover:underline"
          >
            withdrawal notice
          </Link>
          .
        </p>
      </section>

      {/* Account upgrade modal (anonymous users only) */}
      <AccountUpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
}
