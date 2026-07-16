/**
 * Stripe Webhook Handler
 * Verifies signatures, then processes payment events:
 * - checkout.session.completed -> atomic idempotent grant via
 *   grant_purchase_rewards RPC (migration 010)
 * - charge.refunded / charge.dispute.created -> recorded in stripe_events
 *   and escalated to Sentry for manual review (no auto-clawback at launch)
 * - anything else -> acknowledged with 200
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import { getProductById } from '@/lib/stripe/products';

// Stripe client is created lazily so the production build does not require
// STRIPE_SECRET_KEY at page-data collection time (see checkout route).
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

// Server-side Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * checkout.session.completed: grant purchase rewards atomically.
 * All state changes happen inside the grant_purchase_rewards RPC keyed by
 * the Stripe event id, so Stripe retries can never double-grant.
 */
async function handleCheckoutCompleted(
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<NextResponse> {
  const userId = session.metadata?.userId;
  const productId = session.metadata?.productId;
  const rewardsJson = session.metadata?.rewards;

  if (!userId || !productId || !rewardsJson) {
    console.error('Missing metadata in session:', session.id);
    Sentry.captureMessage('Stripe session missing metadata', {
      level: 'error',
      extra: { sessionId: session.id, eventId: event.id },
    });
    return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
  }

  const rewards: { energy?: number; dna?: number; variants?: string[] } =
    JSON.parse(rewardsJson);

  // Resolve the player row. Checkout embeds playerId (players.id); fall back
  // to a lookup by auth user id for sessions created before that change.
  let playerId = session.metadata?.playerId;
  if (!playerId) {
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (playerError || !player) {
      console.error('Player not found for user:', userId);
      Sentry.captureMessage('Stripe webhook: player not found', {
        level: 'error',
        extra: { userId, sessionId: session.id, eventId: event.id },
      });
      // Non-2xx so Stripe retries (player row creation may lag signup)
      return NextResponse.json({ error: 'Player not found' }, { status: 500 });
    }
    playerId = player.id;
  }

  const product = getProductById(productId);

  const { data: result, error: rpcError } = await supabase.rpc(
    'grant_purchase_rewards',
    {
      p_event_id: event.id,
      p_player_id: playerId,
      p_product_id: productId,
      p_energy: rewards.energy ?? 0,
      p_dna: rewards.dna ?? 0,
      p_variant_names: rewards.variants ?? [],
      p_session_id: session.id,
      p_product_name: product?.name ?? productId,
      p_price_cents: session.amount_total ?? 0,
      p_currency: session.currency ?? 'usd',
    }
  );

  if (rpcError) {
    console.error('grant_purchase_rewards failed:', rpcError);
    Sentry.captureException(
      new Error(`grant_purchase_rewards failed: ${rpcError.message}`),
      {
        extra: { eventId: event.id, sessionId: session.id, productId, playerId },
      }
    );
    // Non-2xx so Stripe retries; the RPC is idempotent by event id
    return NextResponse.json({ error: 'Grant failed' }, { status: 500 });
  }

  if (result === 'already_processed') {
    // Idempotent success: Stripe retried an event we already handled
    return NextResponse.json({ received: true, status: 'already_processed' });
  }

  console.log(`Purchase completed: ${productId} for player ${playerId}`);
  return NextResponse.json({ received: true, status: 'processed' });
}

/**
 * charge.refunded / charge.dispute.created: record the event and alert.
 * No automatic clawback at launch - these need manual attention.
 */
async function handleRefundOrDispute(event: Stripe.Event): Promise<NextResponse> {
  const object = event.data.object as Stripe.Charge | Stripe.Dispute;

  const { error: insertError } = await supabase.from('stripe_events').upsert(
    {
      id: event.id,
      type: event.type,
      processed_at: new Date().toISOString(),
      payload_summary: {
        object_id: object.id,
        payment_intent:
          typeof object.payment_intent === 'string'
            ? object.payment_intent
            : object.payment_intent?.id ?? null,
        amount: 'amount' in object ? object.amount : null,
        currency: 'currency' in object ? object.currency : null,
      },
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  if (insertError) {
    console.error('Failed to record stripe event:', insertError);
    Sentry.captureException(
      new Error(`Failed to record stripe event: ${insertError.message}`),
      { extra: { eventId: event.id, eventType: event.type } }
    );
    // Non-2xx so Stripe retries and the event is not lost
    return NextResponse.json({ error: 'Record failed' }, { status: 500 });
  }

  // Escalate for manual review - refunds/disputes have no auto-clawback
  Sentry.captureMessage(`Stripe ${event.type} requires manual review`, {
    level: 'error',
    extra: { eventId: event.id, objectId: object.id },
  });

  return NextResponse.json({ received: true, status: 'recorded' });
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!stripe || !webhookSecret) {
      return NextResponse.json(
        { error: 'Payments are not configured' },
        { status: 503 }
      );
    }

    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        return await handleCheckoutCompleted(
          event,
          event.data.object as Stripe.Checkout.Session
        );

      case 'charge.refunded':
      case 'charge.dispute.created':
        return await handleRefundOrDispute(event);

      default:
        // Unknown event types are acknowledged so Stripe stops retrying
        return NextResponse.json({ received: true });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
