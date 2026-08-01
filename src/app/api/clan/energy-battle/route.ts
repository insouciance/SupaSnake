import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { energyBattleCycleAt } from '@/shared/game/clanEnergyBattle';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function missingBattleSchema(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (['42P01', '42703', 'PGRST200', 'PGRST202', 'PGRST205'].includes(error.code || '') ||
        /schema cache.*clan_(?:energy|glory)_|relation .*clan_(?:energy|glory)_.* does not exist/i.test(
          error.message || ''
        ))
  );
}

function embeddedClan(value: unknown): { id?: string; name?: string; tag?: string } | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === 'object'
    ? (candidate as { id?: string; name?: string; tag?: string })
    : null;
}

async function rewardHistory(playerId: string) {
  const { data: battleRows, error: battleError } = await supabase
    .from('clan_energy_battle_reward_ledger')
    .select('id, battle_id, clan_id, cycle_index, reward_kind, outcome, participation_amount, bonus_amount, amount, counted_depth, eligible_run_count, counted_run_count, awarded_at, clans:clan_id(id, name, tag)')
    .eq('player_id', playerId)
    .order('awarded_at', { ascending: false })
    .limit(12);
  if (battleError && !missingBattleSchema(battleError)) {
    return { error: battleError };
  }

  const { data: gloryRows, error: gloryError } = await supabase
    .from('clan_glory_reward_ledger')
    .select('id, battle_id, clan_id, cycle_index, seat, amount, eligible_depth, eligible_contribution_count, awarded_at, clans:clan_id(id, name, tag)')
    .eq('player_id', playerId)
    .order('awarded_at', { ascending: false })
    .limit(12);
  if (gloryError && !missingBattleSchema(gloryError)) {
    return { error: gloryError };
  }

  const battleRewards = ((battleRows ?? []) as Array<Record<string, unknown>>)
    .filter((row) => Number(row.amount) > 0)
    .map((row) => ({
      id: String(row.id),
      artifactRef: `battle-reward:${String(row.id)}`,
      type: 'battle' as const,
      battleId: String(row.battle_id),
      clanId: String(row.clan_id),
      clan: embeddedClan(row.clans),
      cycleIndex: Number(row.cycle_index),
      rewardKind: String(row.reward_kind),
      outcome: String(row.outcome),
      participationDna: Number(row.participation_amount),
      bonusDna: Number(row.bonus_amount),
      amount: Number(row.amount),
      countedDepth: Number(row.counted_depth),
      eligibleRunCount: Number(row.eligible_run_count),
      countedRunCount: Number(row.counted_run_count),
      awardedAt: String(row.awarded_at),
    }));
  const gloryRewards = ((gloryRows ?? []) as Array<Record<string, unknown>>)
    .filter((row) => Number(row.amount) > 0)
    .map((row) => ({
      id: String(row.id),
      artifactRef: `glory-reward:${String(row.id)}`,
      type: 'glory' as const,
      battleId: String(row.battle_id),
      clanId: String(row.clan_id),
      clan: embeddedClan(row.clans),
      cycleIndex: Number(row.cycle_index),
      seat: Number(row.seat),
      amount: Number(row.amount),
      countedDepth: Number(row.eligible_depth),
      countedRunCount: Number(row.eligible_contribution_count),
      awardedAt: String(row.awarded_at),
    }));
  return {
    history: [...battleRewards, ...gloryRewards]
      .sort((a, b) => Date.parse(b.awardedAt) - Date.parse(a.awardedAt))
      .slice(0, 12),
  };
}

