/**
 * Analyst cron (Identity v1 §9.2) — the ONE daily Vercel cron this
 * feature is allowed (Hobby plan: crons run at most daily; vercel.json
 * schedules this at 0 7 * * *). Internal fan-out:
 *
 *  - DAILY: prune run_events older than 90 days (the 022 retention
 *    contract, via the 025 prune_run_events RPC; death_cause untouched).
 *  - UTC MONDAY: weekly digests for players with ≥3 earning runs in the
 *    just-completed week (batch, cache-first, budget-respecting — the
 *    loop stops when the daily token budget is spent; stragglers get
 *    generate-on-miss from GET /api/analyst/digest). Opt-in Resend
 *    email for registered players, sent only for freshly generated
 *    digests (idempotent across reruns).
 *  - POST-SEASON WEEK (the 7 days after a season's ends_on): archetype
 *    detection + badge grant + season Recall for ≥3-run players.
 *
 * Auth: exact CRON_SECRET bearer (same contract as
 * /api/discord/dispatch). Reports counts as JSON.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateArchetype,
  generateSeasonRecall,
  generateWeeklyDigest,
  isMissingAnalystInfra,
  lastCompletedWeekStart,
  latestEndedSeason,
} from '@/lib/analyst/insights';
import { budgetRemaining } from '@/lib/analyst/narrate';
import { digestEmailEnabled, sendDigestEmail } from '@/lib/analyst/email';
import type { DigestFacts } from '@/lib/analyst/facts';
import { isAuthorizedCron } from '@/lib/server/cronAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const maxDuration = 60;

const DIGEST_BATCH_MAX = 100;
const SEASON_BATCH_MAX = 100;
const MIN_EARNING_RUNS = 3;

function addDays(day: string, days: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** player_id → earning-run count within [from, to). */
async function earningRunCounts(
  from: string,
  to: string
): Promise<Map<string, number> | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('player_id')
    .gt('dna_earned', 0)
    .not('ended_at', 'is', null)
    .gte('ended_at', from)
    .lt('ended_at', to)
    .limit(10000);
  if (error) {
    console.error('Analyst cron sessions read failed:', error.message);
    return null;
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.player_id, (counts.get(row.player_id) ?? 0) + 1);
  }
  return counts;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request.headers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const report: Record<string, unknown> = {
      live: true,
      day: now.toISOString().slice(0, 10),
    };

    // ---- DAILY: run_events retention (90 days) --------------------------
    const { data: pruned, error: pruneError } = await supabase.rpc(
      'prune_run_events',
      { p_days: 90 }
    );
    if (pruneError) {
      if (isMissingAnalystInfra(pruneError)) {
        report.live = false;
        report.pruned = null;
      } else {
        console.error('Analyst cron prune failed:', pruneError.message);
        report.pruned = null;
      }
    } else {
      report.pruned = pruned ?? 0;
    }

    // ---- UTC MONDAY: weekly digests ------------------------------------
    if (report.live && now.getUTCDay() === 1) {
      const weekStart = lastCompletedWeekStart(now);
      const digests = {
        weekStart,
        eligible: 0,
        generated: 0,
        cached: 0,
        skipped: 0,
        emailed: 0,
        budgetStopped: false,
      };
      const counts = await earningRunCounts(weekStart, addDays(weekStart, 7));
      if (counts) {
        const eligible = Array.from(counts.entries())
          .filter(([, n]) => n >= MIN_EARNING_RUNS)
          .map(([playerId]) => playerId)
          .slice(0, DIGEST_BATCH_MAX);
        digests.eligible = eligible.length;

        // Opt-in set + auth uids for the email pass (pre-025 → no emails)
        const optedIn = new Set<string>();
        const userIds = new Map<string, string>();
        if (eligible.length > 0) {
          const { data: settings, error: settingsError } = await supabase
            .from('player_settings')
            .select('player_id, email_digest_opt_in')
            .in('player_id', eligible)
            .eq('email_digest_opt_in', true);
          if (settingsError) {
            if (!isMissingAnalystInfra(settingsError)) {
              console.error(
                'Analyst cron settings read failed:',
                settingsError.message
              );
            }
          } else {
            for (const row of settings ?? []) optedIn.add(row.player_id);
          }
          const { data: playerRows, error: playersError } = await supabase
            .from('players')
            .select('id, user_id')
            .in('id', eligible);
          if (playersError) {
            console.error(
              'Analyst cron players read failed:',
              playersError.message
            );
          } else {
            for (const row of playerRows ?? []) {
              if (row.user_id) userIds.set(row.id, row.user_id);
            }
          }
        }

        for (const playerId of eligible) {
          if ((await budgetRemaining(supabase, now)) <= 0) {
            digests.budgetStopped = true;
            break;
          }
          const result = await generateWeeklyDigest(supabase, {
            playerId,
            weekStart,
          });
          if (!result.live) {
            report.live = false;
            break;
          }
          if (result.insight && !result.cached) digests.generated += 1;
          else if (result.cached) digests.cached += 1;
          else digests.skipped += 1;

          // Email: freshly generated + opted in + registered email only
          if (
            result.insight &&
            !result.cached &&
            optedIn.has(playerId) &&
            digestEmailEnabled()
          ) {
            const userId = userIds.get(playerId);
            if (userId) {
              const { data: userData, error: userError } =
                await supabase.auth.admin.getUserById(userId);
              if (userError) {
                console.error(
                  'Analyst cron user lookup failed:',
                  userError.message
                );
              } else if (
                userData?.user?.email &&
                !userData.user.is_anonymous
              ) {
                const content = result.insight.content;
                const sent = await sendDigestEmail({
                  to: userData.user.email,
                  handle: '',
                  weekStart,
                  content,
                  facts: (content.facts as DigestFacts | undefined) ?? null,
                });
                if (sent) digests.emailed += 1;
              }
            }
          }
        }
      }
      report.digests = digests;
    }

    // ---- POST-SEASON WEEK: archetypes + Recalls ------------------------
    if (report.live) {
      const season = await latestEndedSeason(supabase, now);
      const today = now.toISOString().slice(0, 10);
      if (season && today < addDays(season.endsOn, 7)) {
        const seasonReport = {
          seasonSeq: season.seq,
          eligible: 0,
          archetypes: 0,
          badges: 0,
          recalls: 0,
          cached: 0,
          budgetStopped: false,
        };
        const counts = await earningRunCounts(season.startsOn, season.endsOn);
        if (counts) {
          const eligible = Array.from(counts.entries())
            .filter(([, n]) => n >= MIN_EARNING_RUNS)
            .map(([playerId]) => playerId)
            .slice(0, SEASON_BATCH_MAX);
          seasonReport.eligible = eligible.length;

          const userIds = new Map<string, string>();
          if (eligible.length > 0) {
            const { data: playerRows, error: playersError } = await supabase
              .from('players')
              .select('id, user_id')
              .in('id', eligible);
            if (playersError) {
              console.error(
                'Analyst cron season players read failed:',
                playersError.message
              );
            } else {
              for (const row of playerRows ?? []) {
                if (row.user_id) userIds.set(row.id, row.user_id);
              }
            }
          }

          for (const playerId of eligible) {
            if ((await budgetRemaining(supabase, now)) <= 0) {
              seasonReport.budgetStopped = true;
              break;
            }
            const archetype = await generateArchetype(supabase, {
              playerId,
              season,
              now,
            });
            if (!archetype.live) {
              report.live = false;
              break;
            }
            if (archetype.insight && !archetype.cached) {
              seasonReport.archetypes += 1;
              if (archetype.archetype && archetype.archetype !== 'hatchling') {
                seasonReport.badges += 1;
              }
            }
            const recall = await generateSeasonRecall(supabase, {
              playerId,
              userId: userIds.get(playerId) ?? null,
              season,
            });
            if (recall.insight && !recall.cached) seasonReport.recalls += 1;
            else if (recall.cached) seasonReport.cached += 1;
          }
        }
        report.season = seasonReport;
      }
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('Analyst cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
