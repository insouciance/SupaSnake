/**
 * Stripe Webhook Handler
 * Verifies signatures, then processes payment events:
 * - checkout.session.completed (mode=payment) -> RECORDED AND REFUSED. The
 *   one-time catalogue is empty (WP-0.09, Constitution §10.4), so there is
 *   nothing a one-time payment could deliver. See handleOneTimeCheckout.
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
 * checkout.session.completed with mode=payment: RECORD AND REFUSE.
 *
 * WP-0.09 deleted every one-time SKU (Constitution §10.4: Energy, DNA and
 * variants are never sold), leaving `ALL_PRODUCTS` empty. There is therefore
 * nothing a one-time payment can deliver, and this handler grants nothing —
 * it never calls grant_purchase_rewards, and it never reads a reward payload
 * out of session metadata, so a forged or stale `rewards` field cannot mint
 * anything. The event is recorded for audit and escalated to Sentry, because
 * a completed one-time payment against an empty catalogue means money moved
 * that the game did not offer, and a human has to look at it.
 *
 * Acknowledged with 200: retrying cannot make a deleted SKU deliverable.
 *
 * When an §10.2 archetype ships (Atelier / Chronicle Season / Patronage) it
 * brings its own fulfilment path, resolved from the server catalogue by
 * productId — never from metadata.
 */
async function handleOneTimeCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<NextResponse> {
  const productId = session.metadata?.productId ?? null;
  const product = productId ? getProductById(productId) : undefined;

  const { error: insertError } = await supabase.from('stripe_events').upsert(
    {
      id: event.id,
      type: event.type,
      processed_at: new Date().toISOString(),
      payload_summary: {
        object_id: session.id,
        product_id: productId,
        in_catalogue: product !== undefined,
        amount: session.amount_total ?? null,
        currency: session.currency ?? null,
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

  Sentry.captureMessage(
    'Stripe one-time checkout completed with no sellable product — nothing granted',
    {
      level: 'error',
      extra: { eventId: event.id, sessionId: session.id, productId },
    }
  );

  return NextResponse.json({ received: true, status: 'not_fulfillable' });
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
        // mode=subscription is a premium lifecycle event; mode=payment is a
        // one-time purchase, and the one-time catalogue is empty, so it is
        // recorded and refused rather than fulfilled.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription') {
          return await handleSubscriptionCheckout(event, session, stripe);
        }
        return await handleOneTimeCheckout(event, session);
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
