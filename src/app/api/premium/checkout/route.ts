/**
 * Premium Checkout API - creates a Stripe Billing subscription Checkout
 * session for SupaSnake Premium. Server-side only.
 *
 * Server-side enforcement (client UI gating is cosmetic only):
 * - anonymous users cannot subscribe (403 account_required)
 * - the subscription is a DIGITAL SERVICE: the consumer must expressly
 *   request that it starts during the 14-day withdrawal period (§10 FAGG;
 *   pro-rata refund on withdrawal per §16 FAGG) - distinct from the
 *   one-time digital-content consent in /api/checkout
 * - recurring billing is 18+ (self-declaration; minimum game age is 14,
 *   but recurring charges require adult consent) - recorded in metadata
 *
 * A durable Stripe customer is created/reused per player: subscriptions
 * need one for the Billing Portal and for webhook fallback resolution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getPremiumPlanById } from '@/lib/stripe/premium';
import { GAME_CONFIG } from '@/shared/config/game';

// Stripe client is created lazily (see /api/checkout for rationale)
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
    if (!stripe || !GAME_CONFIG.features.premium) {
      return NextResponse.json(
        { error: 'Premium is not available' },
        { status: 503 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Anonymous (guest) accounts cannot subscribe: the entitlement must
    // attach to a recoverable account.
    const isAnonymous =
      user.is_anonymous === true ||
      user.app_metadata?.provider === 'anonymous';
    if (isAnonymous) {
      return NextResponse.json({ error: 'account_required' }, { status: 403 });
    }

    const body = await request.json();
    const { planId, serviceStartConsent, adultConfirmation } = body;

    const plan = getPremiumPlanById(planId);
    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    if (!plan.stripePriceId) {
      return NextResponse.json(
        { error: 'Plan not configured for purchase' },
        { status: 500 }
      );
    }

    // §10 FAGG: express request that the digital service begins during the
    // withdrawal period (withdrawal then owes pro-rata, §16 FAGG).
    if (serviceStartConsent !== true) {
      return NextResponse.json(
        { error: 'service_start_consent_required' },
        { status: 400 }
      );
    }

    // Recurring billing requires an adult (18+) self-declaration.
    if (adultConfirmation !== true) {
      return NextResponse.json(
        { error: 'adult_confirmation_required' },
        { status: 400 }
      );
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .single();
    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // One live subscription per player (the DB enforces this too; failing
    // early gives a clean error instead of a webhook-time conflict)
    const { data: liveSub, error: liveSubError } = await supabase
      .from('premium_subscriptions')
      .select('id')
      .eq('player_id', player.id)
      .in('status', ['trialing', 'active', 'past_due'])
      .maybeSingle();
    if (liveSubError) {
      console.error('premium_subscriptions lookup failed:', liveSubError);
      return NextResponse.json({ error: 'Subscription check failed' }, { status: 500 });
    }
    if (liveSub) {
      return NextResponse.json({ error: 'already_subscribed' }, { status: 409 });
    }

    // Durable customer: reuse if known, else create + persist
    let customerId = player.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { userId: user.id, playerId: player.id },
      });
      customerId = customer.id;

      const { error: persistError } = await supabase
        .from('players')
        .update({ stripe_customer_id: customerId })
        .eq('id', player.id);
      if (persistError) {
        console.error('Failed to persist stripe_customer_id:', persistError);
        // Non-fatal: the webhook also persists the mapping
      }
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('origin') ||
      'http://localhost:3000';

    const consentAt = new Date().toISOString();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      metadata: {
        userId: user.id,
        playerId: player.id,
        planId: plan.id,
        // §10 FAGG service-start consent + 18+ self-declaration evidence
        service_start_consent: 'immediate_service_requested',
        service_start_consent_at: consentAt,
        adult_confirmation: 'confirmed_18_plus',
        adult_confirmation_at: consentAt,
      },
      // customer.subscription.* events do NOT carry Checkout metadata -
      // the subscription needs its own copy for webhook resolution
      subscription_data: {
        metadata: { userId: user.id, playerId: player.id, planId: plan.id },
      },
      success_url: `${appUrl}/shop?premium=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/shop?premium=canceled`,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Premium checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
