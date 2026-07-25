/**
 * Server-side plumbing for the Dispatch waitlist (Constitution §11.6).
 *
 * The state machine lives in `@/lib/growth/dispatchWaitlist`; this module
 * owns only the database shape and the "table isn't migrated yet" reading,
 * so a deploy that lands before migration 039 degrades to a clean 503
 * instead of a 500 storm.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaitlistRow, WaitlistStatus } from '@/lib/growth/dispatchWaitlist';

export const WAITLIST_TABLE = 'dispatch_waitlist';

export const WAITLIST_COLUMNS =
  'id, email, status, confirmation_sent_at, confirmation_expires_at, confirmed_at, unsubscribed_at';

interface WaitlistDbRow {
  id: string;
  email: string;
  status: string;
  confirmation_sent_at: string | null;
  confirmation_expires_at: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

/** True when the failure is "migration 039 has not been applied here". */
export function isMissingDispatchInfra(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string } | null;
  const text = `${candidate?.message ?? ''} ${candidate?.details ?? ''}`;
  return (
    candidate?.code === '42P01' ||
    candidate?.code === 'PGRST205' ||
    (/dispatch_waitlist/i.test(text) && /does not exist|schema cache|not find/i.test(text))
  );
}

function isWaitlistStatus(value: string): value is WaitlistStatus {
  return value === 'pending' || value === 'confirmed' || value === 'unsubscribed';
}

/** Map a database row into the state machine's shape, or null if malformed. */
export function waitlistRowFrom(row: unknown): WaitlistRow | null {
  if (!row || typeof row !== 'object') return null;
  const raw = row as WaitlistDbRow;
  if (typeof raw.id !== 'string' || typeof raw.email !== 'string') return null;
  if (typeof raw.status !== 'string' || !isWaitlistStatus(raw.status)) return null;
  return {
    id: raw.id,
    email: raw.email,
    status: raw.status,
    confirmationSentAt: raw.confirmation_sent_at ?? null,
    confirmationExpiresAt: raw.confirmation_expires_at ?? null,
    confirmedAt: raw.confirmed_at ?? null,
    unsubscribedAt: raw.unsubscribed_at ?? null,
  };
}

/** Service-role client for the waitlist. Never reachable from the browser. */
export function dispatchClient(
  createClient: (url: string, key: string) => SupabaseClient
): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}
