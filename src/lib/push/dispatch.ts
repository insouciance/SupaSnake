/**
 * The send path (Constitution Rule 1, Rule 5, Rule 7, Rule 11, §12.4).
 *
 * Everything a notification has to survive before it reaches a device happens
 * here, in this order, and the order is the point:
 *
 *   1. THE FLAG. `NEXT_PUBLIC_PWA_V1` off → nothing composed, nothing loaded,
 *      nothing sent.
 *   2. THE TRIGGER. `isPushTriggerId` — the runtime edge of the two-trigger
 *      limit. An unrecognised id returns immediately.
 *   3. VAPID. Unconfigured → refuse. This is the state at merge, and it means
 *      a deployment that lands this work package cannot notify anybody until
 *      the owner deliberately arms it.
 *   4. THE COPY. `assertSendable` sweeps the composed message for commercial
 *      vocabulary (Rule 7) AND for loss, guilt, decay and urgency vocabulary
 *      (Rule 5) and THROWS on a hit. The throw happens BEFORE any subscriber
 *      is loaded, so a message that trips a lint is not sent to one person and
 *      then caught — it is not sent to anybody, and the dispatch reports the
 *      refusal.
 *   5. THE AUDIENCE. `loadSubscribersForTrigger` applies the sendable
 *      predicate in SQL. An opted-out subscriber is never loaded.
 *   6. THE CLAIM. One `push_dispatch_log` row per (trigger, occurrence,
 *      subscription), inserted `ON CONFLICT DO NOTHING RETURNING id` BEFORE
 *      the POST. A retried cron, a double fire or a hand-replay claims
 *      nothing and sends nothing. Migration 053's CHECK on `trigger_id` makes
 *      this the fourth and final place a third trigger is refused: an id the
 *      constraint rejects cannot be claimed, and an unclaimed notification is
 *      never delivered.
 *   7. THE POST, one subscriber at a time.
 *
 * ── RULE 1 ─────────────────────────────────────────────────────────────────
 *
 *   Nothing in this file runs in a request that a player made, and nothing in
 *   it can run during a run. It is reachable only from the cron route, which
 *   requires the exact `CRON_SECRET` bearer. There is no player-facing path
 *   that causes a notification, and no game-session code imports this module.
 *
 * ── WHAT A DISPATCH CANNOT DO ──────────────────────────────────────────────
 *
 *   It cannot look at how much anyone has played. `PushTriggerContext` carries
 *   a calendar key and nothing else, and no query in this file reads a session,
 *   a score, a streak or a last-seen timestamp. A notification here is a fact
 *   about the world, sent identically to every subscriber, and it is
 *   structurally incapable of being targeted at somebody's absence — which is
 *   what §12.4 forbids.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PWA_V1_ENABLED } from '@/lib/pwa/config';
import { assertSendable, pushPayload, PushCopyRefusal } from '@/lib/push/message';
import { composePushMessage, isPushTriggerId, type PushTriggerId } from '@/lib/push/triggers';
import {
  isMissingPushInfra,
  loadSubscribersForTrigger,
  revokeDeadEndpoint,
  type StoredSubscription,
} from '@/lib/push/subscriptions';
import { sendWebPush, vapidConfigured, type PushDeliveryResult } from '@/lib/push/webPush';

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`Push ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Push ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

export type DispatchSkipReason =
  | 'flag-off'
  | 'unknown-trigger'
  | 'vapid-unconfigured'
  | 'copy-refused'
  | 'infra-missing';

export interface DispatchResult {
  triggerId: string;
  occurrenceKey: string;
  /** Set when nothing was sent, with the reason. */
  skipped: DispatchSkipReason | null;
  /** Subscribers in the sendable set. */
  eligible: number;
  /** Rows this dispatch claimed (the rest were already claimed by a prior run). */
  claimed: number;
  sent: number;
  failed: number;
  /** Subscriptions the push service reported dead; revoked as a result. */
  gone: number;
  /** Rule 5 / Rule 7 hits, when `skipped` is 'copy-refused'. */
  refusals: string[];
}

function emptyResult(
  triggerId: string,
  occurrenceKey: string,
  skipped: DispatchSkipReason
): DispatchResult {
  return {
    triggerId,
    occurrenceKey,
    skipped,
    eligible: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    gone: 0,
    refusals: [],
  };
}

/**
 * Claim the right to notify one subscriber about one occurrence.
 *
 * `ON CONFLICT DO NOTHING` with `RETURNING id`: exactly one caller ever gets a
 * row id back for a given (trigger, occurrence, subscription), and everybody
 * else gets nothing and sends nothing. This is migration 051's posture for the
 * settlement email, for the same reason — a delivered notification cannot be
 * un-delivered, so idempotency has to be a row claimed before the act.
 */
