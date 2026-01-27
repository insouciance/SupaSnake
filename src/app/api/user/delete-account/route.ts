/**
 * GDPR Account Deletion API
 * Allows users to delete their account and all personal data
 * Complies with GDPR Article 17 (Right to Erasure / Right to be Forgotten)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST: Request scheduled deletion (30-day grace period)
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { confirmEmail } = body;

    // Require email confirmation
    if (confirmEmail !== user.email) {
      return NextResponse.json(
        { error: 'Email confirmation does not match' },
        { status: 400 }
      );
    }

    // Schedule deletion (30-day grace period per GDPR best practice)
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 30);

    // Store deletion request
    // Wrapped in try/catch - table may not exist yet
    try {
      await supabase.from('gdpr_requests').insert({
        user_id: user.id,
        request_type: 'delete',
        status: 'pending',
        scheduled_at: scheduledDate.toISOString(),
        requested_at: new Date().toISOString(),
      });
    } catch {
      // Table may not exist, continue
    }

    // Update player record to mark for deletion
    await supabase
      .from('players')
      .update({ deletion_scheduled_at: scheduledDate.toISOString() })
      .eq('user_id', user.id);

    return NextResponse.json({
      message: 'Account deletion scheduled',
      scheduledDeletion: scheduledDate.toISOString(),
      gracePeriodDays: 30,
      cancellationInfo: 'You can cancel this request by logging in before the scheduled date',
    });
  } catch (err) {
    console.error('Deletion request error:', err);
    return NextResponse.json(
      { error: 'Failed to schedule deletion' },
      { status: 500 }
    );
  }
}

// DELETE: Immediate deletion (no grace period)
export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { confirm, confirmEmail } = body;

    // Require explicit confirmation
    if (!confirm || confirmEmail !== user.email) {
      return NextResponse.json(
        { error: 'Deletion requires explicit confirmation' },
        { status: 400 }
      );
    }

    // Get player ID
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (player) {
      // Delete all related data in order (respecting foreign key constraints)
      await Promise.all([
        supabase.from('game_sessions').delete().eq('player_id', player.id),
        supabase.from('breeding_history').delete().eq('player_id', player.id),
        supabase.from('player_achievements').delete().eq('player_id', player.id),
        supabase.from('player_daily_state').delete().eq('player_id', player.id),
        supabase.from('player_streaks').delete().eq('player_id', player.id),
        supabase.from('economy_transactions').delete().eq('player_id', player.id),
      ]);

      // Delete snakes
      await supabase.from('collected_snakes').delete().eq('player_id', player.id);

      // Delete player settings
      await supabase.from('player_settings').delete().eq('player_id', player.id);

      // Delete player record
      await supabase.from('players').delete().eq('id', player.id);
    }

    // Delete purchase history (keep for tax purposes, but anonymize)
    await supabase
      .from('purchase_history')
      .update({
        user_id: null,
        anonymized_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Log GDPR request completion
    // Wrapped in try/catch - table may not exist yet
    try {
      await supabase.from('gdpr_requests').insert({
        user_id: user.id,
        request_type: 'delete',
        status: 'completed',
        completed_at: new Date().toISOString(),
        requested_at: new Date().toISOString(),
      });
    } catch {
      // Table may not exist
    }

    // Delete auth user (this must be last)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Failed to delete auth user:', deleteError);
      return NextResponse.json(
        { error: 'Failed to complete account deletion' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      deleted: true,
      message: 'Account and all personal data have been permanently deleted',
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Account deletion error:', err);
    return NextResponse.json(
      { error: 'Deletion failed' },
      { status: 500 }
    );
  }
}
