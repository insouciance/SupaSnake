/**
 * Checkout API - Creates Stripe checkout sessions
 * Server-side only - client never sees Stripe secret key
 *
 * Server-side enforcement (client UI gating is cosmetic only):
 * - anonymous users cannot purchase (403 account_required)
 * - bundle products are Day 2+ only per BM-004 (403 bundle_not_available)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getProductById, shouldShowBundles } from '@/lib/stripe/products';

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
    const { productId } = body;

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    // Get product
    const product = getProductById(productId);
    if (!product) {
      return NextResponse.json({ error: 'Invalid product' }, { status: 400 });
    }

    // Check for Stripe price ID
    if (!product.stripePriceId) {
      return NextResponse.json(
        { error: 'Product not configured for purchase' },
        { status: 500 }
      );
    }

    // Resolve the player row (rewards are granted against players.id, and
    // created_at drives the bundle availability window)
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, created_at')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Server-side Day 2+ gating for bundles (BM-004). The shop UI hides
    // bundles before Day 2, but the API must enforce it.
    if (
      product.type === 'bundle' &&
      !shouldShowBundles(new Date(player.created_at))
    ) {
      return NextResponse.json(
        { error: 'bundle_not_available' },
        { status: 403 }
      );
    }

    // Canonical app URL for redirect targets; request origin only as a
    // fallback when NEXT_PUBLIC_APP_URL is unset (e.g. local dev).
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('origin') ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: product.stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        playerId: player.id,
        productId: product.id,
        rewards: JSON.stringify(product.rewards),
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
