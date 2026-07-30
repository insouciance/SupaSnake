/**
 * Game Session API - Start/End game sessions
 *
 * Server authority: results validated and recomputed server-side; Energy is
 * recovered, committed and stamped server-side (Constitution §8.6).
 *
 * Energy never gates a run. There is no start check: every run starts,
 * Scores, ranks and counts. A commitment multiplies only credited harvest;
 * an explicit zero-Energy run remains available at the lean factor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '@/shared/config/game';
import { checkRateLimit } from '@/lib/server/rateLimit';
import {
  appendAdvisory,
  validateGameResult,
  validationCodeOf,
} from '@/lib/server/gameValidator';
import { computeRunTotals, normalizeDynastyName } from '@/shared/game/rulesets';
import { sanitizeTraits, type TraitId } from '@/shared/game/traits';
import {
  MASTERY_UNLOCK_TRACK,
  fullMutationPool,
  levelForXp,
  masteryUnlockLabel,
  masteryXpForRun,
  unlockedMutationPool,
} from '@/shared/game/mastery';
import { getMasteryXpStrict, grantMasteryXp } from '@/lib/server/mastery';
import { getGauntletBan } from '@/lib/server/gauntlet';
import {
  getSeasonalGeneIds,
  getSeasonalMutationIds,
} from '@/lib/server/season';
import {
  applyGauntletBan,
  gauntletSuppressedStrains,
} from '@/shared/game/gauntlet';
import {
  ANOMALIES,
  anomalyForWeek,
  anomalySummary,
  anomalyWeekEnd,
  anomalyWeekStart,
  type AnomalyId,
} from '@/shared/game/anomalies';
import * as Sentry from '@sentry/nextjs';
import {
  commitRunEnergy,
  EnergyCommitmentError,
  isMissingEnvelopeInfra,
} from '@/lib/server/energyEnvelope';
import {
  applyEnergyHarvestMultiplier,
  energyCommitmentMultiplierBps,
  isChargeMeterVisible,
  isChargeState,
  NO_EXEMPTION,
  type ChargeExemptionFacts,
  type ChargeState,
} from '@/shared/game/energyEnvelope';
import { recordClanEnergyContribution } from '@/lib/server/clanEnergyBattle';
import { ascendanceYieldBreakdown } from '@/shared/game/ascendance';
import { validateRunEvents } from '@/lib/server/runEventValidator';
import { isRunDeathCause, type RunDeathCause } from '@/shared/game/runEvents';
import {
  abandonStalePlayerSessions,
  isMissingLifecycleInfra,
} from '@/lib/server/sessionLifecycle';
import {
  isClientForfeitReason,
  SETTLED_END_REASON,
} from '@/lib/session/lifecycle';
import { getLiveIdentityForPlayer, isMissingIdentityInfra } from '@/lib/server/identity';
import {
  composeGenePool,
  deriveFtue,
  deriveHeirloom,
  ftueTierCap,
  getGenomeRunFacts,
  lineageFromRows,
} from '@/lib/server/genome';
import {
  parseRunStartContext,
  serializeRunStartContext,
  RUN_CONTEXT_VERSION,
  type RunStartContext,
  type RunStartGenomeContext,
} from '@/lib/server/runContext';
import { verifyOfferTrace } from '@/lib/server/offerVerifier';
import { LADDER_ENABLED } from '@/lib/features/ladder';
import {
  ACTIVE_GROWTH_PROFILE,
  type GrowthProfileId,
} from '@/shared/game/growth';
import {
  DEFAULT_LADDER_RUNG,
  isLadderRung,
  ladderGrowthProfileId,
  ladderRung as ladderRungDefinition,
} from '@/shared/game/ladder';
import { readLadderRecords, recordLadderRung } from '@/lib/server/ladderRecords';
import type { LineageBias } from '@/shared/game/offerGravity';
import { ANOMALY_STRAINS } from '@/shared/game/anomalies';
import type { GenomeValidationContext } from '@/lib/server/gameValidator';
import { randomUUID } from 'crypto';
import { refreshPlayerRecords } from '@/lib/server/records';
import {
  enqueueMasteryLevelup,
  refreshLinkedRolesForPlayer,
} from '@/lib/server/discordSync';
// Two now-deleted server modules used to be imported here: the account
// multiplier stack (removed by WP-0.02) and the achievement checker (retired
// into the Legacy Records by WP-0.04). Neither name is spelled out, because a
// WP-0.02 test asserts this file's source cannot mention the former at all.
import { recordCodexDiscoveries } from '@/lib/server/codex';
import { FTUE_V2_ENABLED } from '@/lib/ftue/config';
import {
  claimSignalObjectiveRun,
  settleSignalAttemptForSession,
} from '@/lib/server/signal';
import { resolveSessionWorldCondition } from '@/lib/server/worldCondition';
import {
  conditionFromAnomaly,
  conditionOfferTilt,
  conditionStrainThresholdDelta,
  conditionSuppressedStrains,
  NEUTRAL_CONDITION,
  type WorldCondition,
} from '@/shared/game/worldCondition';
import type { StrainId } from '@/shared/game/strains';
import { describeDailyTakeSlot } from '@/lib/server/dailyTake';
import {
  buildRunImpactEnvelope,
  loadRunImpactEnvelope,
  persistRunImpactEnvelope,
} from '@/lib/server/runImpact';
import { progressionJson } from '@/lib/server/noStoreResponse';
import { settleSessionReward } from '@/lib/server/sessionReward';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// WP-2.05: 503, NEVER 404 — and the run keeps its long window
// ---------------------------------------------------------------------------
//
// `src/lib/outbox/rewardOutbox.ts` retries a 5xx and DROPS a 4xx. That single
// fact fixes the direction of every error-handling change in this package: a
// transient read failure that answered 404 ("Session not found") deleted the
// outbox entry, and with it a settled run's DNA, permanently. A 503 is
// retried, so the run survives the blip.
//
// The second half matters just as much. An unsettled row whose `end_reason` is
// NULL is swept `abandoned` after STALE_OPEN_MINUTES (3 hours). Writing
// `end_reason = 'completed'` while leaving `ended_at` NULL is the marker
// WP-0.06 already uses for "this run is owed a settlement" — the opportunistic
// sweep skips it (`.is('end_reason', null)`) and the cron's
// STALE_PENDING_SETTLEMENT_MINUTES window (8 days) owns it instead. So a
// player who is offline for a day still gets paid.
//
// This does NOT settle anything: it writes one column. No payout, no record,
// no `ended_at`, so the settlement path's own idempotency guard is untouched
// and the replay that follows runs the whole settlement normally.
async function reserveSettlementRetry(
  sessionId: string,
  playerId: string,
  /**
   * True when this request had already stamped `ended_at` (the settlement
   * write is the idempotency anchor and runs before the rewards). Re-opening
   * is then mandatory: leaving `ended_at` set would make the retry hit the
   * "already ended" 409 and the player would never be paid for a run the
   * server never actually settled.
   */
  reopen: boolean
): Promise<void> {
  const marker = reopen
    ? { ended_at: null, end_reason: SETTLED_END_REASON }
    : { end_reason: SETTLED_END_REASON };
  const query = supabase
    .from('game_sessions')
    .update(marker)
    .eq('id', sessionId)
    .eq('player_id', playerId);
  const { error } = reopen ? await query : await query.is('ended_at', null);
  if (error && !isMissingLifecycleInfra(error)) {
    console.error('Failed to reserve the pending-settlement window:', {
      playerId,
      sessionId,
      error,
    });
    Sentry.captureException(
      new Error(`pending-settlement marker failed: ${error.message}`),
      { extra: { playerId, sessionId } }
    );
  }
}

/**
 * Report a settlement-blocking read failure and answer 503.
 *
 * Every caller has already established that the run happened; the server just
 * cannot currently read something it needs in order to pay for it correctly.
 * Paying anyway would be the DNA-loss bug this package exists to remove.
 */
