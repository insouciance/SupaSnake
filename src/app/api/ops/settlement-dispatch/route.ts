/**
 * The weekly settlement dispatch — GET /api/ops/settlement-dispatch
 * (Constitution §7.6, §11.6).
 *
 * Two jobs, both about the week that just submerged:
 *
 *   1. COMPOSE the operator's post — "top clans, record Depths, world-firsts,
 *      the week's named conditions" (§11.6). It is RETURNED, never published.
 *      Nothing on this route posts to any platform; the operator's job is to
 *      press publish, and there is no code here that could press it for them.
 *   2. SEND the deterministic weekly settlement email to players who asked for
 *      it, composed from their own settled week. No model, no narration.
 *
 * Auth: exact `CRON_SECRET` bearer — the same contract as
 * `/api/ops/serpent-settlement`, `/api/analyst/cron` and `/api/discord/dispatch`.
 * There is no unauthenticated path and no player-facing path.
 *
 * WHY THIS CANNOT MAIL ANYBODY TWICE
 *
 * A cron retries. An email cannot be un-sent. So the row in
 * `settlement_dispatch_sends` is CLAIMED BEFORE the send, through a unique
 * index on (week_start, recipient_kind, recipient_key) with `ON CONFLICT DO
 * NOTHING`: a second pass conflicts, gets no row back, and sends nothing.
 *
 * Until migration 051 is applied there is no ledger, and this route therefore
 * FAILS CLOSED — it composes the post and sends zero email. That is the safe
 * direction: the cost of not sending is a quiet week, and the cost of guessing
 * is mailing somebody twice.
 *
 * WHY THIS CANNOT MAIL SOMEBODY WHO DID NOT ASK
 *
 * `isSettlementMailable` is the only gate, it runs before anything that could
 * reach the network, and it requires two independent affirmative facts per
 * recipient. This route never reads an address that failed it.
 *
 * WHY THIS CANNOT SELL ANYTHING (Rule 7)
 *
 * `sendSettlementEmail` sweeps its own subject, HTML and text through the
 * commercial vocabulary and refuses rather than sending. Nothing on this route
 * can bypass that, because nothing on this route composes a message itself.
 *
 * Rule 11: every Supabase `error` is checked and reported to Sentry.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';

import { isAuthorizedCron } from '@/lib/server/cronAuth';
import { SETTLEMENT_DISPATCH_V1 } from '@/lib/growth/config';
import { isMailable } from '@/lib/growth/dispatchWaitlist';
import { isMissingDispatchInfra, WAITLIST_COLUMNS, WAITLIST_TABLE, waitlistRowFrom } from '@/lib/server/dispatch';
import {
  buildSettlementEmailModel,
  isSettlementMailable,
  sendSettlementEmail,
  settlementEmailEnabled,
  type PlayerRecipient,
} from '@/lib/growth/settlementEmail';
import {
  composeWorldSettlementPost,
  type WorldSettlementClan,
} from '@/lib/growth/settlementPost';
import { defaultBriefingWeek } from '@/lib/serpent/briefing';
import { buildSerpentPanel, isMissingSerpentInfra } from '@/lib/server/serpent';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const maxDuration = 60;

/** Bounded per run, like every other batch cron in this codebase. */
const RECIPIENT_BATCH_MAX = 200;
/** How many clans the operator's post names. Not a cut line — a post length. */
const POST_CLAN_LIMIT = 5;

const SENDS_TABLE = 'settlement_dispatch_sends';

