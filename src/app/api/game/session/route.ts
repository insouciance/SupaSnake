/**
 * Game Session API - Start/End game sessions
 *
 * Server authority: results validated and recomputed server-side; the daily
 * charge is consumed and stamped server-side (Constitution §8.6).
 *
 * Energy never gates a run. There is no start check: every run starts,
 * Scores, ranks and counts. The charge decides only the HARVEST - a charged
 * or exempt run pays full Yield, a run that finds the day's allotment empty
 * pays the lean factor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '@/shared/config/game';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { validateGameResult } from '@/lib/server/gameValidator';
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
import { getMasteryXp, grantMasteryXp } from '@/lib/server/mastery';
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
  anomalyWeekEnd,
  anomalyWeekStart,
  type AnomalyId,
} from '@/shared/game/anomalies';
import * as Sentry from '@sentry/nextjs';
import {
  consumeRunCharge,
  isMissingEnvelopeInfra,
} from '@/lib/server/energyEnvelope';
import {
  applyHarvestFactor,
  isChargeMeterVisible,
  isChargeState,
  NO_EXEMPTION,
  type ChargeExemptionFacts,
  type ChargeState,
} from '@/shared/game/energyEnvelope';
import { applyAscendanceYield } from '@/shared/game/ascendance';
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
import { verifyOfferTrace } from '@/lib/server/offerVerifier';
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
import { ensureCurrentSerpentWeek } from '@/lib/server/serpent';
import {
  claimSignalObjectiveRun,
  settleSignalAttemptForSession,
} from '@/lib/server/signal';
import {
  resolveSessionWorldCondition,
  serpentWeekCondition,
} from '@/lib/server/worldCondition';
import { describeDailyTakeSlot } from '@/lib/server/dailyTake';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      cosmic,
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

    // Constitution §7.3 The World Serpent: a Serpent attempt is a full,
    // ordinary run — any dynasty, the player's own snake, full build active —
    // whose Yield feeds the week's Depth. `mode: 'serpent'` is a REQUEST. It
    // becomes a fact only if the server can resolve the week from its own
    // calendar (below); if it cannot, the run is an ordinary charged run.
    const isSerpentRun = mode === 'serpent';

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

      // NOTE: there is deliberately NO energy check here. Constitution §8.6:
      // "Energy never gates playing. Every run always starts, always Scores,
      // always ranks, always counts." A run with no charge left is not a
      // second-class run - it is a full run with a lean harvest. Re-adding a
      // start gate here is a constitutional violation, not a tuning change.

      if (!snake_id) {
        return NextResponse.json({ error: 'snake_id is required' }, { status: 400 });
      }

      // Load the snake with its variant + dynasty; validate ownership.
      // select('*') on the row itself so the traits column (migration 018)
      // rides along when it exists without erroring pre-018.
      // snake_variants(*) so genome lineage columns (migration 030) ride
      // along when they exist without erroring pre-030.
      const { data: snake } = await supabase
        .from('collected_snakes')
        .select('*, snake_variants(*, dynasties(name))')
        .eq('id', snake_id)
        .eq('player_id', player.id)
        .single();

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
      const startDynasty = normalizeDynastyName(dynastyName);
      const masteryXp = await getMasteryXp(supabase, player.id, startDynasty);
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
      if (GAME_CONFIG.features.genome) {
        genomeSeed = randomUUID();
        const { bankedRuns, prevRunDied, ownedVariants } = await getGenomeRunFacts(
          supabase,
          player.id
        );
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
      }

      const serverStartedAt = new Date().toISOString();

      // Anomaly stamp (section 7.2): the week's modifier, derived from the
      // deterministic rotation - the client never asserts it
      const startedAtDate = new Date(serverStartedAt);
      const startAnomalyId = isAnomalyRun ? anomalyForWeek(startedAtDate) : null;
      const startAnomalyWeek = isAnomalyRun
        ? anomalyWeekStart(startedAtDate).toISOString().slice(0, 10)
        : null;

      // ---------------------------------------------------------------
      // The World Serpent (Constitution §7.3, §8.6)
      // ---------------------------------------------------------------
      // The week, its seed and its modifier set are DERIVED FROM THE UTC
      // CALENDAR by `ensureCurrentSerpentWeek` — the request contributes
      // nothing (Rule 11). Three things have to be true for a run to become a
      // Serpent attempt: the client asked, the flag is on, and the server
      // resolved a week row. Miss any one and this stays null, which means an
      // ordinary charged run — exactly the closed-by-default posture WP-0.01
      // built the exemption hook around.
      const serpentWeek = isSerpentRun
        ? await ensureCurrentSerpentWeek(supabase, startedAtDate)
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
        // Serpent run flagging (migration 046) - only sent when the server
        // resolved a week, so the insert stays compatible with the pre-046
        // schema for every other run in the game.
        ...(serpentWeek ? { serpent_week_id: serpentWeek.id } : {}),
      };
      // Genome seed (migration 029): stamped only when the capability is
      // on. Pre-029 window: the insert fails on the unknown column, so
      // retry WITHOUT the seed and start the run as legacy - the engine
      // only goes genome when the response carries the block.
      let { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .insert(
          genomeSeed ? { ...sessionInsert, run_seed: genomeSeed } : sessionInsert
        )
        .select()
        .single();
      if (
        sessionError &&
        genomeSeed &&
        /run_seed/i.test(sessionError.message || '')
      ) {
        genomeSeed = null;
        genomeBlock = null;
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
        // Pre-migration-046 window: the serpent column doesn't exist yet.
        // Only a Serpent attempt can reach this - every other run omits the
        // marker - so ordinary play is unaffected.
        if (serpentWeek && /serpent_week_id/i.test(sessionError.message || '')) {
          return NextResponse.json(
            { error: 'The World Serpent has not surfaced yet — try a ranked run' },
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
              effect: ANOMALIES[startAnomalyId].effect,
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
      // One modifier owns the run, whichever ritual named it: the Anomaly
      // board's weekly rotation, the Serpent week's condition-set, or the
      // Signal day's condition. All three are SERVER-DERIVED from the calendar
      // above, and all three are stamped on the session row, so settlement
      // re-derives this exact id from the row alone
      // (`resolveSessionWorldCondition`) and recomputes the run under the rules
      // it was actually played under. The client asserts nothing.
      //
      // Resolved AFTER the Signal claim because the Signal half is gated on
      // `exemptRunId`: `begin_signal_objective_run` mirrors
      // `signal_objective_run_id` onto the session row ONLY when this session
      // owns the day's attempt, so any looser test here would set a condition
      // at start that the end path could not find.
      const runCondition: AnomalyId | null =
        startAnomalyId ??
        serpentWeekCondition(serpentWeek) ??
        (signalClaim?.exemptRunId ? signalClaim.day?.condition.id ?? null : null);

      // Genome strain week (§9): the condition tilts gene offers by
      // ANOMALY_STRAIN_WEIGHT. The engine draws under this weight and
      // `verifyOfferTrace` replays the stream under the same one at
      // settlement, so the two cannot disagree.
      if (genomeBlock && runCondition) {
        genomeBlock.anomalyStrain = ANOMALY_STRAINS[runCondition] ?? null;
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
      // (§7.2, WP-1.03) and Serpent attempts (§7.3, §8.6 "the rituals are
      // always full-fat") are exempt.
      //
      // WP-1.01 fills in the Serpent half: `serpentWeek` is the week row the
      // SERVER resolved from its own calendar a few lines above, so the id
      // below is a fact the server can point at - never a claim the client
      // made. A client sending `mode: 'serpent'` with the flag off, or before
      // migration 046, resolves no week and gets an ordinary charged run.
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
        serpentWeekId: serpentWeek?.id ?? null,
      };
      const charge = await consumeRunCharge(
        supabase,
        player.id,
        exemptionFacts
      );

      // Stamp how this run settles onto the session row. Separate,
      // best-effort write in the established pattern of run_events/genome
      // below: pre-migration-039 the column is missing and this fails
      // non-fatally, leaving charge_state NULL - which settles the run at
      // FULL strength. Every failure mode here favours the player.
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

      // No economy_transactions row: a charge is NOT a currency (§8.6, and
      // §12.2's cap of one currency). The session row's charge_state is the
      // audit record of what the envelope did.

      // `visible` carries the §8.6 ramp so the HUD hides the meter for a
      // player who has not met the game yet - the same rule /api/player
      // applies, so the two never disagree mid-session.
      const chargeBlock = {
        state: charge.state,
        ...charge.status,
        visible: isChargeMeterVisible(player.total_games_played ?? 0),
      };

      if (isFreePlay) {
        return NextResponse.json({
          sessionId: session.id,
          freePlay: true,
          charge: chargeBlock,
          traits: snakeTraits,
          mutationPool,
          mastery: masteryInfo,
          ...(genomeBlock ? { genome: genomeBlock } : {}),
        });
      }

      return NextResponse.json({
        sessionId: session.id,
        charge: chargeBlock,
        traits: snakeTraits,
        mutationPool,
        mastery: masteryInfo,
        ...(gauntletBan ? { gauntletBan } : {}),
        // The run's world condition (§7.2, §7.3): the ONE id the engine plays
        // under and settlement recomputes with. Present on every run the
        // server resolved one for, whichever ritual named it, so the client
        // never has to infer a condition from three differently-shaped blocks
        // - or, worse, from its own `mode`.
        ...(runCondition ? { condition: runCondition } : {}),
        ...(anomalyInfo ? { anomaly: anomalyInfo } : {}),
        // Serpent context for the HUD (§7.3): the week's conditions and when
        // it submerges. Present only on a run the server accepted as an
        // attempt - its presence IS the confirmation that the exemption was
        // granted, so the client never has to infer it.
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
        ...(serpentWeek
          ? {
              serpent: {
                weekId: serpentWeek.id,
                weekStart: serpentWeek.weekStart,
                endsAt: serpentWeek.endsAt,
                seed: serpentWeek.seed,
                modifiers: serpentWeek.modifiers,
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
      const { data: session } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('player_id', player.id)
        .single();

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
        const { data: currentPlayer } = await supabase
          .from('players')
          .select('dna, total_games_played, high_score, total_dna_earned, breeds_completed')
          .eq('id', player.id)
          .single();

        const priorReason = (session as Record<string, unknown>).end_reason;
        return NextResponse.json(
          {
            error: 'Session already ended',
            alreadyEnded: true,
            ...(typeof priorReason === 'string' ? { endReason: priorReason } : {}),
            player: currentPlayer ?? null,
          },
          { status: 409 }
        );
      }

      // Design v2 Phase 3A: traits are read from the SNAKE ROW referenced
      // by the session (snake_used_id, server-trusted, stored at start) -
      // the client payload never carries them. select('*') keeps the read
      // deployable before migration 018 (rows simply lack the column).
      let snakeTraits: TraitId[] = [];
      let usedSnakeRow: Record<string, unknown> | null = null;
      if (session.snake_used_id) {
        // snake_variants(*) so genome lineage columns (migration 030)
        // ride along when they exist without erroring pre-030.
        const { data: usedSnake } = await supabase
          .from('collected_snakes')
          .select('*, snake_variants(*)')
          .eq('id', session.snake_used_id)
          .single();
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
      const endDynasty = normalizeDynastyName(session.dynasty);
      const masteryXpBefore = isFreeSession
        ? 0
        : await getMasteryXp(supabase, player.id, endDynasty);

      // Gauntlet ban mirror (section 8.2 item 3): the validator must see
      // the SAME pool the run was offered - recomputed at the session's
      // server start time, so a run straddling the Wed->Thu boundary
      // validates against what it actually saw. Free sessions are never
      // banned; pre-020 the lookup returns null (no-op).
      const endGauntletBan = isFreeSession
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
      const endSeasonalGeneIds = await getSeasonalGeneIds(supabase);
      const unlockedPool = applyGauntletBan(
        [
          ...(isFreeSession
            ? fullMutationPool(endDynasty)
            : unlockedMutationPool(endDynasty, levelForXp(masteryXpBefore))),
          ...endSeasonalIds,
        ],
        endGauntletBan
      );

      // The run's world condition (§7.2, §7.3 - WP-2.10a): the SESSION ROW is
      // authoritative - the server stamped it at start, through whichever of
      // the three columns the ritual owns (`anomaly_id`, `serpent_week_id`,
      // `signal_objective_run_id`). Re-derived here from those stamps alone,
      // so the run settles under EXACTLY the condition it was launched under
      // and a replayed 'end' cannot re-decide it.
      //
      // select('*') keeps the read deployable pre-021/046/049: rows simply
      // lack the columns => null => the condition-free recompute.
      const sessionCondition: AnomalyId | null =
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
      let endLineageBias: ReturnType<typeof deriveHeirloom>['lineageBias'] = null;
      if (typeof sessionRunSeed === 'string' && sessionRunSeed.length > 0) {
        const { bankedRuns, prevRunDied, ownedVariants } = await getGenomeRunFacts(
          supabase,
          player.id
        );
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
          crownAllowed: isFreeSession || endMasteryLevel >= 10,
          tierCap: ftueTierCap(endFtue),
          suppressedStrains: gauntletSuppressedStrains(endGauntletBan),
          splicesUnlocked: endFtue.splicesUnlocked,
        };
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
          // Design v2 Phase 2: mutation picks + Phoenix trigger + the
          // COSMIC combo summary - all sanitized inside the validator
          mutations,
          phoenix_triggered_at_food,
          cosmic,
          // Genome claim block (infuses/surges/revive/claims/lossEvents)
          genome,
        },
        serverStartedAt,
        endDynasty,
        snakeTraits,
        unlockedPool,
        sessionCondition,
        genomeCtx
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
            anomalyStrain: sessionCondition
              ? ANOMALY_STRAINS[sessionCondition] ?? null
              : null,
            tierCap: genomeCtx.tierCap,
          });
          if (!offerCheck.ok) {
            validation.errors.push(
              `OFFER_SEED_MISMATCH: ${offerCheck.mismatches.slice(0, 3).join('; ')}`
            );
            validation.valid = false;
          }
        }
      }

      if (!validation.valid) {
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
      const ascendanceGeneration =
        typeof usedSnakeRow?.generation === 'number'
          ? usedSnakeRow.generation
          : 1;
      const yieldDna = applyAscendanceYield(
        validation.adjustedDna,
        ascendanceGeneration
      );
      const finalDna = applyHarvestFactor(yieldDna, chargeState);
      // Genome Card cascade anchor: the same run with traits/anomaly but no
      // in-run genes. This is display data from server authority, never an
      // input to rewards.
      const genelessRawDna = computeRunTotals(
        endDynasty,
        validation.foodCount,
        [],
        null,
        snakeTraits,
        sessionCondition
      ).rawDna;

      // Sanitized mutation record for the session row (migration 014).
      // One JSONB blob: picks in order + Phoenix trigger + accepted COSMIC
      // combo claim; null for mutation-free non-COSMIC runs.
      const mutationsRecord =
        validation.mutations.length > 0 ||
        validation.phoenixTriggeredAtFood !== null ||
        validation.cosmic !== null
          ? {
              picks: validation.mutations,
              phoenixTriggeredAtFood: validation.phoenixTriggeredAtFood,
              cosmic: validation.cosmic,
            }
          : null;

      // Mark the session ended BEFORE granting rewards - this is the
      // idempotency anchor. Guard on ended_at IS NULL so two concurrent
      // 'end' calls can't both pass the check above and double-grant.
      const settlementUpdate: Record<string, unknown> = {
        score: validation.adjustedScore,
        // Free sessions never earn - the row records a zero payout
        dna_earned: isFreeSession ? 0 : finalDna,
        duration_seconds: duration_seconds || 0,
        died: died ?? true,
        victory: victory ?? false,
        extracted: validation.extracted,
        ended_at: new Date().toISOString(),
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
        return NextResponse.json(
          { error: 'Session already ended', alreadyEnded: true },
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
        durationSeconds: duration_seconds || 0,
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

      // Yield (§6.2), recorded separately from what the run paid, and always
      // at full strength. On a lean run dna_earned above is the fraction
      // while this stays whole - which is what lets Depth (WP-1.01) and the
      // records read the run's real worth without ever seeing the charge
      // state. Best-effort in the migration-029 pattern: pre-039 the column
      // is missing and this fails non-fatally, never touching the payout.
      const { error: yieldCaptureError } = await supabase
        .from('game_sessions')
        .update({ yield_dna: yieldDna })
        .eq('id', sessionId)
        .eq('player_id', player.id);
      if (yieldCaptureError && !isMissingEnvelopeInfra(yieldCaptureError)) {
        console.error('Failed to record run yield:', {
          playerId: player.id,
          sessionId,
          yieldDna,
          error: yieldCaptureError,
        });
        Sentry.captureException(
          new Error(`yield_dna capture failed: ${yieldCaptureError.message}`),
          { extra: { playerId: player.id, sessionId } }
        );
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
        const { data: freePlayerState } = await supabase
          .from('players')
          .select('dna, total_games_played, high_score, total_dna_earned, breeds_completed')
          .eq('id', player.id)
          .single();

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
            chargeState,
          },
          hypotheticalDna: finalDna,
          ...(identityInfo ? { identity: identityInfo } : {}),
          // Free Play still gets an authoritative recap card. Discoveries
          // and rewards remain disabled; this is validator output only.
          ...(validation.genome ? { genome: validation.genome } : {}),
        });
      }

      const newDna = player.dna + finalDna;
      const { data: currentPlayer } = await supabase
        .from('players')
        .select('total_games_played, high_score, total_dna_earned')
        .eq('id', player.id)
        .single();

      // FINDING F-1 (WP-0.06): this write had no `validation.valid` gate, so a
      // run that FAILED server validation still set a permanent personal
      // record. WP-0.05 made the leaderboard immune by filtering at read time,
      // but `players.high_score` is read by other surfaces and stayed poisoned
      // for good.
      //
      // The fix stops an invalid run writing UP. It never writes DOWN: the
      // rejected branch re-writes the value that is already there, so an
      // existing record - however it was set - is preserved exactly (Rule 6:
      // what a player has is permanent, and this route is not the place to
      // decide a past record was undeserved).
      const priorHighScore = currentPlayer?.high_score || 0;
      const newHighScore = validation.valid
        ? Math.max(priorHighScore, validation.adjustedScore)
        : priorHighScore;
      const gamesPlayedCount = (currentPlayer?.total_games_played || 0) + 1;
      const newTotalDnaEarned = (currentPlayer?.total_dna_earned || 0) + finalDna;

      const { error: rewardUpdateError } = await supabase
        .from('players')
        .update({
          dna: newDna,
          total_games_played: gamesPlayedCount,
          total_dna_earned: newTotalDnaEarned,
          high_score: newHighScore,
        })
        .eq('id', player.id);

      if (rewardUpdateError) {
        // Primary state write failed - the player would silently lose the
        // run's DNA. Re-open the session (best effort) so a client replay
        // can retry, then fail the request.
        //
        // WP-0.06: `end_reason` is deliberately LEFT at 'completed' here. The
        // pair (ended_at IS NULL, end_reason = 'completed') is the marker for
        // "this run settled, the reward write failed, an outbox replay still
        // owes the player DNA" - and it is what buys the row the long sweep
        // window instead of the 3-hour one, so expiry cannot destroy a payout
        // the player earned (Rule 6).
        console.error('Failed to grant game rewards:', {
          playerId: player.id,
          sessionId,
          dna: finalDna,
          error: rewardUpdateError,
        });
        const { error: reopenError } = await supabase
          .from('game_sessions')
          .update({ ended_at: null })
          .eq('id', sessionId)
          .eq('player_id', player.id);
        if (reopenError) {
          console.error('Failed to re-open session after reward failure:', {
            sessionId,
            error: reopenError,
          });
        }
        return NextResponse.json({ error: 'Failed to grant rewards' }, { status: 500 });
      }

      if (finalDna > 0) {
        const { error: rewardTxError } = await supabase.from('economy_transactions').insert({
          player_id: player.id,
          resource_type: 'dna',
          amount: finalDna,
          balance_after: newDna,
          source_type: 'game_reward',
          source_id: sessionId,
          metadata: {
            score: validation.adjustedScore,
            food_count: validation.foodCount,
            extracted: validation.extracted,
            original_dna_claimed: dna_earned || 0,
            validated: validation.valid,
            base_dna: validation.adjustedDna,
            ...(validation.mutations.length > 0
              ? { mutations: validation.mutations }
              : {}),
            ...(validation.phoenixTriggeredAtFood !== null
              ? { phoenix_triggered_at_food: validation.phoenixTriggeredAtFood }
              : {}),
            ...(validation.cosmic ? { cosmic: validation.cosmic } : {}),
            ...(sessionCondition ? { anomaly: sessionCondition } : {}),
          },
        });

        if (rewardTxError) {
          // Audit log only - rewards were already granted above
          console.error('Failed to log game_reward DNA transaction:', {
            playerId: player.id,
            sessionId,
            dna: finalDna,
            error: rewardTxError,
          });
        }
      }

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

      const { data: updatedPlayer } = await supabase
        .from('players')
        .select('dna, total_games_played, high_score, total_dna_earned, breeds_completed')
        .eq('id', player.id)
        .single();

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
        xp: number;
        level: number;
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
              xp: granted.xpAfter,
              level: levelAfter,
              leveledUp: levelAfter > levelBefore,
              unlocks,
            };
          }
        }
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
      await refreshPlayerRecords(supabase, player.id);

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

      return NextResponse.json({
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
          chargeState,
        },
        ...(identityInfo ? { identity: identityInfo } : {}),
        ...(streak ? { streak } : {}),
        ...(mastery ? { mastery } : {}),
        ...(sessionCondition ? { anomaly: sessionCondition } : {}),
        ...(signal ? { signal } : {}),
        // The Take slot (§7.2). Present only when the server has a Take to
        // offer; `parseDailyTake` refuses anything without `firstRunOfDay`.
        ...(takeSlot?.firstRunOfDay ? { dailyTake: takeSlot } : {}),
        ...(validation.genome ? { genome: validation.genome } : {}),
        ...(codex ? { codex } : {}),
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
