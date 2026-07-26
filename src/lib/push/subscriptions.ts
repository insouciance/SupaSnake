/**
 * Push subscriptions — consent in, consent out (Constitution Rule 5, Rule 7,
 * Rule 11; migration 053).
 *
 * WP-0.08 set the consent standard for this codebase with the Dispatch's
 * double opt-in: an address is mailable only when it carries an affirmative,
 * timestamped act by its owner, and the schema — not the application — is what
 * makes the two agree. This module applies the same discipline to a push
 * endpoint. The browser's permission dialog is the first act; storing a row
 * here is only permitted AFTER the browser has granted permission and the
 * player has ticked the trigger they want, which is why `storeSubscription`
 * refuses an empty trigger list rather than defaulting to "both".
 *
 * ── THE SENDABLE SET, STATED ONCE ──────────────────────────────────────────
 *
 *   `status = 'active'` AND the trigger is in `triggers`.
 *
 *   `loadSubscribersForTrigger` is the ONLY query that produces sendable rows,
 *   and it applies both halves in SQL rather than filtering in JavaScript, so
 *   a revoked subscriber cannot be sent to by a caller that forgets a check.
 *   `subscriptions.test.ts` asserts the shape of that query directly.
 *
 * ── OPTING OUT ─────────────────────────────────────────────────────────────
 *
 *   Two independent exits, because a player who wants notifications to stop
 *   should not have to find the right one:
 *
 *     · `revokeSubscription` — "stop entirely". Status goes to 'revoked',
 *       triggers are emptied, and the row is KEPT. Keeping it is deliberate:
 *       a deleted row would be silently recreated by the next stale client
 *       that still holds a browser subscription, and consent would appear to
 *       have been re-granted when it had not.
 *     · `setSubscriptionTriggers` — "just this one". Removing the last trigger
 *       leaves an active row that is not in the sendable set for anything.
 *
 *   Either way the effect on the send path is the same and immediate: the
 *   sendable query stops returning the row.
 *
 * Rule 11: every Supabase `error` is checked and reported to Sentry.
 */

import { createHash } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUSH_TRIGGER_IDS, isPushTriggerId, type PushTriggerId } from '@/lib/push/triggers';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * Is this failure just "migration 053 has not been applied here yet"?
 * Same test the Signal and Serpent modules use, against this feature's names.
 */
