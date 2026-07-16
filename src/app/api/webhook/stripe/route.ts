/**
 * Stripe Webhook Handler
 * Processes successful payments and grants rewards
 * Uses raw body for signature verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

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

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const userId = session.metadata?.userId;
      const productId = session.metadata?.productId;
      const rewardsJson = session.metadata?.rewards;

      if (!userId || !productId || !rewardsJson) {
        console.error('Missing metadata in session:', session.id);
        return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
      }

      const rewards = JSON.parse(rewardsJson);

      // Get current player data
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('energy, dna')
        .eq('id', userId)
        .single();

      if (playerError || !player) {
        console.error('Player not found:', userId);
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }

      // Calculate new values
      const newEnergy = player.energy + (rewards.energy || 0);
      const newDna = player.dna + (rewards.dna || 0);

      // Update player resources
      const { error: updateError } = await supabase
        .from('players')
        .update({
          energy: newEnergy,
          dna: newDna,
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to update player:', updateError);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
      }

      // Grant variant rewards if any (product config stores variant names)
      if (rewards.variants && rewards.variants.length > 0) {
        for (const variantName of rewards.variants) {
          const { data: variant } = await supabase
            .from('snake_variants')
            .select('id')
            .eq('name', variantName)
            .single();

          if (!variant) {
            console.error(`Unknown variant reward in product config: ${variantName}`);
            continue;
          }

          // Check if already owned
          const { data: existing } = await supabase
            .from('collected_snakes')
            .select('id')
            .eq('player_id', userId)
            .eq('snake_variant_id', variant.id)
            .maybeSingle();

          if (!existing) {
            await supabase.from('collected_snakes').insert({
              player_id: userId,
              snake_variant_id: variant.id,
              generation: 1,
              acquired_method: 'unlock',
            });
          }
        }
      }

      console.log(`Purchase completed: ${productId} for user ${userId}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