function report(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`Settlement dispatch ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Settlement dispatch ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

/** True when migration 051 has not been applied to this database. */
function isMissingLedger(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /settlement_dispatch_sends/i.test(error.message || '')
  );
}

interface WorldRollup {
  clans: WorldSettlementClan[];
  personalRecords: number;
  clanRecords: number;
  clanFirsts: number;
}

/**
 * Read the settled week at world scale. Returns null when the Serpent tables
 * are not there yet (pre-046) — the route then composes nothing rather than
 * inventing a week.
 */
async function readWorldRollup(weekStart: string): Promise<WorldRollup | null> {
  const { data: week, error: weekError } = await supabase
    .from('serpent_weeks')
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (weekError) {
    if (!isMissingSerpentInfra(weekError)) report('week read', weekError, { weekStart });
    return null;
  }
  if (!week?.id) return { clans: [], personalRecords: 0, clanRecords: 0, clanFirsts: 0 };

  const { data: clanRows, error: clanError } = await supabase
    .from('serpent_week_clans')
    .select('depth, contributing_members, clans(name, tag)')
    .eq('week_id', week.id)
    .gt('depth', 0)
    .order('depth', { ascending: false })
    .limit(POST_CLAN_LIMIT);
  if (clanError) {
    if (!isMissingSerpentInfra(clanError)) report('clan read', clanError, { weekStart });
    return null;
  }

  const clans: WorldSettlementClan[] = (clanRows ?? []).map((row) => {
    const clan = row.clans as unknown as { name?: string; tag?: string | null } | null;
    return {
      name: clan?.name ?? 'A clan',
      tag: clan?.tag ?? null,
      depth: Number(row.depth ?? 0),
      contributingMembers: Number(row.contributing_members ?? 0),
    };
  });

  const { data: records, error: recordError } = await supabase
    .from('serpent_chronicle_entries')
    .select('kind, previous_depth')
    .eq('week_id', week.id);
  if (recordError) {
    if (!isMissingSerpentInfra(recordError)) {
      report('chronicle read', recordError, { weekStart });
    }
    return { clans, personalRecords: 0, clanRecords: 0, clanFirsts: 0 };
  }

  let personalRecords = 0;
  let clanRecords = 0;
  let clanFirsts = 0;
  for (const row of records ?? []) {
    if (row.kind === 'personal_best_week') personalRecords += 1;
    else if (row.kind === 'clan_best_week') {
      clanRecords += 1;
      if (Number(row.previous_depth ?? 0) === 0) clanFirsts += 1;
    }
  }
  return { clans, personalRecords, clanRecords, clanFirsts };
}

/**
 * Claim the right to mail this recipient for this week. Returns false when
 * the row already existed — which is exactly the replay case — and false when
 * the ledger is missing, so a pre-051 database sends nothing at all.
 */
async function claimSend(
  weekStart: string,
  kind: 'player' | 'dispatch',
  key: string
): Promise<{ claimed: boolean; ledgerMissing: boolean }> {
  const { data, error } = await supabase
    .from(SENDS_TABLE)
    .upsert(
      { week_start: weekStart, recipient_kind: kind, recipient_key: key },
      { onConflict: 'week_start,recipient_kind,recipient_key', ignoreDuplicates: true }
    )
    .select('id');
  if (error) {
    if (isMissingLedger(error)) return { claimed: false, ledgerMissing: true };
    report('send claim', error, { weekStart, kind });
    return { claimed: false, ledgerMissing: false };
  }
  return { claimed: (data ?? []).length > 0, ledgerMissing: false };
}

async function recordOutcome(
  weekStart: string,
  kind: 'player' | 'dispatch',
  key: string,
  outcome: string
): Promise<void> {
  const { error } = await supabase
    .from(SENDS_TABLE)
    .update({ outcome })
    .eq('week_start', weekStart)
    .eq('recipient_kind', kind)
    .eq('recipient_key', key);
  if (error && !isMissingLedger(error)) {
    report('outcome write', error, { weekStart, kind, outcome });
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SETTLEMENT_DISPATCH_V1) {
    // Flag down: compose nothing, read nothing, send nothing. A cron pointed
    // at a flag-off deployment is silent, not broken.
    return NextResponse.json({ ok: true, skipped: 'flag-off', sent: 0, post: null });
  }

  const now = new Date();
  const weekStart = defaultBriefingWeek(now);

  try {
    // ---- 1. The operator's post. Composed, returned, never published. ----
    const rollup = await readWorldRollup(weekStart);
    let post = null;
    if (rollup) {
      try {
        post = composeWorldSettlementPost({ weekKey: weekStart, ...rollup }, now);
      } catch (error) {
        // Rule 7 refused the copy. Loud, and no post rather than a bad one.
        report('post composition', error, { weekStart });
        post = null;
      }
    }

    // ---- 2. The email. Opt-in only, deterministic, ledger-gated. ---------
    const email = {
      weekStart,
      enabled: settlementEmailEnabled(),
      eligible: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      ledgerMissing: false,
      /** Confirmed Dispatch addresses this week could reach. See below. */
      dispatchConfirmed: 0,
      dispatchDeferred: 0,
    };

    if (email.enabled) {
      await sendPlayerEmails(weekStart, now, email);
      await countDispatchSubscribers(email);
    }

    return NextResponse.json({ ok: true, weekStart, post, email });
  } catch (error) {
    report('run', error, { weekStart });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * The player leg: `player_settings.email_digest_opt_in` — the same consent
 * column the retired Analyst digest email read, so a player who opted in
 * before WP-1.09 keeps the weekly email they asked for, now written from
 * their week instead of generated about it.
 */
async function sendPlayerEmails(
  weekStart: string,
  now: Date,
  email: {
    eligible: number;
    sent: number;
    skipped: number;
    failed: number;
    ledgerMissing: boolean;
  }
): Promise<void> {
  const { data: settings, error: settingsError } = await supabase
    .from('player_settings')
    .select('player_id')
    .eq('email_digest_opt_in', true)
    .limit(RECIPIENT_BATCH_MAX);
  if (settingsError) {
    report('opt-in read', settingsError, { weekStart });
    return;
  }

  const playerIds = (settings ?? []).map((row) => row.player_id).filter(Boolean);
  if (playerIds.length === 0) return;

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, user_id')
    .in('id', playerIds);
  if (playersError) {
    report('players read', playersError, { weekStart });
    return;
  }

  for (const player of players ?? []) {
    if (!player.user_id) continue;

    const { data: userData, error: userError } =
      await supabase.auth.admin.getUserById(player.user_id);
    if (userError) {
      report('user lookup', userError, { playerId: player.id });
      continue;
    }

    const recipient: PlayerRecipient = {
      kind: 'player',
      email: userData?.user?.email ?? null,
      optIn: true,
      emailConfirmedAt: userData?.user?.email_confirmed_at ?? null,
      isAnonymous: userData?.user?.is_anonymous === true,
    };
    // The gate runs before the panel read, so an address that never confirmed
    // costs nothing and is never named to anything downstream.
    if (!isSettlementMailable(recipient)) {
      email.skipped += 1;
      continue;
    }
    email.eligible += 1;

    const claim = await claimSend(weekStart, 'player', String(player.id));
    if (claim.ledgerMissing) {
      email.ledgerMissing = true;
      return; // Fail closed for the whole run, not just this recipient.
    }
    if (!claim.claimed) {
      email.skipped += 1;
      continue;
    }

    const panel = await buildSerpentPanel(supabase, String(player.id), now);
    const model = buildSettlementEmailModel(panel, weekStart, { personal: true }, now);
    if (!model) {
      email.skipped += 1;
      await recordOutcome(weekStart, 'player', String(player.id), 'refused');
      continue;
    }

    const result = await sendSettlementEmail({ recipient, model });
    if (result === 'sent') email.sent += 1;
    else if (result === 'failed') email.failed += 1;
    else email.skipped += 1;
    await recordOutcome(
      weekStart,
      'player',
      String(player.id),
      result === 'sent' ? 'sent' : result === 'failed' ? 'failed' : 'refused'
    );
  }
}

/**
 * The Dispatch leg, and why it is a COUNT rather than a send.
 *
 * §11.6's Dispatch is the opt-in news and settlement list, and every message
 * on it must carry the unsubscribe link backed by `unsubscribe_token_hash`.
 * Migration 040 stores only the SHA-256 DIGEST of that token — deliberately,
 * so a leaked table cannot unsubscribe anybody — and the raw token exists only
 * inside the confirmation email that was already sent. This route therefore
 * cannot produce a working unsubscribe link for an existing subscriber, and
 * mailing them without one would break Rule 7's own footer contract. Rotating
 * the token on each send would fix that by breaking the link in the message
 * already in their inbox, which is worse.
 *
 * So the leg reports what it can reach and sends nothing, visibly, instead of
 * degrading quietly. Closing it needs a token that can be re-derived — an
 * HMAC of the row id under a server secret, verified rather than looked up —
 * which is a change to WP-0.08's unsubscribe route and belongs in its own work
 * package.
 */
async function countDispatchSubscribers(email: {
  dispatchConfirmed: number;
  dispatchDeferred: number;
}): Promise<void> {
  const { data, error } = await supabase
    .from(WAITLIST_TABLE)
    .select(WAITLIST_COLUMNS)
    .eq('status', 'confirmed')
    .limit(RECIPIENT_BATCH_MAX);
  if (error) {
    if (!isMissingDispatchInfra(error)) report('waitlist read', error);
    return;
  }

  for (const raw of data ?? []) {
    // The double-opt-in state machine itself, unchanged: a row is reachable
    // only when it is confirmed AND carries a confirmation timestamp. A
    // `status = 'confirmed'` row with a null `confirmed_at` is not counted,
    // and could not be mailed even if this leg sent anything.
    if (!isMailable(waitlistRowFrom(raw))) continue;
    email.dispatchConfirmed += 1;
    email.dispatchDeferred += 1;
  }
}
