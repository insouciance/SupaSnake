/**
 * Historical Serpent + Clan Energy settlement — GET /api/ops/serpent-settlement.
 *
 * Migration 059 retired new explicit Serpent attempts, but historical weeks
 * still have to converge. The same authenticated hourly sweep now reconciles
 * any post-payout Clan Energy contribution and settles completed 3-day battles.
 *
 * Auth: exact `CRON_SECRET` bearer, the same contract as
 * `/api/ops/session-sweep`, `/api/discord/dispatch` and `/api/analyst/cron`.
 * There is no unauthenticated path and no player-facing path — settlement is a
 * server act, and no client may trigger, influence or replay it (Rule 11).
 *
 * WHY RUNNING THIS TWICE IS SAFE
 *
 * Nothing on this path increments anything:
 *
 *   - weekly Depth is an EXACT RECOMPUTE from the week's session rows, under
 *     the same eligibility predicates the query and the pure fold both apply;
 *   - it lands through `GREATEST`, so a second pass writes the same value;
 *   - clan Depth is `SUM(member depth)` computed from the rows just written;
 *   - lifetime Depth is `SUM(depth)` over the player's settled weeks, clamped
 *     upward — never `lifetime + this week`;
 *   - Chronicle entries are uniquely indexed per (week, subject, kind) and
 *     inserted `ON CONFLICT DO NOTHING`.
 *
 * So a double fire, a retry, or a re-run after a partial failure converges on
 * the same Depth. The route settles EVERY submerged unsettled week, not just
 * last week's, so a missed run catches up instead of stranding a week.
 *
 * WHY THIS CANNOT PAY ANYTHING
 *
 * Settlement pays records (§7.3: "No DNA settlement bonus — Depth is measured,
 * not farmed"). Neither this route, `settleDueSerpentWeeks`, nor
 * `apply_serpent_week_settlement` writes `players.dna`, `total_dna_earned`,
 * `economy_transactions`, a cosmetic, an entitlement or a charge. The one
 * claim endpoint this game has is the Daily Take's, and it is not this.
 *
 * Response includes historical `settled`/`pairings` plus `energyBattles`.
 * `skipped` is true in the window
 * before migration 046 is applied — expected, not an error. A week that failed
 * to settle returns 500 so a silently broken cron is visible in the platform
 * log; the next run retries it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/server/cronAuth';
import { settleDueSerpentWeeks } from '@/lib/server/serpent';
import { settleDueClanWeeks } from '@/lib/server/clanHunt';
import {
  reconcileClanEnergyContributions,
  settleClanEnergyBattles,
} from '@/lib/server/clanEnergyBattle';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await settleDueSerpentWeeks(supabase);

  /**
   * Paired weeks settle SECOND, and that order is load-bearing (WP-1.02,
   * §9.4). `settle_clan_week_pairings` compares the clan Depths that
   * `apply_serpent_week_settlement` has just written, so running it first
   * would resolve every pairing against last week's numbers.
   *
   * It is idempotent on the same construction: depths are read, outcomes are
   * a comparison, laurels and Chronicle entries are `ON CONFLICT DO NOTHING`,
   * and rivalry memory is a full recompute over settled pairings. A double
   * fire converges. It pays no DNA — Rule 8 forbids a clan number that pays,
   * and there is no statement in that RPC through which it could.
   */
  const pairings = await settleDueClanWeeks(supabase);
  let energyReconciled: number | null = null;
  let energySettled: number | null = null;
  let energyError: string | null = null;
  try {
    energyReconciled = await reconcileClanEnergyContributions(supabase);
    energySettled = await settleClanEnergyBattles(supabase);
  } catch (error) {
    energyError = error instanceof Error ? error.message : 'Energy Battle settlement failed';
  }

  const body = {
    ok: !result.failed && !pairings.failed && energyError === null,
    settled: result.settled.map((week) => ({
      weekStart: week.weekStart,
      players: week.players,
      clans: week.clans,
      chronicleEntries: week.chronicleEntries,
      failed: week.failed,
    })),
    pairings: pairings.settled.map((week) => ({
      weekStart: week.weekStart,
      settled: week.settled,
      laurels: week.laurels,
      chronicleEntries: week.chronicleEntries,
      failed: week.failed,
    })),
    energyBattles: {
      reconciled: energyReconciled,
      settled: energySettled,
      skipped: energyReconciled === null && energySettled === null,
    },
    skipped: result.skipped,
  };

  if (result.failed || pairings.failed || energyError) {
    // The helper already reported it to Sentry; the cron needs a non-200 so a
    // permanently failing settlement is visible on the platform.
    return NextResponse.json(
      { ...body, error: energyError ?? 'Settlement failed' },
      { status: 500 }
    );
  }

  return NextResponse.json(body);
}
