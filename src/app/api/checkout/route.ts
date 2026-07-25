/**
 * Checkout API - Creates Stripe checkout sessions for one-time products.
 * Server-side only - client never sees Stripe secret key
 *
 * **The one-time catalogue is empty** (src/lib/stripe/products.ts): WP-0.09
 * deleted every energy and bundle SKU under Constitution §10.4. Until an
 * §10.2 archetype ships, every productId resolves to nothing and this route
 * answers 400 `product_not_available` — including for the five retired ids,
 * which is exactly the guarantee that a deleted SKU can never be sold again.
 * The route itself stays because the archetypes will need it, and because the
 * consumer-law gate below is hard-won and must not be re-derived.
 *
 * Server-side enforcement (client UI gating is cosmetic only):
 * - anonymous users cannot purchase (403 account_required)
 * - consumers must expressly consent to immediate delivery of digital
 *   content and acknowledge loss of the 14-day withdrawal right before
 *   checkout (§18(1)(11) FAGG) — recorded in the session metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getProductById } from '@/lib/stripe/products';

// Stripe client is created lazily: instantiating at module scope makes the
// production build itself require STRIPE_SECRET_KEY (Next.js page-data
// collection imports the module), which breaks deploys before the Stripe
// account is configured.
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-11-17.clover',
    });
  }
  return stripeClient;
}

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: 'Payments are not configured' },
        { status: 503 }
      );
    }

    // Get auth token from header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Anonymous (guest) accounts cannot purchase: rewards must attach to a
    // recoverable account. The client CTA prompts an upgrade; this is the
    // server-side enforcement.
    const isAnonymous =
      user.is_anonymous === true ||
      user.app_metadata?.provider === 'anonymous';
    if (isAnonymous) {
      return NextResponse.json({ error: 'account_required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { productId, withdrawalConsent } = body;

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    // FAGG §18(1)(11): digital content is delivered immediately, so the
    // buyer must first expressly consent to immediate delivery and
    // acknowledge losing the withdrawal right.
    if (withdrawalConsent !== true) {
      return NextResponse.json(
        { error: 'withdrawal_consent_required' },
        { status: 400 }
      );
    }

    // Resolve the SKU against the server catalogue. Nothing is on sale today,
    // so this is where every purchase attempt ends.
    const product = getProductById(productId);
    if (!product) {
      return NextResponse.json(
        { error: 'product_not_available' },
        { status: 400 }
      );
    }

    // Check for Stripe price ID
    if (!product.stripePriceId) {
      return NextResponse.json(
        { error: 'Product not configured for purchase' },
        { status: 500 }
      );
    }

    // Resolve the player row (grants are made against players.id)
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Canonical app URL for redirect targets; request origin only as a
    // fallback when NEXT_PUBLIC_APP_URL is unset (e.g. local dev).
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('origin') ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      automatic_tax: { enabled: true },
      line_items: [
        {
          price: product.stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        // Deliberately NOT the reward payload: the webhook resolves what a
        // purchase delivers from the server catalogue by productId, so
        // session metadata can never be the source of a grant.
        userId: user.id,
        playerId: player.id,
        productId: product.id,
        // Evidence of the §18 FAGG consent given in the shop UI
        withdrawal_consent: 'immediate_delivery_acknowledged',
        withdrawal_consent_at: new Date().toISOString(),
      },
      success_url: `${appUrl}/shop?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/shop?canceled=true`,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
