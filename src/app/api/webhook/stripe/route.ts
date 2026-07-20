/**
 * Stripe Webhook Handler
 * Verifies signatures, then processes payment events:
 * - checkout.session.completed (mode=payment) -> atomic idempotent grant
 *   via grant_purchase_rewards RPC (migration 010)
 * - checkout.session.completed (mode=subscription) and
 *   customer.subscription.created/updated/deleted -> premium lifecycle
 *   sync via apply_subscription_update RPC (migration 028): idempotent by
 *   event id, ordered by event.created, entitlement derived by
 *   has_premium()
 * - invoice.payment_failed -> recorded + Sentry (churn visibility; the
 *   state change itself arrives via customer.subscription.updated ->
 *   past_due, and has_premium() grants a 7-day grace window)
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
 * Premium lifecycle sync (migration 028). Resolves the player, extracts
 * the subscription's real state and hands everything to the
 * apply_subscription_update RPC - the ONLY writer of premium_subscriptions
 * (idempotent by event id, ordered by event.created, so Stripe retries and
 * out-of-order delivery are both safe).
 */
async function syncSubscription(
  event: Stripe.Event,
  subscription: Stripe.Subscription
): Promise<NextResponse> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  // playerId travels on subscription_data.metadata (checkout route);
  // fall back to the durable customer mapping on players.
  let playerId = subscription.metadata?.playerId;
  if (!playerId && customerId) {
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single();
    playerId = player?.id;
  }

  if (!playerId || !customerId) {
    console.error('Cannot resolve player for subscription:', subscription.id);
    Sentry.captureMessage('Stripe webhook: player not resolvable for subscription', {
      level: 'error',
      extra: { subscriptionId: subscription.id, eventId: event.id },
    });
    // Non-2xx so Stripe retries (the customer mapping may lag checkout)
    return NextResponse.json({ error: 'Player not found' }, { status: 500 });
  }

  // Since API version 2025-03-31 the billing period lives on the item
  const item = subscription.items?.data?.[0];
  const interval = item?.price?.recurring?.interval === 'year' ? 'year' : 'month';
  const toIso = (epochSeconds: number | null | undefined): string | null =>
    epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;

  const { data: result, error: rpcError } = await supabase.rpc(
    'apply_subscription_update',
    {
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_created: toIso(event.created),
      p_player_id: playerId,
      p_customer_id: customerId,
      p_subscription_id: subscription.id,
      p_status: subscription.status,
      p_interval: interval,
      p_period_start: toIso(item?.current_period_start),
      p_period_end: toIso(item?.current_period_end),
      p_cancel_at_period_end: subscription.cancel_at_period_end === true,
    }
  );

  if (rpcError) {
    console.error('apply_subscription_update failed:', rpcError);
    Sentry.captureException(
      new Error(`apply_subscription_update failed: ${rpcError.message}`),
      {
        extra: { eventId: event.id, subscriptionId: subscription.id, playerId },
      }
    );
    // Non-2xx so Stripe retries; the RPC is idempotent by event id
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true, status: result ?? 'processed' });
}

/**
 * checkout.session.completed with mode=subscription: the subscription may
 * arrive expanded or as an id - retrieve it, then run the same sync path
 * as the customer.subscription.* events.
 */
async function handleSubscriptionCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  stripe: Stripe
): Promise<NextResponse> {
  const subscriptionRef = session.subscription;
  if (!subscriptionRef) {
    console.error('Subscription checkout without subscription:', session.id);
    Sentry.captureMessage('Stripe subscription checkout missing subscription', {
      level: 'error',
      extra: { sessionId: session.id, eventId: event.id },
    });
    return NextResponse.json({ error: 'Missing subscription' }, { status: 400 });
  }

  const subscription =
    typeof subscriptionRef === 'string'
      ? await stripe.subscriptions.retrieve(subscriptionRef)
      : subscriptionRef;

  return syncSubscription(event, subscription);
}

/**
 * invoice.payment_failed: record for audit + alert (churn visibility).
 * No state change here - customer.subscription.updated (past_due) is the
 * authoritative transition, and has_premium() keeps perks through a
 * 7-day grace window while Stripe Smart Retries run.
 */
async function handleInvoicePaymentFailed(
  event: Stripe.Event
): Promise<NextResponse> {
  const invoice = event.data.object as Stripe.Invoice;

  const { error: insertError } = await supabase.from('stripe_events').upsert(
    {
      id: event.id,
      type: event.type,
      processed_at: new Date().toISOString(),
      payload_summary: {
        object_id: invoice.id ?? null,
        customer:
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id ?? null,
        amount: invoice.amount_due ?? null,
        currency: invoice.currency ?? null,
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

  Sentry.captureMessage('Stripe invoice.payment_failed', {
    level: 'warning',
    extra: { eventId: event.id, invoiceId: invoice.id },
  });

  return NextResponse.json({ received: true, status: 'recorded' });
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
      case 'checkout.session.completed': {
        // mode=payment carries a rewards grant; mode=subscription is a
        // premium lifecycle event (its metadata has no rewards - it must
        // never reach the one-time grant path)
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription') {
          return await handleSubscriptionCheckout(event, session, stripe);
        }
        return await handleCheckoutCompleted(event, session);
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return await syncSubscription(
          event,
          event.data.object as Stripe.Subscription
        );

      case 'invoice.payment_failed':
        return await handleInvoicePaymentFailed(event);

      case 'invoice.paid':
        // Acknowledge-only: the period advance arrives authoritatively
        // via customer.subscription.updated
        return NextResponse.json({ received: true });

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