async function settlementUnavailable(
  scope: string,
  error: unknown,
  context: { playerId: string; sessionId: string; alreadyStampedEnd?: boolean }
): Promise<NextResponse> {
  console.error(`Settlement read failed (${scope}):`, { ...context, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Settlement read failed: ${scope}`),
    { extra: { scope, ...context, error }, tags: { wp: 'wp-2.05', scope } }
  );
  await reserveSettlementRetry(
    context.sessionId,
    context.playerId,
    context.alreadyStampedEnd === true
  );
  return NextResponse.json(
    {
      error: 'Settlement is temporarily unavailable — your run is saved, retry shortly',
      retryable: true,
    },
    { status: 503 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const {
      action,
      mode,
      sessionId,
      // Constitution §7.2: the objective the player took, as a LOOKUP KEY
      // among the day's server-derived three. Never a definition — there is
      // deliberately no day, target, seed or condition field beside it.
      signalObjectiveId,
      energyCommitment,
      confirmMaxEnergy,
      snake_id,
      score,
      dna_earned,
      duration_seconds,
      died,
      victory,
      food_count,
      extracted,
      mutations,
      phoenix_triggered_at_food,
      genome,
      death_cause,
      run_events,
    } = body;

    let { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, dna, total_games_played')
      .eq('user_id', user.id)
      .single();

    // A direct /game guest can submit Start at the boundary between auth and
    // the profile GET that normally performs FTUE repair. Keep session start
    // authoritative too: migration 037's bootstrap is atomic/idempotent and
    // preserves every existing choice, so a missing row is safely repaired
    // before any rate check, Energy deduction, or session write occurs.
    if (!player && action === 'start' && FTUE_V2_ENABLED) {
      const { error: bootstrapError } = await supabase.rpc('bootstrap_player', {
        p_user_id: user.id,
      });
      if (bootstrapError) {
        console.error('Session-start player repair failed:', {
          userId: user.id,
          error: bootstrapError,
        });
        return NextResponse.json(
          { error: 'Player preparation failed — retry when you are ready' },
          { status: 503 }
        );
      }

      ({ data: player, error: playerError } = await supabase
        .from('players')
        .select('id, dna, total_games_played')
        .eq('user_id', user.id)
        .single());
    }

    if (!player) {
      if (playerError) {
        console.error('Session player lookup failed:', {
          userId: user.id,
          code: playerError.code,
        });
      }
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Design v2 §7.4 Free Play: unlimited rewardless practice runs. The
    // session row is still written and validated (server authority
    // unchanged) but marked is_free_play so contracts/leaderboards/economy
    // reads exclude it. It pays nothing, so it takes nothing: exempt.
    const isFreePlay = mode === 'free';

    // Design v2 §7.2 Weekly Anomaly board: an anomaly run is an EARNING
    // run (charge, DNA, contracts, streak) under the week's modifier
    // ruleset that additionally scores on the anomaly leaderboard. The
    // anomaly itself is SERVER-DERIVED from the calendar (deterministic
    // rotation) and stamped on the session row - never client-asserted.
    const isAnomalyRun = mode === 'anomaly';

    // Constitution v1.5 retires explicit Serpent attempts. A legacy client
    // sending `mode: 'serpent'` now receives the same ordinary Energy run as
    // `mode: 'earn'`; positive commitment automatically feeds the active Clan
    // Energy Battle. Historical stamped Serpent sessions still settle below.

    // Constitution §7.2 The World Signal: the day names a condition and three
    // objectives, and the player takes one. `mode: 'signal'` is a REQUEST, in
    // exactly the sense `mode: 'serpent'` is. It becomes a fact only if the
    // server derives the day from its own calendar, resolves the named
    // objective among that day's three, and the database confirms this run
    // owns the day's one attempt; miss any of those and it is an ordinary
    // charged run.
    const isSignalRun = mode === 'signal';

    if (action === 'start') {
      const rateCheck = await checkRateLimit(supabase, player.id, 'game_start');
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: 'Rate limited', retryAfterMs: rateCheck.retryAfterMs },
          { status: 429 }
        );
      }

      // WP-0.06 (GT §9.6): before opening a new run, close this player's own
      // runs that have been open past the stale window. Starting another run
      // is the evidence - those were left behind, so they close as
      // `abandoned`. This is about the player, not about the request, so it
      // runs before the request is validated.
      //
      // The sweep writes `ended_at` and `end_reason` only; it cannot grant
      // DNA, Yield or a record, and it never touches a row that settled and is
      // waiting for an outbox replay (Rule 6). Non-fatal: a failed sweep
      // leaves the row open, which is exactly the status quo it fixes.
      await abandonStalePlayerSessions(supabase, player.id);

      // Old clients default to the conservative one-Energy commitment. Zero
      // is an explicit lean run; 1..6 is a stored-Energy run. A maximum
      // commitment requires an extra acknowledgement so a stale tap or replay
      // cannot silently expose the full stock.
      const requestedEnergyCommitment = isFreePlay
        ? 0
        : energyCommitment === undefined
          ? 1
          : energyCommitment;
      if (
        typeof requestedEnergyCommitment !== 'number' ||
        !Number.isInteger(requestedEnergyCommitment) ||
        requestedEnergyCommitment < 0 ||
        requestedEnergyCommitment > GAME_CONFIG.economy.energy.capacity
      ) {
        return NextResponse.json(
          { error: 'Energy commitment must be a whole number from 0 to 6' },
          { status: 400 }
        );
      }
      if (
        requestedEnergyCommitment === GAME_CONFIG.economy.energy.capacity &&
        confirmMaxEnergy !== true
      ) {
        return NextResponse.json(
          { error: 'Confirm the maximum Energy commitment before starting' },
          { status: 400 }
        );
      }

      // Energy never gates playing: zero remains a valid lean run. A positive
      // commitment can be rejected only when that requested stock is not
      // available; the player can immediately choose a smaller amount or zero.

      if (!snake_id) {
        return NextResponse.json({ error: 'snake_id is required' }, { status: 400 });
      }

      // Load the snake with its variant + dynasty; validate ownership.
      // select('*') on the row itself so the traits column (migration 018)
      // rides along when it exists without erroring pre-018.
      // snake_variants(*) so genome lineage columns (migration 030) ride
      // along when they exist without erroring pre-030.
      //
      // WP-2.05: the error is checked. A discarded one used to produce
      // `!snake` and a 400 "Snake not found or not owned" — telling the
      // player their own snake is not theirs because a read blipped. A read
      // failure is now a 503 the client can retry; genuine non-ownership
      // keeps the 400 it deserves.
      const { data: snake, error: snakeReadError } = await supabase
        .from('collected_snakes')
        .select('*, snake_variants(*, dynasties(name))')
        .eq('id', snake_id)
        .eq('player_id', player.id)
        .maybeSingle();

      if (snakeReadError) {
        console.error('Session-start snake lookup failed:', {
          playerId: player.id,
          snakeId: snake_id,
          error: snakeReadError,
        });
        Sentry.captureException(
          new Error(`Session-start snake lookup failed: ${snakeReadError.message}`),
          { extra: { playerId: player.id, snakeId: snake_id } }
        );
        return NextResponse.json(
          { error: 'Could not prepare the run — retry when you are ready', retryable: true },
          { status: 503 }
        );
      }

      if (!snake) {
        const { count } = await supabase
          .from('collected_snakes')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', player.id);

        if (!count) {
          return NextResponse.json(
            { error: 'No playable snake is available. Retry player setup from Home.' },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: 'Snake not found or not owned' }, { status: 400 });
      }

      if (!snake.is_equipped) {
        return NextResponse.json({ error: 'Snake is not equipped' }, { status: 400 });
      }

      // Joined variant/dynasty rows (supabase returns object for FK joins)
      const variantJoin = snake.snake_variants as unknown as
        | { id: string; name: string; dynasties: { name: string } | null }
        | null;
      const dynastyName = variantJoin?.dynasties?.name;

      if (!dynastyName) {
        return NextResponse.json({ error: 'Snake variant data is invalid' }, { status: 500 });
      }

      // Server-trusted trait config for the engine (Design v2 Phase 3A):
      // read from the snake ROW - the client never asserts its own traits
      const snakeTraits = sanitizeTraits(
        (snake as Record<string, unknown>).traits
      );

      // Per-dynasty mastery (section 7.1): the offer pool the engine may
      // draw from. Earning runs get the EARNED pool (base ten + this
      // dynasty's M3/M6/M9 unlocks, recomputed from player_mastery -
      // pre-019 this reads as 0 XP => base pool). Free Play gets the
      // entire pool (section 7.4: practice is also a showroom).
      //
      // WP-2.05: strict at START too. A run that begins under a silently
      // narrowed pool is a run whose offers, FTUE gates and tier cap all
      // disagree with what settlement will recompute — and the run-start
      // context persisted below would then freeze that wrong answer in for
      // the whole run. No session row exists yet at this point, so refusing
      // costs nothing but a retry.
      const startDynasty = normalizeDynastyName(dynastyName);
      const startMasteryRead = await getMasteryXpStrict(
        supabase,
        player.id,
        startDynasty
      );
      if (!startMasteryRead.ok) {
        console.error('Session-start mastery read failed:', {
          playerId: player.id,
          dynasty: startDynasty,
          error: startMasteryRead.error,
        });
        Sentry.captureException(
          startMasteryRead.error instanceof Error
            ? startMasteryRead.error
            : new Error('Session-start mastery read failed'),
          { extra: { playerId: player.id, dynasty: startDynasty } }
        );
        return NextResponse.json(
          { error: 'Could not prepare the run — retry when you are ready', retryable: true },
          { status: 503 }
        );
      }
      const masteryXp = startMasteryRead.xp;
      const masteryLevel = levelForXp(masteryXp);

      // Clan Gauntlet (section 8.2 item 3): the mutation banned by this
      // week's duel opponent is removed from the offer pool for counted
      // runs. Free Play is NEVER banned (practice pool untouched); the
      // lookup itself is pre-migration-020 safe (missing RPC => null =>
      // unfiltered pool, exactly today's behavior).
      const gauntletBan = isFreePlay
        ? null
        : await getGauntletBan(supabase, player.id, startDynasty);
      // Seasonal mutations (section 7.2): in every offer pool from their
      // season's start onward (then permanent). Pre-021 this reads empty.
      const seasonalIds = await getSeasonalMutationIds(supabase);
      const seasonalGeneIds = await getSeasonalGeneIds(supabase);
      const mutationPool = applyGauntletBan(
        [
          ...(isFreePlay
            ? fullMutationPool(startDynasty)
            : unlockedMutationPool(startDynasty, masteryLevel)),
          ...seasonalIds,
        ],
        gauntletBan
      );
      const masteryInfo = {
        dynasty: startDynasty,
        xp: masteryXp,
        level: masteryLevel,
      };

      // GENOME capability (Buildcraft: The Genome): the server issues a
      // run seed + the derived run-start context. The engine only runs
      // genome behavior when it receives this block - never on a client
      // flag. Everything here is server-derived.
      let genomeBlock: Record<string, unknown> | null = null;
      let genomeSeed: string | null = null;
      let startRunContext: RunStartContext | null = null;
      let startGenomeContext: RunStartGenomeContext | null = null;
      if (GAME_CONFIG.features.genome) {
        genomeSeed = randomUUID();
        // WP-2.05: refused rather than absorbed. `bankedRuns = 0` from a
        // swallowed error hands the engine tier cap 1 and an empty heirloom,
        // and the context persisted below would then make that wrong answer
        // authoritative for the whole run.
        const runFacts = await getGenomeRunFacts(supabase, player.id);
        if (!runFacts.ok) {
          console.error('Session-start genome facts read failed:', {
            playerId: player.id,
            reason: runFacts.reason,
            error: runFacts.error,
          });
          Sentry.captureException(
            runFacts.error instanceof Error
              ? runFacts.error
              : new Error(`Session-start genome facts read failed: ${runFacts.reason}`),
            { extra: { playerId: player.id, reason: runFacts.reason } }
          );
          return NextResponse.json(
            { error: 'Could not prepare the run — retry when you are ready', retryable: true },
            { status: 503 }
          );
        }
        const { bankedRuns, prevRunDied, ownedVariants } = runFacts;
        const ftue = deriveFtue(bankedRuns, masteryLevel, ownedVariants);
        const lineage = lineageFromRows(
          snake as Record<string, unknown>,
          (snake.snake_variants as Record<string, unknown> | null) ?? null
        );
        const { heirloom, lineageBias } = deriveHeirloom(
          lineage,
          snakeTraits,
          ftue
        );
        const genePool = composeGenePool(
          startDynasty,
          masteryLevel,
          seasonalGeneIds,
          isFreePlay ? null : gauntletBan,
          isFreePlay
        );
        genomeBlock = {
          runSeed: genomeSeed,
          heirloom,
          genePool,
          lineage: lineageBias,
          // Set below, once the run's world condition is resolved - which
          // cannot happen until the Signal claim has answered.
          anomalyStrain: null,
          suppressedStrains: gauntletSuppressedStrains(gauntletBan),
          prevRunDied,
          ftue: {
            bankedRuns,
            strainTagsUnlocked: ftue.strainTagsUnlocked,
            expressionsUnlocked: ftue.expressionsUnlocked,
            infuseUnlocked: ftue.infuseUnlocked,
            spawnPointsUnlocked: ftue.spawnPointsUnlocked,
            splicesUnlocked: ftue.splicesUnlocked,
            apexesUnlocked: ftue.apexesUnlocked,
          },
        };
        startGenomeContext = {
          genePool,
          heirloom,
          lineage: lineageBias,
          tierCap: ftueTierCap(ftue),
          suppressedStrains: [...gauntletSuppressedStrains(gauntletBan)],
          splicesUnlocked: ftue.splicesUnlocked,
          prevRunDied,
        };
      }

      // WP-2.05: the run-start context. Everything above that shapes the
      // recompute, frozen at the moment the engine was handed it, so
      // settlement can read it instead of re-deriving it from six live
      // queries that may each answer differently. The run's world condition
      // is NOT here: `resolveSessionWorldCondition` owns that fact.
      // D1 is ruled: the Growth Lab selector is retired. Every NEW run gets
      // the versioned dynasty profile; missing stamps remain the historical
      // +1 baseline at settlement. The client cannot select run math.
      let growthProfileId: GrowthProfileId = ACTIVE_GROWTH_PROFILE;

      // ---------------------------------------------------------------
      // The D2 ladder rung (WP-3.12) — the growth profile's pattern, verbatim
      // ---------------------------------------------------------------
      // THE CLIENT ASKS; THE SERVER DECIDES. Three conditions have to hold for
      // a run to be stamped above Ground, and missing any one collapses it to
      // rung 0 — the shipped game — rather than to an error:
      //
      //   1. the rollout flag is on (it gates the SELECTOR, never the math);
      //   2. the request names a rung this build actually offers; and
      //   3. the player has UNLOCKED it, which is a database fact, not a claim.
      //
      // Condition 3 is where the anti-re-climb ruling lives. `readLadderRecords`
      // answers with MAX(best_rung) across ALL dynasties, so a player who beat
      // rung 4 on PRIMAL opens a CYBER run at rung 5 without re-climbing; their
      // CYBER record stays their CYBER record, in its own row. Before migration
      // 057 applies, that read reports the ladder unavailable and every run is
      // Ground — the app is deployable ahead of its migration, as the runbook
      // requires.
      const requestedRung = (body as Record<string, unknown>)?.ladderRung;
      let ladderRung: number = DEFAULT_LADDER_RUNG;
      if (LADDER_ENABLED && isLadderRung(requestedRung)) {
        const records = await readLadderRecords(supabase, player.id);
        if (records.available) {
          // CLAMPED, never refused. A client asking above its unlock is far
          // more likely to be a stale tab than an attack, and refusing the run
          // would cost a charge to teach a lesson the clamp teaches for free —
          // the response echoes the rung it actually got.
          ladderRung = Math.min(requestedRung, records.attemptable);
        }
      }
      // The rung's growth floor is applied HERE, before the stamp, so it needs
      // no second channel: the effective profile is what gets stamped, and the
      // engine, the length models and the validator's food-rate bound all
      // already replay from that one stamp. The floor never lowers a choice —
      // a player who opted into a faster curve in the lab keeps it.
      if (ladderRung !== DEFAULT_LADDER_RUNG) {
        growthProfileId = ladderGrowthProfileId(growthProfileId, ladderRung);
      }

      startRunContext = {
        v: RUN_CONTEXT_VERSION,
        snake: {
          id: snake.id,
          generation:
            typeof (snake as Record<string, unknown>).generation === 'number'
              ? ((snake as Record<string, unknown>).generation as number)
              : 1,
          traits: snakeTraits,
        },
        mutationPool,
        freePlay: isFreePlay,
        ...(growthProfileId ? { growthProfileId } : {}),
        ...(ladderRung !== DEFAULT_LADDER_RUNG ? { ladderRung } : {}),
        genome: startGenomeContext,
      };

      const serverStartedAt = new Date().toISOString();

      // Anomaly stamp (section 7.2): the week's modifier, derived from the
      // deterministic rotation - the client never asserts it
      const startedAtDate = new Date(serverStartedAt);
      const startAnomalyId = isAnomalyRun ? anomalyForWeek(startedAtDate) : null;
      const startAnomalyWeek = isAnomalyRun
        ? anomalyWeekStart(startedAtDate).toISOString().slice(0, 10)
        : null;

      const sessionInsert: Record<string, unknown> = {
        player_id: player.id,
        snake_used_id: snake.id,
        snake_variant_id: snake.snake_variant_id,
        dynasty: dynastyName,
        server_started_at: serverStartedAt,
        // Free-play marker (migration 016) - only sent when true so the
        // insert stays compatible with the pre-016 schema until it applies
        ...(isFreePlay ? { is_free_play: true } : {}),
        // Anomaly markers (migration 021) - only sent on anomaly runs so
        // the insert stays compatible with the pre-021 schema
        ...(isAnomalyRun
          ? { anomaly_id: startAnomalyId, anomaly_week: startAnomalyWeek }
          : {}),
      };
      // THE PRE-MIGRATION RETRY LADDER (extended by WP-2.05).
      //
      // The app must be deployable BEFORE its migrations apply — the runbook
      // requires it, and the release order is deploy → 054 → 055. So the
      // insert asks for everything it wants and steps down one rung per
      // missing column, newest column first:
      //
      //   run_context + run_seed   (post-054)
      //     -> run_seed only       (029..053: no context, settlement
      //                             re-derives exactly as it does today)
      //     -> neither             (pre-029: the run starts as legacy, since
      //                             the engine only goes genome when the
      //                             response carries the block)
      //
      // Losing `run_context` costs a convenience, never a payout. Losing
      // `run_seed` costs the genome capability, which is what it has always
      // cost.
      const contextInsert = startRunContext
        ? { run_context: serializeRunStartContext(startRunContext) }
        : {};
      let { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .insert({
          ...sessionInsert,
          ...(genomeSeed ? { run_seed: genomeSeed } : {}),
          ...contextInsert,
        })
        .select()
        .single();
      if (
        sessionError &&
        startRunContext &&
        /run_context/i.test(sessionError.message || '')
      ) {
        startRunContext = null;
        ({ data: session, error: sessionError } = await supabase
          .from('game_sessions')
          .insert({
            ...sessionInsert,
            ...(genomeSeed ? { run_seed: genomeSeed } : {}),
          })
          .select()
          .single());
      }
      if (
        sessionError &&
        genomeSeed &&
        /run_seed/i.test(sessionError.message || '')
      ) {
        genomeSeed = null;
        genomeBlock = null;
        startRunContext = null;
        ({ data: session, error: sessionError } = await supabase
          .from('game_sessions')
          .insert(sessionInsert)
          .select()
          .single());
      }

      if (sessionError) {
        console.error('Session creation error:', sessionError);
        // Pre-migration-016 window: the is_free_play column doesn't exist
        // yet - refuse free mode with a clear signal instead of a raw 500.
        // Earning runs are unaffected (the marker is omitted from their
        // insert), so this branch stays deployable before 016 applies.
        if (isFreePlay && /is_free_play/i.test(sessionError.message || '')) {
          return NextResponse.json(
            { error: 'Free Play is not available yet — try an earning run' },
            { status: 503 }
          );
        }
        // Pre-migration-021 window: the anomaly columns don't exist yet -
        // refuse anomaly mode cleanly; normal runs omit the markers and
        // are unaffected.
        if (isAnomalyRun && /anomaly_id|anomaly_week/i.test(sessionError.message || '')) {
          return NextResponse.json(
            { error: 'The Anomaly board is not live yet — try a ranked run' },
            { status: 503 }
          );
        }
        return NextResponse.json({ error: 'Failed to create session', details: sessionError.message }, { status: 500 });
      }

      // Anomaly board context for the HUD (name + modifier + week timer)
      const anomalyInfo =
        isAnomalyRun && startAnomalyId
          ? {
              id: startAnomalyId,
              name: ANOMALIES[startAnomalyId].name,
              // anomalySummary, not `.effect`: WP-2.07a split the anomaly prose
              // into effect + cost so the Lexicon could render the halves
              // separately. The in-run HUD wants the whole sentence, and
              // reading `.effect` alone would quietly show players the benefit
              // while hiding the price ("All food x1.5 DNA" with no mention
              // that portals arrive 6 foods later).
              effect: anomalySummary(startAnomalyId),
              weekStart: startAnomalyWeek,
              endsAt: anomalyWeekEnd(anomalyWeekStart(startedAtDate)).toISOString(),
            }
          : null;

      // ---------------------------------------------------------------
      // The World Signal (Constitution §7.2, §8.6)
      // ---------------------------------------------------------------
      // Resolved AFTER the session row exists, because the claim attaches the
      // day's attempt to THIS open run — `begin_signal_objective_run` refuses
      // any session that is not this player's open run, so a failed insert can
      // never claim a player's Signal for a run that did not happen.
      //
      // The day, the objective and its target are all server-derived inside
      // `claimSignalObjectiveRun`; the request contributes `signalObjectiveId`
      // as a lookup key and nothing else (Rule 11). No new column goes into
      // the session insert above — the RPC mirrors the id onto the session row
      // in the same transaction that claims the attempt — so the pre-migration
      // -049 window needs no special case here: with no RPC there is no day,
      // no attempt and no exemption, and the run is an ordinary charged run.
      const signalClaim = isSignalRun
        ? await claimSignalObjectiveRun(
            supabase,
            player.id,
            session.id,
            signalObjectiveId,
            startedAtDate
          )
        : null;

      // ---------------------------------------------------------------
      // The run's world condition (§7.2, §7.3 - WP-2.10a)
      // ---------------------------------------------------------------
      // One modifier owns the run, whichever active surface named it: the
      // Anomaly board's weekly rotation or the Signal day's condition. Both
      // are SERVER-DERIVED from the calendar and stamped on the session row, so settlement
      // re-derives this exact id from the row alone
      // (`resolveSessionWorldCondition`) and recomputes the run under the rules
      // it was actually played under. That resolver also honors immutable
      // historical Serpent stamps. The client asserts nothing.
      //
      // Resolved AFTER the Signal claim because the Signal half is gated on
      // `exemptRunId`: `begin_signal_objective_run` mirrors
      // `signal_objective_run_id` onto the session row ONLY when this session
      // owns the day's attempt, so any looser test here would set a condition
      // at start that the end path could not find.
      // WP-2.10b: the resolved value is now a whole `WorldCondition` — the
      // anomaly AND the ritual's clauses, composed into one interaction block.
      // The three arms are unchanged; each just answers with more.
      const runCondition: WorldCondition = startAnomalyId
        ? conditionFromAnomaly(startAnomalyId)
        : signalClaim?.exemptRunId && signalClaim.day
          ? conditionFromAnomaly(
              signalClaim.day.condition.id,
              signalClaim.day.clauses
            )
          : NEUTRAL_CONDITION;

      // The condition's reach into the run, composed HERE and only here.
      //
      // Both of these travel to the engine in the genome block AND into
      // `run_start_context`, which is what the validator recomputes from — so
      // the engine draws and the server verifies under one derivation rather
      // than two that agree. Nothing below re-derives either of them.
      //
      //   offer tilt      generalises `ANOMALY_STRAIN_WEIGHT`: the anomaly
      //                   contributes its board's strain, an "ascendant" clause
      //                   can out-weigh it, and `conditionOfferTilt` collapses
      //                   the composed map to the one strain the offer stream
      //                   carries.
      //   suppression     the Gauntlet's strain ban UNIONED with a "dampened"
      //                   clause. Two independent suppressions both bind.
      if (genomeBlock) {
        genomeBlock.anomalyStrain = conditionOfferTilt(runCondition);
        // genomeBlock is a Record<string, unknown>, so the Gauntlet's existing
        // ban arrives untyped. Check it at runtime rather than asserting: a
        // malformed value must read as "no existing suppression" and let the
        // clause's own suppression stand, never crash the run start.
        const existingSuppressed = Array.isArray(genomeBlock.suppressedStrains)
          ? (genomeBlock.suppressedStrains as StrainId[])
          : [];
        genomeBlock.suppressedStrains = conditionSuppressedStrains(
          runCondition,
          existingSuppressed
        );
        genomeBlock.strainThresholdDelta =
          conditionStrainThresholdDelta(runCondition);
      }
      if (startGenomeContext) {
        startGenomeContext.suppressedStrains = conditionSuppressedStrains(
          runCondition,
          startGenomeContext.suppressedStrains
        );
        startGenomeContext.strainThresholdDelta =
          conditionStrainThresholdDelta(runCondition);
      }

      // ---------------------------------------------------------------
      // The daily harvest envelope (Constitution §8.6)
      // ---------------------------------------------------------------
      // Resolved AFTER the session row exists, so a failed insert can never
      // burn a charge for a run that did not happen.
      //
      // Exemption is decided from SERVER facts only - the client's `mode`
      // is a request, never a grant. Free Play is rewardless, so charging
      // it would be a pure penalty for practising. The Signal objective run
      // (§7.2, WP-1.03) remains exempt. The retired explicit Serpent mode is
      // intentionally not an exemption; it normalizes to an ordinary Energy
      // run and joins the battle through the immutable Energy snapshot.
      //
      // WP-1.03 fills in the Signal half the same way. `exemptRunId` is
      // non-null on exactly one condition: the SERVER derived today, resolved
      // the objective among that day's three, and the database answered that
      // this session owns the day's attempt. A client that sends
      // `mode: 'signal'` with the flag off, before migration 049, with an
      // objective the day did not derive, or on its second run of the day gets
      // null here — an ordinary CHARGED run. There is no field on this request
      // through which a run id could be supplied, so the exemption cannot be
      // claimed, only granted.
      const exemptionFacts: ChargeExemptionFacts = {
        ...NO_EXEMPTION,
        rewardless: isFreePlay,
        signalObjectiveRunId: signalClaim?.exemptRunId ?? null,
        serpentWeekId: null,
      };
      let charge;
      try {
        charge = await commitRunEnergy(
          supabase,
          player.id,
          session.id,
          requestedEnergyCommitment,
          exemptionFacts
        );
      } catch (error) {
        // The session row exists, but gameplay has not begun. Close it without
        // reward so it cannot later settle, while preserving the audit trail.
        const { error: closeError } = await supabase
          .from('game_sessions')
          .update({ ended_at: new Date().toISOString(), end_reason: 'abandoned' })
          .eq('id', session.id)
          .eq('player_id', player.id)
          .is('ended_at', null);
        if (closeError && !isMissingLifecycleInfra(closeError)) {
          console.error('Failed to close rejected Energy session:', {
            sessionId: session.id,
            error: closeError,
          });
        }
        if (error instanceof EnergyCommitmentError) {
          const status = error.reason === 'invalid' ? 400 : error.reason === 'insufficient' ? 409 : 503;
          return NextResponse.json(
            { error: error.message, reason: error.reason },
            { status }
          );
        }
        throw error;
      }

      // Migration-overlap compatibility. Post-059 the RPC already stamped the
      // complete immutable snapshot; this same-value write is harmless. On
      // the brief app-before-migration window it preserves the old one-Energy
      // settlement label.
      const { error: chargeStampError } = await supabase
        .from('game_sessions')
        .update({ charge_state: charge.state })
        .eq('id', session.id)
        .eq('player_id', player.id);
      if (chargeStampError && !isMissingEnvelopeInfra(chargeStampError)) {
        console.error('Failed to stamp charge state on session:', {
          playerId: player.id,
          sessionId: session.id,
          chargeState: charge.state,
          error: chargeStampError,
        });
        Sentry.captureException(
          new Error(`charge_state stamp failed: ${chargeStampError.message}`),
          { extra: { playerId: player.id, sessionId: session.id } }
        );
      }

      // No economy_transactions row: Energy is a non-purchasable pacing
      // resource, not the game's economy currency. The immutable session
      // snapshot is the consumption and telemetry record.

      // `visible` carries the §8.6 ramp so the HUD hides the meter for a
      // player who has not met the game yet - the same rule /api/player
      // applies, so the two never disagree mid-session.
      const chargeBlock = {
        state: charge.state,
        ...charge.status,
        committed: charge.energyCommitted,
        commitmentMultiplierBps: charge.commitmentMultiplierBps,
        energyAvailableBefore: charge.energyAvailableBefore,
        energyRecoveredAtStart: charge.energyRecoveredAtStart,
        visible: isChargeMeterVisible(player.total_games_played ?? 0),
      };

      if (isFreePlay) {
        return NextResponse.json({
          sessionId: session.id,
          freePlay: true,
          energy: chargeBlock,
          charge: chargeBlock,
          traits: snakeTraits,
          mutationPool,
          mastery: masteryInfo,
          // WP-3.02: the profile the SERVER stamped, echoed so the engine
          // plays exactly what settlement will recompute. The client never
          // decides this - it only learns it.
          ...(growthProfileId ? { growthProfile: growthProfileId } : {}),
          // WP-3.12: the rung the SERVER resolved, with the rule it adds, so
          // the HUD can name what this run is playing under without deriving
          // it. Same contract as the profile above - the client never decides
          // this, it only learns it.
          ...(ladderRung !== DEFAULT_LADDER_RUNG
            ? {
                ladder: {
                  rung: ladderRung,
                  name: ladderRungDefinition(ladderRung).name,
                  rule: ladderRungDefinition(ladderRung).rule,
                },
              }
            : {}),
          ...(genomeBlock ? { genome: genomeBlock } : {}),
        });
      }

      return NextResponse.json({
        sessionId: session.id,
        energy: chargeBlock,
        // Compatibility alias for clients deployed before migration 059.
        charge: chargeBlock,
        ...(charge.clanBattle
          ? {
              clanBattle: {
                eligible: true,
                battleId: charge.clanBattle.battleId,
                clanId: charge.clanBattle.clanId,
                endsAt: charge.clanBattle.endsAt,
                fifthBestToBeat: charge.clanBattle.fifthBestToBeat,
              },
            }
          : {}),
        traits: snakeTraits,
        mutationPool,
        mastery: masteryInfo,
        ...(growthProfileId ? { growthProfile: growthProfileId } : {}),
        ...(ladderRung !== DEFAULT_LADDER_RUNG
          ? {
              ladder: {
                rung: ladderRung,
                name: ladderRungDefinition(ladderRung).name,
                rule: ladderRungDefinition(ladderRung).rule,
              },
            }
          : {}),
        ...(gauntletBan ? { gauntletBan } : {}),
        // The run's world condition: the ONE id the engine plays under and
        // settlement recomputes with. Present on every run the server resolved
        // one for, so the client never has to infer it from its own `mode`.
        ...(runCondition.anomaly ? { condition: runCondition.anomaly } : {}),
        ...(anomalyInfo ? { anomaly: anomalyInfo } : {}),
        // Signal context for the HUD (§7.2): the day's condition and the
        // objective this run is playing for. Present only on a run the server
        // accepted as the day's attempt - its presence IS the confirmation
        // that the exemption was granted, so the client never has to infer it.
        ...(signalClaim?.exemptRunId && signalClaim.day && signalClaim.objective
          ? {
              signal: {
                runId: signalClaim.exemptRunId,
                dayId: signalClaim.day.id,
                day: signalClaim.day.day,
                endsAt: signalClaim.day.endsAt,
                condition: signalClaim.day.condition,
                objective: signalClaim.objective,
              },
            }
          : {}),
        ...(genomeBlock ? { genome: genomeBlock } : {}),
      });
    }

    if (action === 'end') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
      }

      // select('*') on purpose: naming is_free_play here would error the
      // whole read during the pre-migration-016 window. With '*' pre-016
      // rows simply lack the field (=> earning path, which they all are).
      //
      // WP-2.05 — PRIORITY 2: this read used to DESTROY THE RUN.
      //
      // The error was discarded, so a transient failure produced `!session`
      // and a 404 — and `rewardOutbox.ts` retries 5xx while DROPPING 4xx. A
      // database blip therefore deleted the queued entry and the run's DNA
      // was gone permanently, with the player told only "Session not found".
      //
      // The two cases are now separated. A genuinely absent row is still a
      // 404 (there is nothing to settle and retrying forever would be worse).
      // A READ FAILURE is a 503 that also reserves the 8-day
      // pending-settlement window, so the replay finds the run still waiting.
      const { data: session, error: sessionReadError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('player_id', player.id)
        .maybeSingle();

      if (sessionReadError) {
        return await settlementUnavailable('session row', sessionReadError, {
          playerId: player.id,
          sessionId,
        });
      }

      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      // Idempotency guard: a session can only be ended once. Duplicate
      // 'end' calls (offline outbox replay, double-fire at death) must not
      // grant DNA again - return 409 with the current authoritative state.
      //
      // WP-0.06: this is also the wall an EXPIRED run hits. The sweep sets
      // `ended_at`, so a run it closed can never re-enter settlement - not
      // through a replay, not through a retry, not through a crafted request.
      // The reason travels in the response so the client can tell "you
      // already banked this" from "that run timed out and paid nothing".
      if (session.ended_at) {
        // WP-2.05: reported, but deliberately NOT fatal. This is the 409
        // "you already banked this" response; the run settled long ago and
        // the player block is a convenience echo, so a read failure costs
        // nothing that a refresh does not fix.
        const { data: currentPlayer, error: currentPlayerError } = await supabase
          .from('players')
          .select('dna, total_games_played, high_score, total_dna_earned, breeds_completed')
          .eq('id', player.id)
          .maybeSingle();
        if (currentPlayerError) {
          console.error('Already-ended player echo read failed:', {
            playerId: player.id,
            sessionId,
            error: currentPlayerError,
          });
          Sentry.captureException(
            new Error(`Already-ended player echo failed: ${currentPlayerError.message}`),
            { extra: { playerId: player.id, sessionId } }
          );
        }

        const priorReason = (session as Record<string, unknown>).end_reason;
        let impact: Awaited<ReturnType<typeof loadRunImpactEnvelope>> | null = null;
        if (priorReason === SETTLED_END_REASON) {
          impact = await loadRunImpactEnvelope(supabase, player.id, sessionId);
          if (impact.status !== 'found') {
            return progressionJson(
              {
                error: 'Run settled; its impact receipt is still pending',
                alreadyEnded: true,
                impactPending: true,
                retryable: true,
              },
              { status: 503 }
            );
          }
        }
        return progressionJson(
          {
            error: 'Session already ended',
            alreadyEnded: true,
            ...(typeof priorReason === 'string' ? { endReason: priorReason } : {}),
            player: currentPlayer ?? null,
            ...(impact?.status === 'found' ? { impact: impact.impact } : {}),
          },
          { status: 409 }
        );
      }

      // ---------------------------------------------------------------
      // The run-start context (WP-2.05, migration 054)
      // ---------------------------------------------------------------
      // The rules the run STARTED under, frozen at start. When it is present
      // every re-derivation below is skipped, which is what makes a
      // transient read failure at settlement unable to change what a run
      // pays — and what stops a mid-run equip or breed from re-deciding it.
      //
      // A NULL column is expected (any run started before this deploy, or
      // before migration 054) and takes the re-derive path silently. A
      // MALFORMED blob takes the same path but is an `error`-level alert,
      // because it means the writer and the reader disagree about a shape
      // this file owns both ends of.
      const runContextParse = parseRunStartContext(
        (session as Record<string, unknown>).run_context
      );
      if (!runContextParse.ok && runContextParse.malformed) {
        console.error('Malformed run_context on settlement:', {
          playerId: player.id,
          sessionId,
          reason: runContextParse.reason,
        });
        Sentry.captureException(
          new Error(`Malformed run_context: ${runContextParse.reason}`),
          {
            level: 'error',
            extra: { playerId: player.id, sessionId },
            tags: { wp: 'wp-2.05' },
          }
        );
      }
      const runContext = runContextParse.ok ? runContextParse.context : null;

      // Design v2 Phase 3A: traits are read from the SNAKE ROW referenced
      // by the session (snake_used_id, server-trusted, stored at start) -
      // the client payload never carries them. select('*') keeps the read
      // deployable before migration 018 (rows simply lack the column).
      //
      // WP-2.05: with a context this read does not happen at all. Without
      // one, its error is checked, because losing it is losing money —
      // `snakeTraits = []` silently deletes every [E] trait modifier from
      // the recompute AND every heirloom strain point `deriveHeirloom`
      // derives from the traits, both of which feed `validation.adjustedDna`,
      // and a missing `generation` pays Ascendance Yield at gen 1.
      let snakeTraits: TraitId[] = runContext?.snake.traits ?? [];
      let usedSnakeRow: Record<string, unknown> | null = null;
      if (!runContext && session.snake_used_id) {
        // snake_variants(*) so genome lineage columns (migration 030)
        // ride along when they exist without erroring pre-030.
        const { data: usedSnake, error: usedSnakeError } = await supabase
          .from('collected_snakes')
          .select('*, snake_variants(*)')
          .eq('id', session.snake_used_id)
          .maybeSingle();
        if (usedSnakeError) {
          return await settlementUnavailable('equipped snake', usedSnakeError, {
            playerId: player.id,
            sessionId,
          });
        }
        usedSnakeRow = usedSnake as Record<string, unknown> | null;
        snakeTraits = sanitizeTraits(usedSnakeRow?.traits);
      }

      // Free session (the marker on the row is authoritative, never the
      // request): validate + record normally, PAY NOTHING on the way out.
      const isFreeSession = session.is_free_play === true;

      // Per-dynasty mastery (section 7.1): recompute the player's ACTUAL
      // unlocked pool server-side from player_mastery - the client's list
      // (and whatever the engine offered) is never trusted. Free sessions
      // validate against the full pool (section 7.4: everything unlocked
      // in practice). Pre-019 the XP read is 0 => base pool.
      //
      // WP-2.05: the STRICT reader. A swallowed error here reads as 0 XP,
      // which narrows the unlocked pool, which makes the validator drop
      // picks the client legally offered, which shrinks the recompute — and
      // the recompute is the payout.
      const endDynasty = normalizeDynastyName(session.dynasty);
      let masteryXpBefore = 0;
      if (!isFreeSession) {
        const masteryRead = await getMasteryXpStrict(
          supabase,
          player.id,
          endDynasty
        );
        if (!masteryRead.ok) {
          return await settlementUnavailable('mastery xp', masteryRead.error, {
            playerId: player.id,
            sessionId,
          });
        }
        masteryXpBefore = masteryRead.xp;
      }

      // Gauntlet ban mirror (section 8.2 item 3): the validator must see
      // the SAME pool the run was offered - recomputed at the session's
      // server start time, so a run straddling the Wed->Thu boundary
      // validates against what it actually saw. Free sessions are never
      // banned; pre-020 the lookup returns null (no-op).
      //
      // WP-2.05: all three of these lookups are the re-derive path only. A
      // run with a context already carries the exact pool the engine was
      // handed, so the "same pool the run was offered" is a stored fact
      // rather than a reconstruction that has to get the week boundary
      // right.
      let endGauntletBan: Awaited<ReturnType<typeof getGauntletBan>> = null;
      let endSeasonalGeneIds: Awaited<ReturnType<typeof getSeasonalGeneIds>> = [];
      let unlockedPool = runContext?.mutationPool ?? null;
      if (!runContext) {
        endGauntletBan = isFreeSession
          ? null
          : await getGauntletBan(
              supabase,
              player.id,
              endDynasty,
              session.server_started_at || undefined
            );
        // Seasonal mutations join the validation pool exactly as they join
        // the offer pool (pre-021: empty, byte-identical behavior)
        const endSeasonalIds = await getSeasonalMutationIds(supabase);
        endSeasonalGeneIds = await getSeasonalGeneIds(supabase);
        unlockedPool = applyGauntletBan(
          [
            ...(isFreeSession
              ? fullMutationPool(endDynasty)
              : unlockedMutationPool(endDynasty, levelForXp(masteryXpBefore))),
            ...endSeasonalIds,
          ],
          endGauntletBan
        );
      }

      // The run's world condition (§7.2, §7.3 - WP-2.10a): the SESSION ROW is
      // authoritative - the server stamped it at start, through whichever of
      // the three columns the ritual owns (`anomaly_id`, `serpent_week_id`,
      // `signal_objective_run_id`). Re-derived here from those stamps alone,
      // so the run settles under EXACTLY the condition it was launched under
      // and a replayed 'end' cannot re-decide it.
      //
      // select('*') keeps the read deployable pre-021/046/049: rows simply
      // lack the columns => null => the condition-free recompute.
      const sessionCondition: WorldCondition =
        await resolveSessionWorldCondition(
          supabase,
          session as Record<string, unknown>,
          player.id,
          sessionId
        );

      // GENOME (Buildcraft: The Genome): the SESSION ROW's run_seed is the
      // capability authority - a stamped session validates under the
      // genome pipeline regardless of the current flag state. All context
      // is re-derived server-side (never the claim).
      const sessionRunSeed = (session as Record<string, unknown>).run_seed;
      let genomeCtx: GenomeValidationContext | null = null;
      let endLineageBias: LineageBias | null = null;
      if (typeof sessionRunSeed === 'string' && sessionRunSeed.length > 0) {
        if (runContext?.genome) {
          // THE FAST, HONEST PATH: the exact context the engine received.
          // Three round trips and every failure mode they carried are gone,
          // and `verifyOfferTrace` below now replays against the pool,
          // heirloom, lineage bias and tier cap the offer stream was
          // actually drawn from rather than a reconstruction of them.
          endLineageBias = runContext.genome.lineage;
          genomeCtx = {
            heirloom: runContext.genome.heirloom,
            genePool: runContext.genome.genePool,
            prevRunDied: runContext.genome.prevRunDied,
            tierCap: runContext.genome.tierCap,
            suppressedStrains: runContext.genome.suppressedStrains,
            splicesUnlocked: runContext.genome.splicesUnlocked,
            // WP-3.10: the carry's pass count is REPLAYED from this seed, not
            // claimed. Without it the run settles on the flat multipliers.
            runSeed: sessionRunSeed,
            // WP-3.02: settle under the growth curve the run STARTED under.
            // The stamp lives on the context root, not the genome block,
            // because a free-play or pre-genome run has a profile too.
            ...(runContext.growthProfileId
              ? { growthProfileId: runContext.growthProfileId }
              : {}),
            // WP-3.12: settle under the RUNG the run started at. It moves the
            // portal schedule, the infuse growth and the salvage floor, so a
            // run played at rung 5 and recomputed at rung 0 would disagree with
            // itself about lengths, doors and payout. Absent means Ground.
            ...(runContext.ladderRung ? { ladderRung: runContext.ladderRung } : {}),
          };
        } else {
          // WP-2.05: `ok: false` is unignorable by construction, and it is a
          // 503 rather than a shrug. This is the headline DNA-loss path — a
          // swallowed error here produced `bankedRuns = 0`, hence tierCap 1
          // and an empty heirloom, hence a smaller `adjustedDna`.
          const runFacts = await getGenomeRunFacts(supabase, player.id);
          if (!runFacts.ok) {
            return await settlementUnavailable(
              `genome run facts (${runFacts.reason})`,
              runFacts.error,
              { playerId: player.id, sessionId }
            );
          }
          const { bankedRuns, prevRunDied, ownedVariants } = runFacts;
          const endMasteryLevel = levelForXp(masteryXpBefore);
          const endFtue = deriveFtue(bankedRuns, endMasteryLevel, ownedVariants);
          const endLineage = usedSnakeRow
            ? lineageFromRows(
                usedSnakeRow,
                (usedSnakeRow.snake_variants as Record<string, unknown> | null) ??
                  null
              )
            : null;
          const { heirloom: endHeirloom, lineageBias } = deriveHeirloom(
            endLineage,
            snakeTraits,
            endFtue
          );
          endLineageBias = lineageBias;
          genomeCtx = {
            heirloom: endHeirloom,
            genePool: composeGenePool(
              endDynasty,
              isFreeSession ? 10 : endMasteryLevel,
              endSeasonalGeneIds,
              isFreeSession ? null : endGauntletBan,
              isFreeSession
            ),
            prevRunDied,
            tierCap: ftueTierCap(endFtue),
            suppressedStrains: gauntletSuppressedStrains(endGauntletBan),
            splicesUnlocked: endFtue.splicesUnlocked,
            // WP-3.10: same seed, same replayed portal schedule. This is the
            // reconstruction branch (no stored run_context), so the carry has
            // to be derived from the same seed the engine played under.
            runSeed: sessionRunSeed,
          };
        }
      }

      // Design v2: the client sends the raw food count + how the run ended;
      // the server recomputes the payout exactly from the session row's
      // dynasty (server-trusted, stored at start - never from this request).
      // Payloads without food_count validate as zero-food runs (the legacy
      // deploy-window fallback has been removed).
      const serverStartedAt = new Date(session.server_started_at || Date.now());
      const validation = validateGameResult(
        {
          food_count: typeof food_count === 'number' ? food_count : 0,
          extracted: extracted === true,
          score: score || 0,
          dna_earned: dna_earned || 0,
          duration_seconds: duration_seconds || 0,
          died: died ?? !(extracted === true),
          victory: victory ?? false,
          // Design v2 Phase 2: mutation picks + Phoenix trigger - both
          // sanitized inside the validator. A `cosmic` combo summary from a
          // client older than WP-3.13 is simply not read: the combo it
          // claimed no longer exists, so it is worth nothing rather than
          // worth clamping.
          mutations,
          phoenix_triggered_at_food,
          // Genome claim block (infuses/surges/revive/claims/pressureEvents;
          // legacy lossEvents remain accepted for historical settlements).
          genome,
        },
        serverStartedAt,
        endDynasty,
        snakeTraits,
        unlockedPool,
        sessionCondition,
        genomeCtx,
        // WP-3.05: the run's stamped growth profile, for the food-rate and
        // offer-cadence bounds. `genomeCtx` carries the same value and still
        // wins where present; this closes the case where there is no genome
        // context at all and both bounds silently fell back to `baseline`.
        runContext?.growthProfileId
      );

      // Offer-trace verification (ADVISORY, §5): replay the seeded offer
      // stream against the accepted picks. A mismatch flags the session
      // (validated:false) but never changes the payout at launch.
      if (genomeCtx && validation.genome && typeof sessionRunSeed === 'string') {
        const claimTrace = (genome as Record<string, unknown> | null)?.offerTrace;
        if (claimTrace !== undefined && claimTrace !== null) {
          const offerCheck = verifyOfferTrace(claimTrace, validation.genome.picks, {
            runSeed: sessionRunSeed,
            pool: genomeCtx.genePool ?? [],
            heirloom: genomeCtx.heirloom,
            surges: validation.genome.surges,
            // Mirror the engine's start-time lineage bias exactly - a
            // bias-free replay would false-flag every lineage player.
            lineage: endLineageBias,
            // ONE derivation of the tilt, shared with run start: the engine
            // drew under `conditionOfferTilt` of the condition the row names,
            // and this replay resolves it from the same row through the same
            // function. A second mapping here is exactly how an honest player
            // gets flagged.
            anomalyStrain: conditionOfferTilt(sessionCondition),
            tierCap: genomeCtx.tierCap,
          });
          if (!offerCheck.ok) {
            // WP-2.05: `appendAdvisory` replaces the hand-set
            // `validation.valid = false`. This check's own source comment
            // has called itself ADVISORY since it shipped while the line
            // below it took the player's eligibility away; now the two
            // agree, and the helper throws if anyone ever passes a fatal
            // code through this door.
            appendAdvisory(
              validation,
              `OFFER_SEED_MISMATCH: ${offerCheck.mismatches.slice(0, 3).join('; ')}`
            );
          }
        }
      }

      // ---------------------------------------------------------------
      // The forensic alert (WP-2.05)
      // ---------------------------------------------------------------
      // This was a `console.warn` — invisible in production, and the only
      // trace of a divergence beyond the boolean that was wrongly costing
      // players their progression. It is now a FINGERPRINTED Sentry issue:
      // 500 runs diverging the same way group into one issue carrying
      // claimed-vs-recomputed, the traits, the tier cap, the heirloom and
      // the picks — which is the forensic job the boolean was doing badly.
      //
      // It fires on ANY finding, not just a fatal one. An advisory finding
      // no longer costs the player anything, so the alert is now the whole
      // of the response to it, and silence would mean the divergences the
      // playtest surfaced went back to being invisible.
      if (validation.errors.length > 0) {
        const codes = Array.from(
          new Set(validation.errors.map((error) => validationCodeOf(error)))
        ).sort();
        Sentry.captureMessage(
          `Run validation: ${codes.join(',')} (${session.dynasty})`,
          {
            level: validation.valid ? 'warning' : 'error',
            fingerprint: ['run-validation', String(session.dynasty), ...codes],
            tags: { wp: 'wp-2.05', dynasty: String(session.dynasty) },
            extra: {
              playerId: player.id,
              sessionId,
              errors: validation.errors,
              fatalErrors: validation.fatalErrors,
              advisoryErrors: validation.advisoryErrors,
              claimedDna: dna_earned ?? 0,
              recomputedDna: validation.rawDna,
              claimedScore: score ?? 0,
              recomputedScore: validation.adjustedScore,
              claimedFoodCount: food_count ?? 0,
              acceptedFoodCount: validation.foodCount,
              claimedDurationSeconds: duration_seconds ?? 0,
              storedDurationSeconds: validation.durationSeconds,
              traits: snakeTraits,
              tierCap: genomeCtx?.tierCap ?? null,
              heirloom: genomeCtx?.heirloom ?? null,
              picks: validation.genome?.picks ?? validation.mutations,
              claimClamps: validation.claimClamps,
              runContext: runContextParse.ok ? 'stored' : runContextParse.reason,
            },
          }
        );
        console.warn('Game result validation flags:', {
          playerId: player.id,
          sessionId,
          dynasty: session.dynasty,
          errors: validation.errors,
        });
      }

      // ---------------------------------------------------------------
      // Settlement against the envelope (Constitution §6.2, §8.6)
      // ---------------------------------------------------------------
      // Yield is the run's full-strength settled economic total and is
      // CHARGE-INDEPENDENT by law (§6.2): Depth, Mastery and every record
      // read this number. Only the DNA actually credited is scaled.
      //
      // The charge state comes from the SESSION ROW, stamped at start - not
      // from the current ledger and never from the request. A run therefore
      // settles exactly as it was launched, and a replayed 'end' cannot
      // re-decide it. NULL (a run started before migration 039) settles at
      // full strength: a deploy boundary must not cut a player's harvest.
      const rawChargeState = (session as Record<string, unknown>).charge_state;
      const chargeState: ChargeState = isChargeState(rawChargeState)
        ? rawChargeState
        : 'charged';
      const rawCommitmentBps = Number(
        (session as Record<string, unknown>).energy_harvest_multiplier_bps
      );
      const commitmentMultiplierBps =
        Number.isInteger(rawCommitmentBps) && rawCommitmentBps >= 0
          ? rawCommitmentBps
          : chargeState === 'lean'
            ? energyCommitmentMultiplierBps(0)
            : 10_000;
      const energyCommitted = Math.max(
        0,
        Math.floor(Number((session as Record<string, unknown>).energy_committed) || 0)
      );

      // WP-0.02: the account multiplier stack (streak tier x collection set
      // bonus x clan-duel bonus) is DELETED. A settled run is worth its raw
      // fold times the extraction outcome multiplier and nothing else - the
      // validator's exact recompute already IS that number (§8.5, GT §3.1).
      // No account state, no calendar, no clan, no purchase may re-enter here.
      //
      // WP-1.05 / Ascendance (§8.2): the ONE thing that scales Yield is the
      // equipped snake's generation - read from the snake ROW the session was
      // started with, never from the request. Gen1-3 multiply by exactly 1.
      // This is progression, not commerce: generation only rises by spending
      // DNA on breeding, and DNA is never sold (Rule 3). Score never sees it
      // (Rule 2); Depth does, because Depth is accumulated Yield (§6.2).
      //
      // WP-2.05: taken from the run-start context when there is one, so the
      // generation that pays is the generation the run was STARTED with. A
      // breed that completes mid-run can no longer change what the run in
      // flight is worth, in either direction.
      const ascendanceGeneration =
        runContext?.snake.generation ??
        (typeof usedSnakeRow?.generation === 'number'
          ? usedSnakeRow.generation
          : 1);
      const ascendance = ascendanceYieldBreakdown(
        validation.adjustedDna,
        ascendanceGeneration
      );
      const yieldDna = ascendance.totalYield;
      const finalDna = applyEnergyHarvestMultiplier(
        yieldDna,
        commitmentMultiplierBps,
        chargeState
      );
      // Genome Card cascade anchor: the same run with traits/anomaly but no
      // in-run genes. This is display data from server authority, never an
      // input to rewards.
      const genelessRawDna = computeRunTotals(
        endDynasty,
        validation.foodCount,
        [],
        null,
        snakeTraits,
        sessionCondition.anomaly
      ).rawDna;

      // Sanitized mutation record for the session row (migration 014).
      // One JSONB blob: picks in order + Phoenix trigger; null for
      // mutation-free runs. The accepted COSMIC combo claim used to ride
      // here too and was deleted with the combo (WP-3.13); rows written
      // before then keep theirs, and nothing reads it.
      const mutationsRecord =
        validation.mutations.length > 0 ||
        validation.phoenixTriggeredAtFood !== null
          ? {
              picks: validation.mutations,
              phoenixTriggeredAtFood: validation.phoenixTriggeredAtFood,
            }
          : null;

      // Mark the session ended BEFORE granting rewards - this is the
      // idempotency anchor. Guard on ended_at IS NULL so two concurrent
      // 'end' calls can't both pass the check above and double-grant.
      const settledAt = new Date().toISOString();
      const settlementUpdate: Record<string, unknown> = {
        score: validation.adjustedScore,
        // Free sessions never earn - the row records a zero payout
        dna_earned: isFreeSession ? 0 : finalDna,
        // Full-strength competitive/economic result. Commitment never changes
        // this number; clan best-five scoring reads it directly.
        yield_dna: yieldDna,
        // WP-2.05: the CLAMPED duration, `min(claim, serverElapsed)`. The
        // row is read directly by Signal's `endure` objective, so storing a
        // client claim of 999999 would complete an objective nobody played.
        // Storing serverElapsed + 10 would hand every run ten free seconds
        // of it: the skew tolerance governs rejection, not the record.
        duration_seconds: validation.durationSeconds,
        died: died ?? true,
        victory: victory ?? false,
        extracted: validation.extracted,
        ended_at: settledAt,
        validated: validation.valid,
        validation_errors: validation.errors.length > 0 ? validation.errors : null,
        foods_collected: validation.foodCount,
        mutations: mutationsRecord,
        end_reason: SETTLED_END_REASON,
      };

      const endSession = () =>
        supabase
          .from('game_sessions')
          .update(settlementUpdate)
          .eq('id', sessionId)
          .eq('player_id', player.id)
          .is('ended_at', null)
          .select('id');

      // WP-0.06: this is the ONE path that may stamp `completed` - the reason
      // that marks a run as settled everywhere else (boards, Anomaly board,
      // Yield). Pre-045 the column is missing, so the settlement retries
      // without it rather than failing a run the player actually finished;
      // a NULL reason reads as settled, which is what it was.
      let { data: endedRows, error: endSessionError } = await endSession();
      if (endSessionError && isMissingLifecycleInfra(endSessionError)) {
        delete settlementUpdate.end_reason;
        ({ data: endedRows, error: endSessionError } = await endSession());
      }

      if (endSessionError) {
        console.error('Failed to mark game session ended:', {
          playerId: player.id,
          sessionId,
          error: endSessionError,
        });
        return NextResponse.json({ error: 'Failed to end session' }, { status: 500 });
      }

      if (!endedRows || endedRows.length === 0) {
        // Lost the race: another request ended this session first
        const impact = await loadRunImpactEnvelope(supabase, player.id, sessionId);
        if (impact.status !== 'found') {
          return progressionJson(
            {
              error: 'Run settlement is finishing; retry for its impact receipt',
              alreadyEnded: true,
              impactPending: true,
              retryable: true,
            },
            { status: 503 }
          );
        }
        return progressionJson(
          {
            error: 'Session already ended',
            alreadyEnded: true,
            impact: impact.impact,
          },
          { status: 409 }
        );
      }

      // Run-event capture (Identity v1 section 9.5) - a SEPARATE
      // best-effort write so the critical end path above stays
      // byte-identical (and deployable before migration 022 adds the
      // columns). death_cause: the server decides 'extracted'; a client
      // death claim is accepted only from the known cause list. The
      // envelope is bounds-validated; a bad payload stores nothing.
      // NEVER an input to payouts/records/leaderboards.
      const serverDeathCause: RunDeathCause | null = validation.extracted
        ? 'extracted'
        : isRunDeathCause(death_cause) && death_cause !== 'extracted'
          ? death_cause
          : null;
      const runEventEnvelope = validateRunEvents(run_events, {
        // WP-2.05: the same clamped number the row stores, so a run-event
        // envelope cannot be bounds-checked against time that did not pass.
        durationSeconds: validation.durationSeconds,
        foodCount: validation.foodCount,
        died: (died ?? true) === true && !validation.extracted,
        extracted: validation.extracted,
        // Genome runs: m-events may name ANY accepted gene pick
        mutationIds: validation.genome
          ? validation.genome.picks.map((p) => p.id)
          : validation.mutations.map((m) => m.id),
      });
      if (
        serverDeathCause !== null ||
        runEventEnvelope !== null ||
        validation.genome !== null
      ) {
        const { error: captureError } = await supabase
          .from('game_sessions')
          .update({
            ...(serverDeathCause !== null ? { death_cause: serverDeathCause } : {}),
            ...(runEventEnvelope !== null ? { run_events: runEventEnvelope } : {}),
            // Genome record (migration 029) - best-effort like run_events:
            // pre-029 the column is missing and this update just fails
            // non-fatally (the critical end path above never names it).
            ...(validation.genome !== null ? { genome: validation.genome } : {}),
          })
          .eq('id', sessionId)
          .eq('player_id', player.id);
        if (captureError && !isMissingIdentityInfra(captureError)) {
          // Non-fatal by design: the run already completed normally
          console.error('Failed to store run events:', {
            playerId: player.id,
            sessionId,
            error: captureError,
          });
        }
      }

      // Identity (section 3.3): the game-over screen prompts a handle
      // claim without an extra fetch. Pre-022 the view is missing and
      // the field is simply omitted - current behavior, zero 500s.
      const endIdentity = await getLiveIdentityForPlayer(supabase, player.id);
      const identityInfo = endIdentity
        ? {
            handle: endIdentity.handle,
            displayHandle: endIdentity.displayHandle,
            isGenerated: endIdentity.isGenerated,
          }
        : null;

      // Free Play end: the run is recorded + validated above, but nothing
      // pays out - no DNA credit, no total_dna_earned, no streak
      // (record_daily_play NOT called), no economy transactions and no
      // records refresh. The response carries what the run WOULD have earned
      // so the player sees the stakes they practiced for.
      if (isFreeSession) {
        // WP-2.05: reported, not fatal. Free Play pays nothing, so this echo
        // risks nothing - failing the request would refuse a practice run
        // its recap card for no gain.
        const { data: freePlayerState, error: freePlayerError } = await supabase
          .from('players')
          .select('dna, total_games_played, high_score, total_dna_earned, breeds_completed')
          .eq('id', player.id)
          .maybeSingle();
        if (freePlayerError) {
          console.error('Free Play player echo read failed:', {
            playerId: player.id,
            sessionId,
            error: freePlayerError,
          });
          Sentry.captureException(
            new Error(`Free Play player echo failed: ${freePlayerError.message}`),
            { extra: { playerId: player.id, sessionId } }
          );
        }

        return NextResponse.json({
          success: true,
          freePlay: true,
          player: freePlayerState,
          validation: {
            valid: validation.valid,
            adjustedDna: 0,
            baseDna: validation.adjustedDna,
            rawDna: validation.rawDna,
            genelessRawDna,
            score: validation.adjustedScore,
            extracted: validation.extracted,
            // Yield is charge-independent (§6.2). Practice is exempt, so
            // this is what the same run would have been worth.
            yieldDna,
            // Exact server fold, not a client reconstruction from a badge.
            // `baseYield + bonusYield === totalYield === yieldDna`.
            ascendance,
            chargeState,
          },
          hypotheticalDna: finalDna,
          ...(identityInfo ? { identity: identityInfo } : {}),
          // Free Play still gets an authoritative recap card. Discoveries
          // and rewards remain disabled; this is validator output only.
          ...(validation.genome ? { genome: validation.genome } : {}),
        });
      }

      // The player aggregate and its game_reward audit row are one database
      // transaction keyed by session. Distinct runs serialize on the player
      // row (no lost update); a replay returns the first run-specific PB truth
      // without applying DNA, games played, or audit history twice.
      const rewardResult = await settleSessionReward(supabase, {
        playerId: player.id,
        sessionId,
        finalDna,
        score: validation.adjustedScore,
        validated: validation.valid,
        metadata: {
          food_count: validation.foodCount,
          extracted: validation.extracted,
          original_dna_claimed: dna_earned || 0,
          base_dna: validation.adjustedDna,
          yield_dna: yieldDna,
          energy_available_before: Number(
            (session as Record<string, unknown>).energy_available_before ?? 0
          ),
          energy_committed: energyCommitted,
          energy_commitment_multiplier_bps: commitmentMultiplierBps,
          energy_recovered_at_start: Number(
            (session as Record<string, unknown>).energy_recovered_at_start ?? 0
          ),
          clan_eligible:
            typeof (session as Record<string, unknown>).clan_energy_battle_id === 'string',
          ...(validation.mutations.length > 0
            ? { mutations: validation.mutations }
            : {}),
          ...(validation.phoenixTriggeredAtFood !== null
            ? { phoenix_triggered_at_food: validation.phoenixTriggeredAtFood }
            : {}),
          ...(sessionCondition.anomaly ? { anomaly: sessionCondition.anomaly } : {}),
        },
      });
      if (!rewardResult.ok) {
        return await settlementUnavailable('atomic player reward', rewardResult.error, {
          playerId: player.id,
          sessionId,
          alreadyStampedEnd: true,
        });
      }
      const rewardSettlement = rewardResult.settlement;
      const updatedPlayer = {
        dna: rewardSettlement.player.dna,
        total_games_played: rewardSettlement.player.totalGamesPlayed,
        high_score: rewardSettlement.player.highScore,
        total_dna_earned: rewardSettlement.player.totalDnaEarned,
        breeds_completed: rewardSettlement.player.breedsCompleted,
      };
      const personalBest = rewardSettlement.personalBest;

      // Genome Codex (migration 031): only validator-accepted earning runs
      // reach this point. Discovery grants are atomic/idempotent in the RPC
      // and deliberately non-fatal to the completed run payout.
      const codex = validation.valid && validation.genome
        ? await recordCodexDiscoveries(
            supabase,
            player.id,
            sessionId,
            validation.genome
          )
        : null;

      // Per-dynasty mastery XP (section 7.1): EXTRACTED earning runs only
      // (free sessions returned above; deaths grant nothing). The XP is
      // floor(raw x 1.25) - the banked payout BEFORE Mirror Wager /
      // Compound Interest outcome shaping, so nothing about the account
      // can inflate mastery (the account multiplier stack that used to
      // sit here was deleted outright by WP-0.02). Non-fatal:
      // pre-019 (missing table/RPC) or any grant failure just omits the
      // mastery block from the response.
      let mastery: {
        dynasty: string;
        xpGained: number;
        xpBefore: number;
        xp: number;
        levelBefore: number;
        level: number;
        levelsGained: number;
        leveledUp: boolean;
        unlocks: { level: number; kind: string; label: string }[];
      } | null = null;
      if (validation.extracted) {
        // Mastery XP base: the DETERMINISTIC recompute only - genome
        // bounded-trust claims never feed mastery (§9).
        const xpGained = masteryXpForRun(validation.masteryRawDna, true);
        if (xpGained > 0) {
          const granted = await grantMasteryXp(
            supabase,
            player.id,
            endDynasty,
            xpGained
          );
          if (granted) {
            const levelBefore = levelForXp(masteryXpBefore);
            const levelAfter = levelForXp(granted.xpAfter);
            const unlocks: { level: number; kind: string; label: string }[] = [];
            for (let lvl = levelBefore + 1; lvl <= levelAfter; lvl++) {
              unlocks.push({
                level: lvl,
                kind: MASTERY_UNLOCK_TRACK[lvl - 1].kind,
                label: masteryUnlockLabel(endDynasty, lvl),
              });
            }
            mastery = {
              dynasty: endDynasty,
              xpGained,
              xpBefore: masteryXpBefore,
              xp: granted.xpAfter,
              levelBefore,
              level: levelAfter,
              levelsGained: levelAfter - levelBefore,
              leveledUp: levelAfter > levelBefore,
              unlocks,
            };
          }
        }
      }

      // ---------------------------------------------------------------
      // The ladder record (WP-3.12, migration 057)
      // ---------------------------------------------------------------
      // WHAT BEATS A RUNG: banking one. Extraction is the game's central verb,
      // so "I climbed rung 5" means "I got out at rung 5" — a death at rung 5
      // is an attempt, not a record. [H] and the one rule of the ladder that is
      // not a dial.
      //
      // FREE PLAY IS EXCLUDED, deliberately. §7.4 practice validates against the
      // full pool with everything unlocked, so a rung banked there would not be
      // the same rung an earning run climbs. The player may still PLAY any
      // unlocked rung in practice; it simply does not set the record.
      //
      // The rung comes from `run_context` — the run's own permanent stamp —
      // never from the settlement request. A run with no stored context was
      // necessarily Ground, and `record_ladder_rung` treats that as a no-op.
      //
      // NEVER BLOCKS THE PAYOUT. `recordLadderRung` reports its own failures and
      // returns null; a lost difficulty record is a lost record, and refusing to
      // pay a banked run over one would be the far larger failure.
      let ladderRecord: { rung: number; best: number } | null = null;
      let ladderBefore = DEFAULT_LADDER_RUNG;
      const settledRung = runContext?.ladderRung ?? DEFAULT_LADDER_RUNG;
      if (validation.extracted && !isFreeSession && settledRung > DEFAULT_LADDER_RUNG) {
        const before = await readLadderRecords(supabase, player.id);
        ladderBefore = before.best[endDynasty];
        const best = await recordLadderRung(
          supabase,
          player.id,
          endDynasty,
          settledRung
        );
        if (best !== null) ladderRecord = { rung: settledRung, best };
      }

      // Record daily play streak (non-fatal if it errors). The streak is a
      // COUNT, never a payout factor: WP-0.02 deleted the tier multiplier,
      // so nothing here re-enters settlement.
      let streak: {
        current: number;
        longest: number;
        graceConsumed: boolean;
      } | null = null;
      try {
        const { data: streakRows, error: streakRpcError } = await supabase.rpc(
          'record_daily_play',
          { p_player_id: player.id }
        );

        if (streakRpcError) {
          console.error('record_daily_play error:', streakRpcError);
          Sentry.captureException(
            new Error(`record_daily_play failed: ${streakRpcError.message}`),
            { extra: { playerId: player.id, sessionId } }
          );
        } else {
          const row = Array.isArray(streakRows) ? streakRows[0] : streakRows;
          if (row) {
            streak = {
              current: row.current_streak,
              longest: row.longest_streak,
              graceConsumed: row.grace_consumed,
            };
          }
        }
      } catch (streakError) {
        console.error('record_daily_play error:', streakError);
        Sentry.captureException(streakError, {
          extra: { playerId: player.id, sessionId },
        });
      }

      // WP-0.04: the achievement checker used to run here, writing an
      // 18-row parallel progression table on every settled run. The
      // mechanism is retired (migration 042) and every quantity it counted
      // is measured by the Legacy Records, which the refresh below
      // recomputes from the same aggregates -- monotonically, so a record
      // it banks can never be written back down (Rule 6, finding F-6).

      // Records refresh (Identity v1 section 6.3): idempotent
      // recompute-from-aggregates after all rewards land - like mastery,
      // strictly non-fatal (pre-023 or any failure just skips it; the
      // helper never throws).
      const recordsAfter = await refreshPlayerRecords(supabase, player.id);

      // The World Signal settles itself (§7.2: "rewards settle automatically -
      // no claim cascades, ever"). Called after the run's own rewards land, so
      // the session row it recomputes from is complete. Null on every run that
      // is not the day's Signal attempt, which is nearly all of them, and a
      // no-op before migration 049.
      //
      // Safe to reach twice: settlement is a RECOMPUTE clamped with GREATEST
      // and a compare-and-set, so an outbox replay of this same session
      // converges instead of paying the flat bonus again. A failure is
      // reported by the helper and picked up by the next sweep - it can never
      // strand a Signal the player completed (Rule 6).
      const signalSettlement = await settleSignalAttemptForSession(
        supabase,
        sessionId,
        player.id
      );
      const signal =
        signalSettlement && !signalSettlement.skipped
          ? {
              runId: signalSettlement.runId,
              completed: signalSettlement.completed,
              progress: signalSettlement.progress,
              target: signalSettlement.target,
              // What THIS settlement paid: the flat first-completion bonus on
              // the first pass, and 0 on every pass after it.
              bonusDna: signalSettlement.bonusDna,
              signalsCompleted: signalSettlement.signalsCompleted,
              newMilestones: signalSettlement.newMilestones,
            }
          : null;

      // Automatic clan layer: any valid Energy-funded ordinary run stamped
      // into an active battle at START is offered to the atomic best-five
      // recorder. Personal DNA has already landed; a clan outage can never
      // undo or delay it, and the settlement cron can reconcile the session.
      const clanBattleResult = await recordClanEnergyContribution(
        supabase,
        sessionId
      );

      // Discord feed + Linked Roles (Identity v1 section 8.4) - both
      // strictly non-fatal, both no-ops pre-024 / without a link:
      // - mastery_levelup enqueue at M5+ (M1-4 are too chatty), linked
      //   clans only
      // - metadata refresh AFTER the records recompute so mastery_level,
      //   legacy_score and extraction_count push their fresh values
      if (mastery?.leveledUp && mastery.level >= 5) {
        await enqueueMasteryLevelup(
          supabase,
          player.id,
          mastery.dynasty,
          mastery.level
        );
      }
      await refreshLinkedRolesForPlayer(supabase, player.id);

      // ---------------------------------------------------------------
      // The Daily Take (Constitution §7.2, WP-1.04)
      // ---------------------------------------------------------------
      // A PREVIEW, and only a preview. `describeDailyTakeSlot` has no write in
      // it: it reads the player's Take chain and reports what one tap would
      // pay. The Take is collected by `POST /api/daily-take/collect` — §7.2
      // attaches it to a tap, never to a run ending, so settlement must not be
      // able to grant it as a side effect of finishing a run.
      //
      // NOTHING ABOVE THIS LINE CAN SEE IT. `finalDna`, `yieldDna`,
      // `validation.adjustedScore` and every write they fed — the session row,
      // the DNA credit, `total_dna_earned`, the records refresh, mastery, the
      // Signal settlement — are all computed and committed before this call is
      // made, and the value it returns is used in exactly one place: the
      // response field below. The Take's tier multiplier therefore cannot
      // reach the fold; WP-0.02 deleted the account multiplier stack so that
      // no factor could, and this is deliberately not a new one.
      //
      // Null on every path that is not an armed, migrated, uncollected day —
      // flag off, migration 050 unapplied, a read failure, or a Take already
      // collected today. `parseDailyTake` renders null as "no slot", so the
      // Results layer's default is simply that the Take is not offered.
      const takeSlot = await describeDailyTakeSlot(supabase, player.id);

      // The Career Spine receipt is recognition of already-secured progress,
      // never a second settlement or claim. Its RPC stores the envelope,
      // meaningful moments and milestone attention atomically; duplicate end
      // requests and reconnect recovery read this same canonical row.
      const builtImpact = buildRunImpactEnvelope({
        sessionId,
        settledAt,
        dynasty: endDynasty,
        extracted: validation.extracted,
        died: died ?? true,
        validated: validation.valid,
        score: validation.adjustedScore,
        yieldDna,
        dnaCredited: finalDna,
        energyCommitted,
        commitmentMultiplierBps,
        generation: ascendanceGeneration,
        personalBest,
        snakeId:
          typeof (session as Record<string, unknown>).snake_used_id === 'string'
            ? ((session as Record<string, unknown>).snake_used_id as string)
            : null,
        mastery,
        recordsBefore: recordsAfter?.previousRecords ?? null,
        recordsAfter: recordsAfter?.records ?? null,
        ladder:
          ladderRecord && ladderRecord.best > ladderBefore
            ? { before: ladderBefore, after: ladderRecord.best, rung: settledRung }
            : null,
        codex,
        signal,
        clan: clanBattleResult,
      });
      const impactResult = await persistRunImpactEnvelope(
        supabase,
        player.id,
        builtImpact
      );
      if (impactResult.status !== 'persisted') {
        return progressionJson(
          {
            error: 'Run rewards are secured; its impact receipt is still pending',
            alreadyEnded: true,
            impactPending: true,
            retryable: true,
          },
          { status: 503 }
        );
      }
      const impact = impactResult.impact;

      return progressionJson({
        success: true,
        player: updatedPlayer,
        validation: {
          valid: validation.valid,
          adjustedDna: finalDna,
          baseDna: validation.adjustedDna,
          rawDna: validation.rawDna,
          genelessRawDna,
          score: validation.adjustedScore,
          extracted: validation.extracted,
          // Yield (§6.2): full-strength, charge-independent. Equals
          // adjustedDna on a charged/exempt run; on a lean run adjustedDna
          // is the fraction actually credited and this is the run's worth.
          yieldDna,
          // The snake's visible contribution to Yield (§8.2). Keeping the
          // multiplier beside its integer addition makes breeding's payoff
          // auditable without exposing settlement math to the client.
          ascendance,
          chargeState,
          energyCommitted,
          commitmentMultiplierBps,
        },
        ...(identityInfo ? { identity: identityInfo } : {}),
        ...(streak ? { streak } : {}),
        ...(mastery ? { mastery } : {}),
        // WP-3.12: the rung this run banked and the record now standing for
        // this dynasty. Present only when a rung above Ground was actually
        // recorded, so a Ground run's response is byte-identical to before.
        ...(ladderRecord ? { ladder: ladderRecord } : {}),
        ...(sessionCondition.anomaly ? { anomaly: sessionCondition.anomaly } : {}),
        ...(signal ? { signal } : {}),
        ...(clanBattleResult ? { clanBattle: clanBattleResult } : {}),
        // The Take slot (§7.2). Present only when the server has a Take to
        // offer; `parseDailyTake` refuses anything without `firstRunOfDay`.
        ...(takeSlot?.firstRunOfDay ? { dailyTake: takeSlot } : {}),
        ...(validation.genome ? { genome: validation.genome } : {}),
        ...(codex ? { codex } : {}),
        impact,
      });
    }

    // -----------------------------------------------------------------
    // WP-0.06: forfeit an open run (GT §9.6)
    // -----------------------------------------------------------------
    // POST { action: 'abandon', sessionId, reason?: 'abandoned' | 'disconnected' }
    //   -> 200 { success: true, endReason }
    //   -> 404 the session is not this player's
    //   -> 409 { alreadyEnded: true, endReason } it is already closed
    //
    // The client uses this to surrender a run it cannot finish - a quit, a
    // lost connection, a reload mid-run. It CANNOT be used to end a run for
    // value: the handler writes `ended_at` and `end_reason` on `game_sessions`
    // and has no other statement in it. No validator runs, no payout is
    // computed, `players` is not read or written, no economy transaction is
    // logged, no record is refreshed. And because it sets `ended_at`, the
    // forfeited run can never afterwards re-enter settlement (the 'end'
    // idempotency guard above rejects it), so surrendering is strictly a loss.
    //
    // `reason` is bounded to the two forfeit values. A client asking for
    // 'completed' or 'expired' - the two the server writes for itself - is
    // silently given 'abandoned'; there is no request that lets a client
    // claim its run settled.
    if (action === 'abandon') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
      }

      const forfeitReason = isClientForfeitReason(body.reason)
        ? body.reason
        : 'abandoned';

      const { data: openSession, error: openSessionError } = await supabase
        .from('game_sessions')
        .select('id, ended_at')
        .eq('id', sessionId)
        .eq('player_id', player.id)
        .maybeSingle();

      if (openSessionError) {
        console.error('Session forfeit lookup failed:', {
          playerId: player.id,
          sessionId,
          error: openSessionError,
        });
        Sentry.captureException(
          new Error(`Session forfeit lookup failed: ${openSessionError.message}`),
          { extra: { playerId: player.id, sessionId } }
        );
        return NextResponse.json({ error: 'Failed to forfeit session' }, { status: 500 });
      }

      if (!openSession) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      if (openSession.ended_at) {
        return NextResponse.json(
          { error: 'Session already ended', alreadyEnded: true },
          { status: 409 }
        );
      }

      const { data: forfeited, error: forfeitError } = await supabase
        .from('game_sessions')
        .update({
          ended_at: new Date().toISOString(),
          end_reason: forfeitReason,
        })
        .eq('id', sessionId)
        .eq('player_id', player.id)
        // Lost-race guard, identical in spirit to the settlement path: a
        // concurrent 'end' that got there first keeps its result.
        .is('ended_at', null)
        .select('id');

      if (forfeitError) {
        if (isMissingLifecycleInfra(forfeitError)) {
          // Pre-045: there is nowhere to record the reason, so there is no
          // forfeit. The run stays open and the sweep will close it once the
          // migration lands. Nothing was granted either way.
          return NextResponse.json(
            { error: 'Run forfeit is not available yet' },
            { status: 503 }
          );
        }
        console.error('Session forfeit failed:', {
          playerId: player.id,
          sessionId,
          reason: forfeitReason,
          error: forfeitError,
        });
        Sentry.captureException(
          new Error(`Session forfeit failed: ${forfeitError.message}`),
          { extra: { playerId: player.id, sessionId, reason: forfeitReason } }
        );
        return NextResponse.json({ error: 'Failed to forfeit session' }, { status: 500 });
      }

      if (!forfeited || forfeited.length === 0) {
        return NextResponse.json(
          { error: 'Session already ended', alreadyEnded: true },
          { status: 409 }
        );
      }

      return NextResponse.json({ success: true, endReason: forfeitReason });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Game session API error:', err);
    return NextResponse.json({ error: 'Server error', details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
