/** Daily worker for due GDPR account-erasure requests (migration 035). */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processClaimedAccountDeletion,
  type ClaimedAccountDeletion,
} from '@/lib/server/accountDeletion';
import { isAuthorizedCron } from '@/lib/server/cronAuth';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isClaim(value: unknown): value is ClaimedAccountDeletion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.request_id === 'string' &&
    typeof row.auth_deleted === 'boolean' &&
    (row.auth_deleted
      ? row.user_id === null
      : typeof row.user_id === 'string')
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabase.rpc('claim_due_account_deletions', {
      p_limit: 25,
    });
    if (error) {
      console.error('Due account deletion claim failed:', { code: error.code });
      return NextResponse.json(
        { error: 'Deletion worker unavailable' },
        { status: error.code === 'PGRST202' || error.code === '42883' ? 503 : 500 }
      );
    }

    const claims = Array.isArray(data) ? data.filter(isClaim) : [];
    const report = { claimed: claims.length, completed: 0, failed: 0, cancelled: 0 };
    for (const claim of claims) {
      const outcome = await processClaimedAccountDeletion(supabase, claim);
      report[outcome] += 1;
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('Account deletion worker failed:', error);
    return NextResponse.json({ error: 'Deletion worker failed' }, { status: 500 });
  }
}