function reportBattleRead(
  scope: string,
  error: { code?: string; message?: string },
  extra: Record<string, unknown> = {}
) {
  console.error(`Clan Energy Battle ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    new Error(`Clan Energy Battle ${scope} failed: ${error.message ?? error.code ?? 'unknown'}`),
    { extra: { scope, ...extra, code: error.code } }
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = authHeader.replace('Bearer ', '');
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();
  if (playerError) {
    reportBattleRead('player lookup', playerError, { userId: auth.user.id });
    return NextResponse.json({ error: 'Could not read player' }, { status: 503 });
  }
  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const rewards = await rewardHistory(player.id as string);
  if ('error' in rewards && rewards.error) {
    reportBattleRead('reward history lookup', rewards.error, { playerId: player.id });
    return NextResponse.json({ error: 'Could not read battle rewards' }, { status: 503 });
  }
  const rewardRows = 'history' in rewards ? rewards.history : [];

  const { data: membership, error: membershipError } = await supabase
    .from('clan_members')
    .select('clan_id, clans(id, name, tag)')
    .eq('player_id', auth.user.id)
    .maybeSingle();
  if (membershipError) {
    reportBattleRead('membership lookup', membershipError, { playerId: player.id });
    return NextResponse.json({ error: 'Could not read clan membership' }, { status: 503 });
  }

  const cycle = energyBattleCycleAt();
  if (!membership) {
    return NextResponse.json({
      active: false,
      reason: 'no_clan',
      cycle,
      rewardHistory: rewardRows,
    });
  }

  const clan = Array.isArray(membership.clans)
    ? membership.clans[0]
    : membership.clans;
  const { data: cycleLock, error: lockError } = await supabase
    .from('clan_energy_cycle_memberships')
    .select('clan_id')
    .eq('cycle_index', cycle.index)
    .eq('player_id', player.id)
    .maybeSingle();
  if (lockError && !missingBattleSchema(lockError)) {
    reportBattleRead('cycle membership lookup', lockError, {
      playerId: player.id,
      cycleIndex: cycle.index,
    });
    return NextResponse.json({ error: 'Could not read battle eligibility' }, { status: 503 });
  }
  if (missingBattleSchema(lockError)) {
    return NextResponse.json({ active: false, live: false, reason: 'not_deployed' });
  }

  const switchedClan = cycleLock && cycleLock.clan_id !== membership.clan_id;
  const battleClanId = cycleLock?.clan_id ?? membership.clan_id;
  const { data: side, error: sideError } = await supabase
    .from('clan_energy_battle_sides')
    .select('id, battle_id, score, outcome, clans(id, name, tag), clan_energy_battles(starts_at, ends_at, intermission_ends_at, settled_at)')
    .eq('cycle_index', cycle.index)
    .eq('clan_id', battleClanId)
    .maybeSingle();
  if (sideError) {
    if (missingBattleSchema(sideError)) {
      return NextResponse.json({ active: false, live: false, reason: 'not_deployed' });
    }
    reportBattleRead('side lookup', sideError, {
      playerId: player.id,
      clanId: battleClanId,
      cycleIndex: cycle.index,
    });
    return NextResponse.json({ error: 'Could not read clan battle' }, { status: 503 });
  }

  let topFive: Array<Record<string, unknown>> = [];
  let opponent: Record<string, unknown> | null = null;
  if (side) {
    const { data: contributions, error: contributionError } = await supabase
      .from('clan_energy_contributions')
      .select('session_id, score, energy_committed, commitment_multiplier_bps, snake_generation, contribution_rank, completed_at')
      .eq('battle_id', side.battle_id)
      .eq('player_id', player.id)
      .eq('counted', true)
      .order('contribution_rank');
    if (contributionError) {
      reportBattleRead('contribution lookup', contributionError, {
        playerId: player.id,
        battleId: side.battle_id,
      });
      return NextResponse.json({ error: 'Could not read your battle results' }, { status: 503 });
    }
    topFive = (contributions ?? []).map((result) => ({
      sessionId: result.session_id,
      score: Number(result.score),
      energyCommitted: result.energy_committed,
      commitmentMultiplierBps: result.commitment_multiplier_bps,
      generation: result.snake_generation,
      rank: result.contribution_rank,
      completedAt: result.completed_at,
    }));

    const { data: opponentSide, error: opponentError } = await supabase
      .from('clan_energy_battle_sides')
      .select('score, outcome, clans(id, name, tag)')
      .eq('battle_id', side.battle_id)
      .neq('id', side.id)
      .maybeSingle();
    if (opponentError) {
      reportBattleRead('opponent lookup', opponentError, {
        playerId: player.id,
        battleId: side.battle_id,
      });
      return NextResponse.json({ error: 'Could not read opponent' }, { status: 503 });
    }
    if (opponentSide) {
      const opponentClan = Array.isArray(opponentSide.clans)
        ? opponentSide.clans[0]
        : opponentSide.clans;
      opponent = {
        clan: opponentClan,
        score: Number(opponentSide.score),
        outcome: opponentSide.outcome,
      };
    }
  }

  const { data: honorRows, error: honorError } = await supabase
    .from('clan_energy_honors')
    .select('honor')
    .eq('player_id', player.id);
  if (honorError && !missingBattleSchema(honorError)) {
    reportBattleRead('honor lookup', honorError, { playerId: player.id });
    return NextResponse.json({ error: 'Could not read battle honors' }, { status: 503 });
  }
  const honors = (honorRows ?? []).reduce(
    (summary, row) => {
      summary.total += 1;
      if (row.honor === 'victor') summary.victories += 1;
      else if (row.honor === 'stalemate') summary.stalemates += 1;
      else summary.participations += 1;
      return summary;
    },
    { total: 0, victories: 0, stalemates: 0, participations: 0 }
  );

  const fifthBest = topFive.length >= 5 ? Number(topFive[4]?.score ?? 0) : 0;
  const battleRow = side
    ? Array.isArray(side.clan_energy_battles)
      ? side.clan_energy_battles[0]
      : side.clan_energy_battles
    : null;
  const sideClan = side
    ? Array.isArray(side.clans)
      ? side.clans[0]
      : side.clans
    : null;

  return NextResponse.json({
    live: true,
    active: cycle.phase === 'active',
    eligible: cycle.phase === 'active' && !switchedClan,
    reason: switchedClan ? 'cycle_locked_to_previous_clan' : null,
    cycle,
    battle: side
      ? {
          id: side.battle_id,
          startsAt: battleRow?.starts_at ?? cycle.startsAt,
          endsAt: battleRow?.ends_at ?? cycle.endsAt,
          intermissionEndsAt:
            battleRow?.intermission_ends_at ?? cycle.intermissionEndsAt,
          settledAt: battleRow?.settled_at ?? null,
        }
      : null,
    clan: sideClan ?? clan,
    team: {
      score: Number(side?.score ?? 0),
      outcome: side?.outcome ?? 'pending',
    },
    honors,
    rewardHistory: rewardRows,
    opponent,
    you: {
      topFive,
      fifthBest,
      scoreToImprove: fifthBest > 0 ? fifthBest + 1 : 0,
      contribution: topFive.reduce((sum, result) => sum + Number(result.score ?? 0), 0),
    },
  });
}
