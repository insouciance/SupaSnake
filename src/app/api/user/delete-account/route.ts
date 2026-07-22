/**
 * GDPR account erasure API.
 *
 * POST   schedules a registered account for deletion after 30 days.
 * PATCH  cancels a pending request (called after a genuine new sign-in).
 * DELETE immediately erases an account after an additional confirmation;
 *        the UI uses this for anonymous accounts that cannot sign back in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { AccountDeleteSchema } from '@/lib/validation/schemas';
import { processClaimedAccountDeletion } from '@/lib/server/accountDeletion';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NO_STORE = { 'Cache-Control': 'no-store' };
const GRACE_PERIOD_DAYS = 30;

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

async function authenticatedUser(
  request: NextRequest
): Promise<{ user: User | null; response: NextResponse | null }> {
  const token = bearerToken(request);
  if (!token) {
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE }
      ),
    };
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Invalid token' },
        { status: 401, headers: NO_STORE }
      ),
    };
  }
  return { user, response: null };
}

function confirmationMatches(
  user: User,
  input: { confirmEmail?: string; confirmation?: string }
): boolean {
  if (user.email) {
    return input.confirmEmail?.trim().toLowerCase() === user.email.toLowerCase();
  }
  return input.confirmation === 'DELETE MY ACCOUNT';
}

function deletionInfraUnavailable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /request_account_deletion|cancel_account_deletion|claim_account_deletion/i.test(
      error.message ?? ''
    )
  );
}

async function parseConfirmation(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return AccountDeleteSchema.safeParse(body);
}

/** Schedule registered-user erasure after the documented grace period. */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatedUser(request);
    if (!auth.user) return auth.response!;

    const parsed = await parseConfirmation(request);
    if (!parsed.success || !confirmationMatches(auth.user, parsed.data)) {
      return NextResponse.json(
        { error: 'Deletion confirmation does not match' },
        { status: 400, headers: NO_STORE }
      );
    }

    // Guests cannot recover credentials after sign-out, so the UI routes
    // them through immediate DELETE instead of creating an orphaned request.
    if (auth.user.is_anonymous) {
      return NextResponse.json(
        { error: 'Anonymous accounts require immediate deletion' },
        { status: 409, headers: NO_STORE }
      );
    }

    const scheduledDate = new Date();
    scheduledDate.setUTCDate(scheduledDate.getUTCDate() + GRACE_PERIOD_DAYS);

    const { data: requestId, error } = await supabase.rpc(
      'request_account_deletion',
      {
        p_user_id: auth.user.id,
        p_scheduled_at: scheduledDate.toISOString(),
      }
    );

    if (error || typeof requestId !== 'string') {
      console.error('Account deletion scheduling failed:', {
        code: error?.code,
      });
      return NextResponse.json(
        {
          error:
            error && deletionInfraUnavailable(error)
              ? 'Account deletion is temporarily unavailable'
              : 'Failed to schedule deletion',
        },
        { status: error && deletionInfraUnavailable(error) ? 503 : 500, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      {
        message: 'Account deletion scheduled',
        scheduledDeletion: scheduledDate.toISOString(),
        gracePeriodDays: GRACE_PERIOD_DAYS,
        cancellationInfo: 'Sign in again before the scheduled date to cancel',
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('Deletion request error:', error);
    return NextResponse.json(
      { error: 'Failed to schedule deletion' },
      { status: 500, headers: NO_STORE }
    );
  }
}

/** Cancel any pending erasure request for the authenticated user. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticatedUser(request);
    if (!auth.user) return auth.response!;

    const { data: cancelled, error } = await supabase.rpc(
      'cancel_account_deletion',
      { p_user_id: auth.user.id }
    );
    if (error) {
      console.error('Account deletion cancellation failed:', {
        code: error.code,
      });
      return NextResponse.json(
        { error: 'Failed to cancel account deletion' },
        { status: deletionInfraUnavailable(error) ? 503 : 500, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { cancelled: cancelled === true },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('Deletion cancellation error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel account deletion' },
      { status: 500, headers: NO_STORE }
    );
  }
}

/** Immediate, irreversible erasure after explicit confirmation. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticatedUser(request);
    if (!auth.user) return auth.response!;

    const parsed = await parseConfirmation(request);
    if (
      !parsed.success ||
      parsed.data.confirm !== true ||
      !confirmationMatches(auth.user, parsed.data)
    ) {
      return NextResponse.json(
        { error: 'Deletion requires explicit confirmation' },
        { status: 400, headers: NO_STORE }
      );
    }

    const now = new Date().toISOString();
    const { error: requestError } = await supabase.rpc(
      'request_account_deletion',
      { p_user_id: auth.user.id, p_scheduled_at: now }
    );
    if (requestError) {
      console.error('Immediate account deletion request failed:', {
        code: requestError.code,
      });
      return NextResponse.json(
        { error: 'Failed to start account deletion' },
        { status: deletionInfraUnavailable(requestError) ? 503 : 500, headers: NO_STORE }
      );
    }

    const { data: requestId, error: claimError } = await supabase.rpc(
      'claim_account_deletion',
      { p_user_id: auth.user.id }
    );
    if (claimError || typeof requestId !== 'string') {
      console.error('Immediate account deletion claim failed:', {
        code: claimError?.code,
      });
      return NextResponse.json(
        { error: 'Failed to start account deletion' },
        { status: 500, headers: NO_STORE }
      );
    }

    const outcome = await processClaimedAccountDeletion(supabase, {
      request_id: requestId,
      user_id: auth.user.id,
      auth_deleted: false,
    });
    if (outcome !== 'completed') {
      return NextResponse.json(
        { error: 'Failed to complete account deletion' },
        { status: 500, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      {
        deleted: true,
        message: 'Account and personal gameplay data permanently deleted',
        deletedAt: new Date().toISOString(),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json(
      { error: 'Deletion failed' },
      { status: 500, headers: NO_STORE }
    );
  }
}
