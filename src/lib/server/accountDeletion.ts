import type { SupabaseClient } from '@supabase/supabase-js';

export interface ClaimedAccountDeletion {
  request_id: string;
  user_id: string | null;
  auth_deleted: boolean;
}

export type AccountDeletionResult = 'completed' | 'failed' | 'cancelled';

/**
 * Complete one already-claimed deletion.
 *
 * The database verifies the claim, then Auth deletion cascades player-owned
 * gameplay rows. Retained purchase references are anonymized only after Auth
 * confirms deletion. A failed Auth deletion puts the request back in pending;
 * an interrupted post-Auth finalization is recovered by a later worker.
 */
export async function processClaimedAccountDeletion(
  supabase: SupabaseClient,
  claim: ClaimedAccountDeletion
): Promise<AccountDeletionResult> {
  const finalize = async (): Promise<AccountDeletionResult> => {
    const { data: finalized, error: finalizeError } = await supabase.rpc(
      'finalize_account_deletion',
      { p_request_id: claim.request_id }
    );
    if (finalizeError || finalized !== true) {
      // Auth may already be gone. Keep the processing audit row intact so the
      // migration's stale-claim recovery can safely retry finalization.
      console.error('Account deletion finalization failed:', {
        requestId: claim.request_id,
        code: finalizeError?.code,
      });
      return 'failed';
    }
    return 'completed';
  };

  if (claim.auth_deleted) {
    return finalize();
  }

  if (!claim.user_id) {
    console.error('Account deletion claim missing user id:', {
      requestId: claim.request_id,
    });
    return 'failed';
  }

  const { data: prepared, error: prepareError } = await supabase.rpc(
    'prepare_account_deletion',
    {
      p_request_id: claim.request_id,
      p_user_id: claim.user_id,
    }
  );

  if (prepareError || prepared !== true) {
    // `false` means the user cancelled between claim and processing. Do not
    // revive that request. Database errors are retried on the next cron run.
    if (!prepareError) return 'cancelled';

    console.error('Account deletion preparation failed:', {
      requestId: claim.request_id,
      code: prepareError.code,
    });
    await supabase
      .from('gdpr_requests')
      .update({
        status: 'pending',
        response_data: {
          last_error: 'preparation_failed',
          last_attempt_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', claim.request_id)
      .eq('status', 'processing');
    return 'failed';
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(
    claim.user_id
  );

  if (deleteError) {
    console.error('Auth user deletion failed:', {
      requestId: claim.request_id,
      status: deleteError.status,
    });
    await supabase
      .from('gdpr_requests')
      .update({
        status: 'pending',
        response_data: {
          last_error: 'auth_deletion_failed',
          last_attempt_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', claim.request_id)
      .eq('status', 'processing');
    return 'failed';
  }

  return finalize();
}
