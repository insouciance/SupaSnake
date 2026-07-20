/**
 * Premium Billing Portal API - creates a Stripe Customer Portal session.
 *
 * The portal is the EU easy-cancellation surface: cancel anytime (effective
 * at period end), update the payment method, view invoices. The Dashboard
 * portal configuration must have cancellation enabled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

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

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .single();
    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }
    if (!player.stripe_customer_id) {
      return NextResponse.json({ error: 'no_subscription' }, { status: 404 });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('origin') ||
      'http://localhost:3000';

    const session = await stripe.billingPortal.sessions.create({
      customer: player.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Premium portal error:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