export function isMissingPushInfra(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST204'
  ) {
    return true;
  }
  return /push_subscriptions|push_dispatch_log/i.test(error.message || '');
}

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`Push ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Push ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

/** SHA-256 hex of the endpoint — the unique key, so one device is one row. */
export function endpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  triggers: string[];
}

export interface ValidatedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  triggers: PushTriggerId[];
}

export class SubscriptionRejected extends Error {}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Validate what a browser handed us. Everything is checked here rather than
 * trusted, because `PushSubscription.toJSON()` arrives through a request body
 * and a request body is a client value (Rule 11).
 *
 * The trigger list is filtered through `isPushTriggerId`, which is the runtime
 * half of the two-trigger limit: an id this codebase does not recognise is
 * dropped, and if that leaves nothing the whole subscription is refused. A
 * caller cannot consent somebody into a third trigger by inventing a string.
 */
export function validateSubscription(input: SubscriptionInput): ValidatedSubscription {
  const endpoint = input.endpoint?.trim() ?? '';
  if (!endpoint.startsWith('https://') || endpoint.length > 2048) {
    throw new SubscriptionRejected('endpoint must be an https URL under 2048 characters');
  }
  try {
    new URL(endpoint);
  } catch {
    throw new SubscriptionRejected('endpoint is not a URL');
  }

  const p256dh = input.p256dh?.trim() ?? '';
  const auth = input.auth?.trim() ?? '';
  if (!BASE64URL.test(p256dh) || Buffer.from(p256dh, 'base64url').length !== 65) {
    throw new SubscriptionRejected('p256dh must be a base64url uncompressed P-256 point');
  }
  if (!BASE64URL.test(auth) || Buffer.from(auth, 'base64url').length !== 16) {
    throw new SubscriptionRejected('auth must be a base64url 16-byte secret');
  }

  const triggers = Array.from(new Set(input.triggers ?? [])).filter(isPushTriggerId);
  if (triggers.length === 0) {
    // No default, ever. "Both" is not a reasonable guess about somebody's
    // notification preferences.
    throw new SubscriptionRejected('at least one permitted trigger must be consented to');
  }

  return { endpoint, p256dh, auth, triggers };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  triggers: PushTriggerId[];
  status: 'active' | 'revoked';
}

function toStored(row: Record<string, unknown> | null): StoredSubscription | null {
  if (!row || typeof row.id !== 'string') return null;
  const triggers = Array.isArray(row.triggers) ? row.triggers.filter(isPushTriggerId) : [];
  return {
    id: row.id,
    endpoint: String(row.endpoint ?? ''),
    p256dh: String(row.p256dh ?? ''),
    auth: String(row.auth ?? ''),
    triggers,
    status: row.status === 'revoked' ? 'revoked' : 'active',
  };
}

/**
 * Store — or re-affirm — one device's subscription.
 *
 * Upsert on `endpoint_hash`, so a browser that re-subscribes the same endpoint
 * updates its consent instead of accumulating rows. `consented_at` is refreshed
 * because a re-subscribe IS a fresh affirmative act: the player went back to
 * the panel and turned it on again.
 *
 * Returns null on any failure, including "migration not applied". Null is the
 * closed direction — no stored subscription means nothing to send to.
 */
export async function storeSubscription(
  supabase: SupabaseClient,
  playerId: string,
  input: ValidatedSubscription
): Promise<StoredSubscription | null> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        player_id: playerId,
        endpoint: input.endpoint,
        endpoint_hash: endpointHash(input.endpoint),
        p256dh: input.p256dh,
        auth: input.auth,
        triggers: input.triggers,
        status: 'active',
        consented_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'endpoint_hash' }
    )
    .select('id, endpoint, p256dh, auth, triggers, status')
    .single();

  if (error) {
    if (!isMissingPushInfra(error)) report('subscription store', error, { playerId });
    return null;
  }
  return toStored(data as Record<string, unknown>);
}

/** Everything this player has subscribed, for the opt-in panel. */
export async function loadSubscriptionsForPlayer(
  supabase: SupabaseClient,
  playerId: string
): Promise<StoredSubscription[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, triggers, status')
    .eq('player_id', playerId)
    .eq('status', 'active');

  if (error) {
    if (!isMissingPushInfra(error)) report('subscription read', error, { playerId });
    return [];
  }
  return (data ?? [])
    .map((row) => toStored(row as Record<string, unknown>))
    .filter((row): row is StoredSubscription => row !== null);
}

/**
 * Opt out entirely. Idempotent: revoking an already-revoked row is a no-op
 * that still reports success, because from the player's side it is.
 *
 * Scoped by `player_id` as well as by endpoint hash, so one player cannot
 * revoke another's device by guessing an endpoint.
 */
export async function revokeSubscription(
  supabase: SupabaseClient,
  playerId: string,
  endpoint: string
): Promise<boolean> {
  const { error } = await supabase
    .from('push_subscriptions')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      triggers: [],
    })
    .eq('player_id', playerId)
    .eq('endpoint_hash', endpointHash(endpoint));

  if (error) {
    if (!isMissingPushInfra(error)) report('subscription revoke', error, { playerId });
    return false;
  }
  return true;
}

/**
 * Revoke by endpoint alone, with no player scope. Used only by the send path
 * when a push service answers 404/410: the endpoint is dead and keeping it
 * would mean retrying it forever.
 */
export async function revokeDeadEndpoint(
  supabase: SupabaseClient,
  subscriptionId: string
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), triggers: [] })
    .eq('id', subscriptionId);

  if (error && !isMissingPushInfra(error)) {
    report('dead endpoint revoke', error, { subscriptionId });
  }
}

/**
 * Change which of the two triggers a device wants. An empty list is allowed
 * here (unlike at first subscribe) — it is how a player turns both off without
 * revoking the browser permission.
 */
export async function setSubscriptionTriggers(
  supabase: SupabaseClient,
  playerId: string,
  endpoint: string,
  triggers: string[]
): Promise<boolean> {
  const permitted = Array.from(new Set(triggers)).filter(isPushTriggerId);

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ triggers: permitted })
    .eq('player_id', playerId)
    .eq('endpoint_hash', endpointHash(endpoint))
    .eq('status', 'active');

  if (error) {
    if (!isMissingPushInfra(error)) report('trigger update', error, { playerId });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The sendable set
// ---------------------------------------------------------------------------

/**
 * The ONLY query that produces rows a notification may be sent to.
 *
 * Both halves of the sendable predicate are applied in SQL: `status = 'active'`
 * and `triggers @> {trigger}`. An opted-out subscriber is therefore not
 * filtered out downstream — they are never loaded, so no later bug can put
 * them back into a send loop.
 */
export async function loadSubscribersForTrigger(
  supabase: SupabaseClient,
  trigger: PushTriggerId
): Promise<StoredSubscription[]> {
  if (!isPushTriggerId(trigger)) return [];

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, triggers, status')
    .eq('status', 'active')
    .contains('triggers', [trigger]);

  if (error) {
    if (!isMissingPushInfra(error)) report('subscriber load', error, { trigger });
    return [];
  }

  return (data ?? [])
    .map((row) => toStored(row as Record<string, unknown>))
    .filter((row): row is StoredSubscription => row !== null)
    // Belt and braces over the SQL predicate. If this ever removes a row, the
    // query and the schema have diverged and the send is the wrong place to
    // find out — but silence is still better than a wrong notification.
    .filter((row) => row.status === 'active' && row.triggers.includes(trigger));
}

/** For the opt-in panel: the two triggers, and nothing else, ever. */
export function permittedTriggers(): PushTriggerId[] {
  return [...PUSH_TRIGGER_IDS];
}