async function claim(
  supabase: SupabaseClient,
  triggerId: PushTriggerId,
  occurrenceKey: string,
  subscriptionId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('push_dispatch_log')
    .upsert(
      {
        trigger_id: triggerId,
        occurrence_key: occurrenceKey,
        subscription_id: subscriptionId,
        outcome: 'claimed',
      },
      { onConflict: 'trigger_id,occurrence_key,subscription_id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();

  if (error) {
    if (!isMissingPushInfra(error)) {
      report('dispatch claim', error, { triggerId, occurrenceKey, subscriptionId });
    }
    return null;
  }

  const row = data as { id?: unknown } | null;
  return typeof row?.id === 'string' ? row.id : null;
}

/** Record how a claimed send turned out. Operational only; never player-facing. */
async function complete(
  supabase: SupabaseClient,
  logId: string,
  outcome: 'sent' | 'failed' | 'gone'
): Promise<void> {
  const { error } = await supabase
    .from('push_dispatch_log')
    .update({ outcome, completed_at: new Date().toISOString() })
    .eq('id', logId);

  if (error && !isMissingPushInfra(error)) {
    report('dispatch complete', error, { logId, outcome });
  }
}

export interface DispatchOptions {
  /** Injected in tests; production uses the global. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so a delivery outcome can be forced without a network. */
  deliver?: (
    subscription: StoredSubscription,
    payload: string
  ) => Promise<PushDeliveryResult>;
}

/**
 * Send one trigger's notification for one occurrence, to everybody who asked
 * for it and has not already been told.
 *
 * `triggerId` is typed as `PushTriggerId`, so a third trigger is a compile
 * error at every call site; it is ALSO checked at runtime, because the cron
 * route may be handed a query parameter.
 */
export async function dispatchPushForTrigger(
  supabase: SupabaseClient,
  triggerId: PushTriggerId,
  occurrenceKey: string,
  options: DispatchOptions = {}
): Promise<DispatchResult> {
  if (!PWA_V1_ENABLED) return emptyResult(triggerId, occurrenceKey, 'flag-off');
  if (!isPushTriggerId(triggerId)) return emptyResult(triggerId, occurrenceKey, 'unknown-trigger');
  if (!vapidConfigured()) return emptyResult(triggerId, occurrenceKey, 'vapid-unconfigured');

  // The copy is checked before the audience is even known, so a refusal costs
  // nobody a half-sent notification.
  const message = composePushMessage(triggerId, { occurrenceKey });
  try {
    assertSendable(message);
  } catch (error) {
    const refusals = error instanceof PushCopyRefusal ? [...error.hits] : ['invalid message'];
    report('copy refused', error, { triggerId, occurrenceKey, refusals });
    return { ...emptyResult(triggerId, occurrenceKey, 'copy-refused'), refusals };
  }

  const subscribers = await loadSubscribersForTrigger(supabase, triggerId);
  const result: DispatchResult = {
    triggerId,
    occurrenceKey,
    skipped: null,
    eligible: subscribers.length,
    claimed: 0,
    sent: 0,
    failed: 0,
    gone: 0,
    refusals: [],
  };

  const payload = pushPayload(message);
  const deliver =
    options.deliver ??
    ((subscription: StoredSubscription) =>
      sendWebPush(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        payload,
        { fetchImpl: options.fetchImpl }
      ));

  for (const subscription of subscribers) {
    const logId = await claim(supabase, triggerId, occurrenceKey, subscription.id);
    // No claim → either somebody already told this subscriber about this
    // occurrence, or the ledger is unavailable. Both mean: do not send.
    if (!logId) continue;
    result.claimed += 1;

    let outcome: PushDeliveryResult;
    try {
      outcome = await deliver(subscription, payload);
    } catch (error) {
      report('delivery', error, { triggerId, occurrenceKey, subscriptionId: subscription.id });
      outcome = { status: 'failed', httpStatus: null, detail: 'threw' };
    }

    if (outcome.status === 'sent') {
      result.sent += 1;
      await complete(supabase, logId, 'sent');
    } else if (outcome.status === 'gone') {
      result.gone += 1;
      await complete(supabase, logId, 'gone');
      // The endpoint is dead at the push service. Revoking it is the honest
      // read of that: the player uninstalled, cleared storage, or the browser
      // rotated the subscription.
      await revokeDeadEndpoint(supabase, subscription.id);
    } else {
      result.failed += 1;
      await complete(supabase, logId, 'failed');
    }
  }

  return result;
}
